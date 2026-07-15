import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingError } from '@/lib/billing/billing-errors';

const mocks = vi.hoisted(() => ({
  xunfeiChat: vi.fn(),
  reserveChatQuota: vi.fn(),
  settleAiQuota: vi.fn(),
  releaseAiQuota: vi.fn(),
  safeRecordAiUsage: vi.fn(),
  normalizeUsage: vi.fn((usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) => ({
    inputTokens: usage.promptTokens ?? null,
    outputTokens: usage.completionTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
    cachedTokens: null,
    reasoningTokens: null,
    taskCount: 1,
    rawUsage: usage,
  })),
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
vi.mock('@/lib/billing/quota-service', () => ({
  reserveChatQuota: mocks.reserveChatQuota,
  settleAiQuota: mocks.settleAiQuota,
  releaseAiQuota: mocks.releaseAiQuota,
}));
vi.mock('@/lib/ai-usage', () => ({
  safeRecordAiUsage: mocks.safeRecordAiUsage,
  normalizeUsage: mocks.normalizeUsage,
}));

import { POST } from './route';

describe('POST /api/video/optimize-prompt', () => {
  beforeEach(() => {
    mocks.currentRole = 'user';
    mocks.xunfeiChat.mockReset();
    mocks.reserveChatQuota.mockReset();
    mocks.settleAiQuota.mockReset();
    mocks.releaseAiQuota.mockReset();
    mocks.safeRecordAiUsage.mockReset();
    mocks.reserveChatQuota.mockResolvedValue({ reservation: { id: 'reservation_1' }, outputLimit: 320 });
    mocks.settleAiQuota.mockResolvedValue(undefined);
    mocks.releaseAiQuota.mockResolvedValue(undefined);
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
    expect(mocks.reserveChatQuota).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'video_prompt', requestId: 'video-prompt-1' })
    );
    expect(mocks.xunfeiChat).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 320 }));
    expect(mocks.settleAiQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'video_prompt',
        action: 'video-prompt-optimize',
        reservationId: 'reservation_1',
        measurement: expect.objectContaining({ meterType: 'tokens', sourceUnits: 33 }),
      })
    );
  });

  it('管理员免扣额度但仍记录真实 Token 用量', async () => {
    mocks.currentRole = 'admin';
    const response = await POST(
      new Request('http://localhost/api/video/optimize-prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt: '城市夜景' }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.reserveChatQuota).not.toHaveBeenCalled();
    expect(mocks.safeRecordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        meterType: 'tokens',
        billableUnits: 33,
        feature: 'video_prompt',
      })
    );
  });

  it('重复 requestId 已在执行时不调用供应商，并返回冲突状态', async () => {
    mocks.reserveChatQuota.mockRejectedValue(
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
