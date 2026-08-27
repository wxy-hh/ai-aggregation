import { describe, expect, it, vi, beforeEach } from 'vitest';

// 构造 mockTx —— 所有 prisma.$transaction 回调内的操作都走这里
const mockTx = (() => {
  return {
    quotaAccount: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    quotaReservation: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    quotaLedgerEntry: { create: vi.fn() },
    user: { update: vi.fn() },
    aIUsageRecord: { updateMany: vi.fn() },
  };
})();

vi.mock('../client', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
    // getAvailableQuota / getQuotaReservation 直接使用 prisma，不走 $transaction
    quotaAccount: {
      findUnique: vi.fn(),
    },
    quotaReservation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import {
  reserveQuota,
  claimQuotaReservation,
  settleQuota,
  releaseQuota,
  reserveQuotaBatch,
  markQuotaBillingPending,
  getAvailableQuota,
  getQuotaReservation,
} from '../quota-ledger';
import { prisma } from '../client';

function resetMocks() {
  // mockReset 清除实现 + 调用记录，确保 mockImplementation 不跨测试泄漏
  for (const obj of [mockTx.quotaAccount, mockTx.quotaReservation, mockTx.quotaLedgerEntry, mockTx.user, mockTx.aIUsageRecord]) {
    for (const fn of Object.values(obj).filter((v): v is vi.Mock => typeof v === 'function')) {
      fn.mockReset();
    }
  }
  vi.mocked(prisma.quotaAccount.findUnique).mockReset();
  vi.mocked(prisma.quotaReservation.findFirst).mockReset();
  vi.mocked(prisma.quotaReservation.findMany).mockReset();
  // 重新绑定 $transaction
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(mockTx));
}

function makeAccount(overrides: Record<string, any> = {}) {
  return {
    userId: 'u1',
    availableUnits: 1000,
    reservedUnits: 0,
    settledUnits: 0,
    grantedUnits: 5000,
    ...overrides,
  };
}

