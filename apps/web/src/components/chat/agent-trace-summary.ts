// Agent 过程三态呈现的聚合与映射纯函数（工单 P0a-02）
// 遵循 DESIGN.md 规范与 spec §B / ADR-0012

import type { ToolCallRecord } from '@repo/shared';

/** 工具名 → 中文展示名（未登记的工具直接显示原名） */
export const TOOL_LABELS: Record<string, string> = {
  web_fetch: '网页抓取',
  image_generate: '图像生成',
  web_search: '联网搜索',
};

/** 判断是否为个人远程 MCP 工具调用 */
export function isMcpToolCall(call: Pick<ToolCallRecord, 'name' | 'serverName'>): boolean {
  return Boolean(call.serverName) || call.name.startsWith('mcp_');
}

/**
 * 获取工具中文展示名
 */
export function getToolLabel(name: string, serverName?: string): string {
  if (serverName || name.startsWith('mcp_')) {
    return `[MCP: ${serverName || '远程服务'}]`;
  }
  if (name.startsWith('wh_')) {
    return '外部工具';
  }
  return TOOL_LABELS[name] ?? name;
}

/**
 * 运行态：根据工具名获取单行动作短语（瞬态状态条）
 * - web_fetch: 正在抓取网页…
 * - web_search: 正在联网搜索…
 * - image_generate: 正在生成图像…
 * - mcp_ 前缀 / 带 serverName: 正在调用外部 MCP 工具…
 * - wh_ 前缀（webhook）: 正在调用外部工具…
 * - 兜底: 正在调用工具…
 * - 无工具名/无工具运行: 正在思考下一步…
 */
export function getRunningActionText(toolName?: string, serverName?: string): string {
  if (!toolName) {
    return '正在思考下一步…';
  }
  if (serverName || toolName.startsWith('mcp_')) {
    return serverName ? `正在调用 MCP 服务「${serverName}」…` : '正在调用外部 MCP 工具…';
  }
  if (toolName === 'web_fetch') {
    return '正在抓取网页…';
  }
  if (toolName === 'web_search') {
    return '正在联网搜索…';
  }
  if (toolName === 'image_generate') {
    return '正在生成图像…';
  }
  if (toolName.startsWith('wh_')) {
    return '正在调用外部工具…';
  }
  return '正在调用工具…';
}

/**
 * 格式化毫秒为 X.Xs 格式（规避 IEEE-754 浮点四舍五入漂移）
 */
function formatSeconds(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toFixed(1)}s`;
}

/**
 * 格式化单条工具调用的耗时（x.xs 格式）
 * 若无 durationMs 则返回 null
 */
export function formatSingleDuration(durationMs?: number): string | null {
  if (durationMs === undefined || durationMs === null || isNaN(durationMs) || durationMs < 0) {
    return null;
  }
  return formatSeconds(durationMs);
}

/**
 * 格式化总耗时段短语（耗时 X.Xs）
 */
export function formatTotalDuration(totalMs?: number): string | null {
  if (totalMs === undefined || totalMs === null || isNaN(totalMs) || totalMs < 0) {
    return null;
  }
  return `耗时 ${formatSeconds(totalMs)}`;
}

export interface CompleteSummaryResult {
  /** 聚合元信息短语文本 */
  text: string;
  /** 是否全部失败（警示态） */
  isAllFailed: boolean;
  /** 全部工具耗时之和（有任一 durationMs 时才返回） */
  totalDurationMs?: number;
}

/**
 * 完成态：元信息行聚合纯函数
 *
 * 规则：
 * 1. 优先级取 ≤2 段结果短语：
 *    - 来源 = web_fetch/web_search 成功数合并计（「引用 N 个来源」）
 *    - 出图数 = image_generate 成功数（「生成 N 张图片」）
 *    - 外部工具 = wh_ webhook 成功数（「调用 N 个外部工具」）
 * 2. 仅计 status === 'success'；
 * 3. 耗时和段 = 所有已有 durationMs 的工具耗时之和（X.Xs 格式）；无 durationMs 则省略；
 * 4. 全部失败时警示态：「N 次调用均失败」（耗时和照常显示）。
 */
export function getCompleteSummary(toolCalls: ToolCallRecord[]): CompleteSummaryResult {
  if (toolCalls.length === 0) {
    return {
      text: '过程记录',
      isAllFailed: false,
    };
  }

  // 计算总耗时：仅当存在至少一条工具记录包含有效 durationMs 时统计
  let hasValidDuration = false;
  let totalDurationMs = 0;
  for (const call of toolCalls) {
    if (call.durationMs !== undefined && call.durationMs !== null && !isNaN(call.durationMs)) {
      hasValidDuration = true;
      totalDurationMs += Math.max(0, call.durationMs);
    }
  }

  const durationSegment = hasValidDuration ? formatTotalDuration(totalDurationMs) : null;

  // 检查是否全部失败
  const failedCalls = toolCalls.filter((c) => c.status === 'failed');
  const isAllFailed = failedCalls.length === toolCalls.length;

  if (isAllFailed) {
    const alertPhrase = `${toolCalls.length} 次调用均失败`;
    const text = durationSegment ? `${alertPhrase} · ${durationSegment}` : alertPhrase;
    return {
      text,
      isAllFailed: true,
      totalDurationMs: hasValidDuration ? totalDurationMs : undefined,
    };
  }

  // 成功工具统计
  const successfulCalls = toolCalls.filter((c) => c.status === 'success');
  const sourceCount = successfulCalls.filter(
    (c) => c.name === 'web_fetch' || c.name === 'web_search'
  ).length;
  const imageCount = successfulCalls.filter((c) => c.name === 'image_generate').length;
  const webhookCount = successfulCalls.filter((c) => c.name.startsWith('wh_')).length;
  const mcpCount = successfulCalls.filter((c) => isMcpToolCall(c)).length;

  const candidatePhrases: string[] = [];
  if (sourceCount > 0) {
    candidatePhrases.push(`引用 ${sourceCount} 个来源`);
  }
  if (imageCount > 0) {
    candidatePhrases.push(`生成 ${imageCount} 张图片`);
  }
  if (webhookCount > 0) {
    candidatePhrases.push(`调用 ${webhookCount} 个外部工具`);
  }
  if (mcpCount > 0) {
    candidatePhrases.push(`调用 ${mcpCount} 次 MCP 工具`);
  }

  // 最多取前 2 段
  const selectedPhrases = candidatePhrases.slice(0, 2);

  // 兜底：如果没有任何一段结果短语匹配上，但有成功的调用
  if (selectedPhrases.length === 0 && successfulCalls.length > 0) {
    selectedPhrases.push(`调用了 ${successfulCalls.length} 个工具`);
  }

  // 组装文本
  const segments = [...selectedPhrases];
  if (durationSegment) {
    segments.push(durationSegment);
  }

  return {
    text: segments.join(' · ') || '过程记录',
    isAllFailed: false,
    totalDurationMs: hasValidDuration ? totalDurationMs : undefined,
  };
}
