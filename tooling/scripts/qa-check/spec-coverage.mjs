import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { QA_DIR, inScope, sha256, sha256FileOrNull } from '../review-package.mjs';
import {
  SPEC_REVIEW_CHECKLIST_FILE,
  SPEC_REVIEW_CHECKLIST_V2,
  SPEC_REVIEW_CHECKLIST_VERSION,
  SPEC_REVIEW_SKELETON_FILE,
  SUPPORTED_CHECKLIST_VERSIONS,
  isRequiredSpecRow,
  parseSpecReviewChecklist,
  parseSpecReviewCoverage,
  specReviewChecklistDocument,
  specReviewCoverageIssues,
  specReviewSkeletonDocument,
} from '../qa-spec-review.mjs';
import {
  BOUND_SEAMS,
  NO_RERUN_PATTERN,
  RECONCILIATION_FILE,
  REVIEW_DIR,
  SCRIPTED_SEAMS,
  expandWorkspacePatterns,
  gitResult,
  issue,
  tableCell,
  workspacePatterns,
} from './plan.mjs';
import { importedSpecifiers, inPageSegmentEnd, maskStringLiterals, stripComments } from './script-scan.mjs';
import { readSourceReceipt } from './provenance.mjs';

const HIGH_RISK_PATH_PATTERN = /(?:^|\/)(?:auth|permission|billing|pay|quota|privacy|security|token|session|secret|credential)(?:[./_-]|$)/i;
const HIGH_RISK_TEXT_PATTERN = /认证|鉴权|权限|隐私|安全|计费|扣费|账单|配额|支付|密码|令牌|会话|未登录|越权/;
const NODE_BUILTIN_SET = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const BUILTIN_FS_OR_CHILD_PATTERN = /^(?:node:)?(?:fs(?:\/.*)?|child_process(?:\/.*)?)$/;
const STATIC_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const TS_ESM_EXT_MAP = new Map([
  ['.js', ['.ts', '.tsx', '.js', '.jsx']],
  ['.jsx', ['.tsx', '.ts', '.jsx', '.js']],
  ['.mjs', ['.mts', '.mjs']],
  ['.cjs', ['.cts', '.cjs']],
]);
const ENV_ACCESS_RE = /\b(?:process|Deno|Bun)\.env\b|\bimport\.meta\.env\b/;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(/;
const CREATE_REQUIRE_RE = /\b(?:createRequire|require\.resolve)\b/;
const RUNTIME_INJECTION_RE = /\b(?:vi|jest|mock)\.(?:stubEnv|stubGlobal|doMock|mock)\b|\b(?:globalThis|global)\s*\[|\bObject\.defineProperty\s*\(\s*(?:globalThis|global)\b|\bReflect\.set\s*\(\s*(?:globalThis|global)\b|\beval\s*\(|\bnew\s+Function\s*\(|\bvm\.runIn/;
const EXTERNAL_IO_CALL_RE = /\b(?:readFile|readFileSync|readdir|readdirSync|spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/;

/** 执行记录备注中的「不重跑：<理由>」；理由为空时返回 null */
export function noRerunReason(row) {
  return row.detail.match(NO_RERUN_PATTERN)?.[1].trim() || null;
}

/** 对账表：每条执行结果一行，PASS 对照实测值或绑定，FAIL/BLOCKED 保留原因 */
export function reconciliationTable(rows, frozenPlan, currentPlan, markerValues, caseScripts, synthetic, injected) {
  const assertionText = (plan) => new Map(plan.cases.flatMap((testCase) => testCase.assertions
    .map((assertion) => [`${testCase.id}:${assertion.number}`, assertion.text])));
  const frozenText = assertionText(frozenPlan);
  const currentText = assertionText(currentPlan);
  return rows.map(({ row, testCase }) => {
    const key = `${row.caseId}:${row.assertion}`;
    const actual = row.status !== 'PASS'
      ? [row.evidence, row.detail].filter(Boolean).join(' ') || '（未填写原因）'
      : SCRIPTED_SEAMS.has(testCase.seam)
        ? markerValues.get(key) ?? '（无实测标记）'
        : BOUND_SEAMS.has(testCase.seam) ? row.binding || '（无绑定）' : row.evidence;
    const scripts = caseScripts.get(row.caseId) ?? [];
    const flags = [
      scripts.some((script) => injected.has(script)) && '响应注入',
      scripts.some((script) => synthetic.has(script)) && '非真实输入',
      noRerunReason(row) && `不重跑：${noRerunReason(row)}`,
    ].filter(Boolean);
    const frozenAssertion = frozenText.get(key) ?? currentText.get(key) ?? '';
    const currentAssertion = currentText.get(key) ?? frozenAssertion;
    return {
      id: `${row.caseId}-${row.assertion}`,
      status: row.status,
      priority: testCase.priority ?? 'P1',
      assertion: frozenAssertion === currentAssertion ? currentAssertion : `冻结：${frozenAssertion}<br>当前：${currentAssertion}`,
      actual,
      flag: flags.join('、'),
      seam: testCase.seam,
      target: testCase.target ?? '',
      sourceCandidates: BOUND_SEAMS.has(testCase.seam)
        ? [row.binding.match(/^`([^`]+)`/)?.[1]].filter(Boolean)
        : scripts,
      changed: frozenAssertion !== currentAssertion,
    };
  });
}

function isHighRiskRow(row) {
  if (row.changed || row.status !== 'PASS' || SCRIPTED_SEAMS.has(row.seam)) return true;
  if (HIGH_RISK_TEXT_PATTERN.test(`${row.assertion} ${row.actual}`)) return true;
  return (row.sourceCandidates ?? []).some(
    (candidate) => HIGH_RISK_PATH_PATTERN.test(candidate) || HIGH_RISK_TEXT_PATTERN.test(candidate),
  );
}

/** 计算给定候选源码及其静态导入闭包是否自基线起未发生实质变更且未含高风险文件 */
async function areRegressionSourcesUntouched(featureDir, root, scope, candidates, closure = null) {
  if (!candidates.length || !root || !scope?.base) return false;
  if (closure && !closure.resolvable) return false;
  if (closure?.hasHighRiskFile) return false;
  const dirtySet = new Set(scope.dirtyAtInit?.inScope ?? []);
  const changedInScope = new Set(
    (gitResult(root, ['diff', '--name-only', '-z', scope.base, 'HEAD']).stdout ?? '').split('\0').filter(Boolean),
  );
  const prechangeRoot = path.join(featureDir, QA_DIR, 'prechange', 'files');

  const filesToVerify = new Set(candidates);
  if (Array.isArray(closure?.closureFiles)) {
    for (const file of closure.closureFiles) {
      if (file !== 'package.json' && !file.endsWith('/package.json')) filesToVerify.add(file);
    }
  }

  for (const rel of filesToVerify) {
    if (dirtySet.has(rel) || changedInScope.has(rel)) return false;
    if (!candidates.includes(rel) && inScope(rel, scope.scopes)) return false;
    const livePath = path.join(root, rel);
    const liveHash = await sha256FileOrNull(livePath);
    if (!liveHash) return false;
    let baseHash = await sha256FileOrNull(path.join(prechangeRoot, rel));
    if (!baseHash) {
      const committed = gitResult(root, ['show', `${scope.base}:${rel}`]);
      if (committed.status !== 0) return false;
      baseHash = sha256(Buffer.from(committed.stdout, 'utf8'));
    }
    if (baseHash !== liveHash) return false;
    const text = await readFile(livePath, 'utf8').catch(() => '');
    for (const specifier of importedSpecifiers(text)) {
      if (!/^\.\.?(?:\/|$)/.test(specifier)) continue;
      const baseTarget = path.relative(root, path.resolve(path.dirname(livePath), specifier)).split(path.sep).join('/');
      const candidateTargets = [baseTarget, ...['.js', '.mjs', '.cjs', '.ts', '.tsx'].map((ext) => `${baseTarget}${ext}`)];
      if (candidateTargets.some((target) => changedInScope.has(target) || inScope(target, scope.scopes))) return false;
    }
  }
  return true;
}

async function fileExists(absPath) {
  const info = await stat(absPath).catch(() => null);
  return Boolean(info?.isFile());
}

function toRepoRelativePosix(root, absPath) {
  const relative = path.relative(root, absPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

/** 探测带可选 TS ESM 映射、扩展名与目录 index 的源码文件 */
async function probeSourceFile(root, absBase) {
  const candidates = [absBase];
  const ext = path.extname(absBase);
  if (ext && TS_ESM_EXT_MAP.has(ext)) {
    const stem = absBase.slice(0, -ext.length);
    for (const mapped of TS_ESM_EXT_MAP.get(ext)) candidates.push(`${stem}${mapped}`);
  }
  for (const suffix of STATIC_SOURCE_EXTENSIONS) candidates.push(`${absBase}${suffix}`);
  for (const suffix of STATIC_SOURCE_EXTENSIONS) candidates.push(path.join(absBase, `index${suffix}`));

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      const rel = toRepoRelativePosix(root, candidate);
      if (rel) return { absPath: candidate, relPath: rel };
    }
  }
  return null;
}

function extractExportTarget(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  for (const key of ['import', 'default', 'node', 'require']) {
    const nested = extractExportTarget(entry[key]);
    if (nested) return nested;
  }
  return null;
}

function extractDeclaredDeps(pkgJson) {
  const deps = new Set();
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const group = pkgJson?.[field];
    if (group && typeof group === 'object') {
      for (const name of Object.keys(group)) deps.add(name);
    }
  }
  return deps;
}

async function getWorkspaceEnv(root, cache) {
  if (cache?.env) return cache.env;
  const { patterns, excludes } = await workspacePatterns(root);
  const dirs = await expandWorkspacePatterns(root, patterns, excludes);
  const packages = [];
  for (const dirAbs of dirs) {
    const pkgPath = path.join(dirAbs, 'package.json');
    const pkg = await readFile(pkgPath, 'utf8').then(JSON.parse, () => null);
    if (!pkg?.name) continue;
    packages.push({
      name: pkg.name,
      absDir: dirAbs,
      pkgRel: toRepoRelativePosix(root, pkgPath),
      main: typeof pkg.main === 'string' ? pkg.main : null,
      module: typeof pkg.module === 'string' ? pkg.module : null,
      source: typeof pkg.source === 'string' ? pkg.source : null,
      exports: (typeof pkg.exports === 'string' || (pkg.exports && typeof pkg.exports === 'object')) ? pkg.exports : null,
      deps: extractDeclaredDeps(pkg),
    });
  }
  const rootPkg = await readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse, () => null);
  const rootPkgRel = rootPkg ? 'package.json' : null;
  const rootDeps = extractDeclaredDeps(rootPkg);
  const env = { packages, rootPkgRel, rootDeps, tsConfigs: new Map() };
  if (cache) cache.env = env;
  return env;
}

async function findNearestTsConfig(root, startAbsDir, env) {
  let cursor = startAbsDir;
  const visited = [];
  while (true) {
    if (env.tsConfigs.has(cursor)) {
      const cached = env.tsConfigs.get(cursor);
      for (const dir of visited) env.tsConfigs.set(dir, cached);
      return cached;
    }
    visited.push(cursor);
    const tsPath = path.join(cursor, 'tsconfig.json');
    const raw = await readFile(tsPath, 'utf8').catch(() => null);
    if (raw !== null) {
      let parsed = null;
      try {
        const cleaned = stripComments(raw).replace(/,\s*([}\]])/g, '$1');
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = null;
      }
      const compilerOptions = parsed?.compilerOptions ?? {};
      const baseUrl = path.resolve(cursor, typeof compilerOptions.baseUrl === 'string' ? compilerOptions.baseUrl : '.');
      const paths = compilerOptions.paths && typeof compilerOptions.paths === 'object' ? compilerOptions.paths : {};
      const info = { baseUrl, paths };
      for (const dir of visited) env.tsConfigs.set(dir, info);
      return info;
    }
    if (path.resolve(cursor) === path.resolve(root)) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  for (const dir of visited) env.tsConfigs.set(dir, null);
  return null;
}

function extractStaticModuleSpecifiers(stripped, masked) {
  const staticSpecs = [];
  const dynamicRequires = [];
  const staticImportRe = /\b(?:import|export)\s+(?:type\s+)?(?:[^;'"()]*?\bfrom\s*)?(['"])([^'"\r\n]+)\1/g;
  for (const match of stripped.matchAll(staticImportRe)) {
    if (masked[match.index] !== ' ') staticSpecs.push(match[2]);
  }
  for (const match of masked.matchAll(/\brequire\s*\(/g)) {
    const start = match.index + match[0].length;
    const end = inPageSegmentEnd(masked, start);
    const arg = stripped.slice(start, end).trim();
    const literal = arg.match(/^(['"])([^'"\r\n]+)\1$/);
    if (literal) staticSpecs.push(literal[2]);
    else dynamicRequires.push(arg || '<empty>');
  }
  return { staticSpecs: [...new Set(staticSpecs)], dynamicRequires };
}

function findStaticInvalidationReasons(relPath, masked, staticSpecs, dynamicRequires) {
  const reasons = [];
  if (ENV_ACCESS_RE.test(masked)) reasons.push(`${relPath} 存在环境变量读取（process.env / import.meta.env）`);
  if (DYNAMIC_IMPORT_RE.test(masked)) reasons.push(`${relPath} 存在动态 import() 调用`);
  if (dynamicRequires.length || CREATE_REQUIRE_RE.test(masked)) {
    reasons.push(`${relPath} 存在非静态 require 或动态模块加载`);
  }
  if (RUNTIME_INJECTION_RE.test(masked)) reasons.push(`${relPath} 存在运行时动态注入或全局可变态修改`);
  if (staticSpecs.some((spec) => BUILTIN_FS_OR_CHILD_PATTERN.test(spec)) || EXTERNAL_IO_CALL_RE.test(masked)) {
    reasons.push(`${relPath} 存在外部文件读取或子进程调用`);
  }
  return reasons;
}

async function isKnownExternalPackage(root, fromAbs, specifier, env) {
  const pkgName = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  if (!pkgName) return false;
  const ownerPkg = env.packages.find((pkg) => fromAbs.startsWith(`${pkg.absDir}${path.sep}`));
  if (ownerPkg?.deps.has(pkgName) || env.rootDeps.has(pkgName)) return true;
  if (await stat(path.join(root, 'node_modules', pkgName)).then((info) => info.isDirectory(), () => false)) return true;
  if (ownerPkg && await stat(path.join(ownerPkg.absDir, 'node_modules', pkgName)).then((info) => info.isDirectory(), () => false)) {
    return true;
  }
  return false;
}

async function resolveStaticSpecifier(root, fromAbs, fromRel, specifier, env) {
  if (specifier.startsWith('node:') || NODE_BUILTIN_SET.has(specifier)) return { kind: 'builtin' };
  const fromDir = path.dirname(fromAbs);

  if (/^\.\.?(?:\/|$)/.test(specifier)) {
    const found = await probeSourceFile(root, path.resolve(fromDir, specifier));
    return found
      ? { kind: 'file', ...found }
      : { kind: 'unresolved', reason: `${fromRel} 无法解析相对模块 ${specifier}` };
  }

  const tsConfig = await findNearestTsConfig(root, fromDir, env);
  if (tsConfig?.paths) {
    for (const [pattern, targets] of Object.entries(tsConfig.paths)) {
      if (!Array.isArray(targets)) continue;
      let wildcard = null;
      if (pattern.includes('*')) {
        const star = pattern.indexOf('*');
        const prefix = pattern.slice(0, star);
        const suffix = pattern.slice(star + 1);
        if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
        wildcard = specifier.slice(prefix.length, specifier.length - suffix.length);
      } else if (pattern !== specifier) {
        continue;
      }
      for (const targetPattern of targets) {
        if (typeof targetPattern !== 'string') continue;
        const expanded = wildcard === null ? targetPattern : targetPattern.replaceAll('*', wildcard);
        const found = await probeSourceFile(root, path.resolve(tsConfig.baseUrl, expanded));
        if (found) return { kind: 'file', ...found };
      }
      return { kind: 'unresolved', reason: `${fromRel} 无法解析路径别名 ${specifier}` };
    }
  }

  const wsPkg = env.packages.find((pkg) => specifier === pkg.name || specifier.startsWith(`${pkg.name}/`));
  if (wsPkg) {
    const entryCandidates = [];
    if (specifier === wsPkg.name) {
      const rootExport = extractExportTarget(wsPkg.exports?.['.'] ?? (typeof wsPkg.exports === 'string' ? wsPkg.exports : null));
      for (const relTarget of [rootExport, wsPkg.source, wsPkg.module, wsPkg.main, 'src/index', 'index']) {
        if (typeof relTarget === 'string' && relTarget) entryCandidates.push(path.resolve(wsPkg.absDir, relTarget));
      }
    } else {
      const sub = specifier.slice(wsPkg.name.length + 1);
      const subExport = extractExportTarget(wsPkg.exports?.[`./${sub}`]);
      if (subExport) entryCandidates.push(path.resolve(wsPkg.absDir, subExport));
      entryCandidates.push(path.resolve(wsPkg.absDir, sub));
      entryCandidates.push(path.resolve(wsPkg.absDir, 'src', sub));
    }
    for (const candidate of entryCandidates) {
      const found = await probeSourceFile(root, candidate);
      if (found) return { kind: 'file', ...found };
    }
    return { kind: 'unresolved', reason: `${fromRel} 无法解析工作区模块 ${specifier}` };
  }

  if (/^(?:@\/|~\/|#)/.test(specifier)) {
    return { kind: 'unresolved', reason: `${fromRel} 无法解析未配置的路径别名 ${specifier}` };
  }

  if (await isKnownExternalPackage(root, fromAbs, specifier, env)) {
    return { kind: 'external' };
  }
  return { kind: 'unresolved', reason: `${fromRel} 无法解析未声明的模块或路径别名 ${specifier}` };
}

/**
 * 分析单元入口测试及其静态导入闭包，遇到无法静态排除的动态/环境/外部 I/O 条件时 fail-closed 返回 closureHash: null
 */
export async function analyzeStaticImportClosure(root, entryFiles, workspaceCache = null) {
  const invalidationReasons = [];
  if (!root || !Array.isArray(entryFiles) || !entryFiles.length) {
    return {
      resolvable: false,
      closureFiles: [],
      closureHash: null,
      hasHighRiskFile: false,
      invalidationReasons: ['缺少源码入口或仓库根目录'],
    };
  }
  const env = await getWorkspaceEnv(root, workspaceCache);
  const visited = new Set();
  const extraFiles = new Set();
  const queue = [];

  for (const rel of entryFiles) {
    const absPath = path.resolve(root, rel);
    const normRel = toRepoRelativePosix(root, absPath);
    if (!normRel || !(await fileExists(absPath))) {
      invalidationReasons.push(`${rel} 不存在或越出仓库范围`);
      continue;
    }
    if (!visited.has(normRel)) {
      visited.add(normRel);
      queue.push({ relPath: normRel, absPath });
    }
  }

  while (queue.length) {
    const { relPath, absPath } = queue.shift();
    const content = await readFile(absPath, 'utf8').catch(() => null);
    if (content === null) {
      invalidationReasons.push(`${relPath} 无法读取源码`);
      continue;
    }
    const stripped = stripComments(content);
    const masked = maskStringLiterals(stripped);
    const { staticSpecs, dynamicRequires } = extractStaticModuleSpecifiers(stripped, masked);
    invalidationReasons.push(...findStaticInvalidationReasons(relPath, masked, staticSpecs, dynamicRequires));

    let usesExternal = false;
    for (const spec of staticSpecs) {
      const resolved = await resolveStaticSpecifier(root, absPath, relPath, spec, env);
      if (resolved.kind === 'file') {
        if (!visited.has(resolved.relPath)) {
          visited.add(resolved.relPath);
          queue.push({ relPath: resolved.relPath, absPath: resolved.absPath });
        }
      } else if (resolved.kind === 'unresolved') {
        invalidationReasons.push(resolved.reason);
      } else if (resolved.kind === 'external') {
        usesExternal = true;
      }
    }

    if (usesExternal) {
      const ownerPkg = env.packages.find((pkg) => absPath.startsWith(`${pkg.absDir}${path.sep}`));
      if (ownerPkg?.pkgRel) extraFiles.add(ownerPkg.pkgRel);
      if (env.rootPkgRel) extraFiles.add(env.rootPkgRel);
    }
  }

  const closureFiles = [...new Set([...visited, ...extraFiles])].sort();
  const hasHighRiskFile = closureFiles.some(
    (file) => HIGH_RISK_PATH_PATTERN.test(file) || HIGH_RISK_TEXT_PATTERN.test(file),
  );
  const uniqueReasons = [...new Set(invalidationReasons)];
  if (uniqueReasons.length || !closureFiles.length) {
    return {
      resolvable: false,
      closureFiles,
      closureHash: null,
      hasHighRiskFile,
      invalidationReasons: uniqueReasons,
    };
  }

  const hashParts = [];
  for (const rel of closureFiles) {
    const digest = await sha256FileOrNull(path.join(root, rel));
    if (!digest) {
      return {
        resolvable: false,
        closureFiles,
        closureHash: null,
        hasHighRiskFile,
        invalidationReasons: [`${rel} 无法计算内容哈希`],
      };
    }
    hashParts.push(`${rel}:${digest}`);
  }
  return {
    resolvable: true,
    closureFiles,
    closureHash: sha256(hashParts.join('\n')),
    hasHighRiskFile,
    invalidationReasons: [],
  };
}

function unitLogsFreshAndPassing(bucket, rowByKey, evidenceByRow, context) {
  for (const row of bucket.rows) {
    const [caseId, num] = row.id.split('-');
    const planRow = rowByKey.get(`${caseId}:${num}`);
    if (!planRow || noRerunReason(planRow)) return false;
    const entries = evidenceByRow.get(planRow) ?? [];
    if (!entries.length) return false;
    for (const entry of entries) {
      if (!entry.log?.complete || entry.log.exit !== 0) return false;
      if (context.evidenceTree && entry.log.tree !== context.evidenceTree) return false;
    }
  }
  return true;
}

/** 按过程脚本或测试文件聚合并生成 reviewUnits（支持 untouched 抽检与双轨静态闭包哈希继承） */
export async function buildReviewUnits(featureDir, table, evidenceByRow, rowByKey, context, { maxInheritRound = Infinity } = {}) {
  const rowIndex = new Map(table.map((row) => [row.id, row]));
  const grouped = new Map();
  for (const row of table) {
    const primary = row.sourceCandidates[0] ?? row.id;
    const groupKey = `${row.seam}:${primary}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        unitId: `${row.seam}:${primary}`,
        rows: [],
        sourceCandidates: new Set(),
      });
    }
    const bucket = grouped.get(groupKey);
    bucket.rows.push(row);
    for (const cand of row.sourceCandidates) bucket.sourceCandidates.add(cand);
  }

  const priorVerified = [];
  const reviewEntries = await readdir(path.join(featureDir, REVIEW_DIR)).catch(() => []);
  const specRounds = reviewEntries
    .map((name) => name.match(/^r(\d+)-spec-axis\.md$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .filter((round) => round <= maxInheritRound)
    .sort((left, right) => left - right);

  for (const round of specRounds) {
    const specRel = `${REVIEW_DIR}/r${round}-spec-axis.md`;
    const checked = await readSourceReceipt(featureDir, specRel);
    if (!checked.receipt) continue;
    const specText = await readFile(path.join(featureDir, specRel), 'utf8').catch(() => '');
    let coverage;
    try {
      coverage = parseSpecReviewCoverage(specText, { version: SPEC_REVIEW_CHECKLIST_V2 });
    } catch {
      continue;
    }
    const verifiedIds = new Set(
      coverage.rows
        .filter((item) => item.verdict === '已核实' && item.change !== '变更不成立')
        .flatMap((item) => item.ids),
    );
    const snapChecklistPath = path.join(featureDir, QA_DIR, 'round-snapshots', `r${round}`, 'feature', SPEC_REVIEW_CHECKLIST_FILE);
    const snapRaw = await readFile(snapChecklistPath, 'utf8').catch(() => null);
    if (!snapRaw) continue;
    let snapChecklist;
    try {
      snapChecklist = parseSpecReviewChecklist(snapRaw);
    } catch {
      continue;
    }
    priorVerified.push({ round, verifiedIds, units: snapChecklist.reviewUnits ?? [] });
  }

  const workspaceCache = {};
  const reviewUnits = [];
  for (const bucket of grouped.values()) {
    const sourceCandidates = [...bucket.sourceCandidates];
    const sourceHashes = [];
    for (const cand of sourceCandidates) {
      const base = bucket.rows.some((r) => SCRIPTED_SEAMS.has(r.seam)) ? featureDir : context.root;
      const hash = base ? await sha256FileOrNull(path.join(base, cand)) : null;
      sourceHashes.push(`${cand}:${hash ?? 'missing'}`);
    }
    const evidenceHashes = [];
    for (const row of bucket.rows) {
      const [caseId, num] = row.id.split('-');
      const planRow = rowByKey.get(`${caseId}:${num}`);
      const entries = (planRow && evidenceByRow.get(planRow)) || [];
      for (const entry of entries) {
        const hash = await sha256FileOrNull(path.join(featureDir, entry.path));
        evidenceHashes.push(`${entry.path}:${hash ?? 'missing'}`);
      }
      if (row.status !== 'PASS') evidenceHashes.push(`status:${row.status}`);
    }
    const assertionMaterial = bucket.rows
      .map((r) => `${r.id}\0${r.status}\0${r.assertion}\0${r.changed}\0${r.seam}\0${r.priority}\0${r.target ?? ''}`)
      .join('\n');
    const sourceHash = sha256(sourceHashes.join('\n'));
    const evidenceHash = sha256(evidenceHashes.sort().join('\n'));
    const assertionHash = sha256(assertionMaterial);
    const rowIds = bucket.rows.map((r) => r.id);
    const closure = bucket.rows.every((r) => BOUND_SEAMS.has(r.seam)) && context.root && sourceCandidates.length
      ? await analyzeStaticImportClosure(context.root, sourceCandidates, workspaceCache)
      : null;

    const isHighRiskUnit = bucket.rows.some((r) => isHighRiskRow(r)) || Boolean(closure?.hasHighRiskFile);
    let verificationStatus = (bucket.rows.some((r) => isRequiredSpecRow(r)) || isHighRiskUnit) ? 'required' : 'sampled';
    let riskReason = isHighRiskUnit ? '核心链路或高风险红线' : '常规断言';
    let inheritedFrom = null;

    if (
      bucket.rows.every((r) => !isHighRiskRow(r))
      && sourceCandidates.length
      && await areRegressionSourcesUntouched(featureDir, context.root, context.scope, sourceCandidates, closure)
    ) {
      verificationStatus = 'sampled';
      riskReason = '未实质改动源码与测试的存量回归';
    }

    const hasNoRerun = bucket.rows.some((r) => {
      const [caseId, num] = r.id.split('-');
      return Boolean(noRerunReason(rowByKey.get(`${caseId}:${num}`) ?? { detail: '' }));
    });

    // 轨道 A：精确三哈希一致且无「不重跑」豁免时延续精确继承
    if (verificationStatus === 'required' && !hasNoRerun && bucket.rows.every((r) => r.status === 'PASS' && !r.changed)) {
      for (const prior of priorVerified) {
        const matchedUnit = prior.units.find(
          (unit) =>
            unit.unitId === bucket.unitId
            && unit.sourceHash === sourceHash
            && unit.evidenceHash === evidenceHash
            && unit.assertionHash === assertionHash
            && (!closure || unit.closureHash === undefined || unit.closureHash === closure.closureHash)
            && JSON.stringify(unit.rowIds) === JSON.stringify(rowIds)
            && (rowIds.every((id) => prior.verifiedIds.has(id)) || unit.verificationStatus === 'inherited'),
        );
        if (matchedUnit) {
          verificationStatus = 'inherited';
          inheritedFrom = matchedUnit.inheritedFrom ?? `r${prior.round}-spec@${sourceHash.slice(0, 12)}`;
          riskReason = '代码、证据与断言自上轮已核实后未发生实质变化';
          break;
        }
      }
    }

    // 轨道 B：低风险 unit/integration 在测试文件、静态导入闭包实现源码与断言均未变且当前树覆盖通过时放宽继承
    if (
      verificationStatus === 'required'
      && bucket.rows.every((r) => BOUND_SEAMS.has(r.seam) && r.status === 'PASS' && !r.changed && !isHighRiskRow(r))
      && closure?.resolvable
      && closure.closureHash
      && !closure.hasHighRiskFile
      && unitLogsFreshAndPassing(bucket, rowByKey, evidenceByRow, context)
    ) {
      for (const prior of priorVerified) {
        const matchedUnit = prior.units.find(
          (unit) =>
            unit.unitId === bucket.unitId
            && unit.sourceHash === sourceHash
            && unit.assertionHash === assertionHash
            && typeof unit.closureHash === 'string'
            && unit.closureHash === closure.closureHash
            && JSON.stringify(unit.rowIds) === JSON.stringify(rowIds)
            && (rowIds.every((id) => prior.verifiedIds.has(id)) || unit.verificationStatus === 'inherited'),
        );
        if (matchedUnit) {
          verificationStatus = 'inherited';
          inheritedFrom = matchedUnit.inheritedFrom ?? `r${prior.round}-spec@${closure.closureHash.slice(0, 12)}`;
          riskReason = '低风险单元的测试文件、静态导入闭包实现源码与断言未变且当前覆盖通过';
          break;
        }
      }
    }

    for (const row of bucket.rows) {
      const targetRow = rowIndex.get(row.id);
      if (!targetRow) continue;
      targetRow.required = verificationStatus === 'required';
      if (verificationStatus === 'sampled') targetRow.samplingReason = riskReason;
    }

    reviewUnits.push({
      unitId: bucket.unitId,
      rowIds,
      sourceCandidates,
      riskReason,
      sourceHash,
      evidenceHash,
      assertionHash,
      ...(closure ? { closureHash: closure.closureHash } : {}),
      ...(closure?.invalidationReasons.length ? { closureInvalidationReasons: closure.invalidationReasons } : {}),
      verificationStatus,
      ...(inheritedFrom ? { inheritedFrom } : {}),
    });
  }
  return reviewUnits;
}

/** 对账表的 markdown 行；终端输出与 _qa/reconciliation.md 共用 */
export function reconciliationLines(table) {
  return [
    '| 用例-断言 | 状态 | 冻结断言原文 / 当前断言 | 实测值、原因或绑定 | 标注 |',
    '| --- | --- | --- | --- | --- |',
    ...table.map((row) => `| ${row.id} | ${row.status} | ${tableCell(row.assertion)} | ${tableCell(row.actual)} | ${row.flag} |`),
  ];
}

export function reconciliationDocument(table) {
  return [
    '# 对账表',
    '',
    '由 qa-check acceptance 生成，请勿手改；Spec 轴审查者逐行核对实测值或绑定是否证明冻结断言。',
    '',
    ...reconciliationLines(table),
    '',
  ].join('\n');
}

/** review 阶段：落盘的对账表须与按当前执行记录计算的一致，审查者才看到最新对账表 */
export async function reconciliationIssues(
  featureDir,
  table,
  { checklistRequired = false, checklistVersion = SPEC_REVIEW_CHECKLIST_VERSION, reviewUnits, evidenceTree, qaPlanDigest } = {},
) {
  const issues = [];
  const saved = await readFile(path.join(featureDir, RECONCILIATION_FILE), 'utf8').catch(() => null);
  if (saved !== reconciliationDocument(table)) {
    issues.push(issue(
      'RECONCILIATION_STALE',
      'FAIL',
      saved === null ? `缺少 ${RECONCILIATION_FILE}。` : `${RECONCILIATION_FILE} 与按当前执行记录计算的对账表不一致。`,
      '重跑 qa-check acceptance 生成最新对账表，再重新 collect 并按增量复审交给 Spec 轴核对。',
    ));
  }
  const savedChecklist = await readFile(path.join(featureDir, SPEC_REVIEW_CHECKLIST_FILE), 'utf8').catch(() => null);
  let savedEvidenceTree = evidenceTree;
  if (savedChecklist !== null) {
    try {
      const parsedSaved = JSON.parse(savedChecklist);
      if (typeof parsedSaved?.evidenceTree === 'string' && parsedSaved.evidenceTree) {
        savedEvidenceTree = parsedSaved.evidenceTree;
      }
    } catch {
      // 解析失败时交由下文字符串比对触发 SPEC_REVIEW_CHECKLIST_STALE
    }
  }
  const expectedChecklist = specReviewChecklistDocument(table, {
    version: checklistVersion,
    reviewUnits,
    evidenceTree: savedEvidenceTree,
    qaPlanDigest,
  });
  if ((checklistRequired && savedChecklist === null) || (savedChecklist !== null && savedChecklist !== expectedChecklist)) {
    issues.push(issue(
      'SPEC_REVIEW_CHECKLIST_STALE',
      'FAIL',
      savedChecklist === null ? `缺少 ${SPEC_REVIEW_CHECKLIST_FILE}。` : `${SPEC_REVIEW_CHECKLIST_FILE} 与当前执行记录不一致。`,
      '经 qa-check acceptance 重新生成对账表和 Spec 审查清单，不要手改 _qa/。',
    ));
  }
  return issues;
}

/** review 阶段：校验 Spec 对账覆盖与抽检范围（支持不可变快照） */
export async function checkSpecCoverage(context, featureDir, plan, manifest, raw, snapshotRoot) {
  const issues = [];
  const notes = [];
  if (manifest?.specReviewChecklist) {
    try {
      if (!SUPPORTED_CHECKLIST_VERSIONS.has(manifest.specReviewChecklist.version)
        || manifest.specReviewChecklist.path !== SPEC_REVIEW_CHECKLIST_FILE) {
        throw new Error('manifest 的清单版本或路径不受支持');
      }
      const checklist = parseSpecReviewChecklist(await readFile(path.join(featureDir, SPEC_REVIEW_CHECKLIST_FILE), 'utf8'));
      if (raw.latest?.spec) {
        const specReview = await readFile(path.join(featureDir, raw.latest.spec), 'utf8');
        issues.push(...await specReviewCoverageIssues(context.root, featureDir, checklist, specReview, { snapshotRoot }));
      }
    } catch (error) {
      issues.push(issue('SPEC_REVIEW_CHECKLIST_STALE', 'BLOCKED', `Spec 审查清单不可用：${error.message}`));
    }
  } else if (plan.reviewCoverage === '1' || plan.reviewCoverage === '2') {
    notes.push('Spec 对账覆盖：旧审查包没有清单声明，保持人工核对；重新 collect 生成新协议审查包。');
  }
  return { issues, notes };
}

/** acceptance 阶段：按状态写出或清理对账表、Spec 审查清单与 v2 预填骨架 */
export async function writeAcceptanceArtifacts(featureDir, report) {
  const target = path.join(featureDir, RECONCILIATION_FILE);
  const checklistTarget = path.join(featureDir, SPEC_REVIEW_CHECKLIST_FILE);
  const skeletonTarget = path.join(featureDir, SPEC_REVIEW_SKELETON_FILE);
  if (!report.table) {
    await rm(target, { force: true });
    await rm(checklistTarget, { force: true });
    await rm(skeletonTarget, { force: true });
    return;
  }
  await mkdir(path.join(featureDir, QA_DIR), { recursive: true });
  await writeFile(target, reconciliationDocument(report.table));
  const planText = await readFile(path.join(featureDir, 'qa-plan.md'), 'utf8');
  const coverageMatch = planText.match(/^QA Review Coverage:\s*(1|2)\s*$/m);
  const acceptanceCollectable = report.status === 'PASS'
    || (report.status === 'BLOCKED'
      && report.issues.length > 0
      && report.issues.every((item) => item.code === 'ASSERTION_BLOCKED'));
  if (coverageMatch && acceptanceCollectable) {
    const checklistVersion = Number(coverageMatch[1]);
    const checklistJson = specReviewChecklistDocument(report.table, {
      version: checklistVersion,
      reviewUnits: report.reviewUnits,
      evidenceTree: report.evidenceTree,
      qaPlanDigest: report.qaPlanDigest,
    });
    await writeFile(checklistTarget, checklistJson);
    if (checklistVersion === SPEC_REVIEW_CHECKLIST_V2) {
      await writeFile(skeletonTarget, specReviewSkeletonDocument(parseSpecReviewChecklist(checklistJson)));
    } else {
      await rm(skeletonTarget, { force: true });
    }
    return;
  }
  await rm(checklistTarget, { force: true });
  await rm(skeletonTarget, { force: true });
}
