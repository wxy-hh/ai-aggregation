import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  formatDecadeFortuneInsightsForPrompt,
  resolveModelConfig,
  streamModel,
  ModelConfigError,
  ModelUpstreamError,
  type ModelConfig,
} from '@repo/shared';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { deductAiQuotaForRoute, maybeRefund } from '@/lib/api/quota-helpers';
import { ANONYMOUS_OPERATION_COSTS } from '@/lib/constants/quota';

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
    career: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()).optional().default([]), advantages: z.array(z.string()).optional().default([]), suggestions: z.array(z.string()).optional().default([]) }),
    love: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()).optional().default([]), advantages: z.array(z.string()).optional().default([]), suggestions: z.array(z.string()).optional().default([]) }),
    wealth: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()).optional().default([]), advantages: z.array(z.string()).optional().default([]), suggestions: z.array(z.string()).optional().default([]) }),
    health: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()).optional().default([]), advantages: z.array(z.string()).optional().default([]), suggestions: z.array(z.string()).optional().default([]) }),
    personality: z.object({ title: z.string(), summary: z.string(), bullets: z.array(z.string()).optional().default([]), advantages: z.array(z.string()).optional().default([]), suggestions: z.array(z.string()).optional().default([]) }),
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
  baziBasis: z.any().optional(),
  ziweiPalaces: z.any().optional(),
  ziweiCenter: z.any().optional(),
});

const RequestSchema = z.object({
  report: ReportSchema,
  question: z.string().trim().min(1, '问题不能为空').max(1000),
  focusDecadeName: z.string().trim().min(1).max(8).optional(),
  provider: z.enum(['doubao', 'deepseek']).default('doubao'),
});

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
  return withAuth(req, async (user) => {
    const userId = user.id;
    let deductedAmount = 0;

    try {
      const deduction = await deductAiQuotaForRoute({
        userId,
        user,
        anonymousCost: ANONYMOUS_OPERATION_COSTS.DESTINY_COPILOT,
      });

      if (!deduction.success) {
        if (deduction.reason === 'QUOTA_EXHAUSTED') {
          return NextResponse.json(
            { error: '免费额度已用完，您可以继续查看历史记录', code: 'QUOTA_EXHAUSTED' },
            { status: 402 }
          );
        }
        return NextResponse.json(
          { error: 'Token 额度不足，请联系管理员充值', code: 'INSUFFICIENT_TOKENS' },
          { status: 429 }
        );
      }

      deductedAmount = deduction.deductedAmount;

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

    let config: ModelConfig;
    try {
      config = resolveModelConfig(parsed.data.provider);
    } catch (error) {
      if (error instanceof ModelConfigError) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      throw error;
    }

    return new Response(
      createCopilotStream({
        config,
        report: parsed.data.report,
        question: parsed.data.question,
        focusDecadeName: parsed.data.focusDecadeName,
        userId,
        deductedAmount,
        questionLength: parsed.data.question.length,
      }),
      { headers: SSE_HEADERS }
    );
  } catch (error) {
    await maybeRefund(userId, deductedAmount);
    if (error instanceof AuthError) {
      if (error.code === 'FORBIDDEN') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: '追问超时，请稍后重试' }, { status: 504 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '追问失败，请稍后重试' },
      { status: 500 }
    );
  }
});
}

