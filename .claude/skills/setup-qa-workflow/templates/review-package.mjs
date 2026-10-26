#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { devNull } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_TEXT_SIZE = 512 * 1024;
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tar',
  '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4', '.mov', '.avi', '.db', '.sqlite',
]);
const UNKNOWN_HASH = Symbol('未知哈希');

function git(repo, args, allowed = [0], encoding = 'utf8') {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding,
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

export async function resolveFeature(repo, argument) {
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

export function listFiles(repo, scopes) {
  const output = git(repo, [
    '-c',
    'core.quotepath=false',
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    ...scopes,
  ]).stdout;
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

export function inScope(relative, scopes) {
  return scopes.some((scope) => relative === scope || relative.startsWith(`${scope}/`));
}

async function pathInfo(file) {
  try {
    return await lstat(file);
  } catch {
    return null;
  }
}

async function fileExists(file) {
  return (await pathInfo(file))?.isFile() ?? false;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function hashFile(repo, relative) {
  const file = path.join(repo, relative);
  const info = await lstat(file);
  if (info.isSymbolicLink()) return sha256(`symlink:${await readlink(file)}`);
  if (!info.isFile()) return null;
  return sha256(await readFile(file));
}

async function hashFileOrNull(repo, relative) {
  try {
    return await hashFile(repo, relative);
  } catch {
    return null;
  }
}

export async function computeTreeDigest(repo, scopes) {
  const lines = [];
  for (const relative of listFiles(repo, scopes)) {
    const info = await pathInfo(path.join(repo, relative));
    if (!info || (!info.isFile() && !info.isSymbolicLink())) continue;
    lines.push(`${relative}\0${await hashFile(repo, relative)}`);
  }
  return sha256(lines.join('\n'));
}

export async function readScope(feature) {
  return JSON.parse(await readFile(path.join(feature, 'scope.json'), 'utf8'));
}

function nameSkippedReason(relative) {
  const basename = path.posix.basename(relative);
  if (basename === '.env' || (basename.startsWith('.env.') && !/\.(example|sample|template)$/i.test(basename))) {
    return '敏感配置';
  }
  if (/\.(pem|key|p12|keystore|jks)$/i.test(basename) || /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.|$)/i.test(basename)) {
    return '密钥文件';
  }
  if (BINARY_EXTENSIONS.has(path.posix.extname(basename).toLowerCase())) return '二进制文件';
  return null;
}

async function skippedReason(repo, relative) {
  const file = path.join(repo, relative);
  const info = await lstat(file);
  if (info.isSymbolicLink()) return '符号链接';
  if (!info.isFile()) return '非常规文件';
  const namedReason = nameSkippedReason(relative);
  if (namedReason) return namedReason;
  if (info.size > MAX_TEXT_SIZE) return '超过 512KB 的文本';
  const content = await readFile(file);
  return content.includes(0) ? '二进制文件' : null;
}

function baseSkippedReason(relative, content) {
  const namedReason = nameSkippedReason(relative);
  if (namedReason) return namedReason;
  if (content.length > MAX_TEXT_SIZE) return '超过 512KB 的文本';
  return content.includes(0) ? '二进制文件' : null;
}

function snapshotPath(snapshotRoot, relative) {
  const destination = path.join(snapshotRoot, relative);
  const relation = path.relative(snapshotRoot, destination);
  if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error('快照路径越界');
  }
  return destination;
}

function statusPaths(status) {
  const fields = status.split('\0');
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (!entry) continue;
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) {
      index += 1;
      if (fields[index]) paths.push(fields[index]);
    }
  }
  return paths;
}

function isScratch(relative) {
  return relative === '.scratch' || relative.startsWith('.scratch/');
}

async function createDirtyAtInit(root, scopes, status) {
  const inScopePaths = [];
  const outOfScope = {};
  const paths = [...new Set(statusPaths(status).filter((relative) => !isScratch(relative)))].sort();
  for (const relative of paths) {
    if (inScope(relative, scopes)) inScopePaths.push(relative);
    else outOfScope[relative] = await hashFileOrNull(root, relative);
  }
  return { inScope: inScopePaths, outOfScope };
}

