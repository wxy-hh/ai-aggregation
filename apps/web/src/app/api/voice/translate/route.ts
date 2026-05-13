import { NextRequest, NextResponse } from 'next/server';
import { xunfeiChat } from '@repo/providers';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { prisma, deductTokens, refundTokens } from '@repo/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TranslateRequest {
  text: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export async function POST(request: NextRequest) {
  let deducted = false;
  let userId: string | null = null;

  try {
    console.log('=== 开始处理翻译请求 ===');
    userId = await getOptionalUserId(request);

    // 已认证的非 admin 用户预扣 1 token
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, tokens: true },
      });
      if (user && user.role !== 'admin') {
        if (user.tokens <= 0) {
          return NextResponse.json({ error: 'Token 额度不足，请联系管理员充值' }, { status: 429 });
        }
        await deductTokens(userId, 1);
        deducted = true;
      }
    }

    const body: TranslateRequest = await request.json();
    const { text, sourceLanguage = 'Chinese', targetLanguage = 'English' } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    console.log('→ 翻译文本长度:', text.length);
    console.log('→ 源语言:', sourceLanguage);
    console.log('→ 目标语言:', targetLanguage);

    // 构建翻译提示词
    // 重要：要求保持句子数量和结构一致，以便准确对照
    const prompt = `请将以下${sourceLanguage}文本翻译成${targetLanguage}。

重要要求：
1. 保持原文的句子数量和结构
2. 每个句号、感叹号、问号对应一个句子
3. 不要合并或拆分句子
4. 只提供翻译结果，不要添加解释

原文：
${text}`;

    console.log('→ 调用讯飞 API...');

    // 调用讯飞Lite模型进行翻译
    const result = await xunfeiChat({
      model: 'lite',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // 较低的温度以获得更稳定的翻译
      maxTokens: 4096,
    });

    console.log('✓ 翻译完成, 译文长度:', result.content.length);

    if (userId) {
      await safeRecordAiUsage({
        userId,
        feature: 'voice',
        action: 'voice-translate',
        provider: 'xunfei',
        model: 'lite',
        endpoint: '/api/voice/translate',
        usage: normalizeUsage(result.usage),
        metadata: {
          textLength: text.length,
          sourceLanguage,
          targetLanguage,
        },
      });
    }

    return NextResponse.json({
      translatedText: result.content.trim(),
      sourceLanguage,
      targetLanguage,
      usage: result.usage,
    });
  } catch (error) {
    if (userId && deducted) { deducted = false; await refundTokens(userId, 1); }
    console.error('=== 翻译失败 ===');
    console.error('错误类型:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('错误信息:', error instanceof Error ? error.message : String(error));

    if (error instanceof Error) {
      console.error('错误堆栈:', error.stack);
    }

    return NextResponse.json(
      {
        error: '翻译失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}
