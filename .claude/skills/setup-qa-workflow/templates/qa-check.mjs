#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeEvidenceTreeDigest, computeQaArtifactsDigest, computeTreeDigest, inScope, QA_DIR, readScope, RECEIPT_LINE_PATTERN } from './review-package.mjs';
import { emptyEvidenceReason, formatCommand, parseRunLog, splitShellWords } from './qa-run.mjs';
import {
  FINDING_ID_PATTERN,
  HAS_FINDING_ID,
  hasNoFinding,
  NO_FINDING_AFTER_ID,
  parseSpecReviewChecklist,
  rawHasFindingOrNoFinding,
  SPEC_REVIEW_CHECKLIST_FILE,
  SPEC_REVIEW_CHECKLIST_V2,
  SPEC_REVIEW_CHECKLIST_VERSION,
  SPEC_REVIEW_SKELETON_FILE,
  specReviewChecklistDocument,
  specReviewCoverageIssues,
  specReviewSkeletonDocument,
  splitMarkdownRow,
  SUPPORTED_CHECKLIST_VERSIONS,
} from './qa-spec-review.mjs';

export { splitMarkdownRow };

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
// 宿主无关的审查来源凭据：collect 发放 challenge，子代理自写原文并由 seal 生成凭据
const CHALLENGE_FILE = 'review-challenge.json';
const SOURCE_RECEIPT_SUFFIX = '.source.json';
// 需要过程脚本与断言标记的接缝；需要用例绑定的接缝
const SCRIPTED_SEAMS = new Set(['browser', 'api']);
const BOUND_SEAMS = new Set(['unit', 'integration']);
// 绕过真实登录的模式：注入 Cookie、写认证或令牌类本地存储键、脚本内登录（检查器内置，不按宿主开关）
const AUTH_BYPASS_PATTERNS = [
  { label: 'CDP 设置 Cookie', pattern: /\b(?:Network|Storage)\.setCookies?\b/ },
  { label: '浏览器上下文添加 Cookie', pattern: /\.addCookies\s*\(/ },
  { label: '写 document.cookie', pattern: /\bdocument\.cookie\s*=(?!=)/ },
  { label: '本地存储写入认证或令牌类键', pattern: /\b(?:localStorage|sessionStorage)\s*(?:\.setItem\s*\(\s*['"`][^'"`]*(?:token|auth|session)|\[\s*['"`][^'"`]*(?:token|auth|session)[^'"`]*['"`]\s*\]\s*=(?!=))/i },
  // 登录只发生在脚本外：密码字面量、登录注册与签发令牌接口、生产代码后门上的登录方法
  { label: '密码字面量', pattern: /\b[\w$]*(?:password|passwd|pwd)[\w$]*['"]?\s*[:=]\s*(['"`])(?!\1)[^'"`\n]+\1/i },
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
// 响应注入：替换或拦截网络响应，证据不再经过真实后端；整份脚本扫描，命中只提示并在对账表标注「响应注入」
const RESPONSE_INJECTION_PATTERNS = [
  { label: 'window.fetch 赋值', pattern: /\bwindow\.fetch\s*=(?!=)/ },
  { label: 'route(', pattern: /\.route\s*\(/ },
  { label: 'route.fulfill(', pattern: /\.fulfill\s*\(/ },
  { label: 'cy.intercept(', pattern: /\bcy\.intercept\s*\(/ },
  { label: 'MSW 处理器', pattern: /\b(?:http|rest)\.(?:get|post|put|patch|delete|all)\s*\(/ },
];
const DEFAULT_FIX_PREFIXES = ['S-H', 'P-M', 'P-W'];
// 执行记录备注中的过期证据豁免：「不重跑：」后须有非空理由
const NO_RERUN_PATTERN = /不重跑[:：]\s*(\S.*)$/;
// HTML 实体反转义（转录核验比对前对双方使用）
const HTML_ENTITIES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };
// 分流表处置状态的允许值；留空与「—」表示尚无处置
const DISPOSITION_VALUES = new Set(['', '—', '已修', '未修', '修错', '改档成立', '改档不成立', '驳回', '转专项']);
// QA 工作流依赖的流程技能；个人级同名且内容不同会让项目版失效
const WORKFLOW_SKILLS = new Set([
  'to-spec', 'to-tickets', 'implement', 'implement-spec', 'tdd', 'code-review', 'pr', 'retro',
  'handoff', 'grill-with-docs', 'grill-me', 'domain-modeling', 'codebase-design',
  'setup-qa-workflow', 'diagnosing-bugs', 'improve-codebase-architecture', 'qa-test-planner',
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
    reviewCoverage: markdown.match(/^QA Review Coverage:\s*(\S+)\s*$/m)?.[1] ?? null,
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
 * 该检查防的是下次在 Claude Code 中执行时被遮蔽，与检查器在哪个宿主运行无关，因此不按宿主跳过。
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

/** 只提取可确定解析的本地引用：静态相对导入与 Shell 标准输入重定向 */
function scriptReferenceTargets(text) {
  const targets = importedSpecifiers(text).filter((specifier) => /^\.\.?(?:\/|$)/.test(specifier));
  for (const match of text.matchAll(/(?<!<)<(?!<)\s*(?:"([^"]+)"|'([^']+)'|([^\s;|]+))/g)) {
    const target = match[1] ?? match[2] ?? match[3] ?? '';
    if (target.startsWith('$DIR/') || target.startsWith('${DIR}/') || path.isAbsolute(target)) targets.push(target);
  }
  return targets;
}

function resolveScriptReference(file, target) {
  if (target.startsWith('$DIR/')) return path.join(path.dirname(file), target.slice(5));
  if (target.startsWith('${DIR}/')) return path.join(path.dirname(file), target.slice(6));
  if (path.isAbsolute(target)) return target;
  return path.resolve(path.dirname(file), target);
}

/** 返回日志 argv 及其确定性本地引用闭包内、位于特性目录 scripts/ 的过程脚本相对路径 */
async function referencedProcessScripts(featureDir, logs, root) {
  const featureRoot = await realpath(featureDir);
  const scripts = new Set();
  const visited = new Set();
  const pending = [];
  for (const log of logs) {
    const bases = root ? [path.resolve(root, log.cwd ?? '.')] : [];
    pending.push(...await argvExistingFiles(log, bases));
  }
  while (pending.length) {
    const file = pending.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!SCRIPT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const location = evidenceLocation(featureRoot, file);
    if (!location || location.relative.split('/')[0] !== SCRIPTS_DIR) continue;
    scripts.add(location.relative);
    const text = await readFile(file, 'utf8');
    for (const target of scriptReferenceTargets(text)) {
      try {
        const candidate = resolveScriptReference(file, target);
        if (!(await stat(candidate)).isFile()) continue;
        const resolved = await realpath(candidate);
        if (!visited.has(resolved)) pending.push(resolved);
      } catch {
        // 动态或已失效的引用不猜测，交 Spec 轴与人工终审
      }
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
      issues.push(issue('INVALID_RUN_LOG', 'FAIL', `${row.caseId} / ${row.assertion} 的日志不是完整 qa-run 日志：${location.relative}；请通过 node tooling/scripts/qa-run.mjs 真实执行生成`));
      continue;
    }
    entry.log = log;
    if (log.exit !== 0) {
      issues.push(issue('EVIDENCE_EXIT_NONZERO', 'FAIL', `${row.caseId} / ${row.assertion} 的 PASS 证据日志退出码为 ${log.exit}：${location.relative}；请修复后重新执行`));
    } else if (emptyEvidenceReason(log.body)) {
      issues.push(issue('EMPTY_EVIDENCE', 'FAIL', `${row.caseId} / ${row.assertion} 的日志虽 exit 0，但${emptyEvidenceReason(log.body)}：${location.relative}`));
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
        '请在特性目录内通过 node tooling/scripts/qa-run.mjs 真实执行修复前命令，并用一个反引号路径引用生成的日志。',
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

// 零依赖 POSIX 路径通配匹配（支持单级通配、跨目录双星号与单字符通配），避免依赖 Node 22.5+ 专有 API
function matchPosixGlob(filePath, pattern) {
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

/** 绑定文件（仓库相对路径）是否被 argv 中点名的测试文件或 glob 覆盖 */
function bindingNamedBy(relative, named) {
  return named.some((candidate) => {
    const pattern = candidate.split(path.sep).join('/').replace(/^\.\//, '');
    return relative === pattern
      || relative.endsWith(`/${pattern}`)
      || matchPosixGlob(relative, pattern)
      || matchPosixGlob(relative, `**/${pattern}`);
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

/** 从去注释后的源码全文提取静态导入、副作用导入以及支持跨行与路径拼接的动态 import()/require() 模块说明符 */
function importedSpecifiers(text) {
  const found = new Set();
  for (const pattern of [
    /\b(?:import|export)\b[^;]*?\bfrom\s*(['"`])([^'"`\n]+)\1/g,
    /\bimport\s*(['"`])([^'"`\n]+)\1/g,
  ]) {
    for (const match of text.matchAll(pattern)) found.add(match[2]);
  }
  const masked = maskStringLiterals(text);
  for (const match of text.matchAll(/\b(?:import|require)\s*\(/g)) {
    const start = match.index + match[0].length;
    const args = text.slice(start, inPageSegmentEnd(masked, start));
    for (const literal of args.matchAll(/(['"`])([^'"`\n]+)\1/g)) found.add(literal[2]);
  }
  return [...found];
}

function dataStoreModule(specifier) {
  const normalized = specifier.replace(/^node:/, '');
  return DATA_STORE_MODULES.find((name) => normalized === name
    || normalized.startsWith(`${name}/`)
    || new RegExp(`(?:^|/)node_modules/${escapeRegExp(name)}(?:/|$)`).test(normalized));
}

/**
 * 工作区中 dependencies 直接含数据存储驱动的包；返回包名与包目录绝对路径，以及推导未完全生效时的 NOTE。
 * 只看 dependencies，不看 devDependencies，不沿传递依赖扩散。
 */
async function workspaceDataStorePackages(root) {
  const packages = [];
  const problems = [];
  const { patterns, excludes, problem } = await workspacePatterns(root);
  if (problem) problems.push(problem);
  for (const directory of await expandWorkspacePatterns(root, patterns, excludes)) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    } catch {
      problems.push(`${path.relative(root, path.join(directory, 'package.json'))} 无法解析`);
      continue;
    }
    const dependencies = Object.keys(manifest.dependencies ?? {});
    if (manifest.name && dependencies.some((name) => DATA_STORE_MODULES.includes(name))) {
      packages.push({ name: manifest.name, directory });
    }
  }
  const notes = problems.length
    ? [`工作区推导未完全生效：${problems.join('、')}；本次按基础名单与已解析的工作区包扫描过程脚本。`]
    : [];
  return { packages, notes };
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
async function workspacePatterns(root) {
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

const IGNORED_WORKSPACE_DIRS = new Set(['node_modules', '.git', '.next', '.scratch', '.turbo', 'dist', 'build', '.cache']);

// 目录是否被排除规则命中（兼容 !dir 与 !dir/** 两种写法）
function isExcludedWorkspace(relativePosix, excludes) {
  return excludes.some((pattern) => {
    const base = pattern.replace(/\/\*\*$/, '');
    return relativePosix === base
      || relativePosix.startsWith(`${base}/`)
      || matchPosixGlob(relativePosix, pattern);
  });
}

/** 并发递归收集工作区下含 package.json 的候选相对目录 */
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

// 展开工作区模式：支持精确目录、单层通配与多级 glob（如 packages/**、apps/*/*），并过滤 ! 排除项
async function expandWorkspacePatterns(root, patterns, excludes = []) {
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

/**
 * 说明符是否指向工作区数据存储包：包名本身、以「包名/」开头的子路径，
 * 或相对脚本目录、绝对路径解析后落在包目录内的路径（两侧按真实路径比较，避免 /var 与 /private/var 之类的符号链接差异）
 */
async function workspaceDataStoreModule(specifier, packages, scriptDir) {
  const byName = packages.find((item) => specifier === item.name || specifier.startsWith(`${item.name}/`));
  if (byName) return byName.name;
  const local = specifier.startsWith('file://') ? fileURLToPathOrNull(specifier) : specifier;
  if (!local || !(path.isAbsolute(local) || /^\.\.?(?:\/|$)/.test(local))) return null;
  const absolute = await realPathOfLongestExisting(path.resolve(scriptDir, local));
  return packages.find((item) => {
    const inside = path.relative(item.directory, absolute);
    return !inside.startsWith('..') && !path.isAbsolute(inside);
  })?.name ?? null;
}

/** 解析路径中最长的已存在前缀的真实路径，再拼回不存在的剩余部分 */
async function realPathOfLongestExisting(target) {
  const rest = [];
  let current = target;
  for (;;) {
    try {
      return path.join(await realpath(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return target;
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

function fileURLToPathOrNull(url) {
  try {
    return fileURLToPath(url);
  } catch {
    return null;
  }
}

/** 跳过 Python 三引号字面量（"""...""" 或 '''...'''），返回结束下标 */
function consumeTripleQuoted(text, start) {
  const quote = text.slice(start, start + 3);
  for (let index = start + 3; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text.slice(index, index + 3) === quote) return index + 3;
  }
  return text.length;
}

/** 跳过单/双引号或模板字符串字面量（模板 ${...} 复用统一 JS 词法扫描器），返回结束下标 */
function consumeQuoted(text, start) {
  const quote = text[start];
  if (quote === '`') return scanTemplateLiteral(text, start).end;
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text[index] === quote) return index + 1;
  }
  return text.length;
}

/** 跳过正则字面量（含字符类与转义），返回结束下标 */
function consumeRegex(text, start) {
  let inClass = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return index + 1;
    else if (char === '\n') return index;
  }
  return text.length;
}

/** `/` 是否可能是正则字面量起始：前一个非空白字符不能是标识符、右括号或引号 */
function isRegexStart(text, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = text[cursor];
    if (/\s/.test(char)) continue;
    return !/[\w$)\]}"'`]/.test(char);
  }
  return true;
}

/** 单次扫描模板字符串：保留正文并在遇到 ${...} 时委托 scanJsSegment 一次完成去注释与闭合定位 */
function scanTemplateLiteral(text, start) {
  let out = '`';
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      out += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === '$' && text[index + 1] === '{') {
      const inner = scanJsSegment(text, index + 2, true);
      out += `\${${inner.out}${inner.closed ? '}' : ''}`;
      index = inner.end;
      continue;
    }
    out += char;
    index += 1;
    if (char === '`') break;
  }
  return { out, end: index };
}

/**
 * 统一 JS/TS 词法扫描器：单次遍历剥离 `//`、`/* *\/` 与 shebang，保留字符串/正则字面量并递归处理模板字符串 `${...}`。
 * 当 stopOnCloseBrace 为 true 时在匹配的 `}` 处停止，供模板表达式内嵌套复用。
 */
function scanJsSegment(text, start, stopOnCloseBrace = false) {
  let out = '';
  let index = start;
  let braceDepth = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        if (text[index] === '\n') out += '\n';
        index += 1;
      }
      index += 2;
      continue;
    }
    if (index === 0 && char === '#' && next === '!') {
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if (char === '`') {
      const template = scanTemplateLiteral(text, index);
      out += template.out;
      index = template.end;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = consumeQuoted(text, index);
      out += text.slice(index, end);
      index = end;
      continue;
    }
    if (char === '/' && isRegexStart(text, index)) {
      const end = consumeRegex(text, index);
      out += text.slice(index, end);
      index = end;
      continue;
    }
    if (stopOnCloseBrace) {
      if (char === '{') {
        braceDepth += 1;
      } else if (char === '}') {
        if (braceDepth === 0) return { out, end: index + 1, closed: true };
        braceDepth -= 1;
      }
    }
    out += char;
    index += 1;
  }
  return { out, end: index, closed: false };
}

/**
 * 零依赖剥离注释：跳过字符串与正则字面量内部，保留字符串内容（登录接口与包名扫描仍需要）。
 * 支持 JS `//`、`/* *\/`、模板字符串 `${...}` 嵌套注释，以及 Python `#` 行注释与三引号字符串。
 */
function stripComments(text, { python = false } = {}) {
  if (!python) return scanJsSegment(text, 0, false).out;
  let out = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '#') {
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if ((char === '"' || char === "'") && text[index + 1] === char && text[index + 2] === char) {
      const end = consumeTripleQuoted(text, index);
      out += text.slice(index, end);
      index = end;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = consumeQuoted(text, index);
      out += text.slice(index, end);
      index = end;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * 从入口之后定位页面内代码片段的结束下标：跟踪 ( [ { 嵌套，遇到闭合外层调用或对象的括号、或顶层分号时结束。
 * 在掩码后的文本上计数，字符串内部的括号不参与嵌套，避免 `'a)b'` 提前截断；
 * 片段本身仍从原始文本切片，保留字符串内容供合成输入与登录接口扫描。
 */
function inPageSegmentEnd(masked, start) {
  let level = 0;
  for (let index = start; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === '(' || char === '[' || char === '{') level += 1;
    else if (char === ')' || char === ']' || char === '}') {
      level -= 1;
      if (level < 0) return index;
    } else if (char === ';' && level === 0) return index;
  }
  return masked.length;
}

/** 把字符串与正则字面量内容替换为等长空格，仅用于定位页面内入口，避免把它们内部的括号当成代码 */
function maskStringLiterals(text) {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "'" || char === '"' || char === '`') {
      const end = consumeQuoted(text, index);
      out += text.slice(index, end).replace(/[^\n]/g, ' ');
      index = end;
      continue;
    }
    if (char === '/' && isRegexStart(text, index)) {
      const end = consumeRegex(text, index);
      out += text.slice(index, end).replace(/[^\n]/g, ' ');
      index = end;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function inPageSegments(text) {
  const masked = maskStringLiterals(text);
  return [...text.matchAll(IN_PAGE_ENTRY)].map((match) => {
    const start = match.index + match[0].length;
    return text.slice(start, inPageSegmentEnd(masked, start));
  });
}

/**
 * 扫描 scripts/ 下全部脚本：绕过真实登录（注入 Cookie、写令牌、脚本内登录、直连数据存储）为不可豁免的 FAIL；
 * 数据存储模块含第三方驱动，以及工作区中 dependencies 直接含这些驱动的包；
 * 页面内合成输入与直接改写应用状态只提示，并在对账表标注「非真实输入」；响应注入只提示，并标注「响应注入」。
 */
async function scanProcessScripts(featureDir) {
  const issues = [];
  const notes = [];
  const synthetic = new Set();
  const injected = new Set();
  const root = await gitRoot(featureDir);
  const workspace = root ? await workspaceDataStorePackages(root) : { packages: [], notes: [] };
  const workspacePackages = workspace.packages;
  notes.push(...workspace.notes);
  for (const relative of await listScripts(featureDir)) {
    const raw = await readFile(path.join(featureDir, relative), 'utf8');
    // 注释不参与绕过登录与响应注入扫描；字符串内容保留，登录接口与包名匹配不失效
    const text = stripComments(raw, { python: path.extname(relative).toLowerCase() === '.py' });
    const hits = AUTH_BYPASS_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.label);
    const specifiers = importedSpecifiers(text);
    const scriptDir = path.dirname(path.resolve(featureDir, relative));
    const workspaceModules = await Promise.all(
      specifiers.map((specifier) => workspaceDataStoreModule(specifier, workspacePackages, scriptDir)),
    );
    const modules = [...new Set([...specifiers.map(dataStoreModule), ...workspaceModules].filter(Boolean))];
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
    // 放行仅用于保存 fetch 引用或控制台诊断采集的只读挂点与只读属性读取，其余页面内合成操作仍标注非真实输入
    const segments = inPageSegments(text).map((segment) => segment
      .replace(/\bwindow\.__originalFetch\s*=\s*[\w$.]+\s*;?/g, '')
      .replace(/\bwindow\.__(?:console|qa|diag|errors?|logs?)[A-Za-z0-9_$]*(?:\s*=\s*(?:\[\]|\{\}|null|undefined)|\.push\s*\([^)]*\)|(?:\?\.|\.)(?:length|slice|map|filter|join|forEach|at|some|every|includes|concat|values|keys|entries)\b|\s*(?=[,;)\]}\s]|$))/gi, ''));
    const labels = SYNTHETIC_INPUT_PATTERNS
      .filter((item) => segments.some((segment) => item.pattern.test(segment)))
      .map((item) => item.label);
    if (labels.length) {
      synthetic.add(relative);
      notes.push(`SYNTHETIC_INPUT_IN_SCRIPT：${relative} 的页面内代码含 ${labels.join('、')}；引用该脚本的用例在对账表标注「非真实输入」，请人工终审确认是否满足真实输入要求。`);
    }
    const injections = RESPONSE_INJECTION_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.label);
    if (injections.length) {
      injected.add(relative);
      notes.push(`RESPONSE_INJECTION_IN_SCRIPT：${relative} 含 ${injections.join('、')}；引用该脚本的用例在对账表标注「响应注入」，其断言只能证明端侧渲染，触及核心链路时须另有真实链路冒烟。`);
    }
  }
  return { issues, notes, synthetic, injected };
}

function tableCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
}

/** 对账表：每条执行结果一行，PASS 对照实测值或绑定，FAIL/BLOCKED 保留原因 */
function reconciliationTable(rows, frozenPlan, currentPlan, markerValues, caseScripts, synthetic, injected) {
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
      sourceCandidates: BOUND_SEAMS.has(testCase.seam)
        ? [row.binding.match(/^`([^`]+)`/)?.[1]].filter(Boolean)
        : scripts,
      changed: frozenAssertion !== currentAssertion,
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
  // 通过接缝证据检查的 PASS 行及其 exit 0 日志，供断言标记与用例绑定使用
  const passRows = [];
  // 全部执行行进入对账表，包括不进入证据校验的 FAIL/BLOCKED
  const tableRows = [];
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
    const testCase = caseById.get(row.caseId);
    if (testCase) tableRows.push({ row, testCase });
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
  const screenshotHashes = new Map();
  for (const [row, entries] of evidenceByRow) {
    // _qa/debug/ 下的调试截图不是验收证据，不参与唯一性检查
    for (const entry of entries.filter((item) => item.image && !item.path.startsWith(DEBUG_DIR))) {
      if (!screenshots.has(entry.path)) screenshots.set(entry.path, new Set());
      screenshots.get(entry.path).add(row.caseId);
      const content = await readFile(path.join(featureDir, entry.path)).catch(() => null);
      // 文件缺失已由 validateEvidence 报 MISSING_EVIDENCE，这里不再抛异常中断检查
      if (content === null) continue;
      const digest = createHash('sha256').update(content).digest('hex');
      if (!screenshotHashes.has(digest)) screenshotHashes.set(digest, new Map());
      screenshotHashes.get(digest).set(entry.path, row.caseId);
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
  for (const [digest, byPath] of screenshotHashes) {
    if (byPath.size < 2) continue;
    const caseIds = [...new Set(byPath.values())].sort();
    if (caseIds.length < 2) continue;
    issues.push(issue(
      'SHARED_SCREENSHOT',
      'FAIL',
      `${[...byPath.keys()].join('、')} 内容完全相同（SHA-256 ${digest.slice(0, 12)}…），被 ${caseIds.join('、')} 引用。`,
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
  const table = reconciliationTable(tableRows, frozen.frozen ?? plan, plan, markers.values, caseScripts, scan.synthetic, scan.injected);

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

  if (context.evidenceTree) {
    const staleCases = new Set();
    for (const [row, entries] of evidenceByRow) {
      if (noRerunReason(row)) continue;
      if (entries.some((entry) => entry.log && entry.log.tree !== context.evidenceTree)) staleCases.add(row.caseId);
    }
    if (staleCases.size) {
      issues.push(issue(
        'STALE_EVIDENCE',
        'BLOCKED',
        `${[...staleCases].sort().join('、')} 的证据日志 tree 与当前代码不一致。`,
        '在当前代码上换新标签用 qa-run 重跑并更新证据；能确认仅为非行为文档变化时，在执行记录该行备注写「不重跑：<理由>」，由人工终审核对。',
      ));
    }
  }
  return { ...summarize(issues, notes), table };
}

/** 执行记录备注中的「不重跑：<理由>」；理由为空时返回 null */
function noRerunReason(row) {
  return row.detail.match(NO_RERUN_PATTERN)?.[1].trim() || null;
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

/** 解析 ## 三档分流 表格：按表头定位编号、档位、处置状态（兼容旧表头「最终状态」）、轮次轨迹、验证证据与理由列 */
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
    const finalIndex = headers.findIndex((cell) => cell.includes('处置状态') || cell.includes('最终状态'));
    const trajectoryIndex = column('轮次轨迹');
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
        trajectory: cell(trajectoryIndex),
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
    return hasNoFinding(triage.body)
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

/** 当前审查包 manifest 的 treeDigest；缺失时返回 null */
async function reviewPackageTree(featureDir) {
  try {
    const manifest = JSON.parse(await readFile(path.join(featureDir, QA_DIR, 'review-package.json'), 'utf8'));
    return typeof manifest?.treeDigest === 'string' ? manifest.treeDigest : null;
  } catch {
    return null;
  }
}

/**
 * 单轴复用：该轴没有待复核编号，且最近一次审查与当前审查包同一 treeDigest、原文哈希一致。
 * 仅用于 r2+ 只改 .scratch/ 产物（审查包未变）时的单轴复审。
 */
async function reusableAxis(featureDir, rounds, latest, axis, requiredIds) {
  if (requiredIds.some((id) => axisOf(id) === axis)) return null;
  const tree = await reviewPackageTree(featureDir);
  if (!tree) return null;
  for (let round = latest - 1; round >= 1; round -= 1) {
    const relative = rounds.get(round)?.[axis];
    if (!relative) continue;
    const checked = await readSourceReceipt(featureDir, relative);
    if (checked.receipt?.treeDigest !== tree) continue;
    const content = await readFile(path.join(featureDir, relative), 'utf8').catch(() => null);
    if (content === null) continue;
    if (createHash('sha256').update(content).digest('hex') !== checked.receipt.sha256) continue;
    return { relative, round, receipt: checked.receipt };
  }
  return null;
}

/**
 * 审查原文与分流表对账：r1 两轴原文须齐全；r2+ 仅改 .scratch/ 产物时允许另一轴沿用同一 treeDigest 的旧轮次。
 * 已列编号须有原文依据；默认本次修的编号改档须写理由；待复审编号按轮次轨迹出现在对应轴其后一轮原文中；分流表自报未解决时阻塞交付。
 * 分流表与默认驳回清单共同构成缺陷清单，分流表是唯一流程状态源；不从正文自动发现缺陷或解析状态，原文行只作为人工核对材料输出。
 */
async function reviewRawIssues(featureDir, triage) {
  const issues = [];
  const notes = [];
  const rounds = await readReviewRounds(featureDir);
  const latest = rounds.size ? Math.max(...rounds.keys()) : null;
  const latestFiles = latest === null ? null : rounds.get(latest);
  const currentRound = latest ?? 1;
  if (latest !== null && latest > 3) {
    notes.push(`审查轮次已达 r${latest}，超出自动复审 2 轮上限（r2、r3）；应停止自动修复并交人工裁决。`);
  }
  const rows = triage?.rows ?? [];
  // 待复核编号：本次修，或 S-H、P-M、P-W 被驳回/转专项，且该行按轮次轨迹指向的下一复审轮就是当前轮。
  // 只看「当前轮需要复核的编号」，避免已在前一轮复核完的旧编号在后续轮次反复要求 pendingIds。
  const requiredIds = rows.filter((row) => {
    if (row.tier !== '本次修' && !DEFAULT_FIX_PREFIXES.some((prefix) => row.id.startsWith(prefix))) return false;
    const target = rereviewTarget(row);
    if (!target) return false;
    const next = [...rounds.keys()]
      .filter((round) => (target.following ? round > target.round : round >= target.round))
      .sort((left, right) => left - right)[0];
    return next === currentRound;
  }).map((row) => row.id);
  // 单轴复用：仅在 r2+ 且该轴无待复核编号时，沿用与当前审查包同一 treeDigest 的旧轮次
  const effectiveFiles = latestFiles ? { ...latestFiles } : null;
  const reused = [];
  if (latest !== null && latest > 1) {
    for (const axis of ['standards', 'spec']) {
      if (effectiveFiles?.[axis]) continue;
      const candidate = await reusableAxis(featureDir, rounds, latest, axis, requiredIds);
      if (!candidate) continue;
      effectiveFiles[axis] = candidate.relative;
      reused.push({ axis, ...candidate });
    }
  }
  const rawHint = `在最新审查包（collect）之后用 Skill 工具调用 code-review 重新审查；有 challenge 的新协议由子代理自写原文并 seal 生成 .source.json，旧轮次由主代理把两轴子代理的返回逐字落盘到 ${REVIEW_DIR}/；不要用 Agent 工具自行派审查子代理，也不要由主 Agent 代写或改写原文。`;
  if (!effectiveFiles?.standards || !effectiveFiles?.spec) {
    const missing = latest === null
      ? `${REVIEW_DIR}/ 下没有审查原文`
      : `第 r${latest} 轮缺少 ${[!effectiveFiles?.standards && 'standards', !effectiveFiles?.spec && 'spec-axis'].filter(Boolean).join('、')} 原文，且该轴没有与当前审查包同一 treeDigest 的可复用旧轮次`;
    issues.push(issue('REVIEW_RAW_MISSING', 'BLOCKED', `${missing}。`, rawHint));
  }

  // 最新一轮原文提取不到规范编号又没写「无发现」时，编号对账会静默失效
  if (latestFiles) {
    const unnumbered = [];
    for (const { relative, text } of await roundRaws(featureDir, latestFiles)) {
      if (!rawHasFindingOrNoFinding(text)) unnumbered.push(relative);
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

  const index = await rawIndex(featureDir, rounds);
  const unknown = rows.filter((row) => !index.last.has(row.id)).map((row) => row.id);
  if (unknown.length) {
    issues.push(issue(
      'REVIEW_TRIAGE_UNKNOWN',
      'FAIL',
      `分流表中的编号在任何审查原文中都不存在：${unknown.join('、')}。`,
      '删除无原文依据的分流行；若确为漏复制审查发现，只能按对应子代理真实最终返回纠正当轮原文，不得自行补编号。',
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
  // 分流表是唯一流程状态源：处置状态只做枚举校验，不与审查原文的文字比对
  const invalid = rows
    .filter((row) => !DISPOSITION_VALUES.has(row.final))
    .map((row) => `${row.id}（${row.final}）`);
  if (invalid.length) {
    issues.push(issue(
      'INVALID_DISPOSITION',
      'FAIL',
      `分流表处置状态不在允许值内：${invalid.join('、')}。`,
      `处置状态只能是 ${[...DISPOSITION_VALUES].filter(Boolean).join('、')} 之一或留空；部分修复写未修，残留说明写进理由列。`,
    ));
  }
  // 待复审编号（本次修，以及 S-H、P-M、P-W 被驳回或转专项）须出现在对应轴其后一轮的原文中；只看编号是否出现，不解析结论
  const missing = await rereviewMissing(featureDir, rounds, index, rows.filter((row) => row.tier === '本次修'
    || (DEFAULT_FIX_PREFIXES.some((prefix) => row.id.startsWith(prefix)) && row.tier !== '本次修')));
  if (missing.length) {
    issues.push(issue(
      'FINDING_NOT_REREVIEWED',
      'BLOCKED',
      `以下待复审编号没有出现在对应轴其后一轮的审查原文中：${missing.join('、')}。`,
      'collect 后用 Skill 工具调用 code-review 做增量复审，复审输入须列出这些编号；S-* 由 Standards 轴、P-* 由 Spec 轴复核。格式问题不得成为修改原文的理由。',
    ));
  }
  const unresolved = rows
    .filter((row) => (row.tier === '本次修' && (!row.final || row.final === '—')) || /^(未修|修错|改档不成立)$/.test(row.final))
    .map((row) => `${row.id}（${row.final && row.final !== '—' ? row.final : '未填'}）`);
  if (unresolved.length) {
    issues.push(issue(
      'UNRESOLVED_FINDINGS',
      'BLOCKED',
      `以下条目未经复审确认解决：${unresolved.join('、')}。`,
      '自动复审最多 2 轮（r2、r3）；用尽后停止自动修复，按分流表清单交人工裁决：人工在理由列写明接受现状或授权追加修复轮，机器结果保持 BLOCKED，提交由人工明确要求后执行。',
    ));
  }
  return {
    issues,
    notes,
    latest: effectiveFiles,
    currentRound,
    requiredIds,
    reused,
    rawLines: lastRawLines(index, rows),
    rows,
    index,
  };
}

/** 编号前缀对应的审查轴：S-* 为 Standards，P-* 为 Spec */
function axisOf(id) {
  return id.startsWith('S-') ? 'standards' : 'spec';
}

/** 一次遍历全部轮次原文，只为分流表列出的编号提供原文依据与人工核对摘录 */
async function rawIndex(featureDir, rounds) {
  const last = new Map();
  for (const round of [...rounds.keys()].sort((a, b) => a - b)) {
    for (const { relative, text } of await roundRaws(featureDir, rounds.get(round))) {
      text.split(/\r?\n/).forEach((line, lineIndex) => {
        for (const match of line.matchAll(FINDING_ID_PATTERN)) {
          // 「[P-M3]:无发现」类写法只是占位，不能作为分流编号依据
          if (NO_FINDING_AFTER_ID.test(line.slice(match.index + match[0].length))) continue;
          last.set(match[1], { location: `${relative}:${lineIndex + 1}`, line: line.trim() });
        }
      });
    }
  }
  return { last };
}

/** 从轮次轨迹确定待核验的复审轮；无状态的后续轮写法继续兼容 */
function rereviewTarget(row) {
  const matches = [...row.trajectory.matchAll(/\br(\d+)\b/g)];
  if (!matches.length) return null;
  const last = matches.at(-1);
  const trailing = row.trajectory.slice(last.index + last[0].length);
  const following = matches.length === 1 || /未修|修错|改档不成立|本次修|转专项|驳回/.test(trailing);
  return { round: Number(last[1]), following };
}

/** 待复审编号按轮次轨迹核验对应轴原文；正文中的早期示例不参与轮次判断 */
async function rereviewMissing(featureDir, rounds, index, rows) {
  const missing = [];
  for (const row of rows) {
    if (!index.last.has(row.id)) continue;
    const target = rereviewTarget(row);
    if (!target) {
      missing.push(`${row.id}（轮次轨迹未指明复审锚点）`);
      continue;
    }
    const next = [...rounds.keys()]
      .filter((round) => target.following ? round > target.round : round >= target.round)
      .sort((a, b) => a - b)[0];
    if (next === undefined || !rounds.has(next)) {
      missing.push(`${row.id}（尚无复审轮）`);
      continue;
    }
    const relative = rounds.get(next)[axisOf(row.id)];
    const text = relative ? await readFile(path.join(featureDir, relative), 'utf8') : '';
    if (!text.includes(`[${row.id}]`)) missing.push(`${row.id}（r${next} ${axisOf(row.id) === 'standards' ? 'Standards' : 'Spec'} 原文未出现）`);
  }
  return missing;
}

const RAW_EXCERPT_LIMIT = 80;

/** 原文核对：每个分流编号最后出现该编号的原文行（文件:行号与原样截断摘录），只读输出，不参与判定 */
function lastRawLines(index, rows) {
  return rows.map((row) => {
    const found = index.last.get(row.id);
    const excerpt = found && found.line.length > RAW_EXCERPT_LIMIT
      ? `${found.line.slice(0, RAW_EXCERPT_LIMIT)}…（截断）`
      : found?.line ?? '';
    return { id: row.id, disposition: row.final || '未填', location: found?.location ?? '（原文未出现）', excerpt };
  });
}

/** 读取某一轮已存在的两轴原文 */
async function roundRaws(featureDir, files) {
  return Promise.all([files.standards, files.spec].filter(Boolean).map(async (relative) => {
    const text = await readFile(path.join(featureDir, relative), 'utf8');
    return { relative, text };
  }));
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
  if (location.relative.startsWith('evidence/') && path.posix.extname(location.relative).toLowerCase() === '.log') {
    const log = parseRunLog(await readFile(location.absolute, 'utf8'));
    if (!completeRunLog(log)) return `${location.relative} 不是完整 qa-run 日志`;
    if (log.exit !== 0) return `${location.relative} 退出码为 ${log.exit}`;
    const started = Date.parse(log.started ?? '');
    if (raisedAt !== undefined && Number.isFinite(started) && started <= raisedAt) {
      return `${location.relative} 的 started 早于轮次轨迹所指的缺陷审查返回`;
    }
  }
  return null;
}

/**
 * 修复验证：处置状态为「已修」的行须在「验证证据」列引用修复后产生的 evidence/ 或 screenshots/ 文件，
 * 或写「静态：<理由>」；可靠事件时间存在时才核对先后，证据能否证明修复由人工终审判断。
 */
async function fixVerificationIssues(featureDir, rows, evidenceColumn, findingTimes) {
  const fixed = rows.filter((row) => /^已修/.test(row.final));
  if (!fixed.length) return [];
  const hint = '「已修」行在验证证据列写修复后针对该点运行的证据（反引号包裹的 evidence/ 或 screenshots/ 路径；qa-run 日志须 exit 0，事件时间可核验时 started 须晚于缺陷审查返回），不涉及行为的修复写「静态：<理由>」。';
  if (!evidenceColumn) {
    return [issue('FIX_UNVERIFIED', 'FAIL', `## 三档分流 有已修条目但没有「验证证据」列：${fixed.map((row) => row.id).join('、')}。`, hint)];
  }
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
      const problem = await fixEvidenceProblem(featureDir, reference, findingTimes.get(row.id));
      if (problem) problems.push(`${row.id}（${problem}）`);
    }
  }
  return problems.length
    ? [issue('FIX_UNVERIFIED', 'FAIL', `已修条目缺少有效的修复后验证证据：${problems.join('、')}。`, hint)]
    : [];
}

/**
 * 审查方式行中的显式宿主声明：只认 `宿主=<宿主名>`，宿主名止于全角或半角分号或行尾（宿主名本身可含空格，如 Kimi Code）。
 * 返回 null 表示未声明；宿主名为 Claude Code（大小写不敏感）时 claude 为 true。
 */
function declaredReviewHost(reportText) {
  const method = reportText.split(/\r?\n/).find((line) => /^审查方式[：:]/.test(line)) ?? '';
  const name = method.match(/宿主=([^；;]*)/)?.[1]?.trim();
  if (!name) return null;
  return { name, claude: /^claude code$/i.test(name) };
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

/** 转录核验用的规范化：反转义 HTML 实体、剥离首行 HTML 注释，再压缩空白 */
function normalizeForTranscript(text) {
  const unescaped = text.replace(/&(?:lt|gt|quot|#39|amp);/g, (entity) => HTML_ENTITIES[entity]);
  return normalizeWhitespace(unescaped.replace(/^\s*<!--[\s\S]*?-->/, ''));
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
  ]).map(normalizeForTranscript).filter(Boolean);
}

/** 最终输出及其所在 assistant 事件时间；没有可靠时间时保留 NaN，不用文件时间代替 */
function finalOutput(entries) {
  const entry = entries.findLast((item) => item?.type === 'assistant' && outputSegments([item]).length);
  return {
    text: entry ? outputSegments([entry]).at(-1) : '',
    time: Date.parse(entry?.timestamp ?? ''),
  };
}

/** 主会话转录中是否有审查包之后的 code-review Skill 调用（技能名带插件前缀时按后缀匹配） */
async function codeReviewInvoked(sessionFiles, packageTime) {
  for (const file of sessionFiles) {
    for (const entry of await readJsonl(file)) {
      const time = Date.parse(entry?.timestamp);
      if (packageTime !== null && !(time >= packageTime)) continue;
      if (toolUses(entry).some((part) => part.name === 'Skill' && /(?:^|:)code-review$/.test(String(part.input?.skill ?? '')))) return true;
    }
  }
  return false;
}

/** 子代理转录中的用户输入，用于绑定审查轮次与核对复审编号 */
function transcriptPrompt(entries) {
  return entries.filter((entry) => entry?.type === 'user').flatMap((entry) => {
    const content = entry?.message?.content;
    if (typeof content === 'string') return [content];
    return Array.isArray(content) ? content.filter((part) => part?.type === 'text').map((part) => part.text ?? '') : [];
  }).join('\n');
}

function transcriptBinding(entries) {
  // 允许 prompt 中的绑定行带缩进或反引号；不要求行首，避免把说明性引用误判为无绑定
  return transcriptPrompt(entries).match(/QA_REVIEW_BINDING:\s*(\S+\|r\d+\|(?:standards|spec))/m)?.[1] ?? null;
}

/** 子代理转录中的 nonce；新协议用它精确定位本轮审查 */
function transcriptNonce(entries) {
  return transcriptPrompt(entries).match(/QA_REVIEW_NONCE:\s*([^\s`"']+)/m)?.[1] ?? null;
}

/** 最终返回中的凭据行；只认 nonce 与 64 位十六进制哈希 */
function parseReceiptLine(output) {
  const match = output.match(RECEIPT_LINE_PATTERN);
  return match ? { nonce: match[1], hash: match[2] } : { nonce: null, hash: null };
}

/** 读取本仓库全部 Claude Code 子代理转录；会话目录不可读时返回 readable=false */
async function scanClaudeTranscripts(root) {
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(homedir(), '.claude');
  const projectDir = path.join(configDir, 'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
  let sessions;
  try {
    sessions = await readdir(projectDir, { withFileTypes: true });
  } catch {
    return { readable: false, sessionFiles: [], transcripts: [] };
  }
  const sessionFiles = sessions
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(projectDir, entry.name));
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
      const entries = await readJsonl(path.join(subagentDir, file));
      const output = finalOutput(entries);
      transcripts.push({
        binding: transcriptBinding(entries),
        nonce: transcriptNonce(entries),
        prompt: transcriptPrompt(entries),
        final: output.text,
        time: output.time,
        receiptLine: parseReceiptLine(output.text),
      });
    }
  }
  return { readable: true, sessionFiles, transcripts };
}

/** 读取本轮审查的 challenge；不存在时返回 null（旧轮次兼容），存在但无效时给出提示 */
async function readReviewChallenge(featureDir) {
  const file = path.join(featureDir, QA_DIR, CHALLENGE_FILE);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return { challenge: null, problem: null };
  }
  try {
    const challenge = JSON.parse(text);
    const valid = challenge
      && challenge.schemaVersion === 1
      && typeof challenge.feature === 'string' && challenge.feature
      && typeof challenge.round === 'string' && /^r\d+$/.test(challenge.round)
      && typeof challenge.nonce === 'string' && challenge.nonce
      && typeof challenge.treeDigest === 'string' && challenge.treeDigest
      && typeof challenge.packagedAt === 'string' && !Number.isNaN(Date.parse(challenge.packagedAt));
    return valid
      ? { challenge, problem: null }
      : { challenge: null, problem: `${QA_DIR}/${CHALLENGE_FILE} 缺少有效字段` };
  } catch {
    return { challenge: null, problem: `${QA_DIR}/${CHALLENGE_FILE} 无法解析` };
  }
}

/** 原文对应的凭据路径与轴 */
function receiptRelative(reportRelative) {
  return reportRelative.replace(/\.md$/, SOURCE_RECEIPT_SUFFIX);
}

function reportAxis(reportRelative) {
  return reportRelative.endsWith('-standards.md') ? 'standards' : 'spec';
}

async function readSourceReceipt(featureDir, reportRelative) {
  const relative = receiptRelative(reportRelative);
  let text;
  try {
    text = await readFile(path.join(featureDir, relative), 'utf8');
  } catch {
    return { receipt: null, relative, problem: 'missing' };
  }
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch {
    return { receipt: null, relative, problem: 'malformed' };
  }
  const valid = receipt
    && receipt.schemaVersion === 1
    && typeof receipt.feature === 'string'
    && typeof receipt.round === 'string'
    && typeof receipt.axis === 'string'
    && (receipt.axis === 'standards' || receipt.axis === 'spec')
    && typeof receipt.nonce === 'string'
    && (receipt.reviewerKind === 'subagent' || receipt.reviewerKind === 'external-session')
    && typeof receipt.host === 'string'
    && typeof receipt.reportPath === 'string'
    && /^[0-9a-f]{64}$/.test(receipt.sha256 ?? '')
    && (receipt.treeDigest === undefined || /^[0-9a-f]{64}$/.test(receipt.treeDigest))
    && (receipt.pendingIds === undefined
      || (Array.isArray(receipt.pendingIds) && receipt.pendingIds.every((id) => typeof id === 'string')))
    && typeof receipt.completedAt === 'string' && !Number.isNaN(Date.parse(receipt.completedAt));
  return valid ? { receipt, relative, problem: null } : { receipt: null, relative, problem: 'malformed' };
}

/**
 * 单轴凭据与原文、challenge 的一致性：
 * ok / missing / malformed / stale（nonce 不符）/ mismatch（文件、轮次、轴或哈希不符）。
 */
async function receiptAxisCheck(featureDir, reportRelative, challenge) {
  const report = await readFile(path.join(featureDir, reportRelative)).catch(() => null);
  const hash = report === null ? null : createHash('sha256').update(report).digest('hex');
  const checked = await readSourceReceipt(featureDir, reportRelative);
  if (!checked.receipt) return { ...checked, hash, state: checked.problem === 'missing' ? 'missing' : 'malformed' };
  const { receipt } = checked;
  const round = reportRelative.match(/r(\d+)-(?:standards|spec-axis)\.md$/)?.[1];
  // nonce 先判：跨特性、旧轮次或旧 collect 的凭据都按「来源过期」BLOCKED，而不是结构不符 FAIL
  if (receipt.nonce !== challenge.nonce) return { ...checked, hash, state: 'stale' };
  if (receipt.feature !== challenge.feature) return { ...checked, hash, state: 'mismatch', reason: '特性路径' };
  if (receipt.round !== `r${round}`) return { ...checked, hash, state: 'mismatch', reason: '轮次' };
  if (receipt.axis !== reportAxis(reportRelative)) return { ...checked, hash, state: 'mismatch', reason: '轴' };
  if (receipt.reportPath !== reportRelative) return { ...checked, hash, state: 'mismatch', reason: '原文路径' };
  if (!hash || receipt.sha256 !== hash) return { ...checked, hash, state: 'mismatch', reason: '原文哈希' };
  return { ...checked, hash, state: 'ok' };
}

/** 显式绑定的原文与最终返回精确比较，返回门禁问题、提示与缺陷事件时间 */
async function auditTranscriptProvenance(root, latestFiles, featureDir, packageTime, requiredIds, rows) {
  const issues = [];
  const findingTimes = new Map();
  if (!root || !latestFiles?.standards || !latestFiles?.spec) return { issues: [], notes: [], findingTimes, verifiedAxes: 0 };
  const scanned = await scanClaudeTranscripts(root);
  if (!scanned.readable) {
    return {
      issues,
      notes: [`转录核验：来源未核验（${latestFiles.standards}、${latestFiles.spec}）；无法读取 Claude Code 会话目录，请人工核对审查来源。`],
      findingTimes,
      verifiedAxes: 0,
    };
  }
  const notes = [];
  if (!await codeReviewInvoked(scanned.sessionFiles, packageTime)) {
    notes.push('转录核验：最新审查包之后的主会话转录中没有 code-review 的 Skill 调用；审查应在 collect 后用 Skill 工具调用 code-review，请人工确认审查来源。');
  }
  const transcripts = scanned.transcripts;
  if (!transcripts.length) {
    notes.push(`转录核验：来源未核验（${latestFiles.standards}、${latestFiles.spec}）；没有可读取的子代理转录，请人工核对审查来源。`);
    return { issues, notes, findingTimes, verifiedAxes: 0 };
  }

  const unmatched = [];
  const mismatched = [];
  const missingReturns = [];
  const missingInputs = [];
  const stale = [];
  const timeUnknown = [];
  const feature = path.relative(root, await realpath(featureDir)).split(path.sep).join('/');
  for (const row of rows ?? []) {
    const round = Number(row.trajectory.match(/\br(\d+)\b/)?.[1]);
    if (!Number.isFinite(round)) continue;
    const binding = `${feature}|r${round}|${axisOf(row.id)}`;
    const candidates = transcripts.filter((item) => item.binding === binding && Number.isFinite(item.time));
    if (candidates.length === 1) findingTimes.set(row.id, candidates[0].time);
  }
  const round = latestFiles.standards.match(/review\/(r\d+)-standards\.md$/)?.[1];
  let verified = 0;
  for (const [axis, relative] of [['standards', latestFiles.standards], ['spec', latestFiles.spec]]) {
    const raw = normalizeForTranscript(await readFile(path.join(featureDir, relative), 'utf8'));
    const binding = `${feature}|${round}|${axis}`;
    const bound = transcripts.filter((item) => item.binding === binding);
    if (round !== 'r1' && bound.length === 1) {
      missingInputs.push(...requiredIds.filter((id) => axisOf(id) === axis && !new RegExp(`\\[${id}\\]|\\b${id}\\b`).test(bound[0].prompt)));
    }
    const matched = bound.length === 1 ? bound[0] : null;
    if (!matched) {
      unmatched.push(relative);
      continue;
    }
    if (!matched.final) {
      missingReturns.push(relative);
      continue;
    }
    if (!Number.isFinite(matched.time)) timeUnknown.push(relative);
    if (Number.isFinite(matched.time) && packageTime !== null && matched.time < packageTime) {
      stale.push(relative);
    } else if (raw !== matched.final) {
      mismatched.push(relative);
    }
    if (matched.final && raw === matched.final && Number.isFinite(matched.time)
      && (!(packageTime !== null && matched.time < packageTime))) verified += 1;
  }
  if (missingInputs.length) {
    issues.push(issue('REVIEW_REINPUT_MISSING', 'FAIL', `复审子代理实际输入缺少待复核编号：${[...new Set(missingInputs)].join('、')}。`, '按分流表把待复核编号及理由交给对应轴重新复审；最终返回中的编号不能代替实际输入。'));
  }
  if (missingReturns.length) {
    issues.push(issue('REVIEW_SOURCE_MISSING', 'BLOCKED', `已定位审查任务，但以下轴没有真实最终返回：${missingReturns.join('、')}。`, '保持待独立审查，不得由主代理代写或补全原文；由独立会话或人工接续。'));
  }
  if (stale.length) {
    issues.push(issue('REVIEW_SOURCE_STALE', 'BLOCKED', `最新审查返回的事件时间早于当前 tree 的 collect：${stale.join('、')}。`, '在当前审查包之后重新执行双轴审查；不要通过 touch 原文或转录来消除此问题。'));
  }
  if (mismatched.length) {
    issues.push(issue('REVIEW_SOURCE_MISMATCH', 'FAIL', `审查原文与对应子代理最终返回不一致：${mismatched.join('、')}。`, '旧轮次可按该轮子代理的真实最终返回逐字纠正当轮原文，不得润色或补结论；有 challenge 的新协议按新轮次重新审查，不得改原文或重算凭据；无法定位来源时保持待人工核验。'));
  }
  if (timeUnknown.length) {
    notes.push(`转录核验：来源时间未核验（${timeUnknown.join('、')}）；最终返回缺少可靠事件时间，请人工核对它是否对应当前 collect。`);
  }
  if (unmatched.length) {
    notes.push(`转录核验：来源未核验（${unmatched.join('、')}）；无法关联当前特性、轮次与轴的唯一子代理转录，请人工核对审查来源。`);
  }
  return { issues, notes, findingTimes, verifiedAxes: verified };
}

/** 集中解析单轴在转录核验阶段的轮次、nonce、时间下限与复审输入校验开关 */
function axisTranscriptTarget(axis, challenge, result, reusedItem) {
  if (!reusedItem) {
    return {
      binding: `${challenge.feature}|${challenge.round}|${axis}`,
      nonce: challenge.nonce,
      minTime: Date.parse(challenge.packagedAt),
      checkReinput: challenge.round !== 'r1',
    };
  }
  if (result?.state !== 'ok' || !result.receipt?.round || !result.receipt?.nonce) {
    return null;
  }
  const receiptPackagedAt = Date.parse(result.receipt.packagedAt ?? '');
  return {
    binding: `${challenge.feature}|${result.receipt.round}|${axis}`,
    nonce: result.receipt.nonce,
    // 复用轴已由同 treeDigest 与原文哈希约束；凭据含 packagedAt 时校验，否则不拿当轮刷新后的 collect 时间误杀旧轮转录
    minTime: Number.isFinite(receiptPackagedAt) ? receiptPackagedAt : null,
    checkReinput: false,
  };
}

/**
 * 新协议（有 challenge）的来源核验：
 * 先校验两轴自述凭据，再用同 nonce 的 Claude Code 转录做更强的哈希行核对。
 * 找不到转录不判失败；只有可证明的矛盾才 FAIL/BLOCKED。
 */
async function auditReceiptSources(root, latestFiles, featureDir, challenge, requiredIds, rows, declaredHost, manifest, reused = []) {
  const issues = [];
  const notes = [];
  const findingTimes = new Map();
  const reusedByAxis = new Map(reused.map((item) => [item.axis, item]));
  // 双轴原文未齐全时，REVIEW_RAW_MISSING 已给出 BLOCKED；这里只补强度行，不能让 undefined 进入路径拼接
  if (!latestFiles?.standards || !latestFiles?.spec) {
    notes.push('来源核验：未核验（人工）');
    return { issues, notes, findingTimes };
  }
  const axes = [['standards', latestFiles.standards], ['spec', latestFiles.spec]];
  const results = new Map();
  if (manifest && challenge.treeDigest !== manifest.treeDigest) {
    issues.push(issue(
      'REVIEW_SOURCE_MISMATCH',
      'FAIL',
      `challenge 的 treeDigest 与当前审查包不一致（${challenge.treeDigest.slice(0, 12)} / ${String(manifest.treeDigest).slice(0, 12)}）。`,
      '重新 collect 后用同一 challenge 审查；不要手改 challenge 或审查包。',
    ));
  }
  if (manifest && challenge.packagedAt !== manifest.packagedAt) {
    issues.push(issue(
      'REVIEW_SOURCE_MISMATCH',
      'FAIL',
      'challenge 的 packagedAt 与当前审查包不一致。',
      '重新 collect 后用同一 challenge 审查；不要手改 challenge 或审查包。',
    ));
  }
  const hostMismatch = [];
  for (const [axis, relative] of axes) {
    const reusedItem = reusedByAxis.get(axis);
    if (reusedItem) {
      // 单轴复用：不看 nonce，只核对原文哈希与该轴审查时的 treeDigest 是否仍是当前审查包
      const checked = await readSourceReceipt(featureDir, relative);
      const report = await readFile(path.join(featureDir, relative)).catch(() => null);
      const hash = report === null ? null : createHash('sha256').update(report).digest('hex');
      const valid = Boolean(
        checked.receipt
        && checked.receipt.treeDigest === challenge.treeDigest
        && hash
        && checked.receipt.sha256 === hash,
      );
      results.set(axis, { ...checked, hash, state: valid ? 'ok' : 'mismatch' });
      if (valid) {
        notes.push(`来源核验：${relative} 沿用第 r${reusedItem.round} 轮原文（与当前审查包同一 treeDigest，且该轴无待复核编号）。`);
      } else {
        issues.push(issue(
          'REVIEW_RAW_MISSING',
          'BLOCKED',
          `${relative} 无法复用于当前审查包（treeDigest 或原文哈希不一致）。`,
          '重新 collect 后对该轴做增量复审；不要手改凭据。',
        ));
      }
      continue;
    }
    const result = await receiptAxisCheck(featureDir, relative, challenge);
    results.set(axis, result);
    if (result.state === 'missing') {
      notes.push(`来源核验：${relative} 缺少自述凭据（${receiptRelative(relative)}）；请人工核对审查来源。`);
    } else if (result.state === 'malformed') {
      notes.push(`来源核验：${relative} 的自述凭据格式错误；请人工核对审查来源。`);
    } else if (result.state === 'stale') {
      issues.push(issue(
        'REVIEW_SOURCE_STALE',
        'BLOCKED',
        `${relative} 的凭据 nonce 与当前 challenge 不一致。`,
        '使用当前 collect 的 challenge 重新审查并 seal；不要手改凭据。',
      ));
    } else if (result.state === 'mismatch') {
      issues.push(issue(
        'REVIEW_SOURCE_MISMATCH',
        'FAIL',
        `${relative} 的自述凭据与原文不一致（${result.reason}）。`,
        '按当前轮次重新写原文并 seal；凭据不得由主代理改写或重算。',
      ));
    } else if (Date.parse(result.receipt.completedAt) < Date.parse(challenge.packagedAt)) {
      notes.push(`来源核验：${relative} 的自述时间早于 collect；请人工核对它是否对应当前审查包。`);
    }
    if (declaredHost && result.state === 'ok' && result.receipt.host.toLowerCase() !== declaredHost.name.toLowerCase()) {
      hostMismatch.push(`${relative}（${result.receipt.host}）`);
    }
  }
  if (hostMismatch.length) {
    notes.push(`来源核验：审查方式声明的宿主与凭据 host 不一致：${hostMismatch.join('、')}；请人工核对。`);
  }

  // 新协议下声明与凭据均为非 Claude Code 宿主时，Claude 转录核验不适用，直接按自述凭据（弱）处理
  const bothReceipt = results.get('standards')?.state === 'ok' && results.get('spec')?.state === 'ok';
  const receiptHosts = ['standards', 'spec'].map((axis) => results.get(axis)?.receipt?.host);
  const skipTranscriptScan = Boolean(
    declaredHost && !declaredHost.claude
    && bothReceipt
    && receiptHosts.every((host) => typeof host === 'string' && !/^claude code$/i.test(host)),
  );
  if (skipTranscriptScan) {
    notes.push(`来源核验：声明宿主 ${declaredHost.name} 与凭据 host 均非 Claude Code，跳过 Claude 转录扫描。`);
  }

  const scanned = skipTranscriptScan ? { skipped: true, sessionFiles: [], transcripts: [] } : await scanClaudeTranscripts(root);
  const strong = new Set();
  const missingInputs = [];
  let invokedCodeReview = true;
  if (skipTranscriptScan) {
    // 不做 Claude 转录核验；强度行由下方 bothReceipt 判定为自述凭据（弱）
  } else if (!scanned.readable) {
    notes.push('来源核验：无法读取 Claude Code 会话目录；按自述凭据或人工核验。');
  } else {
    invokedCodeReview = await codeReviewInvoked(scanned.sessionFiles, Date.parse(challenge.packagedAt));
    if (!invokedCodeReview) {
      notes.push('转录核验：collect 之后的主会话转录中没有 code-review 的 Skill 调用；请人工确认审查来源。');
    }
    for (const [axis, relative] of axes) {
      const result = results.get(axis);
      const target = axisTranscriptTarget(axis, challenge, result, reusedByAxis.get(axis));
      if (!target) continue;
      const candidates = scanned.transcripts.filter((item) => item.binding === target.binding && item.nonce === target.nonce);
      if (!candidates.length) continue;
      if (candidates.length > 1) {
        notes.push(`来源核验：${relative} 找到多个同 nonce 的子代理转录，无法唯一定位；请人工核对审查来源。`);
        continue;
      }
      const candidate = candidates[0];
      if (!candidate.receiptLine.hash || candidate.receiptLine.nonce !== target.nonce) {
        notes.push(`来源核验：${relative} 的同 nonce 转录没有可用的凭据行；按自述凭据或人工核验。`);
        continue;
      }
      if (!result.hash || candidate.receiptLine.hash !== result.hash) {
        issues.push(issue(
          'REVIEW_SOURCE_MISMATCH',
          'FAIL',
          `${relative} 的子代理转录凭据行与磁盘原文哈希不一致。`,
          '按该子代理真实最终返回与磁盘原文核对；不得润色或补结论。',
        ));
        continue;
      }
      if (!Number.isFinite(candidate.time)) {
        notes.push(`来源核验：${relative} 的转录时间无法确认；请人工核对它是否对应当前 collect。`);
        continue;
      }
      if (target.minTime !== null && candidate.time < target.minTime) {
        issues.push(issue(
          'REVIEW_SOURCE_STALE',
          'BLOCKED',
          `${relative} 的子代理最终返回早于当前 collect。`,
          '在当前审查包之后重新执行双轴审查；不要通过 touch 原文或转录来消除此问题。',
        ));
        continue;
      }
      if (target.checkReinput) {
        missingInputs.push(...requiredIds.filter((id) => axisOf(id) === axis && !new RegExp(`\\[${id}\\]|\\b${id}\\b`).test(candidate.prompt)));
      }
      strong.add(axis);
    }
  }
  if (missingInputs.length) {
    issues.push(issue(
      'REVIEW_REINPUT_MISSING',
      'FAIL',
      `复审子代理实际输入缺少待复核编号：${[...new Set(missingInputs)].join('、')}。`,
      '按分流表把待复核编号及理由交给对应轴重新复审；最终返回中的编号不能代替实际输入。',
    ));
  }

  for (const [axis, relative] of axes) {
    if (strong.has(axis)) continue;
    const result = results.get(axis);
    if (result.state !== 'ok') continue;
    const required = requiredIds.filter((id) => axisOf(id) === axis);
    if (!required.length) continue;
    const provided = new Set(result.receipt.pendingIds ?? []);
    const missing = required.filter((id) => !provided.has(id));
    if (missing.length) {
      notes.push(`来源核验：${relative} 的自述凭据缺少复审必交编号 ${missing.join('、')}；请人工核对复审输入。`);
    }
  }

  // 同 binding 命中多条转录时无法唯一定位，不静默覆盖事件时间，交由下方同名凭据回退核对
  const bindingCounts = new Map();
  for (const item of scanned.transcripts) {
    if (item.binding) bindingCounts.set(item.binding, (bindingCounts.get(item.binding) ?? 0) + 1);
  }
  const transcriptTimes = new Map();
  for (const item of scanned.transcripts) {
    if (item.binding && bindingCounts.get(item.binding) === 1 && Number.isFinite(item.time)) {
      transcriptTimes.set(item.binding, item.time);
    }
  }
  for (const row of rows ?? []) {
    const round = Number(row.trajectory.match(/\br(\d+)\b/)?.[1]);
    if (!Number.isFinite(round)) continue;
    const axis = axisOf(row.id);
    const time = transcriptTimes.get(`${challenge.feature}|r${round}|${axis}`);
    if (Number.isFinite(time)) {
      findingTimes.set(row.id, time);
      continue;
    }
    const relative = `review/r${round}-${axis === 'standards' ? 'standards' : 'spec-axis'}.md`;
    const checked = await readSourceReceipt(featureDir, relative);
    if (checked.receipt) {
      const parsed = Date.parse(checked.receipt.completedAt);
      if (Number.isFinite(parsed)) findingTimes.set(row.id, parsed);
    }
  }

  const bothStrong = strong.has('standards') && strong.has('spec');
  // 仅当未复用轴中存在任意强转录时才免除；防止 r2+ 复用一轴强转录时另一未复用轴自签 Claude subagent 逃逸
  const hasUnreusedStrong = axes.some(([axis]) => !reusedByAxis.has(axis) && strong.has(axis));
  // Claude Code 主会话目录可读且存在项目主会话转录、任一未复用轴自称为 Claude Code subagent，却既无 code-review 调用又无任何未复用轴同 nonce 子代理转录时硬拦截
  if (!skipTranscriptScan && scanned.readable && scanned.sessionFiles.length > 0 && !invokedCodeReview && !hasUnreusedStrong) {
    const claimedClaudeSubagent = axes.some(([axis]) => {
      if (reusedByAxis.has(axis)) return false;
      const receipt = results.get(axis)?.receipt;
      return receipt?.reviewerKind === 'subagent' && (!receipt.host || /^claude code$/i.test(receipt.host));
    });
    if (claimedClaudeSubagent) {
      issues.push(issue(
        'REVIEW_PROVENANCE_UNVERIFIED',
        'BLOCKED',
        'Claude Code 主会话存在转录但未调用 code-review，且无任何同 nonce 子代理转录；禁止主代理自签 subagent 凭据。',
        'collect 后通过 Skill 工具调用 code-review 完成独立双轴审查；无子代理能力时由独立外部会话审查并用 external-session 封存。',
      ));
    }
  }
  if (bothStrong) notes.push('来源核验：转录（强）');
  else if (bothReceipt) notes.push('来源核验：自述凭据（弱）');
  else notes.push('来源核验：未核验（人工）');
  return { issues, notes, findingTimes };
}

async function currentReviewCompletedAt(featureDir, latestFiles) {
  if (!latestFiles?.standards || !latestFiles?.spec) return null;
  const times = [];
  for (const relative of [latestFiles.standards, latestFiles.spec]) {
    const checked = await readSourceReceipt(featureDir, relative);
    const time = Date.parse(checked.receipt?.completedAt ?? '');
    if (!Number.isFinite(time)) return null;
    times.push(time);
  }
  return Math.max(...times);
}

async function gateEvidenceIssues(featureDir, context) {
  const issues = [];
  for (const phase of ['plan', 'acceptance']) {
    const entries = await readdir(path.join(featureDir, 'evidence')).catch(() => []);
    const logs = [];
    for (const entry of entries.filter((name) => name.startsWith(`gate-${phase}-`) && name.endsWith('.log'))) {
      const log = parseRunLog(await readFile(path.join(featureDir, 'evidence', entry), 'utf8'));
      if (!log?.complete || !log.argv) continue;
      if (path.basename(log.argv[0]) !== 'node' || path.basename(log.argv[1] ?? '') !== 'qa-check.mjs' || log.argv[2] !== phase) continue;
      logs.push(log);
    }
    const valid = phase === 'plan'
      ? logs.some((log) => log.exit === 0)
      : logs.some((log) => log.tree === context.evidenceTree);
    if (!valid) {
      issues.push(issue(
        'GATE_EVIDENCE_MISSING',
        'BLOCKED',
        phase === 'plan'
          ? '缺少 exit 0 的 gate-plan-* 门禁日志。'
          : '缺少当前行为树上的完整 gate-acceptance-* 门禁日志。',
        `经 qa-run 运行 qa-check ${phase}，标签使用 gate-${phase}-*；不要手写门禁输出。`,
      ));
    }
  }
  return issues;
}

async function verificationIssues(featureDir, plan, context, { enforceOrder = false, reviewCompletedAt = null } = {}) {
  const issues = [];
  for (const declaration of plan.delivery) {
    const references = evidenceReferences(declaration.evidence);
    if (!references.paths.length) {
      issues.push(issue('MISSING_VERIFICATION', 'BLOCKED', `交付验证 ${declaration.command} 没有证据日志；请在最终代码上通过 node tooling/scripts/qa-run.mjs 真实执行`));
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
    const started = Date.parse(log.started ?? '');
    if (enforceOrder && Number.isFinite(reviewCompletedAt) && Number.isFinite(started) && started < reviewCompletedAt) {
      issues.push(issue(
        'VERIFICATION_BEFORE_REVIEW',
        'FAIL',
        `交付验证 ${declaration.command} 的开始时间 ${log.started} 早于当前双轴最晚完成时间 ${new Date(reviewCompletedAt).toISOString()}。`,
        '在当前独立审查与修复复审完成后，用新标签重跑全部交付命令；不要修改日志时间。',
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
    } else if (emptyEvidenceReason(log.body)) {
      issues.push(issue('EMPTY_VERIFICATION', 'FAIL', `交付验证 ${declaration.command} 虽 exit 0，但${emptyEvidenceReason(log.body)}`));
    }
    if (!context.evidenceTree || log.tree === 'none' || log.tree !== context.evidenceTree) {
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
  let currentQaDigest = null;
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
    if (typeof manifest.qaArtifactsDigest === 'string') {
      currentQaDigest = await computeQaArtifactsDigest(featureDir);
      if (manifest.qaArtifactsDigest !== currentQaDigest) {
        issues.push(issue(
          'STALE_QA_ARTIFACTS',
          'BLOCKED',
          `${QA_DIR}/review-package.json 的 qaArtifactsDigest 与当前 QA 产物（scripts/screenshots/qa-plan）不一致。`,
          '请先重跑 qa-check acceptance 并重新 collect 审查包，确保审查对象包含最新测试产物。',
        ));
      }
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
  const raw = await reviewRawIssues(featureDir, triage);
  issues.push(...raw.issues);
  notes.push(...(raw.notes ?? []));
  if (manifest?.specReviewChecklist) {
    try {
      if (!SUPPORTED_CHECKLIST_VERSIONS.has(manifest.specReviewChecklist.version)
        || manifest.specReviewChecklist.path !== SPEC_REVIEW_CHECKLIST_FILE) {
        throw new Error('manifest 的清单版本或路径不受支持');
      }
      const checklist = parseSpecReviewChecklist(await readFile(path.join(featureDir, SPEC_REVIEW_CHECKLIST_FILE), 'utf8'));
      if (raw.latest?.spec) {
        const specReview = await readFile(path.join(featureDir, raw.latest.spec), 'utf8');
        issues.push(...await specReviewCoverageIssues(context.root, featureDir, checklist, specReview));
      }
    } catch (error) {
      issues.push(issue('SPEC_REVIEW_CHECKLIST_STALE', 'BLOCKED', `Spec 审查清单不可用：${error.message}`));
    }
  } else if (plan.reviewCoverage === '1' || plan.reviewCoverage === '2') {
    notes.push('Spec 对账覆盖：旧审查包没有清单声明，保持人工核对；重新 collect 生成新协议审查包。');
  }
  let findingTimes = new Map();
  const host = reportText ? declaredReviewHost(reportText) : null;
  const requiredIds = raw.requiredIds;
  const challengeInfo = await readReviewChallenge(featureDir);
  if (challengeInfo.challenge && raw.latest) {
    // 新协议：按证据判定，宿主声明只用于提示不一致；没有同 nonce 转录时降为自述凭据或人工
    const provenance = await auditReceiptSources(context.root, raw.latest, featureDir, challengeInfo.challenge, requiredIds, raw.rows, host, manifest, raw.reused);
    issues.push(...provenance.issues);
    notes.push(...provenance.notes);
    findingTimes = provenance.findingTimes;
  } else {
    if (challengeInfo.challenge && !raw.latest) notes.push('来源核验：未核验（人工）');
    if (challengeInfo.problem) notes.push(`来源核验：${challengeInfo.problem}；按旧协议处理，请人工核对 challenge。`);
    // 旧轮次兼容：声明为非 Claude Code 时跳过转录核验，未声明时沿用原检查
    if (host && !host.claude) {
      notes.push(`转录核验：审查方式行声明宿主为 ${host.name}，Claude Code 转录核验不适用；请人工按审查方式行到该宿主的会话记录核对审查来源。`);
      if (raw.latest) notes.push('来源核验：未核验（人工）');
    } else if (raw.latest) {
      const provenance = await auditTranscriptProvenance(context.root, raw.latest, featureDir, packageTime, requiredIds, raw.rows);
      issues.push(...provenance.issues);
      notes.push(...provenance.notes);
      notes.push(provenance.verifiedAxes >= 2 ? '来源核验：旧协议（转录全等比对）' : '来源核验：未核验（人工）');
      findingTimes = provenance.findingTimes;
    }
  }
  issues.push(...await fixVerificationIssues(featureDir, raw.rows, triage?.evidenceColumn, findingTimes));

  const hasChecklist = Boolean(manifest?.specReviewChecklist);
  const dualDigestUnchanged = Boolean(
    currentQaDigest !== null
    && context.tree
    && manifest.treeDigest === context.tree
    && manifest.qaArtifactsDigest === currentQaDigest,
  );
  // 双指纹（treeDigest + qaArtifactsDigest）均未变时免除 VERIFICATION_BEFORE_REVIEW；gateEvidence 与人工时序提示在有清单时仍正常执行
  const enforceOrder = hasChecklist && !dualDigestUnchanged;
  const reviewCompletedAt = hasChecklist ? await currentReviewCompletedAt(featureDir, raw.latest) : null;
  if (hasChecklist) {
    if (!Number.isFinite(reviewCompletedAt)) {
      notes.push('交付时序：当前有效双轴缺少可用 completedAt，最终命令与审查的先后交人工核对。');
    }
    issues.push(...await gateEvidenceIssues(featureDir, context));
  }

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
  issues.push(...await verificationIssues(featureDir, plan, context, { enforceOrder, reviewCompletedAt }));
  return { ...summarize(issues, notes), rawLines: raw.rawLines };
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
  const checklistVersion = plan.reviewCoverage === '2' ? SPEC_REVIEW_CHECKLIST_V2 : SPEC_REVIEW_CHECKLIST_VERSION;
  findings.issues.push(...await reconciliationIssues(featureDir, acceptance.table, {
    checklistRequired: plan.reviewCoverage === '1' || plan.reviewCoverage === '2',
    checklistVersion,
  }));
  return { ...await checkReview(featureDir, plan, context, findings), table: acceptance.table };
}

const RECONCILIATION_FILE = `${QA_DIR}/reconciliation.md`;

/** 对账表的 markdown 行；终端输出与 _qa/reconciliation.md 共用 */
function reconciliationLines(table) {
  return [
    '| 用例-断言 | 状态 | 冻结断言原文 / 当前断言 | 实测值、原因或绑定 | 标注 |',
    '| --- | --- | --- | --- | --- |',
    ...table.map((row) => `| ${row.id} | ${row.status} | ${tableCell(row.assertion)} | ${tableCell(row.actual)} | ${row.flag} |`),
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
async function reconciliationIssues(featureDir, table, { checklistRequired = false, checklistVersion = SPEC_REVIEW_CHECKLIST_VERSION } = {}) {
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
  const expectedChecklist = specReviewChecklistDocument(table, { version: checklistVersion });
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
  if (report.rawLines?.length) {
    lines.push(
      '',
      '原文核对（仅供人工核对，非结论：逐行确认分流表处置状态与审查原文一致）',
      '| 编号 | 处置状态 | 最后出现位置 | 原文摘录 |',
      '| --- | --- | --- | --- |',
      ...report.rawLines.map((row) => `| ${row.id} | ${tableCell(row.disposition)} | ${row.location} | ${tableCell(row.excerpt)} |`),
      '',
    );
  }
  lines.push(`结果: ${report.status}`);
  if (report.status !== 'PASS' && report.issues.length) {
    lines.push(`阻塞原因：${[...new Set(report.issues.map((item) => item.code))].join('、')}`);
  }
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
        const planText = await readFile(path.join(featureDir, 'qa-plan.md'), 'utf8');
        const checklistTarget = path.join(featureDir, SPEC_REVIEW_CHECKLIST_FILE);
        const skeletonTarget = path.join(featureDir, SPEC_REVIEW_SKELETON_FILE);
        const coverageMatch = planText.match(/^QA Review Coverage:\s*(1|2)\s*$/m);
        if (coverageMatch) {
          const checklistVersion = Number(coverageMatch[1]);
          const checklistJson = specReviewChecklistDocument(report.table, { version: checklistVersion });
          await writeFile(checklistTarget, checklistJson);
          if (checklistVersion === SPEC_REVIEW_CHECKLIST_V2) {
            await writeFile(skeletonTarget, specReviewSkeletonDocument(parseSpecReviewChecklist(checklistJson)));
          } else {
            await rm(skeletonTarget, { force: true });
          }
        } else {
          await rm(checklistTarget, { force: true });
          await rm(skeletonTarget, { force: true });
        }
      } else {
        await rm(target, { force: true });
        await rm(path.join(featureDir, SPEC_REVIEW_CHECKLIST_FILE), { force: true });
        await rm(path.join(featureDir, SPEC_REVIEW_SKELETON_FILE), { force: true });
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
