/**
 * Agent 有界多步自主循环编排器（spec §4 / D-二期-4/5/6/7/8）
 *
 * 流程：
 * 1. 主循环：
 *    - 决策步（streamText + tools，每轮 stopWhen: stepCountIs(1)）
 *    - 决策步文本先缓冲，步末路由：
 *      - 有自有工具调用 → 以 agent_note 事件一次性下发（进过程卡片、不进正文、不入历史持久化）
 *      - 无自有工具调用且有文本 → 以 text-delta 下发（它就是最终回答，降级路径行为不变，循环结束）
 *      - 无自有工具调用且无文本（典型：providerExecuted 搜索被 maxToolCalls 截断）→
 *        不终结，注入仅进模型通道的引导语后续一轮（步数上限兜底）
 *    - 工具顺序执行：成对推送 tool_call / tool_result 事件，支持退化保护与边界封顶
 *    - 工具执行结果回注消息序列 → 继续下一轮决策
 * 2. 收尾步：
 *    - 若达到 maxSteps 上限或因熔断/超限/超时提前退出循环且尚未产出回答，
 *      再调一次不挂 tools 的 streamText（收尾步），强制流式产出最终回答。
 *    - 全程模型调用总数 ≤ maxSteps。
 *
 * 边界四件套（收敛于 agent-config.ts）：
 * - AGENT_MAX_STEPS = 5（最多 4 轮「决策 + 工具」+ 1 次强制收尾步）；
 * - AGENT_MAX_TOOL_CALLS_PER_ROUND = 3（单轮工具上限）；
 * - AGENT_MAX_TOOL_CALLS_TOTAL = 10（每请求全局工具上限）；
 * - AGENT_RUN_TIME_BUDGET_MS = 240s（整请求运行时间预算，决策前与工具执行前双重检查）。
 *
 * 退化保护与专项上限：
 * - 重复调用去重：以「工具名 + 参数稳定序列化」为键缓存首次执行结果，第 2 次相同调用不重新执行，
 *   仍推成对事件，注入模型的内容为缓存结果追加软提示；缓存结果首次已过检，不重复过检；
 * - 连败熔断：全局连续工具失败达到 3 次即跳出循环直接进收尾步；
 * - 出图专项上限：image_generate 每请求硬上限 3 次，第 4 次起走 skip 机制。
 *
 * 传输与协议：
 * - 一期 400 根因 = SDK store:true 默认下把响应历史项序列化为 item_reference，Ark 拒绝（并非 Responses API 不支持多轮）；
 * - 现为 Responses API + 请求内 previous_response_id 链式 + 仅回发增量工具结果；
 * - 本地 currentMessages 全量累积保留为无链（响应无 id）时的发送回退；
 * - 三态判定不变：「有产出」= 正文或工具成功交付产物任一存在，中断/异常按 hasOutput 判 partial/failed；
 * - usage 逐轮累加，漏步时记录警告日志；截断提示（finishReason === 'length'）继续生效；
 * - providerExecuted 工具（web_search）由 Ark 服务端执行，事件直透过程卡片、不计入自有工具上限，按轮由 maxToolCalls 服务端封顶。
 */

import {
  stepCountIs,
  streamText,
  tool,
  zodSchema,
  type ModelMessage,
  type StreamTextResult,
  type ToolSet,
} from 'ai';
import { createProvider, type ProviderName } from '@repo/providers';
import { normalizeUsage } from '@/lib/ai-usage';
import type { Message as ChatMessage } from '@/stores/chat-store';
import { encodeSseEvent } from '../sse';
import { buildChatBlockedText, detectChatSensitiveTopic } from '../chat-safety';
import { resolveChatStreamUsage } from '../chat-usage';
import type { ChatStreamFinish } from '../types';
import { DEFAULT_TOOL_POLICY, runToolWithPolicy, summarizeArgs } from '@/lib/agent/tool-policy';
import {
  AGENT_MAX_CONSECUTIVE_FAILURES,
  AGENT_MAX_IMAGE_GENERATES,
  AGENT_MAX_STEPS,
  AGENT_MAX_TOOL_CALLS_PER_ROUND,
  AGENT_MAX_TOOL_CALLS_TOTAL,
  AGENT_RUN_TIME_BUDGET_MS,
} from './agent-config';
import {
  validateToolArgs,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolRegistry,
} from '@/lib/agent/registry';

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
  /** 最大模型调用步数（默认为 AGENT_MAX_STEPS = 5），为后续自适应降级预留参数面 */
  maxSteps?: number;
  /** 整请求运行时间预算毫秒数（默认为 AGENT_RUN_TIME_BUDGET_MS = 240,000） */
  runTimeBudgetMs?: number;
}

