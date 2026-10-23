/**
 * 工具执行管道（ToolExecutionPipeline）—— Agent 自有工具执行的唯一深模块（ADR-0008）
 *
 * 本文件位于 lib 层，禁止 import `@/app/**` 下任何模块（分层守卫）。
 *
 * 职责：以极窄接口（beginRound / executeCall / shouldHalt）承载一次 Agent 请求内
 * 全部工具治理——去重缓存、单轮/全局/出图三重上限、连败熔断、时间预算、
 * 合规二道检查与重试引导文案组装；单次调用的超时/截断/错误规范化复用
 * tool-policy 的低阶机制。编排器（agent-runner）只负责循环、事件与消息回注。
 *
 * 严格行为保持（重构自 agent-runner 内联治理，逐字等价）；9 条已知不对称见 ADR-0008：
 * - skip 也计入连败熔断；
 * - 工具不存在 / 参数校验失败的结果也过合规并写入去重缓存；
 * - skip 路径不过合规、不进缓存；
 * - 重复调用不重发 attachment、不重复过检；
 * - 判定顺序固定：中断 → 全局上限 → 单轮上限 → 时间预算 → 出图上限；
 * - 全局上限两种比较并存（单次 skip 用 `>`，shouldHalt 用 `>=`）；
 * - 出图计数仅在前四类检查全过后自增。
 */

import { DEFAULT_TOOL_POLICY, runToolWithPolicy } from './tool-policy';
import {
  validateToolArgs,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolRegistry,
} from './registry';

/** 单次调用结果（只含编排器真实消费面） */
export interface ToolCallOutcome {
  ok: boolean;
  /** 最终回注模型的内容（已组装：软提示 / 未执行文案） */
  contentForModel: string;
  /** 下发前端事件的展示摘要 */
  summaryForDisplay: string;
  /** 仅首次执行下发（重复调用不重发，防前端按新 callId 重复渲染） */
  attachment?: ToolExecutionResult['attachment'];
  /** 工具真实执行耗时（毫秒；成功/失败/超时均计时；skip 与缓存命中保持缺省） */
  durationMs?: number;
}

/** 一次工具调用（由编排器从模型决策步投影而来） */
export interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

/** 治理限值（常量真源在 app 层 agent-config，由编排器传入） */
export interface ToolExecutionLimits {
  /** 每请求全局工具调用上限（含被跳过与被去重者） */
  maxTotalCalls: number;
  /** 单轮工具调用上限（轮内 1-based 序号超过即跳过） */
  maxCallsPerRound: number;
  /** image_generate 每请求硬上限 */
  maxImageGenerates: number;
  /** 连败熔断阈值（skip 同样计入） */
  maxConsecutiveFailures: number;
}

export interface ToolExecutionPipelineDeps {
  registry: ToolRegistry;
  ctx: ToolExecutionContext;
  limits: ToolExecutionLimits;
  /** 整请求起始时刻 */
  startedAt: number;
  /** 整请求运行时间预算（毫秒） */
  runTimeBudgetMs: number;
  /** 可注入时钟（默认 Date.now）；单测零 mock 掌控时间 */
  now?: () => number;
  /** 合规检查器（必传；实现留在 app 层，规避分层守卫） */
  guardContent: (content: string, toolName: string) => string;
}

export interface ToolExecutionPipeline {
  /** 决策轮边界：重置轮内计数（每轮决策开始处调用一次） */
  beginRound(): void;
  /** 执行单次调用：内部完成去重、上限拦截、合规过检与文案组装 */
  executeCall(call: ToolCall): Promise<ToolCallOutcome>;
  /** 循环停止判定：时间预算 ∪ 连败熔断 ∪ 全局上限（循环顶与轮末共用） */
  shouldHalt(): boolean;
}

/** 去重缓存条目：存储**过检后**内容（重复调用不重复过检） */
interface CachedToolExecution {
  ok: boolean;
  guardedContent: string;
  summaryForDisplay: string;
  attachment?: ToolExecutionResult['attachment'];
}

/** 对任意对象进行 key 排序后的稳定 JSON 序列化，用于工具调用的去重缓存键（模块内部） */
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

