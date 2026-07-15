import { NextRequest, NextResponse } from 'next/server';
import { generateZhipuToken } from '@/lib/zhipu-auth';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { recordMediaTask } from '@/lib/billing/quota-service';
import { getBillingRequestId } from '@/lib/billing/request-id';
import {
  beginMediaTask,
  completeMediaTask,
  failMediaTask,
  findMediaTaskByProviderTaskId,
  markMediaTaskSubmitted,
} from '@repo/db';
import { getProviderByModel } from '@/lib/constants/video-generation';

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const AGNES_API_KEY = process.env.AGNES_API_KEY;

// 智谱 API 端点
const ZHIPU_VIDEO_GENERATION_URL = 'https://open.bigmodel.cn/api/paas/v4/videos/generations';
const ZHIPU_ASYNC_RESULT_URL = 'https://open.bigmodel.cn/api/paas/v4/async-result';

// Agnes API 端点
const AGNES_VIDEO_GENERATION_URL = 'https://apihub.agnes-ai.com/v1/videos';
const AGNES_RESULT_URL = 'https://apihub.agnes-ai.com/agnesapi';
const AGNES_LEGACY_RESULT_URL = 'https://apihub.agnes-ai.com/v1/videos';

interface VideoGenerationRequest {
  prompt: string;
  model?: string;
  imageUrl?: string;
  image?: string | string[];
  mode?: string;
  extra_body?: Record<string, unknown>;
  size?: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
  num_frames?: number;
  frame_rate?: number;
  num_inference_steps?: number;
  seed?: number;
  negative_prompt?: string;
}

/** 供应商异步任务终态才会写入成功媒体次数；重复轮询由用量记录的 requestId 幂等保护。 */
async function finalizeVideoMediaTask(input: {
  userId: string;
  providerTaskId: string;
  provider: 'zhipu' | 'agnes';
  model?: string;
  taskStatus: 'SUCCESS' | 'FAIL' | 'PROCESSING';
  output: Record<string, unknown>;
}) {
  if (input.taskStatus === 'PROCESSING') return;

  const mediaTask = await findMediaTaskByProviderTaskId(input.userId, input.providerTaskId);
  if (!mediaTask) return;

  if (input.taskStatus === 'FAIL') {
    await failMediaTask(mediaTask.id, '供应商返回视频生成失败');
    return;
  }

  await completeMediaTask(mediaTask.id, input.output);
  if (!mediaTask.requestId) return;

  await recordMediaTask({
    userId: input.userId,
    feature: 'video',
    action: 'video-generate',
    provider: input.provider,
    model: input.model,
    endpoint: '/api/video',
    requestId: mediaTask.requestId,
    metadata: {
      providerTaskId: input.providerTaskId,
    },
  });
}

function normalizeVideoTaskStatus(status: unknown): 'SUCCESS' | 'FAIL' | 'PROCESSING' {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'SUCCESS' || normalized === 'COMPLETED') return 'SUCCESS';
  if (normalized === 'FAIL' || normalized === 'FAILED') return 'FAIL';
  return 'PROCESSING';
}

