#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { devNull } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_TEXT_SIZE = 100_000;
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tar',
  '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4', '.mov', '.avi', '.db', '.sqlite',
]);

function git(repo, args, allowed = [0]) {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowed.includes(result.status)) {
    throw new Error(`Git 执行失败（${result.status}）：git ${args.join(' ')}\n${result.stderr}`);
  }
  return result;
}

async function repoRoot(repo) {
  return realpath(git(repo, ['rev-parse', '--show-toplevel']).stdout.trim());
}

async function featureRoot(repo, argument) {
  const root = await repoRoot(repo);
  const requested = path.resolve(repo, argument);
  let feature;
  try {
    feature = await realpath(requested);
  } catch {
    const parent = await realpath(path.dirname(requested));
    feature = path.join(parent, path.basename(requested));
  }
  const relative = path.relative(root, feature);
  if (!relative || relative.split(path.sep)[0] !== '.scratch') {
    throw new Error('特性目录必须位于当前仓库的 .scratch 内');
  }
  return { root, feature };
}

function normalizeScopes(scopes) {
  const normalized = scopes.filter((scope) => scope !== '--').map((scope) => {
    if (!scope || path.isAbsolute(scope) || scope.includes('\0')) {
      throw new Error(`非法审查路径：${scope}`);
    }
    const value = path.posix.normalize(scope.replaceAll(path.sep, '/').replace(/^\.\//, '').replace(/\/$/, ''));
    if (!value || value === '.' || value.startsWith('../') || value === '..') {
      throw new Error(`审查路径越界：${scope}`);
    }
    return value;
  });
  if (!normalized.length) throw new Error('必须提供至少一个审查路径白名单');
  return [...new Set(normalized)].sort();
}

function listFiles(repo, scopes) {
  const output = git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...scopes]).stdout;
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort();
}

async function fileExists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function skippedReason(repo, relative) {
  const basename = path.posix.basename(relative);
  if (basename === '.env' || (basename.startsWith('.env.') && !/\.(example|sample|template)$/i.test(basename))) {
    return '敏感配置';
  }
  if (/\.(pem|key|p12|keystore|jks)$/i.test(basename) || /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.|$)/i.test(basename)) {
    return '密钥文件';
  }
  if (BINARY_EXTENSIONS.has(path.posix.extname(basename).toLowerCase())) return '二进制文件';
  const info = await stat(path.join(repo, relative));
  if (info.size > MAX_TEXT_SIZE) return '超过 100KB 的文本';
  const content = await readFile(path.join(repo, relative));
  return content.includes(0) ? '二进制文件' : null;
}

async function initReviewBase(repo, argument, scopesInput) {
  const { root, feature } = await featureRoot(repo, argument);
  const scopePath = path.join(feature, 'scope.json');
  if (await fileExists(scopePath)) throw new Error('SCOPE_EXISTS：已有开工基线，禁止重置');
  const scopes = normalizeScopes(scopesInput);
  const base = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  const status = git(root, ['status', '--short']).stdout;
  const snapshotRoot = path.join(feature, 'prechange', 'files');
  const skipped = [];

  for (const relative of listFiles(root, scopes)) {
    const reason = await skippedReason(root, relative);
    if (reason) {
      skipped.push({ path: relative, reason });
      continue;
    }
    const destination = path.join(snapshotRoot, relative);
    if (path.relative(snapshotRoot, destination).startsWith('..')) throw new Error('快照路径越界');
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, relative), destination);
  }

  await mkdir(path.dirname(scopePath), { recursive: true });
  await writeFile(scopePath, `${JSON.stringify({ version: 1, base, scopes, skipped }, null, 2)}\n`);
  await writeFile(path.join(feature, 'prechange', 'status.txt'), status);
  console.log(`已记录开工前基线 ${base}，快照范围 ${scopes.length} 项，跳过 ${skipped.length} 项。`);
}

async function snapshotFiles(snapshotRoot) {
  if (!(await fileExists(snapshotRoot)) && !(await stat(snapshotRoot).catch(() => null))) return [];
  const entries = await readdir(snapshotRoot, { recursive: true });
  const files = [];
  for (const entry of entries) {
    if (await fileExists(path.join(snapshotRoot, entry))) files.push(entry.split(path.sep).join('/'));
  }
  return files.sort();
}

function diffNoIndex(repo, left, right) {
  return git(repo, ['diff', '--no-index', '--', left, right], [0, 1]).stdout;
}

async function collectReviewPackage(repo, argument, scopesInput) {
  const { root, feature } = await featureRoot(repo, argument);
  const scope = JSON.parse(await readFile(path.join(feature, 'scope.json'), 'utf8'));
  const expectedScopes = normalizeScopes(scope.scopes);
  if (scopesInput.length && normalizeScopes(scopesInput).join('\n') !== expectedScopes.join('\n')) {
    throw new Error('SCOPE_MISMATCH：审查范围不得在执行中静默扩大');
  }

  git(root, ['cat-file', '-e', `${scope.base}^{commit}`]);
  if (git(root, ['merge-base', 'HEAD', scope.base]).stdout.trim() !== scope.base) {
    throw new Error('BASE_NOT_ANCESTOR：review-base 已不是当前 HEAD 的祖先');
  }

  const snapshotRoot = path.join(feature, 'prechange', 'files');
  const beforeFiles = await snapshotFiles(snapshotRoot);
  const currentFiles = listFiles(root, expectedScopes);
  const allFiles = [...new Set([...beforeFiles, ...currentFiles])].sort();
  const changedFiles = [];
  const unreviewed = [...scope.skipped];
  const patches = [];

  for (const relative of allFiles) {
    const before = path.join(snapshotRoot, relative);
    const current = path.join(root, relative);
    const beforeExists = await fileExists(before);
    const currentExists = await fileExists(current);
    if (currentExists) {
      const reason = await skippedReason(root, relative);
      if (reason) {
        if (!unreviewed.some((item) => item.path === relative)) unreviewed.push({ path: relative, reason });
        continue;
      }
    }

    if (beforeExists && currentExists && (await readFile(before)).equals(await readFile(current))) continue;
    const patch = diffNoIndex(root, beforeExists ? before : devNull, currentExists ? current : devNull);
    if (patch) {
      patches.push(patch);
      changedFiles.push(relative);
    }
  }

  await writeFile(path.join(feature, 'review-package.diff'), patches.join('\n'));
  const manifest = {
    version: 1,
    base: scope.base,
    scope: expectedScopes,
    changedFiles,
    unreviewed,
    package: 'review-package.diff',
  };
  await writeFile(path.join(feature, 'review-package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`审查包已生成：${changedFiles.length} 个变更文件，${unreviewed.length} 个未审查文件。`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const [command, feature, ...scopes] = args;
  if (command === '--help' || command === 'help' || !command) {
    console.log('用法: review-package <init|collect> <feature-dir> -- <path...>');
    return;
  }
  if (!feature || !['init', 'collect'].includes(command)) {
    console.error('用法: review-package <init|collect> <feature-dir> -- <path...>');
    process.exitCode = 1;
    return;
  }

  try {
    const repo = process.cwd();
    if (command === 'init') await initReviewBase(repo, feature, scopes);
    else await collectReviewPackage(repo, feature, scopes);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
