import type {
  BillingEventType,
  BillingMeasurement,
  BillingStatus,
  MeterType,
  QuotaExecutionState,
} from '@repo/shared';
import { Prisma } from '@prisma/client';
import { prisma } from './client';

const DEFAULT_RESERVATION_TTL_MS = 10 * 60 * 1000;
const MAX_QUOTA_UNITS = 2_147_483_647;

export interface ReserveQuotaInput {
  userId: string;
  requestId: string;
  feature: string;
  provider?: string | null;
  model?: string | null;
  estimatedUnits: number;
  meterType?: MeterType;
  metadata?: Record<string, unknown> | null;
  expiresAt?: Date;
}

export interface QuotaReservationResult {
  success: true;
  reservation: {
    id: string;
    userId: string;
    requestId: string;
    estimatedUnits: number;
    settledUnits: number;
    status: BillingStatus;
    meterType: MeterType;
    executionState: QuotaExecutionState;
    metadata?: Record<string, unknown> | null;
  };
}

export interface QuotaReservationFailure {
  success: false;
  code: 'QUOTA_INSUFFICIENT' | 'QUOTA_ACCOUNT_MISSING';
}

export type ReserveQuotaResult = QuotaReservationResult | QuotaReservationFailure;

export interface ReserveQuotaBatchInput {
  userId: string;
  reservations: Array<Omit<ReserveQuotaInput, 'userId'>>;
}

export type ReserveQuotaBatchResult =
  | { success: true; reservations: QuotaReservationResult['reservation'][] }
  | QuotaReservationFailure;

export type ClaimQuotaReservationResult = {
  claimed: boolean;
  reservation: QuotaReservationResult['reservation'] | null;
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_QUOTA_UNITS) {
    throw new Error(`${name}必须为正整数`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_QUOTA_UNITS) {
    throw new Error(`${name}必须为非负整数`);
  }
}

function getReservationStatus(status: string): BillingStatus {
  if (
    status === 'reserved' ||
    status === 'settled' ||
    status === 'released' ||
    status === 'failed' ||
    status === 'billing_pending'
  ) {
    return status;
  }
  return 'billing_pending';
}

function getMeterType(meterType: string): MeterType {
  if (
    meterType === 'tokens' ||
    meterType === 'audio_seconds' ||
    meterType === 'image_task' ||
    meterType === 'video_task'
  ) {
    return meterType;
  }
  return 'tokens';
}

function getExecutionState(executionState: string): QuotaExecutionState {
  if (
    executionState === 'ready' ||
    executionState === 'processing' ||
    executionState === 'completed'
  ) {
    return executionState;
  }
  // 未知状态必须禁止继续调用供应商，避免异常数据导致重复计费。
  return 'completed';
}

function assertReservationMeterType(reservationMeterType: string, meterType: MeterType): void {
  if (getMeterType(reservationMeterType) !== meterType) {
    throw new Error('预留计量类型与实际结算类型不一致');
  }
}

async function ensureQuotaAccount(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string
) {
  return tx.quotaAccount.findUnique({ where: { userId } });
}

/** 将统一账本余额同步到用户资料的只读展示快照。 */
async function syncQuotaSnapshot(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  availableUnits: number
): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: { tokens: Math.max(0, availableUnits) },
  });
}

function serializeReservation(reservation: {
  id: string;
  userId: string;
  requestId: string;
  estimatedUnits: number;
  settledUnits: number;
  status: string;
  meterType: string;
  executionState: string;
  metadata?: unknown;
}): QuotaReservationResult['reservation'] {
  return {
    id: reservation.id,
    userId: reservation.userId,
    requestId: reservation.requestId,
    estimatedUnits: reservation.estimatedUnits,
    settledUnits: reservation.settledUnits,
    status: getReservationStatus(reservation.status),
    meterType: getMeterType(reservation.meterType),
    executionState: getExecutionState(reservation.executionState),
    metadata:
      reservation.metadata && typeof reservation.metadata === 'object'
        ? (reservation.metadata as Record<string, unknown>)
        : null,
  };
}

