/**
 * 聊天完成生命周期管理模块 (ChatCompletionLifecycle)
 *
 * 统一管辖普通聊天与 Agent 模式的完成收尾处理，保证：
 * 1. 恰好一次守卫 (Duplicate-Complete Idempotency)
 * 2. 严格同步副作用顺序契约：输出合规 → finalize 结算 → AgentRun 落库 → 观测 flush (500ms 超时熔断) → 记忆派发
 * 3. 业务异常永不 reject，单点失败独立隔离不阻断后续
 * 4. 终态非法降级为 failed 并驱动配额释放
 * 5. AgentRun 审计构造与 SettlementResult 账实真同源
 *
 * 规范：ADR-0051 / spec.md 决策 2, 4, 5, 6, 7
 */

import {
  prisma,
  persistMemoryTurn,
  type PersistMemoryTurnInput,
  type PersistMemoryTurnResult,
} from '@repo/db';
import { detectChatSensitiveTopic } from '../chat-safety';
import { flushObservability } from '@/lib/observability/langfuse-client';
import type { ChatStreamFinish } from '../types';
import type {
  ChatCompletionContext,
  ChatCompletionDependencies,
  ChatCompletionSideEffects,
  ChatCompletionSummary,
} from './types';

const VALID_OUTCOMES: ReadonlySet<string> = new Set(['success', 'partial', 'failed']);
const DEFAULT_FLUSH_TIMEOUT_MS = 500;

export class ChatCompletionLifecycle {
  private completed = false;
  private initialOutcome: string | null = null;
  private cachedSummary: ChatCompletionSummary | null = null;

  private readonly prisma: any;
  private readonly detectSensitiveTopic: (text: string) => string | null;
  private readonly flushObservability: () => Promise<void>;
  private readonly memoryIndexQueue?: {
    add: (name: string, data: any, opts: any) => Promise<any>;
  };
  private readonly persistMemoryTurn: (
    input: PersistMemoryTurnInput
  ) => Promise<PersistMemoryTurnResult>;
  private readonly flushTimeoutMs: number;
  private readonly logger: {
    warn: (message: string, ...args: any[]) => void;
    error?: (message: string, ...args: any[]) => void;
    info?: (message: string, ...args: any[]) => void;
  };

  constructor(dependencies: ChatCompletionDependencies = {}) {
    this.prisma = dependencies.prisma ?? prisma;
    this.detectSensitiveTopic = dependencies.detectSensitiveTopic ?? detectChatSensitiveTopic;
    this.flushObservability = dependencies.flushObservability ?? flushObservability;
    this.memoryIndexQueue = dependencies.memoryIndexQueue;
    this.persistMemoryTurn = dependencies.persistMemoryTurnFn ?? persistMemoryTurn;
    this.flushTimeoutMs = dependencies.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
    this.logger = dependencies.logger ?? console;
  }

