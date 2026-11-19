/**
 * Agent 独立质检节点 (Evaluator Node) (AGENT-EVAL-CHECK / ADR-0039)
 *
 * 职责：
 * 在智能体多步决策结束后、进入长篇收尾步（Summary Step）之前，
 * 对已有工具调用的检索内容进行轻量结构化质检，重点防御「实体遗漏」与「事实真空」两大致命缺陷。
 *
 * 核心设计准则：
 * 1. 极窄 Token 预算：maxOutputTokens <= 256；
 * 2. 快速熔断与 Fail-Open 降级：默认 5000ms 超时，遇超时或解析异常一律安全放行（passed: true）；
 * 3. 严格规则收敛：仅对客观实体遗漏和事实真空打回，宽松放行其他主观风格，杜绝误判死循环；
 * 4. 可观测性追踪：集成 Langfuse 独立 Generation 埋点；
 * 5. 提示词工程模板收拢：提供统一的自愈反思提示词与局限性约束提示词构造函数。
 */

import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { ObservabilityTrace } from '@/lib/observability/langfuse-client';
import { normalizeUsage } from '@/lib/ai-usage';

/** 质检结果 Zod 校验模型 */
export const agentEvaluationResultSchema = z.object({
  passed: z.boolean(),
  missingAspects: z.array(z.string()).default([]),
  suggestion: z.string().optional(),
});