async function appendLedgerEntry(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: {
    userId: string;
    reservationId?: string | null;
    requestId: string;
    eventType: BillingEventType;
    units: number;
    meterType: MeterType;
    feature?: string | null;
    provider?: string | null;
    model?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  await tx.quotaLedgerEntry.create({
    data: {
      userId: input.userId,
      reservationId: input.reservationId ?? null,
      requestId: input.requestId,
      eventType: input.eventType,
      units: input.units,
      meterType: input.meterType,
      feature: input.feature ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      reason: input.reason ?? null,
      metadata:
        input.metadata === undefined
          ? undefined
          : input.metadata === null
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
    },
  });
}

export async function reserveQuota(input: ReserveQuotaInput): Promise<ReserveQuotaResult> {
  assertPositiveInteger(input.estimatedUnits, '预留额度');
  const meterType = input.meterType ?? 'tokens';
  const expiresAt = input.expiresAt ?? new Date(Date.now() + DEFAULT_RESERVATION_TTL_MS);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.quotaReservation.findUnique({
        where: { userId_requestId: { userId: input.userId, requestId: input.requestId } },
      });
      if (existing) {
        return { success: true, reservation: serializeReservation(existing) };
      }

      const account = await ensureQuotaAccount(tx, input.userId);
      if (!account) return { success: false, code: 'QUOTA_ACCOUNT_MISSING' as const };

      const updated = await tx.quotaAccount.updateMany({
        where: {
          userId: input.userId,
          availableUnits: { gte: input.estimatedUnits },
        },
        data: {
          availableUnits: { decrement: input.estimatedUnits },
          reservedUnits: { increment: input.estimatedUnits },
        },
      });

      if (updated.count === 0) {
        return { success: false, code: 'QUOTA_INSUFFICIENT' as const };
      }

      const reservation = await tx.quotaReservation.create({
        data: {
          userId: input.userId,
          requestId: input.requestId,
          feature: input.feature,
          provider: input.provider ?? null,
          model: input.model ?? null,
          meterType,
          estimatedUnits: input.estimatedUnits,
          expiresAt,
          metadata:
            input.metadata === undefined
              ? undefined
              : input.metadata === null
                ? Prisma.JsonNull
                : (input.metadata as Prisma.InputJsonValue),
        },
      });

      await appendLedgerEntry(tx, {
        userId: input.userId,
        reservationId: reservation.id,
        requestId: input.requestId,
        eventType: 'reserve',
        units: input.estimatedUnits,
        meterType,
        feature: input.feature,
        provider: input.provider,
        model: input.model,
        metadata: input.metadata,
      });

      const nextAccount = await tx.quotaAccount.findUniqueOrThrow({
        where: { userId: input.userId },
      });
      await syncQuotaSnapshot(tx, input.userId, nextAccount.availableUnits);

      return { success: true, reservation: serializeReservation(reservation) };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      const existing = await prisma.quotaReservation.findUnique({
        where: { userId_requestId: { userId: input.userId, requestId: input.requestId } },
      });
      if (existing) return { success: true, reservation: serializeReservation(existing) };
    }
    throw error;
  }
}

/**
 * 原子领取一次供应商调用权。相同 requestId 的并发请求只能有一个调用方成功，
 * 其余请求必须读取既有结果或明确告知用户请求正在执行，不能再次触发供应商成本。
 */
export async function claimQuotaReservation(input: {
  userId: string;
  reservationId: string;
}): Promise<ClaimQuotaReservationResult> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.quotaReservation.updateMany({
      where: {
        id: input.reservationId,
        userId: input.userId,
        status: 'reserved',
        executionState: 'ready',
      },
      data: { executionState: 'processing' },
    });
    const reservation = await tx.quotaReservation.findFirst({
      where: { id: input.reservationId, userId: input.userId },
    });
    return {
      claimed: claimed.count === 1,
      reservation: reservation ? serializeReservation(reservation) : null,
    };
  });
}

