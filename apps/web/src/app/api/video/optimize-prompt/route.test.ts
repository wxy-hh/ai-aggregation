import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingError } from '@/lib/billing/billing-errors';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';

const mocks = vi.hoisted(() => ({
  xunfeiChat: vi.fn(),
  reserve: vi.fn(),
  finalize: vi.fn(),
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
// 路由统一走 QuotaSession（billing 已下沉 @repo/db），mock 会话本身而非下层计费函数
vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: mocks.reserve },
}));

import { POST } from './route';

function fakeSession(overrides: { outputLimit?: number; hasReservation?: boolean } = {}) {
  return createFakeQuotaSession({
    outputLimit: overrides.outputLimit ?? 320,
    hasReservation: overrides.hasReservation ?? true,
    inputUnits: 21,
    finalize: mocks.finalize,
  });
}

describe('POST /api/video/optimize-prompt', () => {
  beforeEach(() => {
    mocks.currentRole = 'user';
    mocks.xunfeiChat.mockReset();
    mocks.reserve.mockReset();
    mocks.finalize.mockReset();
    mocks.reserve.mockResolvedValue(fakeSession());
    mocks.finalize.mockResolvedValue(undefined);
    mocks.xunfeiChat.mockResolvedValue({
      content: '电影感的城市夜景',
      usage: { promptTokens: 21, completionTokens: 12, totalTokens: 33 },
    });
  });

  it('普通用户请求成功：调用 QuotaSession 预留与按供应商原始用量声明 success 终态', async () => {
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
    expect(mocks.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        action: 'video-prompt-optimize',
        endpoint: '/api/video/optimize-prompt',
        feature: 'video_prompt',
        requestId: 'video-prompt-1',
        usage: { promptTokens: 21, completionTokens: 12, totalTokens: 33 },
      })
    );
  });

  it('管理员请求同样完成预留与成功结算（免扣与归档由 QuotaSession 决策表承担）', async () => {
    mocks.currentRole = 'admin';
    mocks.reserve.mockResolvedValue(fakeSession({ hasReservation: false }));
    const response = await POST(
      new Request('http://localhost/api/video/optimize-prompt', {
        method: 'POST',
        body: JSON.stringify({ prompt: '城市夜景' }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'video_prompt' }),
      'admin'
    );
    expect(mocks.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        action: 'video-prompt-optimize',
        feature: 'video_prompt',
        usage: { promptTokens: 21, completionTokens: 12, totalTokens: 33 },
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