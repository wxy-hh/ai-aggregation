/**
 * route.ts —— POST /api/destiny/astrology/copilot（星语问答，SSE）
 *
 * 报告完成后的追问：请求携带报告上下文（盘面事实 + 生活模块）与用户问题，服务端按解读同一份
 * 事实层口径组装提示词，流式返回答案与引用（协议见 lib/astrology/qa-events.ts）。
 *
 * 事件顺序：
 *   正常回答：text-delta…（正文增量）→ answer（完整回答 + 白名单收敛后的引用）
 *   敏感拦截：answer（kind='blocked'，安全话术与自我观察方向）——确定性规则命中，不过 LLM、不计费
 *   失败：error（中文说明，此后流关闭）
 *
 * 前置拦截顺序（铁律）：
 * 1. 请求体校验（400）→ 2. 敏感话题（医疗/财务/法律）确定性拦截（不预留额度、不调用模型）
 *    → 3. 模型配置 → 4. 额度预留 → 5. 流式回答。
 * 次数不设每报告上限：能问几次只由账号额度决定（额度不足即下面的 402，前端弹既有额度对话框）。
 *
 * 额度与生命周期（收敛至 QuotaSession 统一决策表与 withQuotaStream 管道）：
 * - 提问前由 QuotaSession.reserve 预留配额（管理员跳过，免预留）；
 * - 成功按真实 usage 结算；流失败或截断按 partial 部分结算，一个字没出整额释放；
 * - 预留不足（BillingError QUOTA_INSUFFICIENT）按既有口径返回 402，由前端唤起额度引导。
 *
 * 回答质量与合规：
 * - citations 只认事实层白名单与报告里确实存在的模块（编造键一律丢弃，界面引用片可点）；
 * - 降级档（无宫位盘）被隐藏的上升/天顶/宫位/不稳定行星不进提示词（与解读同一事实层负载）；
 * - 不绝对化：提示词禁止「一定/必然/注定/绝对/永远」与确定性预测，模板文案永不冒充产出。
 */

import {
  ModelConfigError,
  ModelUpstreamError,
  resolveModelConfig,
  streamModel,
  type ModelConfig,
} from '@repo/shared';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { encodeSseEvent, SSE_HEADERS } from '@/lib/utils/sse';
import { buildFactReferenceKeys } from '@/lib/astrology/interpretation';
import { buildQaCitations } from '@/lib/astrology/qa-events';
import { startOfNaturalWeekUtc } from '@/lib/astrology/chart-engine';
import { selectActiveTransits } from '@/lib/astrology/transit-selection';
import { QuotaSession } from '@/lib/billing/quota-session';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import {
  createQuotaStreamReporter,
  withQuotaStream,
  type QuotaStreamSessionReporter,
} from '../../_lib/report-generation';
import { buildAstrologyPromptPayload } from '../_lib/astrology-prompt';
import {
  AstrologyQaAnswerError,
  createAnswerTextScanner,
  parseAnswerJson,
} from '../_lib/astrology-qa-answer';
import {
  ASTROLOGY_QA_JSON_SCHEMA,
  ASTROLOGY_QA_SCHEMA_NAME,
} from '../_lib/astrology-qa-json-schema';
import {
  buildAstrologyQaSystemPrompt,
  buildAstrologyQaUserPrompt,
} from '../_lib/astrology-qa-prompt';
import {
  AstrologyQaRequestSchema,
  resolveQaTimePrecision,
  type AstrologyQaRequestBody,
} from '../_lib/astrology-qa-request';
import { buildBlockedAnswer, detectSensitiveTopic } from '../_lib/astrology-qa-safety';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 问答调参（与八字 copilot 同档；不做导出——Next.js 的 route 文件只允许导出约定成员，
 * 测试按行为断言）。
 */