// Zhipu POST
async function handleZhipuPost(body: VideoGenerationRequest) {
  if (!ZHIPU_API_KEY) {
    return NextResponse.json({ error: { message: 'ZHIPU_API_KEY 未配置' } }, { status: 500 });
  }

  const { prompt, model = 'cogvideox-flash', imageUrl, size, duration, fps } = body;

  const token = generateZhipuToken({ apiKey: ZHIPU_API_KEY });

  const requestBody: Record<string, unknown> = { model, prompt };
  if (imageUrl) requestBody.image_url = imageUrl;
  if (size) requestBody.size = size;
  if (duration) requestBody.duration = duration;
  if (fps) requestBody.fps = fps;

  const response = await fetch(ZHIPU_VIDEO_GENERATION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  if (!response.ok) {
    return { ok: false, status: response.status, data };
  }

  return {
    ok: true,
    data: {
      id: data.id,
      model: data.model,
      taskStatus: data.task_status,
      requestId: data.request_id,
    },
  };
}

// Agnes POST
async function handleAgnesPost(body: VideoGenerationRequest) {
  if (!AGNES_API_KEY) {
    return NextResponse.json({ error: { message: 'AGNES_API_KEY 未配置' } }, { status: 500 });
  }

  const {
    prompt,
    image,
    mode,
    extra_body,
    width,
    height,
    num_frames,
    frame_rate,
    num_inference_steps,
    seed,
    negative_prompt,
  } = body;

  const requestBody: Record<string, unknown> = {
    model: 'agnes-video-v2.0',
    prompt,
    ...Object.fromEntries(
      Object.entries({
        image,
        mode,
        width,
        height,
        num_frames,
        frame_rate,
        num_inference_steps,
        seed,
        negative_prompt,
        extra_body,
      }).filter(([, value]) => value !== undefined)
    ),
  };

  const response = await fetch(AGNES_VIDEO_GENERATION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AGNES_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  if (!response.ok) {
    return { ok: false, status: response.status, data };
  }

  return {
    ok: true,
    data: {
      id: data.task_id,
      videoId: data.video_id,
      model: data.model,
      taskStatus: data.status || 'queued',
      requestId: data.id,
    },
  };
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (user) => {
    const userId = user.id;
    let model = 'cogvideox-flash';
    let mediaTaskId: string | null = null;

    try {
      const body: VideoGenerationRequest & { requestId?: string } = await req.json();
      const { prompt, model: requestModel = 'cogvideox-flash' } = body;
      model = requestModel;

      if (!prompt?.trim()) {
        return NextResponse.json({ error: { message: '请输入视频描述' } }, { status: 400 });
      }

      const requestId = getBillingRequestId(req, body as unknown as Record<string, unknown>);

      const provider = getProviderByModel(model as any);
      const mediaTask = await beginMediaTask({
        userId,
        requestId,
        feature: 'video',
        provider,
        model,
        payload: body as unknown as Record<string, unknown>,
      });
      if (mediaTask.state === 'completed') return NextResponse.json(mediaTask.output);
      if (mediaTask.state === 'processing') {
        if (mediaTask.output) {
          return NextResponse.json(mediaTask.output, { status: 202 });
        }
        return NextResponse.json(
          { error: { message: '相同视频任务正在处理中，请勿重复提交' } },
          { status: 409 }
        );
      }
      mediaTaskId = mediaTask.taskId;
      const result =
        provider === 'agnes'
          ? await handleAgnesPost(body)
          : await handleZhipuPost(body);

      if (result instanceof NextResponse || !result.ok) {
        if (result instanceof NextResponse) {
          await failMediaTask(mediaTaskId, '视频服务配置或请求失败');
          return result;
        }
        await failMediaTask(mediaTaskId, result.data.error?.message || '视频生成请求失败');
        return NextResponse.json(
          { error: { message: result.data.error?.message || '视频生成请求失败' } },
          { status: result.status }
        );
      }

      const output = {
        ...result.data,
        provider,
      };
      await markMediaTaskSubmitted({
        taskId: mediaTaskId,
        providerTaskId: result.data.id,
        output,
      });
      return NextResponse.json(output);
    } catch (error: any) {
      if (mediaTaskId) {
        await failMediaTask(mediaTaskId, error?.message || '视频生成失败').catch((taskError) =>
          console.error('[video] 更新任务状态失败:', taskError)
        );
      }
      if (error instanceof AuthError) {
        if (error.code === 'FORBIDDEN') {
          return NextResponse.json({ error: { message: error.message } }, { status: 403 });
        }
        return NextResponse.json({ error: { message: error.message } }, { status: 401 });
      }

      return NextResponse.json(
        { error: { message: error.message || '服务器内部错误' } },
        { status: 500 }
      );
    }
  });
}

// Zhipu GET
async function handleZhipuGet(id: string, userId: string) {
  if (!ZHIPU_API_KEY) {
    return NextResponse.json({ error: { message: 'ZHIPU_API_KEY 未配置' } }, { status: 500 });
  }

  const token = generateZhipuToken({ apiKey: ZHIPU_API_KEY });
  const resultUrl = `${ZHIPU_ASYNC_RESULT_URL}/${id}`;

  const response = await fetch(resultUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: { message: data.error?.message || '查询失败' } },
      { status: response.status }
    );
  }

  const output = {
    id: data.id,
    model: data.model,
    task_status: normalizeVideoTaskStatus(data.task_status),
    video_result: data.video_result,
    request_id: data.request_id,
  };
  await finalizeVideoMediaTask({
    userId,
    providerTaskId: id,
    provider: 'zhipu',
    model: data.model,
    taskStatus: output.task_status,
    output,
  });
  return NextResponse.json(output);
}

// Agnes GET
async function handleAgnesGet(taskId: string, videoId: string | null, userId: string) {
  if (!AGNES_API_KEY) {
    return NextResponse.json({ error: { message: 'AGNES_API_KEY 未配置' } }, { status: 500 });
  }

  const headers = { Authorization: `Bearer ${AGNES_API_KEY}` };

  const fetchResult = async (url: string) => {
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  };

  const primary = videoId
    ? await fetchResult(`${AGNES_RESULT_URL}?video_id=${encodeURIComponent(videoId)}`)
    : null;

  const result = primary?.ok ? primary : await fetchResult(`${AGNES_LEGACY_RESULT_URL}/${taskId}`);

  if (!result.ok) {
    return NextResponse.json(
      { error: { message: result.data.error?.message || '查询失败' } },
      { status: result.status }
    );
  }

  const { data } = result;
  const taskStatus = normalizeVideoTaskStatus(data.status || data.task_status);

  const videoUrl = data.remixed_from_video_id || data.video_url || null;

  const output = {
    id: data.id || taskId,
    model: data.model,
    task_status: taskStatus,
    video_result: videoUrl ? [{ url: videoUrl }] : undefined,
    videoUrl,
  };
  await finalizeVideoMediaTask({
    userId,
    providerTaskId: taskId,
    provider: 'agnes',
    model: data.model,
    taskStatus,
    output,
  });
  return NextResponse.json(output);
}

export async function GET(req: NextRequest) {
  return withAuth(req, async (user) => {
    try {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');
      const provider = searchParams.get('provider') || 'zhipu';
      const videoId = searchParams.get('videoId');

      if (!id) {
        return NextResponse.json({ error: { message: '缺少任务 ID' } }, { status: 400 });
      }

      if (provider === 'agnes') {
        return handleAgnesGet(id, videoId, user.id);
      }

      return handleZhipuGet(id, user.id);
    } catch (error: any) {
      return NextResponse.json(
        { error: { message: error.message || '服务器内部错误' } },
        { status: 500 }
      );
    }
  });
}
