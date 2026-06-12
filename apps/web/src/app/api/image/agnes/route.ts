import { NextRequest, NextResponse } from 'next/server';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { prisma, deductTokens, refundTokens } from '@repo/db';

const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_API_URL = 'https://api.agnesai.com/v1/images/generations';

export async function POST(request: NextRequest) {
  let deducted = false;
  let userId: string | null = null;

  try {
    if (!AGNES_API_KEY) {
      return NextResponse.json(
        { error: 'AGNES_API_KEY is not configured' },
        { status: 500 }
      );
    }

    userId = await getOptionalUserId(request);
    const body = await request.json();

    // 已认证的非 admin 用户预扣 1 token
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, tokens: true },
      });
      if (user && user.role !== 'admin') {
        if (user.tokens <= 0) {
          return NextResponse.json(
            { error: 'Token 额度不足，请联系管理员充值' },
            { status: 429 }
          );
        }
        await deductTokens(userId, 1);
        deducted = true;
      }
    }

    console.log('→ Generating image with Agnes...');
    console.log('  Prompt length:', body.prompt?.length || 0);
    console.log('  Size:', body.size);
    console.log('  N:', body.n);
    console.log('  Style:', body.style);
    console.log('  Quality:', body.quality);

    const response = await fetch(AGNES_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AGNES_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'agnes-image-2.1-flash',
        prompt: body.prompt,
        negative_prompt: body.negative_prompt,
        size: body.size,
        n: body.n,
        seed: body.seed,
        style: body.style,
        quality: body.quality,
      }),
    });

    console.log('← Agnes API Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('← Agnes API Error:', errorText);
      if (userId && deducted) {
        deducted = false;
        await refundTokens(userId, 1);
      }
      return NextResponse.json(
        { error: `Agnes API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('← Agnes generation successful, images:', data.data?.length || 0);

    // 转换为统一格式（与 Kolors 返回格式兼容）
    const result = {
      images: (data.data || []).map((item: { url: string }) => ({
        url: item.url,
      })),
    };

    if (userId) {
      await safeRecordAiUsage({
        userId,
        feature: 'image',
        action: 'image-generate',
        provider: 'agnes',
        model: 'agnes-image-2.1-flash',
        endpoint: '/api/image/agnes',
        usage: normalizeUsage(data.usage),
        metadata: {
          promptLength: typeof body.prompt === 'string' ? body.prompt.length : 0,
          imageSize: body.size,
          batchSize: body.n,
          imageCount: Array.isArray(data.data) ? data.data.length : 0,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (userId && deducted) {
      deducted = false;
      await refundTokens(userId, 1);
    }
    console.error('Agnes image generation error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
