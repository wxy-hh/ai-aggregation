#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { splitMarkdownRow } from './qa-spec-review.mjs';

// DESIGN.md §2.2、§2.3 与 §2.4 白名单固定十六进制色值（统一大写比对）
const WHITELIST_HEX_COLORS = new Set([
  '#4969E9', '#7D91FF', '#5D7CFA', '#7C5CF6', '#2F6BFF',
  '#E7C873', '#A78BFA', '#B47818', '#F3D17A', '#7B8FFF',
  '#D9A84E', '#0A0B10', '#F8FAFF', '#EEF2F9', '#E9EEF6',
  '#07080D', '#0C0E16', '#10131C', '#10152E', '#0A0E20',
  '#06081A', '#0D1226', '#090E20', '#0E1430', '#121832',
  '#040711', '#0C132B', '#A6AED2', '#828BB0', '#64748B',
  '#F5D491', '#F0C96A', '#C9E4F5', '#8FD8F0', '#C4B5FD',
  '#F6C3D8', '#F0A6C6', '#F6A89D', '#F0856F', '#F3D9A8',
  '#E0B45E', '#D8CEB0', '#C9BC8E', '#9BD8D3', '#66C9C0',
  '#AEC6F6', '#7FA3EC', '#CDB4E8', '#AB8BD4',
]);

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const UI_EXTENSIONS = new Set(['.ts', '.tsx', '.jsx', '.css']);
const TSX_EXTENSIONS = new Set(['.tsx', '.jsx']);
const COMMENT_WHITELIST = /(?:https?:\/\/|@ts-(?:ignore|expect-error|nocheck)|eslint-disable|eslint-enable|prettier-ignore|vite-ignore|istanbul ignore|c8 ignore|v8 ignore)/i;
const NOOP_COMMANDS = new Set(['true', ':', 'echo', 'echo ok', 'echo pass', 'echo PASS', 'exit 0']);
const TOUCH_TARGET_GAP = /\bh-(?:7|8|9|10)\b/;
const TOUCH_TARGET_GUARD = /\b(?:min-h-\[44px\]|min-h-11|h-11|h-12)\b/;

function git(cwd, args, allowFailure = false) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function makeFinding(level, code, message, hint = '') {
  return hint ? { level, code, message, hint } : { level, code, message };
}

