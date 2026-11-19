import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { QimenAnalyzeRequest } from '../qimen-types';
import type { ModelConfig } from '../destiny-model-client';

const { loggerMock, callModelMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  callModelMock: vi.fn(),
}));

vi.mock('@repo/logger', () => ({
  logger: loggerMock,
}));

vi.mock('../destiny-model-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../destiny-model-client')>();
  return {
    ...original,
    callModel: callModelMock,
  };
});

import { generateQimenSectionResult, buildQimenSectionMessages } from '../qimen-analysis';
import { ModelUpstreamError } from '../destiny-model-client';

const config: ModelConfig = {
  provider: 'doubao',
  baseUrl: 'https://example.test',
  apiKey: 'test-key',
  model: 'doubao-seed',
  protocol: 'ark-responses',
};

const input: QimenAnalyzeRequest = {
  context: {
    datetime: '2026-11-10 12:00',
    location: '北京',
    chartMethod: 'time',
    longitude: 116.4,
  },
  question: {
    category: 'career',
    description: '近期事业发展方向如何',
    focus: 'short_term',
    outputStyle: 'plain',
    outputLength: 'brief',
  },
};

const trace = { analysisId: 'ana-1', stage: 'chartSummary' as const, sectionKey: 'chartSummary' as const };

describe('奇门分块模型模块（评审 C3 纯函数契约）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功路径返回「结果 + 用量物料」二元组，usage 取上游原始 usage', async () => {
    callModelMock.mockResolvedValue({
      text: '{"chartSummary":"当前盘局先稳后进为宜。"}',
      usage: null,
      rawUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      raw: { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
    });

    const { value, usage } = await generateQimenSectionResult('chartSummary', input, config, {
      trace,
    });

    expect(value).toBe('当前盘局先稳后进为宜。');
    expect(usage).toEqual({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
  });

  it('输出预算收敛：预算高于分块内置上限时按上限调用，低于上限时按预算调用，缺省按上限', async () => {
    callModelMock.mockResolvedValue({
      text: '{"chartSummary":"总结内容"}',
      usage: null,
      rawUsage: null,
      raw: {},
    });

    await generateQimenSectionResult('chartSummary', input, config, {
      maxOutputTokens: 100000,
      trace,
    });
    expect(callModelMock.mock.calls[0][0].maxTokens).toBe(4096);

    await generateQimenSectionResult('chartSummary', input, config, {
      maxOutputTokens: 1024,
      trace,
    });
    expect(callModelMock.mock.calls[1][0].maxTokens).toBe(1024);

    await generateQimenSectionResult('chartSummary', input, config, { trace });
    expect(callModelMock.mock.calls[2][0].maxTokens).toBe(4096);
  });

  it('buildQimenSectionMessages 为三个分块各产出 system + user 双消息', () => {
    for (const sectionKey of ['strategyOverview', 'timingWindows', 'chartSummary'] as const) {
      const messages = buildQimenSectionMessages(sectionKey, input);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[0].content.length).toBeGreaterThan(0);
      expect(messages[1].content.length).toBeGreaterThan(0);
    }
  });

  it('TC09-1: 模型超时分支触发 warn 日志，含 analysisId、sectionKey 与耗时', async () => {
    const timeoutError = new Error('aborted');
    timeoutError.name = 'AbortError';
    callModelMock.mockRejectedValue(timeoutError);

    await expect(
      generateQimenSectionResult('chartSummary', input, config, { trace })
    ).rejects.toThrow('模型推演超时');

    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toBe('奇门模型请求超时');
    expect(loggerMock.warn.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        analysisId: 'ana-1',
        sectionKey: 'chartSummary',
        durationMs: expect.any(Number),
      })
    );
  });

  it('TC09-2: 模型非 200 分支触发 warn 日志，含 status 与 trace 上下文', async () => {
    callModelMock.mockRejectedValue(new ModelUpstreamError('上游限流', 429));

    await expect(
      generateQimenSectionResult('strategyOverview', input, config, {
        trace: { analysisId: 'ana-2', stage: 'strategyOverview', sectionKey: 'strategyOverview' },
      })
    ).rejects.toMatchObject({ status: 429 });

    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toBe('奇门模型请求返回非成功状态');
    expect(loggerMock.warn.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        analysisId: 'ana-2',
        sectionKey: 'strategyOverview',
        status: 429,
        durationMs: expect.any(Number),
      })
    );
  });

  it('TC09-3: 模型未知异常分支触发 error 日志，传入错误对象与原始异常同源', async () => {
    const originalError = new Error('连接重置');
    callModelMock.mockRejectedValue(originalError);

    await expect(
      generateQimenSectionResult('chartSummary', input, config, { trace })
    ).rejects.toBe(originalError);

    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toBe('奇门模型请求失败');
    const errorArg = loggerMock.error.mock.calls[0][1];
    const metaArg = loggerMock.error.mock.calls[0][2];
    expect(errorArg).toBe(originalError);
    expect(metaArg).toEqual(
      expect.objectContaining({ analysisId: 'ana-1', sectionKey: 'chartSummary' })
    );
  });

  it('模型返回完全非 JSON 文本时归一化抛错（非法模型 JSON 不进入交付）', async () => {
    callModelMock.mockResolvedValue({
      text: '上游偶发返回了纯文本说明',
      usage: null,
      rawUsage: null,
      raw: {},
    });

    await expect(
      generateQimenSectionResult('chartSummary', input, config, { trace })
    ).rejects.toThrow(/JSON/);
  });

  it('模型返回缺关键字段的 JSON 时契约校验抛错（不交付兜底内容）', async () => {
    callModelMock.mockResolvedValue({
      text: '{"unexpectedField":1}',
      usage: null,
      rawUsage: null,
      raw: {},
    });

    await expect(
      generateQimenSectionResult('strategyOverview', input, config, { trace })
    ).rejects.toThrow(/契约校验|校验/);
  });
});
