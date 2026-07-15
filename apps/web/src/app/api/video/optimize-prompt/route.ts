/**
 * 视频提示词优化 API。
 * 这是文本模型调用，必须按模型实际 Token 用量进入统一额度账本，不能按视频任务次数处理。
 */

import { NextRequest, NextResponse } from 'next/server';
import { xunfeiChat } from '@repo/providers';
import { withAuth } from '@/lib/api/with-auth';
import { safeRecordAiUsage } from '@/lib/ai-usage';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';
import {
  releaseAiQuota,
  reserveChatQuota,
  settleAiQuota,
} from '@/lib/billing/quota-service';
import { createTokenMeasurement } from '@/lib/billing/usage-measurement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface OptimizePromptRequest {
  prompt?: unknown;
  aspectRatio?: unknown;
  duration?: unknown;
  requestId?: unknown;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    let reservation: { id: string } | null = null;
    let billingSettled = false;

    try {
      const body = (await request.json()) as OptimizePromptRequest;
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const aspectRatio = typeof body.aspectRatio === 'string' ? body.aspectRatio.trim() : '';
      const duration =
        typeof body.duration === 'number' && Number.isFinite(body.duration) ? body.duration : null;

      if (!prompt) {
        return NextResponse.json({ error: '请输入需要优化的视频描述' }, { status: 400 });
      }
      if (prompt.length > 2000) {
        return NextResponse.json({ error: '视频描述不能超过 2000 个字符' }, { status: 400 });
      }

      const requestId = getBillingRequestId(request, body as Record<string, unknown>);
      const systemPrompt = `你是一个专业的视频生成提示词优化专家。你的任务是将用户简单的描述转换为详细、专业的视频生成提示词。

优化规则：
1. 保留用户原始意图和核心内容
2. 添加视觉细节：光影、色彩、质感、氛围
3. 添加镜头语言：运镜方式、景别、角度
4. 添加技术参数：画质、帧率、后期效果
5. 使用专业术语但保持自然流畅
6. 控制在 150 字以内，简洁有力

现在请优化以下提示词，只返回优化后的结果，不要解释：`;
      const userPrompt = `原始提示词：${prompt}
${aspectRatio ? `画面比例：${aspectRatio}` : ''}
${duration ? `视频时长：${duration} 秒` : ''}

优化后的提示词：`;
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt },
      ];
      let outputLimit = 500;

      if (user.role !== 'admin') {
        const quota = await reserveChatQuota({
          userId: user.id,
          requestId,
          feature: 'video_prompt',
          provider: 'xunfei',
          model: 'lite',
          messages,
          maxOutputTokens: outputLimit,
          metadata: {
            promptLength: prompt.length,
            aspectRatio: aspectRatio || null,
            duration,
          },
        });
        reservation = quota.reservation;
        outputLimit = quota.outputLimit;
      }

      const result = await xunfeiChat({
        messages,
        model: 'lite',
        temperature: 0.7,
        maxTokens: outputLimit,
      });

      if (reservation) {
        await settleAiQuota({
          reservationId: reservation.id,
          requestId,
          feature: 'video_prompt',
          action: 'video-prompt-optimize',
          provider: 'xunfei',
          model: 'lite',
          endpoint: '/api/video/optimize-prompt',
          measurement: createTokenMeasurement(result.usage),
          metadata: {
            promptLength: prompt.length,
            aspectRatio: aspectRatio || null,
            duration,
          },
        });
        billingSettled = true;
      } else {
        // 管理员不扣额度，但保留供应商真实 Token 统计。
        await safeRecordAiUsage({
          userId: user.id,
          feature: 'video_prompt',
          action: 'video-prompt-optimize',
          provider: 'xunfei',
          model: 'lite',
          endpoint: '/api/video/optimize-prompt',
          requestId,
          meterType: 'tokens',
          billableUnits: result.usage?.totalTokens ?? null,
          billingStatus: 'settled',
          usage: result.usage
            ? {
                inputTokens: result.usage.promptTokens,
                outputTokens: result.usage.completionTokens,
                totalTokens: result.usage.totalTokens,
                cachedTokens: null,
                reasoningTokens: null,
                taskCount: 1,
                rawUsage: result.usage,
              }
            : null,
          metadata: {
            promptLength: prompt.length,
            aspectRatio: aspectRatio || null,
            duration,
          },
        });
      }

      return NextResponse.json({
        optimizedPrompt: result.content.trim(),
        original: prompt,
      });
    } catch (error) {
      if (reservation && !billingSettled) {
        await releaseAiQuota({
          reservationId: reservation.id,
          meterType: 'tokens',
          reason: '视频提示词优化请求失败',
        }).catch((releaseError) => console.error('[video/optimize-prompt] 释放额度失败:', releaseError));
      }

      if (error instanceof BillingError) {
        return billingErrorResponse(error, 402);
      }

      console.error('[video/optimize-prompt] 请求失败:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : '视频提示词优化失败' },
        { status: 500 }
      );
    }
  });
}
