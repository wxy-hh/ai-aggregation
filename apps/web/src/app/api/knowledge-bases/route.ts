/**
 * 知识库列表与创建路由（工单 04 / 知识检索 RAG）
 *
 * 接口契约：
 * - GET  /api/knowledge-bases：获取当前用户拥有的知识库列表（附文档统计）
 * - POST /api/knowledge-bases：创建新知识库（入参校验、5 库配额校验超限返回 429）
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/db';
import {
  RAG_CAPACITY_LIMITS,
  RAG_CAPACITY_ERROR_MESSAGES,
} from '@repo/shared';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

// 创建知识库入参模式
const createKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1, '知识库名称不能为空').max(100, '知识库名称不能超过 100 个字符'),
  description: z.string().trim().max(500, '知识库描述不能超过 500 个字符').optional(),
});

/**
 * 获取当前用户的知识库列表
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    const list = await prisma.knowledgeBase.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: {
            documents: {
              where: { deletedAt: null },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const knowledgeBases = list.map((kb) => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      status: kb.status,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
      documentCount: kb._count.documents,
    }));

    return createSuccessResponse({ knowledgeBases });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases] 获取知识库列表失败:', error);
    return ApiError.internalError('获取知识库列表失败，请稍后重试');
  }
}

/**
 * 创建新知识库
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    const parsed = createKnowledgeBaseSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      return ApiError.badRequest(firstError || '知识库参数错误');
    }

    // 容量配额校验（最多 5 个知识库，超出返回 429 与中文配额文案）
    const currentCount = await prisma.knowledgeBase.count({
      where: { userId: user.id },
    });

    if (currentCount >= RAG_CAPACITY_LIMITS.maxKnowledgeBasesPerUser) {
      return ApiError.tooManyRequests(RAG_CAPACITY_ERROR_MESSAGES.maxKnowledgeBases);
    }

    const kb = await prisma.knowledgeBase.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        description: parsed.data.description,
        status: 'active',
      },
    });

    return createSuccessResponse({ knowledgeBase: kb }, '知识库创建成功', 201);
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases] 创建知识库失败:', error);
    return ApiError.internalError('创建知识库失败，请稍后重试');
  }
}
