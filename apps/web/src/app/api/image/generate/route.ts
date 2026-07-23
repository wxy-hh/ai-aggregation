import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { recordMediaTask } from '@/lib/billing/quota-service';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { beginMediaTask, completeMediaTask, failMediaTask } from '@repo/db';

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY;
const SILICONFLOW_API_URL = process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    const userId = user.id;
    let mediaTaskId: string | null = null;

    try {
      if (!SILICONFLOW_API_KEY) {
        return NextResponse.json(
          { error: 'SILICONFLOW_API_KEY is not configured' },
          { status: 500 }
        );
      }

      const body = (await request.json()) as Record<string, unknown>;
      const requestId = getBillingRequestId(request, body);
      const model = typeof body.model === 'string' ? body.model : 'Kwai-Kolors/Kolors';
      const mediaTask = await beginMediaTask({
        userId,
        requestId,
        feature: 'image',
        provider: 'siliconflow',
        model,
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

      console.log('→ Generating image with Kolors...');
      console.log('  Model:', body.model);
      console.log('  Image Size:', body.image_size);
      console.log('  Steps:', body.num_inference_steps);
      console.log('  Guidance Scale:', body.guidance_scale);
      console.log('  Batch Size:', body.batch_size);

      const response = await fetch(`${SILICONFLOW_API_URL}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      console.log('← API Response Status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('← API Error:', errorText);
        await failMediaTask(mediaTaskId, errorText);
        return NextResponse.json(
          { error: `SiliconFlow API error: ${errorText}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      console.log('← Generation successful, images:', data.images?.length || 0);

      if (userId) {
        await recordMediaTask({
          userId,
          feature: 'image',
          action: 'image-generate',
          provider: 'siliconflow',
          model,
          endpoint: '/api/image/generate',
          requestId,
          metadata: {
            promptLength: typeof body.prompt === 'string' ? body.prompt.length : 0,
            imageSize: body.image_size,
            batchSize: body.batch_size,
            imageCount: Array.isArray(data.images) ? data.images.length : 0,
          },
        });
      }

      await completeMediaTask(mediaTaskId, data);

      return NextResponse.json(data);
    } catch (error) {
      if (mediaTaskId) {
        await failMediaTask(
          mediaTaskId,
          error instanceof Error ? error.message : '图片生成失败'
        ).catch((taskError) => console.error('[image/generate] 更新任务状态失败:', taskError));
      }
      console.error('Image generation error:', error);

      if (error instanceof AuthError) {
        if (error.code === 'FORBIDDEN') {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 401 });
      }

      return NextResponse.json(
        {
          error: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  });
}
