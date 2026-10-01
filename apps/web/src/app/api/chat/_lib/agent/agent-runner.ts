/**
 * Agent 两段式编排（spec §4）
 *
 * 流程：决策步（streamText + tools，maxSteps=1）
 *      → 有工具调用：顺序执行 → 推 tool_call / tool_result 事件 → 总结步（无 tools）
 *      → 无工具调用：决策步文本即回答（降级路径，对用户无感）
 *
 * 边界（一期）：
 * - 不转发推理流（reasoning-delta）—— 推理过程展示是二期议题（spec §5.6 预留通道）；
 * - 决策步的正文照常透传：模型若先说「我查一下」再调工具，该句自然成为过程前言；
 * - 多工具调用顺序执行（spec §7），并行为二期；
 * - 三态判定的「有产出」= 正文 **或** 工具成功交付的产物（图片/网页正文）任一存在；
 *   两者皆无才落 failed。只看正文会让「工具已出图、正文为空」的轮次被判 failed，
 *   而 failed 在 QuotaSession 里走 release＝全额退款，等于白送上游成本与产物；
 * - 结算只由调用方（handler 侧 QuotaSession）负责，本模块只通过 onFinish 上报完成态。
 */

import { stepCountIs, streamText, tool, zodSchema, type ModelMessage, type ToolSet } from 'ai';
import { createProvider } from '@repo/providers';
import { normalizeUsage } from '@/lib/ai-usage';
import type { Message as ChatMessage } from '@/stores/chat-store';
import { encodeSseEvent } from '../sse';
import { buildChatBlockedText, detectChatSensitiveTopic } from '../chat-safety';
import { resolveChatStreamUsage } from '../chat-usage';
import type { ChatStreamFinish } from '../types';
import { DEFAULT_TOOL_POLICY, runToolWithPolicy, summarizeArgs } from './tool-policy';
import { AGENT_MAX_TOOL_CALLS_PER_ROUND, AGENT_ROUND_TIME_BUDGET_MS } from './agent-config';
import {
  validateToolArgs,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolRegistry,
} from './tools/registry';
import type { ProviderName } from '@repo/providers';

export interface AgentRunOptions {
  userId: string;
  provider: ProviderName;
  model: string;
  messages: ChatMessage[];
  /** 单步输出上限（预留总量由 handler 侧按步数系数放大） */
  stepOutputLimit: number;
  signal: AbortSignal;
  errorId: string;
  registry: ToolRegistry;
  onFinish: (finish: ChatStreamFinish) => Promise<void>;
}

/** 两步 usage 的累加结构（null 表示至今无任何有效 usage） */
interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** 把 ChatMessage 投影为模型消息（agent 一期不支持附件输入，只取 role/content） */
function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }) as ModelMessage);
}

/** 把注册表投影为 AI SDK 的工具集；不提供 execute —— SDK 停在 tool-call，由本编排器执行 */
function buildToolSet(registry: ToolRegistry): ToolSet {
  const set: ToolSet = {};
  for (const spec of registry.list()) {
    set[spec.name] = tool({
      description: spec.description,
      inputSchema: zodSchema(spec.parameters),
    });
  }
  return set;
}

/** 工具结果注入模型前的合规检查（spec §5.5 检查点 2） */
function guardToolContent(content: string, toolName: string): string {
  const topic = detectChatSensitiveTopic(content);
  if (!topic) return content;
  console.warn('[agent] 工具结果命中合规拦截', { tool: toolName, topic });
  return `${buildChatBlockedText(topic)}\n（以上内容来自工具抓取，已被安全策略拦截）`;
}

/**
 * 执行 agent 编排，返回 SSE 字节流（已编码为契约事件）。
 */
