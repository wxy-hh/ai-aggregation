/**
 * Agnes Image 2.1 Flash API Client
 * 通过 BFF 代理调用 Agnes AI 服务
 */

import { authFetch } from './client';
import { createBillingRequestId } from '@/lib/billing/request-id';

export interface AgnesGenerateParams {
  prompt: string;
  negativePrompt?: string;
  size: string;
  n?: number;
  seed?: number;
  style?: string;
}

export interface AgnesGenerateResponse {
  created: number;
  images: Array<{
    url: string;
    revised_prompt?: string;
  }>;
}

/**
 * 通过 BFF 代理调用 Agnes Image API 生成图片
 */
export async function generateAgnesImage(
  params: AgnesGenerateParams
): Promise<AgnesGenerateResponse> {
  const requestId = createBillingRequestId();
  const response = await authFetch('/api/image/agnes', {
    method: 'POST',
    headers: { 'Idempotency-Key': requestId },
    body: JSON.stringify({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || undefined,
      size: params.size,
      n: params.n || 1,
      seed: params.seed,
      style: params.style || undefined,
      requestId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    // 将上游错误消息转换为更友好的提示
    const userFriendlyMessage = error.details || error.error;
    if (userFriendlyMessage) {
      throw new Error(userFriendlyMessage);
    }
    throw new Error(`Agnes API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Download image from URL and convert to Blob
 * 通过 BFF 代理下载，避免 CORS 限制
 */
export async function downloadImage(url: string): Promise<Blob> {
  const proxyUrl = `/api/image/proxy?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  return response.blob();
}
