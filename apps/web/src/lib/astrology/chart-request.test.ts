/**
 * chart-request.test.ts —— 星座寰宇 · 真值请求调用侧守则测试（12 工单异步接缝改造）
 *
 * 锁定的规则：
 * - requestChartFacts（异步接缝）resolve 的真值与同步 computeChartFacts 完全等价（同一冻结口径，
 *   仅 calculatedAt 为各自生成时刻）；
 * - 超时按 'timeout' 落档、未预期异常按 'unknown' 落档，'model' / 'validation' 为真实计算域预留位；
 * - 连续请求时只有最新令牌有效（先发的过期响应不得写回工作区）。
 */

import { describe, expect, it } from 'vitest';
import type { AstrologyChartFacts } from './chart-facts';
import {
  SAMPLE_PROFILE_ACCURATE,
  SAMPLE_PROFILE_UNKNOWN,
  computeChartFacts,
  requestChartFacts,
} from './mock-chart-facts';
import {
  CHART_FACTS_TIMEOUT_MS,
  ChartFactsRequestError,
  chartFactsErrorKind,
  isLatestChartFactsRequest,
  startChartFactsRequest,
} from './chart-request';

/** 抹掉生成时刻后逐字段比对（calculatedAt 为调用时刻，两次调用本就不会相同） */
function withoutCalculatedAt(
  facts: AstrologyChartFacts
): Omit<AstrologyChartFacts, 'calculatedAt'> {
  const { calculatedAt: _ignored, ...rest } = facts;
  return rest;
}

describe('requestChartFacts（异步真值接缝）', () => {
  it('完整盘：resolve 的真值与同步 computeChartFacts 等价', async () => {
    const facts = await requestChartFacts(SAMPLE_PROFILE_ACCURATE);
    expect(withoutCalculatedAt(facts)).toEqual(
      withoutCalculatedAt(computeChartFacts(SAMPLE_PROFILE_ACCURATE))
    );
    // 生成时刻仍为可解析的 ISO 时刻
    expect(Number.isNaN(Date.parse(facts.calculatedAt))).toBe(false);
    expect(facts.dataCompleteness).toBe('with-houses');
  });

  it('无宫位档（时间未知）：降级字段同样与同步口径等价', async () => {
    const facts = await requestChartFacts(SAMPLE_PROFILE_UNKNOWN);
    expect(withoutCalculatedAt(facts)).toEqual(
      withoutCalculatedAt(computeChartFacts(SAMPLE_PROFILE_UNKNOWN))
    );
    expect(facts.houses).toEqual([]);
    expect(facts.angles.ascendant.sign).toBeNull();
  });

  it('延迟在下界之上（模拟真实网络往返，不是立即返回）', async () => {
    const startedAt = Date.now();
    await requestChartFacts(SAMPLE_PROFILE_ACCURATE);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(400);
  });
});

describe('startChartFactsRequest（超时与令牌）', () => {
  it('超时按 timeout 落档（上限可注入，默认 15s）', async () => {
    expect(CHART_FACTS_TIMEOUT_MS).toBe(15_000);
    const { result } = startChartFactsRequest(SAMPLE_PROFILE_ACCURATE, 5);
    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChartFactsRequestError);
    expect(chartFactsErrorKind(error)).toBe('timeout');
  });

  it('未预期异常一律 unknown；预留档位按档直落', () => {
    expect(chartFactsErrorKind(new Error('boom'))).toBe('unknown');
    expect(chartFactsErrorKind('string error')).toBe('unknown');
    // 真实计算域抛出预留档位即自动落档（'model' 服务繁忙 / 'validation' 资料校验失败）
    expect(chartFactsErrorKind(new ChartFactsRequestError('model', '服务繁忙'))).toBe('model');
    expect(chartFactsErrorKind(new ChartFactsRequestError('validation', '资料校验未通过'))).toBe(
      'validation'
    );
  });

  it('过期响应令牌失效：连续提交时只有最新一次允许写回', async () => {
    const first = startChartFactsRequest(SAMPLE_PROFILE_ACCURATE);
    const second = startChartFactsRequest(SAMPLE_PROFILE_ACCURATE);
    expect(isLatestChartFactsRequest(first.token)).toBe(false);
    expect(isLatestChartFactsRequest(second.token)).toBe(true);
    // 两个请求本身仍都会正常完成（丢弃发生在调用侧写回前）
    const [firstFacts, secondFacts] = await Promise.all([first.result, second.result]);
    expect(withoutCalculatedAt(firstFacts)).toEqual(withoutCalculatedAt(secondFacts));
  });
});
