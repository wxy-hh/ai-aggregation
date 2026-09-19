/**
 * astrology-qa-safety.ts —— 星语问答 · 敏感话题前置拦截（04 工单迁移自 mock 问答）
 *
 * 为什么放在服务端：医疗 / 财务 / 法律话题不能依赖 AI 自觉——命中即返回确定性安全话术与自我
 * 观察方向，不调用 LLM，也不产生任何计费（设计文档 §6.7 / 上游 story 43）。
 *
 * 规则与话术口径：
 * - 正则识别三类话题，普通话题不误伤；
 * - 话术必须含文档原文「不能据此作出医疗、财务或法律判断」，并给出可讨论的自我观察方向；
 * - 方向文案按「模块固定名」落地（我是谁 / 关系如何运作 / 本周宇宙提示），引用片用报告里该
 *   模块的真实标题（可点击定位）；偏好链上的模块都不在报告里时不承诺不存在的模块。
 */

import { ASTROLOGY_MODULE_TITLE, type ModuleId } from '@/lib/astrology/interpretation';
import type { AstrologyQaAnswer } from '@/lib/astrology/qa-events';

export type SensitiveTopic = 'medical' | 'financial' | 'legal';

const SENSITIVE_RULES: Array<{ topic: SensitiveTopic; label: string; re: RegExp }> = [
  { topic: 'medical', label: '医疗', re: /病|癌|肿瘤|手术|医|药|抑郁|焦虑|治疗|诊断|体检|健康|怀孕|流产/ },
  {
    topic: 'financial',
    label: '财务',
    re: /投资|股|基金|理财|买房|房贷|贷款|借钱|欠债|债务|彩票|赌|暴富|发财|财运/,
  },
  {
    topic: 'legal',
    label: '法律',
    re: /官司|诉讼|起诉|被告|合同|离婚|犯法|犯罪|坐牢|律师|法庭|违法|判刑/,
  },
];

/** 命中敏感主题返回其类型，否则 null（普通话题不误伤） */
export function detectSensitiveTopic(question: string): SensitiveTopic | null {
  for (const rule of SENSITIVE_RULES) {
    if (rule.re.test(question)) return rule.topic;
  }
  return null;
}

const TOPIC_LABEL: Record<SensitiveTopic, string> = {
  medical: '医疗',
  financial: '财务',
  legal: '法律',
};

/** 自我观察方向：按主题落到报告里可能存在的模块上（顺序即偏好） */
const DIRECTIONS: Record<SensitiveTopic, Array<{ moduleId: ModuleId; text: string }>> = {
  medical: [
    {
      moduleId: 'who',
      text: `最近什么时刻你觉得身体或情绪紧绷？「${ASTROLOGY_MODULE_TITLE.who}」模块里的节奏线索，也许能帮你说清感受。`,
    },
    {
      moduleId: 'week',
      text: `这周可以怎么照顾自己的节奏？「${ASTROLOGY_MODULE_TITLE.week}」里有一个可执行的切口。`,
    },
  ],
  financial: [
    {
      moduleId: 'who',
      text: `你在安全感与自由之间习惯怎么取舍？「${ASTROLOGY_MODULE_TITLE.who}」模块的核心气质或许是一面镜子。`,
    },
    {
      moduleId: 'week',
      text: `这周可以先做哪件让心更稳的小事？「${ASTROLOGY_MODULE_TITLE.week}」里有一个可执行的切口。`,
    },
  ],
  legal: [
    {
      moduleId: 'love',
      text: `你在冲突里习惯站在什么位置？「${ASTROLOGY_MODULE_TITLE.love}」模块也许能帮你看清自己的模式。`,
    },
    {
      moduleId: 'who',
      text: `你在压力下的节奏是什么样的？「${ASTROLOGY_MODULE_TITLE.who}」模块也许能提供一面镜子。`,
    },
  ],
};

/** 偏好链上的模块都不在报告里时的方向文案（不点名任何模块） */
const GENERIC_DIRECTIONS: Record<SensitiveTopic, string> = {
  medical:
    '最近什么时刻你觉得身体或情绪紧绷？先把它记下来，再看看它通常出现在一天的哪个时段。',
  financial:
    '你在安全感与自由之间习惯怎么取舍？先回看这周一次让你心里发紧的花销，观察它出现前的那个念头。',
  legal: '你在冲突里习惯站在什么位置？先回看最近一次争执，观察自己最先做出的那个反应。',
};

/**
 * 敏感话题的确定性回答：安全话术（文档固定口吻）+ 自我观察方向 + 至多一个模块引用。
 * 命中即由路由直接下发，不经过 LLM、不计费。
 */
export function buildBlockedAnswer(
  topic: SensitiveTopic,
  modules: Array<{ id: ModuleId; title: string }>
): AstrologyQaAnswer {
  const available = new Set(modules.map((module) => module.id));
  const direction = DIRECTIONS[topic].find((item) => available.has(item.moduleId));
  const target = direction ? modules.find((module) => module.id === direction.moduleId) : undefined;
  const directionText = direction?.text ?? GENERIC_DIRECTIONS[topic];

  return {
    kind: 'blocked',
    text:
      `这个问题触及${TOPIC_LABEL[topic]}话题——星盘解读不能据此作出医疗、财务或法律判断。\n` +
      `如果你想多了解自己一点，可以观察：${directionText}`,
    citations: target ? [{ label: target.title, moduleId: target.id }] : [],
  };
}
