import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingError } from '@/lib/billing/billing-errors';

const mocks = vi.hoisted(() => ({
  xunfeiChat: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  release: vi.fn(),
  safeRecordAiUsage: vi.fn(),
  currentRole: 'user',
}));

vi.mock('@repo/providers', () => ({ xunfeiChat: mocks.xunfeiChat }));
vi.mock('@/lib/api/with-auth', () => ({
  withAuth: vi.fn(
    (
      request: Request,
      handler: (user: { id: string; role: string }, request: Request) => unknown
    ) =>
    handler({ id: 'user_1', role: mocks.currentRole }, request)
  ),
}));
// route 统一走 QuotaSession（billing 已下沉 @repo/db），mock 会话本身而非下层计费函数
vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: mocks.reserve },
}));
vi.mock('@/lib/ai-usage', () => ({
  safeRecordAiUsage: mocks.safeRecordAiUsage,
}));

import { POST } from './route';

function fakeSession(overrides: { outputLimit?: number; hasReservation?: boolean } = {}) {
  const hasReservation = overrides.hasReservation ?? true;
  return {
    outputLimit: overrides.outputLimit ?? 320,
    hasReservation,
    inputUnits: 21,
    // 模拟 QuotaSession.settle 的 hasReservation 守卫：admin 空会话不应触发结算
    settle: vi.fn((...args: unknown[]) => {
      if (hasReservation) return mocks.settle(...args);
      return undefined;
    }),
    release: mocks.release,
    finalize: vi.fn(async (outcome: string, ctx: any) => {
      if (outcome === 'failed') {
        return mocks.release({ reason: ctx.reason });
      }
      if (!hasReservation) {
        return mocks.safeRecordAiUsage({
          userId: ctx.userId,
          feature: ctx.feature,
          action: ctx.action,
          provider: ctx.provider,
          model: ctx.model,
          endpoint: ctx.endpoint,
          requestId: ctx.requestId,
          meterType: 'tokens',
          billableUnits: ctx.usage?.totalTokens ?? null,
          billingStatus: 'settled',
          usage: ctx.usage
            ? {
                inputTokens: ctx.usage.promptTokens,
                outputTokens: ctx.usage.completionTokens,
                totalTokens: ctx.usage.totalTokens,
                cachedTokens: null,
                reasoningTokens: null,
                taskCount: 1,
                rawUsage: ctx.usage,
              }
            : null,
          metadata: ctx.metadata,
        });
      }
      return mocks.settle(
        {
          action: ctx.action,
          endpoint: ctx.endpoint,
          rawUsage: ctx.usage,
          fallbackTokens: 21,
          metadata: ctx.metadata,
        },
        {
          feature: ctx.feature,
          provider: ctx.provider,
          model: ctx.model,
          requestId: ctx.requestId,
        }
      );
    }),
  };
}

describe('POST /api/video/optimize-prompt', () => {
  beforeEach(() => {
    mocks.currentRole = 'user';
    mocks.xunfeiChat.mockReset();
    mocks.reserve.mockReset();
    mocks.settle.mockReset();
    mocks.release.mockReset();
    mocks.safeRecordAiUsage.mockReset();
    mocks.reserve.mockResolvedValue(fakeSession());
    mocks.settle.mockResolvedValue(undefined);
    mocks.release.mockResolvedValue(undefined);
    mocks.xunfeiChat.mockResolvedValue({
      content: '电影感的城市夜景',
      usage: { promptTokens: 21, completionTokens: 12, totalTokens: 33 },
    });
  });

  it('普通用户按供应商实际 Token 结算，而非按视频任务次数计费', async () => {
    const response = await POST(
      new Request('http://localhost/api/video/optimize-prompt', {
        method: 'POST',
        headers: { 'idempotency-key': 'video-prompt-1' },
        body: JSON.stringify({ prompt: '城市夜景' }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'video_prompt', requestId: 'video-prompt-1' }),
      'user'
    );
    expect(mocks.xunfeiChat).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 320 }));
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'video-prompt-optimize',
        rawUsage: expect.objectContaining({ totalTokens: 33 }),
      }),
      expect.objectContaining({
        feature: 'video_prompt',
        requestId: 'video-prompt-1',
      })
    );
  });

  it('管理员免扣额度但仍记录真实 Token 用量', async () => {
    mocks.currentRole = 'admin';
    mocks.reserve.mockResolvedValue(fakeSession({ hasReservation: false }));
    const response = await POST(
      new Request('http://localhost/api/video/optimize-prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt: '城市夜景' }),
      }) as never
    );

    expect(response.status).toBe(200);
    // QuotaSession.reserve 对 admin 也调用（返回空会话），只是不进入 settle
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.safeRecordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        meterType: 'tokens',
        billableUnits: 33,
        feature: 'video_prompt',
      })
    );
  });

  it('重复 requestId 已在执行时不调用供应商，并返回冲突状态', async () => {
    mocks.reserve.mockRejectedValue(
      new BillingError('REQUEST_IN_PROGRESS', '相同请求正在处理中，请勿重复提交', {
        requestId: 'video-prompt-1',
      })
    );

    const response = await POST(
      new Request('http://localhost/api/video/optimize-prompt', {
        method: 'POST',
        headers: { 'idempotency-key': 'video-prompt-1' },
        body: JSON.stringify({ prompt: '城市夜景' }),
      }) as never
    );

    expect(response.status).toBe(409);
    expect(mocks.xunfeiChat).not.toHaveBeenCalled();
  });
});