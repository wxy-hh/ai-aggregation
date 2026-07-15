import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingError } from '@/lib/billing/billing-errors';

const mocks = vi.hoisted(() => ({
  reserveChatQuota: vi.fn(),
  releaseAiQuota: vi.fn(),
  settleAiQuota: vi.fn(),
}));

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: (_request: Request, handler: (user: { id: string; role: string }) => Promise<Response>) =>
    handler({ id: 'user_1', role: 'user' }),
}));

vi.mock('@/lib/billing/quota-service', () => mocks);
vi.mock('@/lib/billing/request-id', () => ({ getBillingRequestId: () => 'resume-polish-quota' }));

import { POST } from './route';

describe('POST /api/resume/polish', () => {
  beforeEach(() => {
    process.env.ARK_API_KEY = 'test-key';
    mocks.reserveChatQuota.mockReset();
    mocks.releaseAiQuota.mockReset();
    mocks.settleAiQuota.mockReset();
  });

  it('额度不足时返回统一的 402 错误，而不是 500', async () => {
    mocks.reserveChatQuota.mockRejectedValue(
      new BillingError('QUOTA_INSUFFICIENT', '当前额度不足以处理本次对话', {
        requestId: 'resume-polish-quota',
      })
    );

    const response = await POST(
      new Request('http://localhost/api/resume/polish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'summary', text: '负责前端开发与性能优化。' }),
      })
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ code: 'QUOTA_INSUFFICIENT' });
    expect(mocks.releaseAiQuota).not.toHaveBeenCalled();
  });
});
