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
 * 工具治理（去重缓存 / 单轮、全局、出图三重上限 / 连败熔断 / 时间预算 / 合规二道检查 /
 * 重试引导）已收敛于深模块 ToolExecutionPipeline（lib/agent/tool-pipeline.ts，ADR-0008）；
 * 服务端工具（web_search）与自有工具在流层的统一投影与动作契约规约已收敛于
 * 适配器 ToolStreamProjector（lib/agent/tool-projector.ts，ADR-0009）：
 * 编排器完全消除对 providerExecuted 与查询词提取的特异分支与类型断言。
 *
 * 链式调用状态（previous_response_id 追踪、增量推演与无 ID 断链自愈全量回退）已收敛于
 * 深模块 ChainedMessageSession（lib/agent/chained-session.ts，ADR-0010）：
 * 编排器完全消除对 previousResponseId、pendingIncrement 与 currentMessages 的散落维护。
 *
 * 传输与协议：
 * - 一期 400 根因 = SDK store:true 默认下把响应历史项序列化为 item_reference，Ark 拒绝（并非 Responses API 不支持多轮）；
 * - 现为 Responses API + 请求内 previous_response_id 链式 + 仅回发增量工具结果；
 * - 本地全量累积历史由会话深模块维护，作为无链（响应无 id）时的发送回退与断链自愈依据；
 * - 三态判定不变：「有产出」= 正文或工具成功交付产物任一存在，中断/异常按 hasOutput 判 partial/failed；
 * - usage 逐轮累加，漏步时记录警告日志；截断提示（finishReason === 'length'）继续生效。
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
import {
  getCapabilityPack,
  createArtifactStreamExtractor,
  type AgentPlan,
  type PlanStepStatus,
  updatePlanStepStatus,
  attachToolCallToRunningStep,
  finalizePlanExecution,
} from '@repo/shared';
import { generateAgentPlan } from './planner';
import { normalizeUsage } from '@/lib/ai-usage';
import type { Message as ChatMessage } from '@/stores/chat-store';
import { encodeSseEvent } from '../sse';
import { buildChatBlockedText, detectChatSensitiveTopic } from '../chat-safety';
import { resolveChatStreamUsage } from '../chat-usage';
import type { ChatStreamFinish } from '../types';
import { summarizeArgs } from '@/lib/agent/tool-policy';
import { createToolExecutionPipeline } from '@/lib/agent/tool-pipeline';
import { projectDecisionStream, type RawToolCall } from '@/lib/agent/tool-projector';
import { createChainedMessageSession } from '@/lib/agent/chained-session';
import {
  AGENT_MAX_CONSECUTIVE_FAILURES,
  AGENT_MAX_IMAGE_GENERATES,
  AGENT_MAX_STEPS,
  AGENT_MAX_TOOL_CALLS_PER_ROUND,
  AGENT_MAX_TOOL_CALLS_TOTAL,
  AGENT_RUN_TIME_BUDGET_MS,
  AGENT_SUMMARY_OUTPUT_LIMIT,
} from './agent-config';
import type { ToolRegistry } from '@/lib/agent/registry';
import type { ObservabilityTrace } from '@/lib/observability/langfuse-client';
import type { AgentRuntimeContext } from './runtime-context';

