/**
 * Kolors Image Generation API Client
 * SiliconFlow API integration for Kwai-Kolors/Kolors model
 */

export interface KolorsGenerateParams {
  prompt: string;
  negativePrompt?: string;
  imageSize: string;
  steps: number;
  guidanceScale: number;
  batchSize?: number;
  seed?: number;
  style?: string;
}

export interface KolorsGenerateResponse {
  images: Array<{
    url: string;
    seed?: number;
  }>;
  timings?: {
    inference: number;
  };
}

export interface KolorsError {
  error: string;
  details?: string;
}

/**
 * Generate image using Kolors model
 */
export async function generateKolorsImage(
  params: KolorsGenerateParams
): Promise<KolorsGenerateResponse> {
  const response = await fetch('/api/image/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'Kwai-Kolors/Kolors',
      prompt: params.prompt,
      image_size: params.imageSize,
      num_inference_steps: params.steps,
      guidance_scale: params.guidanceScale,
      batch_size: params.batchSize || 1,
      // Note: seed and negative_prompt may not be supported by API
      // Include them for future compatibility
      ...(params.seed && { seed: params.seed }),
    }),
  });

  if (!response.ok) {
    const error: KolorsError = await response.json();
    throw new Error(error.error || `Generation failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Download image from URL and convert to Blob
 */
export async function downloadImage(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  return response.blob();
}

/**
 * Upload image to storage
 */
export async function uploadGeneratedImage(
  blob: Blob,
  userId: string
): Promise<{ url: string; path: string }> {
  const formData = new FormData();
  formData.append('file', blob, `${Date.now()}.png`);
  formData.append('userId', userId);

  const response = await fetch('/api/image/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}
