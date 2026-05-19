import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { prisma, deductTokens, refundTokens } from '@repo/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ReportSchema = z.object({
  profile: z.object({
    name: z.string(),
    genderLabel: z.string(),
    birthText: z.string(),
    locationText: z.string(),
    lunarText: z.string().optional(),
  }),
  pillars: z.array(
    z.object({
      stem: z.string(),
      branch: z.string(),
      label: z.string(),
      element: z.enum(['metal', 'wood', 'water', 'fire', 'earth']),
      tooltip: z.string(),
    })
  ),
  tenGods: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.number(),
      tooltip: z.string(),
    })
  ),
  lifeDimensions: z
    .array(
      z.object({
        key: z.enum(['career', 'wealth', 'health', 'love', 'wisdom']),
        label: z.string(),
        value: z.number(),
      })
    )
    .optional(),
  lifeDimensionHighlights: z
    .object({
      strength: z.string(),
      caution: z.string(),
    })
    .optional(),
  tenGodDomains: z
    .array(
      z.object({
        key: z.enum(['self', 'expression', 'wealth', 'order', 'resource']),
        label: z.string(),
        technicalLabel: z.string(),
        value: z.number(),
        description: z.string(),
      })
    )
    .optional(),
  elements: z.array(
    z.object({
      key: z.enum(['metal', 'wood', 'water', 'fire', 'earth']),
      label: z.string(),
      value: z.number(),
    })
  ),
  modules: z.object({
    career: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()) }),
    love: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()) }),
    wealth: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()) }),
    health: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()) }),
    personality: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()) }),
  }),
  timeline: z.array(
    z.object({
      year: z.number(),
      title: z.string(),
      summary: z.string(),
      detail: z.object({
        opportunities: z.array(z.string()),
        risks: z.array(z.string()),
        actions: z.array(z.string()),
      }),
    })
  ),
  ziweiPalaces: z.any().optional(),
  ziweiCenter: z.any().optional(),
});

const RequestSchema = z.object({
  report: ReportSchema,
  question: z.string().trim().min(1, '问题不能为空').max(1000),
});

const ARK_MODEL = 'doubao-seed-2-0-lite-260428';
const COPILOT_TIMEOUT_MS = 55000;
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

function encodeSseEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(req: Request) {
  let deducted = false;
  let userId: string | null = null;

  try {
    userId = await getOptionalUserId(req);

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

    const { response, timeoutId } = await requestArkStream({
      arkApiKey,
      arkBaseUrl,
      report: parsed.data.report,
      question: parsed.data.question,
    });

    return new Response(
      createCopilotStream({
        response,
        timeoutId,
        userId,
        deducted,
        questionLength: parsed.data.question.length,
      }),
      { headers: SSE_HEADERS }
    );
  } catch (error) {
    if (userId && deducted) {
      await refundTokens(userId, 1);
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: '追问超时，请稍后重试' }, { status: 504 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '追问失败，请稍后重试' },
      { status: 500 }
    );
  }
}

async function requestArkStream({
  arkApiKey,
  arkBaseUrl,
  report,
  question,
}: {
  arkApiKey: string;
  arkBaseUrl: string;
  report: z.infer<typeof ReportSchema>;
  question: string;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COPILOT_TIMEOUT_MS);
  const context = buildCopilotPromptContext(report);
  const scopedInsights = buildQuestionScopedInsights(report, question);

  const response = await fetch(`${arkBaseUrl}/responses`, {
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
            '你是命理报告解读助手。基于用户已经生成的八字分析结果回答追问，给出清晰、具体、可执行的建议。优先结合人生五维、十神五域、盘面、五行和问题相关模块作答。答案控制在 300 字以内，直接回答，不展开长篇推演。避免绝对化判断，不做医疗或投资承诺。',
        },
        {
          role: 'user',
          content: `${context}\n${scopedInsights}\n\n用户追问：${question}`,
        },
      ],
      stream: true,
      temperature: 0.3,
      max_output_tokens: 500,
      reasoning: { effort: 'low' },
    }),
    signal: controller.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    clearTimeout(timeoutId);
    throw new Error(text || '追问失败，请稍后重试');
  }

  if (!response.body) {
    clearTimeout(timeoutId);
    throw new Error('追问响应体为空');
  }

  return { response, timeoutId };
}

