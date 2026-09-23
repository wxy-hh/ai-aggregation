/**
 * route.ts —— POST /api/destiny/astrology/report（星座寰宇报告流，SSE）
 *
 * 单次调用的流式解读（工单 03）：真值先下线，随后豆包 / DeepSeek 基于真值产出四个分区，
 * 服务端边流边按分区顺序推送，前端逐区渲染（文案逐区浮现，而非等整段输出完）。
 *
 * 事件顺序（协议见 lib/astrology/report-events.ts）：
 *   chart-facts → headline → bigThree → modules → transits → complete
 * 任一解读阶段失败（超时 / 校验不过 / 上游报错）：
 *   chart-facts →（已推送的分区）→ interpretation-unavailable(reason='model') → complete
 * 额度不足：chart-facts → interpretation-unavailable(reason='quota') → complete（前端既有锁定卡链路）
 *
 * 顺序铁律：
 * - chart-facts 必须是第一帧：先做确定性计算（本命盘 + 行运，单盘约 110–150ms）并立即下发，
 *   真值不依赖任何模型与额度；额度与模型配置只在解读阶段介入，绝不因它们扣下星盘；
 * - 解读失败只降级解读层，绝不下发 error 事件把星盘一起冲掉（error 仅用于真值阶段的失败）；
 * - 分区顺序固定：headline → bigThree → modules → transits（扫描器缓存乱序分区，按序释放）。
 *
 * 额度与生命周期（收敛至 QuotaSession 统一决策表与 quota-stream 管道）：
 * - 解读前由 QuotaSession.reserve 预留配额（管理员跳过，免预留）；
 * - 成功按真实 usage 结算（缺失时按输入与输出估算兜底）；流失败或截断按显式声明结算，未产出正文整额释放；
 * - 预留不足（BillingError QUOTA_INSUFFICIENT）只降级解读层，星盘照常下发。
 *
 * 鉴权与请求校验复用八字 report 同一工厂（createReportHandler）：未登录 401、请求体不合法 400。
 */

import {
  ModelConfigError,
  ModelUpstreamError,
  resolveModelConfig,
  streamModel,
  type ModelConfig,
} from '@repo/shared';
import { computeChartFacts, startOfNaturalWeekUtc } from '@/lib/astrology/chart-engine';
import type { AstrologyReportEvent } from '@/lib/astrology/report-events';
import {
  buildFactReferenceKeys,
  buildTransitNote,
  formatWeekRange,
} from '@/lib/astrology/interpretation';
import { selectActiveTransits } from '@/lib/astrology/transit-selection';
import { encodeSseEvent } from '@/lib/utils/sse';
import { QuotaSession } from '@/lib/billing/quota-session';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { BillingError } from '@/lib/billing/billing-errors';
import {
  createReportHandler,
  defaultMapError,
  type ReportGenerationAdapter,
  type ReportGenerationContext,
} from '../../_lib/report-generation';
import {
  createQuotaStream,
  type QuotaStreamControl,
} from '../../_lib/quota-stream';
import {
  AstrologyReportRequestError,
  AstrologyReportRequestSchema,
  buildProfileFromRequestBody,
  type AstrologyReportRequestBody,
} from '../_lib/astrology-report-request';
import {
  ASTROLOGY_REPORT_JSON_SCHEMA,
  ASTROLOGY_REPORT_SCHEMA_NAME,
} from '../_lib/astrology-report-json-schema';
import {
  AstrologyReportSectionError,
  createReportSectionScanner,
  parseBigThreeSection,
  parseHeadlineSection,
  parseModulesSection,
  parseTransitsSection,
  type ClosedSection,
  type SectionValidationContext,
} from '../_lib/astrology-report-sections';
import { buildAstrologyPromptPayload, buildAstrologySystemPrompt, buildAstrologyUserPrompt } from '../_lib/astrology-prompt';

export const runtime = 'nodejs';
/** 与八字 report 对齐（单次流式解读可能跑满长输出） */
export const maxDuration = 300;

/**
 * 解读超时（与八字 report 同档）
 * 注意：Next.js 的 route 文件只允许导出约定的成员，这三个调参常量不做导出（测试按行为断言）。
 */
const ASTROLOGY_REPORT_TIMEOUT_MS = 300_000;
/** 解读输出上限（工单区间 6–8k；报告四个分区的实测预算约 5k） */
const ASTROLOGY_REPORT_MAX_OUTPUT_TOKENS = 8000;
/**
 * 解读温度：偏高保文案张力（工单初值 0.7，联调可调）；
 * 问答侧温度偏低保事实忠实（04 工单），两者不共用同一常量。
 */
const ASTROLOGY_REPORT_TEMPERATURE = 0.7;