function makeReservation(overrides: Record<string, any> = {}) {
  return {
    id: 'r1',
    userId: 'u1',
    requestId: 'req-1',
    feature: 'chat',
    provider: null,
    model: null,
    meterType: 'tokens',
    estimatedUnits: 100,
    settledUnits: 0,
    status: 'reserved',
    executionState: 'ready',
    metadata: null,
    expiresAt: new Date('2099-01-01'),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('quota-ledger', () => {
  beforeEach(resetMocks);

  // ─── reserveQuota ──────────────────────────────────────
  describe('reserveQuota', () => {
    it('正常预留：扣减可用额度，创建预留记录和账本流水', async () => {
      mockTx.quotaAccount.findUnique.mockResolvedValue(makeAccount());
      mockTx.quotaAccount.updateMany.mockResolvedValue({ count: 1 });
      mockTx.quotaReservation.create.mockResolvedValue(makeReservation());
      mockTx.quotaAccount.findUniqueOrThrow.mockResolvedValue(
        makeAccount({ availableUnits: 900, reservedUnits: 100 })
      );

      const result = await reserveQuota({
        userId: 'u1',
        requestId: 'req-1',
        feature: 'chat',
        estimatedUnits: 100,
      });

      expect(result.success).toBe(true);
      expect(mockTx.quotaAccount.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            availableUnits: { decrement: 100 },
            reservedUnits: { increment: 100 },
          }),
        })
      );
      expect(mockTx.quotaReservation.create).toHaveBeenCalledTimes(1);
      expect(mockTx.quotaLedgerEntry.create).toHaveBeenCalledTimes(1);
    });

    it('额度不足时返回 QUOTA_INSUFFICIENT', async () => {
      mockTx.quotaAccount.findUnique.mockResolvedValue(makeAccount({ availableUnits: 50 }));
      mockTx.quotaAccount.updateMany.mockResolvedValue({ count: 0 });

      const result = await reserveQuota({
        userId: 'u1',
        requestId: 'req-1',
        feature: 'chat',
        estimatedUnits: 100,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('QUOTA_INSUFFICIENT');
    });

    it('额度账户不存在时返回 QUOTA_ACCOUNT_MISSING', async () => {
      mockTx.quotaAccount.findUnique.mockResolvedValue(null);

      const result = await reserveQuota({
        userId: 'u1',
        requestId: 'req-1',
        feature: 'chat',
        estimatedUnits: 100,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('QUOTA_ACCOUNT_MISSING');
    });

    it('相同 requestId 幂等返回已有预留', async () => {
      mockTx.quotaReservation.findUnique.mockResolvedValue(makeReservation());

      const result = await reserveQuota({
        userId: 'u1',
        requestId: 'req-1',
        feature: 'chat',
        estimatedUnits: 100,
      });

      expect(result.success).toBe(true);
    });

    it('预留额度为 0 或负数时抛出异常', async () => {
      await expect(
        reserveQuota({ userId: 'u1', requestId: 'req-1', feature: 'chat', estimatedUnits: 0 })
      ).rejects.toThrow('预留额度必须为正整数');

      await expect(
        reserveQuota({ userId: 'u1', requestId: 'req-1', feature: 'chat', estimatedUnits: -1 })
      ).rejects.toThrow('预留额度必须为正整数');
    });
  });

  // ─── claimQuotaReservation ─────────────────────────────
  describe('claimQuotaReservation', () => {
    it('成功领取：executionState 变为 processing', async () => {
      mockTx.quotaReservation.updateMany.mockResolvedValue({ count: 1 });
      mockTx.quotaReservation.findFirst.mockResolvedValue(
        makeReservation({ executionState: 'processing' })
      );

      const result = await claimQuotaReservation({ userId: 'u1', reservationId: 'r1' });

      expect(result.claimed).toBe(true);
      expect(result.reservation?.executionState).toBe('processing');
    });

    it('已被其他请求领取时 claimed 为 false', async () => {
      mockTx.quotaReservation.updateMany.mockResolvedValue({ count: 0 });
      mockTx.quotaReservation.findFirst.mockResolvedValue(makeReservation());

      const result = await claimQuotaReservation({ userId: 'u1', reservationId: 'r1' });

      expect(result.claimed).toBe(false);
    });
  });

  // ─── settleQuota ───────────────────────────────────────
  describe('settleQuota', () => {
    it('实际用量等于预留时正常结算', async () => {
      const r = makeReservation({ estimatedUnits: 100, status: 'reserved' });
      const settled = { ...r, status: 'settled', settledUnits: 100 };
      let findUniqueCall = 0;
      mockTx.quotaReservation.findUnique.mockImplementation(async () => {
        findUniqueCall++;
        return findUniqueCall === 1 ? r : settled;
      });
      mockTx.quotaReservation.updateMany.mockResolvedValue({ count: 1 });
      mockTx.quotaAccount.update.mockResolvedValue(
        makeAccount({ availableUnits: 900, reservedUnits: 0, settledUnits: 100 })
      );
      mockTx.quotaReservation.findUniqueOrThrow.mockResolvedValue(settled);

      const result = await settleQuota({
        reservationId: 'r1',
        measurement: { meterType: 'tokens', quotaUnits: 100, sourceUnits: 100, source: 'test' },
      });

      expect(result.status).toBe('settled');
      expect(result.settledUnits).toBe(100);
    });

    it('实际用量超过预留时进入 billing_pending', async () => {
      const r = makeReservation({ estimatedUnits: 50, status: 'reserved' });
      const pending = { ...r, status: 'billing_pending', executionState: 'completed' };
      let findUniqueCall = 0;
      mockTx.quotaReservation.findUnique.mockImplementation(async () => {
        findUniqueCall++;
        return findUniqueCall === 1 ? r : pending;
      });
      mockTx.quotaReservation.updateMany.mockResolvedValue({ count: 1 });
      mockTx.quotaReservation.findUniqueOrThrow.mockResolvedValue(pending);

      const result = await settleQuota({
        reservationId: 'r1',
        measurement: { meterType: 'tokens', quotaUnits: 80, sourceUnits: 80, source: 'test' },
      });

      expect(result.status).toBe('billing_pending');
    });

    it('已结算的预留不重复结算', async () => {
      mockTx.quotaReservation.findUnique.mockResolvedValue(
        makeReservation({ status: 'settled', settledUnits: 100 })
      );

      const result = await settleQuota({
        reservationId: 'r1',
        measurement: { meterType: 'tokens', quotaUnits: 100, sourceUnits: 100, source: 'test' },
      });

      expect(result.status).toBe('settled');
      expect(mockTx.quotaReservation.updateMany).not.toHaveBeenCalled();
    });

    it('预留不存在时抛出异常', async () => {
      // findUnique 首次返回 null → 直接抛错，不会调用后续 mock
      mockTx.quotaReservation.findUnique.mockReset();
      mockTx.quotaReservation.findUnique.mockResolvedValue(null);

      await expect(
        settleQuota({
          reservationId: 'r1',
          measurement: { meterType: 'tokens', quotaUnits: 100, sourceUnits: 100, source: 'test' },
        })
      ).rejects.toThrow('额度预留不存在');
    });

    it('计量类型不一致时抛出异常', async () => {
      mockTx.quotaReservation.findUnique.mockResolvedValue(
        makeReservation({ meterType: 'tokens' })
      );

      await expect(
        settleQuota({
          reservationId: 'r1',
          measurement: { meterType: 'audio_seconds', quotaUnits: 10, sourceUnits: 10, source: 'test' },
        })
      ).rejects.toThrow('预留计量类型与实际结算类型不一致');
    });
  });

  // ─── releaseQuota ──────────────────────────────────────
  describe('releaseQuota', () => {
    it('释放 reserved 状态的预留：恢复可用额度', async () => {
      mockTx.quotaReservation.findUnique.mockResolvedValue(
        makeReservation({ estimatedUnits: 100, status: 'reserved' })
      );
      mockTx.quotaReservation.updateMany.mockResolvedValue({ count: 1 });
      mockTx.quotaAccount.update.mockResolvedValue(makeAccount({ availableUnits: 1000 }));

      await releaseQuota({ reservationId: 'r1', reason: '测试释放' });

      expect(mockTx.quotaAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reservedUnits: { decrement: 100 },
            availableUnits: { increment: 100 },
          }),
        })
      );
    });

    it('非 reserved 状态不操作', async () => {
      mockTx.quotaReservation.findUnique.mockResolvedValue(
        makeReservation({ status: 'settled' })
      );

      await releaseQuota({ reservationId: 'r1', reason: '测试' });

      expect(mockTx.quotaReservation.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── reserveQuotaBatch ─────────────────────────────────
  describe('reserveQuotaBatch', () => {
    it('空批量直接成功', async () => {
      const result = await reserveQuotaBatch({ userId: 'u1', reservations: [] });
      expect(result.success).toBe(true);
    });

    it('重复 requestId 时抛出异常', async () => {
      await expect(
        reserveQuotaBatch({
          userId: 'u1',
          reservations: [
            { requestId: 'dup', feature: 'c', estimatedUnits: 10 },
            { requestId: 'dup', feature: 'c', estimatedUnits: 20 },
          ],
        })
      ).rejects.toThrow('批量预留中存在重复 requestId');
    });
  });

  // ─── markQuotaBillingPending ───────────────────────────
  describe('markQuotaBillingPending', () => {
    it('标记 reserved 预留为 billing_pending', async () => {
      const r = makeReservation({ status: 'reserved' });
      const pending = { ...r, status: 'billing_pending', executionState: 'completed' };
      let findUniqueCall = 0;
      mockTx.quotaReservation.findUnique.mockImplementation(async () => {
        findUniqueCall++;
        return findUniqueCall === 1 ? r : pending;
      });
      mockTx.quotaReservation.updateMany.mockResolvedValue({ count: 1 });
      mockTx.quotaReservation.findUniqueOrThrow.mockResolvedValue(pending);

      const result = await markQuotaBillingPending({
        reservationId: 'r1',
        meterType: 'tokens',
        reason: '供应商无用量返回',
      });

      expect(result.status).toBe('billing_pending');
    });

    it('预留不存在时抛出异常', async () => {
      mockTx.quotaReservation.findUnique.mockReset();
      mockTx.quotaReservation.findUnique.mockResolvedValue(null);

      await expect(
        markQuotaBillingPending({ reservationId: 'r1', meterType: 'tokens', reason: 'x' })
      ).rejects.toThrow('额度预留不存在');
    });
  });

  // ─── getAvailableQuota ─────────────────────────────────
  describe('getAvailableQuota', () => {
    it('账户存在时返回可用额度', async () => {
      vi.mocked(prisma.quotaAccount.findUnique).mockResolvedValue({ availableUnits: 500 } as any);

      const result = await getAvailableQuota('u1');
      expect(result).toBe(500);
    });

    it('账户不存在时返回 0', async () => {
      vi.mocked(prisma.quotaAccount.findUnique).mockResolvedValue(null);

      const result = await getAvailableQuota('u1');
      expect(result).toBe(0);
    });
  });

  // ─── getQuotaReservation ───────────────────────────────
  describe('getQuotaReservation', () => {
    it('返回序列化后的预留', async () => {
      vi.mocked(prisma.quotaReservation.findFirst).mockResolvedValue(makeReservation() as any);

      const result = await getQuotaReservation('u1', 'r1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('r1');
    });

    it('不存在时返回 null', async () => {
      vi.mocked(prisma.quotaReservation.findFirst).mockResolvedValue(null);

      const result = await getQuotaReservation('u1', 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