function createCopilotStream({
  response,
  timeoutId,
  userId,
  deducted,
  questionLength,
}: {
  response: Response;
  timeoutId: ReturnType<typeof setTimeout>;
  userId: string | null;
  deducted: boolean;
  questionLength: number;
}) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let usagePayload: unknown = null;
  let didComplete = false;

  const processArkChunk = (chunk: string, streamController: ReadableStreamDefaultController<Uint8Array>) => {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const dataLine = lines.find((line) => line.startsWith('data: '));
    if (!dataLine) return;

    const raw = dataLine.slice(6);
    if (!raw || raw === '[DONE]') {
      didComplete = true;
      streamController.enqueue(encodeSseEvent({ type: 'done' }));
      return;
    }

    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data.type === 'response.output_text.delta' && typeof data.delta === 'string') {
      streamController.enqueue(encodeSseEvent({ type: 'text-delta', text: data.delta }));
      return;
    }

    if (
      data.type === 'response.done' ||
      data.type === 'response.completed' ||
      data.type === 'response.incomplete'
    ) {
      const responseObject =
        data.response && typeof data.response === 'object'
          ? (data.response as Record<string, unknown>)
          : null;
      usagePayload = responseObject?.usage ?? data.usage ?? usagePayload;
      didComplete = true;
      streamController.enqueue(encodeSseEvent({ type: 'done' }));
      return;
    }

    if (data.type === 'response.failed' || data.type === 'error') {
      const errorMessage =
        typeof data.error === 'string'
          ? data.error
          : data.error && typeof data.error === 'object'
            ? ((data.error as Record<string, unknown>).message as string | undefined)
            : null;
      throw new Error(errorMessage || '追问失败，请稍后重试');
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(streamController) {
      let buffer = '';

      try {
        while (!didComplete) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            processArkChunk(chunk, streamController);
            if (didComplete) break;
          }
        }

        const rest = buffer + decoder.decode();
        if (!didComplete && rest.trim()) {
          processArkChunk(rest, streamController);
        }

        if (!didComplete) {
          streamController.enqueue(encodeSseEvent({ type: 'done' }));
        }

        if (userId) {
          await safeRecordAiUsage({
            userId,
            feature: 'destiny',
            action: 'destiny-copilot',
            provider: 'doubao',
            model: ARK_MODEL,
            endpoint: '/api/destiny/copilot',
            usage: normalizeUsage(usagePayload),
            metadata: {
              questionLength,
              stream: true,
            },
          });
        }
      } catch (error) {
        if (userId && deducted) {
          await refundTokens(userId, 1);
        }
        streamController.enqueue(
          encodeSseEvent({
            type: 'error',
            error:
              error instanceof Error && error.name === 'AbortError'
                ? '追问超时，请稍后重试'
                : error instanceof Error
                  ? error.message
                  : '追问失败，请稍后重试',
          })
        );
      } finally {
        clearTimeout(timeoutId);
        reader.releaseLock();
        streamController.close();
      }
    },
  });
}

function buildCopilotPromptContext(report: z.infer<typeof ReportSchema>) {
  const pillars = report.pillars
    .map((pillar) => `${pillar.label}:${pillar.stem}${pillar.branch}(${pillar.tooltip})`)
    .join('；');
  const elements = report.elements.map((item) => `${item.label}${item.value}`).join('，');
  const tenGods = report.tenGods.map((item) => `${item.label}${item.value}`).join('，');
  const lifeDimensions = report.lifeDimensions?.length
    ? report.lifeDimensions.map((item) => `${item.label}${item.value}`).join('，')
    : '';
  const tenGodDomains = report.tenGodDomains?.length
    ? report.tenGodDomains.map((item) => `${item.label}(${item.technicalLabel})${item.value}`).join('，')
    : '';
  const highlights = report.lifeDimensionHighlights
    ? `人生五维提示：优势点=${report.lifeDimensionHighlights.strength}；规避点=${report.lifeDimensionHighlights.caution}`
    : '';

  return [
    `用户信息：${report.profile.name}，${report.profile.genderLabel}，${report.profile.birthText}，出生地${report.profile.locationText}${
      report.profile.lunarText ? `，农历${report.profile.lunarText}` : ''
    }`,
    `四柱：${pillars}`,
    lifeDimensions ? `人生五维：${lifeDimensions}` : '',
    highlights,
    tenGodDomains ? `十神五域：${tenGodDomains}` : '',
    `五行：${elements}`,
    `十神：${tenGods}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildQuestionScopedInsights(report: z.infer<typeof ReportSchema>, question: string) {
  const q = question.toLowerCase();
  const pickedModules: Array<{ label: string; summary: string; bullets: string[] }> = [];
  const pushModule = (label: string, summary: string, bullets: string[]) => {
    if (!pickedModules.some((item) => item.label === label)) {
      pickedModules.push({ label, summary, bullets });
    }
  };

  if (/事业|工作|职业|升职|跳槽|offer|career|job/.test(q)) {
    pushModule('事业', report.modules.career.summary, report.modules.career.bullets);
  }
  if (/感情|爱情|婚|伴侣|恋爱|桃花|关系|love|relationship/.test(q)) {
    pushModule('感情', report.modules.love.summary, report.modules.love.bullets);
  }
  if (/财|收入|钱|投资|副业|财富|wealth|money/.test(q)) {
    pushModule('财运', report.modules.wealth.summary, report.modules.wealth.bullets);
  }
  if (/健康|睡眠|情绪|身体|medical|health/.test(q)) {
    pushModule('健康', report.modules.health.summary, report.modules.health.bullets);
  }
  if (/性格|人际|沟通|自己|状态|personality/.test(q)) {
    pushModule('性格', report.modules.personality.summary, report.modules.personality.bullets);
  }

  if (pickedModules.length === 0) {
    pushModule('事业', report.modules.career.summary, report.modules.career.bullets);
    pushModule('感情', report.modules.love.summary, report.modules.love.bullets);
  }

  const currentYear = new Date().getFullYear();
  const timeline = [...report.timeline]
    .sort((a, b) => Math.abs(a.year - currentYear) - Math.abs(b.year - currentYear))
    .slice(0, 2)
    .map((item) => `${item.year}年 ${item.title}：${item.summary}`)
    .join('\n');

  const modules = pickedModules
    .slice(0, 2)
    .map(
      ({ label, summary, bullets }) =>
        `${label}：${summary}；建议：${bullets.slice(0, 2).join('；')}`
    )
    .join('\n');

  return [`相关模块：\n${modules}`, `相关流年：\n${timeline}`].join('\n');
}
