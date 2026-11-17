#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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
// 特性目录内的机器状态目录：基线、开工前快照、审查包与调试截图，禁止手改
export const QA_DIR = '_qa';
// 每轮审查的挑战与子代理自写原文的凭据；文件名与 code-review 的落盘约定一致
const CHALLENGE_FILE = 'review-challenge.json';
const RECEIPT_SUFFIX = '.source.json';
const REVIEW_DIR = 'review';
/** 凭据行是生产端（seal）与检查端（qa-check）共用的协议格式 */
export const RECEIPT_LINE_PATTERN = /QA_REVIEW_RECEIPT:\s*`?([^\s`"']+)\|([0-9a-f]{64})\b/;
export function formatReceiptLine(nonce, hash) {
  return `QA_REVIEW_RECEIPT: ${nonce}|${hash}`;
}

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
  return JSON.parse(await readFile(path.join(feature, QA_DIR, 'scope.json'), 'utf8'));
}

/** 特性目录相对仓库根的路径，使用 posix 分隔符写入凭据 */
function featureRelative(root, feature) {
  return path.relative(root, feature).split(path.sep).join('/');
}

/** 轮次规范化为 r<n>；接受 r1 与 1 两种写法 */
function normalizeRound(value) {
  const match = String(value ?? '').trim().match(/^(?:r)?(\d+)$/);
  if (!match || Number(match[1]) < 1) throw new Error(`非法轮次：${value}；使用 r1、r2 或 1、2`);
  return `r${Number(match[1])}`;
}

/** 未显式指定轮次时，按 review/ 已有原文的最大轮次推导下一轮 */
async function nextReviewRound(feature) {
  let entries;
  try {
    entries = await readdir(path.join(feature, REVIEW_DIR));
  } catch {
    return 'r1';
  }
  let max = 0;
  for (const entry of entries) {
    const match = entry.match(/^r(\d+)-(?:standards|spec-axis)\.md$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `r${max + 1}`;
}

async function readChallenge(feature) {
  const file = path.join(feature, QA_DIR, CHALLENGE_FILE);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new Error(`缺少 ${QA_DIR}/${CHALLENGE_FILE}；请先运行 collect`);
  }
  let challenge;
  try {
    challenge = JSON.parse(text);
  } catch {
    throw new Error(`${QA_DIR}/${CHALLENGE_FILE} 无法解析；请重新运行 collect`);
  }
  if (!challenge || challenge.schemaVersion !== 1 || typeof challenge.nonce !== 'string' || !challenge.nonce) {
    throw new Error(`${QA_DIR}/${CHALLENGE_FILE} 缺少有效字段；请重新运行 collect`);
  }
  return challenge;
}

/** seal 的命名参数；不接受位置参数，避免把 Markdown 路径误当成范围 */
function parseSealFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) throw new Error(`seal 不接受位置参数：${arg}`);
    const name = arg.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`seal 参数 ${arg} 缺少值`);
    flags[name] = value;
    index += 1;
  }
  return flags;
}

function normalizePendingIds(value) {
  // 保留子代理实际收到的顺序，US 15 要求「原样写入」；只做去空与去重
  return [...new Set(String(value).split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean))];
}

