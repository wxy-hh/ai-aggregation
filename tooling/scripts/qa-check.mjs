#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeTreeDigest, inScope, QA_DIR, readScope } from './review-package.mjs';
import { formatCommand, parseRunLog, splitShellWords } from './qa-run.mjs';

export const CURRENT_SCHEMA = 4;

const RESULT_STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED']);
const PHASES = new Set(['plan', 'acceptance', 'review']);
const SEAMS = new Set(['browser', 'api', 'integration', 'unit', 'static']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const TRIAGE_VALUES = new Set(['本次修', '转专项', '驳回']);
// 过程脚本只接受常见脚本扩展名；截图、日志、计划等证据或文档不能充当入口脚本
const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.py', '.sh']);
// 特性目录内的固定子目录（Schema 4）
const SCRIPTS_DIR = 'scripts';
const REVIEW_DIR = 'review';
const DEBUG_DIR = `${QA_DIR}/debug/`;
// 需要过程脚本与断言标记的接缝；需要用例绑定的接缝
const SCRIPTED_SEAMS = new Set(['browser', 'api']);
const BOUND_SEAMS = new Set(['unit', 'integration']);
// 绕过真实登录的模式：注入 Cookie、写令牌类本地存储键、脚本内登录（检查器内置，不按宿主开关）
const AUTH_BYPASS_PATTERNS = [
  { label: 'CDP 设置 Cookie', pattern: /\b(?:Network|Storage)\.setCookies?\b/ },
  { label: '浏览器上下文添加 Cookie', pattern: /\.addCookies\s*\(/ },
  { label: '写 document.cookie', pattern: /\bdocument\.cookie\s*=(?!=)/ },
  { label: '本地存储写入令牌类键', pattern: /\b(?:localStorage|sessionStorage)\s*(?:\.setItem\s*\(\s*['"`][^'"`]*token|\[\s*['"`][^'"`]*token[^'"`]*['"`]\s*\]\s*=(?!=))/i },
  // 登录只发生在脚本外：密码字面量、登录注册与签发令牌接口、生产代码后门上的登录方法
  { label: '密码字面量', pattern: /\b[\w$]*pass(?:word|wd)?[\w$]*['"]?\s*[:=]\s*(['"`])(?!\1)[^'"`\n]+\1/i },
  { label: '登录、注册或签发令牌接口', pattern: /\/api\/(?:[\w.-]+\/)*(?:log-?in|sign-?in|register|sign-?up|token)(?=[/?#'"`\s]|$)/im },
  // 不带 /api 前缀的同类路径只在请求调用中命中，避免误伤 page.goto 打开登录页
  { label: '登录、注册或签发令牌接口', pattern: /\b(?:fetch|request\.(?:post|put|fetch)|axios\.(?:post|put))\s*\(\s*['"`][^'"`\n]*\/(?:log-?in|sign-?in|register|sign-?up|token)(?=[/?#'"`])/i },
  { label: 'window.__* 上的登录方法', pattern: /window\.__[\w$]+(?:\.[\w$]+(?:\([^)]*\))?)*\.(?:login|signin|setToken|setAuth|setSession)\s*\(/i },
];
// 数据库驱动、ORM 与 BaaS 管理端 SDK：过程脚本不得绕过产品直连数据存储
const DATA_STORE_MODULES = [
  '@prisma/client', 'prisma', 'drizzle-orm', 'typeorm', 'sequelize', 'knex', 'kysely', 'mongoose',
  'pg', 'postgres', '@neondatabase/serverless', 'mysql', 'mysql2', 'sqlite', 'sqlite3', 'better-sqlite3',
  'mongodb', 'redis', 'ioredis', '@supabase/supabase-js', 'firebase-admin',
];
const PYTHON_DATA_STORE_IMPORT = /^\s*(?:from|import)\s+(psycopg2?|pymysql|mysql\.connector|sqlite3|pymongo|redis|sqlalchemy|supabase|firebase_admin)\b/m;
// 页面内执行代码的入口；其中的合成事件与直接改写应用状态不是真实输入
const IN_PAGE_ENTRY = /(?<![\w$])(?:evaluate|evaluateHandle|evaluateOnNewDocument|\$eval|\$\$eval|addInitScript|waitForFunction)\s*\(|Runtime\.(?:evaluate|callFunctionOn)/g;
const SYNTHETIC_INPUT_PATTERNS = [
  { label: 'dispatchEvent(', pattern: /\bdispatchEvent\s*\(/ },
  { label: '.click()', pattern: /\.click\(\s*\)/ },
  { label: '.focus()', pattern: /\.focus\(\s*\)/ },
  { label: '.value 赋值', pattern: /\.value\s*=(?!=)/ },
  { label: '.setState(', pattern: /\.setState\s*\(/ },
  { label: 'window.__* 访问', pattern: /\bwindow\.__[\w$]/ },
  { label: '浏览器存储写入', pattern: /\b(?:localStorage|sessionStorage)\.setItem\s*\(/ },
];
// 审查编号：S-H 规范硬违规、S-J 规范判断、P-M 缺失或部分实现、P-W 实现有误、P-X 范围蔓延
const FINDING_ID_PATTERN = /\[((?:S-[HJ]|P-[MWX])\d+)\]/g;
// 只判断是否含编号时用非全局版本，避免全局正则 test() 的 lastIndex 状态
const HAS_FINDING_ID = new RegExp(FINDING_ID_PATTERN.source);
const DEFAULT_FIX_PREFIXES = ['S-H', 'P-M', 'P-W'];
// QA 工作流依赖的流程技能；个人级同名且内容不同会让项目版失效
const WORKFLOW_SKILLS = new Set([
  'to-spec', 'to-tickets', 'implement', 'implement-spec', 'tdd', 'code-review', 'pr', 'retro',
  'handoff', 'grill-with-docs', 'diagnosing-bugs', 'improve-codebase-architecture', 'qa-test-planner',
]);
// 阶段 1–2 允许在建基线前写入的产物
const STAGE_ARTIFACT_PATTERN = /^(?:GLOSSARY\.md|CONTEXT\.md|docs\/adr\/.+)$/;
const BASELINE_HINT = '基线之前的执行不能作为本轮证据；建立基线后换新标签用 qa-run 重新运行，并更新证据路径。';

function result(status, issues = [], notes = []) {
  return { status, ok: status === 'PASS', issues, notes };
}

function issue(code, severity, message, hint) {
  return { code, severity, message, ...(hint ? { hint } : {}) };
}

/** 合并多组检查结果的 issues 与 notes，保持各组顺序 */
function mergeFindings(...parts) {
  return {
    issues: parts.flatMap((part) => part.issues),
    notes: parts.flatMap((part) => part.notes),
  };
}

function summarize(issues = [], notes = []) {
  const status = issues.some((item) => item.severity === 'FAIL')
    ? 'FAIL'
    : issues.some((item) => item.severity === 'BLOCKED')
      ? 'BLOCKED'
      : 'PASS';
  return result(status, issues, notes);
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

/**
 * 读取 spec 的 `## 交付命令`：取该段第一个围栏代码块中的非空行作为命令。
 * 没有该段或代码块中没有命令时返回 null。
 */
function parseSpecCommands(markdown) {
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

export function splitMarkdownRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
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

  for (const line of markdown.split(/\r?\n/)) {
    const caseHeading = line.match(/^###\s+(TC\d+)\b/);
    if (caseHeading) {
      currentCase = { id: caseHeading[1], priority: null, covers: [], seam: null, assertions: [] };
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
    cases,
    results,
    delivery,
    reproductions,
    planChanges: planChanges.join('\n'),
  };
}

function validatePlan(plan, specIds) {
  const issues = [];
  const notes = [];
  if (!['inline', 'independent'].includes(plan.mode)) {
    issues.push(issue('INVALID_QA_MODE', 'FAIL', 'QA Mode 必须是 inline 或 independent'));
  }
  if (!['feature', 'fix'].includes(plan.kind)) {
    issues.push(issue('INVALID_QA_KIND', 'FAIL', `QA Kind 必须是 feature 或 fix，当前为 ${plan.kind}`));
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

/**
 * 核对 spec 声明的交付命令是否原样进入计划；缺少声明时规划阶段不通过，其余阶段只提示。
 */
function specCommandIssues(plan, commands, phase) {
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

async function gitRoot(directory) {
  const result = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return realpath(result.stdout.trim());
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
 * 输出只列技能名，不输出个人技能内容。
 */
async function skillShadowIssues(featureDir) {
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
          '把个人级技能目录（设置 CLAUDE_CONFIG_DIR 时为其下的 skills，否则为 ~/.claude/skills）中的同名技能移走或改名后重新运行；不要修改项目技能去迁就个人版本。',
        ));
      } else {
        sharedNames.add(workflowName ?? collided[0]);
      }
    }
  }
  const notes = sharedNames.size
    ? [`个人级技能与项目技能同名：${[...sharedNames].sort().join('、')}；Claude Code 中个人级优先，请确认个人版是期望使用的版本。`]
    : [];
  return { issues, notes };
}

/** 从 argv 中提取可能的文件路径：整个参数、按空白与引号等拆出的片段，以及 file:// URL */
function argvPathCandidates(argv) {
  const candidates = new Set();
  for (const argument of argv) {
    for (const piece of [argument, ...argument.split(/[\s'"`()[\]{},;=]+/)]) {
      if (!piece) continue;
      if (piece.startsWith('file://')) {
        try {
          candidates.add(fileURLToPath(piece));
        } catch {
          // 无法解析的 file URL 不算路径
        }
      } else {
        candidates.add(piece);
      }
    }
  }
  return [...candidates];
}

/** 把日志 argv 中的路径候选解析为真实存在的文件绝对路径（跟随符号链接），按出现顺序去重 */
async function argvExistingFiles(log, bases) {
  const files = [];
  for (const candidate of argvPathCandidates(log.argv ?? [])) {
    const absolutes = path.isAbsolute(candidate) ? [candidate] : bases.map((base) => path.resolve(base, candidate));
    for (const absolute of absolutes) {
      try {
        if (!(await stat(absolute)).isFile()) continue;
        const resolved = await realpath(absolute);
        if (!files.includes(resolved)) files.push(resolved);
        break;
      } catch {
        // 不存在的候选不是文件路径
      }
    }
  }
  return files;
}

/** 返回日志 argv 引用的、位于特性目录 scripts/ 内的过程脚本相对路径 */
async function referencedProcessScripts(featureDir, logs, root) {
  const featureRoot = await realpath(featureDir);
  const scripts = new Set();
  for (const log of logs) {
    const bases = root ? [path.resolve(root, log.cwd ?? '.')] : [];
    for (const file of await argvExistingFiles(log, bases)) {
      if (!SCRIPT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
      const location = evidenceLocation(featureRoot, file);
      if (location && location.relative.split('/')[0] === SCRIPTS_DIR) scripts.add(location.relative);
    }
  }
  return [...scripts];
}

/** 日志开始时间早于开工基线时返回 true；任一时间无法解析时不判定 */
function startedBeforeBaseline(log, scope) {
  const createdAt = Date.parse(scope?.createdAt ?? '');
  const started = Date.parse(log?.started ?? '');
  return Number.isFinite(createdAt) && Number.isFinite(started) && started < createdAt;
}

async function featureContext(featureDir) {
  let scope;
  try {
    scope = await readScope(featureDir);
  } catch (error) {
    if (error.code === 'ENOENT') return { scope: null, root: null, tree: null };
    throw error;
  }
  const root = await gitRoot(featureDir);
  if (!root) throw new Error(`无法定位特性目录所在仓库；存在 ${QA_DIR}/scope.json 时特性目录必须位于 git 仓库内`);
  return { scope, root, tree: await computeTreeDigest(root, scope.scopes) };
}

function evidenceReferences(text) {
  const paths = [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter(Boolean);
  const remainder = text.replace(/`[^`]+`/g, '');
  const valid = paths.length > 0 && /^[\s,，、;；&+]*$/.test(remainder);
  return { paths, valid };
}

function evidenceLocation(featureDir, reference) {
  const root = path.resolve(featureDir);
  const absolute = path.resolve(root, reference);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return { absolute, relative: relative.split(path.sep).join('/') };
}

function completeRunLog(log) {
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

async function validateEvidence(featureDir, row) {
  const issues = [];
  const entries = [];
  const references = evidenceReferences(row.evidence);
  if (!references.valid) {
    issues.push(issue(
      'INVALID_EVIDENCE',
      'FAIL',
      `${row.caseId} / ${row.assertion} 的证据格无效：没有反引号文件路径，或含有路径以外的文字。`,
      '证据格只能写特性目录内的文件路径（反引号）。命令请用 node tooling/scripts/qa-run.mjs .scratch/<特性> <标签> -- <命令> 真实执行后引用生成的日志；说明写在备注列。',
    ));
    return { issues, entries };
  }

  for (const reference of references.paths) {
    const location = evidenceLocation(featureDir, reference);
    if (!location) {
      issues.push(issue('EVIDENCE_OUT_OF_SCOPE', 'FAIL', `${row.caseId} / ${row.assertion} 的证据越出特性目录：${reference}`));
      continue;
    }
    const extension = path.posix.extname(location.relative).toLowerCase();
    const entry = { path: location.relative, image: IMAGE_EXTENSIONS.has(extension), log: null };
    entries.push(entry);
    let info;
    try {
      info = await stat(location.absolute);
    } catch {
      issues.push(issue('MISSING_EVIDENCE', 'FAIL', `${row.caseId} / ${row.assertion} 的证据不存在：${location.relative}`));
      continue;
    }
    if (!info.isFile() || info.size === 0) {
      issues.push(issue('EMPTY_EVIDENCE', 'FAIL', `${row.caseId} / ${row.assertion} 的证据为空：${location.relative}`));
      continue;
    }
    if (extension !== '.log') continue;
    const log = parseRunLog(await readFile(location.absolute, 'utf8'));
    if (!completeRunLog(log)) {
      issues.push(issue('INVALID_RUN_LOG', 'FAIL', `${row.caseId} / ${row.assertion} 的日志不是完整 qa-run 日志：${location.relative}；请通过 qa:run 真实执行生成`));
      continue;
    }
    entry.log = log;
    if (log.exit !== 0) {
      issues.push(issue('EVIDENCE_EXIT_NONZERO', 'FAIL', `${row.caseId} / ${row.assertion} 的 PASS 证据日志退出码为 ${log.exit}：${location.relative}；请修复后重新执行`));
    }
  }
  return { issues, entries };
}

function normalizeAssertion(text) {
  return text.trim().replace(/\s+/g, ' ');
}

function planChangeRecorded(plan, token) {
  if (token === '交付验证') return plan.planChanges.includes('交付验证');
  return new RegExp(`\\b${token}\\b`).test(plan.planChanges);
}

async function frozenPlanIssues(featureDir, plan, hasScope) {
  const issues = [];
  const notes = [];
  let frozenText;
  try {
    frozenText = await readFile(path.join(featureDir, QA_DIR, 'prechange', 'qa-plan.md'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (hasScope) notes.push(`存在 ${QA_DIR}/scope.json，但没有 ${QA_DIR}/prechange/qa-plan.md；本次无法核对计划冻结变化。`);
    return { issues, notes, frozen: null };
  }
  const frozen = parsePlan(frozenText);
  if (frozen.schema !== CURRENT_SCHEMA) return { issues, notes, frozen: null };

  const executed = frozen.results.filter((row) => row.status === 'PASS' || row.status === 'FAIL');
  if (executed.length) {
    issues.push(issue(
      'PLAN_FROZEN_AFTER_EXECUTION',
      'FAIL',
      `开工时冻结的计划已有 ${executed.length} 条 PASS/FAIL 执行结果，基线与计划冻结晚于验收执行。`,
      `计划应在规划收口、执行任何验收之前通过 init 冻结；不要修改 ${QA_DIR}/ 下的文件，在 review-report 的 ## 范围说明 如实说明，由人工终审决定。`,
    ));
  }

  const record = (token, description) => {
    if (planChangeRecorded(plan, token)) return;
    issues.push(issue(
      'UNRECORDED_PLAN_CHANGE',
      'FAIL',
      `${description}。`,
      '若计划确需调整，在 ## 计划变更 写明对应 TC 或交付验证的原因供审查复核；若是为了迁就实现而改弱断言，请恢复原断言并如实记录 FAIL/BLOCKED。',
    ));
  };
  const currentCases = new Map(plan.cases.map((testCase) => [testCase.id, testCase]));
  for (const frozenCase of frozen.cases) {
    const current = currentCases.get(frozenCase.id);
    if (!current) {
      record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：TC 已删除`);
      continue;
    }
    if (current.seam !== frozenCase.seam) {
      record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：Seam 从 ${frozenCase.seam} 改为 ${current.seam}`);
    }
    for (const us of new Set(frozenCase.covers)) {
      if (!current.covers.includes(us)) {
        record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：Covers 丢失 US ${us}`);
      }
    }
    for (let index = 0; index < frozenCase.assertions.length; index += 1) {
      const before = frozenCase.assertions[index];
      const after = current.assertions[index];
      if (!after) {
        record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：断言 ${index + 1} 已缺失`);
      } else if (normalizeAssertion(after.text) !== normalizeAssertion(before.text)) {
        record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：断言 ${index + 1} 文本已改变`);
      }
    }
  }

  const remainingCommands = plan.delivery.map((item) => item.command);
  for (const item of frozen.delivery) {
    const index = remainingCommands.indexOf(item.command);
    if (index >= 0) remainingCommands.splice(index, 1);
    else record('交付验证', `交付验证与开工时冻结的计划不一致：命令已删除或修改：${item.command}`);
  }
  return { issues, notes, frozen };
}

async function reproductionLog(featureDir, reproduction) {
  const references = evidenceReferences(reproduction.evidence);
  if (!references.valid || references.paths.length !== 1) {
    return {
      log: null,
      issues: [issue(
        'INVALID_EVIDENCE',
        'FAIL',
        `${reproduction.caseId} 的修复前复现必须引用一个 qa-run 日志路径`,
        '请在特性目录内通过 qa:run 真实执行修复前命令，并用一个反引号路径引用生成的日志。',
      )],
    };
  }
  const location = evidenceLocation(featureDir, references.paths[0]);
  if (!location) {
    return {
      log: null,
      issues: [issue('EVIDENCE_OUT_OF_SCOPE', 'FAIL', `${reproduction.caseId} 的修复前复现证据越出特性目录`)],
    };
  }
  try {
    const info = await stat(location.absolute);
    if (!info.isFile() || info.size === 0) {
      return { log: null, issues: [issue('EMPTY_EVIDENCE', 'FAIL', `${reproduction.caseId} 的修复前复现证据为空`)] };
    }
  } catch {
    return { log: null, issues: [issue('MISSING_EVIDENCE', 'FAIL', `${reproduction.caseId} 的修复前复现证据不存在：${location.relative}`)] };
  }
  const log = parseRunLog(await readFile(location.absolute, 'utf8'));
  if (path.posix.extname(location.relative).toLowerCase() !== '.log' || !completeRunLog(log)) {
    return { log: null, issues: [issue('INVALID_RUN_LOG', 'FAIL', `${reproduction.caseId} 的修复前复现必须是完整 qa-run 日志：${location.relative}`)] };
  }
  return { log, issues: [] };
}

/** 转义正则特殊字符 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * browser/api 的 PASS 行：引用日志须含该断言的 `[TC01-1] PASS 实测：<值>` 标记，且不得出现 FAIL 标记。
 * values 记录各断言的实测值，供对账表使用。
 */
function assertionMarkerIssues(passRows) {
  const issues = [];
  const values = new Map();
  for (const { row, testCase, logs } of passRows) {
    if (!SCRIPTED_SEAMS.has(testCase.seam)) continue;
    const tag = escapeRegExp(`[${row.caseId}-${row.assertion}]`);
    const body = logs.map((log) => log.body ?? '').join('\n');
    if (new RegExp(`${tag}\\s*FAIL\\b`).test(body)) {
      issues.push(issue(
        'ASSERTION_MARKER_CONFLICT',
        'FAIL',
        `${row.caseId} / ${row.assertion} 记为 PASS，但引用日志中出现该断言的 FAIL 标记。`,
        '以日志为准把该行改为 FAIL，修复后换新标签用 qa-run 重新运行；不要改写日志或删除 FAIL 标记。',
      ));
      continue;
    }
    const observed = [...body.matchAll(new RegExp(`${tag}\\s*PASS\\s+实测[：:][ \\t]*(.*)$`, 'gm'))]
      .map((match) => match[1].trim())
      .filter(Boolean);
    if (!observed.length) {
      issues.push(issue(
        'ASSERTION_MARKER_MISSING',
        'FAIL',
        `${row.caseId} / ${row.assertion} 的引用日志中没有 [${row.caseId}-${row.assertion}] PASS 实测：<观察值> 标记，或实测值为空。`,
        '过程脚本须在该断言的硬断言通过后输出 [TC<id>-<序号>] PASS 实测：<观察值>，失败时输出 [TC<id>-<序号>] FAIL <原因> 并非零退出；补上后换新标签重新运行。',
      ));
      continue;
    }
    values.set(`${row.caseId}:${row.assertion}`, observed.join('；'));
  }
  return { issues, values };
}

/** 规范化测试标题：去掉各类引号、合并连续空白，用于源码子串匹配 */
function normalizeTitle(text) {
  return text.replace(/[`'"‘’“”]/g, '').replace(/\s+/g, ' ').trim();
}

/** 解析绑定格 `` `<测试文件>` › <用例标题> `` */
function parseBinding(text) {
  const match = text.trim().match(/^`([^`]+)`\s*›\s*(.+)$/);
  return match ? { file: match[1].trim(), title: match[2].trim() } : null;
}

const TEST_FILE_PATTERN = /(?:\.(?:test|spec)\.[cm]?[jt]sx?|_test\.py|(?:^|\/)test_[^/]+\.py)$/;

/** 向上查找含 package.json 的目录，找不到时返回仓库根 */
async function packageDirectory(start, root) {
  let current = start;
  for (;;) {
    try {
      await stat(path.join(current, 'package.json'));
      return current;
    } catch {
      // 继续向上查找
    }
    const parent = path.dirname(current);
    if (current === root || parent === current) return root;
    current = parent;
  }
}

/** 绑定文件（仓库相对路径）是否被 argv 中点名的测试文件或 glob 覆盖 */
function bindingNamedBy(relative, named) {
  return named.some((candidate) => {
    const pattern = candidate.split(path.sep).join('/').replace(/^\.\//, '');
    return relative === pattern
      || relative.endsWith(`/${pattern}`)
      || path.posix.matchesGlob(relative, pattern)
      || path.posix.matchesGlob(relative, `**/${pattern}`);
  });
}

/**
 * unit/integration 的 PASS 行须绑定到真实存在的测试文件与标题，且该文件在证据命令的运行范围内。
 * 命令点名测试文件时绑定文件须在其中；未点名时须位于命令所属包目录内。
 */
async function testBindingIssues(passRows, root, featureDir) {
  const issues = [];
  // 绑定文件相对仓库根；不在仓库内时（仅测试夹具）相对特性目录
  const base = root ?? path.resolve(featureDir);
  const sources = new Map();
  for (const { row, testCase, logs } of passRows) {
    if (!BOUND_SEAMS.has(testCase.seam)) continue;
    const label = `${row.caseId} / ${row.assertion}`;
    const binding = parseBinding(row.binding);
    const missing = (reason) => issues.push(issue(
      'TEST_BINDING_MISSING',
      'FAIL',
      `${label} 的用例绑定无效：${reason}。`,
      '在执行记录的「绑定」列写 `<测试文件>` › <用例标题>（文件相对仓库根，标题取源码中的叶子标题）；只改绑定列不需要重跑证据命令。',
    ));
    if (!binding) {
      missing(row.binding ? `格式应为 \`<测试文件>\` › <用例标题>，当前为 ${row.binding}` : '绑定列为空');
      continue;
    }
    const absolute = path.resolve(base, binding.file);
    if (!sources.has(absolute)) {
      sources.set(absolute, await readFile(absolute, 'utf8').then(normalizeTitle, () => null));
    }
    const source = sources.get(absolute);
    if (source === null) {
      missing(`测试文件不存在：${binding.file}`);
      continue;
    }
    if (!source.includes(normalizeTitle(binding.title))) {
      missing(`${binding.file} 中找不到标题「${binding.title}」`);
      continue;
    }
    const relative = path.relative(base, absolute).split(path.sep).join('/');
    let covered = false;
    for (const log of logs) {
      const named = argvPathCandidates(log.argv ?? []).filter((candidate) => TEST_FILE_PATTERN.test(candidate) || candidate.includes('*'));
      if (named.length) {
        if (bindingNamedBy(relative, named)) covered = true;
      } else {
        const packageDir = await packageDirectory(path.resolve(base, log.cwd ?? '.'), base);
        const inside = path.relative(packageDir, absolute);
        if (!inside.startsWith('..') && !path.isAbsolute(inside)) covered = true;
      }
      if (covered) break;
    }
    if (!covered) {
      issues.push(issue(
        'TEST_BINDING_OUT_OF_RUN',
        'FAIL',
        `${label} 绑定的 ${binding.file} 不在证据命令的运行范围内。`,
        '证据命令点名测试文件时须包含绑定文件；未点名时绑定文件须位于命令所属包目录内。请改正绑定，或换新标签用覆盖该文件的命令重新运行。',
      ));
    }
  }
  return issues;
}

/** 递归列出目录下的脚本文件（不跟随符号链接目录），返回相对特性目录的路径 */
async function listScripts(featureDir, relative = SCRIPTS_DIR) {
  let entries;
  try {
    entries = await readdir(path.join(featureDir, relative), { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return listScripts(featureDir, child);
    return entry.isFile() && SCRIPT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [child] : [];
  }));
  return nested.flat();
}

/** 取 import/require 所在行中的全部字符串字面量作为模块说明符 */
function importedSpecifiers(text) {
  return text.split(/\r?\n/)
    .filter((line) => /\b(?:import|require)\b|\bfrom\s*['"`]/.test(line))
    .flatMap((line) => [...line.matchAll(/(['"`])([^'"`\n]+)\1/g)].map((match) => match[2]));
}

function dataStoreModule(specifier) {
  const normalized = specifier.replace(/^node:/, '');
  return DATA_STORE_MODULES.find((name) => normalized === name
    || normalized.startsWith(`${name}/`)
    || new RegExp(`(?:^|/)node_modules/${escapeRegExp(name)}(?:/|$)`).test(normalized));
}

/**
 * 从入口之后截取页面内代码片段：跟踪 ( [ { 嵌套，遇到闭合外层调用或对象的括号、或顶层分号时结束。
 * 括号调用入口截到配对的右括号；CDP 方法名入口截到所在调用参数或对象字面量结束，可跨行。
 */
function inPageSegment(text, start) {
  let level = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(' || char === '[' || char === '{') level += 1;
    else if (char === ')' || char === ']' || char === '}') {
      level -= 1;
      if (level < 0) return text.slice(start, index);
    } else if (char === ';' && level === 0) return text.slice(start, index);
  }
  return text.slice(start);
}

function inPageSegments(text) {
  return [...text.matchAll(IN_PAGE_ENTRY)].map((match) => inPageSegment(text, match.index + match[0].length));
}

/**
 * 扫描 scripts/ 下全部脚本：绕过真实登录（注入 Cookie、写令牌、脚本内登录、直连数据存储）为不可豁免的 FAIL；
 * 页面内合成输入与直接改写应用状态只提示，并在对账表标注「非真实输入」。
 */
async function scanProcessScripts(featureDir) {
  const issues = [];
  const notes = [];
  const synthetic = new Set();
  for (const relative of await listScripts(featureDir)) {
    const text = await readFile(path.join(featureDir, relative), 'utf8');
    const hits = AUTH_BYPASS_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.label);
    const modules = [...new Set(importedSpecifiers(text).map(dataStoreModule).filter(Boolean))];
    hits.push(...modules.map((name) => `引入数据存储模块 ${name}`));
    const python = text.match(PYTHON_DATA_STORE_IMPORT);
    if (python) hits.push(`引入数据存储模块 ${python[1]}`);
    if (hits.length) {
      issues.push(issue(
        'AUTH_BYPASS_IN_SCRIPT',
        'FAIL',
        `${relative} 命中绕过真实登录、脚本内登录或直连数据存储的模式：${hits.join('、')}。`,
        '脚本应从已登录状态开始；未登录时请提示用户在可见窗口登录，或使用用户提供的测试账号在真实登录页登录一次。脚本内不得出现密码、登录注册接口或登录后门，不得注入 Cookie、写令牌或直连数据库。该检查不可豁免，计划变更或备注不能消除。',
      ));
    }
    const segments = inPageSegments(text);
    const labels = SYNTHETIC_INPUT_PATTERNS
      .filter((item) => segments.some((segment) => item.pattern.test(segment)))
      .map((item) => item.label);
    if (labels.length) {
      synthetic.add(relative);
      notes.push(`SYNTHETIC_INPUT_IN_SCRIPT：${relative} 的页面内代码含 ${labels.join('、')}；引用该脚本的用例在对账表标注「非真实输入」，请人工终审确认是否满足真实输入要求。`);
    }
  }
  return { issues, notes, synthetic };
}

function tableCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
}

/** 对账表：每个通过接缝证据检查的 PASS 断言一行，冻结断言原文对照实测值或绑定 */
function reconciliationTable(passRows, frozenPlan, markerValues, caseScripts, synthetic) {
  const frozenText = new Map(frozenPlan.cases.flatMap((testCase) => testCase.assertions
    .map((assertion) => [`${testCase.id}:${assertion.number}`, assertion.text])));
  return passRows.map(({ row, testCase }) => {
    const key = `${row.caseId}:${row.assertion}`;
    const actual = SCRIPTED_SEAMS.has(testCase.seam)
      ? markerValues.get(key) ?? '（无实测标记）'
      : BOUND_SEAMS.has(testCase.seam) ? row.binding || '（无绑定）' : row.evidence;
    const flagged = (caseScripts.get(row.caseId) ?? []).some((script) => synthetic.has(script));
    return {
      id: `${row.caseId}-${row.assertion}`,
      assertion: frozenText.get(key) ?? testCase.assertions.find((item) => item.number === row.assertion)?.text ?? '',
      actual,
      flag: flagged ? '非真实输入' : '',
    };
  });
}

async function checkAcceptance(featureDir, plan, context) {
  const issues = [];
  const notes = [];
  const rows = new Map();
  const evidenceByRow = new Map();
  // 按 TC 汇总 browser/api PASS 行的日志，判定过程脚本位置
  const scriptedLogs = new Map();
  // 通过接缝证据检查的 PASS 行及其 exit 0 日志，供断言标记、用例绑定与对账表使用
  const passRows = [];
  const expectedKeys = new Set(
    plan.cases.flatMap((testCase) => testCase.assertions.map((assertion) => `${testCase.id}:${assertion.number}`)),
  );
  for (const row of plan.results) {
    const key = `${row.caseId}:${row.assertion}`;
    if (!expectedKeys.has(key)) {
      issues.push(issue('UNKNOWN_RESULT', 'FAIL', `${row.caseId} / ${row.assertion} 不在计划断言中`));
    }
    if (rows.has(key)) issues.push(issue('DUPLICATE_RESULT', 'FAIL', `${row.caseId} / ${row.assertion} 有重复结果`));
    rows.set(key, row);
  }
  for (const testCase of plan.cases) {
    for (const assertion of testCase.assertions) {
      if (!rows.has(`${testCase.id}:${assertion.number}`)) {
        issues.push(issue('MISSING_RESULT', 'BLOCKED', `${testCase.id} / ${assertion.number} 缺少执行结果；请真实执行后填写，不要预先标记 PASS`));
      }
    }
  }

  const caseById = new Map(plan.cases.map((testCase) => [testCase.id, testCase]));
  for (const row of rows.values()) {
    if (row.status === 'FAIL') {
      issues.push(issue('ASSERTION_FAILED', 'FAIL', `${row.caseId} / ${row.assertion} 失败：${row.evidence} ${row.detail}`.trim()));
      continue;
    }
    if (row.status === 'BLOCKED') {
      issues.push(issue('ASSERTION_BLOCKED', 'BLOCKED', `${row.caseId} / ${row.assertion} 阻塞：${row.evidence} ${row.detail}`.trim()));
      continue;
    }
    const checked = await validateEvidence(featureDir, row);
    issues.push(...checked.issues);
    evidenceByRow.set(row, checked.entries);
    const testCase = caseById.get(row.caseId);
    if (!testCase) continue;
    const images = checked.entries.filter((entry) => entry.image);
    const goodLogs = checked.entries.filter((entry) => entry.log?.exit === 0);
    const mismatch = testCase.seam === 'browser' ? !images.length || !goodLogs.length : !goodLogs.length;
    if (!mismatch) passRows.push({ row, testCase, logs: goodLogs.map((entry) => entry.log) });
    if (SCRIPTED_SEAMS.has(testCase.seam) && !mismatch) {
      if (!scriptedLogs.has(row.caseId)) scriptedLogs.set(row.caseId, { seam: testCase.seam, logs: [], assertions: [] });
      const collected = scriptedLogs.get(row.caseId);
      collected.logs.push(...goodLogs.map((entry) => entry.log));
      collected.assertions.push(row.assertion);
    }
    if (mismatch) {
      const message = testCase.seam === 'browser'
        ? `${row.caseId} / ${row.assertion} 声明 Seam: browser，缺少截图或 exit 0 的 qa-run 日志`
        : `${row.caseId} / ${row.assertion} 声明 Seam: ${testCase.seam}，缺少 exit 0 的 qa-run 日志`;
      issues.push(issue(
        'SEAM_EVIDENCE_MISMATCH',
        'FAIL',
        message,
        'PASS 证据须满足声明接缝：browser 需要该场景截图和浏览器脚本的 qa-run 日志（exit 0），其他接缝需要至少一个 exit 0 的 qa-run 日志；单元测试或命令输出不能替代浏览器验收。若确应调整接缝，先在 ## 计划变更 说明再改 Seam。',
      ));
    }
  }

  const screenshots = new Map();
  for (const [row, entries] of evidenceByRow) {
    // _qa/debug/ 下的调试截图不是验收证据，不参与唯一性检查
    for (const entry of entries.filter((item) => item.image && !item.path.startsWith(DEBUG_DIR))) {
      if (!screenshots.has(entry.path)) screenshots.set(entry.path, new Set());
      screenshots.get(entry.path).add(row.caseId);
    }
  }
  for (const [relative, caseIds] of screenshots) {
    if (caseIds.size < 2) continue;
    const ids = [...caseIds].sort().join('、');
    issues.push(issue(
      'SHARED_SCREENSHOT',
      'FAIL',
      `${relative} 同时被 ${ids} 引用。`,
      '每个用例需要在自己的场景中截取独立截图；复制或改名同一张图视为伪造证据。',
    ));
  }

  // 仓库根用于解析日志 argv 与绑定中的相对路径
  const root = passRows.length ? context.root ?? await gitRoot(featureDir) : null;
  const scriptedCases = [...scriptedLogs];
  // 各 TC 的过程脚本检查互不依赖，并发执行；问题仍按 TC 顺序输出
  const caseScripts = new Map();
  const referenced = await Promise.all(
    scriptedCases.map(([, collected]) => referencedProcessScripts(featureDir, collected.logs, root)),
  );
  scriptedCases.forEach(([caseId, collected], index) => {
    caseScripts.set(caseId, referenced[index]);
    if (referenced[index].length) return;
    issues.push(issue(
      'PROCESS_SCRIPT_OUTSIDE_SCRIPTS',
      'FAIL',
      `${caseId} / ${collected.assertions.join('、')} 的 ${collected.seam} 证据日志都没有引用特性目录 ${SCRIPTS_DIR}/ 内存在的过程脚本。`,
      `把 browser/api 过程脚本放在特性目录的 ${SCRIPTS_DIR}/ 下，并通过 qa-run 以该脚本路径运行；只接受 ${[...SCRIPT_EXTENSIONS].join('、')} 脚本。`,
    ));
  });

  const markers = assertionMarkerIssues(passRows);
  issues.push(...markers.issues);
  const bindings = await testBindingIssues(passRows, root, featureDir);
  issues.push(...bindings);
  const scan = await scanProcessScripts(featureDir);
  issues.push(...scan.issues);
  notes.push(...scan.notes);

  const earlyLogs = new Map();
  for (const [row, entries] of evidenceByRow) {
    for (const entry of entries) {
      if (!startedBeforeBaseline(entry.log, context.scope)) continue;
      if (!earlyLogs.has(entry.path)) earlyLogs.set(entry.path, { started: entry.log.started, rows: [] });
      earlyLogs.get(entry.path).rows.push(`${row.caseId} / ${row.assertion}`);
    }
  }
  for (const [relative, item] of earlyLogs) {
    issues.push(issue(
      'EVIDENCE_BEFORE_BASELINE',
      'FAIL',
      `${relative} 的开始时间 ${item.started} 早于开工基线 ${context.scope.createdAt}，被 ${item.rows.join('、')} 引用。`,
      BASELINE_HINT,
    ));
  }

  const frozen = await frozenPlanIssues(featureDir, plan, Boolean(context.scope));
  issues.push(...frozen.issues);
  notes.push(...frozen.notes);
  const table = reconciliationTable(passRows, frozen.frozen ?? plan, markers.values, caseScripts, scan.synthetic);

  if (plan.kind === 'fix') {
    const reproductionByCase = new Map(plan.reproductions.map((item) => [item.caseId, item]));
    for (const testCase of plan.cases) {
      const reproduction = reproductionByCase.get(testCase.id);
      if (!reproduction) {
        issues.push(issue('MISSING_REPRODUCTION', 'BLOCKED', `${testCase.id} 缺少 ## 修复前复现 行；请先用同一命令保存修复前的红灯日志`));
        continue;
      }
      const checked = await reproductionLog(featureDir, reproduction);
      issues.push(...checked.issues);
      if (!checked.log) continue;
      if (checked.log.exit === 0) {
        issues.push(issue('REPRODUCTION_NOT_RED', 'FAIL', `${testCase.id} 的修复前复现日志 exit 为 0，不能证明修复前测试为红灯`));
      }
      const greenLogs = plan.results
        .filter((row) => row.caseId === testCase.id && row.status === 'PASS')
        .flatMap((row) => evidenceByRow.get(row) ?? [])
        .map((entry) => entry.log)
        .filter((log) => log?.exit === 0 && JSON.stringify(log.argv) === JSON.stringify(checked.log.argv));
      if (!greenLogs.length) {
        issues.push(issue('REPRODUCTION_SOURCE_MISMATCH', 'FAIL', `${testCase.id} 的复现日志与通过日志 argv 不一致；请用同一命令分别保存红、绿日志`));
        continue;
      }
      for (const green of greenLogs) {
        if (!(checked.log.started < green.started)) {
          issues.push(issue('REPRODUCTION_ORDER', 'FAIL', `${testCase.id} 的复现日志开始时间不早于对应通过日志；请保留真实的时间顺序`));
        }
        if (checked.log.tree !== 'none' && green.tree !== 'none' && checked.log.tree === green.tree) {
          issues.push(issue('REPRODUCTION_SAME_TREE', 'FAIL', `${testCase.id} 的复现与通过日志对应相同 tree；请在修复前后的不同代码上分别运行`));
        }
      }
    }
  }

  if (context.tree) {
    const staleCases = new Set();
    for (const [row, entries] of evidenceByRow) {
      if (entries.some((entry) => entry.log && entry.log.tree !== context.tree)) staleCases.add(row.caseId);
    }
    if (staleCases.size) {
      notes.push(`${[...staleCases].sort().join('、')} 的证据日志 tree 与当前代码不一致；核心行为改动后需重跑。`);
    }
  }
  return { ...summarize(issues, notes), table };
}

function markdownSection(markdown, headingPattern) {
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

/** 解析 ## 三档分流 表格：按表头定位编号、档位、最终状态、验证证据与理由列 */
function parseTriage(reportText) {
  const body = markdownSection(reportText, /^## 三档分流\s*$/);
  if (body === null) return null;
  const lines = body.split(/\r?\n/);
  const rows = [];
  let evidenceColumn = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes('|')) continue;
    const headers = splitMarkdownRow(lines[index]);
    const column = (name) => headers.findIndex((cell) => cell.includes(name));
    const tierIndex = column('档位');
    if (tierIndex < 0) continue;
    const idIndex = column('编号');
    const finalIndex = column('最终状态');
    const reasonIndex = column('理由');
    const evidenceIndex = column('验证证据');
    if (evidenceIndex >= 0) evidenceColumn = true;
    let rowIndex = index + 1;
    for (; rowIndex < lines.length && lines[rowIndex].includes('|'); rowIndex += 1) {
      const cells = splitMarkdownRow(lines[rowIndex]);
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell.replaceAll(' ', '')))) continue;
      const cell = (position) => (position >= 0 ? cells[position]?.trim() ?? '' : '');
      rows.push({
        id: cell(idIndex).replace(/^\[|\]$/g, ''),
        tier: cell(tierIndex),
        final: cell(finalIndex),
        reason: cell(reasonIndex),
        evidence: cell(evidenceIndex),
      });
    }
    index = rowIndex - 1;
  }
  return { body, rows, evidenceColumn };
}

function triageIssues(triage) {
  if (triage === null || !triage.body.trim()) {
    return [issue('MISSING_TRIAGE', 'FAIL', 'review-report.md 缺少有效的 ## 三档分流；请给出本次修、转专项或驳回结论')];
  }
  if (!triage.rows.length) {
    return triage.body.includes('无发现')
      ? []
      : [issue('MISSING_TRIAGE', 'FAIL', '## 三档分流 没有数据行时必须明确写出“无发现”')];
  }
  return triage.rows.flatMap((row) => TRIAGE_VALUES.has(row.tier)
    ? []
    : [issue('INVALID_TRIAGE', 'FAIL', `三档分流的档位“${row.tier || '空'}”无效，只能是本次修、转专项或驳回`)]);
}

/** 列出 review/ 下的审查原文，按轮次分组：{ round: { standards, spec } } */
async function readReviewRounds(featureDir) {
  let entries;
  try {
    entries = await readdir(path.join(featureDir, REVIEW_DIR));
  } catch {
    return new Map();
  }
  const rounds = new Map();
  for (const entry of entries) {
    const match = entry.match(/^r(\d+)-(standards|spec-axis)\.md$/);
    if (!match) continue;
    const round = Number(match[1]);
    if (!rounds.has(round)) rounds.set(round, {});
    rounds.get(round)[match[2] === 'standards' ? 'standards' : 'spec'] = `${REVIEW_DIR}/${entry}`;
  }
  return rounds;
}

/**
 * 审查原文与分流表对账：最新一轮两轴原文须齐全且不早于当前 tree 的首次打包时间；原文中的每个编号须进入分流表；
 * 默认本次修的编号改档须写理由；本次修的条目最终未修或修错时阻塞交付。
 */
async function reviewRawIssues(featureDir, triage, packageTime) {
  const issues = [];
  const rounds = await readReviewRounds(featureDir);
  const latest = rounds.size ? Math.max(...rounds.keys()) : null;
  const latestFiles = latest === null ? null : rounds.get(latest);
  const rawHint = `在最新审查包（collect）之后用 Skill 工具调用 code-review 重新审查，由该技能把两轴子代理的返回逐字落盘到 ${REVIEW_DIR}/；不要用 Agent 工具自行派审查子代理，也不要由主 Agent 代写或改写原文。`;
  if (!latestFiles?.standards || !latestFiles?.spec) {
    const missing = latest === null
      ? `${REVIEW_DIR}/ 下没有审查原文`
      : `第 r${latest} 轮缺少 ${[!latestFiles.standards && 'standards', !latestFiles.spec && 'spec-axis'].filter(Boolean).join('、')} 原文`;
    issues.push(issue('REVIEW_RAW_MISSING', 'BLOCKED', `${missing}。`, rawHint));
  } else if (packageTime !== null) {
    const stale = [];
    for (const relative of [latestFiles.standards, latestFiles.spec]) {
      if ((await stat(path.join(featureDir, relative))).mtimeMs < packageTime) stale.push(relative);
    }
    if (stale.length) {
      issues.push(issue('REVIEW_RAW_MISSING', 'BLOCKED', `审查原文早于最新审查包：${stale.join('、')}。`, rawHint));
    }
  }

  // 最新一轮原文提取不到规范编号又没写「无发现」时，编号对账会静默失效
  if (latestFiles) {
    const unnumbered = [];
    for (const { relative, text } of await roundRaws(featureDir, latestFiles)) {
      if (!HAS_FINDING_ID.test(text) && !text.includes('无发现')) unnumbered.push(relative);
    }
    if (unnumbered.length) {
      issues.push(issue(
        'REVIEW_RAW_UNNUMBERED',
        'FAIL',
        `最新一轮审查原文没有规范编号，也没有写「无发现」：${unnumbered.join('、')}。`,
        '编号格式与落盘规则只在 code-review 技能内；collect 后用 Skill 工具调用 code-review 重新审查，不要用 Agent 工具自行派审查子代理。',
      ));
    }
  }

  const ids = new Set();
  for (const files of rounds.values()) {
    for (const { text } of await roundRaws(featureDir, files)) {
      for (const match of text.matchAll(FINDING_ID_PATTERN)) ids.add(match[1]);
    }
  }
  const rows = triage?.rows ?? [];
  const triaged = new Set(rows.map((row) => row.id));
  const untriaged = [...ids].filter((id) => !triaged.has(id)).sort();
  if (untriaged.length) {
    issues.push(issue(
      'FINDING_NOT_TRIAGED',
      'FAIL',
      `审查原文中的编号未进入 ## 三档分流：${untriaged.join('、')}。`,
      '分流表每行写一个编号（列：编号、档位、最终状态、轮次轨迹、理由）；原文编号以子代理落盘的原文为准，不要改写原文。',
    ));
  }
  const unexplained = rows
    .filter((row) => DEFAULT_FIX_PREFIXES.some((prefix) => row.id.startsWith(prefix)) && row.tier !== '本次修' && !row.reason)
    .map((row) => row.id);
  if (unexplained.length) {
    issues.push(issue(
      'DEFAULT_FIX_WITHOUT_REASON',
      'FAIL',
      `S-H、P-M、P-W 类发现默认本次修，以下编号改档但理由为空：${unexplained.join('、')}。`,
      '改为本次修，或在理由列写明转专项或驳回的依据（驳回须引 ADR 或契约）。',
    ));
  }
  // 分流表最终状态以原文最后一次状态词为准，防止表格掩盖复审结论
  const statuses = await rawStatuses(featureDir, rounds);
  const mismatched = rows
    .filter((row) => statuses.has(row.id) && row.final.match(/^(已修|未修|修错)/)?.[1] !== statuses.get(row.id))
    .map((row) => `${row.id}（原文${statuses.get(row.id)}，分流表${row.final || '未填'}）`);
  if (mismatched.length) {
    issues.push(issue(
      'UNRESOLVED_FINDINGS',
      'FAIL',
      `分流表最终状态与审查原文最后一次状态词不一致：${mismatched.join('、')}。`,
      '最终状态照抄原文状态词（已修、未修、修错；带限定语按未修）；未修或修错的改档由人工裁决。',
    ));
  }
  const unresolved = rows
    .filter((row) => row.tier === '本次修' && (!row.final || /未修|修错/.test(row.final)))
    .map((row) => `${row.id}（${row.final || '未填'}）`);
  if (unresolved.length) {
    issues.push(issue(
      'UNRESOLVED_FINDINGS',
      'BLOCKED',
      `本次修条目最终状态未达已修：${unresolved.join('、')}。`,
      '自动复审最多 2 轮（r2、r3）；用尽后停止自动修复，按分流表清单交人工裁决：改档并写理由、接受现状，或授权追加修复轮。',
    ));
  }
  issues.push(...await fixVerificationIssues(featureDir, rows, triage?.evidenceColumn, rounds));
  return { issues, latest: latestFiles };
}

/** 按复审轮次（r2 起）取每个编号最后一次的状态词；「已修」后带限定语（如「已修一半」）按未修 */
async function rawStatuses(featureDir, rounds) {
  const statuses = new Map();
  for (const round of [...rounds.keys()].filter((round) => round > 1).sort((a, b) => a - b)) {
    for (const { text } of await roundRaws(featureDir, rounds.get(round))) {
      for (const match of text.matchAll(/\[((?:S-[HJ]|P-[MWX])\d+)\]\s*((?:已修|未修|修错|修了)[^\n]*)/g)) {
        const clean = match[2].match(/^(已修|未修|修错)(?=[\s。.，,；;：:]|$)/);
        statuses.set(match[1], clean ? clean[1] : '未修');
      }
    }
  }
  return statuses;
}

/** 读取某一轮已存在的两轴原文 */
async function roundRaws(featureDir, files) {
  return Promise.all([files.standards, files.spec].filter(Boolean).map(async (relative) => {
    const absolute = path.join(featureDir, relative);
    const [text, info] = await Promise.all([readFile(absolute, 'utf8'), stat(absolute)]);
    return { relative, text, time: info.mtimeMs };
  }));
}

/** 每个编号首次出现的那一轮原文的修改时间 */
async function firstRaisedTimes(featureDir, rounds) {
  const times = new Map();
  for (const round of [...rounds.keys()].sort((a, b) => a - b)) {
    for (const { text, time } of await roundRaws(featureDir, rounds.get(round))) {
      for (const match of text.matchAll(FINDING_ID_PATTERN)) {
        if (!times.has(match[1])) times.set(match[1], time);
      }
    }
  }
  return times;
}

/** 单个验证证据引用的问题；合法时返回 null */
async function fixEvidenceProblem(featureDir, reference, raisedAt) {
  const location = evidenceLocation(featureDir, reference);
  if (!location || !/^(?:evidence|screenshots)\//.test(location.relative)) return `${reference} 不在特性目录 evidence/ 或 screenshots/ 下`;
  let info;
  try {
    info = await stat(location.absolute);
  } catch {
    return `${location.relative} 不存在`;
  }
  if (!info.isFile() || info.size === 0) return `${location.relative} 为空`;
  if (raisedAt !== undefined && info.mtimeMs <= raisedAt) return `${location.relative} 早于首次提出该编号的原文`;
  if (location.relative.startsWith('evidence/') && path.posix.extname(location.relative).toLowerCase() === '.log') {
    const log = parseRunLog(await readFile(location.absolute, 'utf8'));
    if (!completeRunLog(log)) return `${location.relative} 不是完整 qa-run 日志`;
    if (log.exit !== 0) return `${location.relative} 退出码为 ${log.exit}`;
  }
  return null;
}

/**
 * 修复验证：最终状态为「已修」的行须在「验证证据」列引用修复后产生的 evidence/ 或 screenshots/ 文件，
 * 或写「静态：<理由>」；证据能否证明修复由人工终审判断。
 */
async function fixVerificationIssues(featureDir, rows, evidenceColumn, rounds) {
  const fixed = rows.filter((row) => /^已修/.test(row.final));
  if (!fixed.length) return [];
  const hint = '「已修」行在验证证据列写修复后针对该点运行的证据（反引号包裹的 evidence/ 或 screenshots/ 路径，晚于首次提出该编号的原文；qa-run 日志须 exit 0），不涉及行为的修复写「静态：<理由>」。';
  if (!evidenceColumn) {
    return [issue('FIX_UNVERIFIED', 'FAIL', `## 三档分流 有已修条目但没有「验证证据」列：${fixed.map((row) => row.id).join('、')}。`, hint)];
  }
  const raised = await firstRaisedTimes(featureDir, rounds);
  const problems = [];
  for (const row of fixed) {
    const text = row.evidence.trim();
    const staticReason = text.match(/^静态[：:]\s*(.*)$/);
    if (staticReason) {
      if (!staticReason[1].trim()) problems.push(`${row.id}（静态理由为空）`);
      continue;
    }
    const references = evidenceReferences(text);
    if (!references.valid) {
      problems.push(`${row.id}（${text ? '验证证据不是反引号文件路径' : '验证证据为空'}）`);
      continue;
    }
    for (const reference of references.paths) {
      const problem = await fixEvidenceProblem(featureDir, reference, raised.get(row.id));
      if (problem) problems.push(`${row.id}（${problem}）`);
    }
  }
  return problems.length
    ? [issue('FIX_UNVERIFIED', 'FAIL', `已修条目缺少有效的修复后验证证据：${problems.join('、')}。`, hint)]
    : [];
}

/** 审查报告只强制审查方式与三档分流；两轴原文由 review/ 下的文件承载 */
function reviewReportIssues(reportText, triage) {
  const issues = [];
  const method = reportText.split(/\r?\n/).find((line) => /^审查方式[：:]/.test(line));
  if (!method || !method.replace(/^审查方式[：:]/, '').trim()) {
    issues.push(issue('MISSING_REVIEW_METHOD', 'FAIL', 'review-report.md 缺少“审查方式：”行；请写明独立审查者或审查会话'));
  } else if (method.includes('自查')) {
    issues.push(issue(
      'SELF_REVIEW',
      'BLOCKED',
      '审查方式为自查。',
      '中大型改动需要独立于实现者的 Standards 与 Spec 审查（子代理、独立会话或人工）；无法提供时保持 BLOCKED，由人工决定。',
    ));
  }
  issues.push(...triageIssues(triage));
  return issues;
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeModel(model) {
  return String(model).toLowerCase().replace(/\./g, '-');
}

/** 逐行解析 jsonl，跳过无法解析的行 */
async function readJsonl(file) {
  const text = await readFile(file, 'utf8').catch(() => '');
  return text.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assistantText(entry) {
  const content = entry?.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((part) => part?.type === 'text').map((part) => part.text ?? '').join('\n');
}

function toolUses(entry) {
  const content = entry?.message?.content;
  return Array.isArray(content) ? content.filter((part) => part?.type === 'tool_use') : [];
}

/** 子代理的全部输出片段：每条 assistant 文本，以及消息类工具调用的消息参数 */
function outputSegments(entries) {
  return entries.filter((entry) => entry?.type === 'assistant').flatMap((entry) => [
    assistantText(entry),
    ...toolUses(entry)
      .filter((part) => /message/i.test(part.name ?? '') && typeof part.input?.message === 'string')
      .map((part) => part.input.message),
  ]).map(normalizeWhitespace).filter(Boolean);
}

/** 主会话转录中是否有审查包之后的 code-review Skill 调用（技能名带插件前缀时按后缀匹配） */
async function codeReviewInvoked(sessionFiles, packageTime) {
  for (const file of sessionFiles) {
    if (packageTime !== null && (await stat(file)).mtimeMs < packageTime) continue;
    for (const entry of await readJsonl(file)) {
      const time = Date.parse(entry?.timestamp);
      if (packageTime !== null && !(time >= packageTime)) continue;
      if (toolUses(entry).some((part) => part.name === 'Skill' && /(?:^|:)code-review$/.test(String(part.input?.skill ?? '')))) return true;
    }
  }
  return false;
}

/**
 * 子代理转录交叉核验（只给 NOTE）：在宿主会话目录中找审查包之后的子代理转录，
 * 核对原文是否出现在某个子代理的输出中、子代理模型是否与主会话一致，以及主会话是否调用了 code-review 技能。
 * 宿主转录格式不是公开契约，找不到会话目录时静默跳过。
 */
async function transcriptNotes(root, latestFiles, featureDir, packageTime) {
  if (!root || !latestFiles?.standards || !latestFiles?.spec) return [];
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(homedir(), '.claude');
  const projectDir = path.join(configDir, 'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
  let sessions;
  try {
    sessions = await readdir(projectDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const notes = [];
  const sessionFiles = sessions
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(projectDir, entry.name));
  if (!await codeReviewInvoked(sessionFiles, packageTime)) {
    notes.push('转录核验：最新审查包之后的主会话转录中没有 code-review 的 Skill 调用；审查应在 collect 后用 Skill 工具调用 code-review，请人工确认审查来源。');
  }
  const transcripts = [];
  for (const session of sessions.filter((entry) => entry.isDirectory())) {
    const subagentDir = path.join(projectDir, session.name, 'subagents');
    let files;
    try {
      files = await readdir(subagentDir);
    } catch {
      continue;
    }
    for (const file of files.filter((name) => name.endsWith('.jsonl'))) {
      const absolute = path.join(subagentDir, file);
      if (packageTime !== null && (await stat(absolute)).mtimeMs < packageTime) continue;
      const entries = await readJsonl(absolute);
      const last = entries.filter((entry) => entry?.type === 'assistant' && entry.message?.model).at(-1);
      const meta = await readFile(absolute.replace(/\.jsonl$/, '.meta.json'), 'utf8').then(JSON.parse, () => ({}));
      transcripts.push({
        path: absolute,
        session: path.join(projectDir, `${session.name}.jsonl`),
        segments: outputSegments(entries),
        model: last?.message?.model ?? meta.model ?? null,
      });
    }
  }
  if (!transcripts.length) {
    notes.push('转录核验：最新一轮原文没有对应的子代理转录（审查包之后没有任何子代理转录）；请人工确认原文不是主 Agent 代写。');
    return notes;
  }

  const sessionModels = new Map();
  const unmatched = [];
  for (const relative of [latestFiles.standards, latestFiles.spec]) {
    const raw = normalizeWhitespace(await readFile(path.join(featureDir, relative), 'utf8'));
    const matched = transcripts.find((item) => raw && item.segments.some((segment) => segment.includes(raw)));
    if (!matched) {
      unmatched.push(relative);
      continue;
    }
    if (!matched.model) continue;
    if (!sessionModels.has(matched.session)) {
      const models = (await readJsonl(matched.session)).map((entry) => entry?.message?.model).filter(Boolean);
      sessionModels.set(matched.session, new Set(models.map(normalizeModel)));
    }
    const models = sessionModels.get(matched.session);
    if (models.size && !models.has(normalizeModel(matched.model))) {
      notes.push(`转录核验：${relative} 对应子代理模型 ${matched.model} 与主会话模型 ${[...models].join('、')} 不一致（${matched.path}）；仅提示，不要求同模型。`);
    }
  }
  if (unmatched.length) {
    notes.push(`转录核验：${unmatched.join('、')} 的内容未出现在任何审查包之后的子代理输出中（已检查 ${transcripts.map((item) => item.path).join('、')}）；请人工确认原文是子代理返回的逐字落盘。`);
  }
  return notes;
}

async function verificationIssues(featureDir, plan, context) {
  const issues = [];
  for (const declaration of plan.delivery) {
    const references = evidenceReferences(declaration.evidence);
    if (!references.paths.length) {
      issues.push(issue('MISSING_VERIFICATION', 'BLOCKED', `交付验证 ${declaration.command} 没有证据日志；请在最终代码上通过 qa:run 真实执行`));
      continue;
    }
    const location = evidenceLocation(featureDir, references.paths[0]);
    if (!location) {
      issues.push(issue('EVIDENCE_OUT_OF_SCOPE', 'FAIL', `交付验证 ${declaration.command} 的证据越出特性目录`));
      continue;
    }
    try {
      const info = await stat(location.absolute);
      if (!info.isFile() || info.size === 0) {
        issues.push(issue('INVALID_RUN_LOG', 'FAIL', `交付验证 ${declaration.command} 的证据不是完整 qa-run 日志：${location.relative}`));
        continue;
      }
    } catch {
      issues.push(issue('MISSING_EVIDENCE', 'FAIL', `交付验证 ${declaration.command} 的证据不存在：${location.relative}`));
      continue;
    }
    const log = parseRunLog(await readFile(location.absolute, 'utf8'));
    if (path.posix.extname(location.relative).toLowerCase() !== '.log' || !completeRunLog(log)) {
      issues.push(issue('INVALID_RUN_LOG', 'FAIL', `交付验证 ${declaration.command} 的证据不是完整 qa-run 日志：${location.relative}`));
      continue;
    }
    if (startedBeforeBaseline(log, context.scope)) {
      issues.push(issue(
        'EVIDENCE_BEFORE_BASELINE',
        'FAIL',
        `交付验证 ${declaration.command} 的日志开始时间 ${log.started} 早于开工基线 ${context.scope.createdAt}。`,
        BASELINE_HINT,
      ));
    }
    let expectedArgv = null;
    try {
      expectedArgv = splitShellWords(declaration.command);
    } catch {
      expectedArgv = null;
    }
    if (JSON.stringify(log.argv) !== JSON.stringify(expectedArgv)) {
      issues.push(issue(
        'VERIFICATION_COMMAND_MISMATCH',
        'FAIL',
        `交付验证声明的命令是 ${declaration.command}，日志实际执行的是 ${formatCommand(log.argv)}。`,
        '请按声明的命令重新运行；需要改命令时先在 ## 计划变更 说明。',
      ));
    }
    if (log.exit !== 0) {
      issues.push(issue('VERIFICATION_FAILED', 'FAIL', `交付验证 ${declaration.command} 的日志退出码为 ${log.exit}；请修复失败后重新运行`));
    }
    if (!context.tree || log.tree === 'none' || log.tree !== context.tree) {
      issues.push(issue(
        'STALE_VERIFICATION',
        'BLOCKED',
        `交付验证 ${declaration.command} 的日志生成后代码又有改动，或未绑定 tree。`,
        '请在最终代码上用 qa-run 重新运行该命令并更新证据路径。',
      ));
    }
  }
  return issues;
}

/** earlier：规划契约、验收与同名技能检测已得到的结果，审查检查在其后追加 */
async function checkReview(featureDir, plan, context, earlier) {
  const issues = [...earlier.issues];
  const notes = [...earlier.notes];
  if (!context.scope) {
    issues.push(issue('MISSING_BASELINE', 'BLOCKED', `缺少 ${QA_DIR}/scope.json；请在改代码前用 review-package init 建立开工基线`));
  }
  // init 时已有改动的路径：白名单内的，以及白名单外但之后经 add 纳入范围的
  const dirtyAtInit = context.scope?.dirtyAtInit;
  const dirtyPaths = [
    ...(dirtyAtInit?.inScope ?? []),
    ...Object.keys(dirtyAtInit?.outOfScope ?? {}).filter((relative) => inScope(relative, context.scope.scopes)),
  ];
  const dirtyNonArtifacts = [...new Set(dirtyPaths)]
    .filter((relative) => !STAGE_ARTIFACT_PATTERN.test(relative))
    .sort();
  if (dirtyNonArtifacts.length) {
    notes.push(`开工前范围内已有改动：${dirtyNonArtifacts.join('、')}；若基线建得晚，请在 review-report 的 ## 范围说明 解释这些改动的来源。`);
  }

  let manifest = null;
  let packageTime = null;
  try {
    const manifestPath = path.join(featureDir, QA_DIR, 'review-package.json');
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!parsed || typeof parsed.treeDigest !== 'string' || !parsed.treeDigest) throw new Error('缺少 treeDigest');
    // 以当前 tree 首次打包时间为准；旧审查包没有 packagedAt 时退回文件修改时间
    const packagedAt = Date.parse(parsed.packagedAt);
    packageTime = Number.isNaN(packagedAt) ? (await stat(manifestPath)).mtimeMs : packagedAt;
    manifest = parsed;
  } catch {
    issues.push(issue('MISSING_REVIEW_PACKAGE', 'BLOCKED', `${QA_DIR}/review-package.json 缺失、无效或没有 treeDigest；请用新版 collect 重新生成`));
  }
  if (manifest) {
    if (Array.isArray(manifest.unreviewed) && manifest.unreviewed.length) {
      issues.push(issue('UNREVIEWED_FILES', 'FAIL', `存在未审查文件：${manifest.unreviewed.map((item) => item.path || item).join(', ')}；请补充审查或说明`));
    }
    if (Array.isArray(manifest.changedFiles) && manifest.changedFiles.length) {
      try {
        const patch = await readFile(path.join(featureDir, QA_DIR, 'review-package.diff'), 'utf8');
        if (!patch.trim()) issues.push(issue('EMPTY_REVIEW_DIFF', 'FAIL', `存在代码变更但 ${QA_DIR}/review-package.diff 为空；请重新 collect`));
      } catch {
        issues.push(issue('MISSING_REVIEW_DIFF', 'FAIL', `存在代码变更但缺少 ${QA_DIR}/review-package.diff；请重新 collect`));
      }
    }
    if (context.tree && manifest.treeDigest !== context.tree) {
      issues.push(issue('STALE_REVIEW_PACKAGE', 'BLOCKED', `${QA_DIR}/review-package.json 的 treeDigest 与当前代码不一致；请在最终代码上重新 collect 并增量复审`));
    }
    if (Array.isArray(manifest.preexisting) && manifest.preexisting.length) {
      notes.push(`开工时范围内已有改动，未进入审查包：${manifest.preexisting.join('、')}`);
    }
  }

  let reportText = '';
  try {
    reportText = await readFile(path.join(featureDir, 'review-report.md'), 'utf8');
  } catch {
    issues.push(issue('MISSING_REVIEW_REPORT', 'BLOCKED', `缺少 review-report.md；请先 collect 并调用 code-review，待两轴原文落盘到 ${REVIEW_DIR}/ 后再写审查方式、三档分流与范围说明`));
  }
  const triage = reportText ? parseTriage(reportText) : null;
  if (reportText) issues.push(...reviewReportIssues(reportText, triage));
  const raw = await reviewRawIssues(featureDir, triage, packageTime);
  issues.push(...raw.issues);
  notes.push(...await transcriptNotes(context.root, raw.latest, featureDir, packageTime));

  const outOfScope = Array.isArray(manifest?.outOfScope) ? manifest.outOfScope : [];
  if (outOfScope.length) {
    const scopeExplanation = reportText ? markdownSection(reportText, /^## 范围说明\s*$/) ?? '' : '';
    const unexplained = outOfScope.map((item) => item.path || item).filter((relative) => !scopeExplanation.includes(relative));
    if (unexplained.length) {
      issues.push(issue(
        'OUT_OF_SCOPE_CHANGES',
        'BLOCKED',
        `开工后范围外出现改动：${unexplained.join('、')}。`,
        `属于本任务的文件运行 node tooling/scripts/review-package.mjs add .scratch/<特性> -- <路径> 后重新 collect；不属于本任务的，在 review-report 的 ## 范围说明 逐个写明来源。不要修改 ${QA_DIR}/scope.json。`,
      ));
    }
  }
  issues.push(...await verificationIssues(featureDir, plan, context));
  return summarize(issues, notes);
}

export async function checkFeature(featureDir, phase) {
  if (!PHASES.has(phase)) throw new Error(`未知检查阶段：${phase}`);
  const markdown = await readFile(path.join(featureDir, 'qa-plan.md'), 'utf8');
  const plan = parsePlan(markdown);
  if (plan.schema !== CURRENT_SCHEMA) {
    const declared = Number.isNaN(plan.schema) ? '未声明 QA Schema' : `声明的是 QA Schema: ${plan.schema}`;
    return summarize([issue(
      'UNSUPPORTED_SCHEMA',
      'FAIL',
      `qa-plan.md ${declared}，检查器只支持 QA Schema: ${CURRENT_SCHEMA}。`,
      `按 Schema ${CURRENT_SCHEMA} 结构重建：执行记录加「绑定」列，过程脚本放 ${SCRIPTS_DIR}/，机器状态放 ${QA_DIR}/。`,
    )]);
  }

  const specText = await readFile(path.join(featureDir, 'spec.md'), 'utf8');
  const specIds = parseSpec(specText);
  const validated = validatePlan(plan, specIds);
  const commandContract = specCommandIssues(plan, parseSpecCommands(specText), phase);
  // 同名技能检测只在 plan 与 review 阶段运行，且不被其他规划问题提前返回遮住
  const shadow = phase === 'acceptance' ? { issues: [], notes: [] } : await skillShadowIssues(featureDir);
  // 计划结构的 NOTE（如 browser 用例超量）只在 plan 阶段且结构无问题时输出；交付命令契约的 NOTE 各阶段都输出
  const structureNotes = phase === 'plan' && !validated.issues.length ? validated.notes : [];
  const planFindings = mergeFindings({ issues: validated.issues, notes: structureNotes }, commandContract);
  // 计划结构与交付命令契约问题在各阶段都提前结束检查
  if (planFindings.issues.length || phase === 'plan') {
    const early = mergeFindings(planFindings, shadow);
    return summarize(early.issues, early.notes);
  }
  const context = await featureContext(featureDir);
  const acceptance = await checkAcceptance(featureDir, plan, context);
  const findings = mergeFindings(planFindings, acceptance, shadow);
  if (phase === 'acceptance') return { ...summarize(findings.issues, findings.notes), table: acceptance.table };
  findings.issues.push(...await reconciliationIssues(featureDir, acceptance.table));
  return { ...await checkReview(featureDir, plan, context, findings), table: acceptance.table };
}

const RECONCILIATION_FILE = `${QA_DIR}/reconciliation.md`;

/** 对账表的 markdown 行；终端输出与 _qa/reconciliation.md 共用 */
function reconciliationLines(table) {
  return [
    '| 用例-断言 | 冻结断言原文 | 实测值或绑定 | 标注 |',
    '| --- | --- | --- | --- |',
    ...table.map((row) => `| ${row.id} | ${tableCell(row.assertion)} | ${tableCell(row.actual)} | ${row.flag} |`),
  ];
}

function reconciliationDocument(table) {
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
async function reconciliationIssues(featureDir, table) {
  const saved = await readFile(path.join(featureDir, RECONCILIATION_FILE), 'utf8').catch(() => null);
  if (saved === reconciliationDocument(table)) return [];
  return [issue(
    'RECONCILIATION_STALE',
    'FAIL',
    saved === null ? `缺少 ${RECONCILIATION_FILE}。` : `${RECONCILIATION_FILE} 与按当前执行记录计算的对账表不一致。`,
    '重跑 qa-check acceptance 生成最新对账表，再重新 collect 并按增量复审交给 Spec 轴核对。',
  )];
}

export function formatReport(report, phase) {
  const lines = (report.notes ?? []).map((note) => `[NOTE] ${note}`);
  lines.push(...report.issues.map((item) => `[${item.code}] ${item.message}`));
  const hintedCodes = new Set();
  for (const item of report.issues) {
    if (!item.hint || hintedCodes.has(item.code)) continue;
    hintedCodes.add(item.code);
    lines.push(`[提示] ${item.code}：${item.hint}`);
  }
  if (report.table?.length) {
    lines.push('', '对账表（人工终审入口：逐行核对实测值或绑定是否证明冻结断言）', ...reconciliationLines(report.table), '');
  }
  lines.push(`结果: ${report.status}`);
  if (phase === 'review' && report.status === 'PASS') {
    lines.push('校验范围: 审查材料结构、交付日志、tree 与范围完整性');
    lines.push('不包含: 独立审查来源真实性、证据语义质量与交付授权');
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const [phase, featureDir] = args;
  if (!PHASES.has(phase) || !featureDir) {
    console.error('用法: node tooling/scripts/qa-check.mjs <plan|acceptance|review> <feature-dir>');
    process.exitCode = 1;
    return;
  }

  try {
    const report = await checkFeature(featureDir, phase);
    // 每次 acceptance 都同步对账表；计划结构有问题算不出表时删除旧文件，避免审查者读到过期内容
    if (phase === 'acceptance') {
      const target = path.join(featureDir, RECONCILIATION_FILE);
      if (report.table) {
        await mkdir(path.join(featureDir, QA_DIR), { recursive: true });
        await writeFile(target, reconciliationDocument(report.table));
      } else {
        await rm(target, { force: true });
      }
    }
    console.log(formatReport(report, phase));
    process.exitCode = report.status === 'PASS' ? 0 : 1;
  } catch (error) {
    console.error(`[INVALID_INPUT] ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