/** 多步 usage 的累加结构（null 表示至今无任何有效 usage） */
interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** 工具执行去重缓存条目 */
interface CachedToolExecution {
  ok: boolean;
  guardedContent: string;
  summaryForDisplay: string;
  attachment?: ToolExecutionResult['attachment'];
}

/** 把 ChatMessage 投影为模型消息（agent 模式暂不支持附件输入，仅保留角色与内容） */
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

/** 从 web_search 的 tool-result output 提取查询词（spike 验证路径 output.action.query；结构缺失时返回 null） */
function extractSearchQuery(output: unknown): string | null {
  if (output && typeof output === 'object') {
    const action = (output as { action?: unknown }).action;
    if (action && typeof action === 'object') {
      const query = (action as { query?: unknown }).query;
      if (typeof query === 'string' && query) return query;
    }
  }
  return null;
}

/** 对任意对象进行 key 排序后的稳定 JSON 序列化，用于工具调用的去重缓存键 */
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableSerialize).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map(
        (key) =>
          JSON.stringify(key) + ':' + stableSerialize((value as Record<string, unknown>)[key])
      )
      .join(',') +
    '}'
  );
}

/**
 * 执行 agent 编排，返回 SSE 字节流（已编码为契约事件）。
 */
export function runAgent(options: AgentRunOptions): ReadableStream<Uint8Array> {
  const { registry, signal, errorId, stepOutputLimit, onFinish } = options;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      /** 全流程累计正文（最终回答文本），用于结算估算与输出合规审计 */
      let text = '';
      /** 全流程累计 usage；null = 无有效 usage（结算侧走估算兜底） */
      let totals: UsageTotals | null = null;
      /** 是否有工具成功产出（生成的图片或抓到的正文）——已随事件下发给用户 */
      let toolProducedOutput = false;
      /** 整请求起始时刻：运行时间预算（AGENT_RUN_TIME_BUDGET_MS）的判定基准 */
      const startedAt = Date.now();

      // 边界与预算计算
      const effectiveMaxSteps = options.maxSteps ?? AGENT_MAX_STEPS;
      const runTimeBudgetMs = options.runTimeBudgetMs ?? AGENT_RUN_TIME_BUDGET_MS;

      // 计数器与缓存
      let totalToolCallsCount = 0;
      let imageGenerateCallsCount = 0;
      // 服务端搜索调用计数，仅观测
      let searchCallsCount = 0;
      let consecutiveToolFailures = 0;
      const toolCache = new Map<string, CachedToolExecution>();

      // 消息序列：随多步循环递增回注
      let currentMessages: ModelMessage[] = toModelMessages(options.messages);
      /** 链式状态：上一步响应 id；null = 未建链/已断链（首步或响应缺 id 时全量发送，与旧行为一致） */
      let previousResponseId: string | null = null;
      /** 链式增量：下一步要回发的消息（通常是上轮工具结果；providerExecuted-only 无文本时为引导语） */
      let pendingIncrement: ModelMessage | null = null;

      /**
       * 组装本步发送载荷：已建链且有增量时只发增量（链式），否则全量 currentMessages
       * （首步或上游响应缺 id 的回退路径，与迁移前行为一致）
       */
      const resolveStepPayload = (): { chained: boolean; messages: ModelMessage[] } => {
        if (previousResponseId !== null && pendingIncrement !== null) {
          return { chained: true, messages: [pendingIncrement] };
        }
        return { chained: false, messages: currentMessages };
      };

      // 最终文本步的 finishReason
      let finalFinishReason = 'stop';
      // 是否已在无工具调用的决策步产出最终回答（无需收尾步）
      let finalAnswerDelivered = false;

      const accumulate = (rawUsage: unknown, step: string) => {
        const n = normalizeUsage(rawUsage);
        if (n.totalTokens === null) {
          // 漏步留痕（B-8）：该步 token 不计入结算（少计费方向，安全侧）
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
       * 全流程是否「有产出」。
       * 判态不能只看正文：工具可能已成功交付产物（如图片），正文为空也必须按 partial/success 计费。
       */
      const hasOutput = () => Boolean(text) || toolProducedOutput;

      try {
        const aiProvider = createProvider(options.provider);
        const agentModel = aiProvider(options.model);

        // 决策步最大轮次：留出至少 1 步作为可能的强制收尾步
        const maxDecisionSteps = Math.max(0, effectiveMaxSteps - 1);
        let roundIndex = 0;

        // ==================== 主循环：决策步 + 工具执行 ====================
        while (roundIndex < maxDecisionSteps) {
          // 每轮决策开始前检查时间预算：耗尽即跳收尾步
          if (Date.now() - startedAt > runTimeBudgetMs) {
            break;
          }
          if (signal.aborted) {
            break;
          }

          roundIndex++;

          const { chained, messages: stepMessages } = resolveStepPayload();

          // 本轮是否出现 providerExecuted（服务端执行）活动：空决策路由的判定依据之一
          let stepSawProviderExecuted = false;

          // 决策步：挂 tools，stopWhen 为 1 步
          const decision: StreamTextResult<ToolSet, any> = streamText<ToolSet>({
            model: agentModel,
            messages: stepMessages,
            tools: {
              ...buildToolSet(registry),
              // Ark 服务端执行的内置联网搜索：不进 ToolRegistry（注册表只管我们执行的工具）
              web_search: aiProvider.tools.webSearch({}),
            },
            stopWhen: stepCountIs(1),
            maxOutputTokens: stepOutputLimit,
            abortSignal: signal,
            providerOptions: {
              openai: {
                ...(chained ? { previousResponseId } : {}),
                maxToolCalls: AGENT_MAX_TOOL_CALLS_PER_ROUND,
              },
            },
          });

          // 决策步文本先缓冲，不直接推 text-delta
          let decisionBufferedText = '';
          for await (const part of decision.fullStream) {
            if (part.type === 'text-delta') {
              decisionBufferedText += part.text;
            }
            if (part.type === 'tool-call' && (part as { providerExecuted?: boolean }).providerExecuted) {
              stepSawProviderExecuted = true;
              // 服务端工具调用开始：直接映射为过程卡片事件（查询词此时还没有，result 才带）
              controller.enqueue(
                encodeSseEvent({
                  type: 'tool_call',
                  call: { id: part.toolCallId, name: part.toolName, argsSummary: '' },
                })
              );
            }
            if (part.type === 'tool-result' && (part as { providerExecuted?: boolean }).providerExecuted) {
              stepSawProviderExecuted = true;
              if (part.toolName === 'web_search') searchCallsCount++;
              const query = extractSearchQuery((part as { output?: unknown }).output);
              controller.enqueue(
                encodeSseEvent({
                  type: 'tool_result',
                  callId: part.toolCallId,
                  name: part.toolName,
                  status: 'success',
                  summary: query ? `查询词：${query}` : '搜索完成',
                })
              );
            }
          }

          const responseId: string | undefined = ((await decision.response) as { id?: string }).id;
          // 缺 id 必须断链回退全量：沿用旧 id 链式发送新工具结果会因 call_id 不在被引链上而被上游拒绝
          previousResponseId = responseId ?? null;

          // providerExecuted 调用由 Ark 服务端执行，不进自有工具管道（不执行/不入去重/不计上限）
          // SDK toolCalls 元素可能未显式声明 providerExecuted，做可选属性类型断言
          const toolCalls = (await decision.toolCalls).filter(
            (c) => !(c as { providerExecuted?: boolean }).providerExecuted
          );
          accumulate(await decision.usage, `decision_${roundIndex}`);
          finalFinishReason = await decision.finishReason;

          // 决策步文本路由
          if (toolCalls.length === 0) {
            if (decisionBufferedText) {
              // 无自有工具调用且有文本：决策步文本即最终回答，降级路径，循环结束
              emitText(decisionBufferedText);
              finalAnswerDelivered = true;
              break;
            }
            if (stepSawProviderExecuted) {
              // providerExecuted-only 且无文本（典型：搜索被 maxToolCalls 按轮截断）：
              // 不终结也不注入空工具消息；补一句仅进模型通道的引导语，续一轮让模型基于
              // 服务端已有的搜索结果作答（由步数上限与时间预算兜底，不会死循环）
              const nudge: ModelMessage = {
                role: 'user',
                content: '（系统提示：搜索已完成，请基于搜索结果直接给出回答，不要再调用工具）',
              };
              pendingIncrement = nudge;
              currentMessages = [...currentMessages, nudge];
              continue;
            }
            // 空决策（无工具、无文本、无服务端搜索）：模型选择不说话，按既有语义收尾——
            // 是否有产出交给 hasOutput 三态判定（工具已交付产物时仍按 success 结算）
            finalAnswerDelivered = true;
            break;
          }

          // 有工具调用：决策步文本以 agent_note 事件下发，绝不进 text-delta
          if (decisionBufferedText) {
            controller.enqueue(encodeSseEvent({ type: 'agent_note', text: decisionBufferedText }));
          }

          // 顺序执行本轮工具调用
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

          for (const [callIndex, call] of toolCalls.entries()) {
            const callId = call.toolCallId;
            const name = call.toolName;
            totalToolCallsCount++;

            // 工具调用事件推送
            controller.enqueue(
              encodeSseEvent({
                type: 'tool_call',
                call: { id: callId, name, argsSummary: summarizeArgs(call.input) },
              })
            );

            // 检查跳过条件（取消 / 全局超限 / 单轮超限 / 时间耗尽 / 出图上限）
            let skipReason: string | null = null;
            let imageCapExceeded = false;
            if (signal.aborted) {
              skipReason = '已取消';
            } else if (totalToolCallsCount > AGENT_MAX_TOOL_CALLS_TOTAL) {
              skipReason = `本次请求累计工具调用数量已达上限（${AGENT_MAX_TOOL_CALLS_TOTAL} 次）`;
            } else if (callIndex >= AGENT_MAX_TOOL_CALLS_PER_ROUND) {
              skipReason = `本轮工具调用数量超过上限（${AGENT_MAX_TOOL_CALLS_PER_ROUND} 次）`;
            } else if (Date.now() - startedAt > runTimeBudgetMs) {
              skipReason = '执行时间超出预算';
            } else if (name === 'image_generate') {
              imageGenerateCallsCount++;
              if (imageGenerateCallsCount > AGENT_MAX_IMAGE_GENERATES) {
                imageCapExceeded = true;
                skipReason = `本次对话的出图次数已用完（${AGENT_MAX_IMAGE_GENERATES} 次）`;
              }
            }

            let outcome: ToolExecutionResult;
            let isCached = false;
            let cachedGuardedContent = '';
            // 首次执行已过检的内容（复用缓存计算结果，避免对同一段内容重复过检）
            let freshGuardedContent = '';

            if (skipReason) {
              if (imageCapExceeded) {
                outcome = {
                  ok: false,
                  contentForModel: `本次对话的出图次数已用完（${AGENT_MAX_IMAGE_GENERATES} 次），请基于已有内容作答`,
                  summaryForDisplay: `未执行：本次对话的出图次数已用完（${AGENT_MAX_IMAGE_GENERATES} 次）`,
                };
              } else {
                outcome = {
                  ok: false,
                  contentForModel: `工具「${name}」未执行：${skipReason}。请在回答中如实告知用户这次调用未执行。`,
                  summaryForDisplay: `未执行：${skipReason}`,
                };
              }
            } else {
              // 退化保护 1：重复调用去重
              const cacheKey = `${name}:${stableSerialize(call.input)}`;
              const cached = toolCache.get(cacheKey);

              if (cached) {
                isCached = true;
                cachedGuardedContent = cached.guardedContent;
                // 重复调用不下发 attachment：首轮已并入消息，重复下发会让前端按新 callId
                // 再渲染同一张图，可见张数破出图上限（评审 D）
                outcome = {
                  ok: cached.ok,
                  contentForModel: cached.guardedContent,
                  summaryForDisplay: cached.summaryForDisplay,
                };
              } else {
                // 首次调用：真实执行工具
                const spec = registry.get(name);
                if (!spec) {
                  outcome = {
                    ok: false,
                    contentForModel: `工具「${name}」不存在，请使用已提供的工具。`,
                    summaryForDisplay: '工具不存在',
                  };
                } else {
                  const validation = validateToolArgs(spec, call.input);
                  outcome = validation.ok
                    ? await runToolWithPolicy(
                        spec,
                        validation.args,
                        toolContext,
                        DEFAULT_TOOL_POLICY
                      )
                    : {
                        ok: false,
                        contentForModel: `工具参数不合法：${validation.reason}。请修正参数后重试。`,
                        summaryForDisplay: `参数不合法：${validation.reason}`,
                      };
                }

                // 首次执行结果过检后存入缓存；同时留存过检后内容，下方回注直接复用（避免二次过检）
                const guarded = guardToolContent(outcome.contentForModel, name);
                freshGuardedContent = guarded;
                toolCache.set(cacheKey, {
                  ok: outcome.ok,
                  guardedContent: guarded,
                  summaryForDisplay: outcome.summaryForDisplay,
                  attachment: outcome.attachment,
                });
              }
            }

            // 工具成功交付产物即视为本轮有产出，且清零连败计数
            if (outcome.ok) {
              toolProducedOutput = true;
              consecutiveToolFailures = 0;
            } else {
              // 失败或被跳过：连败计数递增
              consecutiveToolFailures++;
            }

            // 推送 tool_result 事件
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

            // 组装回注给模型的内容
            let finalModelContent: string;
            if (isCached) {
              // 重复调用：缓存内容追加软提示，不再重复过检
              finalModelContent = `${cachedGuardedContent}\n\n该调用已执行过，结果同前，请基于现有信息作答或调整参数。`;
            } else if (skipReason) {
              finalModelContent = outcome.contentForModel;
            } else {
              // 首次执行：复用上面过检后的内容（不重复过检）
              finalModelContent = freshGuardedContent;
            }

            toolResultParts.push({
              type: 'tool-result',
              toolCallId: callId,
              toolName: name,
              output: { type: 'text', value: finalModelContent },
            });
          }

          // 回注消息序列：包含这轮的 assistant 消息与 tool 结果消息
          const toolMessage: ModelMessage = { role: 'tool', content: toolResultParts };
          pendingIncrement = toolMessage;
          const decisionMessages = (await decision.response).messages;
          currentMessages = [
            ...currentMessages,
            ...decisionMessages,
            toolMessage,
          ];

          // 检查退化保护与边界熔断：连败熔断、全局工具上限、时间耗尽
          if (consecutiveToolFailures >= AGENT_MAX_CONSECUTIVE_FAILURES) {
            break;
          }
          if (totalToolCallsCount >= AGENT_MAX_TOOL_CALLS_TOTAL) {
            break;
          }
          if (Date.now() - startedAt > runTimeBudgetMs) {
            break;
          }
        }

        // ==================== 收尾步（若仍需收尾） ====================
        if (!finalAnswerDelivered) {
          const { chained, messages: summaryMessages } = resolveStepPayload();

          // 收尾步不挂 tools，强制产出最终文本回答
          const summary = streamText({
            model: agentModel,
            messages: summaryMessages,
            maxOutputTokens: stepOutputLimit,
            abortSignal: signal,
            providerOptions: {
              openai: {
                ...(chained ? { previousResponseId } : {}),
              },
            },
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
        // 输出被 maxOutputTokens 截断时显式提示警告（B-3）
        if (finalFinishReason === 'length') {
          controller.enqueue(
            encodeSseEvent({ type: 'warning', warning: '回答在此处被截断，内容可能不完整' })
          );
        }

        // 判定是否有产出（正文或工具交付产物任一存在）
        const produced = hasOutput();
        await onFinish({
          outcome: produced ? 'success' : 'failed',
          usage: totals,
          outputText: text,
          searchCalls: searchCallsCount,
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
        // 中断或异常同样以「有产出」判 partial：工具已交付产物的轮次不得整轮退款
        await onFinish({
          outcome: hasOutput() ? 'partial' : 'failed',
          usage: totals,
          outputText: text,
          reason,
          searchCalls: searchCallsCount,
        });
        try {
          controller.enqueue(encodeSseEvent({ type: 'error', error: reason || '生成失败，请重试' }));
        } catch {
          // 流已被消费者取消（用户中断）：忽略入队异常
        }
        try {
          controller.close();
        } catch {
          // 忽略关闭异常
        }
      }
    },
  });
}
