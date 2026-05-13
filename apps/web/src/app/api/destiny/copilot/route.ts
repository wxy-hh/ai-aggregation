import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractArkOutputText } from '../_lib/ark-response';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { prisma, deductTokens, refundTokens } from '@repo/db';

const RequestSchema = z.object({
  reportSummary: z.string().trim().min(1, '报告摘要不能为空'),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1),
      })
    )
    .max(20)
    .default([]),
  question: z.string().trim().min(1, '问题不能为空').max(1000),
});

const ARK_MODEL = 'doubao-seed-2-0-lite-260428';

export async function POST(req: Request) {
  let deducted = false;
  let userId: string | null = null;

  try {
    userId = await getOptionalUserId(req);

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

    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: parsed.error.errors.map((item) => ({
            path: item.path.join('.'),
            message: item.message,
          })),
        },
        { status: 400 }
      );
    }

    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    if (!arkApiKey) {
      return NextResponse.json({ error: 'Missing ARK_API_KEY' }, { status: 500 });
    }

    const history = parsed.data.messages.slice(-8).map((item) => ({
      role: item.role,
      content: item.content,
    }));

    const controller = new AbortController();
    // Vercel 免费版 Serverless Functions 限制 10 秒，设置 8 秒留 2 秒缓冲
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(`${arkBaseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${arkApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ARK_MODEL,
          input: [
            {
              role: 'system',
              content:
                '你是命理报告解读助手。基于提供的报告上下文回答用户问题，给出清晰可执行建议。避免绝对化结论，不输出医疗或投资承诺。',
            },
            {
              role: 'user',
              content: `当前报告摘要：${parsed.data.reportSummary}`,
            },
            ...history,
            {
              role: 'user',
              content: parsed.data.question,
            },
          ],
          temperature: 0.7,
          max_output_tokens: 1800,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: response.status === 429 ? '请求过于频繁，请稍后重试' : '追问失败，请稍后重试',
          details: text.slice(0, 400),
        },
        { status: response.status }
      );
    }

    const payload = await response.json();
    const answer = extractArkOutputText(payload);

    if (userId) {
      await safeRecordAiUsage({
        userId,
        feature: 'destiny',
        action: 'destiny-copilot',
        provider: 'doubao',
        model: ARK_MODEL,
        endpoint: '/api/destiny/copilot',
        usage: normalizeUsage(payload.usage ?? payload.response?.usage),
        metadata: {
          historyCount: history.length,
          questionLength: parsed.data.question.length,
        },
      });
    }

    return NextResponse.json({ answer }, { status: 200 });
  } catch (error) {
    if (userId && deducted) { deducted = false; await refundTokens(userId, 1); }
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: '追问超时，请稍后重试' }, { status: 504 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '追问失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}
