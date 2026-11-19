/**
 * 对话消息智能提炼 FAQ API (ADR-0034 / AGENT-KB-LOOP)
 *
 * 接口契约：
 * POST /api/chat/distill-faq
 * - 输入：{ userQuery: string, aiResponse: string }
 * - 鉴权：需要登录（未登录 401）
 * - 提炼：调用快速轻量模型生成标准独立问题、权威结论与相似问
 * - 容灾：施加 2500ms 超时防线；超时或异常平滑降级为原始消息截取（isFallback: true）
 */

import { NextRequest } from 'next/server';
import { generateText } from 'ai';
import { createProvider } from '@repo/providers';
import {
  distillFaqRequestSchema,
  distillFaqResponseSchema,
  type DistillFaqResponseData,
} from '@repo/shared';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

const DISTILL_SYSTEM_PROMPT = `你是一个高精度知识库 FAQ 提炼专家。请将用户与 AI 的单轮对话，提炼为知识库的标准问答对与相似问。
提炼要求：
1. question: 将用户的口语化提问转化为独立、自包含的标准业务问题（去除“请问”、“那个”、“你能帮我”等前缀、上下文代词与口语助词）；
2. answer: 提纯 AI 回答的核心事实与权威结论（去除“好的”、“正如上文所述”等前置/后置寒暄客套话，保持客观准确）；
3. similarQuestions: 生成 2~3 个同义扩展问法，涵盖不同表达习惯或近义句式。
请必须以纯 JSON 格式输出，不要包含 markdown 代码块包裹，格式如下：
{
  "question": "标准问题",
  "answer": "提纯后的答案",
  "similarQuestions": ["相似问1", "相似问2"]
}`;

function buildFallbackResult(userQuery: string, aiResponse: string): DistillFaqResponseData {
  const cleanQ = userQuery.replace(/^(请问|请教下|想问下|帮我问下|请|问)[，,\s]*/g, '').trim();
  const similar: string[] = [];
  if (cleanQ.includes('区别')) {
    similar.push(cleanQ.replace('区别', '差异'));
    similar.push(cleanQ.replace('区别', '不同之处'));
  }
  if (cleanQ.includes('怎么')) {
    similar.push(cleanQ.replace('怎么', '如何'));
    similar.push(cleanQ.replace('怎么', '怎样'));
  }
  if (similar.length === 0) {
    similar.push(`关于${cleanQ.slice(0, 30)}的详细解答`);
    similar.push(`${cleanQ.slice(0, 30)}相关概念`);
  }
  return {
    question: (cleanQ || userQuery).slice(0, 200),
    answer: aiResponse.trim().slice(0, 3000),
    similarQuestions: similar.slice(0, 3),
    isFallback: true,
  };
}

export async function POST(req: NextRequest) {
  try {
    await getCurrentUser(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('无效的 JSON 请求体');
    }

    const parseResult = distillFaqRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || '请求参数格式错误';
      return ApiError.badRequest(firstError);
    }

    const { userQuery, aiResponse } = parseResult.data;

    // 施加统一超时限制与模型调用保护 (2s 体验 SLA 边界)
    const DISTILL_TIMEOUT_MS = 1800;
    let distillResult: DistillFaqResponseData | null = null;
    let timerId: NodeJS.Timeout | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(new Error('LLM_TIMEOUT')), DISTILL_TIMEOUT_MS);
      });

      const modelCallPromise = (async () => {
        const aiProvider = createProvider('doubao');
        const model = aiProvider('doubao-seed-evolving');

        const { text } = await generateText({
          model,
          system: DISTILL_SYSTEM_PROMPT,
          prompt: `用户提问：\n${userQuery}\n\nAI 回复：\n${aiResponse}`,
          temperature: 0.1,
        });

        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const json = JSON.parse(cleaned);

        return {
          question: String(json.question || userQuery).slice(0, 200),
          answer: String(json.answer || aiResponse).slice(0, 3000),
          similarQuestions: Array.isArray(json.similarQuestions)
            ? json.similarQuestions.map((q: unknown) => String(q).trim()).filter(Boolean).slice(0, 5)
            : [],
          isFallback: false,
        };
      })();

      distillResult = await Promise.race([modelCallPromise, timeoutPromise]);
    } catch (llmErr) {
      console.warn('[distill-faq] 模型语义提炼异常或超时，平滑降级为原文截取:', llmErr);
      distillResult = buildFallbackResult(userQuery, aiResponse);
    } finally {
      if (timerId) clearTimeout(timerId);
    }

    if (!distillResult) {
      distillResult = buildFallbackResult(userQuery, aiResponse);
    }

    // 校验输出结构合规性
    const validated = distillFaqResponseSchema.parse(distillResult);
    return createSuccessResponse(validated);
  } catch (err: unknown) {
    if (err instanceof AuthError || (err as { name?: string })?.name === 'AuthError') {
      return handleAuthError(err as AuthError);
    }
    console.error('[distill-faq] 接口未捕获异常:', err);
    return ApiError.internalError('提炼 FAQ 异常，请稍后重试');
  }
}
