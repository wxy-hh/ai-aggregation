import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  recordAiUsage: vi.fn(),
  settleAiQuota: vi.fn(),
  releaseAiQuota: vi.fn(),
}));

vi.mock('@repo/db', () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
  recordAiUsage: mocks.recordAiUsage,
}));
vi.mock('@/lib/billing/quota-service', () => ({
  settleAiQuota: mocks.settleAiQuota,
  releaseAiQuota: mocks.releaseAiQuota,
}));

import { POST } from './route';

function createRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/internal/billing/rtasr/settle', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-gateway-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/billing/rtasr/settle', () => {
  beforeEach(() => {
    process.env.RTASR_GATEWAY_SECRET = 'test-gateway-secret';
    mocks.findUnique.mockReset();
    mocks.recordAiUsage.mockReset();
    mocks.settleAiQuota.mockReset();
    mocks.releaseAiQuota.mockReset();
    mocks.findUnique.mockResolvedValue({ role: 'user' });
    mocks.settleAiQuota.mockResolvedValue(undefined);
    mocks.releaseAiQuota.mockResolvedValue(undefined);
  });

  it('普通用户使用网关实际转发的秒数结算，并保留部分成功状态', async () => {
    const response = await POST(
      createRequest({
        userId: 'user_1',
        requestId: 'rtasr-1',
        reservationId: 'reservation_1',
        audioSeconds: 12.01,
        outcome: 'partial',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.settleAiQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'reservation_1',
        status: 'partial',
        measurement: expect.objectContaining({
          meterType: 'audio_seconds',
          source: 'local_measurement',
          sourceUnits: 13,
        }),
      })
    );
  });

  it('没有转发任何音频时释放预留，不产生计费记录', async () => {
    const response = await POST(
      createRequest({
        userId: 'user_1',
        requestId: 'rtasr-empty-1',
        reservationId: 'reservation_2',
        audioSeconds: 0,
        outcome: 'failed',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.releaseAiQuota).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 'reservation_2', meterType: 'audio_seconds' })
    );
    expect(mocks.settleAiQuota).not.toHaveBeenCalled();
  });
});
