/**
 * astrology-report-sections.ts —— 星座寰宇 · 解读报告分区（03 工单）
 *
 * 两件事：
 * 1. 流式分区扫描：模型输出的是一个 JSON 对象，但四个分区在文本里是顺序出现的。
 *    扫描器按顶层键切出「已闭合」的分区片段，服务端即可边流边推送
 *    （headline → bigThree → modules → transits），文案逐区浮现，而不是等整段输出完。
 * 2. 分区校验与降级忠实：模型的每个分区都要过 Zod 与事实层白名单——
 *    - 引用键只认稳定、可定位的事实（编造键直接丢弃，不落进界面）；
 *    - 无宫位档的上升/天顶/宫位内容强制清空（AI 不得编造被隐藏字段）；
 *    - 被降级隐藏的相位不得出现在关键相位里（只认盘面上稳定存在的相位）。
 *
 * 校验尺度（有意为之）：只拦「无法展示」的取值（空串、非字符串、非法 id、超长到会破坏版式的文本）。
 * 文案长度、字数、语气由提示词与黄金样例承担；把 28 字超一字就整段降级，对用户是净损失。
 */

import { z } from 'zod';
import type { AstrologyChartFacts } from '@/lib/astrology/chart-facts';
import type {
  AstrologyBigThree,
  AstrologyHeadline,
  AstrologyKeyAspectCopy,
  AstrologyTransitsSection,
  ElementReading,
  ModuleId,
  ModuleReading,
} from '@/lib/astrology/interpretation';
import { ASTROLOGY_MODULE_ORDER } from '@/lib/astrology/interpretation';

/* ---------- 分区扫描（流式） ---------- */

export type ReportSectionKey = 'headline' | 'bigThree' | 'modules' | 'transits';

/** 协议固定的分区顺序（前端按此顺序渲染，服务端按此顺序推送） */
export const ASTROLOGY_REPORT_SECTION_ORDER: ReportSectionKey[] = [
  'headline',
  'bigThree',
  'modules',
  'transits',
];

/** 已闭合的分区片段（raw 为该分区的 JSON 文本） */
export interface ClosedSection {
  key: ReportSectionKey;
  raw: string;
}

/** 字符串字面量结束位置（含转义）；未闭合返回 -1 */
function findStringEnd(buffer: string, startQuote: number): number {
  for (let i = startQuote + 1; i < buffer.length; i += 1) {
    const ch = buffer[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '"') return i;
  }
  return -1;
}

