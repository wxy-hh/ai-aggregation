/**
 * qa-events.ts —— 星座寰宇 · 星语问答协议与回答契约（04 工单，客户端/服务端共用）
 *
 * 生产端：apps/web/src/app/api/destiny/astrology/copilot/route.ts
 * 消费端：apps/web/src/lib/astrology/qa-request.ts（问答链路唯一异步接缝）
 *
 * 事件顺序：
 *   正常回答：text-delta…（正文增量）→ answer（完整回答 + 白名单收敛后的引用）
 *   敏感拦截：answer（kind='blocked'，安全话术与自我观察方向）——不经过 LLM，也不计费
 *   失败：error（此后不再有其它事件，流随即关闭）
 *
 * 引用铁律（与报告解读同口径）：引用键只认事实层白名单（buildFactReferenceKeys）与报告里
 * 确实存在的生活模块；模型编造的键一律丢弃，绝不落进界面——引用片可点，编造引用会指向
 * 不存在的事实。
 */

import type { AspectType, AstrologyChartFacts, PlanetBody } from './chart-facts';
import type { ModuleId } from './interpretation';
import { ASPECT_CN, PLANET_CN, ZODIAC_CN } from './zh-names';

/** P0 上限：每份报告每个会话最多 3 个用户问题（服务端强制，前端同步计数 UI） */
export const ASTROLOGY_QA_MAX_QUESTIONS = 3;

/** 单次回答最多展示的引用片数（多引用会稀释焦点，也与模块依据片同量级） */
export const MAX_QA_CITATIONS = 3;

/** 引用片：模块名称或事实标签；可携带点击定位目标 */
export interface QaCitation {
  /** 展示标签：模块标题（如「先稳后亮的表达者」）或事实标签（如「月亮 · 白羊座」） */
  label: string;
  /** 模块引用：点击可定位到对应生活模块 */
  moduleId?: ModuleId;
  /** 事实引用：点击可定位到星盘轮星体（宫位等无定位目标的引用为 null） */
  body?: PlanetBody | null;
  /** 事实引用键（白名单内；模块引用无此字段） */
  refKey?: string;
}

/** 回答档位：普通回答 / 敏感话题安全话术（界面用琥珀色气泡区分，措辞同样不绝对化） */
export type QaAnswerKind = 'answer' | 'blocked';

export interface AstrologyQaAnswer {
  kind: QaAnswerKind;
  /** 多段文本以 \n 分隔（界面逐段渲染） */
  text: string;
  citations: QaCitation[];
}

/** 问答流事件全集（顺序见文件头） */
export type AstrologyQaEvent =
  /** 回答正文增量（边流边渲染；敏感拦截不会出现增量帧） */
  | { type: 'text-delta'; text: string }
  /** 回答收口：完整正文 + 白名单收敛后的引用（流上唯一的结论帧） */
  | { type: 'answer'; answer: AstrologyQaAnswer }
  /** 服务端失败（message 为可直接展示的中文说明），此后流关闭 */
  | { type: 'error'; error: string };

/** 模块引用键（提示词里给模型的写法：module:who） */
export function moduleRefKey(id: ModuleId): string {
  return `module:${id}`;
}

/** 引用白名单解析上下文（服务端按事实层白名单与报告模块组装） */
export interface QaCitationContext {
  facts: AstrologyChartFacts;
  /** 允许被引用的事实键（buildFactReferenceKeys 口径） */
  allowedRefs: Set<string>;
  /** 报告里存在的生活模块（id + 模型给出的标题） */
  modules: Array<{ id: ModuleId; title: string }>;
}

/** 事实引用键 → 引用片（键不在白名单内或无法定位时返回 null） */
function factCitation(ref: string, ctx: QaCitationContext): QaCitation | null {
  if (!ctx.allowedRefs.has(ref)) return null;
  const parts = ref.split(':');
  if (parts[0] === 'planet') {
    const body = parts[1] as PlanetBody;
    const placement = ctx.facts.planets.find((p) => p.body === body);
    const base = PLANET_CN[body] ?? body;
    if (parts[2] === 'retrograde') return { label: `${base} 逆行`, body, refKey: ref };
    if (!placement?.sign) return null;
    return { label: `${base} · ${ZODIAC_CN[placement.sign]}`, body, refKey: ref };
  }
  if (parts[0] === 'aspect') {
    const [, source, type, target] = parts;
    return {
      label: `${PLANET_CN[source as PlanetBody] ?? source} ${ASPECT_CN[type as AspectType] ?? type} ${PLANET_CN[target as PlanetBody] ?? target}`,
      body: source as PlanetBody,
      refKey: ref,
    };
  }
  if (parts[0] === 'transit') {
    const [, transiting, type, natalTarget] = parts;
    // 定位目标取本命被行运的星体：行运星体不在本命轮上
    return {
      label: `行运${PLANET_CN[transiting as PlanetBody] ?? transiting} ${ASPECT_CN[type as AspectType] ?? type} 本命${PLANET_CN[natalTarget as PlanetBody] ?? natalTarget}`,
      body: natalTarget as PlanetBody,
      refKey: ref,
    };
  }
  if (parts[0] === 'house') {
    const house = ctx.facts.houses.find((h) => h.number === Number(parts[1]));
    if (!house) return null;
    // 宫位引用只作展示标签（无宫位档不会进入白名单）
    return { label: `第 ${house.number} 宫 · ${ZODIAC_CN[house.sign]}`, body: null, refKey: ref };
  }
  // angle 等其余键：白名单内但不作为问答引用片（与星盘轮的定位口径一致）
  return null;
}

/** 单条引用键 → 引用片：module:<id> 或事实键；非法键返回 null（由调用方丢弃） */
export function buildQaCitation(ref: string, ctx: QaCitationContext): QaCitation | null {
  if (ref.startsWith('module:')) {
    const id = ref.slice('module:'.length) as ModuleId;
    const module = ctx.modules.find((m) => m.id === id);
    return module ? { label: module.title, moduleId: module.id } : null;
  }
  return factCitation(ref, ctx);
}

/**
 * 引用键列表 → 引用片（白名单收敛）：编造的键、报告中不存在的模块、重复引用一律丢弃，
 * 并收敛到 MAX_QA_CITATIONS 条。
 */
export function buildQaCitations(refs: string[], ctx: QaCitationContext): QaCitation[] {
  const out: QaCitation[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref)) continue;
    const citation = buildQaCitation(ref, ctx);
    if (!citation) continue;
    seen.add(ref);
    out.push(citation);
    if (out.length >= MAX_QA_CITATIONS) break;
  }
  return out;
}
