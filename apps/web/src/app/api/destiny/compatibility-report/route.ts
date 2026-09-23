/**
 * compatibility-report/route.ts —— 八字合盘报告流式生成端点
 *
 * 架构规范：
 * - 正向引用 @repo/shared 权威契约，杜绝逆向依赖前端组件目录；
 * - 接入 createReportHandler 标准工厂，统一处理鉴权、参数校验、异常响应与 SSE 包装；
 * - 接入 createQuotaStream 统一计费流管道，通过显式 finish 声明闭环完成（success）、截断（partial）与失败整额释放（failed）。
 */

import { z } from 'zod';
import {
  extractJsonObject,
  resolveModelConfig,
  streamModel,
  ModelConfigError,
  type CompatibilityReport,
  type CompatibilityStreamEvent,
  type RelationType,
  type ModelConfig,
} from '@repo/shared';
import { QuotaSession } from '@/lib/billing/quota-session';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { encodeSseEvent } from '@/lib/utils/sse';
import { generateUUID } from '@/lib/utils/uuid';
import {
  buildCompatibilityChartFacts,
  buildLiteFactsForPrompt,
  type CompatibilityPersonInput,
} from '../_lib/compatibility-chart';
import {
  buildCompatibilitySystemPrompt,
  normalizeCompatibilityView,
} from '../_lib/compatibility-normalizer';
import {
  createReportHandler,
  defaultMapError,
  type ReportGenerationAdapter,
  type ReportGenerationContext,
} from '../_lib/report-generation';
import {
  createQuotaStream,
  type QuotaStreamControl,
} from '../_lib/quota-stream';

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
  /** 仅生成指定视角（标签页按需）；与首开一样预扣并结算额度 */
  viewOnly: z.boolean().optional().default(false),
  existingReportId: z.string().optional(),
  sourceBaziHistoryId: z.string().nullable().optional(),
  consentConfirmed: z.literal(true, {
    errorMap: () => ({ message: '请确认已获得对方同意' }),
  }),
});

type CompatibilityRequestBody = z.infer<typeof RequestSchema>;

const MAX_OUTPUT = 8000;
const TIMEOUT_MS = 120000;

/** 构建八字合盘个人资料输入结构体，消除重复映射代码异味 */
function buildCompatibilityPersonInput(
  person: z.infer<typeof PersonSchema>,
  defaultName = 'TA'
): CompatibilityPersonInput {
  return {
    name: person.name?.trim() || defaultName,
    gender: person.gender ?? null,
    calendarType: person.calendarType,
    birthDate: person.birthDate,
    birthTime: person.birthTime ?? null,
    location: person.location
      ? {
          name: person.location.name,
          lat: person.location.lat ?? null,
          lon: person.location.lon ?? null,
        }
      : null,
  };
}

/**
 * 八字合盘标准报告生成适配器
 */
const compatibilityReportAdapter: ReportGenerationAdapter<ReadableStream<Uint8Array>> = {
  requestSchema: RequestSchema,

  mapError(error: unknown): string {
    if (error instanceof ModelConfigError) {
      return error.message;
    }
    return defaultMapError(error);
  },

  async generate(ctx: ReportGenerationContext, rawBody: unknown): Promise<ReadableStream<Uint8Array>> {
    const body = rawBody as CompatibilityRequestBody;
    const { req, user } = ctx;

    const config: ModelConfig = resolveModelConfig(body.provider);

    const selfInput = buildCompatibilityPersonInput(body.self, '我');
    const partnerInput = buildCompatibilityPersonInput(body.partner, 'TA');

    const relationType = body.relationType as RelationType;
    const facts = buildCompatibilityChartFacts({ self: selfInput, partner: partnerInput });
    const lite = buildLiteFactsForPrompt(facts);
    const system = buildCompatibilitySystemPrompt(relationType);
    const userPrompt = [
      '双方命盘事实（只可引用，不可编造时柱）：',
      JSON.stringify(lite, null, 2),
      body.focusTags?.length
        ? `用户当前关心：${body.focusTags.join('、')}`
        : '用户未额外标注关心点。',
      '请按系统要求输出 JSON。',
    ].join('\n');

    const messages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: userPrompt },
    ];

    const requestId = getBillingRequestId(req, body as unknown as Record<string, unknown>);

    // 预留额度（管理员免扣跳过）
    const session = await QuotaSession.reserve(
      {
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
          viewOnly: body.viewOnly,
        },
      },
      user.role
    );

    const reportId = body.existingReportId || generateUUID();

    const { control, wrap } = createQuotaStream({
      context: {
        requestId,
        action: 'destiny-compatibility-report',
        endpoint: '/api/destiny/compatibility-report',
        provider: config.provider,
        model: config.model,
        userId: user.id,
        feature: 'destiny',
        metadata: {
          reportType: 'bazi-compatibility',
          relationType,
        },
      },
      logLabel: 'compatibility-report',
    });
    control.bindSession(session);

    // 构建原始业务输出流
    const rawStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: CompatibilityStreamEvent) => {
          controller.enqueue(encodeSseEvent(event as unknown as Record<string, unknown>));
        };
        let rawUsage: unknown = null;

        try {
          send({ type: 'status', status: 'validating' });
          send({ type: 'status', status: 'charting' });
          send({ type: 'section-final', sectionKey: 'chartFacts', payload: facts });
          send({ type: 'status', status: 'analyzing' });

          const stream = streamModel({
            config,
            messages,
            temperature: 0.35,
            maxTokens: session.outputLimit,
            timeoutMs: TIMEOUT_MS,
          });

          for await (const ev of stream) {
            if (ev.type === 'text-delta') {
              control.appendOutputText(ev.text);
            } else if (ev.type === 'done') {
              rawUsage = ev.rawUsage;
            } else if (ev.type === 'error') {
              throw new Error(ev.error);
            }
          }

          if (!control.hasOutput()) {
            throw new Error('模型服务未产出有效解读内容');
          }

          let raw: unknown = {};
          try {
            raw = extractJsonObject(control.getOutputText());
          } catch {
            raw = {};
          }

          const view = normalizeCompatibilityView(raw, relationType, facts);
          send({ type: 'section-final', sectionKey: 'view', payload: view });
          send({ type: 'status', status: 'finalizing' });

          const report: CompatibilityReport = {
            id: reportId,
            relationType,
            focusTags: body.focusTags ?? [],
            chartFacts: facts,
            views: { [relationType]: view },
            partnerDisplayName: partnerInput.name,
            createdAt: new Date().toISOString(),
            sourceBaziHistoryId: body.sourceBaziHistoryId ?? null,
          };

          send({ type: 'complete', report });
          await control.finish({ outcome: 'success', usage: rawUsage });
        } catch (error) {
          const reason = error instanceof Error ? error.message : '合盘生成失败';
          send({
            type: 'error',
            error: reason,
          });
          await control.finish({ outcome: 'failed', reason });
        } finally {
          controller.close();
        }
      },
    });

    return wrap(rawStream);
  },
};

export const POST = createReportHandler(compatibilityReportAdapter);