/** 括号配平后的结束位置（返回闭合括号之后的下标）；未闭合返回 -1 */
function findBracketEnd(buffer: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < buffer.length; i += 1) {
    const ch = buffer[i];
    if (inString) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** 标量值结束位置（数字/布尔/null；返回终止符下标）；尚未结束返回 -1 */
function findScalarEnd(buffer: string, start: number): number {
  for (let i = start; i < buffer.length; i += 1) {
    const ch = buffer[i];
    if (ch === ',' || ch === '}' || ch === ']') return i;
  }
  return -1;
}

/** 值结束位置（返回闭合值之后的下标；-1 = 尚未接收完整，等待后续分块） */
function findValueEnd(buffer: string, start: number): number {
  const first = buffer[start];
  if (first === '"') {
    const end = findStringEnd(buffer, start);
    return end === -1 ? -1 : end + 1;
  }
  if (first === '{' || first === '[') return findBracketEnd(buffer, start);
  return findScalarEnd(buffer, start);
}

/**
 * 扫描根对象的一层键值对，把已闭合的值写进 captured。
 * 容忍 JSON 之前的说明文字与代码围栏（弱约束模型可能带出）；结构一旦不符合预期即停止扫描，
 * 不做猜测式修补（宁缺毋滥：解析不出的分区不推送，最终由路由按「分区缺失」诚实降级）。
 */
function scanTopLevelValues(buffer: string, captured: Map<string, string>): void {
  let i = 0;
  while (i < buffer.length && buffer[i] !== '{') i += 1;
  if (i >= buffer.length) return; // 根对象尚未开始
  i += 1;
  while (i < buffer.length) {
    while (i < buffer.length && (buffer[i] === ',' || /\s/.test(buffer[i]))) i += 1;
    if (i >= buffer.length) return;
    if (buffer[i] === '}') return; // 根对象结束
    if (buffer[i] !== '"') return; // 非法结构（不猜测）

    const keyEnd = findStringEnd(buffer, i);
    if (keyEnd === -1) return; // 键尚未接完
    const key = buffer.slice(i + 1, keyEnd);
    i = keyEnd + 1;
    while (i < buffer.length && /\s/.test(buffer[i])) i += 1;
    if (i >= buffer.length) return;
    if (buffer[i] !== ':') return; // 非法结构
    i += 1;
    while (i < buffer.length && /\s/.test(buffer[i])) i += 1;
    if (i >= buffer.length) return;

    const valueEnd = findValueEnd(buffer, i);
    if (valueEnd === -1) return; // 值未闭合：等下一块
    if (!captured.has(key)) captured.set(key, buffer.slice(i, valueEnd));
    i = valueEnd;
  }
}

/**
 * 流式分区扫描器：push 累积文本增量，返回「本次新闭合、且前置分区都已推送」的分区。
 * 模型若乱序输出（弱约束可能发生），分区会按其闭合顺序缓存，轮到它时再按协议顺序推送。
 */
export function createReportSectionScanner(order: ReportSectionKey[] = ASTROLOGY_REPORT_SECTION_ORDER) {
  let buffer = '';
  const captured = new Map<string, string>();
  const emitted = new Set<string>();

  return {
    push(chunk: string): ClosedSection[] {
      buffer += chunk;
      scanTopLevelValues(buffer, captured);
      const ready: ClosedSection[] = [];
      for (const key of order) {
        if (emitted.has(key)) continue;
        const raw = captured.get(key);
        if (raw === undefined) break; // 前置分区还没闭合：不越序推送
        emitted.add(key);
        ready.push({ key, raw });
      }
      return ready;
    },
    /** 已闭合但尚未满足推送顺序的分区键（收尾时用于诊断） */
    pendingKeys(): ReportSectionKey[] {
      return order.filter((key) => captured.has(key) && !emitted.has(key));
    },
    /** 从未在输出里出现过的分区键（收尾时判定报告缺项） */
    missingKeys(): ReportSectionKey[] {
      return order.filter((key) => !captured.has(key));
    },
    /** 原始累计文本（用量估算兜底用） */
    rawText(): string {
      return buffer;
    },
  };
}

/* ---------- 分区校验 ---------- */

/** 分区校验失败（消息可直接展示；路由据此把解读层降级为「AI 解读未完成」） */
export class AstrologyReportSectionError extends Error {
  readonly section: ReportSectionKey;

  constructor(section: ReportSectionKey, message: string) {
    super(message);
    this.name = 'AstrologyReportSectionError';
    this.section = section;
  }
}

/** 校验上下文：事实层白名单 + 服务端确定性生成的周区间文案 */
export interface SectionValidationContext {
  facts: AstrologyChartFacts;
  /** 允许被引用的事实键（buildFactReferenceKeys 口径） */
  allowedRefs: Set<string>;
  /** 筛后行运键（三角只允许引用这些行运） */
  transitRefs: Set<string>;
  /** 本周区间（按出生城市时区格式化，系统生成） */
  weekRange: string;
  /** 依据行运说明（最紧密行运，系统生成；无可用行运时为空串） */
  transitNote: string;
}

/** 超长兜底阈值（明显跑偏才判失败；正常文案由提示词约束） */
const LIMITS = {
  headline: 80,
  elementText: 120,
  moduleTitle: 24,
  moduleSummary: 200,
  moduleAction: 120,
  scenario: 200,
  tag: 16,
  triangle: 160,
  aspectText: 200,
} as const;

const text = (max: number) => z.string().trim().min(1, '不得为空').max(max, '文案过长');

function fail(section: ReportSectionKey, message: string): never {
  throw new AstrologyReportSectionError(section, message);
}

/** 逐个解析分区片段（先 JSON.parse，再 Zod 校验，最后按事实层白名单收敛） */
function parseSectionJson(section: ReportSectionKey, raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    fail(section, `模型分区 ${section} 不是合法 JSON`);
  }
}

