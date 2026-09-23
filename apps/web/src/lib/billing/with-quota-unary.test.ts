import { describe, expect, it, vi } from 'vitest';
import { BillingError } from '@/lib/billing/billing-errors';
import { QuotaSession } from '@/lib/billing/quota-session';
import { withQuotaUnary } from './with-quota-unary';

describe('withQuotaUnary', () => {
  it('run 正常执行时，按 success 终态结算并透传 usage 与 outputText，返回业务结果', async () => {
    const fakeSession = {
      outputLimit: 1024,
      finalize: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(QuotaSession, 'reserve').mockResolvedValue(fakeSession as unknown as QuotaSession);

    const mockRun = vi.fn().mockResolvedValue({
      value: { result: '优化后的提示词' },
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      outputText: '优化后的提示词',
    });

    const result = await withQuotaUnary({
      reserve: {
        userId: 'user-1',
        requestId: 'req-1',
        feature: 'video_prompt',
        provider: 'xunfei',
        model: 'lite',
        messages: [{ content: 'prompt' }],
      },
      userRole: 'user',
      finalize: {
        requestId: 'req-1',
        action: 'video-prompt-optimize',
        endpoint: '/api/video/optimize-prompt',
        userId: 'user-1',
        feature: 'video_prompt',
        provider: 'xunfei',
        model: 'lite',
      },
      run: mockRun,
    });

    expect(result).toEqual({ result: '优化后的提示词' });
    expect(mockRun).toHaveBeenCalledWith(fakeSession);
    expect(fakeSession.finalize).toHaveBeenCalledWith('success', {
      requestId: 'req-1',
      action: 'video-prompt-optimize',
      endpoint: '/api/video/optimize-prompt',
      userId: 'user-1',
      feature: 'video_prompt',
      provider: 'xunfei',
      model: 'lite',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      outputText: '优化后的提示词',
    });
  });

  it('run 未提供 outputText 时，缺省设置为空字符串', async () => {
    const fakeSession = {
      outputLimit: 512,
      finalize: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(QuotaSession, 'reserve').mockResolvedValue(fakeSession as unknown as QuotaSession);

    await withQuotaUnary({
      reserve: {
        userId: 'user-1',
        requestId: 'req-2',
        feature: 'voice',
        provider: 'xunfei',
        model: 'lite',
        messages: [{ content: 'text' }],
      },
      finalize: {
        requestId: 'req-2',
        action: 'voice-translate',
        endpoint: '/api/voice/translate',
      },
      run: async () => ({
        value: { translatedText: 'hello' },
      }),
    });

    expect(fakeSession.finalize).toHaveBeenCalledWith('success', expect.objectContaining({
      outputText: '',
    }));
  });

  it('run 执行抛出异常时，按 failed 终态释放配额，并重新抛出原异常', async () => {
    const fakeSession = {
      outputLimit: 800,
      finalize: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(QuotaSession, 'reserve').mockResolvedValue(fakeSession as unknown as QuotaSession);

    const errorToThrow = new Error('上游模型调用失败');

    await expect(
      withQuotaUnary({
        reserve: {
          userId: 'user-1',
          requestId: 'req-3',
          feature: 'resume',
          provider: 'doubao',
          model: 'seed',
          messages: [{ content: 'text' }],
        },
        finalize: {
          requestId: 'req-3',
          action: 'resume-polish',
          endpoint: '/api/resume/polish',
        },
        run: async () => {
          throw errorToThrow;
        },
      })
    ).rejects.toThrow('上游模型调用失败');

    expect(fakeSession.finalize).toHaveBeenCalledWith('failed', {
      requestId: 'req-3',
      action: 'resume-polish',
      endpoint: '/api/resume/polish',
      usage: undefined,
      outputText: '',
      reason: '上游模型调用失败',
    });
  });

  it('成功终态结算抛错时，仍返回业务结果，且不触发 failed 二次结算', async () => {
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
        feature: 'video_prompt',
        provider: 'xunfei',
        model: 'lite',
        messages: [{ content: 'prompt' }],
      },
      finalize: {
        requestId: 'req-5',
        action: 'video-prompt-optimize',
        endpoint: '/api/video/optimize-prompt',
      },
      run: async () => ({ value: { result: 'ok' }, usage: null }),
    });

    expect(result).toEqual({ result: 'ok' });
    // finalize 仅被 success 调用一次，异常被吞掉后不会再以 failed 重入
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize).toHaveBeenCalledWith('success', expect.anything());
    consoleSpy.mockRestore();
  });

  it('reserve 阶段抛错时（如额度不足），run 与 finalize 均不被调用', async () => {
    const billingError = new BillingError('QUOTA_INSUFFICIENT', '额度不足');
    vi.spyOn(QuotaSession, 'reserve').mockRejectedValue(billingError);

    const mockRun = vi.fn();

    await expect(
      withQuotaUnary({
        reserve: {
          userId: 'user-1',
          requestId: 'req-4',
          feature: 'resume',
          provider: 'doubao',
          model: 'seed',
          messages: [{ content: 'text' }],
        },
        finalize: {
          requestId: 'req-4',
          action: 'resume-diagnose',
          endpoint: '/api/resume/diagnose',
        },
        run: mockRun,
      })
    ).rejects.toThrow(billingError);

    expect(mockRun).not.toHaveBeenCalled();
  });
});