export function createToolExecutionPipeline(
  deps: ToolExecutionPipelineDeps
): ToolExecutionPipeline {
  const { registry, ctx, guardContent, limits, runTimeBudgetMs, startedAt } = deps;
  const now = deps.now ?? Date.now;

  /** 去重缓存：键 = 工具名 + 参数稳定序列化 */
  const toolCache = new Map<string, CachedToolExecution>();
  /** 全局调用计数（含被跳过与被去重者） */
  let totalCalls = 0;
  /** 轮内调用计数（beginRound 重置；轮内 1-based 序号即上限判定依据） */
  let roundCalls = 0;
  /** 出图专项计数（仅在前四类检查全过后自增，见 ADR-0008 已知不对称 #8） */
  let imageGenerates = 0;
  /** 全局连续失败计数（任一成功清零；skip 同样计入，见 ADR-0008 已知不对称 #1） */
  let consecutiveFailures = 0;

  const timeBudgetExhausted = () => now() - startedAt > runTimeBudgetMs;

  /**
   * 教学重点：连败熔断器（Circuit Breaker）计数器与结算
   * 维护连续失败次数：任何工具成功，连败计数归零；连续失败则自增。
   * 当连败次数达到 maxConsecutiveFailures（默认 3 次）时，shouldHalt 会立即跳闸切断循环。
   */
  const settle = (
    outcome: Omit<ToolCallOutcome, 'durationMs'>,
    startTime?: number
  ): ToolCallOutcome => {
    if (outcome.ok) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
    }
    const durationMs = startTime !== undefined ? Math.max(0, now() - startTime) : undefined;
    return {
      ...outcome,
      ...(durationMs !== undefined ? { durationMs } : {}),
    };
  };

  /**
   * 跳过判定（互斥链，顺序即语义，见 ADR-0008 已知不对称 #6）：
   * 中断 → 全局上限 → 单轮上限 → 时间预算 → 出图上限。
   * 命中出图上限时返回专属文案标记；出图计数仅在本链走到最后才自增。
   */
  const resolveSkip = (
    toolName: string
  ): { reason: string; imageCapExceeded?: boolean } | null => {
    if (ctx.signal.aborted) {
      return { reason: '已取消' };
    }
    if (totalCalls > limits.maxTotalCalls) {
      return { reason: `本次请求累计工具调用数量已达上限（${limits.maxTotalCalls} 次）` };
    }
    if (roundCalls > limits.maxCallsPerRound) {
      return { reason: `本轮工具调用数量超过上限（${limits.maxCallsPerRound} 次）` };
    }
    if (timeBudgetExhausted()) {
      return { reason: '执行时间超出预算' };
    }
    if (toolName === 'image_generate') {
      imageGenerates++;
      if (imageGenerates > limits.maxImageGenerates) {
        return {
          reason: `本次对话的出图次数已用完（${limits.maxImageGenerates} 次）`,
          imageCapExceeded: true,
        };
      }
    }
    return null;
  };

  return {
    beginRound() {
      roundCalls = 0;
    },

    shouldHalt() {
      // 循环顶与轮末共用（等价性论证见 ADR-0008）：时间 ∪ 连败熔断 ∪ 全局上限。
      // 中断不在其中，由编排器在循环顶单独检查。
      return (
        timeBudgetExhausted() ||
        consecutiveFailures >= limits.maxConsecutiveFailures ||
        totalCalls >= limits.maxTotalCalls
      );
    },

    async executeCall(call: ToolCall): Promise<ToolCallOutcome> {
      totalCalls++;
      roundCalls++;

      // 上限拦截：被跳过的调用不执行、不过合规、不进缓存（skip 文案直接回注）
      const skip = resolveSkip(call.toolName);
      if (skip) {
        if (skip.imageCapExceeded) {
          return settle({
            ok: false,
            contentForModel: `本次对话的出图次数已用完（${limits.maxImageGenerates} 次），请基于已有内容作答`,
            summaryForDisplay: `未执行：本次对话的出图次数已用完（${limits.maxImageGenerates} 次）`,
          });
        }
        return settle({
          ok: false,
          contentForModel: `工具「${call.toolName}」未执行：${skip.reason}。请在回答中如实告知用户这次调用未执行。`,
          summaryForDisplay: `未执行：${skip.reason}`,
        });
      }

      // 教学重点：退化保护 1 —— 入参哈希去重缓存（Deduplication Cache）
      // 将「工具名 + 规范化序列化的入参」作为唯一 Key。
      // 若大模型在多步中因幻觉或死循环重复调用同一入参，直接在内存中命中并短路（Short-circuit）返回历史结果，
      // 避免重复发网络请求消耗配额，同时向模型注入引导提示语。
      const cacheKey = `${call.toolName}:${stableSerialize(call.input)}`;
      const cached = toolCache.get(cacheKey);
      if (cached) {
        return settle({
          ok: cached.ok,
          contentForModel: `${cached.guardedContent}\n\n该调用已执行过，结果同前，请基于现有信息作答或调整参数。`,
          summaryForDisplay: cached.summaryForDisplay,
        });
      }

      // 首次执行：真实执行工具（查规格 → 校验入参 → 策略化执行）
      const callStart = now();
      const spec = registry.get(call.toolName);
      let outcome: ToolExecutionResult;
      if (!spec) {
        outcome = {
          ok: false,
          contentForModel: `工具「${call.toolName}」不存在，请使用已提供的工具。`,
          summaryForDisplay: '工具不存在',
        };
      } else {
        const validation = validateToolArgs(spec, call.input);
        outcome = validation.ok
          ? await runToolWithPolicy(spec, validation.args, ctx, DEFAULT_TOOL_POLICY)
          : {
              ok: false,
              contentForModel: `工具参数不合法：${validation.reason}。请修正参数后重试。`,
              summaryForDisplay: `参数不合法：${validation.reason}`,
            };
      }

      // 合规二道检查：首次执行结果过检后存入缓存并回注（已知不对称 #2：
      // 工具不存在 / 参数校验失败的结果同样过检并进缓存）
      const guarded = guardContent(outcome.contentForModel, call.toolName);
      toolCache.set(cacheKey, {
        ok: outcome.ok,
        guardedContent: guarded,
        summaryForDisplay: outcome.summaryForDisplay,
        attachment: outcome.attachment,
      });

      return settle(
        {
          ok: outcome.ok,
          contentForModel: guarded,
          summaryForDisplay: outcome.summaryForDisplay,
          ...(outcome.attachment ? { attachment: outcome.attachment } : {}),
        },
        callStart
      );
    },
  };
}
