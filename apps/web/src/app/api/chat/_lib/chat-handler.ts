/**
 * 聊天路由处理器工厂
 *
 * 参照 destiny 报告工厂的 createReportHandler 模式，
 * 将鉴权、限流、配额、错误处理统一在此，provider 差异委派给适配器。
 */

import type { ProviderName } from '@repo/providers';
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
import { estimateTextTokens, getCapabilityPack, resolveArtifactContext, parseChatRequestBody, type WireMessage } from '@repo/shared';
import {
  AGENT_MIN_STEPS,
  AGENT_MODEL,
  AGENT_PROVIDER,
  AGENT_SUMMARY_OUTPUT_LIMIT,
  fullAgentStepBudget,
  resolveAgentStepBudget,
  type AgentStepBudget,
} from './agent/agent-config';
import { type UserWebhookTool } from '@repo/db';
import {
  detectChatSensitiveTopic,
  buildChatBlockedText,
  createBlockedStream,
} from './chat-safety';
import { checkFaqShortCircuit, createFaqShortCircuitStream } from './faq-short-circuit';
import { createAgentRuntimeContext, type AgentRuntimeContext } from './agent/runtime-context';
import { runAgent } from './agent/agent-runner';
import {
  ApprovalRejectedError,
  consumeApprovalToken,
  verifyApprovalToken,
} from '@/lib/agent/approval-token';
import { createRootTrace, type ObservabilityTrace } from '@/lib/observability/langfuse-client';
import { ChatCompletionLifecycle, type ChatCompletionContext } from './completion';
import { checkAgentEnvironment } from './agent-probe';

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
  /**
   * 智能体运行环境探针函数（ADR-0060）：
   * 校验凭据与最低配额（4,096 tokens），不满足时平滑降级为极速对话。
   */
  checkAgentEnvironment?: typeof checkAgentEnvironment;
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

      // 3. 解析请求（评审 C4 / ADR-0050）：白名单运行时解析取代类型断言。
      // 未知字段静默剥离；已知字段畸变 400（error/code/errorId/details）；
      // 布尔门控脏值归一化 false（B-7）；历史残缺附件自愈剥离，末条损坏 400。
      const rawBody: unknown = await req.json();
      const parsed = parseChatRequestBody(rawBody);
      if (!parsed.ok) {
        return jsonResponse(
          {
            error: parsed.error.message,
            code: parsed.error.code,
            errorId,
            details: parsed.error.details,
          },
          400
        );
      }
      const {
        messages,
        model,
        provider,
        chatScene,
        reservationId,
        agent: rawAgent,
        capabilityPack,
        disabledToolKeys,
        thinking,
        conversationId,
        turnId,
        artifactContext,
        approvalResume,
        approvalScope,
      } = parsed.body;

      // 智能体环境探针检测（ADR-0060）：若启用探针则前置校验凭据与可用配额
      let agent = rawAgent;
      let agentFallback = false;
      let agentFallbackReason = '';

      if (agent && config.checkAgentEnvironment) {
        let availableQuota: number | undefined;
        try {
          availableQuota = await getAvailableQuota(user.id);
        } catch (error) {
          console.warn('[chat] 余额预检读取异常', { errorId, userId: user.id, error });
        }

        const probeResult = config.checkAgentEnvironment({ availableQuota });
        if (probeResult.fallback) {
          console.warn('[chat] 智能体环境探针触发自动优雅降级', {
            errorId,
            userId: user.id,
            reason: probeResult.reason,
          });
          agent = false;
          agentFallback = true;
          agentFallbackReason = probeResult.reason || '已自动切换为极速对话';
        }
      }

      // 场景能力包（ADR-0014 / 工单 01）：契约已在 agent 门控内完成形状归一，此处只取解析结果
      const activeCapabilityPack = agent ? getCapabilityPack(capabilityPack) : undefined;
      // 产物上下文注入（ADR-0037 §4）：仅 agent 模式；服务端复核长度与标题结构，不信任客户端
      // 注入文本只追加到当次系统提示词，不写入消息历史；其字符数以一条估算专用伪消息计入输入估算
      const artifactResolution = agent ? resolveArtifactContext(artifactContext) : null;
      const billingMessages: WireMessage[] = artifactResolution
        ? [...messages, { role: 'system', content: artifactResolution.text }]
        : messages;

      // 合规前置拦截：命中即返回安全话术，不预留额度、不调模型、不计费
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      const topic = lastUserMessage ? detectChatSensitiveTopic(lastUserMessage.content) : null;
      if (topic) {
        console.warn('[chat] 输入命中合规拦截', { errorId, userId: user.id, topic });
        return createSseResponse(createBlockedStream(buildChatBlockedText(topic)));
      }

      const requestId = getBillingRequestId(req, rawBody as Record<string, unknown>);
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

      // 3.5 FAQ 极高置信度前置强短路检测 (ADR-0027)
      // 若提问极度精准命中知识库标准 FAQ，直接秒出权威答案，零 Token 消耗
      const lastUserMsg = messages[messages.length - 1];
      if (
        !approvalResume &&
        !agent &&
        chatScene !== 'compare' &&
        !reservationId &&
        lastUserMsg &&
        lastUserMsg.role === 'user' &&
        typeof lastUserMsg.content === 'string'
      ) {
        let shortCircuitFaq: Awaited<ReturnType<typeof checkFaqShortCircuit>> = null;
        try {
          shortCircuitFaq = await checkFaqShortCircuit({
            userId: user.id,
            query: lastUserMsg.content,
            hasCurrentAttachments: Boolean(lastUserMsg.attachments?.length),
          });
        } catch (error) {
          console.warn('[chat] FAQ 前置短路异常，按无 FAQ 降级', { errorId, error });
        }
        if (shortCircuitFaq) {
          console.log('[chat] 触发 FAQ 前置强短路直出', {
            userId: user.id,
            question: shortCircuitFaq.question,
          });
          const stream = createFaqShortCircuitStream(shortCircuitFaq);
          return createSseResponse(stream);
        }
      }

      // 4. 配额管理：QuotaSession 统一 reserve → finalize（评审 C1 唯一决策表）
      // agent 模式：计算可负担步数，按实际步数预留；不足下限拒绝；预检失败兜底满配
      // （步数 ↔ token 的换算唯一出处是 agent-config 的 resolveAgentStepBudget）
      let agentBudget: AgentStepBudget | null = null;
      // agent 运行时上下文：工具装配与调次统计全部内聚在运行时内部（Candidate 04 / ADR-0011），
      // 路由层只负责创建它并把 userId 交给它
      let agentRuntime: AgentRuntimeContext | null = null;
      let agentTrace: ObservabilityTrace | null = null;
      let verifiedResume: { nonce: string } | null = null;
      if (agent) {
        let affordable;
        try {
          affordable = resolveAgentStepBudget(
            await getAvailableQuota(user.id),
            estimateTextTokens(billingMessages),
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

        // 审批恢复验签（ADR-0041 §4）：先验签名/绑定/有效期，再确认工具仍可用；
        // 都在预留额度之前完成，被拒绝的恢复请求不产生任何扣费。
        if (approvalResume) {
          // 工具已停用、删除或不再需要审批：没有可绑定的工具身份，直接视为不可用
          const resumeApproval = agentRuntime.registry.get(approvalResume.toolName)?.approval;
          if (!resumeApproval) {
            throw new ApprovalRejectedError('tool_unavailable');
          }
          // 工具 ID 与目标域名取自当前库中的工具，而不是请求体：工具被改 URL、删除重建后旧凭证一律失效
          verifiedResume = verifyApprovalToken(approvalResume.token, {
            userId: user.id,
            scope: approvalScope,
            toolName: approvalResume.toolName,
            toolId: resumeApproval.toolId,
            host: resumeApproval.host,
            params: approvalResume.params,
          });
        }

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
        messages: billingMessages,
        ...(agentBudget ? { maxOutputTokens: agentBudget.reserveOutputLimit } : {}),
        metadata: { messagesCount, attachmentCount, ...(agent ? { agent: true } : {}) },
        reservationId,
      }, user.role);
      session = reservedSession;

      // 一次性标记（ADR-0041 §4）：放在预留成功之后，额度不足不会烧掉凭证；
      // 重放返回「已使用」，Redis 不可用则失败关闭。任何拒绝都会在 catch 中释放刚预留的额度。
      if (verifiedResume) {
        await consumeApprovalToken(verifiedResume.nonce);
      }

      // 5. 完成态回调：收口到聊天完成生命周期 module（评审 C5 / ADR-0051）。
      // 副作用顺序契约、恰好一次守卫与 AgentRun 审计构造的唯一事实源在 ChatCompletionLifecycle，
      // 路由只提供会话上下文与完成事实。
      const completionContext: ChatCompletionContext = {
        userId: user.id,
        requestId,
        errorId,
        conversationId: conversationId ?? null,
        turnId,
        effectiveProvider,
        modelName,
        messages,
        reservedSession,
        messagesCount,
        attachmentCount,
        agentContext: {
          enabled: agent,
          ...(activeCapabilityPack ? { activeCapabilityPack } : {}),
          // agent 模式静默覆盖留痕：用户请求的提供商/模型与强制值不同时，记录原始值以备审计追溯
          ...(agent && provider !== AGENT_PROVIDER ? { overriddenProvider: provider } : {}),
          ...(agent && model && model !== AGENT_MODEL ? { overriddenModel: model } : {}),
        },
      };
      const completionLifecycle = new ChatCompletionLifecycle();
      const onFinish = async (finish: ChatStreamFinish): Promise<void> => {
        await completionLifecycle.complete(completionContext, finish);
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
          artifactContextPrompt: artifactResolution?.text,
          approvalScope,
          ...(approvalResume && verifiedResume
            ? {
                resume: {
                  callId: approvalResume.callId,
                  toolName: approvalResume.toolName,
                  params: approvalResume.params,
                },
                // 恢复请求沿用前端已有计划，不重新规划、不重复下发 plan_created
                enablePlanning: false,
              }
            : {}),
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

      return createSseResponse(
        stream,
        agentFallback
          ? {
              'x-agent-fallback': 'true',
              'x-agent-fallback-reason': encodeURIComponent(agentFallbackReason),
            }
          : undefined
      );

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

  // 审批被拒绝（ADR-0041）：文案本身就是给用户的下一步指引
  if (error instanceof ApprovalRejectedError) {
    return jsonResponse({ error: error.message, errorId }, error.status);
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
