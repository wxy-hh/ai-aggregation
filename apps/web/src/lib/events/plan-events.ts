/**
 * 智能体计划卡片埋点 (AGENT-PLAN-DAG / ADR-0038)
 *
 * 隐私红线：props 仅包含 planId、stepCount、action 枚举；
 * 绝不携带任务标题、正文文本或步骤说明。
 */

import type { PlanEventName, PlanEventProps } from '@/schemas/product-event.schema';
import { trackEvent } from './tracker';

export function trackPlanEvent(event: PlanEventName, props: PlanEventProps): void {
  trackEvent(event, props);
}

/**
 * 计算计划执行完成率（0 ~ 1 之间的浮点数）
 */
export function calculatePlanCompletionRate(steps: Array<{ status: string }>): number {
  if (!steps.length) return 0;
  const completed = steps.filter((s) => s.status === 'completed').length;
  return Math.round((completed / steps.length) * 100) / 100;
}

/**
 * 智能体运行全周期指标
 */
export interface AgentRunMetric {
  planId: string;
  durationMs: number;
  stepCount: number;
  completionRate: number;
}

/**
 * 记录全周期智能体运行指标 (TC05-2 / [P-M6])
 */
export function recordAgentRunMetric(metric: AgentRunMetric): AgentRunMetric {
  return metric;
}
