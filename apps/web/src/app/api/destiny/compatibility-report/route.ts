import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  resolveModelConfig,
  streamModel,
  ModelConfigError,
  type ModelConfig,
} from '@repo/shared';
import { withAuth } from '@/lib/api/with-auth';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { releaseAiQuota, reserveChatQuota, settleAiQuota } from '@/lib/billing/quota-service';
import { createTokenMeasurement, estimateOutputTokens } from '@/lib/billing/usage-measurement';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';
import {
  buildCompatibilityChartFacts,
  buildLiteFactsForPrompt,
  type CompatibilityPersonInput,
} from '../_lib/compatibility-chart';
import {
  buildCompatibilitySystemPrompt,
  normalizeCompatibilityView,
} from '../_lib/compatibility-normalizer';
import type {
  CompatibilityReport,
  CompatibilityStreamEvent,
  RelationType,
} from '@/app/destiny/_components/compatibility/types';
import { generateUUID } from '@/lib/utils/uuid';

export const runtime = 'nodejs';
export const maxDuration = 180;

const PersonSchema = z.object({
  name: z.string().trim().optional().default(''),
  gender: z.enum(['male', 'female']).nullable().optional(),
  calendarType: z.enum(['lunar', 'solar']).default('solar'),
  birthDate: z.object({
    year: z.number().int().min(1900).max(2100),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    isLeapMonth: z.boolean().optional(),
  }),
  birthTime: z
    .object({
      hour: z.string().regex(/^\d{2}$/),
      minute: z.string().regex(/^\d{2}$/),
    })
    .nullable()
    .optional(),
  location: z
    .object({
      name: z.string().trim(),
      lat: z.number().nullable().optional(),
      lon: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const RequestSchema = z.object({
  self: PersonSchema.extend({
    name: z.string().trim().min(1, '我的称呼不能为空'),
  }),
  partner: PersonSchema,
  relationType: z.enum(['romance', 'marriage', 'friendship', 'partnership']).default('romance'),
  focusTags: z.array(z.string()).optional().default([]),
  provider: z.enum(['doubao', 'deepseek']).default('doubao'),
  /** 仅生成指定视角（Tab 按需）；与首开一样预扣并结算额度 */
  viewOnly: z.boolean().optional().default(false),
  existingReportId: z.string().optional(),
  sourceBaziHistoryId: z.string().nullable().optional(),
  consentConfirmed: z.literal(true, {
    errorMap: () => ({ message: '请确认已获得对方同意' }),
  }),
});

const MAX_OUTPUT = 8000;
const TIMEOUT_MS = 120000;

function extractJsonObject(text: string): unknown {
  const cleaned = text.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = (fenced?.[1] ?? cleaned).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型未返回有效 JSON');
  return JSON.parse(body.slice(start, end + 1));
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
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

      const selfInput: CompatibilityPersonInput = {
        name: parsed.data.self.name,
        gender: parsed.data.self.gender ?? null,
        calendarType: parsed.data.self.calendarType,
        birthDate: parsed.data.self.birthDate,
        birthTime: parsed.data.self.birthTime ?? null,
        location: parsed.data.self.location
          ? {
              name: parsed.data.self.location.name,
              lat: parsed.data.self.location.lat ?? null,
              lon: parsed.data.self.location.lon ?? null,
            }
          : null,
      };

      const partnerName = parsed.data.partner.name?.trim() || 'TA';
      const partnerInput: CompatibilityPersonInput = {
        name: partnerName,
        gender: parsed.data.partner.gender ?? null,
        calendarType: parsed.data.partner.calendarType,
        birthDate: parsed.data.partner.birthDate,
        birthTime: parsed.data.partner.birthTime ?? null,
        location: parsed.data.partner.location
          ? {
              name: parsed.data.partner.location.name,
              lat: parsed.data.partner.location.lat ?? null,
              lon: parsed.data.partner.location.lon ?? null,
            }
          : null,
      };

      const relationType = parsed.data.relationType as RelationType;
      const facts = buildCompatibilityChartFacts({ self: selfInput, partner: partnerInput });
      const lite = buildLiteFactsForPrompt(facts);
      const system = buildCompatibilitySystemPrompt(relationType);
      const userPrompt = [
        '双方命盘事实（只可引用，不可编造时柱）：',
        JSON.stringify(lite, null, 2),
        parsed.data.focusTags?.length
          ? `用户当前关心：${parsed.data.focusTags.join('、')}`
          : '用户未额外标注关心点。',
        '请按系统要求输出 JSON。',
      ].join('\n');

      const messages = [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: userPrompt },
      ];

      const requestId = getBillingRequestId(req, body as Record<string, unknown>);
      let inputUnits = 0;
      let outputLimit = MAX_OUTPUT;
      // 首开与补生成视角均预扣额度；admin 免扣
      if (user.role !== 'admin') {
        const quota = await reserveChatQuota({
          userId: user.id,
          requestId,
          feature: 'destiny',
          provider: config.provider,
          model: config.model,
          messages,
          maxOutputTokens: MAX_OUTPUT,
          metadata: {
            reportType: 'bazi-compatibility',
            relationType,
            viewOnly: parsed.data.viewOnly,
          },
        });
        reservation = quota.reservation;
        inputUnits = quota.inputUnits;
        outputLimit = quota.outputLimit;
      }

      const reportId = parsed.data.existingReportId || generateUUID();
      const stream = createStream({
        config,
        userId: user.id,
        messages,
        facts,
        relationType,
        focusTags: parsed.data.focusTags ?? [],
        partnerDisplayName: partnerName,
        reportId,
        sourceBaziHistoryId: parsed.data.sourceBaziHistoryId ?? null,
        reservationId: reservation?.id,
        requestId,
        inputUnits,
        outputLimit,
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    } catch (error) {
      if (reservation) {
        await releaseAiQuota({
          reservationId: reservation.id,
          reason: '合盘请求初始化失败',
          meterType: 'tokens',
        }).catch((e) => console.error('[compatibility-report] 释放额度失败:', e));
      }
      if (error instanceof BillingError) return billingErrorResponse(error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : '合盘失败，请稍后重试' },
        { status: 500 }
      );
    }
  });
}

function createStream(args: {
  config: ModelConfig;
  userId: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  facts: ReturnType<typeof buildCompatibilityChartFacts>;
  relationType: RelationType;
  focusTags: string[];
  partnerDisplayName: string;
  reportId: string;
  sourceBaziHistoryId: string | null;
  reservationId?: string;
  requestId: string;
  inputUnits: number;
  outputLimit: number;
}) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (event: CompatibilityStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let textBuffer = '';
      let usagePayload: unknown;

      try {
        send({ type: 'status', status: 'validating' });
        send({ type: 'status', status: 'charting' });
        send({ type: 'section-final', sectionKey: 'chartFacts', payload: args.facts });
        send({ type: 'status', status: 'analyzing' });

        try {
          const stream = streamModel({
            config: args.config,
            messages: args.messages,
            temperature: 0.35,
            maxTokens: args.outputLimit,
            timeoutMs: TIMEOUT_MS,
          });

          for await (const ev of stream) {
            if (ev.type === 'text-delta') {
              textBuffer += ev.text;
            } else if (ev.type === 'done') {
              usagePayload = ev.rawUsage ?? usagePayload;
            } else if (ev.type === 'error') {
              throw new Error(ev.error);
            }
          }
        } catch (modelError) {
          console.error('[compatibility-report] model error, using fallback view', modelError);
          textBuffer = '';
        }

        let raw: unknown = {};
        if (textBuffer.trim()) {
          try {
            raw = extractJsonObject(textBuffer);
          } catch {
            raw = {};
          }
        }

        const view = normalizeCompatibilityView(raw, args.relationType, args.facts);
        send({ type: 'section-final', sectionKey: 'view', payload: view });
        send({ type: 'status', status: 'finalizing' });

        const report: CompatibilityReport = {
          id: args.reportId,
          relationType: args.relationType,
          focusTags: args.focusTags,
          chartFacts: args.facts,
          views: { [args.relationType]: view },
          partnerDisplayName: args.partnerDisplayName,
          createdAt: new Date().toISOString(),
          sourceBaziHistoryId: args.sourceBaziHistoryId,
        };

        if (args.reservationId) {
          await settleAiQuota({
            reservationId: args.reservationId,
            requestId: args.requestId,
            feature: 'destiny',
            action: 'destiny-compatibility-report',
            provider: args.config.provider,
            model: args.config.model,
            endpoint: '/api/destiny/compatibility-report',
            measurement: createTokenMeasurement(
              usagePayload,
              args.inputUnits + estimateOutputTokens(textBuffer)
            ),
            metadata: {
              reportType: 'bazi-compatibility',
              relationType: args.relationType,
            },
          }).catch((e) => console.error('[compatibility-report] settle failed', e));
        } else {
          // admin 等无预留路径：仍记用量，便于个人中心分项归档
          await safeRecordAiUsage({
            userId: args.userId,
            feature: 'destiny',
            action: 'destiny-compatibility-report',
            provider: args.config.provider,
            model: args.config.model,
            endpoint: '/api/destiny/compatibility-report',
            usage: normalizeUsage(usagePayload),
            metadata: {
              reportType: 'bazi-compatibility',
              relationType: args.relationType,
            },
          }).catch(() => undefined);
        }

        send({ type: 'complete', report });
      } catch (error) {
        if (args.reservationId) {
          await releaseAiQuota({
            reservationId: args.reservationId,
            reason: '合盘流式失败',
            meterType: 'tokens',
          }).catch(() => undefined);
        }
        send({
          type: 'error',
          error: error instanceof Error ? error.message : '合盘生成失败',
        });
      } finally {
        controller.close();
      }
    },
  });
}
