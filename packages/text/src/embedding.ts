import { embed, embedMany } from 'ai';
import { RAG_EMBEDDING_BATCH_SIZE, RAG_EMBEDDING_MODEL } from '@repo/shared';
import { createEmbeddingModel } from '@repo/providers';
import { logger } from '@repo/logger';

/**
 * 服务端批量向量化政策
 *
 * 契约：
 * - 入库路径统一按 RAG_EMBEDDING_BATCH_SIZE 顺序分批，返回顺序与输入一致。
 * - 每批记录 feature、批次序号、总批数、批大小、耗时与模型，不记录文本内容。
 * - 向量化输入始终是原始正文，不是 contentSegmented。
 * - 错误向上传播，不新增重试策略。
 */

export interface EmbedTextsOptions {
  /** 业务标识，写入用量观测日志（如 rag-index、memory-index、artifact-deposit） */
  feature: string;
  /** 可选的业务上下文（文档 ID、会话 ID 等），不得包含正文 */
  context?: Record<string, unknown>;
}

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: createEmbeddingModel(),
    value: text,
  });
  return embedding;
}

export async function embedTexts(
  texts: string[],
  options: EmbedTextsOptions
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const model = createEmbeddingModel();
  const allEmbeddings: number[][] = [];
  const totalBatches = Math.ceil(texts.length / RAG_EMBEDDING_BATCH_SIZE);

  for (let offset = 0; offset < texts.length; offset += RAG_EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + RAG_EMBEDDING_BATCH_SIZE);
    const batchIndex = Math.floor(offset / RAG_EMBEDDING_BATCH_SIZE) + 1;
    const startedAt = Date.now();

    const { embeddings } = await embedMany({ model, values: batch });
    const durationMs = Date.now() - startedAt;
    allEmbeddings.push(...embeddings);

    logger.info('Embedding 向量化调用完成', {
      ...(options.context ?? {}),
      feature: options.feature,
      batchIndex,
      totalBatches,
      batchSize: batch.length,
      durationMs,
      model: RAG_EMBEDDING_MODEL,
    });
  }

  return allEmbeddings;
}
