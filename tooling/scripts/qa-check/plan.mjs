import { spawnSync } from 'node:child_process';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  computeEvidenceTreeDigest,
  computeQaArtifactsDigest,
  computeTreeDigest,
  QA_DIR,
  readScope,
} from '../review-package.mjs';
import { splitShellWords } from '../qa-run.mjs';
import { splitMarkdownRow } from '../qa-spec-review.mjs';

export const CURRENT_SCHEMA = 4;

export const RESULT_STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED']);
export const PHASES = new Set(['plan', 'acceptance', 'review']);
export const SEAMS = new Set(['browser', 'api', 'integration', 'unit', 'static']);
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
export const TRIAGE_VALUES = new Set(['本次修', '转专项', '驳回']);
// 过程脚本只接受常见脚本扩展名；截图、日志、计划等证据或文档不能充当入口脚本
export const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.py', '.sh']);
export const SCRIPTS_DIR = 'scripts';
export const REVIEW_DIR = 'review';
export const DEBUG_DIR = `${QA_DIR}/debug/`;
export const CHALLENGE_FILE = 'review-challenge.json';
export const SOURCE_RECEIPT_SUFFIX = '.source.json';
export const SCRIPTED_SEAMS = new Set(['browser', 'api']);
export const BOUND_SEAMS = new Set(['unit', 'integration']);
export const DEFAULT_FIX_PREFIXES = ['S-H', 'P-M', 'P-W'];
export const NO_RERUN_PATTERN = /不重跑[:：]\s*(\S.*)$/;
export const DISPOSITION_VALUES = new Set(['', '—', '已修', '未修', '修错', '改档成立', '改档不成立', '驳回', '转专项']);
export const STAGE_ARTIFACT_PATTERN = /^(?:GLOSSARY\.md|CONTEXT\.md|docs\/adr\/.+)$/;
export const BASELINE_HINT = '基线之前的执行不能作为本轮证据；建立基线后换新标签用 qa-run 重新运行，并更新证据路径。';
export const RECONCILIATION_FILE = `${QA_DIR}/reconciliation.md`;
export const TEST_FILE_PATTERN = /(?:\.(?:test|spec)\.[cm]?[jt]sx?|_test\.py|(?:^|\/)test_[^/]+\.py)$/;

// QA 工作流依赖的流程技能；个人级同名且内容不同会让项目版失效
const WORKFLOW_SKILLS = new Set([
  'to-spec', 'to-tickets', 'implement', 'implement-spec', 'tdd', 'code-review', 'pr', 'retro',
  'handoff', 'grill-with-docs', 'grill-me', 'domain-modeling', 'codebase-design',
  'setup-qa-workflow', 'diagnosing-bugs', 'improve-codebase-architecture', 'qa-test-planner',
]);

const IGNORED_WORKSPACE_DIRS = new Set(['node_modules', '.git', '.next', '.scratch', '.turbo', 'dist', 'build', '.cache']);

export function result(status, issues = [], notes = []) {
  return { status, ok: status === 'PASS', issues, notes };
}

export function issue(code, severity, message, hint) {
  return { code, severity, message, ...(hint ? { hint } : {}) };
}

/** 合并多组检查结果的 issues 与 notes，保持各组顺序 */
export function mergeFindings(...parts) {
  return {
    issues: parts.flatMap((part) => part.issues),
    notes: parts.flatMap((part) => part.notes),
  };
}

export function summarize(issues = [], notes = []) {
  const status = issues.some((item) => item.severity === 'FAIL')
    ? 'FAIL'
    : issues.some((item) => item.severity === 'BLOCKED')
      ? 'BLOCKED'
      : 'PASS';
  return result(status, issues, notes);
}

/** 转义正则特殊字符 */
export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function tableCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
}

/** 抽取 Markdown 中指定标题段的正文，找不到时返回 null */
export function markdownSection(markdown, headingPattern) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

/** 编号前缀对应的审查轴：S-* 为 Standards，P-* 为 Spec */
export function axisOf(id) {
  return id.startsWith('S-') ? 'standards' : 'spec';
}

export async function gitRoot(directory) {
  const res = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (res.error || res.status !== 0) return null;
  return realpath(res.stdout.trim());
}

