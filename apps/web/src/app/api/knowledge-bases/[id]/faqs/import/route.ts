/**
 * FAQ CSV 批量导入路由 (ADR-0027)
 */

import { NextRequest } from 'next/server';
import { prisma, insertFaqWithQuestions } from '@repo/db';
import { RAG_FAQ_CONFIG } from '@repo/shared';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { embedText } from '@repo/text';
import { segmentFaqText } from '@/lib/rag/faq-service';
import { parseCsvRows, mapCsvToFaqItems } from '@/lib/rag/csv-parser';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId } = await params;

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true, userId: true, status: true },
    });

    if (!kb || kb.userId !== user.id || kb.status === 'archived') {
      return ApiError.notFound('知识库不存在或无权访问');
    }

    let csvText = '';
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      csvText = body?.csv || '';
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (file && typeof file === 'object' && 'text' in file) {
        csvText = await (file as Blob).text();
      }
    } else {
      csvText = await req.text();
    }

    if (!csvText || !csvText.trim()) {
      return ApiError.badRequest('上传的 CSV 文件内容为空');
    }

    const rows = parseCsvRows(csvText);
    const { items, errors } = mapCsvToFaqItems(rows);

    if (items.length === 0 && errors.length > 0) {
      return ApiError.badRequest(`CSV 解析失败: ${errors[0]?.message}`);
    }

    if (items.length > RAG_FAQ_CONFIG.maxBatchImportSize) {
      return ApiError.badRequest(
        `单次最多批量导入 ${RAG_FAQ_CONFIG.maxBatchImportSize} 条问答对，当前上传包含 ${items.length} 条`
      );
    }

    let successCount = 0;
    const executionErrors: Array<{ line: number; message: string }> = [...errors];

    // 逐条插入并向量化
    for (const item of items) {
      try {
        await insertFaqWithQuestions({
          userId: user.id,
          knowledgeBaseId,
          question: item.question,
          answer: item.answer,
          similarQuestions: item.similarQuestions,
          enabled: true,
          embedFn: embedText,
          tokenizeFn: segmentFaqText,
        });
        successCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '保存失败';
        executionErrors.push({
          line: item.rawLine,
          message: `第 ${item.rawLine} 行保存失败: ${errorMsg}`,
        });
      }
    }

    return createSuccessResponse({
      total: items.length,
      successCount,
      failureCount: executionErrors.length,
      errors: executionErrors,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[faqs] CSV 导入失败:', error);
    return ApiError.internalError('CSV 导入执行异常，请稍后重试');
  }
}