export interface AgentRunOptions {
  userId: string;
  provider: ProviderName;
  model: string;
  messages: ChatMessage[];
  /** 单步输出上限（预留总量由 handler 侧按步数系数放大） */
  stepOutputLimit: number;
  /** 收尾步输出上限（用于长篇技术研报/完整交付物，默认 8192） */
  summaryOutputLimit?: number;
  signal: AbortSignal;
  errorId: string;
  /**
   * 运行时上下文（ADR-0011）：工具注册表与完成态观测元数据的唯一来源。
   * 编排器只经此窄接口取注册表与产出 webhookCalls，不接触工具装配细节。
   */
  runtime: AgentRuntimeContext;
  onFinish: (finish: ChatStreamFinish) => Promise<void>;
  /** 最大模型调用步数（默认为 AGENT_MAX_STEPS = 5），为后续自适应降级预留参数面 */
  maxSteps?: number;
  /** 整请求运行时间预算毫秒数（默认为 AGENT_RUN_TIME_BUDGET_MS = 240,000） */
  runTimeBudgetMs?: number;
  /** 绑定的场景能力包 key（ADR-0014 / 工单 01） */
  capabilityPack?: string;
  /** 专属系统提示词（如能力包系统提示词；未传时自动按 capabilityPack 解析） */
  systemPrompt?: string;
  /** 会话级临时停用的工具键名列表（ADR-0014 / 工单 02） */
  disabledToolKeys?: string[];
  /** 是否开启深度思考模式（ADR-0016 / 工单 03） */
  thinking?: boolean;
  /** 可选的可观测性 Root Trace 实例（工单 01 观测底座接入） */
  trace?: ObservabilityTrace;
  /** 产物上下文注入文本（ADR-0037 §4，服务端复核后生成）：仅追加到当次系统提示词 */
  artifactContextPrompt?: string;
  /** 是否开启前置规划阶段（ADR-0038 / AGENT-PLAN-DAG，默认 true） */
  enablePlanning?: boolean;
}

/**
 * 交付物与产物规范提示词（ADR-0037）：
 * 产物输出格式 + 修改既有产物时的 identifier 沿用、章节补丁、另起文档与工作台关闭约束。
 */
export const ARTIFACT_GUIDELINE = `【交付物与产物规范】：当回答包含长篇分析研报（>500字）、对比表格、完整代码文件时，请将其作为独立产物（Artifact）输出。格式：<artifact identifier="唯一英文ID" type="markdown|table|code" title="中文标题" language="可选语言">正文</artifact>。在标签外部仅输出简短导引说明（例如「报告已整理在右侧工作台」），不重复铺陈长文。
修改已有产物时遵守：
1. 修改已有产物必须沿用其原 identifier，不要换新 ID；
2. 对带标题结构的 Markdown 长文，只改动被要求修改的章节：输出 <artifact identifier="原ID" type="markdown" title="原标题" section="## 标题行">，其中 section 必须从「标题目录」中原样抄写该标题行（含 # 号与全部文字，不得改写），标签内容以该标题行开头、只包含被修改的章节（含其子章节），不要输出未修改的章节；需修改多个章节时输出多个带 section 的产物标签；
3. 代码、表格或没有标题结构的短文，沿用原 identifier 整篇输出完整新版本，不使用 section；
4. 用户要求「另起一份」「新建」「英文版」等独立文档时，使用全新的 identifier，不要覆盖原产物；
5. 工作台未展开时你看不到产物正文，不得凭空重写已有产物，应提示用户先打开右侧工作台并聚焦该产物。`;

