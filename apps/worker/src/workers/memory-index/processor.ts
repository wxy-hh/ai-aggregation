/**
 * 会话记忆增量索引核心处理器 (Memory Index Processor)
 *
 * 核心设计契约：
 * 1. 严格 Opt-in 门禁：先检查用户 memorySearchEnabled，若未开启或已关闭立即终止（隐私保障，QA-005/006）
 * 2. 消息增量水位线：结合已有切片的最大 chunkIndex 与已索引消息时间戳/ID，只处理未索引的新消息对
 * 3. 语义切块与分词：使用 RecursiveCharacterTextSplitter 切块，并通过统一应用层分词 module 写入分词列
 * 4. 向量化：通过统一批量向量化政策调用 BAAI/bge-m3 生成 1024 维向量，记录逐批用量日志（feature='memory-index'，不扣配额）
 * 5. 幂等入库：基于 (session_id, chunk_index) 递增写入 conversation_memory_chunks
 * 6. 依赖注入：支持注入 mock 数据库客户端与批量向量化入口，支持脱机确定性单测
 */

import { embedTexts, segmentForIndex } from '@repo/text';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { logger } from '@repo/logger';
import { prisma, insertMemoryChunks, type InsertMemoryChunkInput } from '@repo/db';
import { estimateTokenCount } from '@repo/shared';
import type { MemoryIndexJobData } from '@repo/queue';

export interface ProcessMemoryIndexDependencies {
  prismaClient?: typeof prisma;
  embedTextsFn?: typeof embedTexts;
  insertChunksFn?: typeof insertMemoryChunks;
}

export interface ProcessMemoryIndexResult {
  success: boolean;
  sessionId: string;
  chunkCount: number;
  skipped?: boolean;
  reason?: string;
}

/**
 * 处理单次会话记忆增量索引任务的主管道函数
 */
export async function processMemoryIndexJob(
  jobData: MemoryIndexJobData,
  deps: ProcessMemoryIndexDependencies = {}
): Promise<ProcessMemoryIndexResult> {
  const { userId, sessionId } = jobData;
  const db = deps.prismaClient || prisma;
  const embedAll = deps.embedTextsFn || embedTexts;

  logger.info('开始处理会话记忆增量索引任务', { userId, sessionId });

  // 1. 严格 Opt-in 开关检查：用户未开启时绝不建立索引
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { memorySearchEnabled: true },
  });

  if (!user || !user.memorySearchEnabled) {
    logger.info('用户未开启或已关闭会话记忆检索，跳过记忆索引', { userId, sessionId });
    return {
      success: true,
      sessionId,
      chunkCount: 0,
      skipped: true,
      reason: '用户未开启会话记忆检索',
    };
  }

  // 2. 查询已有切片的最大 chunkIndex 与已索引消息信息（水位线维护）
  const lastChunk = await db.conversationMemoryChunk.findFirst({
    where: { sessionId },
    orderBy: { chunkIndex: 'desc' },
    select: { chunkIndex: true, metadata: true },
  });
  const lastChunkIndex = lastChunk ? lastChunk.chunkIndex : -1;

  const existingChunks = await db.conversationMemoryChunk.findMany({
    where: { sessionId },
    select: { messageId: true, metadata: true },
  });

  const indexedMessageIds = new Set(
    existingChunks.map((c) => c.messageId).filter((id): id is string => Boolean(id))
  );

  let lastWatermarkTime: Date | null = null;
  for (const c of existingChunks) {
    const meta = c.metadata as Record<string, unknown> | null;
    if (meta?.lastIndexedMessageCreatedAt && typeof meta.lastIndexedMessageCreatedAt === 'string') {
      const t = new Date(meta.lastIndexedMessageCreatedAt);
      if (!lastWatermarkTime || t > lastWatermarkTime) {
        lastWatermarkTime = t;
      }
    }
  }

  // 3. 查询高于水位线的新增对话消息（仅提取用户与助手真实发言）
  const whereClause: {
    sessionId: string;
    role: { in: string[] };
    createdAt?: { gt: Date };
  } = {
    sessionId,
    role: { in: ['user', 'assistant'] },
  };

  if (lastWatermarkTime) {
    whereClause.createdAt = { gt: lastWatermarkTime };
  }

  const candidateMessages = await db.message.findMany({
    where: whereClause,
    orderBy: { createdAt: 'asc' },
  });

  // 过滤掉已在 indexedMessageIds 中的消息，实现双重防漏防重
  const newMessages = candidateMessages.filter((m) => !indexedMessageIds.has(m.id));

  if (newMessages.length === 0) {
    logger.info('会话无未索引的新消息，跳过记忆索引', { sessionId, userId });
    return {
      success: true,
      sessionId,
      chunkCount: 0,
      reason: '无未索引的新消息',
    };
  }

  // 4. 将最新消息对格式化为上下文文本并进行语义切块
  const latestMessage = newMessages[newMessages.length - 1];
  const latestMessageTime = latestMessage.createdAt.toISOString();
  const messageIds = newMessages.map((m) => m.id);

  const conversationText = newMessages
    .map((m) => {
      const roleLabel = m.role === 'user' ? '用户' : '助手';
      return `${roleLabel}: ${m.content}`;
    })
    .join('\n\n');

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const rawChunks = await splitter.splitText(conversationText);
  const textChunks = rawChunks.map((t) => t.trim()).filter(Boolean);

  if (textChunks.length === 0) {
    return {
      success: true,
      sessionId,
      chunkCount: 0,
      reason: '切块结果为空',
    };
  }

  // 5. 批量向量化（统一分批政策：64 条/批、顺序保持、逐批观测）
  const embeddings = await embedAll(textChunks, {
    feature: 'memory-index',
    context: { sessionId, userId },
  });

  logger.info('会话记忆索引向量化完成', {
    feature: 'memory-index',
    sessionId,
    userId,
    chunkCount: textChunks.length,
  });

  // 6. 构造切片数据并存入数据库
  const chunksToInsert: InsertMemoryChunkInput[] = textChunks.map((text, idx) => ({
    userId,
    sessionId,
    messageId: latestMessage.id,
    chunkIndex: lastChunkIndex + 1 + idx,
    content: text,
    contentSegmented: segmentForIndex(text),
    tokenCount: estimateTokenCount(text),
    metadata: {
      lastIndexedMessageCreatedAt: latestMessageTime,
      messageIds,
    },
    embedding: embeddings[idx],
  }));

  const insertChunks = deps.insertChunksFn || insertMemoryChunks;
  await insertChunks(chunksToInsert);

  logger.info('会话记忆增量索引成功落盘', {
    sessionId,
    userId,
    chunkCount: chunksToInsert.length,
    newMessagesCount: newMessages.length,
  });

  return {
    success: true,
    sessionId,
    chunkCount: chunksToInsert.length,
  };
}