/** 事实引用键收敛：只保留白名单内的键，去重并保序 */
function sanitizeRefs(refs: string[], allowed: Set<string>, limit = 6): string[] {
  const out: string[] = [];
  for (const ref of refs) {
    if (!allowed.has(ref) || out.includes(ref)) continue;
    out.push(ref);
    if (out.length >= limit) break;
  }
  return out;
}

const HeadlineSchema = z.object({
  text: text(LIMITS.headline),
  factReferences: z.array(z.string()).default([]),
});

/** 一句主轴：引用键必须落在白名单内（至少一条，界面依据层才有可定位的证据） */
export function parseHeadlineSection(raw: string, ctx: SectionValidationContext): AstrologyHeadline {
  const parsed = HeadlineSchema.safeParse(parseSectionJson('headline', raw));
  if (!parsed.success) fail('headline', '模型未按要求给出主轴');
  const factReferences = sanitizeRefs(parsed.data.factReferences, ctx.allowedRefs);
  if (factReferences.length === 0) fail('headline', '主轴没有可核对的盘面依据');
  return { text: parsed.data.text, factReferences };
}

const ElementReadingSchema = z.object({
  plain: text(LIMITS.elementText),
  action: text(LIMITS.elementText),
});

const BigThreeSchema = z.object({
  sun: ElementReadingSchema.nullish(),
  moon: ElementReadingSchema.nullish(),
  ascendant: ElementReadingSchema.nullish(),
});

function normalizeElementReading(value: z.infer<typeof ElementReadingSchema> | null | undefined): ElementReading | null {
  if (!value) return null;
  return { plain: value.plain, action: value.action };
}

/**
 * 大三要素：以事实层为准强制缺项——
 * 太阳/月亮星座不稳定（放盘中为 null）时不接受任何文案；无宫位档不接受上升文案。
 */
export function parseBigThreeSection(raw: string, ctx: SectionValidationContext): AstrologyBigThree {
  const parsed = BigThreeSchema.safeParse(parseSectionJson('bigThree', raw));
  if (!parsed.success) fail('bigThree', '模型未按要求给出大三要素');
  const signOf = (body: 'sun' | 'moon') => ctx.facts.planets.find((p) => p.body === body)?.sign ?? null;
  const ascendantSign = ctx.facts.angles.ascendant.sign;
  return {
    sun: signOf('sun') ? normalizeElementReading(parsed.data.sun) : null,
    moon: signOf('moon') ? normalizeElementReading(parsed.data.moon) : null,
    ascendant: ascendantSign ? normalizeElementReading(parsed.data.ascendant) : null,
  };
}

const ModuleSchema = z.object({
  id: z.enum(['who', 'love', 'career', 'strengths', 'week']),
  title: text(LIMITS.moduleTitle),
  summary: text(LIMITS.moduleSummary),
  scenario: text(LIMITS.scenario).optional(),
  tags: z.array(text(LIMITS.tag)).min(1, '至少一个标签').max(3, '标签不超过 3 个'),
  action: text(LIMITS.moduleAction),
  factReferences: z.array(z.string()).default([]),
});

/**
 * 五大生活模块：按固定顺序落位（who → love → career → strengths → week），未知 id 丢弃、
 * 重复 id 只取第一条；每个模块至少一条白名单内的依据，否则整分区失败（无依据的模块会诱导用户
 * 点开一个空依据区）。week 模块允许缺省（三角与区间由系统在 transits 分区到达后组装）。
 */
