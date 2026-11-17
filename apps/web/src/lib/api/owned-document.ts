/**
 * 知识库单文档归属读取 (ADR-0053, C7)
 *
 * 内容路由与下载路由共享同一认证后的归属校验骨架：
 * 先校验知识库归属，再校验未软删除且归属当前用户的文档。
 * 越权与不存在统一映射为既有 404 文案，由调用方直接返回。
 */

import type { NextResponse } from 'next/server';
import { prisma, type Document } from '@repo/db';
import { ApiError } from '@/lib/api/responses';

export type OwnedDocumentFailureReason = 'knowledgeBaseNotFound' | 'documentNotFound';

export type OwnedDocumentResult =
  | { ok: true; document: Document }
  | { ok: false; reason: OwnedDocumentFailureReason; response: NextResponse };

/** 校验知识库与文档所属权，并加载未软删除的文档全量事实 */
export async function loadOwnedDocument(params: {
  userId: string;
  knowledgeBaseId: string;
  docId: string;
}): Promise<OwnedDocumentResult> {
  const { userId, knowledgeBaseId, docId } = params;

  // 1. 严格校验知识库存在性与归属（越权访问统一 404）
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
    select: { id: true, userId: true },
  });

  if (!kb || kb.userId !== userId) {
    return {
      ok: false,
      reason: 'knowledgeBaseNotFound',
      response: ApiError.notFound('知识库不存在'),
    };
  }

  // 2. 严格校验目标文档存在性、未软删除且归属当前用户
  const document = await prisma.document.findFirst({
    where: {
      id: docId,
      knowledgeBaseId,
      userId,
      deletedAt: null,
    },
  });

  if (!document) {
    return {
      ok: false,
      reason: 'documentNotFound',
      response: ApiError.notFound('文档不存在'),
    };
  }

  return { ok: true, document };
}