/** 读取任意 Git 命令结果（允许非零退出） */
export function gitResult(repo, args) {
  return spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

/** 日志开始时间早于开工基线时返回 true；任一时间无法解析时不判定 */
export function startedBeforeBaseline(log, scope) {
  const createdAt = Date.parse(scope?.createdAt ?? '');
  const started = Date.parse(log?.started ?? '');
  return Number.isFinite(createdAt) && Number.isFinite(started) && started < createdAt;
}

export async function featureContext(featureDir) {
  let scope;
  try {
    scope = await readScope(featureDir);
  } catch (error) {
    if (error.code === 'ENOENT') return { scope: null, root: null, tree: null, evidenceTree: null };
    throw error;
  }
  const root = await gitRoot(featureDir);
  if (!root) throw new Error(`无法定位特性目录所在仓库；存在 ${QA_DIR}/scope.json 时特性目录必须位于 git 仓库内`);
  const [tree, evidenceTree] = await Promise.all([
    computeTreeDigest(root, scope.scopes),
    computeEvidenceTreeDigest(root, scope.scopes),
  ]);
  return { scope, root, tree, evidenceTree };
}

export function evidenceReferences(text) {
  const paths = [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter(Boolean);
  const remainder = text.replace(/`[^`]+`/g, '');
  const valid = paths.length > 0 && /^[\s,，、;；&+]*$/.test(remainder);
  return { paths, valid };
}

export function evidenceLocation(featureDir, reference) {
  const root = path.resolve(featureDir);
  const absolute = path.resolve(root, reference);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return { absolute, relative: relative.split(path.sep).join('/') };
}

export function completeRunLog(log) {
  return Boolean(
    log?.complete
    && log.label
    && log.command !== null
    && Array.isArray(log.argv)
    && log.cwd
    && log.head
    && log.tree
    && log.started
    && log.finished,
  );
}

/** 零依赖 POSIX 路径通配匹配（支持单级通配、跨目录双星号与单字符通配），避免依赖 Node 22.5+ 专有 API */
export function matchPosixGlob(filePath, pattern) {
  let regex = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          regex += '(?:.*/)?';
        } else {
          regex += '.*';
        }
      } else {
        regex += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      regex += '[^/]';
      continue;
    }
    regex += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  regex += '$';
  return new RegExp(regex).test(filePath);
}

/** 拆离工作区通配项与 ! 排除项，统一规范为 POSIX 相对路径 */
function splitWorkspaceRules(rawPatterns) {
  const patterns = [];
  const excludes = [];
  for (const item of rawPatterns) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const isExclude = trimmed.startsWith('!');
    const cleaned = (isExclude ? trimmed.slice(1) : trimmed).replace(/^\.\//, '').replace(/\/+$/, '');
    if (!cleaned) continue;
    (isExclude ? excludes : patterns).push(cleaned);
  }
  return { patterns, excludes };
}

/**
 * 工作区包目录的匹配模式：优先读 pnpm-workspace.yaml 的 packages 列表（支持行尾 # 注释与 ! 排除项），
 * 没有时读根 package.json 的 workspaces（数组，或对象的 packages 字段）
 */
export async function workspacePatterns(root) {
  const yaml = await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8').catch(() => null);
  if (yaml !== null) {
    const raw = [];
    let inPackages = false;
    for (const line of yaml.split(/\r?\n/)) {
      if (/^packages\s*:\s*(?:#.*)?$/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages && /^\S/.test(line) && !/^\s*#/.test(line)) inPackages = false;
      if (!inPackages) continue;
      const item = line.match(/^\s+-\s+(?:'([^']+)'|"([^"]+)"|([^\s#]+))\s*(?:#.*)?$/);
      if (item) raw.push(item[1] ?? item[2] ?? item[3]);
    }
    return { ...splitWorkspaceRules(raw), problem: null };
  }
  const text = await readFile(path.join(root, 'package.json'), 'utf8').catch(() => null);
  if (text === null) return { patterns: [], excludes: [], problem: null };
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return { patterns: [], excludes: [], problem: 'package.json 无法解析' };
  }
  const workspaces = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages;
  const raw = Array.isArray(workspaces) ? workspaces.filter((item) => typeof item === 'string') : [];
  return { ...splitWorkspaceRules(raw), problem: null };
}

function isExcludedWorkspace(relativePosix, excludes) {
  return excludes.some((pattern) => {
    const base = pattern.replace(/\/\*\*$/, '');
    return relativePosix === base
      || relativePosix.startsWith(`${base}/`)
      || matchPosixGlob(relativePosix, pattern);
  });
}

async function collectPackageDirs(root, startRel = '') {
  const startAbs = startRel ? path.join(root, startRel) : root;
  const entries = (await readdir(startAbs, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && !IGNORED_WORKSPACE_DIRS.has(entry.name));
  const nested = await Promise.all(entries.map(async (entry) => {
    const relPosix = startRel ? `${startRel}/${entry.name}` : entry.name;
    const absPath = path.join(startAbs, entry.name);
    const [pkgStat, children] = await Promise.all([
      stat(path.join(absPath, 'package.json')).catch(() => null),
      collectPackageDirs(root, relPosix),
    ]);
    return pkgStat?.isFile() ? [{ relPosix, absPath }, ...children] : children;
  }));
  return nested.flat();
}

/** 展开工作区模式：支持精确目录、单层通配与多级 glob，并过滤 ! 排除项 */
export async function expandWorkspacePatterns(root, patterns, excludes = []) {
  const seen = new Set();
  const directories = [];
  const pushAllowed = (items) => {
    for (const { relPosix, absPath, isPkg } of items) {
      if (!isPkg || isExcludedWorkspace(relPosix, excludes) || seen.has(absPath)) continue;
      seen.add(absPath);
      directories.push(absPath);
    }
  };

  let allPackageDirs = null;
  for (const pattern of patterns) {
    if (!/[*?]/.test(pattern)) {
      const absPath = path.join(root, pattern);
      const isPkg = Boolean((await stat(path.join(absPath, 'package.json')).catch(() => null))?.isFile());
      pushAllowed([{ relPosix: pattern, absPath, isPkg }]);
      continue;
    }
    if (pattern.endsWith('/*') && !/[*?]/.test(pattern.slice(0, -2))) {
      const prefix = pattern.slice(0, -2);
      const base = path.join(root, prefix);
      const entries = (await readdir(base, { withFileTypes: true }).catch(() => []))
        .filter((entry) => entry.isDirectory() && !IGNORED_WORKSPACE_DIRS.has(entry.name));
      const checked = await Promise.all(entries.map(async (entry) => {
        const absPath = path.join(base, entry.name);
        const isPkg = Boolean((await stat(path.join(absPath, 'package.json')).catch(() => null))?.isFile());
        return { relPosix: `${prefix}/${entry.name}`, absPath, isPkg };
      }));
      pushAllowed(checked);
      continue;
    }
    if (!allPackageDirs) allPackageDirs = await collectPackageDirs(root);
    pushAllowed(
      allPackageDirs
        .filter((item) => matchPosixGlob(item.relPosix, pattern))
        .map((item) => ({ ...item, isPkg: true })),
    );
  }
  return directories;
}

export function parseSpec(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## User Stories\s*$/.test(line));
  if (start < 0) throw new Error('缺少 ## User Stories');
  const nextHeading = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const end = nextHeading < 0 ? lines.length : nextHeading;
  const ids = lines.slice(start + 1, end).flatMap((line) => {
    const match = line.match(/^(\d+)\.\s+\S/);
    return match ? [Number(match[1])] : [];
  });
  if (!ids.length || new Set(ids).size !== ids.length) {
    throw new Error('User Stories 编号为空或重复');
  }
  return ids;
}

/** 读取 spec 的 `## 交付命令`：取该段第一个围栏代码块中的非空行作为命令 */
export function parseSpecCommands(markdown) {
  const body = markdownSection(markdown, /^## 交付命令\s*$/);
  if (body === null) return null;
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*(?:```|~~~)/.test(line));
  if (start < 0) return null;
  const fence = lines[start].trim().slice(0, 3);
  const commands = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith(fence)) break;
    if (line.trim()) commands.push(line.trim());
  }
  return commands.length ? commands : null;
}

export function deriveCaseStatus(rows) {
  if (!rows.length) return 'BLOCKED';
  if (rows.some((row) => row?.status === 'FAIL')) return 'FAIL';
  if (rows.some((row) => !row || row.status === 'BLOCKED')) return 'BLOCKED';
  return 'PASS';
}

export function parsePlan(markdown) {
  const mode = markdown.match(/^QA Mode:\s*(\S+)\s*$/m)?.[1];
  const kind = markdown.match(/^QA Kind:\s*(\S+)\s*$/m)?.[1] ?? 'feature';
  const cases = [];
  const results = [];
  const delivery = [];
  const reproductions = [];
  const planChanges = [];
  let bindingColumn = false;
  let currentCase = null;
  let inAssertions = false;
  let section = '';

  for (const [lineIndex, line] of markdown.split(/\r?\n/).entries()) {
    const caseHeading = line.match(/^###\s+(TC\d+)\b/);
    if (caseHeading) {
      currentCase = { id: caseHeading[1], priority: null, covers: [], seam: null, target: null, assertions: [] };
      cases.push(currentCase);
      inAssertions = false;
      section = '';
      continue;
    }

    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentCase = null;
      inAssertions = false;
      section = heading[1];
      continue;
    }

    if (currentCase) {
      const priority = line.match(/^- Priority:\s*(P\d+)\s*$/);
      if (priority) currentCase.priority = priority[1];
      const covers = line.match(/^- Covers:\s*([\d,\s]+)$/);
      if (covers) currentCase.covers = covers[1].split(',').map((value) => Number(value.trim()));
      const seam = line.match(/^- Seam:\s*(\S+)\s*$/);
      if (seam) currentCase.seam = seam[1];
      const target = line.match(/^- Target:\s*(.+)$/);
      if (target) currentCase.target = target[1].trim();
      if (/^####\s+验证断言\s*$/.test(line)) {
        inAssertions = true;
        continue;
      }
      if (/^#{1,4}\s/.test(line)) inAssertions = false;
      if (inAssertions) {
        const assertion = line.match(/^(\d+)\.\s+(.+)$/);
        if (assertion) {
          currentCase.assertions.push({ number: Number(assertion[1]), text: assertion[2].trim() });
        }
      }
    }

    if (!line.includes('|')) {
      if (section === '计划变更') planChanges.push(line);
      continue;
    }
    const cells = splitMarkdownRow(line);
    if (section === '执行记录') {
      if (cells[0] === '用例' && cells.includes('绑定')) bindingColumn = true;
      if (cells.length < 4 || !/^TC\d+$/.test(cells[0])) continue;
      if (!/^\d+$/.test(cells[1]) || !RESULT_STATUSES.has(cells[2])) continue;
      results.push({
        caseId: cells[0],
        assertion: Number(cells[1]),
        status: cells[2],
        evidence: cells[3],
        binding: cells[4] ?? '',
        detail: cells.slice(5).join('|').trim(),
        line: lineIndex + 1,
      });
    } else if (section === '交付验证') {
      const command = cells[0]?.match(/^`([^`]+)`$/);
      if (command) delivery.push({ command: command[1], evidence: cells[1] ?? '' });
    } else if (section === '修复前复现') {
      if (/^TC\d+$/.test(cells[0] ?? '')) reproductions.push({ caseId: cells[0], evidence: cells[1] ?? '' });
    } else if (section === '计划变更') {
      planChanges.push(line);
    }
  }
  return {
    schema: Number(markdown.match(/^QA Schema:\s*(\d+)\s*$/m)?.[1] ?? NaN),
    bindingColumn,
    mode,
    kind,
    reviewCoverage: markdown.match(/^QA Review Coverage:\s*(\S+)\s*$/m)?.[1] ?? null,
    cases,
    results,
    delivery,
    reproductions,
    planChanges: planChanges.join('\n'),
  };
}

export function validatePlan(plan, specIds) {
  const issues = [];
  const notes = [];
  if (!['inline', 'independent'].includes(plan.mode)) {
    issues.push(issue('INVALID_QA_MODE', 'FAIL', 'QA Mode 必须是 inline 或 independent'));
  }
  if (!['feature', 'fix'].includes(plan.kind)) {
    issues.push(issue('INVALID_QA_KIND', 'FAIL', `QA Kind 必须是 feature 或 fix，当前为 ${plan.kind}`));
  }
  if (plan.reviewCoverage !== null && !['1', '2'].includes(plan.reviewCoverage)) {
    issues.push(issue('INVALID_QA_REVIEW_COVERAGE', 'FAIL', 'QA Review Coverage 只能声明为 1 或 2；旧计划可省略该字段'));
  }
  if (!plan.cases.length) issues.push(issue('NO_TEST_CASES', 'FAIL', '测试计划没有 TC 用例'));
  if (!plan.bindingColumn) {
    issues.push(issue('MISSING_BINDING_COLUMN', 'FAIL', '## 执行记录 表头缺少「绑定」列；Schema 4 列为：用例、断言序号、状态、证据、绑定、备注'));
  }
  if (!plan.delivery.length) {
    issues.push(issue('MISSING_DELIVERY_COMMANDS', 'FAIL', '## 交付验证 中没有反引号命令；请在规划时声明最终需要真实运行的完整命令'));
  }

  const caseIds = new Set();
  const covered = new Set();
  for (const testCase of plan.cases) {
    if (caseIds.has(testCase.id)) issues.push(issue('DUPLICATE_TC', 'FAIL', `${testCase.id} 重复定义`));
    caseIds.add(testCase.id);
    if (!testCase.priority) issues.push(issue('MISSING_PRIORITY', 'FAIL', `${testCase.id} 缺少 Priority`));
    if (!testCase.covers.length) issues.push(issue('MISSING_COVERS', 'FAIL', `${testCase.id} 缺少 Covers`));
    if (!testCase.seam) issues.push(issue('MISSING_SEAM', 'FAIL', `${testCase.id} 缺少 Seam`));
    else if (!SEAMS.has(testCase.seam)) {
      issues.push(issue('INVALID_SEAM', 'FAIL', `${testCase.id} 的 Seam ${testCase.seam} 无效，应为 browser、api、integration、unit 或 static`));
    }
    if (!testCase.assertions.length) {
      issues.push(issue('MISSING_ASSERTIONS', 'FAIL', `${testCase.id} 缺少验证断言`));
    }
    testCase.assertions.forEach((assertion, index) => {
      if (assertion.number !== index + 1) {
        issues.push(issue('INVALID_ASSERTION_SEQUENCE', 'FAIL', `${testCase.id} 断言必须从 1 连续编号`));
      }
    });
    for (const us of testCase.covers) {
      if (!specIds.includes(us)) issues.push(issue('UNKNOWN_US', 'FAIL', `${testCase.id} 覆盖未知 US ${us}`));
      covered.add(us);
    }
  }
  for (const us of specIds) {
    if (!covered.has(us)) issues.push(issue('UNCOVERED_US', 'FAIL', `US ${us} 没有被任何 TC 覆盖`));
  }
  const browserCount = plan.cases.filter((testCase) => testCase.seam === 'browser').length;
  if (browserCount > 5) {
    notes.push(`browser 用例共 ${browserCount} 条，时间盒为 ≤5 条/15 分钟；请考虑把部分断言下沉到更低接缝。`);
  }
  return { issues, notes };
}

/** 核对 spec 声明的交付命令是否原样进入计划；缺少声明时规划阶段不通过，其余阶段只提示 */
export function specCommandIssues(plan, commands, phase) {
  if (!commands) {
    if (phase === 'plan') {
      return {
        issues: [issue(
          'MISSING_SPEC_COMMANDS',
          'FAIL',
          'spec.md 缺少 ## 交付命令 代码块，无法核对交付验证是否完整。',
          '在 Testing Decisions 后增加 ## 交付命令，用一个代码块逐行写出最终需要真实运行的完整命令。',
        )],
        notes: [],
      };
    }
    return { issues: [], notes: ['spec.md 没有 ## 交付命令 代码块，本次未核对交付验证是否覆盖 spec 声明的命令。'] };
  }
  const declared = new Set(plan.delivery.map((item) => item.command.trim()));
  const issues = commands
    .filter((command) => !declared.has(command))
    .map((command) => issue(
      'SPEC_COMMAND_MISSING',
      'FAIL',
      `spec 声明的交付命令没有原样进入 ## 交付验证：${command}`,
      '把该命令原样加入 ## 交付验证；确需缩减时，先修改 spec 的 ## 交付命令并写明理由，再更新计划。',
    ));
  return { issues, notes: [] };
}

async function directoryContainsTestFile(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await directoryContainsTestFile(absolute)) return true;
    } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      return true;
    }
  }
  return false;
}

