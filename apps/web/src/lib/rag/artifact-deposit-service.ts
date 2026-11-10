/**
 * 对话产物回写知识库服务模块 (AGENT-KB-LOOP / ADR-0034)
 *
 * 核心机制：
 * 1. 纯文本内存切块：解析 Markdown 标题层级栈（headingPath），按语义段落/空行分块（默认 500 字符）；
 * 2. 同步并发向量化：调用 BAAI/bge-m3 接口计算 1024 维切片向量并同步完成中文分词；
 * 3. 单事务落盘：在单一数据库事务内完成 Document（直接置 ready）与 DocumentChunk 批量插入，端到端 <= 1.5s；
 * 4. 对象存储双轨同步：尝试将 content.md 写入对象存储作为全文快照备份。
 */

import { prisma, insertDocumentChunksWithInheritance } from '@repo/db';
import { createStorageProvider } from '@repo/storage';
import { embedFaqText, segmentFaqText } from './faq-service';
import { estimateTokenCount, type DepositArtifactInput } from '@repo/shared';

export interface ArtifactChunkSlice {
  chunkIndex: number;
  content: string;
  contentSegmented: string;
  headingPath: string | null;
  tokenCount: number;
}

/**
 * 内存轻量 Markdown / 文本切块器
 * 保持标题层级栈并按段落切片（目标大小 ~500 字符，最大 800 字符）
 */
export function splitArtifactMarkdown(
  content: string,
  targetChunkSize = 500,
  maxChunkSize = 800
): Array<{ chunkIndex: number; content: string; headingPath: string | null; tokenCount: number }> {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const rawSections: Array<{ headingPath: string | null; text: string }> = [];

  const headingStack: Array<{ level: number; text: string }> = [];
  let currentBuffer: string[] = [];

  const getCurrentHeadingPath = (): string | null => {
    return headingStack.length > 0 ? headingStack.map((h) => h.text).join(' > ') : null;
  };

  const flushBuffer = () => {
    const text = currentBuffer.join('\n').trim();
    if (text) {
      rawSections.push({
        headingPath: getCurrentHeadingPath(),
        text,
      });
    }
    currentBuffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushBuffer();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();

      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      currentBuffer.push(line);
    } else {
      currentBuffer.push(line);
    }
  }
  flushBuffer();

  // 若无标题，兜底作为无标题单段
  if (rawSections.length === 0) {
    rawSections.push({ headingPath: null, text: normalized });
  }

  // 二次分块：对于超过 targetChunkSize 的段落按空行（段落）进一步切开
  const finalChunks: Array<{
    chunkIndex: number;
    content: string;
    headingPath: string | null;
    tokenCount: number;
  }> = [];

  let chunkIndex = 0;

  for (const section of rawSections) {
    if (section.text.length <= targetChunkSize) {
      finalChunks.push({
        chunkIndex: chunkIndex++,
        content: section.text,
        headingPath: section.headingPath,
        tokenCount: estimateTokenCount(section.text),
      });
      continue;
    }

    // 按段落切分
    const paragraphs = section.text.split(/\n\s*\n/);
    let accum = '';

    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) continue;

      if (!accum) {
        accum = trimmed;
      } else if (accum.length + trimmed.length + 2 <= targetChunkSize) {
        accum += '\n\n' + trimmed;
      } else {
        finalChunks.push({
          chunkIndex: chunkIndex++,
          content: accum,
          headingPath: section.headingPath,
          tokenCount: estimateTokenCount(accum),
        });
        accum = trimmed;
      }

      // 如果单段本身超长（大于 maxChunkSize），硬切块
      while (accum.length > maxChunkSize) {
        const slice = accum.slice(0, maxChunkSize);
        finalChunks.push({
          chunkIndex: chunkIndex++,
          content: slice,
          headingPath: section.headingPath,
          tokenCount: estimateTokenCount(slice),
        });
        accum = accum.slice(maxChunkSize).trim();
      }
    }

    if (accum.trim()) {
      finalChunks.push({
        chunkIndex: chunkIndex++,
        content: accum.trim(),
        headingPath: section.headingPath,
        tokenCount: estimateTokenCount(accum.trim()),
      });
    }
  }

  if (finalChunks.length === 0 && normalized) {
    finalChunks.push({
      chunkIndex: 0,
      content: normalized.slice(0, maxChunkSize),
      headingPath: null,
      tokenCount: estimateTokenCount(normalized.slice(0, maxChunkSize)),
    });
  }

  return finalChunks;
}

