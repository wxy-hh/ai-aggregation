/**
 * 聊天路由处理器工厂
 *
 * 参照 destiny 报告工厂的 createReportHandler 模式，
 * 将鉴权、限流、配额、错误处理统一在此，provider 差异委派给适配器。
 */

import type { ProviderName } from '@repo/providers';
import type { Message as ChatMessage } from '@/stores/chat-store';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { getRateLimiter } from '@repo/redis';
import { logger } from '@repo/logger';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { QuotaSession } from '@/lib/billing/quota-session';
import { getDefaultModel } from '@repo/providers';
import { createSseResponse } from './sse';
import { ProviderClientError, type ChatProviderAdapter, type ChatStreamFinish } from './types';
import { getAvailableQuota } from '@/lib/billing/quota-service';
import { estimateTextTokens, getCapabilityPack } from '@repo/shared';
import {
  AGENT_MIN_STEPS,
  AGENT_MODEL,
  AGENT_PROVIDER,
  AGENT_SUMMARY_OUTPUT_LIMIT,
  fullAgentStepBudget,
  resolveAgentStepBudget,
  type AgentStepBudget,
} from './agent/agent-config';
import { prisma, type UserWebhookTool } from '@repo/db';
import {
  detectChatSensitiveTopic,
  buildChatBlockedText,
  createBlockedStream,
} from './chat-safety';
import { normalizeUsage } from '@/lib/ai-usage';
import { resolveChatStreamUsage } from './chat-usage';
import { createAgentRuntimeContext, type AgentRuntimeContext } from './agent/runtime-context';
import { runAgent } from './agent/agent-runner';
import { createRootTrace, flushObservability, type ObservabilityTrace } from '@/lib/observability/langfuse-client';

export interface ChatHandlerConfig {
  /** 根据 provider 返回对应适配器 */
  getAdapter: (provider: ProviderName) => ChatProviderAdapter;
  /**
   * agent 整请求运行时间预算（毫秒）的注入点：默认 AGENT_RUN_TIME_BUDGET_MS（240s）。
   * 测试用缩短预算验证超时降级路径，不打真实时钟（spec Testing Decisions 4）。
   */
  agentRunTimeBudgetMs?: number;
  /**
   * 获取用户自定义已启用 Webhook 工具列表的可选注入点（测试替身 / 自定义数据源）。
   * 路由层不再亲自查询，仅透传给 AgentRuntimeContext；缺省时由运行时上下文
   * 默认从数据库查询（where: { userId, enabled: true }，spec §4.6）。
   */
  getUserTools?: (userId: string) => Promise<UserWebhookTool[]>;
}

