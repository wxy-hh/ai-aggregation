/**
 * astrology-qa-prompt.ts —— 星语问答 · 提示词组装（04 工单）
 *
 * 事实层口径与解读提示词完全同源（astrology-prompt.ts 的 buildAstrologyPromptPayload）：
 * 降级档被隐藏的字段（无宫位档的上升/天顶/宫位、跨座隐藏的行星、不稳定相位）不进入提示词，
 * 并明令模型不得提及或暗示；行运只带筛后 Top N。
 *
 * 铁律（与解读一致，另加问答专属约束）：
 * - 只解释给定真值，不重算、不编造；
 * - citations 只能逐字取自 allowedCitations（事实键表或 module:<模块 id>）；
 * - 措辞不绝对化：不给确定性预测，医疗 / 财务 / 法律只给自我观察方向（服务端另有前置拦截）；
 * - 只输出一个 JSON 对象 {"text":"…","citations":["…"]}，正文分段用 \n。
 */

import type { ModuleId } from '@/lib/astrology/interpretation';
import type { AstrologyPromptPayload } from './astrology-prompt';

/** 问答正文的字数区间（引导模型给出可读长度；路由不按字数拦截） */
export const QA_ANSWER_MIN_CHARS = 80;
export const QA_ANSWER_MAX_CHARS = 220;

/** 系统提示词：角色 + 合规边界 + 事实层铁律 + 输出结构 */
export function buildAstrologyQaSystemPrompt(): string {
  return `
你是「星座寰宇」的星语问答助手：围绕用户已完成的本命星盘报告，回答他关于自己的提问。

【合规声明】你的内容是基于文化传统的娱乐化自我探索参考，不得出现宿命论表述，不得声称能预测具体事件、
疾病、财务结果或法律结果，不得制造焦虑；医疗、财务、法律话题只给自我观察方向，并建议寻求合格专业人士。

【事实层铁律】
1. 星盘事实（行星落座、度数、宫位、相位、本周行运）已由本地星历算法确定性算好：只做解释，不得重算、
   不得改写、不得补充任何未被给出的事实。
2. hiddenFacts 列出的内容全部不可得：不得提及、不得猜测、不得用「大概/可能是/偏向」的方式暗示。
3. citations 只能逐字取自 allowedCitations（factReferenceKeys 里的事实键，或 module:<模块 id>）；
   只引用与本次回答真正相关的 1–3 条，不得编造键、不得引用该表之外的任何内容。
4. 措辞一律使用「倾向、可能、适合留意、可以尝试」，禁止「一定、必然、注定、绝对、永远」；
   不承诺具体时间点、结果或他人的行为。
5. 只输出一个 JSON 对象：{"text":"…","citations":["…"]}。不要 markdown 代码块、不要解释文字、不要思考过程。
6. text 分 2–4 段、共 ${QA_ANSWER_MIN_CHARS}–${QA_ANSWER_MAX_CHARS} 字，段间用 \\n 分隔：先给结论，
   再给盘面依据（用生活语言，不复述度数），必要时补一句本周可执行的动作。
7. 全部使用简体中文，不出现英文单词与英文占星术语；不复述用户的出生资料。
`.trim();
}

/** 用户提示词：提问 + 盘面口径 + 事实负载 + 允许引用键表 + 禁止提及清单 */
export function buildAstrologyQaUserPrompt(input: {
  question: string;
  payload: AstrologyPromptPayload;
  /** 报告里已产出的生活模块（保持口径一致，可被 module: 引用） */
  modules: Array<{ id: ModuleId; title: string; summary: string; action: string }>;
}): string {
  const { payload, modules } = input;

  const moduleBlock =
    modules.length > 0
      ? modules
          .map(
            (module) =>
              `- module:${module.id}「${module.title}」：${module.summary}${
                module.action ? `（行动：${module.action}）` : ''
              }`
          )
          .join('\n')
      : '（本报告暂无生活模块，citations 只允许使用事实键）';

  const allowedCitations = [
    ...modules.map((module) => `module:${module.id}`),
    ...Object.keys(payload.factReferenceKeys),
  ];

  return [
    `用户提问：${input.question}`,
    '',
    `盘面范围：${payload.dataCompleteness === 'with-houses' ? '含宫位完整盘' : '无宫位行星盘'} · ${payload.houseSystemLabel}`,
    '',
    '报告已产出的生活模块（与报告口径保持一致；可直接用对应 module: 键引用）：',
    moduleBlock,
    '',
    'deterministicFacts（必须严格沿用）：',
    JSON.stringify(
      {
        planets: payload.planets,
        angles: payload.angles,
        houses: payload.houses,
        aspects: payload.aspects,
        transits: payload.transits,
      },
      null,
      2
    ),
    '',
    'factReferenceKeys（唯一允许引用的事实键表，键必须逐字引用）：',
    JSON.stringify(payload.factReferenceKeys, null, 2),
    '',
    'allowedCitations（citations 的全部合法取值）：',
    JSON.stringify(allowedCitations, null, 2),
    '',
    payload.hiddenFacts.length > 0
      ? `hiddenFacts（以下内容不可得，禁止提及、猜测或暗示）：\n- ${payload.hiddenFacts.join('\n- ')}`
      : 'hiddenFacts：无（本盘所有字段均已确认稳定）。',
    '',
    '请只输出一个 JSON 对象：{"text":"…","citations":["…"]}。',
  ].join('\n');
}
