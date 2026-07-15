import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { recordMediaTask } from '@/lib/billing/quota-service';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { beginMediaTask, completeMediaTask, failMediaTask } from '@repo/db';

const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_API_URL =
  process.env.AGNES_INFERENCE_API_URL || 'https://apihub.agnes-ai.com/v1/images/generations';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    const userId = user.id;
    let mediaTaskId: string | null = null;

    try {
      if (!AGNES_API_KEY) {
        return NextResponse.json({ error: 'AGNES_API_KEY is not configured' }, { status: 500 });
      }

      const body = (await request.json()) as Record<string, unknown>;
      const requestId = getBillingRequestId(request, body);
      const mediaTask = await beginMediaTask({
        userId,
        requestId,
        feature: 'image',
        provider: 'agnes',
        model: 'agnes-image-2.1-flash',
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

      const apiBody: Record<string, unknown> = {
        model: 'agnes-image-2.1-flash',
        prompt: body.prompt,
        size: body.size,
        extra_body: {
          response_format: 'url',
        },
      };
      if (body.quality) apiBody.quality = body.quality;
      if (body.seed != null) apiBody.seed = body.seed;
      if (body.negative_prompt) apiBody.negative_prompt = body.negative_prompt;

      const response = await fetch(AGNES_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AGNES_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await failMediaTask(mediaTaskId, errorText);
        return NextResponse.json(
          { error: `Agnes API error: ${errorText}` },
          { status: response.status }
        );
      }

      const data = await response.json();

      // 转换为统一格式（与 Kolors 返回格式兼容）
      const imageData = data.data?.[0] || data.images?.[0];
      if (!imageData?.url) {
        throw new Error(`Unexpected Agnes API response: ${JSON.stringify(data).slice(0, 200)}`);
      }
      const result = {
        images: [{ url: imageData.url }],
      };

      if (userId) {
        await recordMediaTask({
          userId,
          feature: 'image',
          action: 'image-generate',
          provider: 'agnes',
          model: 'agnes-image-2.1-flash',
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