export interface DepositArtifactServiceParams {
  userId: string;
  knowledgeBaseId: string;
  input: DepositArtifactInput;
  embedFn?: (text: string) => Promise<number[]>;
  segmentFn?: (text: string) => string;
}

/**
 * 产物同步切块向量化入库核心服务
 */
export async function depositArtifactToKnowledgeBase(
  params: DepositArtifactServiceParams
) {
  const {
    userId,
    knowledgeBaseId,
    input,
    embedFn = embedFaqText,
    segmentFn = segmentFaqText,
  } = params;

  // 1. 内存切片
  const rawChunks = splitArtifactMarkdown(input.content);
  if (rawChunks.length === 0) {
    throw new Error('产物内容不能为空或无法切块');
  }

  // 2. 并发计算向量与分词
  const preparedChunks = await Promise.all(
    rawChunks.map(async (c) => {
      const embedding = await embedFn(c.content);
      const contentSegmented = segmentFn(c.content);
      return {
        ...c,
        embedding,
        contentSegmented,
      };
    })
  );

  // 3. 构建 storageKey 并尝试上传对象存储备份
  const randomId = Math.random().toString(36).slice(2, 10);
  const storageKey = `docs/${userId}/artifact-${Date.now()}-${randomId}/v1/content.md`;

  try {
    const storage = createStorageProvider();
    await storage.upload(storageKey, Buffer.from(input.content, 'utf-8'), 'text/markdown');
  } catch (storageErr) {
    console.warn('[depositArtifact] 对象存储上传备份警告 (已优雅降级由切片聚合):', storageErr);
  }

  // 4. 单事务原子落盘
  const resultDoc = await prisma.$transaction(async (tx) => {
    // 创建文档主表记录
    const doc = await tx.document.create({
      data: {
        knowledgeBaseId,
        userId,
        name: input.title,
        storageKey,
        status: 'ready',
        version: 1,
        chunkCount: preparedChunks.length,
        sourceType: 'chat_artifact',
        tags: input.tags ?? [],
        metadata: {
          sourceType: 'chat_artifact',
          sourceSessionId: input.sourceSessionId || null,
          sourceArtifactId: input.artifactId,
          depositedAt: new Date().toISOString(),
          artifactType: input.type,
        },
      },
    });

    // 批量插入切片并绑定向量；切片元数据不再自行拼装，
    // 由共享构造规则经 insertDocumentChunksWithInheritance 统一构造 (C1 / ADR-0032 修订)
    const chunkInputs = preparedChunks.map((pc) => ({
      documentId: doc.id,
      knowledgeBaseId,
      userId,
      documentVersion: 1,
      chunkIndex: pc.chunkIndex,
      content: pc.content,
      contentSegmented: pc.contentSegmented,
      headingPath: pc.headingPath,
      tokenCount: pc.tokenCount,
      embedding: pc.embedding,
    }));

    await insertDocumentChunksWithInheritance(
      chunkInputs,
      {
        sourceType: 'chat_artifact',
        name: input.title,
        storageKey,
        tags: input.tags ?? [],
        metadata: {
          sourceType: 'chat_artifact',
          sourceSessionId: input.sourceSessionId || null,
          sourceArtifactId: input.artifactId,
          depositedAt: new Date().toISOString(),
          artifactType: input.type,
        },
      },
      tx
    );

    return doc;
  });

  return {
    document: resultDoc,
    chunkCount: preparedChunks.length,
  };
}
