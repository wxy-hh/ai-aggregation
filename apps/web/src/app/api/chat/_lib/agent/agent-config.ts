/**
 * Agent 模式配置常量（spec §5.4 / §5.6）
 *
 * 「抽成常量可配」是 spec 的明确要求：步数系数与单步上限都是调参点，
 * 集中在此避免散落在编排逻辑里。
 */

import type { ProviderName } from '@repo/providers';

/** agent 模式默认使用的提供方（ADR-0016 切换至按量计费的 DeepSeek） */
export const AGENT_PROVIDER: ProviderName = 'deepseek';

/** agent 模式默认使用的模型（deepseek-flash 原生支持标准 Function Calling） */
export const AGENT_MODEL = 'deepseek-flash';

/** 豆包旧版常量（保留以便未来充值后平滑回切与双轨回退，ADR-0016） */
export const AGENT_PROVIDER_LEGACY_DOUBAO: ProviderName = 'doubao';
export const AGENT_MODEL_LEGACY_DOUBAO = 'doubao-seed-evolving';

/** 单步输出 token 基准上限；预留按「基准 × 实际步数」，单步生成受基准约束 */
export const AGENT_STEP_OUTPUT_LIMIT = 2048;

/**
 * 最大模型调用步数：最多 4 轮「决策 + 工具」+ 1 次强制收尾步。
 * 收尾步不挂 tools，强制产出最终文本，终止由编排器保证。
 */
export const AGENT_MAX_STEPS = 5;

/**
 * 可运行步数下限（spec D-二期-3）：低余额预检算出的可负担步数低于该值时
 * 直接拒绝（额度不足以支撑有意义的循环），而非降级成质变的单步模式。
 */
export const AGENT_MIN_STEPS = 2;

/** 低余额预检结果：可负担步数与对应的预留输出 token 总量 */
export interface AgentStepBudget {
  steps: number;
  reserveOutputLimit: number;
}

/**
 * 步数 ↔ token 的唯一换算点（评审收敛：预检算步 / 预留总量曾各写一份公式）。
 * 由可用额度与输入估算计算可负担步数；steps < AGENT_MIN_STEPS 时调用方应拒绝。
 * 支持按场景能力包传入特定 maxSteps（例如深度调研 8 步，默认 5 步）。
 */
export function resolveAgentStepBudget(
  availableQuota: number,
  inputEstimate: number,
  maxSteps: number = AGENT_MAX_STEPS
): AgentStepBudget {
  const effectiveMax = Math.max(1, maxSteps);
  const steps = Math.min(
    effectiveMax,
    Math.max(0, Math.floor((availableQuota - inputEstimate) / AGENT_STEP_OUTPUT_LIMIT))
  );
  return { steps, reserveOutputLimit: AGENT_STEP_OUTPUT_LIMIT * steps };
}

/** 满配步数预算：余额预检失败时的兜底（reserve 内部仍是权威校验） */
export function fullAgentStepBudget(maxSteps: number = AGENT_MAX_STEPS): AgentStepBudget {
  const steps = Math.max(1, maxSteps);
  return {
    steps,
    reserveOutputLimit: AGENT_STEP_OUTPUT_LIMIT * steps,
  };
}

/**
 * 单轮工具调用数量上限：决策步一次可返回多个 toolCall，会逐个真实执行（真实上游成本）。
 * 无上限时一轮可被诱导出 N 次出图/抓取，成本与时长双双失控（B-1 审查发现）。
 * 超出上限的调用不执行：仍推成对事件并给模型「未执行」结果，保证协议完整。
 */
export const AGENT_MAX_TOOL_CALLS_PER_ROUND = 3;

/**
 * 每请求全局工具调用数量上限：模型发起的每个工具调用都计数（包含被跳过与被去重的）。
 * 达到上限后模型只能走收尾步，终止多步循环。
 */
export const AGENT_MAX_TOOL_CALLS_TOTAL = 10;

/**
 * 整请求 wall-clock 运行时间预算（毫秒）：从一期「单轮」语义升级为「整个请求」语义。
 * 路由 maxDuration 为 300s，留 60s 余量收口。在每轮决策前与每次工具执行前检查，
 * 耗尽即跳收尾步优雅降级（工具侧沿用现有 skip 机制：不执行、推成对事件、给模型「未执行」结果）。
 */
export const AGENT_RUN_TIME_BUDGET_MS = 240_000;

/**
 * 连败熔断阈值：全局维护「连续工具失败」计数（任一工具成功即清零）。
 * 达到 3 次失败即跳出循环直接进收尾步，避免把步数耗尽在一串报错上。
 */
export const AGENT_MAX_CONSECUTIVE_FAILURES = 3;

/**
 * 每请求出图硬上限（次）：出图无单独计费，一口价内硬顶防止资金敞口刷穿。
 * 第 4 次起走 skip 机制（不执行、推成对事件、注入模型出图次数已用完文案）。
 */
export const AGENT_MAX_IMAGE_GENERATES = 3;

/**
 * 每请求 Webhook 工具调用硬上限（次，spec D-三期-6）：
 * 一口价内硬顶防止资金敞口刷穿，对齐出图上限机制。
 * 第 4 次起走 skip 机制（不发出站请求、推成对事件、注入模型次数已用完文案）。
 */
export const AGENT_MAX_WEBHOOK_CALLS = 3;

/**
 * image_generate 的单次执行超时。
 *
 * 上游 Agnes 出图实测 10.7–13.9s（5 次采样），而通用工具超时是 15s ——
 * 最慢一次只剩 1.1s 余量，上游稍有波动就会被判「超时」。
 * 40s 约等于实测 p100 的 2.9 倍，且仍在 /api/chat 的 300s 预算内
 * （nginx `proxy_read_timeout 300s` 与路由 maxDuration 一致）。
 */
export const AGENT_IMAGE_TOOL_TIMEOUT_MS = 40_000;