/** 同一用户的多模型请求必须在一个事务内全部预留成功，或全部不产生预留。 */
export async function reserveQuotaBatch(
  input: ReserveQuotaBatchInput
): Promise<ReserveQuotaBatchResult> {
  if (input.reservations.length === 0) return { success: true, reservations: [] };

  const requestIds = new Set<string>();
  for (const reservation of input.reservations) {
    assertPositiveInteger(reservation.estimatedUnits, '预留额度');
    if (requestIds.has(reservation.requestId)) {
      throw new Error('批量预留中存在重复 requestId');
    }
    requestIds.add(reservation.requestId);
  }

  const expiresAt = new Date(Date.now() + DEFAULT_RESERVATION_TTL_MS);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.quotaReservation.findMany({
        where: { userId: input.userId, requestId: { in: [...requestIds] } },
      });
      if (existing.length === input.reservations.length) {
        return { success: true, reservations: existing.map(serializeReservation) };
      }
      if (existing.length > 0) {
        throw new Error('批量预留存在不完整的历史请求，拒绝继续扣费');
      }

      const account = await ensureQuotaAccount(tx, input.userId);
      if (!account) return { success: false, code: 'QUOTA_ACCOUNT_MISSING' as const };

      const totalUnits = input.reservations.reduce(
        (sum, reservation) => sum + reservation.estimatedUnits,
        0
      );
      const updated = await tx.quotaAccount.updateMany({
        where: { userId: input.userId, availableUnits: { gte: totalUnits } },
        data: {
          availableUnits: { decrement: totalUnits },
          reservedUnits: { increment: totalUnits },
        },
      });
      if (updated.count === 0) return { success: false, code: 'QUOTA_INSUFFICIENT' as const };

      const created = [] as Array<Awaited<ReturnType<typeof tx.quotaReservation.create>>>;
      for (const reservation of input.reservations) {
        const record = await tx.quotaReservation.create({
          data: {
            userId: input.userId,
            requestId: reservation.requestId,
            feature: reservation.feature,
            provider: reservation.provider ?? null,
            model: reservation.model ?? null,
            meterType: reservation.meterType ?? 'tokens',
            estimatedUnits: reservation.estimatedUnits,
            expiresAt: reservation.expiresAt ?? expiresAt,
            metadata:
              reservation.metadata === undefined
                ? undefined
                : reservation.metadata === null
                  ? Prisma.JsonNull
                  : (reservation.metadata as Prisma.InputJsonValue),
          },
        });
        created.push(record);
        await appendLedgerEntry(tx, {
          userId: input.userId,
          reservationId: record.id,
          requestId: reservation.requestId,
          eventType: 'reserve',
          units: reservation.estimatedUnits,
          meterType: reservation.meterType ?? 'tokens',
          feature: reservation.feature,
          provider: reservation.provider,
          model: reservation.model,
          metadata: reservation.metadata,
        });
      }

      const nextAccount = await tx.quotaAccount.findUniqueOrThrow({
        where: { userId: input.userId },
      });
      await syncQuotaSnapshot(tx, input.userId, nextAccount.availableUnits);
      return { success: true, reservations: created.map(serializeReservation) };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      const existing = await prisma.quotaReservation.findMany({
        where: { userId: input.userId, requestId: { in: [...requestIds] } },
      });
      if (existing.length === input.reservations.length) {
        return { success: true, reservations: existing.map(serializeReservation) };
      }
    }
    throw error;
  }
}

export async function settleQuota(input: {
  reservationId: string;
  measurement: BillingMeasurement;
  reason?: string;
}): Promise<QuotaReservationResult['reservation']> {
  assertNonNegativeInteger(input.measurement.quotaUnits, '实际额度');

  return prisma.$transaction(async (tx) => {
    const reservation = await tx.quotaReservation.findUnique({
      where: { id: input.reservationId },
    });
    if (!reservation) throw new Error('额度预留不存在');
    assertReservationMeterType(reservation.meterType, input.measurement.meterType);
    if (
      reservation.status === 'settled' ||
      reservation.status === 'released' ||
      reservation.status === 'billing_pending'
    ) {
      return serializeReservation(reservation);
    }

    if (input.measurement.quotaUnits > reservation.estimatedUnits) {
      // 供应商实际 usage 超出预留时不能静默放大扣费，也不能释放预留造成漏计费；进入待处理状态等待人工/后台补账。
      const transitioned = await tx.quotaReservation.updateMany({
        where: { id: reservation.id, status: 'reserved' },
        data: { status: 'billing_pending', executionState: 'completed' },
      });
      if (transitioned.count === 0) {
        const current = await tx.quotaReservation.findUniqueOrThrow({
          where: { id: reservation.id },
        });
        return serializeReservation(current);
      }
      const pending = await tx.quotaReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      await appendLedgerEntry(tx, {
        userId: reservation.userId,
        reservationId: reservation.id,
        requestId: `${reservation.requestId}:pending`,
        eventType: 'adjustment',
        units: input.measurement.quotaUnits - reservation.estimatedUnits,
        meterType: input.measurement.meterType,
        feature: reservation.feature,
        provider: reservation.provider,
        model: reservation.model,
        reason: '实际用量超过预留额度，等待补账',
      });
      return serializeReservation(pending);
    }

    const releasedUnits = reservation.estimatedUnits - input.measurement.quotaUnits;
    const transitioned = await tx.quotaReservation.updateMany({
      where: { id: reservation.id, status: 'reserved' },
      data: {
        settledUnits: input.measurement.quotaUnits,
        status: 'settled',
        executionState: 'completed',
      },
    });
    if (transitioned.count === 0) {
      const current = await tx.quotaReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      return serializeReservation(current);
    }
    const account = await tx.quotaAccount.update({
      where: { userId: reservation.userId },
      data: {
        reservedUnits: { decrement: reservation.estimatedUnits },
        availableUnits: { increment: releasedUnits },
        settledUnits: { increment: input.measurement.quotaUnits },
      },
    });

    const settled = await tx.quotaReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });

    await appendLedgerEntry(tx, {
      userId: reservation.userId,
      reservationId: reservation.id,
      requestId: reservation.requestId,
      eventType: 'settle',
      units: input.measurement.quotaUnits,
      meterType: input.measurement.meterType,
      feature: reservation.feature,
      provider: reservation.provider,
      model: reservation.model,
      reason: input.reason,
    });

    if (releasedUnits > 0) {
      await appendLedgerEntry(tx, {
        userId: reservation.userId,
        reservationId: reservation.id,
        requestId: `${reservation.requestId}:release`,
        eventType: 'release',
        units: releasedUnits,
        meterType: input.measurement.meterType,
        feature: reservation.feature,
        provider: reservation.provider,
        model: reservation.model,
        reason: '实际用量小于预留额度',
      });
    }

    await syncQuotaSnapshot(tx, reservation.userId, account.availableUnits);
    return serializeReservation(settled);
  });
}

