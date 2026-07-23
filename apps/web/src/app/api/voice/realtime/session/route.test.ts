import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAvailableQuota: vi.fn(),
  reserveAiQuota: vi.fn(),
  currentRole: 'user',
}));

vi.mock('@repo/db', () => ({ getAvailableQuota: mocks.getAvailableQuota }));
vi.mock('@/lib/api/with-auth', () => ({
  withAuth: vi.fn(
    (
      request: Request,
      handler: (user: { id: string; role: string }, request: Request) => unknown
    ) =>
    handler({ id: 'user_1', role: mocks.currentRole }, request)
  ),
}));
vi.mock('@/lib/billing/quota-service', () => ({ reserveAiQuota: mocks.reserveAiQuota }));

import { POST } from './route';

describe('POST /api/voice/realtime/session', () => {
  beforeEach(() => {
    delete process.env.RTASR_MAX_SESSION_SECONDS;
    mocks.currentRole = 'user';
    mocks.getAvailableQuota.mockReset();
    mocks.reserveAiQuota.mockReset();
    mocks.getAvailableQuota.mockResolvedValue(123);
    mocks.reserveAiQuota.mockResolvedValue({
      id: 'reservation_1',
      status: 'reserved',
      estimatedUnits: 123,
    });
  });

  afterEach(() => {
    delete process.env.RTASR_MAX_SESSION_SECONDS;
  });

  it('普通用户预留实际可用的秒数，并将该上限交给网关', async () => {
    const response = await POST(
      new Request('http://localhost/api/voice/realtime/session', {
        method: 'POST',
        body: JSON.stringify({ requestId: 'rtasr-1' }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reservationId: 'reservation_1',
      requestId: 'rtasr-1',
      maxDurationSeconds: 123,
    });
    expect(mocks.reserveAiQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'rtasr-1',
        estimatedUnits: 123,
        meterType: 'audio_seconds',
        claimExecution: false,
      })
    );
  });

  it('管理员不预留额度，但仍获得受服务端配置约束的会话上限', async () => {
    mocks.currentRole = 'admin';
    process.env.RTASR_MAX_SESSION_SECONDS = '300';

    const response = await POST(
      new Request('http://localhost/api/voice/realtime/session', {
        method: 'POST',
        body: JSON.stringify({ requestId: 'rtasr-admin-1' }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reservationId: null,
      maxDurationSeconds: 300,
    });
    expect(mocks.reserveAiQuota).not.toHaveBeenCalled();
  });
});