export function createChatHandler(config: ChatHandlerConfig) {
  return async function POST(req: Request) {
    const errorId = createErrorId();
    const startTime = Date.now();
    // 提升到 try 外：初始化/适配器启动失败时也需释放预留（评审 C2：release 闭环）
    let session: QuotaSession | null = null;

    try {
      // 1. 鉴权
      const user = await getCurrentUser(req);
      console.log('[chat] 鉴权通过', { errorId, userId: user.id, t: Date.now() - startTime });

      // 2. 限流
      await checkRateLimit(user.id, errorId);

      // 3. 解析请求
      const body = await req.json();
      const {
        messages,
        model,
        provider = 'xunfei',
        reservationId,
        agent: rawAgent,
        capabilityPack: rawCapabilityPack,
        disabledToolKeys: rawDisabledToolKeys,
        thinking: rawThinking,
        conversationId: rawConversationId,
      } = body as {
        messages: ChatMessage[];
        model?: string;
        provider?: ProviderName;
        reservationId?: string;
        agent?: unknown;
        capabilityPack?: unknown;
        disabledToolKeys?: unknown;
        thinking?: unknown;
        conversationId?: unknown;
      };
      // 会话 ID（用于 Langfuse session 与运行记录关联）
      const conversationId =
        typeof rawConversationId === 'string' && rawConversationId.trim()
          ? rawConversationId.trim()
          : undefined;
      // 深度思考模式开关（ADR-0016 / 工单 03）
      const thinking = rawThinking === true;
      // agent 标志只认严格 true（B-7）：truthy 脏数据（"false"/1/旧客户端脏字段）
      // 不得静默进入强制换模型 + chat-agent 计费的 agent 模式
      const agent = rawAgent === true;
      // 场景能力包（ADR-0014 / 工单 01）：仅在 agent 模式且为合法字符串时放行
      const capabilityPack =
        agent && typeof rawCapabilityPack === 'string' && rawCapabilityPack.trim()
          ? rawCapabilityPack.trim()
          : undefined;
      const activeCapabilityPack = agent ? getCapabilityPack(capabilityPack) : undefined;
      // 会话级临时停用工具列表（ADR-0014 / 工单 02）：仅接收字符串数组
      const disabledToolKeys =
        agent && Array.isArray(rawDisabledToolKeys)
          ? rawDisabledToolKeys.filter((k): k is string => typeof k === 'string' && Boolean(k.trim()))
          : undefined;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return jsonResponse({ error: 'Messages are required' }, 400);
      }

      // 合规前置拦截：命中即返回安全话术，不预留额度、不调模型、不计费
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      const topic = lastUserMessage ? detectChatSensitiveTopic(lastUserMessage.content) : null;
      if (topic) {
        console.warn('[chat] 输入命中合规拦截', { errorId, userId: user.id, topic });
        return createSseResponse(createBlockedStream(buildChatBlockedText(topic)));
      }

      const requestId = getBillingRequestId(req, body as Record<string, unknown>);
      // agent 模式：服务端强制 provider/model（spec §5.2 静默覆盖，不报错）
      const effectiveProvider: ProviderName = agent ? AGENT_PROVIDER : provider;
      const modelName = agent ? AGENT_MODEL : model || getDefaultModel(effectiveProvider);
      const messagesCount = messages.length;
      const attachmentCount = messages.reduce(
        (count, m) => count + (m.attachments?.length ?? 0),
        0
      );

      console.log('[chat] 请求参数:', {
        provider: effectiveProvider,
        model: modelName,
        messagesCount,
        agent,
      });

      // 4. 配额管理：QuotaSession 统一 reserve → finalize（评审 C1 唯一决策表）
      // agent 模式：计算可负担步数，按实际步数预留；不足下限拒绝；预检失败兜底满配
      // （步数 ↔ token 的换算唯一出处是 agent-config 的 resolveAgentStepBudget）
      let agentBudget: AgentStepBudget | null = null;
      // agent 运行时上下文：工具装配与调次统计全部内聚在运行时内部（Candidate 04 / ADR-0011），
      // 路由层只负责创建它并把 userId 交给它
      let agentRuntime: AgentRuntimeContext | null = null;
      let agentTrace: ObservabilityTrace | null = null;
      if (agent) {
        let affordable;
        try {
          affordable = resolveAgentStepBudget(
            await getAvailableQuota(user.id),
            estimateTextTokens(messages),
            activeCapabilityPack?.maxSteps
          );
        } catch (error) {
          console.warn('[chat] 余额预检异常，按满配步数尝试预留', {
            errorId,
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          affordable = null;
        }

        if (affordable && affordable.steps < AGENT_MIN_STEPS) {
          throw new BillingError('QUOTA_INSUFFICIENT', '当前额度不足以处理本次对话', {
            requestId,
          });
        }
        agentBudget = affordable ?? fullAgentStepBudget(activeCapabilityPack?.maxSteps);

        // 创建运行时上下文：按需加载用户 Webhook 工具并依据能力包白名单严格收敛内置工具
        agentRuntime = await createAgentRuntimeContext({
          userId: user.id,
          errorId,
          loadUserTools: config.getUserTools,
          capabilityPack: activeCapabilityPack?.key,
          disabledToolKeys,
        });

        // 统一创建 Root Trace：traceId=errorId、runId=requestId、关联 conversationId（工单 01）
        agentTrace = createRootTrace({
          traceId: errorId,
          runId: requestId,
          conversationId,
          userId: user.id,
          name: activeCapabilityPack ? `chat-agent:${activeCapabilityPack.key}` : 'chat-agent',
          input: messages,
          tags: activeCapabilityPack ? ['agent-rag', activeCapabilityPack.key] : ['agent-rag'],
          metadata: {
            errorId,
            model: modelName,
            provider: effectiveProvider,
            ...(activeCapabilityPack ? { capabilityPack: activeCapabilityPack.key } : {}),
            thinking,
          },
        });
      }

      const reservedSession = await QuotaSession.reserve({
        userId: user.id,
        requestId,
        feature: agent ? 'chat-agent' : 'chat',
        provider: effectiveProvider,
        model: modelName,
        messages,
        ...(agentBudget ? { maxOutputTokens: agentBudget.reserveOutputLimit } : {}),
        metadata: { messagesCount, attachmentCount, ...(agent ? { agent: true } : {}) },
        reservationId,
      }, user.role);
      session = reservedSession;

      // 5. 完成态回调：输出合规审计 + 统一结算（适配器路径与 agent 编排共用同一份结算逻辑）
      const onFinish = async (finish: ChatStreamFinish) => {
        const outputTopic = finish.outputText ? detectChatSensitiveTopic(finish.outputText) : null;
        if (outputTopic) {
          console.warn('[chat] 输出命中合规审计', { errorId, userId: user.id, topic: outputTopic });
        }
        const finalizeResult = await reservedSession.finalize(finish.outcome, {
          requestId,
          action: 'chat-stream',
          endpoint: '/api/chat',
          usage: finish.usage,
          outputText: finish.outputText,
          reason: finish.reason,
          provider: effectiveProvider,
          model: modelName,
          userId: user.id,
          feature: agent ? 'chat-agent' : 'chat',
          metadata: {
            errorId,
            messagesCount,
            attachmentCount,
            ...(agent
              ? {
                  agent: true,
                  // 观测计数由运行时上下文经 finish 统一交付（ADR-0011），路由层不再触碰调次闭包
                  webhookCalls: finish.webhookCalls ?? 0,
                  searchCalls: finish.searchCalls ?? 0,
                  ...(activeCapabilityPack ? { capabilityPack: activeCapabilityPack.key } : {}),
                }
              : {}),
            // agent 模式静默覆盖留痕：当用户请求的提供商/模型与强制值不同时，记录被覆盖的原始值以备审计追溯
            ...(agent && provider !== AGENT_PROVIDER ? { overriddenProvider: provider } : {}),
            ...(agent && model && model !== AGENT_MODEL ? { overriddenModel: model } : {}),
            ...(outputTopic ? { safetyFlag: outputTopic } : {}),
          },
        });

        // P1 工单 02：若开启 Agent 模式，事务落盘 agent_runs 记录（ADR-0015）
        if (agent) {
          try {
            const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
            const goalText = (lastUserMessage?.content || '').slice(0, 2000);
            const norm = finish.usage ? normalizeUsage(finish.usage) : null;
            const resolvedUsage = resolveChatStreamUsage(norm, messages, finish.outputText);
            const quotaCost = finish.outcome === 'failed' ? 0 : (resolvedUsage.totalTokens ?? 0);

            if (prisma?.agentRun?.create) {
              await prisma.agentRun.create({
                data: {
                  userId: user.id,
                  conversationId: conversationId ?? null,
                  messageId: null,
                  goalText: goalText || '无目标文本',
                  steps: finish.steps ?? 1,
                  toolCalls: finish.toolCalls ? (finish.toolCalls as any) : [],
                  artifactRefs: finish.artifactRefs ? (finish.artifactRefs as any) : [],
                  capabilityPack: activeCapabilityPack?.key || null,
                  outcome: finish.outcome,
                  quotaCost,
                  durationMs: finish.durationMs ?? 0,
                },
              });
            }
          } catch (dbError) {
            console.warn('[chat] agent_runs 记录落盘失败 (容错不阻断):', dbError);
          }
        }

        // 异步刷新 Langfuse 观测事件队列（未配置时 no-op）
        await flushObservability();

        return finalizeResult;
      };

      // 6. 分流：agent 走多步自主循环编排，其余委派适配器（adapter 只产流）
      let stream: ReadableStream<Uint8Array>;
      if (agentBudget && agentRuntime) {
        stream = runAgent({
          userId: user.id,
          provider: effectiveProvider,
          model: modelName,
          messages,
          // 单步上限 = 预留总量 / 实际步数，保证各步之和不超过预留
          stepOutputLimit: Math.max(
            1,
            Math.floor(reservedSession.outputLimit / agentBudget.steps)
          ),
          // 收尾步上限：在总预留限额与模型单次最大输出（8192）之间取合规值，确保长文研报不被截断
          summaryOutputLimit: Math.min(
            AGENT_SUMMARY_OUTPUT_LIMIT,
            Math.max(
              Math.floor(reservedSession.outputLimit / agentBudget.steps),
              reservedSession.outputLimit
            )
          ),
          maxSteps: agentBudget.steps,
          runTimeBudgetMs: config.agentRunTimeBudgetMs,
          signal: req.signal,
          errorId,
          runtime: agentRuntime,
          capabilityPack: activeCapabilityPack?.key,
          disabledToolKeys,
          thinking,
          trace: agentTrace ?? undefined,
          onFinish,
        });
      } else {
        const adapter = config.getAdapter(effectiveProvider);
        stream = await adapter.stream({
          userId: user.id,
          provider: effectiveProvider,
          model: modelName,
          messages,
          outputLimit: reservedSession.outputLimit,
          signal: req.signal,
          errorId,
          thinking,
          onFinish,
        });
      }

      console.log('[chat] 流开始', {
        userId: user.id, provider: effectiveProvider, model: modelName, agent,
        duration: `${Date.now() - startTime}ms`,
      });

      return createSseResponse(stream);

    } catch (error) {
      // 流尚未开始（豆包文件未就绪、上游 401/429、适配器初始化失败等）：
      // 释放预留额度，避免 reservation 永久泄漏。
      // 响应已发出后的错误由 onFinish → QuotaSession.finalize 在流内结算/释放，不会走到这里。
      if (session) {
        await session.release({
          reason: error instanceof Error ? error.message : '聊天请求失败',
          meterType: 'tokens',
        });
      }
      return handleError(error, errorId, startTime);
    }
  };
}

// ==================== 内部工具函数 ====================

function createErrorId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function jsonResponse(data: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function checkRateLimit(userId: string, errorId: string): Promise<void> {
  try {
    const rateLimiter = getRateLimiter();
    const result = await rateLimiter.check(userId);
    if (!result.allowed) {
      throw new RateLimitError(result.remaining, result.reset);
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    // 限流设施故障不阻断对话，但必须留痕（限流器内部按 fail-open 放行）
    logger.warn('[chat] 限流检查异常，已放行请求', {
      errorId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function handleError(error: unknown, errorId: string, startTime: number): Response {
  const duration = Date.now() - startTime;

  console.error('[chat] 请求错误:', {
    errorId,
    duration: `${duration}ms`,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  // 限流
  if (error instanceof RateLimitError) {
    return new Response(
      JSON.stringify({ error: '请求过于频繁，请稍后再试', errorId, retryAfter: 60 }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(error.remaining),
          'X-RateLimit-Reset': String(error.reset),
          'Retry-After': '60',
        },
      }
    );
  }

  // 认证错误
  if (error instanceof AuthError) {
    return jsonResponse(
      { error: error.message, errorId },
      error.code === 'FORBIDDEN' ? 403 : 401
    );
  }

  // 计费错误
  if (error instanceof BillingError) {
    return billingErrorResponse(error, 402);
  }

  // 提供方客户端错误（适配器已翻译为统一异常，status 直透客户端）
  if (error instanceof ProviderClientError) {
    return jsonResponse({ error: error.message, errorId }, error.status);
  }

  // 通用 Error
  if (error instanceof Error) {
    if (error.message.includes('Missing') || error.message.includes('未设置'))
      return jsonResponse({ error: '服务配置错误，请联系管理员', errorId }, 500);
    if (error.message.includes('timeout') || error.message.includes('超时'))
      return jsonResponse({ error: '请求超时，请稍后重试', errorId }, 504);
    if (error.message.includes('fetch') || error.message.includes('network'))
      return jsonResponse({ error: '网络连接失败，请检查网络后重试', errorId }, 503);
  }

  return jsonResponse({ error: '服务暂时不可用，请稍后重试', errorId }, 500);
}

class RateLimitError extends Error {
  constructor(
    public remaining: number,
    public reset: number
  ) {
    super('请求过于频繁');
    this.name = 'RateLimitError';
  }
}
