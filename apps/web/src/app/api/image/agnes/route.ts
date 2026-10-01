import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { recordMediaTask } from '@/lib/billing/quota-service';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { beginMediaTask, completeMediaTask, failMediaTask } from '@repo/db';
import {
  AGNES_IMAGE_MODEL,
  AgnesUpstreamError,
  requestAgnesImage,
} from '@/lib/services/agnes-image';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    const userId = user.id;
    let mediaTaskId: string | null = null;

    try {
      if (!process.env.AGNES_API_KEY) {
        return NextResponse.json({ error: 'AGNES_API_KEY is not configured' }, { status: 500 });
      }

      const body = (await request.json()) as Record<string, unknown>;
      const requestId = getBillingRequestId(request, body);
      const mediaTask = await beginMediaTask({
        userId,
        requestId,
        feature: 'image',
        provider: 'agnes',
        model: AGNES_IMAGE_MODEL,
        payload: body,
      });
      if (mediaTask.state === 'completed') return NextResponse.json(mediaTask.output);
      if (mediaTask.state === 'processing') {
        return NextResponse.json(
          { error: '相同图片任务正在处理中，请勿重复提交' },
          { status: 409 }
        );
      }
      mediaTaskId = mediaTask.taskId;

      // 上游调用（含 429/5xx 退避重试）下沉到 lib/services/agnes-image，
      // 与 agent 的 image_generate 工具共用同一份协议实现
      let generated: { url: string };
      try {
        generated = await requestAgnesImage({
          prompt: String(body.prompt ?? ''),
          size: String(body.size ?? ''),
          seed: typeof body.seed === 'number' ? body.seed : undefined,
          negativePrompt: typeof body.negative_prompt === 'string' ? body.negative_prompt : undefined,
        });
      } catch (error) {
        await failMediaTask(
          mediaTaskId,
          error instanceof Error ? error.message : '图片生成失败'
        ).catch((taskError) => console.error('[image/agnes] 更新任务状态失败:', taskError));

        const status = error instanceof AgnesUpstreamError ? error.status : 0;
        // 上游服务过载/限流时返回友好提示
        if (status === 503 || status === 429) {
          return NextResponse.json({ error: 'Agnes 服务暂时繁忙，请稍后重试' }, { status: 503 });
        }
        return NextResponse.json(
          {
            error: `Agnes API error: ${error instanceof Error ? error.message : String(error)}`,
          },
          { status: status || 500 }
        );
      }

      // 转换为统一格式（images 数组，前端消费方一致）
      const result = {
        images: [{ url: generated.url }],
      };

      if (userId) {
        await recordMediaTask({
          userId,
          feature: 'image',
          action: 'image-generate',
          provider: 'agnes',
          model: AGNES_IMAGE_MODEL,
          endpoint: '/api/image/agnes',
          requestId,
          metadata: {
            promptLength: typeof body.prompt === 'string' ? body.prompt.length : 0,
            imageSize: body.size,
            imageCount: 1,
          },
        });
      }

      await completeMediaTask(mediaTaskId, result);

      return NextResponse.json(result);
    } catch (error) {
      if (mediaTaskId) {
        await failMediaTask(
          mediaTaskId,
          error instanceof Error ? error.message : '图片生成失败'
        ).catch((taskError) => console.error('[image/agnes] 更新任务状态失败:', taskError));
      }
      if (error instanceof AuthError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.code === 'FORBIDDEN' ? 403 : 401 }
        );
      }
      console.error('Agnes image generation error:', error);
      return NextResponse.json(
        {
          error: 'Internal server error',
          details: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        { status: 500 }
      );
    }
  });
}