export async function releaseQuota(input: {
  reservationId: string;
  meterType?: MeterType;
  reason: string;
  onlyIfReady?: boolean;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const reservation = await tx.quotaReservation.findUnique({
      where: { id: input.reservationId },
    });
    if (!reservation || reservation.status !== 'reserved') return;
    if (input.meterType) {
      assertReservationMeterType(reservation.meterType, input.meterType);
    }

    const released = await tx.quotaReservation.updateMany({
      where: {
        id: reservation.id,
        status: 'reserved',
        ...(input.onlyIfReady ? { executionState: 'ready' } : {}),
      },
      data: { status: 'released', executionState: 'completed' },
    });
    if (released.count === 0) return;

    const account = await tx.quotaAccount.update({
      where: { userId: reservation.userId },
      data: {
        reservedUnits: { decrement: reservation.estimatedUnits },
        availableUnits: { increment: reservation.estimatedUnits },
      },
    });

    await appendLedgerEntry(tx, {
      userId: reservation.userId,
      reservationId: reservation.id,
      requestId: `${reservation.requestId}:release`,
      eventType: 'release',
      units: reservation.estimatedUnits,
      meterType: input.meterType ?? getMeterType(reservation.meterType),
      feature: reservation.feature,
      provider: reservation.provider,
      model: reservation.model,
      reason: input.reason,
    });

    await syncQuotaSnapshot(tx, reservation.userId, account.availableUnits);
  });
}

/**
 * 供应商未返回可审计用量时保留预留额度，禁止按本地字符估算直接扣费。
 * 后续由对账任务在拿到真实用量后调用 reconcilePendingQuota 完成结算。
 */
export async function markQuotaBillingPending(input: {
  reservationId: string;
  meterType: MeterType;
  reason: string;
}): Promise<QuotaReservationResult['reservation']> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.quotaReservation.findUnique({
      where: { id: input.reservationId },
    });
    if (!reservation) throw new Error('额度预留不存在');
    assertReservationMeterType(reservation.meterType, input.meterType);
    if (reservation.status !== 'reserved') return serializeReservation(reservation);

    const transitioned = await tx.quotaReservation.updateMany({
      where: { id: reservation.id, status: 'reserved' },
      data: { status: 'billing_pending', executionState: 'completed' },
    });
    if (transitioned.count === 0) {
      const current = await tx.quotaReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      return serializeReservation(current);
    }
    const pending = await tx.quotaReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    await appendLedgerEntry(tx, {
      userId: reservation.userId,
      reservationId: reservation.id,
      requestId: `${reservation.requestId}:pending`,
      eventType: 'adjustment',
      units: 0,
      meterType: input.meterType,
      feature: reservation.feature,
      provider: reservation.provider,
      model: reservation.model,
      reason: input.reason,
    });
    return serializeReservation(pending);
  });
}