export function runAgent(options: AgentRunOptions): ReadableStream<Uint8Array> {
  const { registry, signal, errorId, stepOutputLimit, onFinish } = options;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      /** 全流程累计正文（决策步 + 总结步），用于结算估算与输出合规审计 */
      let text = '';
      /** 两步 usage 累加；null = 无有效 usage（结算侧走估算兜底） */
      let totals: UsageTotals | null = null;
      /** 是否有工具**成功**产出（生成的图片 / 抓到的正文）——这些已随事件下发给用户 */
      let toolProducedOutput = false;
      /** 整轮起始时刻：wall-clock 预算（AGENT_ROUND_TIME_BUDGET_MS）的判定基准 */
      const startedAt = Date.now();

      const accumulate = (rawUsage: unknown, step: string) => {
        const n = normalizeUsage(rawUsage);
        if (n.totalTokens === null) {
          // 漏步留痕（B-8）：该步 token 不计入结算（少计费方向，安全侧）；
          // 二期多步循环放量前需补「漏步估算兜底」，否则单步 usage 缺失会被静默吞掉
          console.warn('[agent] 某步缺少 usage 数据，该步不计入结算', { errorId, step });
          return;
        }
        totals = {
          inputTokens: (totals?.inputTokens ?? 0) + (n.inputTokens ?? 0),
          outputTokens: (totals?.outputTokens ?? 0) + (n.outputTokens ?? 0),
          totalTokens: (totals?.totalTokens ?? 0) + (n.totalTokens ?? 0),
        };
      };

      const emitText = (chunk: string) => {
        if (!chunk) return;
        text += chunk;
        controller.enqueue(encodeSseEvent({ type: 'text-delta', text: chunk }));
      };

      /**
       * 本轮是否「有产出」。
       *
       * 判态不能只看正文：工具可能已经把图片生成出来、把网页抓下来并**随 tool_result 下发给用户**，
       * 此时正文为空（用户拿到图就按了停止，或总结步没来得及产出）也必须按 partial/success 计费。
       * 否则 `failed` 会走 QuotaSession.release 全额退款，而上游成本与交付物都已经真实发生。
       * 口径与前端 chat-store 的 hasRetainableContent（content || reasoningContent || toolCalls）对齐。
       */
      const hasOutput = () => Boolean(text) || toolProducedOutput;

      try {
        const aiProvider = createProvider(options.provider);
        /**
         * 必须走 **Chat Completions**（`provider.chat(...)`），不能用默认的 `provider(...)`。
         *
         * `@ai-sdk/openai` 的默认可调用形式走 Responses API（`/responses`）：决策步能跑通，
         * 但总结步要把 `decision.response.messages` 回传给上游时，SDK 会把它序列化成
         * `item_reference`（引用服务端 item id）——方舟 Responses API 不支持该字段，直接 400：
         *   `The parameter \`input\` specified in the request are not valid: \`<nil>\``
         * 结果是「工具执行成功、图片也生成了，但总结步必失败」，整轮按失败收尾。
         *
         * Chat Completions 路径按常规 messages 数组传递，已实测两步式可用。
         * 复现脚本：docs/features/2026-10-01-chat-agent-tools/verify-two-step-summary.mjs
         */
        const agentModel = aiProvider.chat(options.model);

        // ==================== 决策步 ====================
        const decision = streamText({
          model: agentModel,
          messages: toModelMessages(options.messages),
          tools: buildToolSet(registry),
          stopWhen: stepCountIs(1),
          maxOutputTokens: stepOutputLimit,
          abortSignal: signal,
        });

        for await (const part of decision.fullStream) {
          if (part.type === 'text-delta') {
            emitText(part.text);
          }
        }

        const toolCalls = await decision.toolCalls;
        accumulate(await decision.usage, 'decision');
        // 降级路径（不调工具）时决策步即最终回答；有工具时会被总结步的 finishReason 覆盖
        let finalFinishReason = await decision.finishReason;

        // ==================== 工具执行 + 总结步 ====================
        if (toolCalls.length > 0) {
          const toolContext: ToolExecutionContext = {
            userId: options.userId,
            signal,
            errorId,
          };
          const toolResultParts: Array<{
            type: 'tool-result';
            toolCallId: string;
            toolName: string;
            output: { type: 'text'; value: string };
          }> = [];

          // 顺序执行（一期约定）；每个调用的过程事件成对推送
          for (const [index, call] of toolCalls.entries()) {
            const callId = call.toolCallId;
            const name = call.toolName;

            // 不真跑的三类情形（B-1）：用户已中断 / 超单轮数量上限 / 整轮时间预算耗尽。
            // 这些调用仍推成对事件、并给模型一条「未执行」结果 —— 每个 tool_call 都必须有
            // 对应的 tool-result，否则总结步的消息序列不完整（上游会 400）。
            const skipReason = signal.aborted
              ? '已取消'
              : index >= AGENT_MAX_TOOL_CALLS_PER_ROUND
                ? `本轮工具调用数量超过上限（${AGENT_MAX_TOOL_CALLS_PER_ROUND} 次）`
                : Date.now() - startedAt > AGENT_ROUND_TIME_BUDGET_MS
                  ? '本轮执行时间超出预算'
                  : null;

            controller.enqueue(
              encodeSseEvent({
                type: 'tool_call',
                call: { id: callId, name, argsSummary: summarizeArgs(call.input) },
              })
            );

            let outcome: ToolExecutionResult;

            if (skipReason) {
              outcome = {
                ok: false,
                contentForModel: `工具「${name}」未执行：${skipReason}。请在回答中如实告知用户这次调用未执行。`,
                summaryForDisplay: `未执行：${skipReason}`,
              };
            } else {
              const spec = registry.get(name);

              if (!spec) {
                // 模型幻觉出一个未注册的工具：按失败处理并如实告知
                outcome = {
                  ok: false,
                  contentForModel: `工具「${name}」不存在，请使用已提供的工具。`,
                  summaryForDisplay: '工具不存在',
                };
              } else {
                const validation = validateToolArgs(spec, call.input);
                outcome = validation.ok
                  ? await runToolWithPolicy(spec, validation.args, toolContext, DEFAULT_TOOL_POLICY)
                  : {
                      ok: false,
                      contentForModel: `工具参数不合法：${validation.reason}。请修正参数后重试。`,
                      summaryForDisplay: `参数不合法：${validation.reason}`,
                    };
              }
            }

            // 工具成功即视为「本轮有产出」：图片/正文已随上面的 tool_result 下发给用户
            if (outcome.ok) toolProducedOutput = true;

            // 产物附件（如生成的图片）随事件下发 —— 与「不下发完整结果」的约定不冲突：
            // 它是给用户看的产物本身，而非大段可泄密的正文
            controller.enqueue(
              encodeSseEvent({
                type: 'tool_result',
                callId,
                name,
                status: outcome.ok ? 'success' : 'failed',
                summary: outcome.summaryForDisplay,
                ...(outcome.attachment ? { attachment: outcome.attachment } : {}),
              })
            );

            toolResultParts.push({
              type: 'tool-result',
              toolCallId: callId,
              toolName: name,
              // 合规检查点 2：注入模型前拦截
              output: { type: 'text', value: guardToolContent(outcome.contentForModel, name) },
            });
          }

          // 总结步：带上决策步的 assistant 消息与工具结果，不再挂 tools（避免二次调用）
          const decisionMessages = (await decision.response).messages;
          const summary = streamText({
            model: agentModel,
            messages: [
              ...toModelMessages(options.messages),
              ...decisionMessages,
              { role: 'tool', content: toolResultParts },
            ],
            maxOutputTokens: stepOutputLimit,
            abortSignal: signal,
          });

          for await (const part of summary.fullStream) {
            if (part.type === 'text-delta') {
              emitText(part.text);
            }
          }
          accumulate(await summary.usage, 'summary');
          finalFinishReason = await summary.finishReason;
        }

        // ==================== 完成态上报 ====================
        // 单步输出被 maxOutputTokens 截断时显式提示（B-3）：agent 单步上限被压到预留的一半，
        // 长文总结最易命中；与适配器路径同一文案/通道，否则用户静默拿到半截回答。
        if (finalFinishReason === 'length') {
          controller.enqueue(
            encodeSseEvent({ type: 'warning', warning: '回答在此处被截断，内容可能不完整' })
          );
        }

        // 有产出（正文 或 工具已成功交付产物）即视为成功；
        // 两者皆无（模型空输出）才按失败释放预留。
        const produced = hasOutput();
        await onFinish({
          outcome: produced ? 'success' : 'failed',
          usage: totals,
          outputText: text,
          ...(produced ? {} : { reason: 'agent 未产生任何回答内容' }),
        });

        if (produced) {
          const normalized = totals ? normalizeUsage(totals) : null;
          controller.enqueue(
            encodeSseEvent({
              type: 'done',
              usage: resolveChatStreamUsage(normalized, options.messages, text),
            })
          );
        } else {
          controller.enqueue(encodeSseEvent({ type: 'error', error: '模型未返回任何内容，请重试' }));
        }
        controller.close();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn('[agent] 编排失败', { errorId, reason });
        // 中断/异常同样以「有产出」判 partial：工具已交付产物的轮次不得整轮退款
        await onFinish({
          outcome: hasOutput() ? 'partial' : 'failed',
          usage: totals,
          outputText: text,
          reason,
        });
        try {
          controller.enqueue(encodeSseEvent({ type: 'error', error: reason || '生成失败，请重试' }));
        } catch {
          // 流已被消费者取消（用户中断）：忽略入队异常
        }
        try {
          controller.close();
        } catch {
          // 同上
        }
      }
    },
  });
}