/** 子代理自写原文后封存：校验 challenge 并把最小凭据写到同名 .source.json */
async function sealReview(repo, argument, args) {
  const { root, feature } = await resolveFeature(repo, argument);
  const flags = parseSealFlags(args);
  const round = normalizeRound(flags.round);
  const axis = flags.axis;
  if (axis !== 'standards' && axis !== 'spec') throw new Error(`seal 的 --axis 只能是 standards 或 spec，当前为 ${axis ?? '空'}`);
  const fileName = `r${round.slice(1)}-${axis === 'standards' ? 'standards' : 'spec-axis'}.md`;
  const requested = path.posix.normalize(String(flags.file ?? '').replaceAll(path.sep, '/'));
  const reportPath = `${REVIEW_DIR}/${fileName}`;
  if (requested !== reportPath) {
    throw new Error(`seal 只接受本轮本轴原文路径：${reportPath}（收到 ${flags.file ?? '空'}）`);
  }
  const reviewerKind = flags['reviewer-kind'];
  if (reviewerKind !== 'subagent' && reviewerKind !== 'external-session') {
    throw new Error('seal 的 --reviewer-kind 只能是 subagent 或 external-session');
  }
  if (!flags.host?.trim()) throw new Error('seal 需要非空的 --host');

  const report = path.join(feature, reportPath);
  const info = await pathInfo(report);
  if (!info?.isFile() || info.size === 0) {
    throw new Error(`原文不存在或为空：${reportPath}；请先写入完整审查内容再 seal`);
  }
  const challenge = await readChallenge(feature);
  if (challenge.round !== round) {
    throw new Error(`challenge 的轮次是 ${challenge.round}，与 seal 的 ${round} 不一致；请用当前轮次或重新 collect`);
  }
  if (challenge.feature !== featureRelative(root, feature)) {
    throw new Error(`challenge 的特性路径 ${challenge.feature} 与当前特性不一致；请重新 collect`);
  }
  // challenge 必须与当前审查包 manifest 绑定，防止手改或跨轮次复用
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(feature, QA_DIR, 'review-package.json'), 'utf8'));
  } catch {
    throw new Error(`缺少 ${QA_DIR}/review-package.json；请先运行 collect`);
  }
  if (challenge.treeDigest !== manifest.treeDigest) {
    throw new Error('challenge 的 treeDigest 与当前审查包不一致；请重新 collect');
  }
  if (challenge.packagedAt !== manifest.packagedAt) {
    throw new Error('challenge 的 packagedAt 与当前审查包不一致；请重新 collect');
  }

  const receiptPath = `${REVIEW_DIR}/${fileName.replace(/\.md$/, RECEIPT_SUFFIX)}`;
  const absoluteReceipt = path.join(feature, receiptPath);
  if (await fileExists(absoluteReceipt)) {
    const existing = await readFile(absoluteReceipt, 'utf8').then(JSON.parse, () => null);
    const nonceNote = existing?.nonce && existing.nonce !== challenge.nonce ? '，且 nonce 与当前 challenge 不一致' : '';
    throw new Error(`凭据已存在：${receiptPath}${nonceNote}；seal 拒绝覆盖，需要修正请按新轮次重新审查`);
  }

  const content = await readFile(report);
  const hash = sha256(content);
  const receipt = {
    schemaVersion: 1,
    feature: featureRelative(root, feature),
    round,
    axis,
    nonce: challenge.nonce,
    reviewerKind,
    host: flags.host.trim(),
    reportPath,
    sha256: hash,
    completedAt: new Date().toISOString(),
  };
  const pendingIds = flags['pending-ids'] ? normalizePendingIds(flags['pending-ids']) : [];
  if (pendingIds.length) receipt.pendingIds = pendingIds;
  await writeFile(absoluteReceipt, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(formatReceiptLine(challenge.nonce, hash));
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
  const scopePath = path.join(feature, QA_DIR, 'scope.json');
  if (await pathInfo(scopePath)) throw new Error('SCOPE_EXISTS：已有开工基线，禁止重置');
  const scopes = normalizeScopes(scopesInput);
  const base = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).stdout;
  const dirtyAtInit = await createDirtyAtInit(root, scopes, status);
  const snapshotRoot = path.join(feature, QA_DIR, 'prechange', 'files');
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

  const prechangeRoot = path.join(feature, QA_DIR, 'prechange');
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
  console.log(planFrozen ? `计划已冻结：${QA_DIR}/prechange/qa-plan.md` : '未找到 qa-plan.md，计划未冻结');
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
  const scopePath = path.join(feature, QA_DIR, 'scope.json');
  const scope = await readScope(feature);
  if (scope.version !== 2) throw new Error('add 需要 version 2 基线，请用当前版本 init 重新建立');
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

  const snapshotRoot = path.join(feature, QA_DIR, 'prechange', 'files');
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

