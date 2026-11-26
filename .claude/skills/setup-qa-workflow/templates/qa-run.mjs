#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeEvidenceTreeDigest, readScope, resolveFeature } from './review-package.mjs';

const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_ARGUMENT = /^[A-Za-z0-9_./:@%+=,-]+$/;
const SUPPORTED_EXECUTORS = new Set(['ego-browser', 'node', 'sh']);

/** exit 0 不代表命令实际执行了项目或测试；只识别明确空运行摘要 */
export function emptyEvidenceReason(output) {
  const text = String(output ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  if (/^\s*No projects matched the filters(?:\s|,|$)/im.test(text)) return '没有匹配任何项目';
  if (/^\s*No test files found(?:\s|,|$)/im.test(text)) return '没有找到测试文件';
  if (/^\s*Test Files\s+0 passed\s+\(0\)/im.test(text)) return '测试文件数为 0';
  if (/^# tests 0\s*$/m.test(text)) return '测试用例数为 0';
  return null;
}

export function formatCommand(argv) {
  return argv.map((argument) => {
    if (SAFE_ARGUMENT.test(argument)) return argument;
    return `'${argument.replaceAll("'", "'\\''")}'`;
  }).join(' ');
}

export function splitShellWords(input) {
  const words = [];
  let word = '';
  let quote = null;
  let escaped = false;
  let started = false;
  for (const character of input) {
    if (escaped) {
      word += character;
      escaped = false;
      started = true;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else word += character;
      started = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      started = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (started) words.push(word);
      word = '';
      started = false;
      continue;
    }
    word += character;
    started = true;
  }
  if (escaped) throw new Error('命令末尾的反斜杠转义不完整');
  if (quote) throw new Error('命令中的单引号或双引号未闭合');
  if (started) words.push(word);
  return words;
}

export function parseRunLog(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '# qa-run v1') return null;
  const fields = {};
  let headerEnd = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === '# ---') {
      headerEnd = index;
      break;
    }
    const match = lines[index].match(/^# ([A-Za-z][A-Za-z0-9]*): (.*)$/);
    if (match) fields[match[1]] = match[2];
  }

  let argv = null;
  try {
    const parsed = JSON.parse(fields.argv ?? '');
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) argv = parsed;
  } catch {
    argv = null;
  }

  let end = lines.length;
  while (end > 0 && lines[end - 1] === '') end -= 1;
  let tailStart = -1;
  for (let index = end - 1; index > headerEnd; index -= 1) {
    if (lines[index] === '# ---') {
      tailStart = index;
      break;
    }
  }
  const tail = {};
  if (tailStart > headerEnd) {
    for (const line of lines.slice(tailStart + 1, end)) {
      const match = line.match(/^# ([A-Za-z][A-Za-z0-9]*): (.*)$/);
      if (match) tail[match[1]] = match[2];
    }
  }
  const finished = tail.finished ?? null;
  const exit = tail.exit === undefined ? null : /^\d+$/.test(tail.exit) ? Number(tail.exit) : tail.exit;
  const complete = headerEnd > 0 && argv !== null && finished !== null && exit !== null;
  const durationMs = Number(tail.durationMs);
  const repairAndWaitMs = Number(tail.repairAndWaitMs);
  return {
    label: fields.label ?? null,
    command: fields.command ?? null,
    argv,
    executor: fields.executor ?? null,
    script: fields.script ?? null,
    cwd: fields.cwd ?? null,
    head: fields.head ?? null,
    node: fields.node ?? null,
    tree: fields.tree ?? null,
    nonce: fields.nonce ?? null,
    round: fields.round ?? null,
    axis: fields.axis ?? null,
    snapshotHash: fields.snapshotHash ?? null,
    started: fields.started ?? null,
    finished,
    dispatchedAt: null,
    terminalState: tail.terminalState ?? null,
    errorClass: tail.errorClass === 'none' ? null : tail.errorClass ?? null,
    durationMs: Number.isInteger(durationMs) && durationMs >= 0 ? durationMs : null,
    repairAndWaitMs: Number.isInteger(repairAndWaitMs) && repairAndWaitMs >= 0 ? repairAndWaitMs : null,
    exit,
    complete,
    // 命令输出正文（不含头尾），供断言标记核对
    body: lines.slice(headerEnd > 0 ? headerEnd + 1 : lines.length, tailStart > headerEnd ? tailStart : end).join('\n'),
  };
}

function headAt(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`无法读取 Git HEAD：${result.stderr.trim()}`);
  return result.stdout.trim();
}

async function treeAt(root, feature) {
  try {
    const scope = await readScope(feature);
    return await computeEvidenceTreeDigest(root, scope.scopes);
  } catch (error) {
    if (error.code === 'ENOENT') return 'none';
    throw error;
  }
}

