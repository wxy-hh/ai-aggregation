import { describe, expect, it, vi, beforeEach } from 'vitest';

const { generateResultMock, buildMessagesMock, storeMock } = vi.hoisted(() => ({
  generateResultMock: vi.fn(),
  buildMessagesMock: vi.fn(),
  storeMock: {
    getSectionResult: vi.fn(),
    markSectionPending: vi.fn(),
    getBaseResult: vi.fn(),
    saveSectionResult: vi.fn(),
    markSectionFailed: vi.fn(),
  },
}));

vi.mock('@repo/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@repo/shared')>();
  return {
    ...original,
    generateQimenSectionResult: generateResultMock,
    buildQimenSectionMessages: buildMessagesMock,
    resolveModelConfig: vi.fn(() => ({
      provider: 'doubao',
      baseUrl: 'https://example.test',
      apiKey: 'test-key',
      model: 'doubao-seed',
      protocol: 'ark-responses',
    })),
  };
});

vi.mock('@repo/redis', () => ({
  getRedisClient: () => ({}),
  QimenAnalysisStore: class {
    getSectionResult = storeMock.getSectionResult;
    markSectionPending = storeMock.markSectionPending;
    getBaseResult = storeMock.getBaseResult;
    saveSectionResult = storeMock.saveSectionResult;
    markSectionFailed = storeMock.markSectionFailed;
  },
}));

import { QuotaSession } from '@repo/db';
import {
  processQimenSectionJob,
  resolveQimenBillingContext,
} from './qimen-section-processor';
import type { QimenSectionJobData } from '@repo/queue';

let reserveSpy: ReturnType<typeof vi.spyOn>;

const input = {
  context: {
    datetime: '2026-11-10 12:00',
    location: '北京',
    chartMethod: 'time' as const,
    longitude: 116.4,
  },
  question: {
    category: 'career' as const,
    description: '近期事业发展方向如何',
    focus: 'short_term' as const,
    outputStyle: 'plain' as const,
    outputLength: 'brief' as const,
  },
};

function makeJob(overrides: Partial<QimenSectionJobData> = {}): QimenSectionJobData {
  return {
    analysisId: 'ana-1',
    userId: 'user-1',
    billingRequestId: 'req-1',
    sectionKey: 'chartSummary',
    input,
    ...overrides,
  };
}

function makeSession(outputLimit = 4096) {
  return {
    hasReservation: true,
    outputLimit,
    finalize: vi.fn().mockResolvedValue(undefined),
  };
}

function finalizeOutcomes(session: ReturnType<typeof makeSession>): string[] {
  return session.finalize.mock.calls.map((call) => call[0]);
}

