/**
 * Agnes 文生图上游调用（服务端共用）
 *
 * 从 /api/image/agnes 路由抽出的「上游协议 + 重试」逻辑：
 * 路由继续负责鉴权、幂等、计费；本模块只负责按 Agnes 协议请求上游并解析出图片 URL，
 * 供路由与 agent 的 image_generate 工具共用，避免两处各写一份协议与重试。
 *
 * 上游过载（429/5xx）退避重试：最多重试 2 次（对齐 destiny-model-client 的 callModel 模式）。
 */

const RETRY_DELAYS_MS = [800, 2000];
const DEFAULT_API_URL = 'https://apihub.agnes-ai.com/v1/images/generations';
/** Agnes 文生图模型标识（与路由保持一致） */
export const AGNES_IMAGE_MODEL = 'agnes-image-2.1-flash';

export interface AgnesImageRequest {
  prompt: string;
  size: string;
  seed?: number;
  negativePrompt?: string;
}

/** 上游错误：status 为上游 HTTP 状态码，供调用方决定用户提示与是否重试 */
export class AgnesUpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'AgnesUpstreamError';
  }
}

/** 可中断的等待（用户中止时立即结束，不让重试拖住请求） */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * 请求 Agnes 生成一张图片，返回图片 URL。
 * 失败抛 AgnesUpstreamError（含上游 status）；配置缺失抛普通 Error。
 */
export async function requestAgnesImage(
  request: AgnesImageRequest,
  signal?: AbortSignal
): Promise<{ url: string }> {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) {
    throw new Error('AGNES_API_KEY is not configured');
  }
  const apiUrl = process.env.AGNES_INFERENCE_API_URL || DEFAULT_API_URL;

  const apiBody: Record<string, unknown> = {
    model: AGNES_IMAGE_MODEL,
    prompt: request.prompt,
    size: request.size,
    extra_body: { response_format: 'url' },
  };
  // Agnes 文生图队列不支持 quality 参数，此处不传
  if (request.seed != null) apiBody.seed = request.seed;
  if (request.negativePrompt) apiBody.negative_prompt = request.negativePrompt;

  const invokeUpstream = async (): Promise<Record<string, unknown>> => {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiBody),
      signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new AgnesUpstreamError(errorText, response.status);
    }
    return (await response.json()) as Record<string, unknown>;
  };

  let data: Record<string, unknown> | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      data = await invokeUpstream();
      break;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) break;
      const status = error instanceof AgnesUpstreamError ? error.status : 0;
      const retryable = status === 429 || status >= 500;
      if (!retryable || attempt === RETRY_DELAYS_MS.length) break;
      console.warn(
        `[agnes] 第 ${attempt + 1} 次调用失败（status=${status}），${RETRY_DELAYS_MS[attempt]}ms 后重试`
      );
      await sleep(RETRY_DELAYS_MS[attempt], signal);
    }
  }

  if (!data) {
    // 用户取消：原样抛出取消原因，**绝不**包装成 AgnesUpstreamError。
    // 否则调用方会按「上游失败」处理，把「你按了停止」报成「图片生成失败，请稍后重试」——
    // 实测过：abort 会走到这里，被包成 status=0，用户看到的是失败而不是取消。
    if (signal?.aborted) {
      throw lastError instanceof Error ? lastError : new Error('已取消');
    }
    if (lastError instanceof AgnesUpstreamError) throw lastError;
    throw new AgnesUpstreamError(
      lastError instanceof Error ? lastError.message : String(lastError),
      0
    );
  }

  // 兼容两种返回形态：data.data[0].url（OpenAI 风格）与 data.images[0].url
  const dataArray = Array.isArray(data.data) ? (data.data as Array<Record<string, unknown>>) : [];
  const imagesArray = Array.isArray(data.images) ? (data.images as Array<Record<string, unknown>>) : [];
  const imageData = dataArray[0] || imagesArray[0];
  if (!imageData?.url) {
    throw new AgnesUpstreamError(
      `Unexpected Agnes API response: ${JSON.stringify(data).slice(0, 200)}`,
      0
    );
  }

  return { url: String(imageData.url) };
}