/** pnpm --filter 的测试路径相对被筛选包，而不是仓库根目录 */
async function filteredTestRoot(root, words, markerIndex) {
  const filterIndex = words.slice(0, markerIndex).findIndex((word) => word === '--filter');
  const filter = filterIndex >= 0 ? words[filterIndex + 1] : null;
  if (!filter) return root;
  const { patterns, excludes } = await workspacePatterns(root);
  for (const directory of await expandWorkspacePatterns(root, patterns, excludes)) {
    const manifest = await readFile(path.join(directory, 'package.json'), 'utf8').then(JSON.parse, () => null);
    if (manifest?.name === filter) return directory;
  }
  return root;
}

/** 规划期拦截测试运行器指向的零测试目录；非测试命令与 glob 不做目录展开 */
export async function deliveryTestDirectoryIssues(featureDir, commands) {
  if (!commands?.length) return [];
  const context = await featureContext(featureDir);
  const root = context.root ?? featureDir;
  const issues = [];
  const checked = new Set();
  for (const command of commands) {
    let words;
    try {
      words = splitShellWords(command);
    } catch {
      continue;
    }
    const markers = words
      .map((word, index) => ({ word, index }))
      .filter(({ word }) => word === '--test' || word === 'test' || word === 'vitest');
    if (!markers.length) continue;
    const commandRoot = await filteredTestRoot(root, words, markers.at(-1).index);
    for (const token of words.slice(markers.at(-1).index + 1)) {
      if (!token || token.startsWith('-') || /[*?{}]/.test(token)) continue;
      const absolute = path.resolve(commandRoot, token);
      const relative = path.relative(commandRoot, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
      const info = await stat(absolute).catch(() => null);
      if (!info?.isDirectory() || checked.has(absolute)) continue;
      checked.add(absolute);
      if (await directoryContainsTestFile(absolute)) continue;
      const display = relative.split(path.sep).join('/') || '.';
      issues.push(issue(
        'EMPTY_TEST_DIRECTORY',
        'FAIL',
        `交付命令中的测试目录不含测试文件：${display}（命令：${command}）。`,
        '改为包含 .test.* / .spec.* 测试文件的真实目录或明确测试文件，不用空目录充当交付证据。',
      ));
    }
  }
  return issues;
}

function personalSkillsDir() {
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  return configDir ? path.join(configDir, 'skills') : path.join(homedir(), '.claude', 'skills');
}

function frontmatterName(content) {
  const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const name = block?.[1].match(/^name:\s*(.+?)\s*$/m)?.[1];
  return name ? name.replace(/^(['"])(.*)\1$/, '$2').trim() : null;
}

/** 列出目录下含 SKILL.md 的技能（跟随符号链接），名称取目录名与 frontmatter name */
async function readSkills(directory) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch {
    return [];
  }
  const skills = await Promise.all(entries.sort().map(async (entry) => {
    try {
      if (!(await stat(path.join(directory, entry))).isDirectory()) return null;
      const content = await readFile(path.join(directory, entry, 'SKILL.md'));
      const names = new Set([entry]);
      const declared = frontmatterName(content.toString('utf8'));
      if (declared) names.add(declared);
      return { names, content };
    } catch {
      return null;
    }
  }));
  return skills.filter(Boolean);
}

/**
 * Claude Code 中个人级技能优先于项目级：流程技能同名且内容不同时阻塞，其余同名只提示。
 * 该检查防的是下次在 Claude Code 中执行时被遮蔽，与检查器在哪个宿主运行无关，因此不按宿主跳过。
 * 输出只列技能名，不输出个人技能内容。
 */
export async function skillShadowIssues(featureDir) {
  const root = await gitRoot(featureDir);
  if (!root) return { issues: [], notes: [] };
  const [projectSkills, personalSkills] = await Promise.all([
    readSkills(path.join(root, '.claude', 'skills')),
    readSkills(personalSkillsDir()),
  ]);
  const issues = [];
  const sharedNames = new Set();
  for (const personal of personalSkills) {
    for (const project of projectSkills) {
      const collided = [...personal.names].filter((name) => project.names.has(name));
      if (!collided.length) continue;
      const workflowName = [...project.names].find((name) => WORKFLOW_SKILLS.has(name));
      if (workflowName && !project.content.equals(personal.content)) {
        issues.push(issue(
          'SHADOWED_WORKFLOW_SKILL',
          'BLOCKED',
          `个人级技能与项目流程技能 ${workflowName} 同名且内容不同，Claude Code 会加载个人级版本，项目版不会生效。`,
          '把个人级技能目录（设置 CLAUDE_CONFIG_DIR 时为其下的 skills，否则为 ~/.claude/skills）中的同名技能移走或改名后重新运行；不要修改项目技能去迁就个人版本。该检查防的是下次在 Claude Code 中执行时流程技能被遮蔽，在其他宿主运行时同样检查。',
        ));
      } else {
        sharedNames.add(workflowName ?? collided[0]);
      }
    }
  }
  const notes = sharedNames.size
    ? [`个人级技能与项目技能同名：${[...sharedNames].sort().join('、')}；Claude Code 中个人级优先，请确认个人版是期望使用的版本；在其他宿主运行时同样检查。`]
    : [];
  return { issues, notes };
}