async function runEvidence(repo, featureArgument, label, argv, { executor = null, script = null, stdinContent = null } = {}) {
  const { root, feature } = await resolveFeature(repo, featureArgument);
  if (!LABEL_PATTERN.test(label)) throw new Error('标签须以字母或数字开头，且只能包含字母、数字、点、下划线与连字符');
  const evidenceRoot = path.join(feature, 'evidence');
  await mkdir(evidenceRoot, { recursive: true });
  const logPath = path.join(evidenceRoot, `${label}.log`);
  const relativeLog = path.relative(root, logPath).split(path.sep).join('/');
  const head = headAt(root);
  const tree = await treeAt(root, feature);
  const started = new Date().toISOString();
  const cwd = path.relative(root, repo).split(path.sep).join('/') || '.';
  const resolvedScript = script
    ? await realpath(path.resolve(repo, script)).catch(() => path.resolve(repo, script))
    : null;
  const relativeScript = resolvedScript
    ? path.relative(root, resolvedScript).split(path.sep).join('/')
    : null;
  const reviewContext = await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8')
    .then((text) => JSON.parse(text), () => ({}));

  let handle;
  try {
    handle = await open(logPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`证据日志已存在：${relativeLog}。失败或旧证据不得覆盖，请换一个标签（如 ${label}-2）`);
    }
    throw error;
  }

  try {
    const headerLines = [
      '# qa-run v1',
      `# label: ${label}`,
      `# command: ${formatCommand(argv)}`,
      `# argv: ${JSON.stringify(argv)}`,
    ];
    if (executor) headerLines.push(`# executor: ${executor}`);
    if (relativeScript) headerLines.push(`# script: ${relativeScript}`);
    headerLines.push(
      `# cwd: ${cwd}`,
      `# head: ${head}`,
      `# node: ${process.version}`,
      `# tree: ${tree}`,
      `# nonce: ${reviewContext.nonce ?? 'none'}`,
      `# round: ${reviewContext.round ?? 'none'}`,
      `# axis: none`,
      `# snapshotHash: ${reviewContext.snapshotHash ?? 'none'}`,
      `# started: ${started}`,
      '# ---',
      '',
    );
    await handle.writeFile(headerLines.join('\n'), 'utf8');

    const child = spawn(argv[0], argv.slice(1), {
      cwd: repo,
      env: process.env,
      shell: false,
      stdio: [stdinContent !== null ? 'pipe' : 'inherit', 'pipe', 'pipe'],
    });
    if (stdinContent !== null) {
      child.stdin.end(stdinContent, 'utf8');
    }
    let queue = Promise.resolve();
    let hasBody = false;
    let outputTail = '';
    let lastByte = null;
    let startupError = null;
    const forward = (chunk, stream) => {
      if (!chunk.length) return;
      hasBody = true;
      outputTail = (outputTail + chunk.toString('utf8')).slice(-256 * 1024);
      lastByte = chunk[chunk.length - 1];
      queue = queue.then(() => handle.write(chunk));
      stream.write(chunk);
    };
    child.stdout.on('data', (chunk) => forward(chunk, process.stdout));
    child.stderr.on('data', (chunk) => forward(chunk, process.stderr));
    child.on('error', (error) => {
      startupError = error;
      forward(Buffer.from(`启动命令失败：${error.message}\n`), process.stderr);
    });
    const [code, signal] = await new Promise((resolve) => {
      child.once('close', (exitCode, exitSignal) => resolve([exitCode, exitSignal]));
    });
    await queue;
    if (hasBody && lastByte !== 10) await handle.write('\n');
    let exitCode = startupError ? 127 : signal ? 1 : code ?? 1;
    const emptyReason = exitCode === 0 ? emptyEvidenceReason(outputTail) : null;
    if (emptyReason) {
      exitCode = 1;
      const diagnostic = `[qa-run] EMPTY_EVIDENCE：${emptyReason}，不能把 exit 0 当作有效绿证据\n`;
      await handle.writeFile(diagnostic, 'utf8');
      console.error(diagnostic.trimEnd());
    }
    const exitDescription = startupError ? '127' : emptyReason ? '1' : signal ? `signal ${signal}` : String(code ?? 1);
    const finished = new Date().toISOString();
    const terminalState = exitCode === 0 ? 'succeeded' : 'failed';
    const errorClass = exitCode === 0 ? 'none' : startupError ? 'SPAWN_ERROR' : emptyReason ? 'EMPTY_EVIDENCE' : signal ? 'SIGNAL' : 'EXIT_NONZERO';
    const durationMs = Math.max(0, Date.parse(finished) - Date.parse(started));
    const repairAndWaitMs = Number.isInteger(reviewContext.repairAndWaitMs) && reviewContext.repairAndWaitMs >= 0
      ? reviewContext.repairAndWaitMs
      : 0;
    await handle.writeFile(`# ---\n# finished: ${finished}\n# terminalState: ${terminalState}\n# errorClass: ${errorClass}\n# durationMs: ${durationMs}\n# repairAndWaitMs: ${repairAndWaitMs}\n# exit: ${exitDescription}\n`, 'utf8');
    await handle.close();
    handle = null;
    console.error(`[qa-run] 证据已写入 ${relativeLog}（exit ${exitCode}）`);
    return exitCode;
  } finally {
    if (handle) await handle.close();
  }
}