async function initReviewBase(repo, argument, scopesInput) {
  const { root, feature } = await resolveFeature(repo, argument);
  const scopePath = path.join(feature, 'scope.json');
  if (await pathInfo(scopePath)) throw new Error('SCOPE_EXISTS：已有开工基线，禁止重置');
  const scopes = normalizeScopes(scopesInput);
  const base = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).stdout;
  const dirtyAtInit = await createDirtyAtInit(root, scopes, status);
  const snapshotRoot = path.join(feature, 'prechange', 'files');
  const skipped = [];

  for (const relative of listFiles(root, scopes)) {
    const reason = await skippedReason(root, relative);
    if (reason) {
      skipped.push({ path: relative, reason, sha256: await hashFileOrNull(root, relative) });
      continue;
    }
    const destination = snapshotPath(snapshotRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, relative), destination);
  }

  const prechangeRoot = path.join(feature, 'prechange');
  await mkdir(prechangeRoot, { recursive: true });
  const planPath = path.join(feature, 'qa-plan.md');
  const planFrozen = await fileExists(planPath);
  if (planFrozen) await copyFile(planPath, path.join(prechangeRoot, 'qa-plan.md'));
  await writeFile(path.join(prechangeRoot, 'status.txt'), status);
  const scope = {
    version: 2,
    base,
    createdAt: new Date().toISOString(),
    scopes,
    fromBase: [],
    skipped,
    dirtyAtInit,
  };
  await writeFile(scopePath, `${JSON.stringify(scope, null, 2)}\n`);
  console.log(`已记录开工前基线 ${base}，快照范围 ${scopes.length} 项，跳过 ${skipped.length} 项。`);
  console.log(planFrozen ? '计划已冻结：prechange/qa-plan.md' : '未找到 qa-plan.md，计划未冻结');
  for (const relative of dirtyAtInit.inScope) console.log(`开工时范围内已有改动：${relative}`);
  if (dirtyAtInit.inScope.length) {
    console.log('若属于本任务（如阶段 1–2 写入的 ADR/GLOSSARY、流程工具修复），请运行：');
    console.log(`node tooling/scripts/review-package.mjs add ${argument} -- <路径...>`);
  }
}

function baseTreeFiles(root, base, scopes) {
  return git(root, ['ls-tree', '-r', '-z', '--name-only', base, '--', ...scopes]).stdout
    .split('\0')
    .filter(Boolean);
}

function baseSymlinkFiles(root, base, scopes) {
  return git(root, ['ls-tree', '-r', '-z', base, '--', ...scopes]).stdout
    .split('\0')
    .filter(Boolean)
    .flatMap((entry) => {
      const match = entry.match(/^120000 [^\t]+\t(.+)$/);
      return match ? [match[1]] : [];
    });
}

async function addReviewScopes(repo, argument, scopesInput) {
  const { root, feature } = await resolveFeature(repo, argument);
  const scopePath = path.join(feature, 'scope.json');
  const scope = await readScope(feature);
  if (scope.version !== 2) {
    throw new Error(scope.version === 1 ? '旧版 v1 基线不支持 add，请在开工时使用新版 init' : 'add 需要 version 2 基线');
  }
  const addedScopes = normalizeScopes(scopesInput);
  const previousScopes = new Set(scope.scopes);
  const files = new Set();
  const baseFiles = new Set();
  const baseSymlinks = new Set();
  for (const added of addedScopes) {
    for (const relative of baseTreeFiles(root, scope.base, [added])) {
      files.add(relative);
      baseFiles.add(relative);
    }
    for (const relative of baseSymlinkFiles(root, scope.base, [added])) baseSymlinks.add(relative);
    for (const relative of listFiles(root, [added])) files.add(relative);
  }

  const snapshotRoot = path.join(feature, 'prechange', 'files');
  const skipped = new Map((scope.skipped ?? []).map((item) => [item.path, item]));
  for (const relative of [...files].sort()) {
    const baseContent = baseFiles.has(relative)
      ? git(root, ['show', `${scope.base}:${relative}`], [0], null).stdout
      : null;
    const currentPresent = Boolean(await pathInfo(path.join(root, relative)));
    const currentReason = currentPresent ? await skippedReason(root, relative) : null;
    const baseIsSymlink = baseSymlinks.has(relative);
    const baseReason = baseContent === null ? null : baseIsSymlink ? '符号链接' : baseSkippedReason(relative, baseContent);
    const reason = currentReason ?? baseReason;
    const destination = snapshotPath(snapshotRoot, relative);
    if (reason) {
      await rm(destination, { force: true });
      skipped.set(relative, {
        path: relative,
        reason,
        sha256: baseContent === null ? null : baseIsSymlink ? sha256(`symlink:${baseContent.toString()}`) : sha256(baseContent),
      });
      continue;
    }
    skipped.delete(relative);
    if (baseContent === null) {
      await rm(destination, { force: true });
    } else {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, baseContent);
    }
  }

  scope.scopes = normalizeScopes([...scope.scopes, ...addedScopes]);
  scope.fromBase = normalizeScopes([...(scope.fromBase ?? []), ...addedScopes]);
  scope.skipped = [...skipped.values()].sort((left, right) => left.path.localeCompare(right.path));
  await writeFile(scopePath, `${JSON.stringify(scope, null, 2)}\n`);
  const newScopes = addedScopes.filter((added) => !previousScopes.has(added));
  const newFiles = [...files].filter((relative) => !baseFiles.has(relative)).length;
  console.log(`新增范围：${newScopes.join(', ') || '无'}；处理 ${files.size} 个文件，其中 base 不存在的新文件 ${newFiles} 个。`);
}

