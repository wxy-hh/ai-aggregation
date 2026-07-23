import {
  claimQuotaReservation,
  getQuotaReservation,
  markQuotaBillingPending,
  prisma,
} from '@repo/db';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StartPayload {
  userId?: unknown;
  requestId?: unknown;
  reservationId?: unknown;
}

/**
 * 在首段 PCM 已实际转发到供应商后锁定预留，避免网关结束回调临时失败时，
 * 过期清理任务把已经发生的供应商成本释放给用户。
 */
export async function POST(request: Request) {
  const secret = process.env.RTASR_GATEWAY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: '未配置 RTASR_GATEWAY_SECRET' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '无权锁定实时转写会话' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as StartPayload;
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const reservationId = typeof body.reservationId === 'string' ? body.reservationId : null;
    if (!userId || !requestId || !reservationId) {
      return NextResponse.json({ error: '实时转写启动参数无效' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return NextResponse.json({ error: '结算用户不存在' }, { status: 404 });
    if (user.role === 'admin') return NextResponse.json({ started: true, exempt: true });

    const reservation = await getQuotaReservation(userId, reservationId);
    if (!reservation || reservation.requestId !== requestId) {
      return NextResponse.json({ error: '实时转写预留不存在或不属于当前会话' }, { status: 404 });
    }
    if (reservation.status === 'billing_pending') {
      return NextResponse.json({ started: true, alreadyStarted: true });
    }
    if (reservation.status !== 'reserved') {
      return NextResponse.json({ error: '实时转写会话已结束，不能再次启动' }, { status: 409 });
    }

    const claim = await claimQuotaReservation({ userId, reservationId });
    if (!claim.claimed) {
      if (claim.reservation?.status === 'billing_pending') {
        return NextResponse.json({ started: true, alreadyStarted: true });
      }
      return NextResponse.json({ error: '实时转写会话正在启动或已结束' }, { status: 409 });
    }

    await markQuotaBillingPending({
      reservationId,
      meterType: 'audio_seconds',
      reason: '实时转写已转发首段音频，等待最终秒数结算',
    });
    return NextResponse.json({ started: true });
  } catch (error) {
    console.error('[billing/rtasr/start] 锁定会话失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '无法锁定实时转写会话' },
      { status: 500 }
    );
  }
}