/** 对已有真实 usage 的待补账预留进行二次结算；余额不足时保留 pending，等待下次补账。 */
export async function reconcilePendingQuota(input: {
  reservationId: string;
  actualUnits: number;
  meterType: MeterType;
  reason?: string;
  metadata?: Record<string, unknown> | null;
}): Promise<{ settled: boolean; reservation: QuotaReservationResult['reservation'] }> {
  assertNonNegativeInteger(input.actualUnits, '实际额度');

  return prisma.$transaction(async (tx) => {
    const reservation = await tx.quotaReservation.findUnique({
      where: { id: input.reservationId },
    });
    if (!reservation) throw new Error('额度预留不存在');
    assertReservationMeterType(reservation.meterType, input.meterType);
    if (reservation.status !== 'billing_pending') {
      return {
        settled: reservation.status === 'settled',
        reservation: serializeReservation(reservation),
      };
    }

    // 将待补账记录原子地领取给当前对账方，防止定时任务、供应商回调和人工回填并发重复扣账。
    const claimed = await tx.quotaReservation.updateMany({
      where: {
        id: reservation.id,
        status: 'billing_pending',
        executionState: 'completed',
      },
      data: { executionState: 'processing' },
    });
    if (claimed.count === 0) {
      const current = await tx.quotaReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      return { settled: current.status === 'settled', reservation: serializeReservation(current) };
    }

    const additionalUnits = Math.max(0, input.actualUnits - reservation.estimatedUnits);
    const releasedUnits = Math.max(0, reservation.estimatedUnits - input.actualUnits);
    const updated = await tx.quotaAccount.updateMany({
      where: { userId: reservation.userId, availableUnits: { gte: additionalUnits } },
      data: {
        availableUnits:
          additionalUnits > 0 ? { decrement: additionalUnits } : { increment: releasedUnits },
        reservedUnits: { decrement: reservation.estimatedUnits },
        settledUnits: { increment: input.actualUnits },
      },
    });
    if (updated.count === 0) {
      const pending = await tx.quotaReservation.update({
        where: { id: reservation.id },
        data: { executionState: 'completed' },
      });
      return { settled: false, reservation: serializeReservation(pending) };
    }

    const settled = await tx.quotaReservation.update({
      where: { id: reservation.id },
      data: {
        settledUnits: input.actualUnits,
        status: 'settled',
        executionState: 'completed',
      },
    });
    await tx.aIUsageRecord.updateMany({
      where: { reservationId: reservation.id },
      data: {
        status: 'success',
        meterType: input.meterType,
        billableUnits: input.actualUnits,
        totalTokens: input.meterType === 'tokens' ? input.actualUnits : null,
        billingStatus: 'settled',
      },
    });
    await appendLedgerEntry(tx, {
      userId: reservation.userId,
      reservationId: reservation.id,
      requestId: reservation.requestId,
      eventType: 'settle',
      units: input.actualUnits,
      meterType: input.meterType,
      feature: reservation.feature,
      provider: reservation.provider,
      model: reservation.model,
      reason: input.reason ?? '待补账额度结算完成',
      metadata: input.metadata,
    });
    if (releasedUnits > 0) {
      await appendLedgerEntry(tx, {
        userId: reservation.userId,
        reservationId: reservation.id,
        requestId: `${reservation.requestId}:release`,
        eventType: 'release',
        units: releasedUnits,
        meterType: input.meterType,
        feature: reservation.feature,
        provider: reservation.provider,
        model: reservation.model,
        reason: input.reason ?? '待补账实际用量小于预留额度',
        metadata: input.metadata,
      });
    }
    const account = await tx.quotaAccount.findUniqueOrThrow({
      where: { userId: reservation.userId },
    });
    await syncQuotaSnapshot(tx, reservation.userId, account.availableUnits);
    return { settled: true, reservation: serializeReservation(settled) };
  });
}

/** 释放从未领取供应商调用权的过期预留；已开始执行的请求绝不能自动退款。 */
export async function releaseExpiredQuotaReservations(now = new Date()): Promise<number> {
  const reservations = await prisma.quotaReservation.findMany({
    where: { status: 'reserved', executionState: 'ready', expiresAt: { lt: now } },
    select: { id: true },
  });
  await Promise.all(
    reservations.map((reservation) =>
      releaseQuota({
        reservationId: reservation.id,
        reason: '预留额度超时自动释放',
        onlyIfReady: true,
      })
    )
  );
  return reservations.length;
}

/**
 * 供应商调用已开始但应用在结算前中断时，不能把可能已经产生的成本退回。
 * 到期后统一转入待补账，等待供应商真实用量、回调或受保护的人工回填。
 */
