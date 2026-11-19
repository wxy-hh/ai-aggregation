import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://weixiaoyu@localhost:5432/ai_aggregation';
  }
});

import { prisma } from '../client';
import { releaseStaleBillingPendingReservations } from '../quota-ledger';

describe('QuotaLedger 真实 Postgres 账本事务与原子守卫集成测试', () => {
  let userId: string;
  const testPrefix = `test_ledger_${Date.now()}`;

  beforeAll(async () => {
    // 1. 创建合成测试用户
    const user = await prisma.user.create({
      data: {
        username: `${testPrefix}_user`,
        tokens: 30000,
      },
    });
    userId = user.id;

    // 2. 初始化额度账户：总额 50000，可用 30000，预留 20000，结算 0
    await prisma.quotaAccount.create({
      data: {
        userId,
        grantedUnits: 50000,
        availableUnits: 30000,
        reservedUnits: 20000,
        settledUnits: 0,
      },
    });
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.quotaLedgerEntry.deleteMany({ where: { userId } });
    await prisma.quotaReservation.deleteMany({ where: { userId } });
    await prisma.quotaAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('场景 1: 正常释放超时待补账预留（原子扣减预留并退还可用额度，满足守恒约束）', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const staleRes = await prisma.quotaReservation.create({
      data: {
        userId,
        requestId: `${testPrefix}_req_stale_1`,
        feature: 'chat',
        meterType: 'tokens',
        estimatedUnits: 10000,
        settledUnits: 0,
        status: 'billing_pending',
        executionState: 'completed',
        expiresAt: twoDaysAgo,
        createdAt: twoDaysAgo,
        updatedAt: twoDaysAgo,
      },
    });

    // 传入指定窗口（36h），只命中两日前（48h）的测试数据，不误伤其他待补账数据
    const now = new Date();
    await releaseStaleBillingPendingReservations(now, 36 * 60 * 60 * 1000);

    // 复核预留状态
    const updatedRes = await prisma.quotaReservation.findUniqueOrThrow({
      where: { id: staleRes.id },
    });
    expect(updatedRes.status).toBe('released');
    expect(updatedRes.executionState).toBe('completed');

    // 复核账户余额与守恒约束
    const account = await prisma.quotaAccount.findUniqueOrThrow({
      where: { userId },
    });
    expect(account.reservedUnits).toBe(10000); // 20000 - 10000
    expect(account.availableUnits).toBe(40000); // 30000 + 10000
    expect(account.settledUnits).toBe(0);
    expect(account.grantedUnits).toBe(50000);
    expect(account.availableUnits + account.reservedUnits + account.settledUnits).toBe(
      account.grantedUnits
    );

    // 复核流水记录
    const ledger = await prisma.quotaLedgerEntry.findFirst({
      where: { reservationId: staleRes.id, eventType: 'release' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger?.units).toBe(10000);

    // 场景 1b: 幂等性检验 —— 立即再次执行，不重复扣退，状态与余额保持不变
    await releaseStaleBillingPendingReservations(now, 36 * 60 * 60 * 1000);
    const accountAfterIdempotent = await prisma.quotaAccount.findUniqueOrThrow({
      where: { userId },
    });
    expect(accountAfterIdempotent.reservedUnits).toBe(10000);
    expect(accountAfterIdempotent.availableUnits).toBe(40000);
  });

  it('场景 2: 账户预留余额不足时，原子守卫阻止扣减，不挪用其他活跃预留余额', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // 活跃预留（10000 units，对应账户中仅剩的 10000 reservedUnits）
    const activeRes = await prisma.quotaReservation.create({
      data: {
        userId,
        requestId: `${testPrefix}_req_active_2`,
        feature: 'chat',
        meterType: 'tokens',
        estimatedUnits: 10000,
        settledUnits: 0,
        status: 'reserved',
        executionState: 'ready',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // 异常的超时待补账预留：额度 15000，超过了账户当前的 reservedUnits (10000)
    const brokenStaleRes = await prisma.quotaReservation.create({
      data: {
        userId,
        requestId: `${testPrefix}_req_stale_broken`,
        feature: 'chat',
        meterType: 'tokens',
        estimatedUnits: 15000,
        settledUnits: 0,
        status: 'billing_pending',
        executionState: 'completed',
        expiresAt: twoDaysAgo,
        createdAt: twoDaysAgo,
        updatedAt: twoDaysAgo,
      },
    });

    // 执行释放（指定 36h 窗口，仅扫描 48h 前的测试数据）
    const now = new Date();
    await releaseStaleBillingPendingReservations(now, 36 * 60 * 60 * 1000);

    // 验证 brokenStaleRes 没有被错误释放（由于守卫拦截，该笔返回 false）
    const resAfter = await prisma.quotaReservation.findUniqueOrThrow({
      where: { id: brokenStaleRes.id },
    });
    expect(resAfter.status).toBe('billing_pending');

    // 活跃预留保持不变
    const activeAfter = await prisma.quotaReservation.findUniqueOrThrow({
      where: { id: activeRes.id },
    });
    expect(activeAfter.status).toBe('reserved');

    // 账户 reservedUnits 绝不能被挪用或减出负数
    const accountAfter = await prisma.quotaAccount.findUniqueOrThrow({
      where: { userId },
    });
    expect(accountAfter.reservedUnits).toBe(10000);
    expect(accountAfter.availableUnits).toBe(40000);
    expect(accountAfter.grantedUnits).toBe(50000);
    expect(accountAfter.availableUnits + accountAfter.reservedUnits + accountAfter.settledUnits).toBe(
      accountAfter.grantedUnits
    );

    // 不应产生 brokenStaleRes 的 release 流水
    const brokenLedger = await prisma.quotaLedgerEntry.findFirst({
      where: { reservationId: brokenStaleRes.id, eventType: 'release' },
    });
    expect(brokenLedger).toBeNull();
  });
});
