import {
  markExpiredProcessingQuotaReservationsPending,
  reconcilePendingQuota,
  reconcilePendingQuotas,
  releaseExpiredQuotaReservations,
} from '@repo/db';
import type { MeterType } from '@repo/shared';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ReconcilePayload {
  reservationId?: unknown;
  actualUnits?: unknown;
  meterType?: unknown;
  evidence?: unknown;
}

function isMeterType(value: unknown): value is MeterType {
  return (
    value === 'tokens' ||
    value === 'audio_seconds' ||
    value === 'image_task' ||
    value === 'video_task'
  );
}

/**
 * 由受保护的定时任务调用：释放从未执行的预留、锁定执行超时的成本，并重试已保存真实用量的待补账。
 * 传入 reservationId、actualUnits、meterType 时，受信任运营或供应商回调可回填真实计量完成补账。
 */
export async function POST(request: Request) {
  const secret = process.env.BILLING_RECONCILE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: '未配置 BILLING_RECONCILE_SECRET' }, { status: 503 });
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '无权执行额度对账任务' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ReconcilePayload;
    const hasManualReconcile =
      body.reservationId !== undefined || body.actualUnits !== undefined || body.meterType !== undefined;

    if (hasManualReconcile) {
      const reservationId = typeof body.reservationId === 'string' ? body.reservationId.trim() : '';
      const actualUnits = body.actualUnits;
      const evidence = typeof body.evidence === 'string' ? body.evidence.trim() : '';
      if (
        !reservationId ||
        !Number.isSafeInteger(actualUnits) ||
        (actualUnits as number) < 0 ||
        !isMeterType(body.meterType) ||
        evidence.length > 1000
      ) {
        return NextResponse.json(
          { error: '真实用量回填参数无效，必须提供非负整数、计量类型和可选的 1000 字内凭据' },
          { status: 400 }
        );
      }

      const result = await reconcilePendingQuota({
        reservationId,
        actualUnits: actualUnits as number,
        meterType: body.meterType,
        reason: '受保护对账接口回填供应商真实用量',
        metadata: {
          source: 'protected_reconcile_endpoint',
          evidence: evidence || null,
        },
      });
      if (!result.settled) {
        return NextResponse.json(
          {
            error: '真实用量已记录，但当前余额不足以完成补账',
            reservationId,
            status: result.reservation.status,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ settled: true, reservationId, actualUnits, meterType: body.meterType });
    }

    const [releasedReservations, processingReservations, pending] = await Promise.all([
      releaseExpiredQuotaReservations(),
      markExpiredProcessingQuotaReservationsPending(),
      reconcilePendingQuotas(),
    ]);
    return NextResponse.json({ releasedReservations, processingReservations, pending });
  } catch (error) {
    console.error('[billing/reconcile] 执行失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '额度对账任务失败' },
      { status: 500 }
    );
  }
}