  /**
   * 执行聊天完成生命周期收尾处理
   *
   * @param context 聊天上下文
   * @param finish 流结束结果事实
   * @returns 聊天完成摘要
   */
  async complete(
    context: ChatCompletionContext,
    finish: ChatStreamFinish
  ): Promise<ChatCompletionSummary> {
    // 1. 程序契约违例 fail-fast
    if (!context || !context.userId || !context.requestId || !context.reservedSession) {
      throw new TypeError('ChatCompletionContext 契约违例: userId, requestId, reservedSession 为必填项');
    }
    if (!finish) {
      throw new TypeError('ChatStreamFinish 契约违例: finish 为必填项');
    }

    // 2. 恰好一次守卫 (Idempotency Guard)
    if (this.completed) {
      this.logger.warn('[chat] 重复完成调用被忽略', {
        requestId: context.requestId,
        initialOutcome: this.initialOutcome,
        duplicateOutcome: finish.outcome,
      });
      return this.cachedSummary!;
    }

    // 3. 非法终态降级为 failed 并输出结构化告警 (TC07-5)
    const isOutcomeValid = VALID_OUTCOMES.has(finish.outcome);
    const effectiveOutcome: 'success' | 'partial' | 'failed' = isOutcomeValid ? finish.outcome : 'failed';
    if (!isOutcomeValid) {
      this.logger.warn('[chat] 未知完成终态，已降级为 failed', {
        requestId: context.requestId,
        rawOutcome: finish.outcome,
      });
    }

    const sideEffects: ChatCompletionSideEffects = {
      safetyFlag: null,
      quotaSettled: false,
      agentRunPersisted: false,
      memoryPersisted: false,
      observabilityFlushed: false,
      memoryJobDispatched: false,
    };

    // 副作用 1: 输出合规检测 (输出合规前置，safetyFlag 进入 finalize 元数据)
    let safetyFlag: string | null = null;
    try {
      safetyFlag = finish.outputText ? this.detectSensitiveTopic(finish.outputText) : null;
      if (safetyFlag) {
        this.logger.warn('[chat] 输出命中合规审计', {
          errorId: context.errorId,
          userId: context.userId,
          topic: safetyFlag,
        });
      }
    } catch (safetyErr) {
      this.logger.warn('[chat] 输出合规检测异常 (容错不阻断):', safetyErr);
    }
    sideEffects.safetyFlag = safetyFlag;

    // 副作用 2: finalize 结算 (严格同步)
    let settled = false;
    let settledUnits = 0;
    const isAgent = Boolean(context.agentContext?.enabled);
    const messagesCount = context.messagesCount ?? context.messages.length;
    const attachmentCount = context.attachmentCount ?? 0;

    try {
      const finalizeResult = await context.reservedSession.finalize(effectiveOutcome, {
        requestId: context.requestId,
        action: 'chat-stream',
        endpoint: '/api/chat',
        usage: finish.usage,
        outputText: finish.outputText,
        reason: finish.reason,
        provider: context.effectiveProvider,
        model: context.modelName,
        userId: context.userId,
        feature: isAgent ? 'chat-agent' : 'chat',
        metadata: {
          errorId: context.errorId,
          messagesCount,
          attachmentCount,
          ...(isAgent
            ? {
                agent: true,
                webhookCalls: finish.webhookCalls ?? 0,
                searchCalls: finish.searchCalls ?? 0,
                ...(context.agentContext?.activeCapabilityPack
                  ? { capabilityPack: context.agentContext.activeCapabilityPack.key }
                  : {}),
                ...(finish.evaluator ? { evaluator: finish.evaluator } : {}),
              }
            : {}),
          ...(isAgent && context.agentContext?.overriddenProvider
            ? { overriddenProvider: context.agentContext.overriddenProvider }
            : {}),
          ...(isAgent && context.agentContext?.overriddenModel
            ? { overriddenModel: context.agentContext.overriddenModel }
            : {}),
          ...(safetyFlag ? { safetyFlag } : {}),
        },
      });

      if (finalizeResult && typeof finalizeResult.settled === 'boolean') {
        settled = finalizeResult.settled;
        settledUnits = finalizeResult.settledUnits ?? 0;
      }
      sideEffects.quotaSettled = settled;
    } catch (finalizeErr) {
      this.logger.warn('[chat] 配额结算异常 (容错不阻断):', finalizeErr);
      sideEffects.quotaSettled = false;
      settled = false;
      settledUnits = 0;
    }

    // 副作用 3: AgentRun 审计记录落库 (仅 agent 模式，配额成本直接消费结算结果)
    let agentRunId: string | undefined;
    if (isAgent) {
      try {
        const lastUserMessage = [...context.messages].reverse().find((m) => m.role === 'user');
        const goalText = (lastUserMessage?.content || '').slice(0, 2000);
        // 配额成本消费结算结果：结算物理失败（settled=false）时记 0；失败终态时按契约记 0
        const quotaCost = settled && effectiveOutcome !== 'failed' ? settledUnits : 0;

        const prismaClient = this.prisma;
        if (prismaClient?.agentRun?.create) {
          const created = await prismaClient.agentRun.create({
            data: {
              userId: context.userId,
              conversationId: context.conversationId ?? null,
              messageId: null,
              goalText: goalText || '无目标文本',
              steps: finish.steps ?? 1,
              toolCalls: finish.toolCalls ? (finish.toolCalls as any) : [],
              artifactRefs: finish.artifactRefs ? (finish.artifactRefs as any) : [],
              capabilityPack: context.agentContext?.activeCapabilityPack?.key || null,
              outcome: effectiveOutcome,
              quotaCost,
              durationMs: finish.durationMs ?? 0,
            },
          });
          agentRunId = created?.id;
          sideEffects.agentRunPersisted = true;
        } else {
          sideEffects.agentRunPersisted = false;
        }
      } catch (dbError) {
        this.logger.warn('[chat] agent_runs 记录落盘失败 (容错不阻断):', dbError);
        sideEffects.agentRunPersisted = false;
      }
    } else {
      // 非 agent 模式：若携带审计字段，静默告警忽略且不落库 (TC07-6)
      const hasAuditFields =
        finish.steps !== undefined ||
        (finish.toolCalls && finish.toolCalls.length > 0) ||
        (finish.artifactRefs && finish.artifactRefs.length > 0) ||
        finish.durationMs !== undefined ||
        finish.evaluator !== undefined;

      if (hasAuditFields) {
        this.logger.warn('[chat] 非 Agent 模式携带审计字段，已忽略不落库', {
          requestId: context.requestId,
        });
      }
      sideEffects.agentRunPersisted = false;
    }

    // 副作用 4: 记忆输入消息持久化 (ADR-0058)
    // 只有开启记忆、会话/轮次身份齐全且本轮有完整正文时才写入；写入失败不阻断响应，但跳过派发。
    let memoryEnabled = context.memorySearchEnabled;
    if (memoryEnabled === undefined) {
      const prismaClient = this.prisma;
      const dbUser = await (prismaClient?.user?.findUnique
        ? prismaClient.user.findUnique({
            where: { id: context.userId },
            select: { memorySearchEnabled: true },
          })
        : null);
      memoryEnabled = dbUser?.memorySearchEnabled ?? false;
    }

    if (memoryEnabled) {
      const lastUserMessage = [...context.messages].reverse().find((m) => m.role === 'user');
      const userContent = lastUserMessage?.content ?? '';
      const assistantContent = finish.outputText ?? '';

      if (!context.conversationId || !context.turnId) {
        this.logger.warn('[chat] 记忆输入消息缺少会话或轮次身份，已跳过持久化', {
          requestId: context.requestId,
          userId: context.userId,
          conversationId: context.conversationId ?? null,
          hasTurnId: Boolean(context.turnId),
        });
      } else if (userContent.trim() && assistantContent.trim()) {
        try {
          const persisted = await this.persistMemoryTurn({
            userId: context.userId,
            sessionId: context.conversationId,
            turnId: context.turnId,
            requestId: context.requestId,
            userContent,
            assistantContent,
          });
          sideEffects.memoryPersisted = persisted.persisted;
          if (!persisted.persisted) {
            this.logger.warn('[chat] 记忆输入消息未写入', {
              requestId: context.requestId,
              userId: context.userId,
              conversationId: context.conversationId,
              reason: persisted.reason,
            });
          }
        } catch (persistErr) {
          this.logger.warn('[chat] 记忆输入消息持久化失败 (容错不阻断):', persistErr);
          sideEffects.memoryPersisted = false;
        }
      }
    }

    // 副作用 5: 观测 flush (超时熔断，默认 500ms)
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutMs = this.flushTimeoutMs;
      await Promise.race([
        this.flushObservability(),
        new Promise((_, reject) => {
          flushTimer = setTimeout(() => {
            reject(new Error(`Observability flush timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
      sideEffects.observabilityFlushed = true;
    } catch (flushErr) {
      this.logger.warn('[chat] 观测事件刷新超时熔断或失败 (容错不阻断):', flushErr);
      sideEffects.observabilityFlushed = false;
    } finally {
      if (flushTimer) {
        clearTimeout(flushTimer);
      }
    }

    // 副作用 6: 记忆派发 (防抖 30s 派发 memory-index 任务)
    if (memoryEnabled && sideEffects.memoryPersisted && context.conversationId) {
      try {
        const queue = this.memoryIndexQueue ?? (await import('@repo/queue')).memoryIndexQueue;
        await queue.add(
          'memory-index',
          { userId: context.userId, sessionId: context.conversationId },
          {
            jobId: `memory-index-${context.conversationId}`,
            delay: 30_000,
            removeOnComplete: true,
          }
        );
        sideEffects.memoryJobDispatched = true;
      } catch (memoryQueueErr) {
        this.logger.warn('[chat] 派发会话记忆索引任务失败 (容错不阻断):', memoryQueueErr);
        sideEffects.memoryJobDispatched = false;
      }
    } else {
      sideEffects.memoryJobDispatched = false;
    }

    const summary: ChatCompletionSummary = {
      settled,
      settledUnits,
      ...(agentRunId ? { agentRunId } : {}),
      sideEffects,
    };

    this.completed = true;
    this.initialOutcome = finish.outcome;
    this.cachedSummary = summary;

    return summary;
  }
}
