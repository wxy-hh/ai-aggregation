/**
 * Agent 前置规划节点 (Planner Node) (AGENT-PLAN-DAG / ADR-0038)
 *
 * 职责：
 * 在多步智能体循环开始前，前置驱动模型输出结构化阶段检查点（Checkpoints）。
 * 强约束 Token 预算（≤ 512 Tokens），带 6s 快速规划超时与 Zod 校验，
 * 失败时平滑降级（返回 null），由编排器走常规 ReAct 循环。
 */

import { generateText, type ModelMessage } from 'ai';
import { agentPlanSchema, type AgentPlan } from '@repo/shared';

export interface PlannerOptions {
  model: any;
  messages: ModelMessage[];
  system?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const PLANNER_SYSTEM_PROMPT = `你是一个专业的任务规划专家。你的任务是根据用户的提问与诉求，将任务目标拆解为 3~5 个清晰、有序、递进的阶段检查点（Checkpoints）。
必须以纯 JSON 格式输出，不要包含任何 markdown 代码块（如 \`\`\`json）或任何额外文字。
JSON 格式要求如下：
{
  "title": "任务全局目标简短描述（15字以内）",
  "steps": [
    { "id": "step-1", "title": "阶段一动作描述", "status": "pending" },
    { "id": "step-2", "title": "阶段二动作描述", "status": "pending" },
    { "id": "step-3", "title": "阶段三动作描述", "status": "pending" }
  ]
}`;

export async function generateAgentPlan(options: PlannerOptions): Promise<AgentPlan | null> {
  const { model, messages, system, signal, timeoutMs = 6000 } = options;

  // 提取最后一条用户输入
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) {
    return null;
  }

  // 提取用户输入文本
  const userText =
    typeof lastUserMessage.content === 'string'
      ? lastUserMessage.content.trim()
      : Array.isArray(lastUserMessage.content)
        ? (lastUserMessage.content as any[])
            .map((c) => (typeof c === 'string' ? c : c.text || ''))
            .join(' ')
            .trim()
        : '';

  // 简单问候或单步提问不触发规划（TC03-6 / [P-W4]），用户人工干预续跑时也不重复覆盖计划（[P-M1]）
  if (
    !userText ||
    userText.startsWith('请根据已调整的计划继续执行') ||
    (userText.length < 8 && /^(你好|hi|hello|在吗|您好|哈喽|早上好|晚上好|测试|test)/i.test(userText))
  ) {
    return null;
  }

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);
  const onAbort = () => abortController.abort();
  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const result = await generateText({
      model,
      system: [system, PLANNER_SYSTEM_PROMPT].filter(Boolean).join('\n\n'),
      messages: [{ role: 'user', content: `请针对以下用户请求制定阶段执行计划：\n${userText}` }],
      maxOutputTokens: 512,
      abortSignal: abortController.signal,
    });

    const rawText = result.text.trim();
    // 容错处理：清除可能被包裹的 ```json 围栏
    const jsonStr = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(jsonStr);
    const planCandidate = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: parsed.title || '任务执行计划',
      steps: (parsed.steps || []).map((s: { id?: string; title?: string }, idx: number) => ({
        id: s.id || `step-${idx + 1}`,
        title: s.title || `步骤 ${idx + 1}`,
        status: 'pending' as const,
      })),
      createdAt: Date.now(),
    };

    const validated = agentPlanSchema.safeParse(planCandidate);
    if (!validated.success) {
      console.warn('[planner] 规划 Schema 校验未通过，降级处理:', validated.error.message);
      return null;
    }

    return validated.data;
  } catch (err) {
    console.warn('[planner] 规划调用失败或超时，平滑降级为常规循环:', err);
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}
