import { NextRequest, NextResponse } from 'next/server';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY;
const SILICONFLOW_API_URL = process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1';

export async function POST(request: NextRequest) {
  try {
    if (!SILICONFLOW_API_KEY) {
      return NextResponse.json({ error: 'SILICONFLOW_API_KEY is not configured' }, { status: 500 });
    }

    const userId = await getOptionalUserId(request);
    const body = await request.json();

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
      return NextResponse.json(
        { error: `SiliconFlow API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('← Generation successful, images:', data.images?.length || 0);

    if (userId) {
      await safeRecordAiUsage({
        userId,
        feature: 'image',
        action: 'image-generate',
        provider: 'siliconflow',
        model: typeof body.model === 'string' ? body.model : 'Kwai-Kolors/Kolors',
        endpoint: '/api/image/generate',
        usage: normalizeUsage(data.usage),
        metadata: {
          promptLength: typeof body.prompt === 'string' ? body.prompt.length : 0,
          imageSize: body.image_size,
          batchSize: body.batch_size,
          imageCount: Array.isArray(data.images) ? data.images.length : 0,
        },
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Image generation error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
