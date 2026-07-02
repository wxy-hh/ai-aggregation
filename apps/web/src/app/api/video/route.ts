import { NextRequest, NextResponse } from 'next/server';
import { generateZhipuToken } from '@/lib/zhipu-auth';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { prisma, deductTokens, refundTokens } from '@repo/db';
import { getProviderByModel, getVideoModelMeta } from '@/lib/constants/video-generation';

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

function getModelCredits(model: string): number {
  return getVideoModelMeta(model as any).credits;
}

// Zhipu POST
async function handleZhipuPost(body: VideoGenerationRequest, userId: string | null) {
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

  if (userId) {
    await safeRecordAiUsage({
      userId,
      feature: 'video',
      action: 'image-generate',
      provider: 'zhipu',
      model,
      endpoint: '/api/video',
      usage: normalizeUsage(null),
      metadata: {
        promptLength: prompt.length,
        imageUrl: imageUrl || null,
        size: size || null,
        duration: duration || null,
        fps: fps || null,
        taskId: data.id,
      },
    });
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
async function handleAgnesPost(body: VideoGenerationRequest, userId: string | null) {
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

  if (userId) {
    await safeRecordAiUsage({
      userId,
      feature: 'video',
      action: 'image-generate',
      provider: 'agnes',
      model: 'agnes-video-v2.0',
      endpoint: '/api/video',
      usage: normalizeUsage(null),
      metadata: {
        promptLength: prompt.length,
        width: width || null,
        height: height || null,
        numFrames: num_frames || null,
        frameRate: frame_rate || null,
        mode: mode || null,
        taskId: data.task_id,
        videoId: data.video_id,
      },
    });
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
  let deducted = false;
  let userId: string | null = null;

  const maybeRefund = async () => {
    if (userId && deducted) {
      deducted = false;
      await refundTokens(userId, getModelCredits(model));
    }
  };

  let model = 'cogvideox-flash';

  try {
    userId = await getOptionalUserId(req);

    const body: VideoGenerationRequest = await req.json();
    const { prompt, model: requestModel = 'cogvideox-flash' } = body;
    model = requestModel;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: { message: '请输入视频描述' } }, { status: 400 });
    }

    const credits = getModelCredits(model);

    // 已认证的非 admin 用户预扣 token
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, tokens: true },
      });
      if (user && user.role !== 'admin') {
        if (user.tokens < credits) {
          return NextResponse.json({ error: 'Token 额度不足，请联系管理员充值' }, { status: 429 });
        }
        await deductTokens(userId, credits);
        deducted = true;
      }
    }

    const provider = getProviderByModel(model as any);
    const result =
      provider === 'agnes' ? await handleAgnesPost(body, userId) : await handleZhipuPost(body, userId);

    if (result instanceof NextResponse || !result.ok) {
      await maybeRefund();
      if (result instanceof NextResponse) {
        return result;
      }
      return NextResponse.json(
        { error: { message: result.data.error?.message || '视频生成请求失败' } },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ...result.data,
      provider,
    });
  } catch (error: any) {
    await maybeRefund();
    return NextResponse.json(
      { error: { message: error.message || '服务器内部错误' } },
      { status: 500 }
    );
  }
}

// Zhipu GET
async function handleZhipuGet(id: string) {
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

  return NextResponse.json({
    id: data.id,
    model: data.model,
    task_status: data.task_status,
    video_result: data.video_result,
    request_id: data.request_id,
  });
}

// Agnes GET
async function handleAgnesGet(taskId: string, videoId: string | null) {
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
  const status = data.status || data.task_status;
  let taskStatus: string;
  switch (status) {
    case 'completed':
      taskStatus = 'SUCCESS';
      break;
    case 'failed':
      taskStatus = 'FAIL';
      break;
    case 'queued':
    case 'in_progress':
    default:
      taskStatus = 'PROCESSING';
  }

  const videoUrl = data.remixed_from_video_id || data.video_url || null;

  return NextResponse.json({
    id: data.id || taskId,
    model: data.model,
    task_status: taskStatus,
    video_result: videoUrl ? [{ url: videoUrl }] : undefined,
    videoUrl,
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const provider = searchParams.get('provider') || 'zhipu';
    const videoId = searchParams.get('videoId');

    if (!id) {
      return NextResponse.json({ error: { message: '缺少任务 ID' } }, { status: 400 });
    }

    if (provider === 'agnes') {
      return handleAgnesGet(id, videoId);
    }

    return handleZhipuGet(id);
  } catch (error: any) {
    return NextResponse.json(
      { error: { message: error.message || '服务器内部错误' } },
      { status: 500 }
    );
  }
}