export interface AgentEvaluationResult {
  passed: boolean;
  missingAspects: string[];
  suggestion?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EvaluatorOptions {
  model: LanguageModel;
  userPrompt: string;
  toolResultsSummary: string;
  planTitle?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  trace?: ObservabilityTrace;
}

const EVALUATOR_SYSTEM_PROMPT = `你是一个严谨客观的智能体执行质检员。你的职责是在回答生成前，检查前序工具收集到的材料是否足以支撑最终回答。
请对照用户原始问题与检索材料，审查以下两大致命缺陷：
1. 【核心实体覆盖】：用户明确要求调研/对比的多个实体是否均有涉及？（例如提问“对比A、B和C”，若完全未检索C，则属于致命遗漏）；
2. 【事实真空】：工具调用是否全军覆没、返回404或全为空，导致缺乏任何事实抓手凭空捏造？

判定原则：
- 若材料大体具备核心事实，即使不够极致完美，也必须判定 passed: true（宽松放行，拒绝主观苛责）；
- 仅在存在上述两大致命缺陷时才判定 passed: false，并给出具体缺失的实体或建议。

输出必须为纯 JSON，不要包含任何 markdown 代码块（如 \`\`\`json）或任何额外文字：
{
  "passed": true或false,
  "missingAspects": ["缺失的实体或维度，无则为空数组"],
  "suggestion": "一句话改进建议，指导下一轮补充检索什么"
}`;

/**
 * 构造自愈反思进度提示（透出给 UI/事件流）
 */
export function buildRemedyNote(missingAspects: string[]): string {
  const missingText = missingAspects.join('、');
  return `质检反思：检测到材料尚缺关键信息${missingText ? `（${missingText}）` : ''}，正在定向补充检索...`;
}

/**
 * 构造自愈反思引导语（注入给模型的决策历史）
 */
export function buildRemedyNudge(suggestion?: string): string {
  return `【质检反思提示】：经前期检索材料评估，发现尚存关键缺陷：${suggestion || '材料不充分'}。请定向调用工具补充检索上述缺失信息，切勿无依据直接回答。`;
}

/**
 * 构造最终诚实局限性约束（注入给长文收尾步提示词）
 */
export function buildLimitationPrompt(missingAspects: string[]): string {
  return `【诚实回答局限性约束】：经前序材料质检评估，仍缺少以下关键信息：${missingAspects.join('、') || '部分关键细节'}。请在最终回答中如实陈述由于检索限制无法获得该部分内容，切勿凭空编造事实。`;
}

/**
 * 提取对话消息列表中的最后一条用户提问文本（纯函数，强类型，无 any，安全提取纯文本）
 */
export function extractUserPrompt(messages: Array<{ role: string; content: unknown }>): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return '';
  if (typeof lastUser.content === 'string') {
    return lastUser.content.trim();
  }
  if (Array.isArray(lastUser.content)) {
    return lastUser.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (
          typeof part === 'object' &&
          part !== null &&
          'text' in part &&
          typeof (part as { text: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
}

/**
 * 清洗可能被 Markdown 围栏包裹的代码块文本
 */
export function sanitizeJsonString(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * 执行智能体信息充分度质检
 */
export async function evaluateAgentProgress(
  options: EvaluatorOptions
): Promise<AgentEvaluationResult> {
  const {
    model,
    userPrompt,
    toolResultsSummary,
    planTitle,
    signal,
    timeoutMs = 5000,
    trace,
  } = options;

  // 兜底安全放行对象
  const fallbackPassedResult: AgentEvaluationResult = {
    passed: true,
    missingAspects: [],
  };

  // 父级中断或无检索材料时，直接安全放行
  if (signal?.aborted || !toolResultsSummary || toolResultsSummary.trim() === '') {
    return fallbackPassedResult;
  }

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);
  const onParentAbort = () => abortController.abort();
  if (signal) {
    signal.addEventListener('abort', onParentAbort, { once: true });
  }

  const startTime = new Date();
  const evalInput = [
    `【用户原始提问】：${userPrompt}`,
    planTitle ? `【任务规划全局目标】：${planTitle}` : null,
    `【前序工具检索与收集到的材料摘要】：\n${toolResultsSummary}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const result = await generateText({
      model,
      system: EVALUATOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: evalInput }],
      maxOutputTokens: 256,
      abortSignal: abortController.signal,
    });

    // 模型已返回即已产生 Token 消耗，先算出 usage，解析失败的兜底结果同样计入会话结算 (US13)
    const norm = normalizeUsage(result.usage);
    const usage =
      norm && norm.totalTokens !== null
        ? {
            promptTokens: norm.inputTokens ?? 0,
            completionTokens: norm.outputTokens ?? 0,
            totalTokens: norm.totalTokens ?? 0,
          }
        : undefined;

    // 可观测性追踪 Generation 记录 (工单 01)：解析失败的兜底放行同样记录，保证每一次质检均可追溯 (US12)
    const recordGeneration = (output: string, metadata: Record<string, unknown>) => {
      if (!trace) return;
      const gen = trace.generation({
        name: 'evaluator_check',
        model: typeof model === 'object' && model !== null && 'modelId' in model ? String((model as { modelId: string }).modelId) : 'agent-evaluator',
        input: [
          { role: 'system', content: EVALUATOR_SYSTEM_PROMPT },
          { role: 'user', content: evalInput },
        ],
        output,
        usage:
          norm && norm.totalTokens !== null
            ? {
                promptTokens: norm.inputTokens ?? undefined,
                completionTokens: norm.outputTokens ?? undefined,
                totalTokens: norm.totalTokens ?? undefined,
              }
            : undefined,
        usageType: norm && norm.totalTokens !== null ? 'actual' : 'missing',
        startTime,
        endTime: new Date(),
        metadata: { ...metadata, timeoutMs },
      });
      gen.end();
    };

    const cleaned = sanitizeJsonString(result.text);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch {
      console.warn('[evaluator] 质检结果 JSON 解析失败，Fail-open 放行:', result.text.slice(0, 100));
      recordGeneration(result.text, { passed: true, missingAspectsCount: 0, fallbackReason: 'json_parse_failed' });
      return { ...fallbackPassedResult, usage };
    }

    const validated = agentEvaluationResultSchema.safeParse(parsedJson);
    if (!validated.success) {
      console.warn('[evaluator] 质检 Schema 校验未通过，Fail-open 放行:', validated.error.message);
      recordGeneration(result.text, { passed: true, missingAspectsCount: 0, fallbackReason: 'schema_invalid' });
      return { ...fallbackPassedResult, usage };
    }

    const parsed = validated.data;
    recordGeneration(JSON.stringify(parsed), {
      passed: parsed.passed,
      missingAspectsCount: parsed.missingAspects.length,
    });

    return {
      passed: parsed.passed,
      missingAspects: parsed.missingAspects ?? [],
      suggestion: parsed.suggestion,
      usage,
    };
  } catch (error) {
    console.warn('[evaluator] 质检执行异常或超时，Fail-open 放行:', error instanceof Error ? error.message : String(error));
    return fallbackPassedResult;
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', onParentAbort);
    }
  }
}
