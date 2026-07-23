import { NextResponse } from 'next/server';
import { getAvailableQuota } from '@repo/db';
import { withAuth } from '@/lib/api/with-auth';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { reserveAiQuota } from '@/lib/billing/quota-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_MAX_SESSION_SECONDS = 600;
const MAX_SESSION_SECONDS_CAP = 3600;
const SESSION_SETTLEMENT_GRACE_SECONDS = 180;

function getMaxSessionSeconds(): number {
  const configured = Number(process.env.RTASR_MAX_SESSION_SECONDS ?? DEFAULT_MAX_SESSION_SECONDS);
  if (!Number.isFinite(configured)) return DEFAULT_MAX_SESSION_SECONDS;
  return Math.min(MAX_SESSION_SECONDS_CAP, Math.max(1, Math.floor(configured)));
}

/**
 * 为实时转写会话建立服务端额度预留。浏览器只把登录令牌交给网关，
 * 网关必须向此接口换取会话信息后才能连接供应商。
 */
export async function POST(request: Request) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const requestId = getBillingRequestId(request, body);
      const configuredMaxSeconds = getMaxSessionSeconds();

      if (user.role === 'admin') {
        return NextResponse.json({
          userId: user.id,
          requestId,
          reservationId: null,
          maxDurationSeconds: configuredMaxSeconds,
        });
      }

      const availableUnits = await getAvailableQuota(user.id);
      if (availableUnits < 1) {
        throw new BillingError('QUOTA_INSUFFICIENT', '当前额度不足，无法开始实时转写', {
          requestId,
        });
      }

      const estimatedUnits = Math.min(configuredMaxSeconds, availableUnits);
      const reservation = await reserveAiQuota({
        userId: user.id,
        requestId,
        feature: 'voice',
        provider: 'xunfei',
        model: 'rtasr',
        estimatedUnits,
        meterType: 'audio_seconds',
        expiresAt: new Date(
          Date.now() + (estimatedUnits + SESSION_SETTLEMENT_GRACE_SECONDS) * 1000
        ),
        metadata: {
          maxDurationSeconds: estimatedUnits,
          configuredMaxSeconds,
          billingMode: 'realtime_pcm_bytes',
        },
        // 会话创建不等于供应商已开始计费；首段音频转发时由受信任网关领取执行权。
        claimExecution: false,
      });

      if (reservation.status !== 'reserved') {
        throw new BillingError('QUOTA_LIMIT_REACHED', '本次实时转写会话已结束，请重新开始', {
          requestId,
          reservationId: reservation.id,
        });
      }

      return NextResponse.json({
        userId: user.id,
        requestId,
        reservationId: reservation.id,
        maxDurationSeconds: reservation.estimatedUnits,
      });
    } catch (error) {
      if (error instanceof BillingError) return billingErrorResponse(error, 402);
      console.error('[voice/realtime/session] 创建会话失败:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : '无法创建实时转写会话' },
        { status: 500 }
      );
    }
  });
}
