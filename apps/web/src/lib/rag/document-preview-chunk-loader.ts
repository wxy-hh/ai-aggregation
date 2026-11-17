/**
 * 文档预览当前版本切片查询适配器 (ADR-0053, C7)
 *
 * DocumentPreviewProjection 决定何时查询切片以及查询哪个版本；
 * 本适配器只把该读取政策落到 Prisma：按文档、知识库、用户与当前版本过滤，
 * 仅取预览所需字段并按 chunkIndex 排序。内容路由只负责装配本适配器。
 */

import { prisma } from '@repo/db';
import type { DocumentPreviewChunk } from './document-preview-contract';
import type { DocumentPreviewDocumentFacts } from './document-preview-projection';

export interface DocumentPreviewChunkScope {
  knowledgeBaseId: string;
  userId: string;
}

/** 构造当前版本切片加载器；ACL 范围由调用方在认证后传入 */
export function createDocumentPreviewChunkLoader(
  scope: DocumentPreviewChunkScope
): (document: DocumentPreviewDocumentFacts) => Promise<DocumentPreviewChunk[]> {
  return async (document) =>
    prisma.documentChunk.findMany({
      where: {
        documentId: document.id,
        knowledgeBaseId: scope.knowledgeBaseId,
        userId: scope.userId,
        documentVersion: document.version,
      },
      orderBy: { chunkIndex: 'asc' },
      select: {
        chunkIndex: true,
        content: true,
        headingPath: true,
        pageNumber: true,
      },
    });
}
