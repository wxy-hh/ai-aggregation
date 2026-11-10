import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BillingError } from '../../billing/billing-errors';
import { QuotaSession } from '../../billing/quota-session';
import { safeRecordAiUsage } from '../../billing/ai-usage';
import { withQuotaUnary } from '../../billing/with-quota-unary';

vi.mock('../../billing/ai-usage', () => ({
  safeRecordAiUsage: vi.fn(),
}));

const mocks = {
  safeRecordAiUsage: vi.mocked(safeRecordAiUsage),
};

describe('withQuotaUnary（一元配额托管管道 @repo/db 实现）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.safeRecordAiUsage.mockReset();
  });

  it('TC05-1: run 正常返回 value、usage、outputText 时，finalize 以 success 调用 1 次并原样透传，管道返回 value', async () => {
    const fakeSession = {
      outputLimit: 1024,
      finalize: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(QuotaSession, 'reserve').mockResolvedValue(fakeSession as unknown as QuotaSession);

    const result = await withQuotaUnary({
      reserve: {
        userId: 'user-1',
        requestId: 'req-1',
        feature: 'destiny',
        provider: 'doubao',
        model: 'seed',
        messages: [{ content: 'prompt' }],
      },
      finalize: {
        requestId: 'req-1',
        action: 'destiny-qimen-chart-summary',
        endpoint: 'worker:qimen-section',
        userId: 'user-1',
        feature: 'destiny',
      },
      run: async () => ({
        value: { chartSummary: '盘面总结' },
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        outputText: '',
      }),
    });

    expect(result).toEqual({ chartSummary: '盘面总结' });
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize).toHaveBeenCalledWith('success', {
      requestId: 'req-1',
      action: 'destiny-qimen-chart-summary',
      endpoint: 'worker:qimen-section',
      userId: 'user-1',
      feature: 'destiny',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      outputText: '',
    });
  });

  it('TC05-2: run 未返回 outputText 时，finalize(success) 收到的 outputText 为空串', async () => {
    const fakeSession = {
      outputLimit: 512,
      finalize: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(QuotaSession, 'reserve').mockResolvedValue(fakeSession as unknown as QuotaSession);

    await withQuotaUnary({
      reserve: {
        userId: 'user-1',
        requestId: 'req-2',
        feature: 'destiny',
        provider: 'doubao',
        model: 'seed',
        messages: [{ content: 'text' }],
      },
      finalize: { requestId: 'req-2', action: 'destiny-qimen-chart-summary' },
      run: async () => ({ value: 'ok' }),
    });

    expect(fakeSession.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({ outputText: '' })
    );
  });

  it('TC05-3: run 抛出异常时，finalize 以 failed 调用 1 次且 reason 为原始错误消息，原始异常原样重抛', async () => {
    const fakeSession = {
      outputLimit: 800,
      finalize: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(QuotaSession, 'reserve').mockResolvedValue(fakeSession as unknown as QuotaSession);

    const errorToThrow = new Error('奇门分块存储写入失败');
    await expect(
      withQuotaUnary({
        reserve: {
          userId: 'user-1',
          requestId: 'req-3',
          feature: 'destiny',
          provider: 'doubao',
          model: 'seed',
          messages: [{ content: 'text' }],
        },
        finalize: { requestId: 'req-3', action: 'destiny-qimen-chart-summary' },
        run: async () => {
          throw errorToThrow;
        },
      })
    ).rejects.toBe(errorToThrow);

    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ reason: '奇门分块存储写入失败' })
    );
  });

  it('TC05-4: finalize(success) 自身抛错时被拦截，不触发 failed 二次结算且业务 value 正常返回', async () => {
    const fakeSession = {
      outputLimit: 1024,
      finalize: vi.fn().mockRejectedValue(new Error('DB 不可用')),
    };
    vi.spyOn(QuotaSession, 'reserve').mockResolvedValue(fakeSession as unknown as QuotaSession);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await withQuotaUnary({
      reserve: {
        userId: 'user-1',
        requestId: 'req-5',
        feature: 'destiny',
        provider: 'doubao',
        model: 'seed',
        messages: [{ content: 'prompt' }],
      },
      finalize: { requestId: 'req-5', action: 'destiny-qimen-chart-summary' },
      run: async () => ({ value: 'ok', usage: null }),
    });

    expect(result).toBe('ok');
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize).toHaveBeenCalledWith('success', expect.anything());
    consoleSpy.mockRestore();
  });

  it('TC05-5: reserve 抛错（额度不足）时 run 与 finalize 均未被调用，原始错误直接抛出', async () => {
    const billingError = new BillingError('QUOTA_INSUFFICIENT', '额度不足');
    vi.spyOn(QuotaSession, 'reserve').mockRejectedValue(billingError);

    const mockRun = vi.fn();
    await expect(
      withQuotaUnary({
        reserve: {
          userId: 'user-1',
          requestId: 'req-4',
          feature: 'destiny',
          provider: 'doubao',
          model: 'seed',
          messages: [{ content: 'text' }],
        },
        finalize: { requestId: 'req-4', action: 'destiny-qimen-chart-summary' },
        run: mockRun,
      })
    ).rejects.toBe(billingError);

    expect(mockRun).not.toHaveBeenCalled();
  });

  it('TC05-6: userRole 传 admin 时原样透传至 QuotaSession.reserve，run 成功后触发恰好 1 次无预留用量归档', async () => {
    const reserveSpy = vi.spyOn(QuotaSession, 'reserve');

    await withQuotaUnary({
      reserve: {
        userId: 'admin-1',
        requestId: 'req-6',
        feature: 'destiny',
        provider: 'doubao',
        model: 'seed',
        messages: [{ content: 'prompt' }],
        maxOutputTokens: 4096,
      },
      userRole: 'admin',
      finalize: {
        requestId: 'req-6',
        action: 'destiny-qimen-strategy-overview',
        endpoint: 'worker:qimen-section',
        userId: 'admin-1',
        feature: 'destiny',
        provider: 'doubao',
        model: 'seed',
      },
      run: async (session) => {
        expect(session.hasReservation).toBe(false);
        return { value: 'ok', usage: { totalTokens: 42 } };
      },
    });

    expect(reserveSpy).toHaveBeenCalledWith(expect.anything(), 'admin');
    expect(mocks.safeRecordAiUsage).toHaveBeenCalledTimes(1);
    expect(mocks.safeRecordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'destiny-qimen-strategy-overview',
        provider: 'doubao',
        model: 'seed',
      })
    );
  });

  it('TC05-7: run 返回 usage 为 null 或 undefined 时，finalize(success) 仍被调用 1 次且 usage 原样透传为空值', async () => {
    const fakeSession = {
      outputLimit: 512,
      finalize: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(QuotaSession, 'reserve').mockResolvedValue(fakeSession as unknown as QuotaSession);

    await withQuotaUnary({
      reserve: {
        userId: 'user-1',
        requestId: 'req-7',
        feature: 'destiny',
        provider: 'doubao',
        model: 'seed',
        messages: [{ content: 'text' }],
      },
      finalize: { requestId: 'req-7', action: 'destiny-qimen-chart-summary' },
      run: async () => ({ value: 'ok', usage: undefined }),
    });

    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({ usage: undefined })
    );
  });

  it('TC06-1: 管理员任务保存失败时安全释放，safeRecordAiUsage 调用 0 次且不抛错', async () => {
    await expect(
      withQuotaUnary({
        reserve: {
          userId: 'admin-1',
          requestId: 'req-8',
          feature: 'destiny',
          provider: 'doubao',
          model: 'seed',
          messages: [{ content: 'text' }],
        },
        userRole: 'admin',
        finalize: {
          requestId: 'req-8',
          action: 'destiny-qimen-timing-windows',
          userId: 'admin-1',
          feature: 'destiny',
        },
        run: async () => {
          throw new Error('Redis 写入失败');
        },
      })
    ).rejects.toThrow('Redis 写入失败');

    expect(mocks.safeRecordAiUsage).not.toHaveBeenCalled();
  });
});