const ASTROLOGY_QA_TIMEOUT_MS = 55_000;
/** 输出上限（工单起步值 2048；余额不足时由预留返回的 outputLimit 收紧） */
const ASTROLOGY_QA_MAX_OUTPUT_TOKENS = 2048;
/** 问答温度偏低：保事实忠实（与报告解读 0.7 分档，工单要求） */
const ASTROLOGY_QA_TEMPERATURE = 0.3;

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    let session: QuotaSession | null = null;

    try {
      const body = await req.json();
      const parsed = AstrologyQaRequestSchema.safeParse(body);
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

      const { report, question, provider } = parsed.data;

      // 次数只受账号额度约束（下方额度预留），不再设每报告上限

      // 敏感话题（医疗 / 财务 / 法律）确定性前置拦截：不过 LLM、不预留额度、不计费
      const sensitiveTopic = detectSensitiveTopic(question);
      if (sensitiveTopic) {
        const answer = buildBlockedAnswer(sensitiveTopic, report.modules);
        return new Response(createBlockedStream(answer), { headers: SSE_HEADERS });
      }

      let config: ModelConfig;
      try {
        config = resolveModelConfig(provider);
      } catch (error) {
        if (error instanceof ModelConfigError) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        throw error;
      }

      // 事实层负载与解读同源：降级档被隐藏的字段不进提示词
      const timePrecision = resolveQaTimePrecision(parsed.data);
      const week = startOfNaturalWeekUtc(Date.now());
      const selectedTransits = selectActiveTransits(report.facts, {
        weekStartMs: week.startMs,
        weekEndMs: week.endMs,
      });
      const payload = buildAstrologyPromptPayload(report.facts, {
        timePrecision,
        selectedTransits,
      });
      const allowedRefs = new Set(
        buildFactReferenceKeys(report.facts, {
          transitRefKeys: selectedTransits.map((item) => item.refKey),
        })
      );
      const messages = [
        { role: 'system' as const, content: buildAstrologyQaSystemPrompt() },
        {
          role: 'user' as const,
          content: buildAstrologyQaUserPrompt({
            question,
            payload,
            modules: report.modules.map((module) => ({
              id: module.id,
              title: module.title,
              summary: module.summary,
              action: module.action,
            })),
          }),
        },
      ];

      const requestId = getBillingRequestId(req, body as Record<string, unknown>);

      // 额度预留（管理员跳过扣费，保留用量会话归档）
      session = await QuotaSession.reserve(
        {
          userId: user.id,
          requestId,
          feature: 'destiny',
          provider: config.provider,
          model: config.model,
          messages,
          maxOutputTokens: ASTROLOGY_QA_MAX_OUTPUT_TOKENS,
          metadata: { reportType: 'astrology', stream: true },
        },
        user.role
      );

      const reporter = createQuotaStreamReporter();
      const rawStream = createQaStream({
        config,
        messages,
        facts: report.facts,
        modules: report.modules,
        allowedRefs,
        outputLimit: session.outputLimit,
        reporter,
      });

      const quotaManagedStream = withQuotaStream(
        rawStream,
        {
          session,
          context: {
            requestId,
            action: 'destiny-copilot',
            endpoint: '/api/destiny/astrology/copilot',
            userId: user.id,
            feature: 'destiny',
            provider: config.provider,
            model: config.model,
            metadata: {
              reportType: 'astrology',
              stream: true,
              questionLength: question.length,
            },
          },
          logLabel: 'astrology/copilot',
        },
        reporter
      );

      return new Response(quotaManagedStream, { headers: SSE_HEADERS });
    } catch (error) {
      if (session) {
        await session.release({ reason: '星语问答请求失败', meterType: 'tokens' });
      }
      if (error instanceof AuthError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.code === 'FORBIDDEN' ? 403 : 401 }
        );
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json({ error: '问答超时，请稍后重试' }, { status: 504 });
      }
      if (error instanceof BillingError) return billingErrorResponse(error);
      console.error('[astrology/copilot] 问答请求失败:', error);
      return NextResponse.json({ error: '问答失败，请稍后重试' }, { status: 500 });
    }
  });
}

/** 敏感拦截流：只推一个正常回答帧（前端无协议分支），随流关闭 */
function createBlockedStream(answer: ReturnType<typeof buildBlockedAnswer>) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encodeSseEvent({ type: 'answer', answer } as unknown as Record<string, unknown>)
      );
      controller.close();
    },
  });
}

/**
 * 问答流：正文增量边流边推，终帧给出完整回答与白名单收敛后的引用。
 * 外部管道 withQuotaStream 统一托管三态结算与异常释放。
 */
function createQaStream({
  config,
  messages,
  facts,
  modules,
  allowedRefs,
  outputLimit,
  reporter,
}: {
  config: ModelConfig;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  facts: AstrologyQaRequestBody['report']['facts'];
  modules: AstrologyQaRequestBody['report']['modules'];
  allowedRefs: Set<string>;
  outputLimit: number;
  reporter: QuotaStreamSessionReporter;
}) {
  return new ReadableStream<Uint8Array>({
    async start(streamController) {
      const scanner = createAnswerTextScanner();

      try {
        const stream = streamModel({
          config,
          messages,
          temperature: ASTROLOGY_QA_TEMPERATURE,
          maxTokens: outputLimit,
          timeoutMs: ASTROLOGY_QA_TIMEOUT_MS,
          // 同报告路由：问答取「引用事实后作答」，不需要深推理，推理摘要会挤掉正文预算
          reasoningEffort: 'minimal',
          json: {
            schema: { name: ASTROLOGY_QA_SCHEMA_NAME, schema: ASTROLOGY_QA_JSON_SCHEMA },
          },
        });

        for await (const event of stream) {
          if (event.type === 'text-delta') {
            reporter.appendOutputText(event.text);
            const delta = scanner.push(event.text);
            if (delta) {
              streamController.enqueue(encodeSseEvent({ type: 'text-delta', text: delta }));
            }
          } else if (event.type === 'done') {
            reporter.setUsage(event.rawUsage);
          } else if (event.type === 'error') {
            throw new ModelUpstreamError(event.error, 502);
          }
        }

        // 终局解析：正文与引用键必须齐备，否则诚实报错（不做任何文案兜底）
        const parsed = parseAnswerJson(scanner.raw());
        const citations = buildQaCitations(parsed.citations, {
          facts,
          allowedRefs,
          modules: modules.map((module) => ({ id: module.id, title: module.title })),
        });
        streamController.enqueue(
          encodeSseEvent({
            type: 'answer',
            answer: { kind: 'answer', text: parsed.text, citations },
          } as unknown as Record<string, unknown>)
        );
        reporter.markCompleted();
      } catch (error) {
        const message =
          error instanceof ModelUpstreamError || error instanceof AstrologyQaAnswerError
            ? error.message
            : error instanceof Error && error.name === 'AbortError'
              ? '问答超时，请稍后重试'
              : '问答失败，请稍后重试';
        streamController.enqueue(
          encodeSseEvent({
            type: 'error',
            error: message,
          } as unknown as Record<string, unknown>)
        );
      } finally {
        streamController.close();
      }
    },
  });
}
