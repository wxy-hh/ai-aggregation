/**
 * agent-intent.ts —— L0 意图识别纯函数模块（ADR-0012 / 工单 04）
 *
 * 【设计原则】
 * 1. 纯前端零延迟：无模型请求、无网络开销，草稿实时判断；
 * 2. 宁窄勿宽与宁宽勿漏的平衡：URL 为强信号通道；16 个精选查询关键词覆盖 80% 高频联网场景；
 * 3. 隐私安全隔离：仅提取信号分类及命中的词表枚举，URL 原文与草稿正文绝不泄漏给埋点；
 * 4. 字符阈值防抖：草稿长度至少 4 字符，滤除输入单字拼音等过渡态干扰。
 *
 * 【已知误报案例与取舍考量登记】
 * - 案例 1（创作类混合意图）：「帮我搜一下资料写作文」
 *   命中关键词「搜一下」。虽然用户的最终目标是写作，但撰写前期的资料搜集确实受益于实时联网能力。
 *   芯片属于轻量非侵入提示，用户可自主选择是否使用，因此属于【预期命中】。
 *
 * - 案例 2（代码实现类请求）：「用代码实现一个价格计算函数」
 *   命中关键词「价格」。由于 L0 不做抽象语法树或语义意图分析，无法辨别「价格」是业务词还是实体。
 *   由于芯片不抢占焦点且可被一键忽略/关闭，误报代价为 0，符合 ADR-0012「宁窄勿宽，误报代价极低」的取舍。
 *
 * - 案例 3（日常叙述/修辞）：「今天天气真好，心情很舒畅」
 *   命中关键词「天气」。输入法敲击时可能产生轻度视觉提示，但不会改变用户普通回车发送的既有链路。
 *
 * - 案例 4（概念定义与学术问答）：「请解释深度优先搜索算法」
 *   命中关键词「搜索」。广义信息检索与技术查询同频，二期可交由 L2 动态分类器进一步精细过滤。
 */

/** 16 意图关键词白名单（顺序无关，匹配时按在文本中首次出现的位置排序） */
export const AGENT_INTENT_KEYWORDS = [
  '最新',
  '新闻',
  '实时',
  '价格',
  '多少钱',
  '天气',
  '汇率',
  '股价',
  '官网',
  '票房',
  '排名',
  '帮我查',
  '查一下',
  '查下',
  '搜索',
  '搜一下',
] as const;

export type AgentIntentKeyword = (typeof AGENT_INTENT_KEYWORDS)[number];

/** URL 正则匹配规则：支持 http/https 协议以及 www 开头的网址 */
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*/i;

/** 意图识别检测结果类型 */
export interface AgentIntentDetectionResult {
  signal: 'url' | 'keyword';
  keyword?: string;
}

/** 触发意图检测的草稿最小字符数限制 */
export const MIN_DRAFT_LENGTH_FOR_INTENT = 4;

/**
 * 检测当前输入草稿是否命中联网查询意图（L0 纯函数）
 *
 * @param draft 当前输入框文本草稿
 * @returns 命中结果（signal: 'url'|'keyword'）或 null
 */
export function detectAgentIntent(draft: string): AgentIntentDetectionResult | null {
  if (!draft) return null;

  const trimmed = draft.trim();
  // 长度下限：草稿字符数不足 4 字符不予检测
  if (trimmed.length < MIN_DRAFT_LENGTH_FOR_INTENT) {
    return null;
  }

  // 1. URL 强信号优先检测：匹配到网址直接判定为 url 信号（注意：绝对不带 keyword，也不包含 URL 原文）
  if (URL_REGEX.test(trimmed)) {
    return { signal: 'url' };
  }

  // 2. 16 关键词遍历检测：查找在草稿中最先出现的关键词
  let earliestKeyword: string | null = null;
  let earliestIndex = Number.MAX_SAFE_INTEGER;

  for (const kw of AGENT_INTENT_KEYWORDS) {
    const idx = trimmed.indexOf(kw);
    if (idx !== -1 && idx < earliestIndex) {
      earliestIndex = idx;
      earliestKeyword = kw;
    }
  }

  if (earliestKeyword) {
    return {
      signal: 'keyword',
      keyword: earliestKeyword,
    };
  }

  return null;
}