/** 扫描过程脚本中的字面伪断言、裸打印 PASS 与缺少非零退出码保护 */
async function scanScriptsForPseudoAssertions(featureDir) {
  const findings = [];
  const scriptsDir = path.join(featureDir, 'scripts');
  const entries = await readdir(scriptsDir, { recursive: true }).catch(() => []);
  for (const entry of entries.sort()) {
    const ext = path.posix.extname(entry).toLowerCase();
    if (!['.mjs', '.js', '.cjs', '.ts'].includes(ext)) continue;
    const relative = path.posix.join('scripts', entry.split(path.sep).join('/'));
    const text = await readFile(path.join(scriptsDir, entry), 'utf8').catch(() => '');
    const lines = text.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (/\b(?:check\s*\(\s*true\b|assert(?:\.ok)?\s*\(\s*true\s*(?:,|\))|expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\))/.test(line)) {
        findings.push(makeFinding(
          'ERROR',
          'PSEUDO_ASSERTION',
          `${relative}:${index + 1} 存在字面永真伪断言（check(true) / assert(true) / expect(true).toBe(true)）`,
          '改为先计算并对比真实状态布尔值，不得对字面 true 做永真断言。',
        ));
      }
    });

    const passLogLines = [];
    lines.forEach((line, index) => {
      if (/console\.(?:log|info)\s*\([^)]*\[TC\d+-\d+\]\s*PASS/.test(line)) {
        passLogLines.push({ line, lineNumber: index + 1 });
      }
    });
    if (passLogLines.length) {
      const hasFailureExit = /process\.exitCode\s*=(?!\s*0\b)|process\.exit\s*\((?!\s*0\b)|throw\s+new\s+|\bassert(?:\.|\s*\()|\bexpect\s*\(|\bcheck\s*\(|\bcapture(?:Target|Mobile)Geometry\s*\(/.test(text);
      if (!hasFailureExit) {
        findings.push(makeFinding(
          'ERROR',
          'PSEUDO_ASSERTION',
          `${relative}:${passLogLines.map((item) => item.lineNumber).join(',')} 输出 PASS 标记但脚本缺少非零退出或硬断言分支`,
          '为每条 PASS 输出前置硬断言并在失败分支输出 FAIL 及设置非零退出码。',
        ));
      }
    }
  }
  return findings;
}

function extractSpecCommands(specMarkdown) {
  const match = specMarkdown.match(/^## 交付命令\s*\n+```[^\n]*\n([\s\S]*?)```/m);
  if (!match) return null;
  return match[1].split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

function extractPlanDeliveryCommands(planMarkdown) {
  const lines = planMarkdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## 交付验证\s*$/.test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const commands = [];
  for (const line of lines.slice(start + 1, end < 0 ? lines.length : end)) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (match) commands.push(match[1].trim());
  }
  return commands;
}

/** 校验 spec.md 与 qa-plan.md 的交付命令一致性，并拦截空操作占位命令 */
async function checkDeliveryCommandsConsistency(featureDir) {
  const findings = [];
  const [specText, planText] = await Promise.all([
    readFile(path.join(featureDir, 'spec.md'), 'utf8').catch(() => ''),
    readFile(path.join(featureDir, 'qa-plan.md'), 'utf8').catch(() => ''),
  ]);
  const planCommands = extractPlanDeliveryCommands(planText);
  if (planCommands) {
    for (const cmd of planCommands) {
      if (NOOP_COMMANDS.has(cmd)) {
        findings.push(makeFinding(
          'ERROR',
          'NOOP_DELIVERY_COMMAND',
          `qa-plan.md 的 ## 交付验证 包含空操作命令：\`${cmd}\``,
          '替换为真实可证伪的测试、构建或检查命令。',
        ));
      }
    }
  }
  const specCommands = extractSpecCommands(specText);
  if (specCommands && planCommands) {
    const planSet = new Set(planCommands);
    for (const cmd of specCommands) {
      if (!planSet.has(cmd)) {
        findings.push(makeFinding(
          'ERROR',
          'DELIVERY_COMMAND_MISMATCH',
          `spec.md 交付命令未原样进入 qa-plan.md：\`${cmd}\``,
          '将 spec.md 的 ## 交付命令逐字同步到 qa-plan.md 的 ## 交付验证。',
        ));
      }
    }
  }
  return findings;
}

function collectAddedLinesFromUnifiedDiff(diffText) {
  const byFile = new Map();
  let currentFile = null;
  let newLine = 0;
  for (const rawLine of diffText.split(/\r?\n/)) {
    if (rawLine.startsWith('+++ b/')) {
      currentFile = rawLine.slice(6).trim();
      if (!byFile.has(currentFile)) byFile.set(currentFile, []);
      continue;
    }
    if (rawLine.startsWith('+++ /dev/null')) {
      currentFile = null;
      continue;
    }
    const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!currentFile) continue;
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      byFile.get(currentFile).push({ lineNumber: newLine, text: rawLine.slice(1) });
      newLine += 1;
    } else if (!rawLine.startsWith('-')) {
      newLine += 1;
    }
  }
  return byFile;
}

function stripStringLiteralsOnLine(line) {
  let out = '';
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      out += ' ';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

/** 剥离字符串外部的 // 与块级单行注释，保留字符串内容供 UI 色值扫描 */
function stripCommentsOutsideStringsOnLine(line) {
  let out = '';
  let quote = null;
  let escaped = false;
  let inBlockComment = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1] ?? '';
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        out += '  ';
        i += 1;
      } else {
        out += ' ';
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      out += ch;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      break;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      out += '  ';
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** 提取跨行 JSX 开标签片段：跟踪引号与 {} 深度直至开标签闭合 >，避免漏扫多行按钮或串入下一按钮 */
function extractOpeningTagWindow(lines, startIndex, maxLines = 12) {
  const firstLine = lines[startIndex] ?? '';
  const tagOffset = firstLine.search(/<(?:button|Button)\b/);
  if (tagOffset < 0) return firstLine;
  const endLine = Math.min(lines.length, startIndex + maxLines);
  const parts = [];
  let quote = null;
  let escaped = false;
  let braceDepth = 0;

  for (let lineIdx = startIndex; lineIdx < endLine; lineIdx += 1) {
    const line = lines[lineIdx];
    const startCol = lineIdx === startIndex ? tagOffset : 0;
    let sliceEnd = line.length;
    for (let col = startCol; col < line.length; col += 1) {
      const ch = line[col];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '{') {
        braceDepth += 1;
        continue;
      }
      if (ch === '}' && braceDepth > 0) {
        braceDepth -= 1;
        continue;
      }
      if (ch === '>' && braceDepth === 0) {
        // 跳过箭头函数 => 中的 >
        if (col > 0 && line[col - 1] === '=') continue;
        sliceEnd = col + 1;
        parts.push(line.slice(startCol, sliceEnd));
        return parts.join(' ');
      }
    }
    parts.push(line.slice(startCol, sliceEnd));
  }
  return parts.join(' ');
}

function isPureEnglishCommentText(commentText) {
  if (!commentText || /[\u4e00-\u9fff]/.test(commentText)) return false;
  if (COMMENT_WHITELIST.test(commentText)) return false;
  const cleaned = commentText.replace(/@[a-zA-Z]+/g, '').trim();
  // 含至少两个连续英文词或大写技术缩写短语，即视为待中文化注释
  return /\b[A-Za-z]{2,}\b(?:\s+\b[A-Za-z0-9_-]{2,}\b)+/.test(cleaned);
}

/** 计算当前仓库待审改动增量行（兼容未追踪文件与无 scope 仓库） */
async function gatherChangedAddedLines(root, featureDir) {
  const scopePath = path.join(featureDir, '_qa', 'scope.json');
  const scopeRaw = await readFile(scopePath, 'utf8').catch(() => null);
  let scopes = [];
  let base = 'HEAD';
  if (scopeRaw) {
    try {
      const parsed = JSON.parse(scopeRaw);
      if (Array.isArray(parsed.scopes)) scopes = parsed.scopes;
      if (typeof parsed.base === 'string' && parsed.base) base = parsed.base;
    } catch {
      // 忽略损坏的 scope 文件
    }
  }
  const args = ['diff', '--unified=0', base];
  if (scopes.length) args.push('--', ...scopes);
  const diffText = git(root, args, true);
  const addedByFile = collectAddedLinesFromUnifiedDiff(diffText);

  // 同时补入尚未 git add 的工作区新文件（过滤 .scratch/）
  const untrackedOut = git(root, ['ls-files', '--others', '--exclude-standard', ...(scopes.length ? ['--', ...scopes] : [])], true);
  for (const relative of untrackedOut.split(/\r?\n/).filter(Boolean)) {
    if (relative.startsWith('.scratch/') || addedByFile.has(relative)) continue;
    const raw = await readFile(path.join(root, relative), 'utf8').catch(() => null);
    if (raw === null) continue;
    addedByFile.set(
      relative,
      raw.split(/\r?\n/).map((line, index) => ({ lineNumber: index + 1, text: line })),
    );
  }
  return addedByFile;
}

async function sharedSurfaceConstantNames(root) {
  const source = await readFile(path.join(root, 'apps/web/src/lib/constants/surface-styles.ts'), 'utf8').catch(() => null);
  if (source === null) return null;
  return new Set([...source.matchAll(/\bexport\s+const\s+([A-Z][A-Z0-9_]*)\b/g)].map((match) => match[1]));
}

/** 扫描 Diff 增量纯英文注释，以及 apps/web/src 下的色值与 44px 按钮热区缺口 */
async function scanDiffStandards(root, featureDir) {
  const findings = [];
  const addedByFile = await gatherChangedAddedLines(root, featureDir);
  const surfaceConstants = await sharedSurfaceConstantNames(root);

  for (const [relative, addedLines] of addedByFile.entries()) {
    const ext = path.posix.extname(relative).toLowerCase();
    const isPreflightSelf = relative === 'tooling/scripts/qa-preflight.mjs' || relative.endsWith('/qa-preflight.mjs');
    if (CODE_EXTENSIONS.has(ext) && !isPreflightSelf) {
      const engLines = [];
      for (const { lineNumber, text } of addedLines) {
        const sanitized = stripStringLiteralsOnLine(text);
        const lineComment = sanitized.match(/(?:^|\s)\/\/(.*)$/)?.[1]
          ?? sanitized.match(/\/\*\*?([\s\S]*?)\*\//)?.[1]
          ?? (ext === '.py' ? sanitized.match(/^\s*#(.*)$/)?.[1] : null);
        if (lineComment && isPureEnglishCommentText(lineComment)) {
          engLines.push(lineNumber);
        }
      }
      if (engLines.length) {
        findings.push(makeFinding(
          'WARN',
          'ENGLISH_COMMENT',
          `${relative} 第 ${engLines.join('、')} 行存在纯英文注释`,
          '按规则将新增或修改文件中的英文注释翻译为简体中文。',
        ));
      }
    }

    if (surfaceConstants === null && CODE_EXTENSIONS.has(ext) && relative.startsWith('apps/web/src/')) {
      const declaration = addedLines.find(({ text }) => /\bconst\s+[A-Z][A-Z0-9_]*\b/.test(text));
      if (declaration) {
        findings.push(makeFinding(
          'WARN',
          'SURFACE_CONSTANTS_UNAVAILABLE',
          `${relative}:${declaration.lineNumber} 新增大写常量，但共享常量源文件不存在，无法检查是否与 @/lib/constants/surface-styles 重名`,
          '补齐共享常量源文件后重新预检；不得把跳过检查当作无重名冲突。',
        ));
      }
    }

    if (surfaceConstants?.size && CODE_EXTENSIONS.has(ext) && relative !== 'apps/web/src/lib/constants/surface-styles.ts') {
      for (const { lineNumber, text } of addedLines) {
        for (const match of text.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\b/g)) {
          if (!surfaceConstants.has(match[1])) continue;
          findings.push(makeFinding(
            'WARN',
            'DUPLICATE_SURFACE_CONSTANT',
            `${relative}:${lineNumber} 新增常量 ${match[1]} 与 @/lib/constants/surface-styles 重名`,
            '复用共享表面样式常量或为局部常量选择不冲突的名称。',
          ));
        }
      }
    }

    const isTestFile = /\.(?:test|spec)\.[^.]+$/i.test(relative);
    if (relative.startsWith('apps/web/src/') && UI_EXTENSIONS.has(ext) && !isTestFile) {
      for (const { lineNumber, text } of addedLines) {
        if (!text.includes('font-[var(--font-')) continue;
        findings.push(makeFinding(
          'WARN',
          'ARBITRARY_FONT_VAR',
          `${relative}:${lineNumber} 新增 font-[var(--font- 任意值字体类`,
          '使用 DESIGN.md 已登记的语义字体类，不新增任意值字体别名。',
        ));
      }

      const badColors = new Map();
      for (const { lineNumber, text } of addedLines) {
        const codeOnly = stripCommentsOutsideStringsOnLine(text);
        for (const match of codeOnly.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}|[0-9a-fA-F]{8})\b/g)) {
          const hex = match[0].toUpperCase();
          if (!WHITELIST_HEX_COLORS.has(hex)) {
            if (!badColors.has(hex)) badColors.set(hex, []);
            badColors.get(hex).push(lineNumber);
          }
        }
      }
      if (badColors.size) {
        const detail = [...badColors.entries()].map(([hex, lines]) => `${hex}（第 ${lines.join('、')} 行）`).join('；');
        findings.push(makeFinding(
          'WARN',
          'NON_WHITELIST_COLOR',
          `${relative} 存在非 DESIGN.md 白名单十六进制色值：${detail}`,
          '改为 Tailwind 语义令牌类或 DESIGN.md §2.2/§2.3 白名单色值。',
        ));
      }

      if (TSX_EXTENSIONS.has(ext)) {
        // 整文件扫描所有交互按钮热区，一次性列全同文件遗漏行号
        const fullText = await readFile(path.join(root, relative), 'utf8').catch(() => '');
        const fullLines = fullText.split(/\r?\n/);
        const hitLines = [];
        for (let i = 0; i < fullLines.length; i += 1) {
          if (!/<(?:button|Button)\b/.test(fullLines[i])) continue;
          const tagWindow = extractOpeningTagWindow(fullLines, i);
          if (TOUCH_TARGET_GAP.test(tagWindow) && !TOUCH_TARGET_GUARD.test(tagWindow)) {
            hitLines.push(i + 1);
          }
        }
        if (hitLines.length) {
          findings.push(makeFinding(
            'WARN',
            'SMALL_TOUCH_TARGET',
            `${relative} 第 ${hitLines.join('、')} 行存在高度低于 44px（h-7~h-10）的交互按钮`,
            '移动端热区须 >= 44px（使用 h-11 或 min-h-[44px]），请核对列出的全部行号。',
          ));
        }
      }
    }
  }
  return findings;
}

const DESIGN_ROUTE_EXEMPTIONS = new Set([
  'login', 'register', 'forgot-password', 'reset-password', 'profile', 'admin', 'feedback', 'debug-history',
]);

/** 新独立页面路由必须在 DESIGN.md §10 的功能面表中登记 */
async function scanRouteRegistrations(root, featureDir) {
  const findings = [];
  const scopeRaw = await readFile(path.join(featureDir, '_qa', 'scope.json'), 'utf8').catch(() => null);
  let base = 'HEAD';
  let scopes = [];
  if (scopeRaw) {
    try {
      const scope = JSON.parse(scopeRaw);
      if (typeof scope.base === 'string' && scope.base) base = scope.base;
      if (Array.isArray(scope.scopes)) scopes = scope.scopes;
    } catch {
      // 损坏的 scope 交由对应门禁报告，预检仍扫描当前新增文件
    }
  }
  const scopeArgs = scopes.length ? ['--', ...scopes] : [];
  const added = git(root, ['diff', '--name-only', '--diff-filter=A', '-z', base, ...scopeArgs], true);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', ...scopeArgs], true);
  const candidates = [...new Set(`${added}\0${untracked}`.split('\0').filter(Boolean))]
    .map((relative) => {
      const match = relative.match(/^apps\/web\/src\/app\/(.+)\/page\.tsx$/);
      return match ? { relative, route: match[1] } : null;
    })
    .filter((item) => item && !item.route.startsWith('api/') && !DESIGN_ROUTE_EXEMPTIONS.has(item.route.split('/')[0]));
  if (!candidates.length) return findings;

  const design = await readFile(path.join(root, 'DESIGN.md'), 'utf8').catch(() => '');
  const lines = design.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## 10\.\s*功能面设计简报\s*$/.test(line));
  const end = lines.findIndex((line, index) => index > start && start >= 0 && /^##\s/.test(line));
  const section = start >= 0 ? lines.slice(start + 1, end < 0 ? lines.length : end) : [];
  const registered = new Set();
  for (const line of section) {
    if (!line.trim().startsWith('|')) continue;
    const firstCell = line.split('|')[1] ?? '';
    for (const token of firstCell.trim().split(/\s+/)) {
      registered.add(token.replaceAll('`', '').replace(/^\//, ''));
    }
  }
  for (const match of section.join('\n').matchAll(/`app\/([A-Za-z0-9_-]+)(?:\/[^`]*)?`/g)) {
    registered.add(match[1]);
  }
  for (const { relative, route } of candidates) {
    const surface = route.split('/')[0];
    if (registered.has(surface) || registered.has(route)) continue;
    findings.push(makeFinding(
      'WARN',
      'DESIGN_ROUTE_UNREGISTERED',
      `${relative}:1 新独立路由 /${route} 未在 DESIGN.md §10 登记`,
      `先在 DESIGN.md §10 功能面表登记 ${surface} 的模式与基调，再实现页面。`,
    ));
  }
  return findings;
}

const TRIAGE_VALUES = new Set(['本次修', '转专项', '驳回']);
const DISPOSITION_VALUES = new Set(['', '—', '已修', '未修', '修错', '改档成立', '改档不成立', '驳回', '转专项']);

/** 在 collect 前校验三档分流的列结构与本地枚举，不判断审查语义 */
async function scanReviewReportTriage(featureDir) {
  const text = await readFile(path.join(featureDir, 'review-report.md'), 'utf8').catch(() => null);
  if (text === null) return [];
  const findings = [];
  const lines = text.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^## 三档分流\s*$/.test(line));
  if (heading < 0) {
    return [makeFinding('ERROR', 'INVALID_TRIAGE_SCHEMA', 'review-report.md:1 缺少 ## 三档分流', '补充分流表或明确写出无发现。')];
  }
  const sectionEnd = lines.findIndex((line, index) => index > heading && /^##\s/.test(line));
  const end = sectionEnd < 0 ? lines.length : sectionEnd;
  const headerIndex = lines.findIndex((line, index) => index > heading && index < end && line.includes('|'));
  if (headerIndex < 0) {
    return lines.slice(heading + 1, end).join('\n').includes('无发现')
      ? []
      : [makeFinding('ERROR', 'INVALID_TRIAGE_SCHEMA', `review-report.md:${heading + 1} 缺少三档分流表`, '补齐表头与数据行，或明确写出无发现。')];
  }
  const headers = splitMarkdownRow(lines[headerIndex]);
  const required = ['编号', '档位', '轮次轨迹', '理由'];
  const missing = required.filter((name) => !headers.some((cell) => cell.includes(name)));
  if (!headers.some((cell) => cell.includes('处置状态') || cell.includes('最终状态'))) missing.push('处置状态');
  if (missing.length) {
    findings.push(makeFinding(
      'ERROR',
      'INVALID_TRIAGE_SCHEMA',
      `review-report.md:${headerIndex + 1} 三档分流缺少列：${missing.join('、')}`,
      '按契约补齐编号、档位、处置状态、轮次轨迹、验证证据与理由列。',
    ));
  }
  const column = (name) => headers.findIndex((cell) => cell.includes(name));
  const tierIndex = column('档位');
  const finalIndex = headers.findIndex((cell) => cell.includes('处置状态') || cell.includes('最终状态'));
  const evidenceIndex = column('验证证据');
  let rowCount = 0;
  let hasFixed = false;
  for (let index = headerIndex + 1; index < end && lines[index].includes('|'); index += 1) {
    const cells = splitMarkdownRow(lines[index]);
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell.replaceAll(' ', '')))) continue;
    rowCount += 1;
    const tier = tierIndex >= 0 ? cells[tierIndex]?.trim() ?? '' : '';
    const final = finalIndex >= 0 ? cells[finalIndex]?.trim() ?? '' : '';
    if (final === '已修') hasFixed = true;
    if (!TRIAGE_VALUES.has(tier)) {
      findings.push(makeFinding('ERROR', 'INVALID_TRIAGE', `review-report.md:${index + 1} 档位“${tier || '空'}”无效`, '档位只能是本次修、转专项或驳回。'));
    }
    if (!DISPOSITION_VALUES.has(final)) {
      findings.push(makeFinding('ERROR', 'INVALID_DISPOSITION', `review-report.md:${index + 1} 处置状态“${final || '空'}”无效`, '使用契约允许的处置状态，部分修复写未修。'));
    }
  }
  if (hasFixed && evidenceIndex < 0) {
    findings.push(makeFinding('ERROR', 'INVALID_TRIAGE_SCHEMA', `review-report.md:${headerIndex + 1} 已修条目需要验证证据列`, '补充验证证据列并填写修复后证据或静态理由。'));
  }
  if (!rowCount && !lines.slice(headerIndex + 1, end).join('\n').includes('无发现')) {
    findings.push(makeFinding('ERROR', 'INVALID_TRIAGE_SCHEMA', `review-report.md:${headerIndex + 1} 三档分流没有数据行`, '无发现时必须明确写出无发现。'));
  }
  return findings;
}

/** 运行 1 秒本地确定性预检：返回 { ok, errors, warns, findings } */
export async function runPreflight(repo, featureArgument, { strict = false } = {}) {
  const featureDir = path.resolve(repo, featureArgument);
  const root = git(repo, ['rev-parse', '--show-toplevel'], true).trim() || path.resolve(repo);
  const findings = (await Promise.all([
    scanScriptsForPseudoAssertions(featureDir),
    checkDeliveryCommandsConsistency(featureDir),
    scanDiffStandards(root, featureDir),
    scanRouteRegistrations(root, featureDir),
    scanReviewReportTriage(featureDir),
  ])).flat();
  const errors = findings.filter((item) => item.level === 'ERROR');
  const warns = findings.filter((item) => item.level === 'WARN');
  const ok = errors.length === 0 && (!strict || warns.length === 0);
  return { ok, strict, errors, warns, findings };
}

export function formatPreflightReport(result) {
  if (!result.findings.length) {
    return '[qa-preflight] PASS：未发现静态伪断言、命令不一致、英文注释或 UI 热区/色值告警（仅清除静态规则，不替代 Spec 语义与人工复核）。';
  }
  const lines = result.findings.map((item) => `[${item.level}][${item.code}] ${item.message}${item.hint ? ` -> ${item.hint}` : ''}`);
  lines.push(`[qa-preflight] 结果：${result.ok ? 'PASS（含 WARN）' : 'FAIL'}（ERROR ${result.errors.length} 条，WARN ${result.warns.length} 条；仅清除静态规则，不替代语义复核）`);
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let strict = false;
  let featureArg = null;
  for (const arg of args) {
    if (arg === '--strict') strict = true;
    else if (arg === '--') continue;
    else if (!featureArg) featureArg = arg;
  }
  if (!featureArg) {
    console.error('用法: node tooling/scripts/qa-preflight.mjs <feature-dir> [--strict]');
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runPreflight(process.cwd(), featureArg, { strict });
    console.log(formatPreflightReport(result));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(`[qa-preflight] FAIL：${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
