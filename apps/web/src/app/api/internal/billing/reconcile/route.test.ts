import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  markExpiredProcessingQuotaReservationsPending: vi.fn(),
  reconcilePendingQuota: vi.fn(),
  reconcilePendingQuotas: vi.fn(),
  releaseExpiredQuotaReservations: vi.fn(),
}));

vi.mock('@repo/db', () => mocks);

import { POST } from './route';

function createRequest(body: Record<string, unknown>, authorized = true) {
  return new Request('http://localhost/api/internal/billing/reconcile', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorized ? { authorization: 'Bearer test-reconcile-secret' } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/billing/reconcile', () => {
  beforeEach(() => {
    process.env.BILLING_RECONCILE_SECRET = 'test-reconcile-secret';
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.releaseExpiredQuotaReservations.mockResolvedValue(0);
    mocks.markExpiredProcessingQuotaReservationsPending.mockResolvedValue(0);
    mocks.reconcilePendingQuotas.mockResolvedValue({ scanned: 0, settled: 0, pending: 0 });
  });

  it('拒绝未携带内部密钥的真实用量回填', async () => {
    const response = await POST(
      createRequest(
        { reservationId: 'reservation_1', actualUnits: 18, meterType: 'tokens' },
        false
      )
    );

    expect(response.status).toBe(401);
    expect(mocks.reconcilePendingQuota).not.toHaveBeenCalled();
  });

  it('使用受保护接口回填供应商真实用量并完成待补账', async () => {
    mocks.reconcilePendingQuota.mockResolvedValue({
      settled: true,
      reservation: { id: 'reservation_1', status: 'settled' },
    });

    const response = await POST(
      createRequest({
        reservationId: 'reservation_1',
        actualUnits: 18,
        meterType: 'tokens',
        evidence: '供应商账单流水 provider-bill-1',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.reconcilePendingQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'reservation_1',
        actualUnits: 18,
        meterType: 'tokens',
        reason: '受保护对账接口回填供应商真实用量',
      })
    );
  });

  it('定时对账同时释放未执行预留并锁定执行超时成本', async () => {
    mocks.releaseExpiredQuotaReservations.mockResolvedValue(2);
    mocks.markExpiredProcessingQuotaReservationsPending.mockResolvedValue(1);
    mocks.reconcilePendingQuotas.mockResolvedValue({ scanned: 3, settled: 1, pending: 2 });

    const response = await POST(createRequest({}));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      releasedReservations: 2,
      processingReservations: 1,
      pending: { scanned: 3, settled: 1, pending: 2 },
    });
  });
});
