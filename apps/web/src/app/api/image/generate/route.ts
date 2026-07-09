import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { deductAiQuotaForRoute, maybeRefund } from '@/lib/api/quota-helpers';
import { ANONYMOUS_OPERATION_COSTS } from '@/lib/constants/quota';

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY;
const SILICONFLOW_API_URL = process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    const userId = user.id;
    let deductedAmount = 0;

    try {
      if (!SILICONFLOW_API_KEY) {
        return NextResponse.json({ error: 'SILICONFLOW_API_KEY is not configured' }, { status: 500 });
      }

      // 非 admin 用户扣减额度
      const quotaResult = await deductAiQuotaForRoute({
        userId,
        user,
        anonymousCost: ANONYMOUS_OPERATION_COSTS.IMAGE_GENERATE,
      });

    if (!quotaResult.success) {
      if (quotaResult.reason === 'QUOTA_EXHAUSTED') {
        return NextResponse.json(
          { error: '免费额度已用完，您可以继续查看历史记录', code: 'QUOTA_EXHAUSTED' },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: 'Token 额度不足，请联系管理员充值' },
        { status: 429 }
      );
    }
    deductedAmount = quotaResult.deductedAmount;

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
      await maybeRefund(userId, deductedAmount);
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
    await maybeRefund(userId, deductedAmount);
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