async function snapshotFiles(snapshotRoot) {
  if (!(await pathInfo(snapshotRoot))) return [];
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

async function collectOutOfScope(root, scope, expectedScopes) {
  if (!scope.dirtyAtInit) return [];
  const outOfScope = new Map();
  const initial = scope.dirtyAtInit.outOfScope ?? {};
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).stdout;
  const currentPaths = [...new Set(statusPaths(status))].sort();
  for (const relative of currentPaths) {
    if (isScratch(relative) || inScope(relative, expectedScopes)) continue;
    const currentHash = await hashFileOrNull(root, relative);
    if (!Object.prototype.hasOwnProperty.call(initial, relative)) {
      outOfScope.set(relative, { path: relative, reason: '开工后新增改动' });
    } else if (initial[relative] !== currentHash) {
      outOfScope.set(relative, { path: relative, reason: '开工后继续修改' });
    }
  }

  const committed = git(root, ['diff', '--name-only', '-z', scope.base, 'HEAD']).stdout
    .split('\0')
    .filter(Boolean);
  for (const relative of committed) {
    if (!inScope(relative, expectedScopes) && !outOfScope.has(relative)) {
      outOfScope.set(relative, { path: relative, reason: '开工后已提交' });
    }
  }
  return [...outOfScope.values()];
}

