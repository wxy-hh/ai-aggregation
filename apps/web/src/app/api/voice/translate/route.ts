import { NextRequest, NextResponse } from 'next/server';
import { xunfeiChat } from '@repo/providers';
import { withAuth } from '@/lib/api/with-auth';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { QuotaSession } from '@/lib/billing/quota-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TranslateRequest {
  text: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    let session: QuotaSession | null = null;

    try {
      const body: TranslateRequest = await request.json();
      const { text, sourceLanguage = 'Chinese', targetLanguage = 'English' } = body;

      if (!text || text.trim().length === 0) {
        return NextResponse.json({ error: 'Text is required' }, { status: 400 });
      }

      const prompt = `请将以下${sourceLanguage}文本翻译成${targetLanguage}。

重要要求：
1. 保持原文的句子数量和结构
2. 每个句号、感叹号、问号对应一个句子
3. 不要合并或拆分句子
4. 只提供翻译结果，不要添加解释

原文：
${text}`;

      const requestId = getBillingRequestId(request, body as unknown as Record<string, unknown>);

      session = await QuotaSession.reserve(
        {
          userId: user.id,
          requestId,
          feature: 'voice',
          provider: 'xunfei',
          model: 'lite',
          messages: [{ content: prompt }],
          maxOutputTokens: 4096,
          metadata: { textLength: text.length, sourceLanguage, targetLanguage },
        },
        user.role
      );

      const result = await xunfeiChat({
        model: 'lite',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: session.outputLimit,
      });

      await session.settle(
        {
          action: 'voice-translate',
          endpoint: '/api/voice/translate',
          rawUsage: result.usage,
          fallbackTokens: session.inputUnits,
          metadata: { textLength: text.length, sourceLanguage, targetLanguage },
        },
        {
          feature: 'voice',
          provider: 'xunfei',
          model: 'lite',
          requestId,
        }
      );

      return NextResponse.json({
        translatedText: result.content.trim(),
        sourceLanguage,
        targetLanguage,
        usage: result.usage,
      });
    } catch (error) {
      if (session) {
        await session.release({ reason: '语音翻译请求失败' });
      }

      if (error instanceof BillingError) return billingErrorResponse(error);

      console.error('[voice/translate] 翻译失败:', error);
      return NextResponse.json({ error: '翻译失败，请稍后重试' }, { status: 500 });
    }
  });
}
