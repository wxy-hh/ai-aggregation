/**
 * RAG 文档索引任务核心处理器 (Processor)
 *
 * 核心设计契约：
 * 1. 下载：通过 @repo/storage 下载文档 Buffer
 * 2. 解析：PDF/MD/TXT 文本提取与 500~800 tokens 语义切块
 * 3. 分词：jieba 中文分词，空格分隔写入分词列
 * 4. 向量化：embedMany 批量调用（<=64 条/批），记录用量观测日志（feature='rag-index'，不扣配额）
 * 5. 事务入库：同一事务内原子删除旧版本切片 + 插入新版本切片 + 更新 Document 状态为 ready 与 chunkCount
 * 6. 异常控制：区分致命错误（文件损坏、空内容直接置 failed 中文原因不重试）与瞬态错误（交由 BullMQ 重试）
 */

import { embedMany } from 'ai';
import type { EmbeddingModel } from 'ai';
import { logger } from '@repo/logger';
import { prisma, replaceDocumentChunksInTransaction } from '@repo/db';
import { createStorageProvider, StorageProvider } from '@repo/storage';
import { createEmbeddingModel } from '@repo/providers';
import { RAG_EMBEDDING_BATCH_SIZE, RAG_EMBEDDING_MODEL } from '@repo/shared';
import type { RagIndexJobData } from '@repo/queue';
import { parseDocument, DocumentParseError, ParsedChunk } from './parser';

export interface ProcessRagIndexDependencies {
  storage?: StorageProvider;
  embedManyFn?: typeof embedMany;
  replaceChunksFn?: typeof replaceDocumentChunksInTransaction;
  prismaClient?: typeof prisma;
  embeddingModel?: EmbeddingModel;
}

export interface ProcessRagIndexResult {
  success: boolean;
  documentId: string;
  version: number;
  chunkCount: number;
  errorMessage?: string;
  isFatal?: boolean;
}

/**
 * 处理单篇 RAG 文档索引任务的主流管道函数
 */
export async function processRagIndexJob(
  jobData: RagIndexJobData,
  deps: ProcessRagIndexDependencies = {}
): Promise<ProcessRagIndexResult> {
  const { documentId, knowledgeBaseId, userId, version, storageKey, fileName } = jobData;
  const db = deps.prismaClient || prisma;
  const storage = deps.storage || createStorageProvider();
  const embedBatch = deps.embedManyFn || embedMany;
  const replaceChunks = deps.replaceChunksFn || replaceDocumentChunksInTransaction;

  logger.info('开始处理 RAG 文档索引任务', {
    documentId,
    knowledgeBaseId,
    userId,
    version,
    fileName,
  });

  // 1. 查询并校验文档存在性（已软删除文档终止索引）
  const doc = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!doc || doc.deletedAt !== null) {
    logger.warn('RAG 文档不存在或已被软删除，跳过索引', { documentId });
    return {
      success: false,
      documentId,
      version,
      chunkCount: 0,
      errorMessage: '文档不存在或已删除',
    };
  }

  // 2. 将文档状态标记为处理中 (processing)
  await db.document.update({
    where: { id: documentId },
    data: {
      status: 'processing',
      errorMessage: null,
    },
  });

  let parsedChunks: ParsedChunk[];
  try {
    // 3. 从对象存储下载文件
    const fileBuffer = await storage.download(storageKey);

    // 4. 解析文档并执行语义切块与中文分词
    parsedChunks = await parseDocument(fileBuffer, fileName);
  } catch (error) {
    if (error instanceof DocumentParseError && error.isFatal) {
      // 永久性致命格式错误（损坏 PDF、空文件、不支持类型）：立即置 failed 并记录中文原因，不向外抛错以避免死循环重试
      logger.error('RAG 文档解析失败（致命错误，终止重试）', error, {
        documentId,
        fileName,
      });

      await db.document.update({
        where: { id: documentId },
        data: {
          status: 'failed',
          errorMessage: error.message,
        },
      });

      return {
        success: false,
        documentId,
        version,
        chunkCount: 0,
        errorMessage: error.message,
        isFatal: true,
      };
    }

    // 下载失败或其他未知异常：记录状态并向外抛出交由 BullMQ 重试
    const errorMsg = error instanceof Error ? error.message : '文档下载或解析异常';
    logger.error('RAG 文档处理阶段出现异常', error as Error, { documentId });

    await db.document.update({
      where: { id: documentId },
      data: {
        status: 'failed',
        errorMessage: `处理异常: ${errorMsg}`,
      },
    });

    throw error;
  }

  // 5. 批量向量化 (embedMany)
  const embeddingModel = deps.embeddingModel || createEmbeddingModel();
  const allEmbeddings: number[][] = [];
  const totalBatches = Math.ceil(parsedChunks.length / RAG_EMBEDDING_BATCH_SIZE);

  try {
    for (let i = 0; i < parsedChunks.length; i += RAG_EMBEDDING_BATCH_SIZE) {
      const batchChunks = parsedChunks.slice(i, i + RAG_EMBEDDING_BATCH_SIZE);
      const batchValues = batchChunks.map((c) => c.content);
      const batchIndex = Math.floor(i / RAG_EMBEDDING_BATCH_SIZE) + 1;
      const startedAt = Date.now();

      const { embeddings } = await embedBatch({
        model: embeddingModel,
        values: batchValues,
      });

      const durationMs = Date.now() - startedAt;
      allEmbeddings.push(...embeddings);

      // 记录用量观测结构化日志（feature='rag-index'，不扣配额）
      logger.info('Embedding 向量化调用完成', {
        feature: 'rag-index',
        documentId,
        userId,
        batchIndex,
        totalBatches,
        batchSize: batchChunks.length,
        durationMs,
        model: RAG_EMBEDDING_MODEL,
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Embedding 接口调用失败';
    logger.error('RAG 文档向量化失败', error as Error, { documentId });

    await db.document.update({
      where: { id: documentId },
      data: {
        status: 'failed',
        errorMessage: `向量化失败: ${errorMsg}`,
      },
    });

    throw error;
  }

  // 6. 构造入库切片数据结构
  const chunksToInsert = parsedChunks.map((chunk, idx) => ({
    documentId,
    knowledgeBaseId,
    userId,
    documentVersion: version,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    contentSegmented: chunk.contentSegmented,
    headingPath: chunk.headingPath,
    pageNumber: chunk.pageNumber,
    tokenCount: chunk.tokenCount,
    metadata: {
      fileName,
      storageKey,
    },
    embedding: allEmbeddings[idx],
  }));

  // 7. 事务内原子删旧版本切片 + 插入新切片 + 更新 Document 状态为 ready 与 chunkCount
  try {
    await replaceChunks({
      documentId,
      version,
      chunks: chunksToInsert,
    });

    logger.info('RAG 文档索引成功入库', {
      documentId,
      version,
      chunkCount: chunksToInsert.length,
    });

    return {
      success: true,
      documentId,
      version,
      chunkCount: chunksToInsert.length,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '数据库事务提交失败';
    logger.error('RAG 文档切片事务落库失败', error as Error, { documentId });

    await db.document.update({
      where: { id: documentId },
      data: {
        status: 'failed',
        errorMessage: `切片落库失败: ${errorMsg}`,
      },
    });

    throw error;
  }
}
