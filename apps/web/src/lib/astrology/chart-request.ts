/**
 * chart-request.ts —— 星座寰宇 · 真值请求的调用侧守则（12 工单 · 异步接缝改造）
 *
 * 接缝实现见 ./mock-chart-facts.ts 的 requestChartFacts。调用侧（表单提交 / 仪式重试）
 * 统一走本模块，避免两处各写一遍时序与失败映射：
 * - 超时：15s 内未回即判失败——mock 不会超时，真实计算域上线后网络同样需要限时，
 *   否则仪式等待室会永久停在「最后校准中…」；
 * - 过期响应丢弃：连续提交时，先发的响应不得覆盖后发的结果（令牌单调递增）；
 * - 失败映射：超时 → 'timeout'，其余 → 'unknown'；'model' / 'validation' 为真实计算域预留位，
 *   实现只需抛出对应档位的 ChartFactsRequestError 即自动落档。
 */

import type { AstroBirthProfile, AstrologyChartFacts } from './chart-facts';
import { requestChartFacts } from './mock-chart-facts';
import type { AstrologyErrorKind } from '@/stores/destiny-workspace-store';

/** 真值请求超时上限（毫秒）：超时即进既有失败恢复卡（errorKind='timeout'） */
export const CHART_FACTS_TIMEOUT_MS = 15_000;

/** 真值请求失败档位：与工作区 AstrologyErrorKind 同名同义（'model' / 'validation' 为预留位） */
export type ChartFactsRequestErrorKind = 'timeout' | 'model' | 'validation';

/** 真值请求失败（携带失败原因档，调用方据此映射工作区 errorKind） */
export class ChartFactsRequestError extends Error {
  readonly kind: ChartFactsRequestErrorKind;

  constructor(kind: ChartFactsRequestErrorKind, message: string) {
    super(message);
    this.name = 'ChartFactsRequestError';
    this.kind = kind;
  }
}

/** 最近一次真值请求的令牌：只有最新请求的响应允许写进工作区 */
let latestRequestToken = 0;

/**
 * 发起一次真值请求（提交与重试共用）。
 * @param timeoutMs 超时上限，默认 15s（可注入便于测试）
 * @returns token  本次请求令牌——写回工作区前用 isLatestChartFactsRequest 校验，过期响应直接丢弃
 * @returns result 结果 Promise；超时 / 失败以 ChartFactsRequestError 拒绝
 */
export function startChartFactsRequest(
  profile: AstroBirthProfile,
  timeoutMs: number = CHART_FACTS_TIMEOUT_MS
): { token: number; result: Promise<AstrologyChartFacts> } {
  const token = ++latestRequestToken;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ChartFactsRequestError('timeout', '星盘真值请求超时')),
      timeoutMs
    );
  });
  const result = Promise.race([requestChartFacts(profile), timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
  return { token, result };
}

/** 该令牌是否仍是最新一次请求（过期响应必须丢弃，不得覆盖新提交的结果） */
export function isLatestChartFactsRequest(token: number): boolean {
  return token === latestRequestToken;
}

/**
 * 失败原因 → 工作区 errorKind：真值请求错误按档位直落，其余一律 'unknown'
 * （未预期的异常不猜测原因，失败卡只给出「网络中断或计算异常」）。
 */
export function chartFactsErrorKind(error: unknown): AstrologyErrorKind {
  return error instanceof ChartFactsRequestError ? error.kind : 'unknown';
}
