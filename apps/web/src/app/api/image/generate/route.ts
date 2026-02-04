import { NextRequest, NextResponse } from 'next/server';

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY;
const SILICONFLOW_API_URL = process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1';

export async function POST(request: NextRequest) {
  try {
    if (!SILICONFLOW_API_KEY) {
      return NextResponse.json({ error: 'SILICONFLOW_API_KEY is not configured' }, { status: 500 });
    }

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