describe('奇门分块任务处理器（评审 C3 一元配额收口）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserveSpy = vi.spyOn(QuotaSession, 'reserve');
    buildMessagesMock.mockReturnValue([{ role: 'user', content: '消息' }]);
    storeMock.getSectionResult.mockResolvedValue(null);
    storeMock.getBaseResult.mockResolvedValue(null);
    storeMock.saveSectionResult.mockResolvedValue(true);
    storeMock.markSectionPending.mockResolvedValue(undefined);
    storeMock.markSectionFailed.mockResolvedValue(undefined);
  });

  it('TC02-1: 模型成功但保存失败时，结算会话收到 failed 释放 1 次、success 结算 0 次（不扣费）', async () => {
    const session = makeSession();
    reserveSpy.mockResolvedValue(session as unknown as QuotaSession);
    generateResultMock.mockResolvedValue({ value: '盘面总结', usage: { totalTokens: 30 } });
    storeMock.saveSectionResult.mockRejectedValue(new Error('Redis 写入失败'));

    await expect(processQimenSectionJob(makeJob())).rejects.toThrow('Redis 写入失败');

    expect(finalizeOutcomes(session)).toEqual(['failed']);
    expect(session.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ reason: 'Redis 写入失败' })
    );
  });

  it('TC02-2: 模型成功但保存失败时，分块标记 failed 且原始错误向上重抛', async () => {
    const session = makeSession();
    reserveSpy.mockResolvedValue(session as unknown as QuotaSession);
    generateResultMock.mockResolvedValue({ value: '盘面总结', usage: { totalTokens: 30 } });
    storeMock.saveSectionResult.mockRejectedValue(new Error('Redis 写入失败'));

    await expect(processQimenSectionJob(makeJob())).rejects.toThrow('Redis 写入失败');

    expect(storeMock.markSectionFailed).toHaveBeenCalledTimes(1);
    expect(storeMock.markSectionFailed).toHaveBeenCalledWith('ana-1', 'chartSummary', 'Redis 写入失败');
  });

  it('TC03-1: 模型返回非 JSON 文本时，failed 释放 1 次、success 结算 0 次，存储写入 0 次', async () => {
    const session = makeSession();
    reserveSpy.mockResolvedValue(session as unknown as QuotaSession);
    generateResultMock.mockRejectedValue(new Error('奇门模型请求返回的 JSON 无法解析'));

    await expect(processQimenSectionJob(makeJob())).rejects.toThrow('JSON 无法解析');

    expect(finalizeOutcomes(session)).toEqual(['failed']);
    expect(storeMock.saveSectionResult).not.toHaveBeenCalled();
    expect(storeMock.markSectionFailed).toHaveBeenCalledTimes(1);
  });

  it('TC03-2: 模型返回缺关键字段的 JSON 时，failed 释放 1 次、success 结算 0 次，存储写入 0 次', async () => {
    const session = makeSession();
    reserveSpy.mockResolvedValue(session as unknown as QuotaSession);
    generateResultMock.mockRejectedValue(new Error('奇门分块模型输出未通过契约校验（chartSummary）'));

    await expect(processQimenSectionJob(makeJob())).rejects.toThrow('契约校验');

    expect(finalizeOutcomes(session)).toEqual(['failed']);
    expect(storeMock.saveSectionResult).not.toHaveBeenCalled();
  });

  it('TC04-1: 分块结果已存在时直接返回既有结果，不进入计费管道', async () => {
    const existing = { chartSummary: '既有结果' };
    storeMock.getSectionResult.mockResolvedValue(existing);

    const result = await processQimenSectionJob(makeJob());

    expect(result).toEqual(existing);
  });

  it('TC04-2: 重复任务短路时，QuotaSession.reserve 调用 0 次且模型生成调用 0 次', async () => {
    storeMock.getSectionResult.mockResolvedValue({ chartSummary: '既有结果' });

    await processQimenSectionJob(makeJob());

    expect(reserveSpy).not.toHaveBeenCalled();
    expect(generateResultMock).not.toHaveBeenCalled();
  });

  it('TC06-1: 管理员任务以 userRole=admin 执行，免预留会话，成功后 finalize(success) 1 次', async () => {
    const session = makeSession();
    session.hasReservation = false;
    reserveSpy.mockResolvedValue(session as unknown as QuotaSession);
    generateResultMock.mockResolvedValue({ value: '管理员分析结果', usage: { totalTokens: 10 } });

    const result = await processQimenSectionJob(makeJob({ billingRequestId: undefined }));

    expect(result).toBe('管理员分析结果');
    expect(reserveSpy).toHaveBeenCalledWith(expect.anything(), 'admin');
    expect(finalizeOutcomes(session)).toEqual(['success']);
    expect(storeMock.saveSectionResult).toHaveBeenCalledTimes(1);
  });

  it('TC06-2: resolveQimenBillingContext 三态映射（普通用户 / 管理员 / 缺 userId 抛错）', () => {
    expect(
      resolveQimenBillingContext({
        analysisId: 'ana-1',
        sectionKey: 'chartSummary',
        billingRequestId: 'req-9',
        userId: 'user-1',
      })
    ).toMatchObject({ userRole: undefined, requestId: 'req-9' });

    expect(
      resolveQimenBillingContext({
        analysisId: 'ana-1',
        sectionKey: 'timingWindows',
        userId: 'admin-1',
      })
    ).toMatchObject({ userRole: 'admin', requestId: 'qimen-ana-1-timingWindows' });

    expect(() =>
      resolveQimenBillingContext({
        analysisId: 'ana-1',
        sectionKey: 'chartSummary',
        billingRequestId: 'req-9',
      })
    ).toThrow('userId');
  });

  it('TC07-1: 模型上游超时（504）时，failed 释放 1 次、success 结算 0 次，分块标记失败且错误向上重抛', async () => {
    const session = makeSession();
    reserveSpy.mockResolvedValue(session as unknown as QuotaSession);
    const timeoutError = Object.assign(new Error('模型推演超时，请稍后重试'), { status: 504 });
    generateResultMock.mockRejectedValue(timeoutError);

    await expect(processQimenSectionJob(makeJob())).rejects.toMatchObject({ status: 504 });

    expect(finalizeOutcomes(session)).toEqual(['failed']);
    expect(storeMock.markSectionFailed).toHaveBeenCalledWith(
      'ana-1',
      'chartSummary',
      '模型推演超时，请稍后重试'
    );
  });

  it('TC07-2: 模型返回无 usage 字段时任务成功：存储写入 1 次，finalize(success) 1 次且 usage 为 undefined', async () => {
    const session = makeSession();
    reserveSpy.mockResolvedValue(session as unknown as QuotaSession);
    generateResultMock.mockResolvedValue({ value: '无用量结果', usage: undefined });

    const result = await processQimenSectionJob(makeJob());

    expect(result).toBe('无用量结果');
    expect(storeMock.saveSectionResult).toHaveBeenCalledTimes(1);
    expect(session.finalize).toHaveBeenCalledTimes(1);
    expect(session.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({ usage: undefined })
    );
  });
});