export async function markExpiredProcessingQuotaReservationsPending(now = new Date()): Promise<number> {
  const reservations = await prisma.quotaReservation.findMany({
    where: { status: 'reserved', executionState: 'processing', expiresAt: { lt: now } },
    select: { id: true },
  });

  let marked = 0;
  for (const item of reservations) {
    const transitioned = await prisma.$transaction(async (tx) => {
      const reservation = await tx.quotaReservation.findUnique({ where: { id: item.id } });
      if (
        !reservation ||
        reservation.status !== 'reserved' ||
        reservation.executionState !== 'processing' ||
        reservation.expiresAt >= now
      ) {
        return false;
      }
      const updated = await tx.quotaReservation.updateMany({
        where: { id: reservation.id, status: 'reserved', executionState: 'processing' },
        data: { status: 'billing_pending', executionState: 'completed' },
      });
      if (updated.count === 0) return false;
      await appendLedgerEntry(tx, {
        userId: reservation.userId,
        reservationId: reservation.id,
        requestId: `${reservation.requestId}:pending`,
        eventType: 'adjustment',
        units: 0,
        meterType: getMeterType(reservation.meterType),
        feature: reservation.feature,
        provider: reservation.provider,
        model: reservation.model,
        reason: '供应商调用超时未结算，等待真实用量对账',
      });
      return true;
    });
    if (transitioned) marked += 1;
  }
  return marked;
}

/** 扫描已有 usage 的待补账预留，余额恢复后可由定时任务重复调用。 */
export async function reconcilePendingQuotas(limit = 100): Promise<{
  scanned: number;
  settled: number;
  pending: number;
}> {
  const reservations = await prisma.quotaReservation.findMany({
    where: { status: 'billing_pending' },
    include: {
      aiUsageRecord: { select: { billableUnits: true, totalTokens: true, meterType: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let settled = 0;
  for (const reservation of reservations) {
    const usage = reservation.aiUsageRecord;
    const actualUnits = usage?.billableUnits ?? usage?.totalTokens;
    if (actualUnits === null || actualUnits === undefined || actualUnits < 0) continue;
    const result = await reconcilePendingQuota({
      reservationId: reservation.id,
      actualUnits,
      meterType: (usage?.meterType as MeterType | null) ?? 'tokens',
      reason: '已保存真实用量的定时对账',
      metadata: { source: 'scheduled_usage_reconcile' },
    });
    if (result.settled) settled += 1;
  }

  return { scanned: reservations.length, settled, pending: reservations.length - settled };
}

/** 读取统一额度账户的可用额度；额度账户缺失时视为不可消费。 */
export async function getAvailableQuota(userId: string): Promise<number> {
  const account = await prisma.quotaAccount.findUnique({
    where: { userId },
    select: { availableUnits: true },
  });
  return account?.availableUnits ?? 0;
}

/** 仅返回当前用户自己的预留，供批量对比请求复用并校验归属。 */
export async function getQuotaReservation(userId: string, reservationId: string) {
  const reservation = await prisma.quotaReservation.findFirst({
    where: { id: reservationId, userId },
  });
  return reservation ? serializeReservation(reservation) : null;
}

/** 管理员调整余额时同时更新额度账户、审计流水和用户余额快照。 */
export async function setQuotaBalanceInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    availableUnits: number;
    requestId: string;
    reason: string;
  }
): Promise<void> {
  assertNonNegativeInteger(input.availableUnits, '目标余额');

  const account = await tx.quotaAccount.findUnique({ where: { userId: input.userId } });
  if (!account) throw new Error('额度账户不存在');

  const adjustment = input.availableUnits - account.availableUnits;
  const grantedUnits = account.settledUnits + account.reservedUnits + input.availableUnits;
  await tx.quotaAccount.update({
    where: { userId: input.userId },
    data: { availableUnits: input.availableUnits, grantedUnits },
  });
  await appendLedgerEntry(tx, {
    userId: input.userId,
    requestId: input.requestId,
    eventType: 'adjustment',
    units: adjustment,
    meterType: 'tokens',
    reason: input.reason,
  });
  await syncQuotaSnapshot(tx, input.userId, input.availableUnits);
}

export async function setQuotaBalance(input: {
  userId: string;
  availableUnits: number;
  requestId: string;
  reason: string;
}): Promise<void> {
  await prisma.$transaction((tx) => setQuotaBalanceInTransaction(tx, input));
}
