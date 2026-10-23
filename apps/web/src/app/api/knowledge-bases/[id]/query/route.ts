/**
 * 知识库混合检索调试 API 路由（工单 06 / RAG 混合检索与调试台）
 *
 * 接口契约：
 * - POST /api/knowledge-bases/[id]/query
 *   - 入参：{ query: string, topK?: number }
 *   - 鉴权：严格校验用户登录态与知识库属主（越权/不存在统一返回 404）
 *   - 逻辑：调用 hybridRetrieval 执行向量化、两路并行召回、RRF 排名融合与耗时统计
 *   - 返回：两路 Top-20 原始明细、RRF 融合列表（统一含 CitationAnchor 来源锚点）与耗时统计
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { hybridRetrieval } from '@/lib/rag/hybrid-retrieval';

// 查询入参校验模式
const querySchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, '检索查询词不能为空')
    .max(1000, '查询词长度不能超过 1000 个字符'),
  topK: z
    .number()
    .int('topK 必须为整数')
    .min(1, 'topK 至少为 1')
    .max(50, 'topK 最大不能超过 50')
    .optional()
    .default(20),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    // 1. 鉴权
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId } = await context.params;

    // 2. 校验知识库归属（越权或不存在返回 404）
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!kb || kb.userId !== user.id) {
      return ApiError.notFound('知识库不存在');
    }

    // 3. 解析请求体
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确，必须为 JSON');
    }

    const parsed = querySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      return ApiError.badRequest(firstError || '检索参数错误');
    }

    // 4. 调用混合检索深模块
    const result = await hybridRetrieval({
      userId: user.id,
      knowledgeBaseId,
      query: parsed.data.query,
      topK: parsed.data.topK,
    });

    return createSuccessResponse(result, '检索执行成功');
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/query] 混合检索执行异常:', error);
    return ApiError.internalError('混合检索执行异常，请稍后重试');
  }
}
