import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordAiUsage: vi.fn(),
  claimQuotaReservation: vi.fn(),
  getAvailableQuota: vi.fn(),
  getQuotaReservation: vi.fn(),
  markQuotaBillingPending: vi.fn(),
  reconcilePendingQuota: vi.fn(),
  reserveQuotaBatch: vi.fn(),
  releaseQuota: vi.fn(),
  reserveQuota: vi.fn(),
  settleQuota: vi.fn(),
}));

vi.mock('@repo/db', () => mocks);

import {
  reserveAiQuota,
  reserveChatQuotaBatch,
  settleAiQuota,
  useExistingAiQuota,
} from './quota-service';

describe('统一额度结算', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.recordAiUsage.mockResolvedValue(undefined);
  });

  it('已经锁定为待最终结算的实时语音会话，会以实际秒数立即完成补账', async () => {
    mocks.settleQuota.mockResolvedValue({
      id: 'reservation_1',
      userId: 'user_1',
      requestId: 'rtasr-1',
      status: 'billing_pending',
    });
    mocks.reconcilePendingQuota.mockResolvedValue({
      settled: true,
      reservation: {
        id: 'reservation_1',
        userId: 'user_1',
        requestId: 'rtasr-1',
        status: 'settled',
      },
    });

    await settleAiQuota({
      reservationId: 'reservation_1',
      requestId: 'rtasr-1',
      feature: 'voice',
      action: 'voice-transcribe',
      measurement: {
        meterType: 'audio_seconds',
        sourceUnits: 13,
        quotaUnits: 13,
        source: 'local_measurement',
      },
    });

    expect(mocks.reconcilePendingQuota).toHaveBeenCalledWith({
      reservationId: 'reservation_1',
      actualUnits: 13,
      meterType: 'audio_seconds',
    });
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ billingStatus: 'settled', billableUnits: 13 })
    );
  });

  it('文本或语音请求必须原子领取执行权后才能调用供应商', async () => {
    mocks.reserveQuota.mockResolvedValue({
      success: true,
      reservation: {
        id: 'reservation_1',
        userId: 'user_1',
        requestId: 'request_1',
        status: 'reserved',
        executionState: 'ready',
      },
    });
    mocks.claimQuotaReservation.mockResolvedValue({
      claimed: true,
      reservation: {
        id: 'reservation_1',
        userId: 'user_1',
        requestId: 'request_1',
        status: 'reserved',
        executionState: 'processing',
      },
    });

    await expect(
      reserveAiQuota({
        userId: 'user_1',
        requestId: 'request_1',
        feature: 'chat',
        estimatedUnits: 100,
      })
    ).resolves.toMatchObject({ id: 'reservation_1', executionState: 'processing' });

    expect(mocks.claimQuotaReservation).toHaveBeenCalledWith({
      userId: 'user_1',
      reservationId: 'reservation_1',
    });
  });

  it('同一请求已在执行时拒绝再次调用供应商', async () => {
    mocks.reserveQuota.mockResolvedValue({
      success: true,
      reservation: {
        id: 'reservation_1',
        userId: 'user_1',
        requestId: 'request_1',
        status: 'reserved',
        executionState: 'ready',
      },
    });
    mocks.claimQuotaReservation.mockResolvedValue({
      claimed: false,
      reservation: {
        id: 'reservation_1',
        userId: 'user_1',
        requestId: 'request_1',
        status: 'reserved',
        executionState: 'processing',
      },
    });

    await expect(
      reserveAiQuota({
        userId: 'user_1',
        requestId: 'request_1',
        feature: 'chat',
        estimatedUnits: 100,
      })
    ).rejects.toMatchObject({ code: 'REQUEST_IN_PROGRESS' });
  });

  it('批量预留在真正发起模型调用时也只能领取一次', async () => {
    mocks.getQuotaReservation.mockResolvedValue({
      id: 'reservation_2',
      userId: 'user_1',
      requestId: 'batch_1',
      status: 'reserved',
      executionState: 'ready',
    });
    mocks.claimQuotaReservation.mockResolvedValue({
      claimed: false,
      reservation: {
        id: 'reservation_2',
        userId: 'user_1',
        requestId: 'batch_1',
        status: 'settled',
        executionState: 'completed',
      },
    });

    await expect(
      useExistingAiQuota({ userId: 'user_1', reservationId: 'reservation_2', requestId: 'batch_1' })
    ).rejects.toMatchObject({ code: 'REQUEST_ALREADY_PROCESSED' });
  });

  it('多模型余额无法覆盖每个模型的完整输出上限时，调用供应商前统一提示额度不足', async () => {
    mocks.getAvailableQuota.mockResolvedValue(3000);
    mocks.reserveQuotaBatch.mockResolvedValue({ success: true, reservations: [] });

    await expect(
      reserveChatQuotaBatch({
        userId: 'user_1',
        messages: [{ content: '请分别给出两种方案' }],
        models: [
          { requestId: 'batch_1', provider: 'xunfei', model: 'spark-max' },
          { requestId: 'batch_2', provider: 'doubao', model: 'doubao-lite' },
        ],
        maxOutputTokens: 2048,
      })
    ).rejects.toMatchObject({ code: 'QUOTA_INSUFFICIENT' });

    expect(mocks.reserveQuotaBatch).not.toHaveBeenCalled();
  });
});
