import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  claimQuotaReservation: vi.fn(),
  getQuotaReservation: vi.fn(),
  markQuotaBillingPending: vi.fn(),
}));

vi.mock('@repo/db', () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
  claimQuotaReservation: mocks.claimQuotaReservation,
  getQuotaReservation: mocks.getQuotaReservation,
  markQuotaBillingPending: mocks.markQuotaBillingPending,
}));

import { POST } from './route';

describe('POST /api/internal/billing/rtasr/start', () => {
  beforeEach(() => {
    process.env.RTASR_GATEWAY_SECRET = 'test-gateway-secret';
    mocks.findUnique.mockReset();
    mocks.claimQuotaReservation.mockReset();
    mocks.getQuotaReservation.mockReset();
    mocks.markQuotaBillingPending.mockReset();
    mocks.findUnique.mockResolvedValue({ role: 'user' });
    mocks.getQuotaReservation.mockResolvedValue({ requestId: 'rtasr-1', status: 'reserved' });
    mocks.claimQuotaReservation.mockResolvedValue({ claimed: true, reservation: { status: 'reserved' } });
    mocks.markQuotaBillingPending.mockResolvedValue(undefined);
  });

  it('首段音频实际转发后将普通用户预留锁定为待最终结算', async () => {
    const response = await POST(
      new Request('http://localhost/api/internal/billing/rtasr/start', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-gateway-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'user_1',
          requestId: 'rtasr-1',
          reservationId: 'reservation_1',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.getQuotaReservation).toHaveBeenCalledWith('user_1', 'reservation_1');
    expect(mocks.claimQuotaReservation).toHaveBeenCalledWith({
      userId: 'user_1',
      reservationId: 'reservation_1',
    });
    expect(mocks.markQuotaBillingPending).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 'reservation_1', meterType: 'audio_seconds' })
    );
  });
});
