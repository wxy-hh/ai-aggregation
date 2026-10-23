/**
 * RAG 切片存储访问模块 (ChunkStore)
 *
 * 核心设计契约：
 * 1. 向量列 (embedding vector(1024)) 与词法全文检索生成列 (content_tsv tsvector)
 *    为 Prisma Unsupported 类型，严禁经由 ORM 进行读写，所有读写操作必须收敛于本模块 raw SQL。
 * 2. 检索阶段 ACL 权限控制（userId / knowledgeBaseId）必须在 SQL 层前置过滤，严禁全量拉取后在应用层过滤。
 * 3. 稠密向量路基于 cosine 距离运算符 (<=>)，词法检索路基于 simple 字典与 ts_rank_cd。
 */

import { prisma } from '../client';

/**
 * 文档切片记录自声明类型
 */
export interface DocumentChunkRow {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  userId: string;
  documentVersion: number;
  chunkIndex: number;
  content: string;
  contentSegmented: string;
  headingPath: string | null;
  pageNumber: number | null;
  tokenCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * 稠密向量检索命中的文档切片结果
 */
export interface DocumentChunkDenseMatch extends DocumentChunkRow {
  similarity: number;
}

/**
 * 词法全文检索命中的文档切片结果
 */
export interface DocumentChunkLexicalMatch extends DocumentChunkRow {
  rank: number;
}

/**
 * 插入文档切片入参
 */
export interface InsertDocumentChunkInput {
  id?: string;
  documentId: string;
  knowledgeBaseId: string;
  userId: string;
  documentVersion: number;
  chunkIndex: number;
  content: string;
  contentSegmented: string;
  headingPath?: string | null;
  pageNumber?: number | null;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
  embedding: number[];
}

/**
 * 会话记忆切片记录自声明类型
 */
export interface ConversationMemoryChunkRow {
  id: string;
  userId: string;
  sessionId: string;
  messageId: string | null;
  chunkIndex: number;
  content: string;
  contentSegmented: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * 插入会话记忆切片入参
 */
export interface InsertMemoryChunkInput {
  id?: string;
  userId: string;
  sessionId: string;
  messageId?: string | null;
  chunkIndex: number;
  content: string;
  contentSegmented: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
  embedding: number[];
}

/**
 * 格式化向量数组为 PostgreSQL vector 文本格式
 */
function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * 生成 cuid 兼容的前缀唯一 ID（未指定 id 时使用）
 */
function generateId(): string {
  return 'chk_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

/**
 * 批量插入文档切片（使用 raw SQL 写入 Unsupported vector 字段）
 */
export async function insertDocumentChunks(
  chunks: InsertDocumentChunkInput[]
): Promise<number> {
  if (chunks.length === 0) return 0;

  let insertedCount = 0;
  for (const chunk of chunks) {
    const id = chunk.id || generateId();
    const vectorStr = formatVector(chunk.embedding);
    const metadataStr = JSON.stringify(chunk.metadata ?? {});

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "document_chunks" (
        "id", "document_id", "knowledge_base_id", "user_id",
        "document_version", "chunk_index", "content", "content_segmented",
        "heading_path", "page_number", "token_count", "metadata",
        "embedding", "created_at"
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12::jsonb,
        $13::vector, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("document_id", "document_version", "chunk_index") DO UPDATE SET
        "content" = EXCLUDED."content",
        "content_segmented" = EXCLUDED."content_segmented",
        "heading_path" = EXCLUDED."heading_path",
        "page_number" = EXCLUDED."page_number",
        "token_count" = EXCLUDED."token_count",
        "metadata" = EXCLUDED."metadata",
        "embedding" = EXCLUDED."embedding";
      `,
      id,
      chunk.documentId,
      chunk.knowledgeBaseId,
      chunk.userId,
      chunk.documentVersion,
      chunk.chunkIndex,
      chunk.content,
      chunk.contentSegmented,
      chunk.headingPath ?? null,
      chunk.pageNumber ?? null,
      chunk.tokenCount ?? 0,
      metadataStr,
      vectorStr
    );
    insertedCount++;
  }

  return insertedCount;
}

/**
 * 删除指定文档的切片（支持指定特定版本或清除全版本）
 */
export async function deleteDocumentChunks(
  documentId: string,
  version?: number
): Promise<number> {
  if (typeof version === 'number') {
    return prisma.$executeRaw`
      DELETE FROM "document_chunks"
      WHERE "document_id" = ${documentId} AND "document_version" = ${version};
    `;
  }
  return prisma.$executeRaw`
    DELETE FROM "document_chunks"
    WHERE "document_id" = ${documentId};
  `;
}

/**
 * 稠密向量相似度检索（基于 cosine 距离 <=>，SQL 层强制执行用户与知识库 ACL）
 */
export async function searchDocumentChunksDense(params: {
  userId: string;
  knowledgeBaseId: string;
  queryVector: number[];
  topK?: number;
}): Promise<DocumentChunkDenseMatch[]> {
  const { userId, knowledgeBaseId, queryVector, topK = 20 } = params;
  const vectorStr = formatVector(queryVector);

  interface RawDenseRow {
    id: string;
    document_id: string;
    knowledge_base_id: string;
    user_id: string;
    document_version: number;
    chunk_index: number;
    content: string;
    content_segmented: string;
    heading_path: string | null;
    page_number: number | null;
    token_count: number;
    metadata: Record<string, unknown>;
    created_at: Date;
    similarity: number;
  }

  const rows = await prisma.$queryRawUnsafe<RawDenseRow[]>(
    `
    SELECT
      "id",
      "document_id",
      "knowledge_base_id",
      "user_id",
      "document_version",
      "chunk_index",
      "content",
      "content_segmented",
      "heading_path",
      "page_number",
      "token_count",
      "metadata",
      "created_at",
      (1 - ("embedding" <=> $1::vector)) AS "similarity"
    FROM "document_chunks"
    WHERE "user_id" = $2
      AND "knowledge_base_id" = $3
      AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> $1::vector ASC
    LIMIT $4;
    `,
    vectorStr,
    userId,
    knowledgeBaseId,
    topK
  );

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    knowledgeBaseId: row.knowledge_base_id,
    userId: row.user_id,
    documentVersion: row.document_version,
    chunkIndex: row.chunk_index,
    content: row.content,
    contentSegmented: row.content_segmented,
    headingPath: row.heading_path,
    pageNumber: row.page_number,
    tokenCount: row.token_count,
    metadata: row.metadata,
    createdAt: row.created_at,
    similarity: Number(row.similarity),
  }));
}

/**
 * 词法全文检索（基于 ts_rank_cd 与 content_tsv 生成列，SQL 层强制执行 ACL）
 */
export async function searchDocumentChunksLexical(params: {
  userId: string;
  knowledgeBaseId: string;
  query: string;
  topK?: number;
}): Promise<DocumentChunkLexicalMatch[]> {
  const { userId, knowledgeBaseId, query, topK = 20 } = params;

  interface RawLexicalRow {
    id: string;
    document_id: string;
    knowledge_base_id: string;
    user_id: string;
    document_version: number;
    chunk_index: number;
    content: string;
    content_segmented: string;
    heading_path: string | null;
    page_number: number | null;
    token_count: number;
    metadata: Record<string, unknown>;
    created_at: Date;
    rank: number;
  }

  const rows = await prisma.$queryRawUnsafe<RawLexicalRow[]>(
    `
    SELECT
      "id",
      "document_id",
      "knowledge_base_id",
      "user_id",
      "document_version",
      "chunk_index",
      "content",
      "content_segmented",
      "heading_path",
      "page_number",
      "token_count",
      "metadata",
      "created_at",
      ts_rank_cd("content_tsv", plainto_tsquery('simple', $1)) AS "rank"
    FROM "document_chunks"
    WHERE "user_id" = $2
      AND "knowledge_base_id" = $3
      AND "content_tsv" @@ plainto_tsquery('simple', $1)
    ORDER BY "rank" DESC
    LIMIT $4;
    `,
    query,
    userId,
    knowledgeBaseId,
    topK
  );

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    knowledgeBaseId: row.knowledge_base_id,
    userId: row.user_id,
    documentVersion: row.document_version,
    chunkIndex: row.chunk_index,
    content: row.content,
    contentSegmented: row.content_segmented,
    headingPath: row.heading_path,
    pageNumber: row.page_number,
    tokenCount: row.token_count,
    metadata: row.metadata,
    createdAt: row.created_at,
    rank: Number(row.rank),
  }));
}

/**
 * 插入会话记忆切片（使用 raw SQL 写入 Unsupported 字段）
 */
export async function insertMemoryChunks(
  chunks: InsertMemoryChunkInput[]
): Promise<number> {
  if (chunks.length === 0) return 0;

  let insertedCount = 0;
  for (const chunk of chunks) {
    const id = chunk.id || generateId();
    const vectorStr = formatVector(chunk.embedding);
    const metadataStr = JSON.stringify(chunk.metadata ?? {});

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "conversation_memory_chunks" (
        "id", "user_id", "session_id", "message_id",
        "chunk_index", "content", "content_segmented", "token_count",
        "metadata", "embedding", "created_at"
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9::jsonb, $10::vector, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("session_id", "chunk_index") DO UPDATE SET
        "content" = EXCLUDED."content",
        "content_segmented" = EXCLUDED."content_segmented",
        "token_count" = EXCLUDED."token_count",
        "metadata" = EXCLUDED."metadata",
        "embedding" = EXCLUDED."embedding";
      `,
      id,
      chunk.userId,
      chunk.sessionId,
      chunk.messageId ?? null,
      chunk.chunkIndex,
      chunk.content,
      chunk.contentSegmented,
      chunk.tokenCount ?? 0,
      metadataStr,
      vectorStr
    );
    insertedCount++;
  }

  return insertedCount;
}

/**
 * 清除指定用户的全部会话记忆切片（用户关闭记忆开关时彻底清理）
 */
export async function deleteMemoryChunksByUser(userId: string): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "conversation_memory_chunks"
    WHERE "user_id" = ${userId};
  `;
}

/**
 * 清除指定会话的全部记忆切片（会话删除级联调用）
 */
export async function deleteMemoryChunksBySession(sessionId: string): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "conversation_memory_chunks"
    WHERE "session_id" = ${sessionId};
  `;
}
