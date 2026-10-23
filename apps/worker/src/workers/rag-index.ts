/**
 * RAG 知识库文档索引队列 Worker
 *
 * 订阅 'rag-index' 队列，消费 Document 上传产生的解析、切片、分词与向量化任务
 */

import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import { resolveBullMQConnectionOptions } from '@repo/shared/server';
import type { RagIndexJobData } from '@repo/queue';
import { processRagIndexJob } from './rag-index/processor';

export const ragIndexWorker = new Worker<RagIndexJobData>(
  'rag-index',
  async (job) => {
    const startedAt = Date.now();
    logger.info('rag-index worker 收到索引任务', {
      jobId: job.id,
      name: job.name,
      documentId: job.data.documentId,
      version: job.data.version,
    });

    const result = await processRagIndexJob(job.data);

    logger.info('rag-index worker 任务处理完毕', {
      jobId: job.id,
      documentId: job.data.documentId,
      version: job.data.version,
      success: result.success,
      chunkCount: result.chunkCount,
      durationMs: Date.now() - startedAt,
    });

    return result;
  },
  {
    autorun: false,
    connection: resolveBullMQConnectionOptions(process.env),
    concurrency: 2,
  }
);