async function collectReviewPackage(repo, argument, scopesInput, roundInput) {
  const { root, feature } = await resolveFeature(repo, argument);
  const round = roundInput ? normalizeRound(roundInput) : await nextReviewRound(feature);
  const scope = await readScope(feature);
  if (scope.version !== 2) throw new Error('collect 需要 version 2 基线，请用当前版本 init 重新建立');
  const snapshotRoot = path.join(feature, QA_DIR, 'prechange', 'files');
  const beforeFiles = await snapshotFiles(snapshotRoot);
  const skipped = new Map((scope.skipped ?? []).map((item) => [item.path, item]));
  const narrowed = [...new Set([...beforeFiles, ...skipped.keys()])]
    .filter((relative) => !inScope(relative, scope.scopes));
  if (narrowed.length) {
    throw new Error(`SCOPE_NARROWED：审查范围被收窄：${narrowed.join(', ')}；不要修改 ${QA_DIR}/scope.json；扩大范围请用 add`);
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

  const outOfScope = await collectOutOfScope(root, scope, expectedScopes);
  const fromBase = scope.fromBase ?? [];
  const preexisting = (scope.dirtyAtInit?.inScope ?? []).filter((relative) => !inScope(relative, fromBase));
  const treeDigest = await computeTreeDigest(root, expectedScopes);
  const manifestPath = path.join(feature, QA_DIR, 'review-package.json');
  const previous = await readFile(manifestPath, 'utf8').then(JSON.parse, () => null);
  // 代码未变时沿用该 tree 首次打包的时间，重复 collect 不会让已落盘的审查原文显得过期
  const packagedAt = previous?.treeDigest === treeDigest && typeof previous.packagedAt === 'string'
    ? previous.packagedAt
    : new Date().toISOString();
  // 白名单内被开工后的提交改过的文件，diff 里可能混有他人改动，在包头标注供审查者识别
  const committedInScope = git(root, ['diff', '--name-only', '-z', scope.base, 'HEAD']).stdout
    .split('\0')
    .filter((relative) => relative && changedFiles.includes(relative));
  const header = committedInScope.length
    ? `# 以下文件含开工后的提交（来源见 git log ${scope.base.slice(0, 7)}..HEAD），其中的改动可能不属于本任务：${committedInScope.join('、')}\n`
    : '';
  await mkdir(path.join(feature, QA_DIR), { recursive: true });
  await writeFile(path.join(feature, QA_DIR, 'review-package.diff'), header + patches.join('\n'));
  const manifest = {
    version: 2,
    base: scope.base,
    scope: expectedScopes,
    fromBase,
    changedFiles,
    unreviewed,
    outOfScope,
    preexisting,
    treeDigest,
    packagedAt,
    package: `${QA_DIR}/review-package.diff`,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // 每轮审查发放一次性 challenge；再次 collect 会换 nonce，旧凭据不能用于新轮次
  const challenge = {
    schemaVersion: 1,
    feature: featureRelative(root, feature),
    round,
    nonce: randomUUID(),
    treeDigest,
    packagedAt,
  };
  await writeFile(path.join(feature, QA_DIR, CHALLENGE_FILE), `${JSON.stringify(challenge, null, 2)}\n`);

  console.log(`审查包已生成：${changedFiles.length} 个变更文件，${unreviewed.length} 个未审查文件，${outOfScope.length} 个范围外改动，${preexisting.length} 个开工前已有改动；tree ${treeDigest.slice(0, 12)}。`);
  console.log(`审查 challenge 已生成：${round}，nonce ${challenge.nonce}；子代理写原文后用 review-package seal 封存。`);
  for (const item of outOfScope) console.log(`范围外改动：${item.path}（${item.reason}）`);
  if (outOfScope.length) {
    console.log(`属于本任务 → add 后重新 collect；不属于本任务（用户或其他进程的改动）→ 在 review-report 的 ## 范围说明 逐个写明来源；不要修改 ${QA_DIR}/scope.json`);
  }
  for (const item of unreviewed) console.log(`未审查文件：${item.path}（${item.reason}）`);
  for (const relative of preexisting) console.log(`开工时范围内已有改动且未 add：${relative}`);
}

async function printDigest(repo, argument) {
  const { root, feature } = await resolveFeature(repo, argument);
  const scope = await readScope(feature);
  console.log(`tree: ${await computeTreeDigest(root, scope.scopes)}`);
}

/** collect 从参数中取出可选的 --round；其余参数仍交给范围解析 */
function splitRoundFlag(args) {
  const paths = [];
  let round;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--round') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error('collect 的 --round 缺少值');
      round = value;
      index += 1;
    } else {
      paths.push(args[index]);
    }
  }
  return { round, paths };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const [command, feature, ...rest] = args;
  const usage = '用法: review-package <init|add|collect|digest|seal> <feature-dir> [--round r<n>] [-- <path...>]';
  if (command === '--help' || command === 'help' || !command) {
    console.log(usage);
    return;
  }
  if (!feature || !['init', 'add', 'collect', 'digest', 'seal'].includes(command)) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  try {
    const repo = process.cwd();
    if (command === 'init') await initReviewBase(repo, feature, rest);
    else if (command === 'add') await addReviewScopes(repo, feature, rest);
    else if (command === 'collect') {
      const { round, paths } = splitRoundFlag(rest);
      await collectReviewPackage(repo, feature, paths, round);
    } else if (command === 'seal') await sealReview(repo, feature, rest);
    else await printDigest(repo, feature);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