export function parseModulesSection(raw: string, ctx: SectionValidationContext): ModuleReading[] {
  const parsed = z.array(z.unknown()).safeParse(parseSectionJson('modules', raw));
  if (!parsed.success) fail('modules', '模型未按要求给出生活模块');
  const byId = new Map<ModuleId, ModuleReading>();
  for (const candidate of parsed.data) {
    // 单个模块的格式漂移不牵连同批其余模块：非法项丢弃，重复 id 只取第一条
    const item = ModuleSchema.safeParse(candidate);
    if (!item.success || byId.has(item.data.id)) continue;
    const factReferences = sanitizeRefs(item.data.factReferences, ctx.allowedRefs);
    if (factReferences.length === 0) fail('modules', `生活模块「${item.data.id}」没有可核对的盘面依据`);
    byId.set(item.data.id, {
      id: item.data.id,
      title: item.data.title,
      summary: item.data.summary,
      tags: item.data.tags,
      action: item.data.action,
      factReferences,
      ...(item.data.scenario ? { scenario: item.data.scenario } : {}),
    });
  }
  if (byId.size === 0) fail('modules', '模型未按要求给出生活模块');
  // 固定顺序落位；缺项（事实不足）不强凑
  return ASTROLOGY_MODULE_ORDER.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
}

const KeyAspectCopySchema = z.object({
  refKey: text(LIMITS.aspectText),
  energy: text(LIMITS.aspectText),
  life: text(LIMITS.aspectText),
  practice: text(LIMITS.aspectText),
});

const TransitsSchema = z.object({
  opportunity: z.string().default(''),
  caution: z.string().default(''),
  action: z.string().default(''),
  transitReferences: z.array(z.string()).default([]),
  keyAspects: z.array(KeyAspectCopySchema).default([]),
});

/**
 * 本周行运与关键相位：
 * - 三角只允许引用筛后行运（transitRefs）；没有可用行运（时间未知档等）时三项文案与引用一律清空，
 *   界面按既有的「行运不可用」分支说明，不伪造一个三角；
 * - 关键相位只保留稳定存在且未重复的相位键（不稳定相位的文案不进界面）；
 * - 至少一条可用关键相位（设计文档 §6.6 要求深度区必须给出 3–5 条最有解释力的相位）。
 */
export function parseTransitsSection(raw: string, ctx: SectionValidationContext): AstrologyTransitsSection {
  const parsed = TransitsSchema.safeParse(parseSectionJson('transits', raw));
  if (!parsed.success) fail('transits', '模型未按要求给出本周行运解读');
  const hasTransits = ctx.transitRefs.size > 0;
  const transitReferences = hasTransits
    ? sanitizeRefs(parsed.data.transitReferences, ctx.transitRefs, 4)
    : [];
  if (hasTransits && transitReferences.length === 0) {
    fail('transits', '本周行动三角没有可核对的依据行运');
  }

  const stableAspectKeys = new Set(
    ctx.facts.aspects
      .filter((a) => a.stability === 'stable')
      .map((a) => `aspect:${[a.source, a.target].sort()[0]}:${a.type}:${[a.source, a.target].sort()[1]}`)
  );
  const seenAspects = new Set<string>();
  const keyAspects: AstrologyKeyAspectCopy[] = [];
  for (const item of parsed.data.keyAspects) {
    if (!stableAspectKeys.has(item.refKey) || seenAspects.has(item.refKey)) continue;
    seenAspects.add(item.refKey);
    keyAspects.push({
      refKey: item.refKey,
      energy: item.energy,
      life: item.life,
      practice: item.practice,
    });
  }
  if (keyAspects.length === 0) fail('transits', '关键相位没有可核对的盘面依据');

  return {
    weekRange: ctx.weekRange,
    transitNote: hasTransits ? ctx.transitNote : '',
    opportunity: hasTransits ? parsed.data.opportunity.trim().slice(0, LIMITS.triangle) : '',
    caution: hasTransits ? parsed.data.caution.trim().slice(0, LIMITS.triangle) : '',
    action: hasTransits ? parsed.data.action.trim().slice(0, LIMITS.triangle) : '',
    transitReferences,
    keyAspects,
  };
}