function resolveScriptArgv(scriptPath, extraArgs) {
  const ext = path.extname(scriptPath).toLowerCase();
  if (ext === '.mjs' || ext === '.js' || ext === '.cjs') return [process.execPath, scriptPath, ...extraArgs];
  if (ext === '.sh') return ['sh', scriptPath, ...extraArgs];
  if (ext === '.py') return ['python3', scriptPath, ...extraArgs];
  return [scriptPath, ...extraArgs];
}

/** 解析 --executor 与 --script 组合，生成执行参数、记录元数据与可选 stdin 内容 */
async function resolveExecutionSpec({ repo, scriptPath, executor, extraArgs }) {
  if (executor) {
    if (!SUPPORTED_EXECUTORS.has(executor)) {
      throw new Error(`用法错误：--executor 仅支持 ${[...SUPPORTED_EXECUTORS].join(' | ')}，当前为 ${executor}`);
    }
    if (!scriptPath) {
      throw new Error(`用法错误：--executor ${executor} 需要配合 --script <path> 使用`);
    }
    const scriptAbs = path.resolve(repo, scriptPath);
    if (executor === 'ego-browser') {
      const bin = process.env.QA_EGO_BROWSER_BIN || 'ego-browser';
      const stdinContent = await readFile(scriptAbs, 'utf8');
      return {
        argv: [bin, 'nodejs', ...extraArgs],
        executor,
        script: scriptAbs,
        stdinContent,
      };
    }
    if (executor === 'node') {
      return { argv: [process.execPath, scriptAbs, ...extraArgs], executor, script: scriptAbs, stdinContent: null };
    }
    return { argv: ['sh', scriptAbs, ...extraArgs], executor, script: scriptAbs, stdinContent: null };
  }
  if (scriptPath) {
    return {
      argv: resolveScriptArgv(scriptPath, extraArgs),
      executor: null,
      script: path.resolve(repo, scriptPath),
      stdinContent: null,
    };
  }
  return { argv: extraArgs, executor: null, script: null, stdinContent: null };
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) {
    console.error(`qa-run 需要 Node.js >=22，当前为 ${process.version}；目标命令尚未启动。`);
    process.exitCode = 1;
    return;
  }
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const [feature, label, ...rest] = args;
  let scriptPath = null;
  let executor = null;
  let seenDashDash = false;
  const cmdArgs = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!seenDashDash && !cmdArgs.length) {
      if (arg === '--') {
        seenDashDash = true;
        continue;
      }
      if (arg === '--executor') {
        const next = rest[i + 1];
        if (!next || next === '--') {
          console.error('用法错误：--executor 缺少执行器名称（ego-browser | node | sh）');
          process.exitCode = 1;
          return;
        }
        executor = next;
        i += 1;
        continue;
      }
      if (arg === '--script' && !scriptPath) {
        const next = rest[i + 1];
        if (!next || next === '--') {
          console.error('用法错误：--script 缺少脚本路径');
          process.exitCode = 1;
          return;
        }
        scriptPath = next;
        i += 1;
        continue;
      }
    }
    if (scriptPath && !seenDashDash && !cmdArgs.length && arg === '--') {
      seenDashDash = true;
      continue;
    }
    cmdArgs.push(arg);
  }
  if (!feature || !label || (!scriptPath && !cmdArgs.length)) {
    console.error('用法: node tooling/scripts/qa-run.mjs <feature-dir> <label> -- <command...> 或 [--executor ego-browser|node|sh] --script <path> [-- <args...>]');
    process.exitCode = 1;
    return;
  }
  let spec;
  try {
    spec = await resolveExecutionSpec({ repo: process.cwd(), scriptPath, executor, extraArgs: cmdArgs });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const finalArgv = spec.argv;
  if (!finalArgv.length) {
    console.error('用法: node tooling/scripts/qa-run.mjs <feature-dir> <label> -- <command...> 或 [--executor ego-browser|node|sh] --script <path> [-- <args...>]');
    process.exitCode = 1;
    return;
  }
  // 整串命令被当成单个参数时 spawn 必然 ENOENT；在写日志前拦下，不占用标签
  if (finalArgv.length === 1 && /\s/.test(finalArgv[0]) && !existsSync(path.resolve(finalArgv[0]))) {
    console.error(`用法错误：命令需按参数拆开传入，不要整串加引号。\n正确示例: node tooling/scripts/qa-run.mjs ${feature} ${label} -- ${finalArgv[0]}`);
    process.exitCode = 1;
    return;
  }
  try {
    process.exitCode = await runEvidence(process.cwd(), feature, label, finalArgv, {
      executor: spec.executor,
      script: spec.script,
      stdinContent: spec.stdinContent,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
