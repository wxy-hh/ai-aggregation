import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCRIPT_EXTENSIONS,
  SCRIPTS_DIR,
  escapeRegExp,
  evidenceLocation,
  expandWorkspacePatterns,
  gitRoot,
  issue,
  workspacePatterns,
} from './plan.mjs';

// 绕过真实登录的模式：注入 Cookie、写认证或令牌类本地存储键、脚本内登录（检查器内置，不按宿主开关）
const AUTH_BYPASS_PATTERNS = [
  { label: 'CDP 设置 Cookie', pattern: /\b(?:Network|Storage)\.setCookies?\b/ },
  { label: '浏览器上下文添加 Cookie', pattern: /\.addCookies\s*\(/ },
  { label: '写 document.cookie', pattern: /\bdocument\.cookie\s*=(?!=)/ },
  { label: '本地存储写入认证或令牌类键', pattern: /\b(?:localStorage|sessionStorage)\s*(?:\.setItem\s*\(\s*['"`][^'"`]*(?:token|auth|session)|\[\s*['"`][^'"`]*(?:token|auth|session)[^'"`]*['"`]\s*\]\s*=(?!=))/i },
  { label: '密码字面量', pattern: /\b[\w$]*(?:password|passwd|pwd)[\w$]*['"]?\s*[:=]\s*(['"`])(?!\1)[^'"`\n]+\1/i },
  { label: '登录、注册或签发令牌接口', pattern: /\/api\/(?:[\w.-]+\/)*(?:log-?in|sign-?in|register|sign-?up|token)(?=[/?#'"`\s]|$)/im },
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

/** 从 argv 中提取可能的文件路径：整个参数、按空白与引号等拆出的片段，以及 file:// URL */
export function argvPathCandidates(argv) {
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

/** 把日志 script 头字段及 argv 中的路径候选解析为真实存在的文件绝对路径（跟随符号链接），按出现顺序去重 */
export async function argvExistingFiles(log, bases, root = null) {
  const files = [];
  const rawCandidates = [];
  if (typeof log?.script === 'string' && log.script.trim()) rawCandidates.push(log.script.trim());
  rawCandidates.push(...argvPathCandidates(log.argv ?? []));
  const allBases = root ? [...new Set([root, ...bases])] : bases;
  for (const candidate of rawCandidates) {
    const absolutes = path.isAbsolute(candidate) ? [candidate] : allBases.map((base) => path.resolve(base, candidate));
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

/** 剥离字符串字面量两端的单/双引号并展开确定性脚本目录变量 */
function expandShellScriptVars(rawValue, vars) {
  let value = String(rawValue ?? '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  value = value
    .replace(/\$\{SCRIPT_DIR\}\//g, '$DIR/')
    .replace(/\$SCRIPT_DIR\//g, '$DIR/');
  for (const [name, resolved] of vars) {
    value = value.replaceAll(`\${${name}}`, resolved).replaceAll(`$${name}`, resolved);
  }
  return value;
}

/** 只提取可确定解析的本地引用：静态相对导入、Shell 重定向以及 SCRIPT_DIR/脚本变量赋值闭包 */
function scriptReferenceTargets(text) {
  const targets = importedSpecifiers(text).filter((specifier) => /^\.\.?(?:\/|$)/.test(specifier));
  const vars = new Map();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const assign = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (!assign) continue;
    const [, name, rhs] = assign;
    if (/dirname\s+["']?\$0["']?/.test(rhs)) {
      vars.set(name, '$DIR');
      continue;
    }
    const expanded = expandShellScriptVars(rhs, vars);
    if (expanded.startsWith('$DIR/') || expanded.startsWith('${DIR}/') || /^\.\.?\//.test(expanded) || path.isAbsolute(expanded)) {
      vars.set(name, expanded);
    }
  }
  for (const match of text.matchAll(/(?<!<)<(?!<)\s*(?:"([^"]+)"|'([^']+)'|([^\s;|]+))/g)) {
    const target = expandShellScriptVars(match[1] ?? match[2] ?? match[3] ?? '', vars);
    if (target.startsWith('$DIR/') || target.startsWith('${DIR}/') || path.isAbsolute(target)) targets.push(target);
  }
  for (const value of vars.values()) {
    if (value !== '$DIR' && SCRIPT_EXTENSIONS.has(path.posix.extname(value).toLowerCase())) {
      const owner = [...vars.entries()].find(([, v]) => v === value)?.[0];
      if ((owner && text.includes(`$${owner}`)) || (owner && text.includes(`\${${owner}}`)) || value.startsWith('$DIR/')) {
        targets.push(value);
      }
    }
  }
  for (const match of text.matchAll(/(?:\$\{?(?:SCRIPT_DIR|DIR)\}?\/)([^\s"'`;|&>]+)/g)) {
    const candidate = `$DIR/${match[1]}`;
    if (SCRIPT_EXTENSIONS.has(path.posix.extname(candidate).toLowerCase())) targets.push(candidate);
  }
  return [...new Set(targets)];
}

function resolveScriptReference(file, target) {
  if (target.startsWith('$DIR/')) return path.join(path.dirname(file), target.slice(5));
  if (target.startsWith('${DIR}/')) return path.join(path.dirname(file), target.slice(6));
  if (path.isAbsolute(target)) return target;
  return path.resolve(path.dirname(file), target);
}

/** 返回日志 argv 及其确定性本地引用闭包内、位于特性目录 scripts/ 的过程脚本相对路径 */
export async function referencedProcessScripts(featureDir, logs, root) {
  const featureRoot = await realpath(featureDir);
  const scripts = new Set();
  const visited = new Set();
  const pending = [];
  for (const log of logs) {
    const bases = root ? [path.resolve(root, log.cwd ?? '.')] : [];
    pending.push(...await argvExistingFiles(log, bases, root));
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
export function importedSpecifiers(text) {
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

/** 工作区中 dependencies 直接含数据存储驱动的包；只看 dependencies，不沿传递依赖扩散 */
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

function isRegexStart(text, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = text[cursor];
    if (/\s/.test(char)) continue;
    return !/[\w$)\]}"'`]/.test(char);
  }
  return true;
}

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

/** 扫描 scripts/ 下全部脚本：绕过登录为不可豁免 FAIL；合成输入与响应注入按 NOTE 与对账标注处理 */
export async function scanProcessScripts(featureDir) {
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
