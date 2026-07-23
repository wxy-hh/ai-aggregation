import { NextResponse } from 'next/server';
import { prisma, recordAiUsage } from '@repo/db';
import { createAudioMeasurement } from '@/lib/billing/usage-measurement';
import { releaseAiQuota, settleAiQuota } from '@/lib/billing/quota-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SessionOutcome = 'success' | 'partial' | 'failed';

interface SettlePayload {
  userId?: unknown;
  requestId?: unknown;
  reservationId?: unknown;
  audioSeconds?: unknown;
  outcome?: unknown;
}

function isSessionOutcome(value: unknown): value is SessionOutcome {
  return value === 'success' || value === 'partial' || value === 'failed';
}

/**
 * 仅接受实时语音网关的服务端回调。网关上传的是实际转发 PCM 字节数换算的秒数，
 * 非管理员通过 reservationId 结算，管理员仅记录审计用量。
 */
export async function POST(request: Request) {
  const secret = process.env.RTASR_GATEWAY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: '未配置 RTASR_GATEWAY_SECRET' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '无权结算实时转写用量' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as SettlePayload;
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const requestId = typeof body.requestId === 'string' ? body.requestId.slice(0, 128) : '';
    const reservationId = typeof body.reservationId === 'string' ? body.reservationId : null;
    const audioSeconds =
      typeof body.audioSeconds === 'number' && Number.isFinite(body.audioSeconds)
        ? Math.max(0, Math.ceil(body.audioSeconds))
        : -1;
    const outcome = isSessionOutcome(body.outcome) ? body.outcome : null;

    if (!userId || !requestId || audioSeconds < 0 || !outcome) {
      return NextResponse.json({ error: '实时转写结算参数无效' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) {
      return NextResponse.json({ error: '结算用户不存在' }, { status: 404 });
    }

    if (user.role === 'admin') {
      if (audioSeconds > 0) {
        await recordAiUsage({
          userId,
          requestId,
          feature: 'voice',
          action: 'voice-transcribe',
          provider: 'xunfei',
          model: 'rtasr',
          endpoint: '/api/voice/realtime',
          status: outcome,
          meterType: 'audio_seconds',
          billableUnits: audioSeconds,
          billingStatus: 'settled',
          usage: {
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
            cachedTokens: null,
            reasoningTokens: null,
            taskCount: 1,
          },
          metadata: { source: 'gateway_forwarded_pcm', audioSeconds },
        });
      }
      return NextResponse.json({ settled: true, audioSeconds, exempt: true });
    }

    if (!reservationId) {
      return NextResponse.json({ error: '普通用户实时转写缺少额度预留' }, { status: 400 });
    }

    if (audioSeconds === 0) {
      await releaseAiQuota({
        reservationId,
        meterType: 'audio_seconds',
        reason: '实时转写未转发任何音频数据',
      });
      return NextResponse.json({ settled: true, audioSeconds, released: true });
    }

    await settleAiQuota({
      reservationId,
      requestId,
      feature: 'voice',
      action: 'voice-transcribe',
      provider: 'xunfei',
      model: 'rtasr',
      endpoint: '/api/voice/realtime',
      status: outcome,
      measurement: createAudioMeasurement(audioSeconds),
      metadata: { source: 'gateway_forwarded_pcm', audioSeconds },
    });

    return NextResponse.json({ settled: true, audioSeconds });
  } catch (error) {
    console.error('[billing/rtasr/settle] 结算失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '实时转写结算失败' },
      { status: 500 }
    );
  }
}