function createCopilotStream({
  config,
  report,
  question,
  focusDecadeName,
  userId,
  deductedAmount,
  questionLength,
}: {
  config: ModelConfig;
  report: z.infer<typeof ReportSchema>;
  question: string;
  focusDecadeName?: string;
  userId: string | null;
  deductedAmount: number;
  questionLength: number;
}) {
  const context = buildCopilotPromptContext(report);
  const scopedInsights = buildQuestionScopedInsights(report, question, focusDecadeName);

  return new ReadableStream<Uint8Array>({
    async start(streamController) {
      let usagePayload: unknown = null;

      try {
        const stream = streamModel({
          config,
          messages: [
            {
              role: 'system',
              content:
                '你是命理报告解读助手。你必须严格基于下方用户消息中提供的八字测算结果来回答追问，不得脱离报告内容编造信息。回答时优先引用报告中的具体数据（四柱八字、五行分布、十神格局、人生五维、十年大运 AI 专属解读、流年等），其中「十年大运」段落为逐步大运全文，用户问运势/大运/流年时必须优先引用对应步运的 summary、前五年与后五年内容。给出清晰、具体、可直接参考的建议。回答要完整说透，不要因为长度限制而截断内容。避免绝对化判断，不做医疗或投资承诺。',
            },
            {
              role: 'user',
              content: `${context}\n${scopedInsights}\n\n用户追问：${question}`,
            },
          ],
          temperature: 0.3,
          timeoutMs: COPILOT_TIMEOUT_MS,
        });

        for await (const ev of stream) {
          if (ev.type === 'text-delta') {
            streamController.enqueue(encodeSseEvent({ type: 'text-delta', text: ev.text }));
          } else if (ev.type === 'done') {
            usagePayload = ev.rawUsage ?? usagePayload;
            streamController.enqueue(encodeSseEvent({ type: 'done' }));
          } else if (ev.type === 'error') {
            throw new ModelUpstreamError(ev.error, 502);
          }
        }

        if (userId) {
          await safeRecordAiUsage({
            userId,
            feature: 'destiny',
            action: 'destiny-copilot',
            provider: config.provider,
            model: config.model,
            endpoint: '/api/destiny/copilot',
            usage: normalizeUsage(usagePayload),
            metadata: {
              questionLength,
              stream: true,
              provider: config.provider,
            },
          });
        }
      } catch (error) {
        await maybeRefund(userId, deductedAmount);
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
        streamController.close();
      }
    },
  });
}

function formatDecadeFortunesForPrompt(basis: {
  decadeFortunes?: Array<{
    name?: string;
    startAge?: number;
    endAge?: number;
    startYear?: number;
    endYear?: number;
    active?: boolean;
  }>;
  decadeFortuneInsights?: Array<{
    name?: string;
    index?: number;
    stemTenGod?: string;
    branchMainTenGod?: string;
    summary?: string;
    stemPhase?: string;
    branchPhase?: string;
    natalNotes?: string[];
  }>;
}) {
  return {
    decadeFortunes: (basis.decadeFortunes ?? []).map((item, index) => ({
      index,
      name: item.name ?? '',
      startAge: item.startAge ?? 0,
      endAge: item.endAge ?? 0,
      startYear: item.startYear ?? 0,
      endYear: item.endYear ?? 0,
      sixtyCycle: item.name ?? '',
      active: Boolean(item.active),
    })),
    decadeFortuneInsights: (basis.decadeFortuneInsights ?? []).map((item, index) => ({
      index: item.index ?? index,
      name: item.name ?? '',
      stemTenGod: item.stemTenGod ?? '',
      branchMainTenGod: item.branchMainTenGod ?? '',
      summary: item.summary ?? '',
      stemPhase: item.stemPhase ?? '',
      branchPhase: item.branchPhase ?? '',
      natalNotes: item.natalNotes ?? [],
    })),
  };
}