const TIME_PRECISION_LABEL: Record<AstrologyReportRequestBody['timePrecision'], string> = {
  accurate: '准确到分钟（完整本命盘）',
  approximate: '大约时段（区间内稳定性校验后的可用字段）',
  unknown: '完全未知（只按出生当日的稳定事实解读）',
};

const AstrologyReportAdapter: ReportGenerationAdapter<ReadableStream<Uint8Array>> = {
  requestSchema: AstrologyReportRequestSchema,

  async generate(ctx: ReportGenerationContext, body: unknown) {
    return createAstrologyReportStream(ctx, body as AstrologyReportRequestBody);
  },

  mapError: defaultMapError,
};

export const POST = createReportHandler(AstrologyReportAdapter);

/**
 * 报告流：真值先行，随后流式分区（headline → bigThree → modules → transits），最后 complete。
 * 解读阶段的一切失败都收敛为 interpretation-unavailable(reason='model')——真值已经下发，
 * 文案区显示诚实失败卡与重试入口，绝不用任何模板文案冒充产出。
 * 配额与用量通过 createQuotaStream 统一管道托管生命周期。
 */
function createAstrologyReportStream(
  ctx: ReportGenerationContext,
  body: AstrologyReportRequestBody
): ReadableStream<Uint8Array> {
  const requestId = getBillingRequestId(ctx.req, body as Record<string, unknown>);

  // 预解析模型配置供计费上下文与后续解读使用
  let preResolvedConfig: ModelConfig | null = null;
  let preResolvedConfigError: unknown = null;
  try {
    preResolvedConfig = resolveModelConfig(body.provider);
  } catch (error) {
    preResolvedConfigError = error;
  }

  const { control, wrap } = createQuotaStream({
    context: {
      requestId,
      action: 'destiny-report',
      endpoint: '/api/destiny/astrology/report',
      userId: ctx.user.id,
      feature: 'destiny',
      provider: preResolvedConfig?.provider ?? (body.provider || 'doubao'),
      model: preResolvedConfig?.model ?? 'doubao-seed-evolving',
      metadata: {
        reportType: 'astrology',
        timePrecision: body.timePrecision,
        stage: 'final_report',
      },
    },
    logLabel: 'astrology/report',
  });

  const sourceStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sectionsSent = 0;
      // 提升到流作用域：catch 分支需要按"会话是否已绑定"决定是否声明终态
      let session: QuotaSession | null = null;
      const send = (event: AstrologyReportEvent) => {
        if (
          event.type === 'headline' ||
          event.type === 'bigThree' ||
          event.type === 'modules' ||
          event.type === 'transits'
        ) {
          sectionsSent += 1;
        }
        controller.enqueue(encodeSseEvent(event as unknown as Record<string, unknown>));
      };
      let factsDelivered = false;
      try {
        const profile = buildProfileFromRequestBody(body);
        const facts = computeChartFacts(profile);
        send({ type: 'chart-facts', facts });
        factsDelivered = true;

        // ── 解读阶段：模型配置 → 额度预留 → 流式分区 ──
        if (preResolvedConfigError) {
          // 模型未配置属于服务端配置问题：如实告诉用户解读暂不可用，星盘照常
          if (preResolvedConfigError instanceof ModelConfigError) {
            console.error('[astrology/report] 模型配置缺失:', preResolvedConfigError.message);
            send({ type: 'interpretation-unavailable', reason: 'model' });
            send({ type: 'complete' });
            return;
          }
          throw preResolvedConfigError;
        }
        const config = preResolvedConfig!;

        const week = startOfNaturalWeekUtc(Date.now());
        const selectedTransits = selectActiveTransits(facts, {
          weekStartMs: week.startMs,
          weekEndMs: week.endMs,
        });
        const payload = buildAstrologyPromptPayload(facts, {
          timePrecision: profile.timePrecision,
          selectedTransits,
        });
        const transitRefs = new Set(selectedTransits.map((s) => s.refKey));
        const sectionContext: SectionValidationContext = {
          facts,
          allowedRefs: new Set(buildFactReferenceKeys(facts, { transitRefKeys: [...transitRefs] })),
          transitRefs,
          weekRange: formatWeekRange(week.startMs, week.endMs, profile.timezone),
          transitNote: selectedTransits[0]
            ? buildTransitNote({
                transitingBody: selectedTransits[0].fact.transitingBody,
                natalTarget: selectedTransits[0].fact.natalTarget,
                aspect: selectedTransits[0].fact.aspect,
                orb: selectedTransits[0].orb,
              })
            : '',
        };
        const messages = [
          { role: 'system' as const, content: buildAstrologySystemPrompt() },
          {
            role: 'user' as const,
            content: buildAstrologyUserPrompt({
              profile: { name: profile.name, birthDate: profile.birthDate },
              timePrecisionLabel: TIME_PRECISION_LABEL[body.timePrecision],
              cityLabel: profile.city,
              payload,
            }),
          },
        ];

        try {
          session = await QuotaSession.reserve(
            {
              userId: ctx.user.id,
              requestId,
              feature: 'destiny',
              provider: config.provider,
              model: config.model,
              messages,
              maxOutputTokens: ASTROLOGY_REPORT_MAX_OUTPUT_TOKENS,
              metadata: { reportType: 'astrology', timePrecision: body.timePrecision },
            },
            ctx.user.role
          );
          control.bindSession(session);
        } catch (error) {
          if (error instanceof BillingError && error.code === 'QUOTA_INSUFFICIENT') {
            // 额度不足只降级解读层：星盘已下发，前端给锁定卡与额度引导
            send({ type: 'interpretation-unavailable', reason: 'quota' });
            send({ type: 'complete' });
            return;
          }
          throw error;
        }

        await streamInterpretation({
          config,
          messages,
          selectedTransits,
          sectionContext,
          send,
          control,
          outputLimit: session.outputLimit,
        });
      } catch (error) {
        console.error('[astrology/report] 报告流中断:', error);
        if (factsDelivered) {
          // 真值已下发：失败只落在解读层（前端据此显示诚实失败卡 + 重试）
          send({ type: 'interpretation-unavailable', reason: 'model' });
          send({ type: 'complete' });
          // 仅当预留已完成才声明终态；预留前的故障（配置/行运构造等）无会话可结算，静默跳过
          if (session) {
            const reason = error instanceof Error ? error.message : '解读生成中断';
            await control.finish({ outcome: sectionsSent > 0 ? 'partial' : 'failed', reason });
          }
        } else {
          send({
            type: 'error',
            // 只透出本域自述的失败原因，其余异常一律给通用文案（不泄露实现细节）
            message:
              error instanceof AstrologyReportRequestError
                ? error.message
                : '星盘计算失败，请稍后重试',
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return wrap(sourceStream);
}

/** 解读执行：流式读取 → 分区推送 → complete，由外层 quota-stream 统一托管终态结算 */
async function streamInterpretation({
  config,
  messages,
  selectedTransits,
  sectionContext,
  send,
  control,
  outputLimit,
}: {
  config: ModelConfig;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  selectedTransits: ReturnType<typeof selectActiveTransits>;
  sectionContext: SectionValidationContext;
  send: (event: AstrologyReportEvent) => void;
  control: QuotaStreamControl;
  outputLimit: number;
}): Promise<void> {
  const scanner = createReportSectionScanner();
  /** 分区片段 → 校验 → 推送（校验失败抛 AstrologyReportSectionError，走解读层降级） */
  const emitSections = (closed: ClosedSection[]) => {
    for (const section of closed) {
      switch (section.key) {
        case 'headline':
          send({ type: 'headline', headline: parseHeadlineSection(section.raw, sectionContext) });
          break;
        case 'bigThree':
          send({ type: 'bigThree', bigThree: parseBigThreeSection(section.raw, sectionContext) });
          break;
        case 'modules':
          send({ type: 'modules', modules: parseModulesSection(section.raw, sectionContext) });
          break;
        case 'transits':
          send({ type: 'transits', transits: parseTransitsSection(section.raw, sectionContext) });
          break;
      }
    }
  };

  let rawUsage: unknown = null;

  const stream = streamModel({
    config,
    messages,
    temperature: ASTROLOGY_REPORT_TEMPERATURE,
    maxTokens: outputLimit,
    timeoutMs: ASTROLOGY_REPORT_TIMEOUT_MS,
    // 解读是「把已确认事实翻译成生活语言」，不需要深推理：推理摘要会吃掉输出预算，
    // 匿名档（10000 额度）曾因此整额耗尽、一帧正文都出不来（T5 验收实测 reasoning_tokens 占满 max_output_tokens）
    reasoningEffort: 'minimal',
    json: {
      schema: { name: ASTROLOGY_REPORT_SCHEMA_NAME, schema: ASTROLOGY_REPORT_JSON_SCHEMA },
    },
  });

  for await (const event of stream) {
    if (event.type === 'text-delta') {
      control.appendOutputText(event.text);
      emitSections(scanner.push(event.text));
    } else if (event.type === 'done') {
      rawUsage = event.rawUsage;
    } else if (event.type === 'error') {
      throw new ModelUpstreamError(event.error, 502);
    }
  }

  // 收尾：四个分区必须齐备（截断输出 / 校验失败一律诚实降级，不做任何文案兜底）
  emitSections(scanner.push(''));
  const missing = [...scanner.missingKeys(), ...scanner.pendingKeys()];
  if (missing.length > 0) {
    throw new AstrologyReportSectionError('transits', `模型分区输出不完整：缺少 ${missing.join('、')}`);
  }

  // 标记完成并下发 complete 事件；显式触发 success 结算
  send({ type: 'complete' });
  await control.finish({ outcome: 'success', usage: rawUsage });
}
