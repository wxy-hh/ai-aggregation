import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { recordMediaTask } from '@/lib/billing/quota-service';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { beginMediaTask, completeMediaTask, failMediaTask } from '@repo/db';

const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_API_URL =
  process.env.AGNES_INFERENCE_API_URL || 'https://apihub.agnes-ai.com/v1/images/generations';

// 上游过载（429/5xx）退避重试：最多重试 2 次（对齐 destiny-model-client 的 callModel 模式）。
// 幂等安全：重试发生在同一次请求内、beginMediaTask 幂等之后，计费只在成功后记一次。
const RETRY_DELAYS_MS = [800, 2000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      // Agnes 文生图队列不支持 quality 参数，此处不传
      if (body.seed != null) apiBody.seed = body.seed;
      if (body.negative_prompt) apiBody.negative_prompt = body.negative_prompt;

      const invokeUpstream = async (): Promise<Record<string, unknown>> => {
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
          const error = new Error(errorText) as Error & { status: number };
          error.status = response.status;
          throw error;
        }
        return response.json();
      };

      // 429 限流 / 5xx 过载时退避重试（最多重试 2 次，共 3 次尝试）
      let data: Record<string, unknown> | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          data = await invokeUpstream();
          break;
        } catch (err) {
          lastError = err;
          const status = (err as Error & { status?: number }).status ?? 0;
          const retryable = status === 429 || status >= 500;
          if (!retryable || attempt === RETRY_DELAYS_MS.length) break;
          console.warn(
            `[image/agnes] 第 ${attempt + 1} 次调用失败（status=${status}），${RETRY_DELAYS_MS[attempt]}ms 后重试`
          );
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }

      if (!data) {
        const status = (lastError as Error & { status?: number })?.status ?? 0;
        await failMediaTask(
          mediaTaskId,
          lastError instanceof Error ? lastError.message : '图片生成失败'
        );
        // 上游服务过载/限流时返回友好提示
        if (status === 503 || status === 429) {
          return NextResponse.json(
            { error: 'Agnes 服务暂时繁忙，请稍后重试' },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { error: `Agnes API error: ${lastError instanceof Error ? lastError.message : String(lastError)}` },
          { status: status || 500 }
        );
      }

      // 转换为统一格式（images 数组，前端消费方一致）
      const dataArray = Array.isArray(data.data) ? (data.data as Array<Record<string, unknown>>) : [];
      const imagesArray = Array.isArray(data.images) ? (data.images as Array<Record<string, unknown>>) : [];
      const imageData = dataArray[0] || imagesArray[0];
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
