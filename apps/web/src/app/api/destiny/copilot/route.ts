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
import { encodeChatSseEvent, SSE_HEADERS } from '@/lib/utils/sse';
import { releaseAiQuota, reserveChatQuota, settleAiQuota } from '@/lib/billing/quota-service';
import { createTokenMeasurement, estimateOutputTokens } from '@/lib/billing/usage-measurement';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';

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
    career: z.object({
      title: z.string(),
      summary: z.string(),
      bullets: z.array(z.string()).optional().default([]),
      advantages: z.array(z.string()).optional().default([]),
      suggestions: z.array(z.string()).optional().default([]),
    }).optional(),
    love: z.object({
      title: z.string(),
      summary: z.string(),
      bullets: z.array(z.string()).optional().default([]),
      advantages: z.array(z.string()).optional().default([]),
      suggestions: z.array(z.string()).optional().default([]),
    }).optional(),
    wealth: z.object({
      title: z.string(),
      summary: z.string(),
      bullets: z.array(z.string()).optional().default([]),
      advantages: z.array(z.string()).optional().default([]),
      suggestions: z.array(z.string()).optional().default([]),
    }).optional(),
    health: z.object({
      title: z.string(),
      summary: z.string(),
      bullets: z.array(z.string()).optional().default([]),
      advantages: z.array(z.string()).optional().default([]),
      suggestions: z.array(z.string()).optional().default([]),
    }).optional(),
    personality: z.object({
      title: z.string(),
      summary: z.string(),
      bullets: z.array(z.string()).optional().default([]),
      advantages: z.array(z.string()).optional().default([]),
      suggestions: z.array(z.string()).optional().default([]),
    }).optional(),
  }).optional(),
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
  ).optional().default([]),
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

const COPILOT_TIMEOUT_MS = 100000;

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const userId = user.id;
    let reservation: { id: string } | null = null;

    try {
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

      const messages = buildCopilotMessages(
        parsed.data.report,
        parsed.data.question,
        parsed.data.focusDecadeName
      );
      const requestId = getBillingRequestId(req, body as Record<string, unknown>);
      let inputUnits = 0;
      if (user.role !== 'admin') {
        const quota = await reserveChatQuota({
          userId,
          requestId,
          feature: 'destiny',
          provider: config.provider,
          model: config.model,
          messages,
          maxOutputTokens: 2048,
          metadata: { questionLength: parsed.data.question.length, stream: true },
        });
        reservation = quota.reservation;
        inputUnits = quota.inputUnits;
      }

      return new Response(
        createCopilotStream({
          config,
          messages,
          userId,
          reservationId: reservation?.id,
          requestId,
          inputUnits,
          questionLength: parsed.data.question.length,
        }),
        { headers: SSE_HEADERS }
      );
    } catch (error) {
      if (reservation) {
        await releaseAiQuota({
          reservationId: reservation.id,
          reason: '命理追问请求失败',
          meterType: 'tokens',
        }).catch((releaseError) => console.error('[destiny/copilot] 释放额度失败:', releaseError));
      }
      if (error instanceof AuthError) {
        if (error.code === 'FORBIDDEN') {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json({ error: '追问超时，请稍后重试' }, { status: 504 });
      }
      if (error instanceof BillingError) return billingErrorResponse(error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : '追问失败，请稍后重试' },
        { status: 500 }
      );
    }
  });
}