function buildCopilotPromptContext(report: z.infer<typeof ReportSchema>) {
  if (report.baziBasis && typeof report.baziBasis === 'object') {
    const basis = report.baziBasis as {
      profile?: {
        name?: string;
        genderLabel?: string;
        birthText?: string;
        locationText?: string;
        lunarText?: string;
        solarText?: string;
      };
      correction?: { summary?: string };
      pillars?: Array<{
        label?: string;
        name?: string;
        sound?: string;
        hiddenStems?: Array<{ stem?: string; tenGod?: string }>;
      }>;
      elementStats?: Array<{ label?: string; value?: number }>;
      tenGodStats?: Array<{ label?: string; value?: number }>;
      annualCycles?: Array<{ year?: number; yearCycle?: string; decadeFortune?: string }>;
      decadeFortunes?: Array<{
        name?: string;
        startAge?: number;
        endAge?: number;
        startYear?: number;
        endYear?: number;
        active?: boolean;
      }>;
      decadeFortuneInsights?: Array<{
        name?: string;
        index?: number;
        stemTenGod?: string;
        branchMainTenGod?: string;
        summary?: string;
        stemPhase?: string;
        branchPhase?: string;
        natalNotes?: string[];
      }>;
    };

    const basisPillars = basis.pillars?.length
      ? basis.pillars
          .map((pillar) => {
            const hidden = pillar.hiddenStems?.length
              ? `，藏干${pillar.hiddenStems
                  .map((item) => `${item.stem ?? ''}${item.tenGod ?? ''}`)
                  .join(' / ')}`
              : '';
            return `${pillar.label}:${pillar.name}${pillar.sound ? `（纳音${pillar.sound}）` : ''}${hidden}`;
          })
          .join('；')
      : '';
    const basisElements = basis.elementStats?.length
      ? basis.elementStats.map((item) => `${item.label ?? ''}${item.value ?? 0}`).join('，')
      : '';
    const basisTenGods = basis.tenGodStats?.length
      ? basis.tenGodStats.map((item) => `${item.label ?? ''}${item.value ?? 0}`).join('，')
      : '';
    const basisTimeline = basis.annualCycles?.length
      ? basis.annualCycles
          .map(
            (item) =>
              `${item.year ?? ''}年 ${item.yearCycle ?? ''}，处于${item.decadeFortune ?? ''}大运`
          )
          .join('；')
      : '';
    const decadeFortuneBlock =
      basis.decadeFortunes?.length && basis.decadeFortuneInsights?.length
        ? formatDecadeFortuneInsightsForPrompt(
            formatDecadeFortunesForPrompt(basis)
          )
        : '';

    return [
      `用户信息：${basis.profile?.name ?? report.profile.name}，${basis.profile?.genderLabel ?? report.profile.genderLabel}，${basis.profile?.birthText ?? report.profile.birthText}，出生地${basis.profile?.locationText ?? report.profile.locationText}${basis.profile?.lunarText ? `，${basis.profile.lunarText}` : ''}`,
      basis.profile?.solarText ? `真太阳时：${basis.profile.solarText}` : '',
      basis.correction?.summary ? `时差修正：${basis.correction.summary}` : '',
      basisPillars ? `四柱：${basisPillars}` : '',
      basisElements ? `五行：${basisElements}` : '',
      basisTenGods ? `十神：${basisTenGods}` : '',
      decadeFortuneBlock ? `十年大运（AI 专属解读，回答大运/运势问题时必须优先引用）：\n${decadeFortuneBlock}` : '',
      basisTimeline ? `未来三年流年：${basisTimeline}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

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

function buildQuestionScopedInsights(
  report: z.infer<typeof ReportSchema>,
  question: string,
  focusDecadeName?: string,
) {
  const q = question.toLowerCase();
  const pickedModules: Array<{ label: string; summary: string; bullets: string[] }> = [];
  const pushModule = (label: string, summary: string, advantages: string[], suggestions: string[], bullets: string[]) => {
    if (!pickedModules.some((item) => item.label === label)) {
      // 优先使用新格式 advantages + suggestions，兼容旧格式 bullets
      const combined = [
        ...advantages.map((t) => `优势：${t}`),
        ...suggestions.map((t) => `建议：${t}`),
        ...bullets,
      ];
      pickedModules.push({ label, summary, bullets: combined.slice(0, 4) });
    }
  };

  if (/事业|工作|职业|升职|跳槽|offer|career|job/.test(q)) {
    pushModule('事业', report.modules.career.summary, report.modules.career.advantages, report.modules.career.suggestions, report.modules.career.bullets);
  }
  if (/感情|爱情|婚|伴侣|恋爱|桃花|关系|love|relationship/.test(q)) {
    pushModule('感情', report.modules.love.summary, report.modules.love.advantages, report.modules.love.suggestions, report.modules.love.bullets);
  }
  if (/财|收入|钱|投资|副业|财富|wealth|money/.test(q)) {
    pushModule('财运', report.modules.wealth.summary, report.modules.wealth.advantages, report.modules.wealth.suggestions, report.modules.wealth.bullets);
  }
  if (/健康|睡眠|情绪|身体|medical|health/.test(q)) {
    pushModule('健康', report.modules.health.summary, report.modules.health.advantages, report.modules.health.suggestions, report.modules.health.bullets);
  }
  if (/性格|人际|沟通|自己|状态|personality/.test(q)) {
    pushModule('性格', report.modules.personality.summary, report.modules.personality.advantages, report.modules.personality.suggestions, report.modules.personality.bullets);
  }

  if (pickedModules.length === 0) {
    pushModule('事业', report.modules.career.summary, report.modules.career.advantages, report.modules.career.suggestions, report.modules.career.bullets);
    pushModule('感情', report.modules.love.summary, report.modules.love.advantages, report.modules.love.suggestions, report.modules.love.bullets);
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

  const decadeFortuneScoped = buildDecadeFortuneScopedBlock(report, question, focusDecadeName);

  return [
    decadeFortuneScoped,
    `相关模块：\n${modules}`,
    `相关流年：\n${timeline}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildDecadeFortuneScopedBlock(
  report: z.infer<typeof ReportSchema>,
  question: string,
  focusDecadeName?: string,
): string {
  const mentionsDecade =
    /大运|十年|运势|流年|岁运|走运|运程|decade|fortune/i.test(question);

  if (!report.baziBasis || typeof report.baziBasis !== 'object') {
    return '';
  }

  const basis = report.baziBasis as {
    decadeFortunes?: Array<{
      name?: string;
      startAge?: number;
      endAge?: number;
      startYear?: number;
      endYear?: number;
      active?: boolean;
    }>;
    decadeFortuneInsights?: Array<{
      name?: string;
      index?: number;
      stemTenGod?: string;
      branchMainTenGod?: string;
      summary?: string;
      stemPhase?: string;
      branchPhase?: string;
      natalNotes?: string[];
    }>;
  };

  if (!basis.decadeFortuneInsights?.length || !basis.decadeFortunes?.length) {
    return '';
  }

  if (focusDecadeName) {
    const focusedInsight = basis.decadeFortuneInsights.find((item) => item.name === focusDecadeName);
    const focusedDecade = basis.decadeFortunes?.find((item) => item.name === focusDecadeName);
    if (focusedInsight) {
      const timeline = focusedDecade
        ? `${focusedDecade.startAge}-${focusedDecade.endAge}岁（${focusedDecade.startYear}-${focusedDecade.endYear}年）`
        : '';
      const natal =
        focusedInsight.natalNotes && focusedInsight.natalNotes.length > 0
          ? `命局互动：${focusedInsight.natalNotes.join('；')}。`
          : '';
      return [
        `【用户从十年大运弹层追问，须优先只回答 ${focusDecadeName}大运，勿泛泛谈论其他步运】`,
        `${focusDecadeName}大运 ${timeline}；十神：天干${focusedInsight.stemTenGod}，地支藏${focusedInsight.branchMainTenGod}`,
        `整体：${focusedInsight.summary}`,
        `前五年：${focusedInsight.stemPhase}`,
        `后五年：${focusedInsight.branchPhase}`,
        natal,
      ]
        .filter(Boolean)
        .join('\n');
    }
  }

  const fullText = formatDecadeFortuneInsightsForPrompt(
    formatDecadeFortunesForPrompt(basis)
  );

  if (!fullText) return '';

  if (mentionsDecade) {
    return `十年大运全文（AI 专属，须据此回答）：\n${fullText}`;
  }

  const activeInsight = basis.decadeFortuneInsights.find((item) => {
    const decade = basis.decadeFortunes?.find((entry) => entry.name === item.name);
    return decade?.active;
  });

  if (!activeInsight) return '';

  const activeDecade = basis.decadeFortunes?.find((item) => item.active);
  const header = activeDecade
    ? `当前大运 ${activeDecade.name}（${activeDecade.startAge}-${activeDecade.endAge}岁）`
    : `当前大运 ${activeInsight.name}`;

  return [
    `${header}（AI 专属摘要）`,
    `整体：${activeInsight.summary}`,
    `前五年：${activeInsight.stemPhase}`,
    `后五年：${activeInsight.branchPhase}`,
    activeInsight.natalNotes?.length
      ? `命局互动：${activeInsight.natalNotes.join('；')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
