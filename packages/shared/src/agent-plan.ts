/**
 * Agent 显式计划与阶段检查点契约及纯函数状态机 (AGENT-PLAN-DAG / ADR-0038)
 *
 * 领域概念参考 `GLOSSARY.md`：
 * - AgentPlan: 智能体计划，目标路径与阶段集合
 * - Checkpoint: 阶段检查点，具备明确生命周期与工具关联
 * - PlanIntervention: 用户对未执行步骤的干预调整
 * - OptimisticExecution: 计划生成后立即自动推进执行首步
 */

import { z } from 'zod';

/** 阶段检查点状态枚举 */
export const planStepStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type PlanStepStatus = z.infer<typeof planStepStatusSchema>;

/** 单个阶段检查点模型 */
export const planStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: planStepStatusSchema,
  summary: z.string().optional(),
  toolCallIds: z.array(z.string()).optional(),
});
export type PlanStep = z.infer<typeof planStepSchema>;

/** 完整的智能体执行计划模型 */
export const agentPlanSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  steps: z.array(planStepSchema).min(1).max(8),
  createdAt: z.number().int().positive().optional(),
});
export type AgentPlan = z.infer<typeof agentPlanSchema>;

/**
 * 纯函数：更新计划中某个步骤的状态与可选摘要
 */
export function updatePlanStepStatus(
  plan: AgentPlan,
  stepId: string,
  status: PlanStepStatus,
  summary?: string
): AgentPlan {
  const stepIndex = plan.steps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) {
    return plan;
  }

  const newSteps = plan.steps.map((step, idx) => {
    if (idx !== stepIndex) return step;
    return {
      ...step,
      status,
      ...(summary !== undefined ? { summary } : {}),
    };
  });

  return {
    ...plan,
    steps: newSteps,
  };
}

/**
 * 纯函数：将工具调用 ID 归属到当前处于 running 状态的步骤
 */
export function attachToolCallToRunningStep(plan: AgentPlan, callId: string): AgentPlan {
  const runningIndex = plan.steps.findIndex((s) => s.status === 'running');
  if (runningIndex === -1) {
    return plan;
  }

  const newSteps = plan.steps.map((step, idx) => {
    if (idx !== runningIndex) return step;
    const existing = step.toolCallIds ?? [];
    if (existing.includes(callId)) return step;
    return {
      ...step,
      toolCallIds: [...existing, callId],
    };
  });

  return {
    ...plan,
    steps: newSteps,
  };
}

/**
 * 纯函数：会话结束、中止或失败时的计划状态最终收尾
 */
export function finalizePlanExecution(
  plan: AgentPlan,
  outcome: 'completed' | 'aborted' | 'failed',
  errorReason?: string
): AgentPlan {
  if (outcome === 'completed') {
    return plan;
  }

  const defaultSummary = outcome === 'aborted' ? '用户中途中止执行' : (errorReason || '执行异常终止');

  const newSteps = plan.steps.map((step) => {
    if (step.status === 'completed') {
      return step;
    }
    if (step.status === 'running') {
      return {
        ...step,
        status: 'failed' as PlanStepStatus,
        summary: defaultSummary,
      };
    }
    if (step.status === 'pending') {
      return {
        ...step,
        status: 'skipped' as PlanStepStatus,
      };
    }
    return step;
  });

  return {
    ...plan,
    steps: newSteps,
  };
}

/**
 * 纯函数：应用用户干预调整 (PlanIntervention)
 *
 * 允许用户修改尚未执行的步骤描述或标记为 skipped，保留已完成步骤的状态
 */
export function applyUserPlanIntervention(plan: AgentPlan, newSteps: PlanStep[]): AgentPlan {
  return {
    ...plan,
    steps: newSteps,
  };
}