function createCopilotStream({
  config,
  messages,
  userId,
  reservationId,
  requestId,
  inputUnits,
  questionLength,
}: {
  config: ModelConfig;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  userId: string | null;
  reservationId?: string;
  requestId: string;
  inputUnits: number;
  questionLength: number;
}) {
  // 使用 pull() 模式：start() 立即 resolve 让 HTTP 响应头尽快发出，
  // 数据在 pull() 中按需从上游异步生成器逐帧读取并 enqueue。
  const streamIterator = streamModel({
    config,
    messages,
    temperature: 0.3,
    // 不传 maxTokens：doubao 的 max_output_tokens 同时限制 reasoning+output，
    // reasoning 用完预算后 output 为 0。去掉限制由 timeout 自然截断。
    timeoutMs: COPILOT_TIMEOUT_MS,
  })[Symbol.asyncIterator]();

  let usagePayload: unknown = null;
  let outputText = '';

  return new ReadableStream<Uint8Array>({
    async pull(streamController) {
      try {
        const { value: ev, done } = await streamIterator.next();
        if (done) {
          // 流结束：结算配额并关闭
          await settleUsage();
          streamController.close();
          return;
        }

        if (ev.type === 'text-delta') {
          outputText += ev.text;
          streamController.enqueue(encodeChatSseEvent({ type: 'text-delta', text: ev.text }));
        } else if (ev.type === 'done') {
          usagePayload = ev.rawUsage ?? usagePayload;
          streamController.enqueue(encodeChatSseEvent({ type: 'done' }));
        } else if (ev.type === 'error') {
          throw new ModelUpstreamError(ev.error, 502);
        }
      } catch (error) {
        // 结算配额（部分或释放）
        await settleUsageOnError(error);
        streamController.enqueue(
          encodeChatSseEvent({
            type: 'error',
            error:
              error instanceof Error && error.name === 'AbortError'
                ? '追问超时，请稍后重试'
                : error instanceof Error
                  ? error.message
                  : '追问失败，请稍后重试',
          })
        );
        // 对齐聊天契约终止序列：error 后同样补发 done，
        // 确保「error 即终止」的消费方与依赖终止帧的消费方行为一致。
        streamController.enqueue(encodeChatSseEvent({ type: 'done' }));
        streamController.close();
      }
    },

    cancel() {
      streamIterator.return?.(undefined);
    },
  });

  async function settleUsage() {
    if (reservationId) {
      await settleAiQuota({
        reservationId,
        requestId,
        feature: 'destiny',
        action: 'destiny-copilot',
        provider: config.provider,
        model: config.model,
        endpoint: '/api/destiny/copilot',
        measurement: createTokenMeasurement(
          usagePayload,
          inputUnits + estimateOutputTokens(outputText)
        ),
        metadata: { questionLength, stream: true, provider: config.provider },
      });
    } else if (userId) {
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
  }

  async function settleUsageOnError(error: unknown) {
    if (reservationId) {
      if (outputText) {
        await settleAiQuota({
          reservationId,
          requestId,
          feature: 'destiny',
          action: 'destiny-copilot',
          provider: config.provider,
          model: config.model,
          endpoint: '/api/destiny/copilot',
          measurement: createTokenMeasurement(
            usagePayload,
            inputUnits + estimateOutputTokens(outputText)
          ),
          status: 'partial',
          metadata: { questionLength, stream: true, provider: config.provider },
        });
      } else {
        await releaseAiQuota({
          reservationId,
          reason: '命理追问流式失败',
          meterType: 'tokens',
        });
      }
    }
  }
}

function buildCopilotMessages(
  report: z.infer<typeof ReportSchema>,
  question: string,
  focusDecadeName?: string
): Array<{ role: 'system' | 'user'; content: string }> {
  const context = buildCopilotPromptContext(report);
  const scopedInsights = buildQuestionScopedInsights(report, question, focusDecadeName);
  return [
    {
      role: 'system',
      content:
        '你是命理报告解读助手。你必须严格基于下方用户消息中提供的八字测算结果来回答追问，不得脱离报告内容编造信息。回答时优先引用报告中的具体数据（四柱八字、五行分布、十神格局、人生五维、十年大运 AI 专属解读、流年等），其中「十年大运」段落为逐步大运全文，用户问运势/大运/流年时必须优先引用对应步运的 summary、前五年与后五年内容。给出清晰、具体、可直接参考的建议。回答要完整说透，不要因为长度限制而截断内容。避免绝对化判断，不做医疗或投资承诺。',
    },
    { role: 'user', content: `${context}\n${scopedInsights}\n\n用户追问：${question}` },
  ];
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
        ? formatDecadeFortuneInsightsForPrompt(formatDecadeFortunesForPrompt(basis))
        : '';

    return [
      `用户信息：${basis.profile?.name ?? report.profile.name}，${basis.profile?.genderLabel ?? report.profile.genderLabel}，${basis.profile?.birthText ?? report.profile.birthText}，出生地${basis.profile?.locationText ?? report.profile.locationText}${basis.profile?.lunarText ? `，${basis.profile.lunarText}` : ''}`,
      basis.profile?.solarText ? `真太阳时：${basis.profile.solarText}` : '',
      basis.correction?.summary ? `时差修正：${basis.correction.summary}` : '',
      basisPillars ? `四柱：${basisPillars}` : '',
      basisElements ? `五行：${basisElements}` : '',
      basisTenGods ? `十神：${basisTenGods}` : '',
      decadeFortuneBlock
        ? `十年大运（AI 专属解读，回答大运/运势问题时必须优先引用）：\n${decadeFortuneBlock}`
        : '',
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
    ? report.tenGodDomains
        .map((item) => `${item.label}(${item.technicalLabel})${item.value}`)
        .join('，')
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
  focusDecadeName?: string
) {
  const q = question.toLowerCase();
  const pickedModules: Array<{ label: string; summary: string; bullets: string[] }> = [];
  const reportModules = report.modules ?? {};
  const pushModule = (
    label: string,
    summary: string,
    advantages: string[],
    suggestions: string[],
    bullets: string[]
  ) => {
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

  if (/事业|工作|职业|升职|跳槽|offer|career|job/.test(q) && reportModules.career) {
    pushModule(
      '事业',
      reportModules.career.summary,
      reportModules.career.advantages,
      reportModules.career.suggestions,
      reportModules.career.bullets
    );
  }
  if (/感情|爱情|婚|伴侣|恋爱|桃花|关系|love|relationship/.test(q) && reportModules.love) {
    pushModule(
      '感情',
      reportModules.love.summary,
      reportModules.love.advantages,
      reportModules.love.suggestions,
      reportModules.love.bullets
    );
  }
  if (/财|收入|钱|投资|副业|财富|wealth|money/.test(q) && reportModules.wealth) {
    pushModule(
      '财运',
      reportModules.wealth.summary,
      reportModules.wealth.advantages,
      reportModules.wealth.suggestions,
      reportModules.wealth.bullets
    );
  }
  if (/健康|睡眠|情绪|身体|medical|health/.test(q) && reportModules.health) {
    pushModule(
      '健康',
      reportModules.health.summary,
      reportModules.health.advantages,
      reportModules.health.suggestions,
      reportModules.health.bullets
    );
  }
  if (/性格|人际|沟通|自己|状态|personality/.test(q) && reportModules.personality) {
    pushModule(
      '性格',
      reportModules.personality.summary,
      reportModules.personality.advantages,
      reportModules.personality.suggestions,
      reportModules.personality.bullets
    );
  }

  if (pickedModules.length === 0 && reportModules.career) {
    pushModule(
      '事业',
      reportModules.career.summary,
      reportModules.career.advantages,
      reportModules.career.suggestions,
      reportModules.career.bullets
    );
    if (reportModules.love) {
      pushModule(
        '感情',
        reportModules.love.summary,
        reportModules.love.advantages,
        reportModules.love.suggestions,
        reportModules.love.bullets
      );
    }
  }

  const currentYear = new Date().getFullYear();
  const timeline = [...(report.timeline ?? [])]
    .sort((a, b) => Math.abs(a.year - currentYear) - Math.abs(b.year - currentYear))
    .slice(0, 2)
    .map((item) => `${item.year}年 ${item.title}：${item.summary}`)
    .join('\n');

  const pickedModulesText = pickedModules
    .slice(0, 2)
    .map(
      ({ label, summary, bullets }) =>
        `${label}：${summary}；建议：${bullets.slice(0, 2).join('；')}`
    )
    .join('\n');

  const decadeFortuneScoped = buildDecadeFortuneScopedBlock(report, question, focusDecadeName);

  return [decadeFortuneScoped, `相关模块：\n${pickedModulesText}`, `相关流年：\n${timeline}`]
    .filter(Boolean)
    .join('\n');
}

function buildDecadeFortuneScopedBlock(
  report: z.infer<typeof ReportSchema>,
  question: string,
  focusDecadeName?: string
): string {
  const mentionsDecade = /大运|十年|运势|流年|岁运|走运|运程|decade|fortune/i.test(question);

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
    const focusedInsight = basis.decadeFortuneInsights.find(
      (item) => item.name === focusDecadeName
    );
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

  const fullText = formatDecadeFortuneInsightsForPrompt(formatDecadeFortunesForPrompt(basis));

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
    activeInsight.natalNotes?.length ? `命局互动：${activeInsight.natalNotes.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
