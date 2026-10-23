/**
 * 单个知识库详情、更新与删除路由（工单 04 / 知识检索 RAG）
 *
 * 接口契约：
 * - GET    /api/knowledge-bases/[id]：获取知识库详情与文档统计（越权/不存在 404）
 * - PATCH  /api/knowledge-bases/[id]：重命名、修改描述或归档 (status="archived")（越权/不存在 404）
 * - DELETE /api/knowledge-bases/[id]：删除指定知识库（越权/不存在 404）
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 更新知识库入参模式
const updateKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1, '知识库名称不能为空').max(100, '知识库名称不能超过 100 个字符').optional(),
  description: z.string().trim().max(500, '知识库描述不能超过 500 个字符').nullable().optional(),
  status: z.enum(['active', 'archived'], {
    errorMap: () => ({ message: '状态只能为 active 或 archived' }),
  }).optional(),
});

/**
 * 获取单个知识库详情
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id } = await context.params;

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            documents: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!kb || kb.userId !== user.id) {
      return ApiError.notFound('知识库不存在');
    }

    return createSuccessResponse({
      knowledgeBase: {
        id: kb.id,
        name: kb.name,
        description: kb.description,
        status: kb.status,
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
        documentCount: kb._count.documents,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/[id]] 获取知识库失败:', error);
    return ApiError.internalError('获取知识库失败，请稍后重试');
  }
}

/**
 * 更新知识库（重命名、修改描述、归档）
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id } = await context.params;

    const existing = await prisma.knowledgeBase.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      return ApiError.notFound('知识库不存在');
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    const parsed = updateKnowledgeBaseSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      return ApiError.badRequest(firstError || '请求参数错误');
    }

    const updateData: {
      name?: string;
      description?: string | null;
      status?: string;
    } = {};

    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name;
    }
    if (parsed.data.description !== undefined) {
      updateData.description = parsed.data.description;
    }
    if (parsed.data.status !== undefined) {
      updateData.status = parsed.data.status;
    }

    const updated = await prisma.knowledgeBase.update({
      where: { id },
      data: updateData,
    });

    return createSuccessResponse(
      { knowledgeBase: updated },
      '知识库更新成功'
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/[id]] 更新知识库失败:', error);
    return ApiError.internalError('更新知识库失败，请稍后重试');
  }
}

/**
 * 删除指定知识库
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id } = await context.params;

    const existing = await prisma.knowledgeBase.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      return ApiError.notFound('知识库不存在');
    }

    await prisma.knowledgeBase.delete({
      where: { id },
    });

    return createSuccessResponse(null, '知识库删除成功');
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/[id]] 删除知识库失败:', error);
    return ApiError.internalError('删除知识库失败，请稍后重试');
  }
}
