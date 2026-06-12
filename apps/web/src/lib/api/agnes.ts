/**
 * Agnes Image 2.1 Flash API Client
 * 通过 BFF 代理调用 Agnes AI 服务
 */

import { authFetch } from './client';

export interface AgnesGenerateParams {
  prompt: string;
  negativePrompt?: string;
  size: string;
  n?: number;
  seed?: number;
  style?: string;
  quality?: 'standard' | 'hd';
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
  const response = await authFetch('/api/image/agnes', {
    method: 'POST',
    body: JSON.stringify({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || undefined,
      size: params.size,
      n: params.n || 1,
      seed: params.seed,
      style: params.style || undefined,
      quality: params.quality || 'standard',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.details || error.error || `Agnes API error: ${response.statusText}`);
  }

  return response.json();
}