/** 多步 usage 的累加结构（null 表示至今无任何有效 usage） */
interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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
  const { runtime, signal, errorId, stepOutputLimit, onFinish } = options;
  const registry = runtime.registry;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      /** 全流程累计正文（最终回答文本），用于结算估算与输出合规审计 */
      let text = '';
      /** 全流程累计 usage；null = 无有效 usage（结算侧走估算兜底） */
      let totals: UsageTotals | null = null;
      /** 是否有工具成功产出（生成的图片或抓到的正文）——已随事件下发给用户 */
      let toolProducedOutput = false;
      /** 当前计划卡片状态机实体 (ADR-0038 / AGENT-PLAN-DAG) */
      let currentPlan: AgentPlan | null = null;
      /** 整请求起始时刻：运行时间预算（AGENT_RUN_TIME_BUDGET_MS）的判定基准 */
      const startedAt = Date.now();

      // 边界与预算计算（支持能力包自适应扩容，ADR-0014 / 工单 01）
      const pack = getCapabilityPack(options.capabilityPack);
      const basePrompt = options.systemPrompt ?? pack?.systemPrompt;
      const searchGuideline = `【联网检索与精读协同规范 (ADR-0017)】：
1. 查询新闻、时效线索、最新价格或官方文档时，必须优先使用 web_search 工具输入关键词 Query，严禁使用 web_fetch 抓取搜索引擎结果页（如 bing/duckduckgo/google/baidu）。
2. 高效两步收敛：先用 web_search 检索获取权威线索与 URL；若搜索摘要已足够详尽，直接组织最终回答；若需要深读官方定价表或具体细则，挑选 1~2 个最权威的官方 URL 使用 web_fetch 进行单页精读。
3. 避免过度循环：单次任务尽量在 1~3 次工具调用内快速收敛，组织出完整、详实、重点突出的最终专业回答。`;
      // 产物上下文仅追加到当次请求的系统提示词，不进入消息历史、不落库（ADR-0037 §4）
      const guidelineParts = [basePrompt, searchGuideline, ARTIFACT_GUIDELINE, options.artifactContextPrompt];
      const effectiveSystemPrompt = guidelineParts.filter(Boolean).join('\n\n');
      const effectiveMaxSteps = options.maxSteps ?? pack?.maxSteps ?? AGENT_MAX_STEPS;
      const runTimeBudgetMs = options.runTimeBudgetMs ?? AGENT_RUN_TIME_BUDGET_MS;
      const disabledSet = new Set(options.disabledToolKeys ?? []);
      const canUseWebSearch =
        (!pack || pack.toolWhitelist.includes('web_search')) && !disabledSet.has('web_search');
      // 自适应工具挂载（ADR-0016）：web_search 为火山方舟 Ark 专属服务端工具，仅在 doubao 供应方下挂载
      const canUseArkWebSearch = options.provider === 'doubao' && canUseWebSearch;

      // 流式产物标签抽取器（ADR-0015）
      const artifactExtractor = createArtifactStreamExtractor();

      // P1 工单 02：收集运行记录审计元数据（ADR-0015）
      const recordedToolCalls: NonNullable<ChatStreamFinish['toolCalls']> = [];
      const recordedArtifactRefs: NonNullable<ChatStreamFinish['artifactRefs']> = [];

      // 服务端搜索调用计数，仅观测
      let searchCallsCount = 0;

      // 工具执行管道：本请求全部工具治理的唯一归属（去重 / 三重上限 / 连败熔断 /
      // 时间预算 / 合规二道检查 / 重试引导，见 ADR-0008）
      const pipeline = createToolExecutionPipeline({
        registry,
        ctx: { userId: options.userId, signal, errorId },
        limits: {
          maxTotalCalls: AGENT_MAX_TOOL_CALLS_TOTAL,
          maxCallsPerRound: AGENT_MAX_TOOL_CALLS_PER_ROUND,
          maxImageGenerates: AGENT_MAX_IMAGE_GENERATES,
          maxConsecutiveFailures: AGENT_MAX_CONSECUTIVE_FAILURES,
        },
        startedAt,
        runTimeBudgetMs,
        guardContent: guardToolContent,
        trace: options.trace,
      });

      // 链式会话状态机：收敛 previousResponseId 链式追踪、增量推演与断链全量回退自愈（ADR-0010）
      // 注意：仅豆包 Ark Responses API 支持服务端链式增量传输；DeepSeek 等无状态 OpenAI 兼容模型必须回发全量上下文
      const session = createChainedMessageSession({
        initialMessages: options.messages,
        supportsChaining: options.provider === 'doubao',
      });

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
        const events = artifactExtractor.push(chunk);
        for (const event of events) {
          if (event.type === 'text-delta') {
            text += event.text;
          } else if (event.type === 'artifact_start') {
            toolProducedOutput = true;
            if (!recordedArtifactRefs.some((r) => r.id === event.artifact.id)) {
              recordedArtifactRefs.push({
                id: event.artifact.id,
                type: event.artifact.type,
                title: event.artifact.title,
              });
            }
          } else if (event.type.startsWith('artifact_')) {
            toolProducedOutput = true;
          }
          controller.enqueue(encodeSseEvent(event));
        }
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

        // ==================== 前置规划节点 (ADR-0038 / AGENT-PLAN-DAG) ====================
        currentPlan = null;

        const emitStepUpdate = (
          stepId: string,
          status: PlanStepStatus,
          summary?: string
        ) => {
          if (!currentPlan) return;
          currentPlan = updatePlanStepStatus(currentPlan, stepId, status, summary);
          controller.enqueue(
            encodeSseEvent({
              type: 'plan_step_update',
              stepId,
              status,
              ...(summary ? { summary } : {}),
            })
          );
        };

        if (options.enablePlanning !== false && !signal.aborted) {
          try {
            currentPlan = await generateAgentPlan({
              model: agentModel,
              messages: session.getStepPayload().messages,
              system: effectiveSystemPrompt,
              signal,
            });
            if (currentPlan && currentPlan.steps.length > 0) {
              // 1. 推送完整初始计划
              controller.enqueue(encodeSseEvent({ type: 'plan_created', plan: currentPlan }));
              // 2. 乐观执行：立即自动将第 1 个 Checkpoint 置为 running 并下发
              const firstStepId = currentPlan.steps[0].id;
              emitStepUpdate(firstStepId, 'running');
            }
          } catch (planErr) {
            console.warn('[agent] 前置规划失败，平滑降级为常规循环:', planErr);
            currentPlan = null;
          }
        }

        // ==================== 主循环：决策步 + 工具执行 ====================
        while (roundIndex < maxDecisionSteps) {
          // 每轮决策开始前检查：用户中断或治理停止条件（时间预算 / 连败熔断 / 全局上限）
          if (signal.aborted || pipeline.shouldHalt()) {
            break;
          }

          roundIndex++;
          pipeline.beginRound();

          const decisionStart = Date.now();
          const stepPayload = session.getStepPayload();

          // 决策步：挂 tools，stopWhen 为 1 步
          const decision: StreamTextResult<ToolSet, any> = streamText<ToolSet>({
            model: agentModel,
            messages: stepPayload.messages,
            ...(effectiveSystemPrompt ? { system: effectiveSystemPrompt } : {}),
            tools: {
              ...buildToolSet(registry),
              // Ark 服务端执行的内置联网搜索：依据能力包白名单与供应方自适应挂载
              ...(canUseArkWebSearch ? { web_search: aiProvider.tools.webSearch({}) } : {}),
            },
            // 教学重点：stopWhen: stepCountIs(1) 将单步决策控制权夺回到我们自己的 Node.js 运行时中
            // 严禁让上游 SDK 黑盒自动多步循环，这样我们才能在每一步执行去重、耗时统计、连败熔断与自定义 SSE 事件推送
            stopWhen: stepCountIs(1),
            maxOutputTokens: stepOutputLimit,
            abortSignal: signal,
            headers:
              options.thinking !== undefined
                ? { 'x-deepseek-thinking': options.thinking ? 'enabled' : 'disabled' }
                : undefined,
            providerOptions: {
              openai: {
                ...(stepPayload.isChained && stepPayload.previousResponseId
                  ? { previousResponseId: stepPayload.previousResponseId }
                  : {}),
                maxToolCalls: AGENT_MAX_TOOL_CALLS_PER_ROUND,
              },
            },
          });

          // 工具流投影适配器：统一消费流事件、直透服务端工具事件、规约标准决策动作（ADR-0009）
          const rawCalls = (await decision.toolCalls) as RawToolCall[];
          const projectorOutcome = await projectDecisionStream(decision.fullStream, rawCalls, {
            onEvent: (event) => controller.enqueue(encodeSseEvent(event)),
          });
          searchCallsCount += projectorOutcome.searchCallsIncrement;

          const decisionResponse = (await decision.response) as {
            id?: string;
            messages?: ModelMessage[];
          };
          // 记录模型响应：更新链追踪 ID，缺 id 触发断链自愈回退机制（ADR-0010）
          session.recordResponse(decisionResponse);

          accumulate(await decision.usage, `decision_${roundIndex}`);
          finalFinishReason = await decision.finishReason;

          const action = projectorOutcome.action;

          // 决策步可观测 Generation 记录（工单 01）
          if (options.trace) {
            const norm = normalizeUsage(await decision.usage);
            const usageType: 'actual' | 'missing' =
              norm && norm.totalTokens !== null ? 'actual' : 'missing';
            let outputSummary: string;
            if (action.type === 'deliver_answer') {
              outputSummary = action.text;
            } else if (action.type === 'execute_local_tools') {
              outputSummary = action.noteText
                ? `[agent_note] ${action.noteText}`
                : `[tool_calls] ${action.localCalls.map((c) => c.toolName).join(', ')}`;
            } else if (action.type === 'nudge_continue') {
              outputSummary = `[nudge] ${action.nudgeMessage}`;
            } else {
              outputSummary = `[action: ${action.type}]`;
            }

            const gen = options.trace.generation({
              name: `decision_round_${roundIndex}`,
              model: options.model,
              input: stepPayload.messages,
              output: outputSummary,
              usage:
                norm && norm.totalTokens !== null
                  ? {
                      promptTokens: norm.inputTokens ?? undefined,
                      completionTokens: norm.outputTokens ?? undefined,
                      totalTokens: norm.totalTokens ?? undefined,
                    }
                  : undefined,
              usageType,
              startTime: new Date(decisionStart),
              endTime: new Date(),
              metadata: {
                stepIndex: roundIndex,
                actionType: action.type,
                finishReason: finalFinishReason,
                priceBookVersion: '2026.1',
              },
            });
            gen.end();
          }

          // 决策动作规约派发：消除编排器特异分支与防御断言
          if (action.type === 'deliver_answer') {
            // 决策步输出最终回答，降级路径，循环结束
            emitText(action.text);
            finalAnswerDelivered = true;
            break;
          }

          if (action.type === 'nudge_continue') {
            // 服务端工具执行完毕且无文本（如搜索被截断）：补入系统引导语续跑一轮
            session.appendNudge(action.nudgeMessage);
            continue;
          }

          if (action.type === 'empty_finish') {
            // 空决策（无工具、无文本、无服务端执行）：模型选择不说话，按既有语义收尾
            finalAnswerDelivered = true;
            break;
          }

          // 动作类型为 execute_local_tools：有待本地执行的自有工具
          if (action.noteText) {
            // 决策步思考文本以 agent_note 事件下发，绝不进 text-delta
            controller.enqueue(encodeSseEvent({ type: 'agent_note', text: action.noteText }));
          }

          // 顺序执行本轮本地工具调用（去重 / 上限 / 熔断 / 合规 / 引导全部收归管道内部）
          const toolResultParts: Array<{
            type: 'tool-result';
            toolCallId: string;
            toolName: string;
            output: { type: 'text', value: string };
          }> = [];

          for (const call of action.localCalls) {
            const callId = call.toolCallId;
            const name = call.toolName;

            if (currentPlan) {
              currentPlan = attachToolCallToRunningStep(currentPlan, callId);
            }

            // 工具调用事件推送（先于治理判定：即使随即被 skip，前端也先收到卡片）
            controller.enqueue(
              encodeSseEvent({
                type: 'tool_call',
                call: { id: callId, name, argsSummary: summarizeArgs(call.input) },
              })
            );

            const outcome = await pipeline.executeCall({
              toolCallId: callId,
              toolName: name,
              input: call.input,
            });

            // 工具成功交付产物即视为本轮有产出（是否按 success 结算由 hasOutput 三态判定）
            if (outcome.ok) {
              toolProducedOutput = true;
            }

            // 推送 tool_result 事件（重复调用不带 attachment，由管道保证；携带真实耗时与引用字典）
            controller.enqueue(
              encodeSseEvent({
                type: 'tool_result',
                callId,
                name,
                status: outcome.ok ? 'success' : 'failed',
                summary: outcome.summaryForDisplay,
                ...(outcome.attachment ? { attachment: outcome.attachment } : {}),
                ...(outcome.durationMs !== undefined ? { durationMs: outcome.durationMs } : {}),
                ...(outcome.citations ? { citations: outcome.citations } : {}),
              })
            );

            // 记录到运行审计流水（ADR-0015 / 工单 02）
            recordedToolCalls.push({
              id: callId,
              name,
              argsSummary: summarizeArgs(call.input),
              status: outcome.ok ? 'success' : 'failed',
              summary: outcome.summaryForDisplay,
              ...(outcome.durationMs !== undefined ? { durationMs: outcome.durationMs } : {}),
              ...(outcome.citations ? { citations: outcome.citations } : {}),
            });

            // 若工具产出有效附件（如生成的图片），标记为有效产出，不向工作台冗余注入 image artifact
            if (outcome.ok && outcome.attachment) {
              toolProducedOutput = true;
            }

            // 回注给模型的内容：软提示 / 未执行 / 过检后内容均由管道组装完毕
            toolResultParts.push({
              type: 'tool-result',
              toolCallId: callId,
              toolName: name,
              output: { type: 'text', value: outcome.contentForModel },
            });
          }

          // 教学重点：工具结果回注（Tool Re-injection）
          // 按照 LLM 标准协议，将本地执行的结果包装为 role: 'tool' 消息，
          // 其中 toolResultParts 的每一项都携带了对应模型申请的 toolCallId 与返回值 content，
          // 重新追加到 session 历史中，模型在下一轮决策才能“看到”工具的数据产出
          const toolMessage: ModelMessage = { role: 'tool', content: toolResultParts };
          session.appendToolResult(toolMessage);

          // 步骤流转 (AGENT-PLAN-DAG / ADR-0038)：本轮工具执行完成，推进当前 running 步骤为 completed 并开始下一步
          if (currentPlan) {
            const runningIndex = currentPlan.steps.findIndex((s) => s.status === 'running');
            if (runningIndex !== -1 && runningIndex < currentPlan.steps.length - 1) {
              const curStepId = currentPlan.steps[runningIndex].id;
              const lastToolCall = recordedToolCalls[recordedToolCalls.length - 1];
              const stepSummary = lastToolCall?.summary
                ? `已完成：${lastToolCall.summary}`
                : '阶段任务已完成';
              emitStepUpdate(curStepId, 'completed', stepSummary);

              const nextStepId = currentPlan.steps[runningIndex + 1].id;
              emitStepUpdate(nextStepId, 'running');
            }
          }

          // 退化保护与边界熔断（连败 / 全局上限 / 时间耗尽）统一由管道的停止判定表达
          if (pipeline.shouldHalt()) {
            if (currentPlan) {
              const runningStep = currentPlan.steps.find((s) => s.status === 'running');
              if (runningStep) {
                emitStepUpdate(runningStep.id, 'failed', '连续工具执行失败，熔断进入收尾');
              }
            }
            break;
          }
        }

        // ==================== 收尾步（若仍需收尾） ====================
        if (!finalAnswerDelivered) {
          const summaryStart = Date.now();
          const summaryPayload = session.getStepPayload();

          // 收尾步不挂 tools，强制产出最终文本回答（充分利用收尾上限，防止长文报告被截断）
          const effectiveSummaryLimit =
            options.summaryOutputLimit ?? Math.max(stepOutputLimit, AGENT_SUMMARY_OUTPUT_LIMIT);
          const summaryMessages: ModelMessage[] = summaryPayload.isChained
            ? summaryPayload.messages
            : [
                ...summaryPayload.messages,
                {
                  role: 'user',
                  content:
                    '请基于上述各轮工具调研检索到的信息，整理并输出完整、详尽、结构化的最终中文回答。请直接输出最终交付内容，不要再输出任何工具调用标记。',
                },
              ];

          const summary = streamText({
            model: agentModel,
            messages: summaryMessages,
            ...(effectiveSystemPrompt ? { system: effectiveSystemPrompt } : {}),
            maxOutputTokens: effectiveSummaryLimit,
            abortSignal: signal,
            headers:
              options.thinking !== undefined
                ? { 'x-deepseek-thinking': options.thinking ? 'enabled' : 'disabled' }
                : undefined,
            providerOptions: {
              openai: {
                ...(summaryPayload.isChained && summaryPayload.previousResponseId
                  ? { previousResponseId: summaryPayload.previousResponseId }
                  : {}),
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

          // 收尾步可观测 Generation 记录（工单 01）
          if (options.trace) {
            const norm = normalizeUsage(await summary.usage);
            const usageType: 'actual' | 'missing' =
              norm && norm.totalTokens !== null ? 'actual' : 'missing';
            const gen = options.trace.generation({
              name: 'summary_step',
              model: options.model,
              input: summaryMessages,
              output: text,
              usage:
                norm && norm.totalTokens !== null
                  ? {
                      promptTokens: norm.inputTokens ?? undefined,
                      completionTokens: norm.outputTokens ?? undefined,
                      totalTokens: norm.totalTokens ?? undefined,
                    }
                  : undefined,
              usageType,
              startTime: new Date(summaryStart),
              endTime: new Date(),
              metadata: {
                summaryOutputLimit: effectiveSummaryLimit,
                finishReason: finalFinishReason,
                priceBookVersion: '2026.1',
              },
            });
            gen.end();
          }
        }

        // 清空流式抽取器剩余缓冲区与未闭合标签自愈（ADR-0015）
        const flushEvents = artifactExtractor.flush();
        for (const event of flushEvents) {
          if (event.type === 'text-delta') {
            text += event.text;
          } else if (event.type === 'artifact_start') {
            toolProducedOutput = true;
            if (!recordedArtifactRefs.some((r) => r.id === event.artifact.id)) {
              recordedArtifactRefs.push({
                id: event.artifact.id,
                type: event.artifact.type,
                title: event.artifact.title,
              });
            }
          } else if (event.type.startsWith('artifact_')) {
            toolProducedOutput = true;
          }
          controller.enqueue(encodeSseEvent(event));
        }

        // ==================== 完成态上报 ====================
        // 计划收尾 (AGENT-PLAN-DAG / ADR-0038 / [P-W1] / [P-W13])：诚实状态机收敛
        if (currentPlan) {
          const hasFailure = currentPlan.steps.some((s) => s.status === 'failed');
          for (const step of currentPlan.steps) {
            if (step.status === 'running') {
              emitStepUpdate(
                step.id,
                hasFailure ? 'failed' : 'completed',
                hasFailure ? '前序故障中止执行' : '任务交付完成'
              );
            } else if (step.status === 'pending') {
              // 诚实状态机：未执行的步骤无论是否失败，均不能冒充 completed，应标记为 skipped
              emitStepUpdate(
                step.id,
                'skipped',
                hasFailure ? '前序故障已跳过' : '提前交付，步骤已略过'
              );
            }
          }
        }

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
          // 观测元数据由运行时上下文统一产出（ADR-0011）：路由层不接触调次闭包
          webhookCalls: runtime.finishMetadata().webhookCalls,
          steps: roundIndex + (finalAnswerDelivered ? 0 : 1),
          toolCalls: recordedToolCalls,
          artifactRefs: recordedArtifactRefs,
          durationMs: Date.now() - startedAt,
          ...(produced ? {} : { reason: 'agent 未产生任何回答内容' }),
        });

        // 结束 Root Trace（工单 01）
        if (options.trace) {
          const currentTotals = totals as UsageTotals | null;
          options.trace.update({
            output: text,
            metadata: {
              outcome: produced ? 'success' : 'failed',
              steps: roundIndex + (finalAnswerDelivered ? 0 : 1),
              durationMs: Date.now() - startedAt,
              totalTokens: currentTotals?.totalTokens,
            },
          });
          options.trace.end();
        }

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
        const cause = error instanceof Error && (error as any).cause ? (error as any).cause : null;
        const causeMessage = cause instanceof Error ? cause.message : (cause ? JSON.stringify(cause) : '');
        const baseReason = error instanceof Error ? error.message : String(error);
        const reason = causeMessage ? `${baseReason} (cause: ${causeMessage})` : baseReason;
        console.warn('[agent] 编排失败', { errorId, reason, cause });
        if (currentPlan) {
          currentPlan = finalizePlanExecution(currentPlan, signal.aborted ? 'aborted' : 'failed', reason);
        }
        // 中断或异常同样以「有产出」判 partial：工具已交付产物的轮次不得整轮退款
        await onFinish({
          outcome: hasOutput() ? 'partial' : 'failed',
          usage: totals,
          outputText: text,
          reason,
          searchCalls: searchCallsCount,
          webhookCalls: runtime.finishMetadata().webhookCalls,
        });
        if (options.trace) {
          options.trace.update({
            output: text,
            metadata: {
              outcome: hasOutput() ? 'partial' : 'failed',
              error: reason,
              durationMs: Date.now() - startedAt,
            },
          });
          options.trace.end();
        }
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
