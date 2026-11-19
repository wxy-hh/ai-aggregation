/**
 * FAQ 全量 CSV 导出路由 (ADR-0027)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getFaqsByKnowledgeBase } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, handleAuthError } from '@/lib/api/responses';
import { formatFaqsToCsv } from '@/lib/rag/csv-parser';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId } = await params;

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true, userId: true, name: true, status: true },
    });

    if (!kb || kb.userId !== user.id || kb.status === 'archived') {
      return ApiError.notFound('知识库不存在或无权访问');
    }

    // 获取当前库全部 FAQ（最多 500 条）
    const faqs = await getFaqsByKnowledgeBase(user.id, knowledgeBaseId, {
      page: 1,
      pageSize: 500,
    });

    const csvContent = formatFaqsToCsv(faqs);
    const safeKbName = encodeURIComponent(kb.name || 'faqs');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeKbName}-faq-export.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[faqs] 导出 CSV 失败:', error);
    return ApiError.internalError('导出 CSV 失败，请稍后重试');
  }
}