async function collectReviewPackage(repo, argument, scopesInput) {
  const { root, feature } = await resolveFeature(repo, argument);
  const scope = await readScope(feature);
  const snapshotRoot = path.join(feature, 'prechange', 'files');
  const beforeFiles = await snapshotFiles(snapshotRoot);
  const skipped = new Map((scope.skipped ?? []).map((item) => [item.path, item]));
  if (scope.version === 2) {
    const narrowed = [...new Set([...beforeFiles, ...skipped.keys()])]
      .filter((relative) => !inScope(relative, scope.scopes));
    if (narrowed.length) {
      throw new Error(`SCOPE_NARROWED：审查范围被收窄：${narrowed.join(', ')}；不要修改 scope.json；扩大范围请用 add`);
    }
  }

  const expectedScopes = normalizeScopes(scope.scopes);
  const requestedScopes = scopesInput.filter((item) => item !== '--');
  if (requestedScopes.length && normalizeScopes(requestedScopes).join('\n') !== expectedScopes.join('\n')) {
    throw new Error('SCOPE_MISMATCH：审查范围不得在执行中静默扩大');
  }

  git(root, ['cat-file', '-e', `${scope.base}^{commit}`]);
  if (git(root, ['merge-base', 'HEAD', scope.base]).stdout.trim() !== scope.base) {
    throw new Error('BASE_NOT_ANCESTOR：review-base 已不是当前 HEAD 的祖先');
  }

  const currentFiles = listFiles(root, expectedScopes);
  const allFiles = [...new Set([...beforeFiles, ...currentFiles, ...skipped.keys()])].sort();
  const changedFiles = [];
  const unreviewed = [];
  const patches = [];

  for (const relative of allFiles) {
    const before = snapshotPath(snapshotRoot, relative);
    const currentInfo = await pathInfo(path.join(root, relative));
    const currentReason = currentInfo ? await skippedReason(root, relative) : null;
    const skippedItem = skipped.get(relative);
    if (currentReason || skippedItem) {
      const beforeHash = skippedItem && Object.prototype.hasOwnProperty.call(skippedItem, 'sha256')
        ? skippedItem.sha256
        : UNKNOWN_HASH;
      const currentHash = currentInfo && (currentInfo.isFile() || currentInfo.isSymbolicLink())
        ? await hashFile(root, relative)
        : null;
      if (beforeHash !== UNKNOWN_HASH && beforeHash === currentHash) continue;
      unreviewed.push({
        path: relative,
        reason: currentReason ?? skippedItem?.reason ?? '无法比较的文件',
      });
      continue;
    }

    const beforeExists = await fileExists(before);
    const currentExists = currentInfo?.isFile() ?? false;
    if (beforeExists && currentExists && (await readFile(before)).equals(await readFile(path.join(root, relative)))) {
      continue;
    }
    const patch = diffNoIndex(root, beforeExists ? before : devNull, currentExists ? path.join(root, relative) : devNull);
    if (patch) {
      patches.push(patch);
      changedFiles.push(relative);
    }
  }

  const isVersion2 = scope.version === 2;
  const outOfScope = isVersion2 ? await collectOutOfScope(root, scope, expectedScopes) : [];
  const fromBase = scope.fromBase ?? [];
  const preexisting = isVersion2
    ? (scope.dirtyAtInit?.inScope ?? []).filter((relative) => !inScope(relative, fromBase))
    : [];
  const treeDigest = isVersion2 ? await computeTreeDigest(root, expectedScopes) : null;
  await writeFile(path.join(feature, 'review-package.diff'), patches.join('\n'));
  const manifest = isVersion2
    ? {
        version: 2,
        base: scope.base,
        scope: expectedScopes,
        fromBase,
        changedFiles,
        unreviewed,
        outOfScope,
        preexisting,
        treeDigest,
        package: 'review-package.diff',
      }
    : {
        version: 1,
        base: scope.base,
        scope: expectedScopes,
        changedFiles,
        unreviewed,
        package: 'review-package.diff',
      };
  await writeFile(path.join(feature, 'review-package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (isVersion2) {
    console.log(`审查包已生成：${changedFiles.length} 个变更文件，${unreviewed.length} 个未审查文件，${outOfScope.length} 个范围外改动，${preexisting.length} 个开工前已有改动；tree ${treeDigest.slice(0, 12)}。`);
    for (const item of outOfScope) console.log(`范围外改动：${item.path}（${item.reason}）`);
    if (outOfScope.length) {
      console.log('属于本任务 → add 后重新 collect；不属于本任务（用户或其他进程的改动）→ 在 review-report 的 ## 范围说明 逐个写明来源；不要修改 scope.json');
    }
    for (const item of unreviewed) console.log(`未审查文件：${item.path}（${item.reason}）`);
    for (const relative of preexisting) console.log(`开工时范围内已有改动且未 add：${relative}`);
  } else {
    console.log(`审查包已生成：${changedFiles.length} 个变更文件，${unreviewed.length} 个未审查文件。`);
  }
}

async function printDigest(repo, argument) {
  const { root, feature } = await resolveFeature(repo, argument);
  const scope = await readScope(feature);
  console.log(`tree: ${await computeTreeDigest(root, scope.scopes)}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const [command, feature, ...scopes] = args;
  const usage = '用法: review-package <init|add|collect|digest> <feature-dir> [-- <path...>]';
  if (command === '--help' || command === 'help' || !command) {
    console.log(usage);
    return;
  }
  if (!feature || !['init', 'add', 'collect', 'digest'].includes(command)) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  try {
    const repo = process.cwd();
    if (command === 'init') await initReviewBase(repo, feature, scopes);
    else if (command === 'add') await addReviewScopes(repo, feature, scopes);
    else if (command === 'collect') await collectReviewPackage(repo, feature, scopes);
    else await printDigest(repo, feature);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
