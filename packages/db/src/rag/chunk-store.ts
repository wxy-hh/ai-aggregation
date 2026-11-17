/**
 * RAG 切片存储访问模块 (ChunkStore)
 *
 * 核心设计契约：
 * 1. 向量列 (embedding vector(1024)) 与词法全文检索生成列 (content_tsv tsvector)
 *    为 Prisma Unsupported 类型，严禁经由 ORM 进行读写，这两类列的读写必须收敛于本模块 raw SQL。
 *    普通预览字段（切片正文、元数据、页码等）不属于该约束，调用方可直接用 Prisma 查询，
 *    不为此增加仅一层转发的间接层。
 * 2. 检索阶段 ACL 权限控制（userId / knowledgeBaseId）必须在 SQL 层前置过滤，严禁全量拉取后在应用层过滤。
 * 3. 稠密向量路基于 cosine 距离运算符 (<=>)，词法检索路基于 simple 字典与 ts_rank_cd。
 */

import { prisma } from '../client';
import type { Prisma } from '@prisma/client';
import {
  buildChunkInheritedMetadata,
  deriveParsedContentKey,
  type ChunkInheritanceFacts,
} from '@repo/shared';
import { buildMetadataFilterClause, type MetadataFilter } from './metadata-filter';

/**
 * 文档切片记录自声明类型
 */
export interface DocumentChunkRow {
  id: string;
  documentId: string;
  documentName: string;
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
 * 支持传入 Prisma 事务客户端在事务内执行
 *
 * 私有原语：仅供本模块内 replaceDocumentChunksInTransaction 与
 * insertDocumentChunksWithInheritance 使用，外部调用者必须经带继承事实的高层接口，
 * 由共享构造规则统一拼装切片元数据 (C1 / ADR-0032 修订)。
 */
async function insertDocumentChunks(
  chunks: InsertDocumentChunkInput[],
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  if (chunks.length === 0) return 0;

  let insertedCount = 0;
  for (const chunk of chunks) {
    const id = chunk.id || generateId();
    const vectorStr = formatVector(chunk.embedding);
    const metadataStr = JSON.stringify(chunk.metadata ?? {});

    await client.$executeRawUnsafe(
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
 * 支持传入 Prisma 事务客户端在事务内执行
 */
export async function deleteDocumentChunks(
  documentId: string,
  version?: number,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  if (typeof version === 'number') {
    return client.$executeRaw`
      DELETE FROM "document_chunks"
      WHERE "document_id" = ${documentId} AND "document_version" = ${version};
    `;
  }
  return client.$executeRaw`
    DELETE FROM "document_chunks"
    WHERE "document_id" = ${documentId};
  `;
}

/**
 * 在事务内原子替换文档切片并更新文档为就绪态（对齐 QA-007 与工单 05 契约）
 * 步骤：
 * 1. 事务内删除同文档旧版本切片（或当前版本残留）
 * 2. 事务内批量插入新版本切片
 * 3. 事务内更新 Document 状态为 ready 与 chunkCount，并清除错误信息
 *
 * 传入 inheritance（文档继承事实）时，切片 metadata 由共享构造规则统一拼装（C1 / ADR-0032 修订），
 * 调用者不再自行拼元数据；chunk 上显式给出的 metadata 作为切片私有键叠加在继承层之上。
 */
export async function replaceDocumentChunksInTransaction(params: {
  documentId: string;
  version: number;
  chunks: InsertDocumentChunkInput[];
  metadata?: Record<string, unknown>;
  inheritance?: ChunkInheritanceFacts;
}): Promise<{ chunkCount: number }> {
  const inheritedMetadata = params.inheritance
    ? buildChunkInheritedMetadata(params.inheritance)
    : null;
  const chunksToInsert = inheritedMetadata
    ? params.chunks.map((chunk) => ({
        ...chunk,
        metadata: { ...inheritedMetadata, ...(chunk.metadata ?? {}) },
      }))
    : params.chunks;

  return prisma.$transaction(async (tx) => {
    // 1. 事务内清理该文档的旧版本切片与当前版本（幂等防重）
    await tx.$executeRaw`
      DELETE FROM "document_chunks"
      WHERE "document_id" = ${params.documentId}
        AND ("document_version" < ${params.version} OR "document_version" = ${params.version});
    `;

    // 2. 事务内插入新切片
    await insertDocumentChunks(chunksToInsert, tx);

    // 3. 事务内原子更新文档状态为 ready 与切片数，同步更新元数据（包含大纲树）
    const updateData: { status: string; chunkCount: number; errorMessage: null; metadata?: Prisma.InputJsonValue } = {
      status: 'ready',
      chunkCount: chunksToInsert.length,
      errorMessage: null,
    };
    if (params.metadata) {
      updateData.metadata = params.metadata as Prisma.InputJsonValue;
    }

    await tx.document.update({
      where: { id: params.documentId },
      data: updateData,
    });

    return { chunkCount: chunksToInsert.length };
  });
}

/**
 * 带继承事实的文档切片批量插入（C1：ArtifactKnowledgeDeposit 等同步入库路径使用）
 * 切片 metadata 由共享构造规则统一拼装，调用者不再自行拼元数据。
 */
export async function insertDocumentChunksWithInheritance(
  chunks: InsertDocumentChunkInput[],
  inheritance: ChunkInheritanceFacts,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  const inheritedMetadata = buildChunkInheritedMetadata(inheritance);
  return insertDocumentChunks(
    chunks.map((chunk) => ({
      ...chunk,
      metadata: { ...inheritedMetadata, ...(chunk.metadata ?? {}) },
    })),
    client
  );
}

/**
 * 回填切片缺失的系统派生键（B 层）核心逻辑 (migrations/002 的数据面)
 *
 * 仅补齐缺失的 sourceType / fileName / storageKey / parsedContentKey
 * （从 documents 主表权威重算），不触碰 tags 与自定义键，不覆盖已有值。
 * 按文档游标分批，幂等可重跑（二次执行 updatedChunks 为 0）。
 */
export async function reconcileChunkMetadataFields(params?: {
  onProgress?: (doc: { id: string; name: string }, updatedChunks: number) => void;
  batchSize?: number;
}): Promise<{
  processedDocs: number;
  updatedChunks: number;
  details: Record<
    string,
    { name: string; oldValues: Record<string, unknown>; newValues: Record<string, unknown>; updatedChunks: number }
  >;
}> {
  const batchSize = params?.batchSize ?? 100;
  const details: Record<
    string,
    { name: string; oldValues: Record<string, unknown>; newValues: Record<string, unknown>; updatedChunks: number }
  > = {};
  let processedDocs = 0;
  let updatedChunksTotal = 0;
  let cursor: string | null = null;

  const findDirtyDocs = async (afterId: string | null): Promise<Array<{ document_id: string }>> => {
    const dirtyCondition = `
      AND (
        NOT (dc.metadata ? 'sourceType')
        OR NOT (dc.metadata ? 'storageKey')
        OR NOT (dc.metadata ? 'fileName')
        OR NOT (dc.metadata ? 'parsedContentKey')
      )`;
    if (afterId) {
      return prisma.$queryRawUnsafe(
        `SELECT DISTINCT dc.document_id
         FROM "document_chunks" dc
         JOIN "documents" d ON d.id = dc.document_id
         WHERE d.deleted_at IS NULL
           AND dc.document_id > $1
           ${dirtyCondition}
         ORDER BY dc.document_id
         LIMIT $2;`,
        afterId,
        batchSize
      );
    }
    return prisma.$queryRawUnsafe(
      `SELECT DISTINCT dc.document_id
       FROM "document_chunks" dc
       JOIN "documents" d ON d.id = dc.document_id
       WHERE d.deleted_at IS NULL
         ${dirtyCondition}
       ORDER BY dc.document_id
       LIMIT $1;`,
      batchSize
    );
  };

  for (;;) {
    const dirtyDocs = await findDirtyDocs(cursor);
    if (dirtyDocs.length === 0) break;
    cursor = dirtyDocs[dirtyDocs.length - 1].document_id;

    for (const row of dirtyDocs) {
      const doc = await prisma.document.findUnique({
        where: { id: row.document_id },
        select: { id: true, name: true, sourceType: true, storageKey: true },
      });
      if (!doc) continue;

      const newValues: Record<string, unknown> = {
        sourceType: doc.sourceType,
        fileName: doc.name,
        storageKey: doc.storageKey,
        parsedContentKey: deriveParsedContentKey(doc.storageKey),
      };

      // 记录修复前的旧值供审计（缺失键为 null）
      const beforeChunks = await prisma.$queryRaw<Array<{ metadata: Record<string, unknown> }>>`
        SELECT "metadata" FROM "document_chunks"
        WHERE "document_id" = ${doc.id} AND "document_version" = (
          SELECT "version" FROM "documents" WHERE "id" = ${doc.id}
        )
        LIMIT 1;
      `;
      const oldMetadata = (beforeChunks[0]?.metadata ?? {}) as Record<string, unknown>;
      const oldValues: Record<string, unknown> = {};
      for (const key of Object.keys(newValues)) {
        oldValues[key] = oldMetadata[key] ?? null;
      }

      const updated = await prisma.$executeRaw`
        UPDATE "document_chunks" dc
        SET "metadata" = dc."metadata" || jsonb_build_object(
          'sourceType', ${doc.sourceType},
          'fileName', ${doc.name},
          'storageKey', ${doc.storageKey},
          'parsedContentKey', ${deriveParsedContentKey(doc.storageKey)}
        )
        FROM "documents" d
        WHERE dc."document_id" = d.id
          AND dc."document_id" = ${doc.id}
          AND dc."document_version" = d."version"
          AND (
            NOT (dc."metadata" ? 'sourceType')
            OR NOT (dc."metadata" ? 'storageKey')
            OR NOT (dc."metadata" ? 'fileName')
            OR NOT (dc."metadata" ? 'parsedContentKey')
          );
      `;

      processedDocs += 1;
      updatedChunksTotal += updated;
      details[doc.id] = { name: doc.name, oldValues, newValues, updatedChunks: updated };
      params?.onProgress?.({ id: doc.id, name: doc.name }, updated);
    }
  }

  return { processedDocs, updatedChunks: updatedChunksTotal, details };
}

/**
 * 转义 SQL LIKE 查询中的特殊通配符（%、_ 与 \）以防止注入或通配符放大攻击 (S-H2 / security.md)
 */
function escapeLikeWildcards(text: string): string {
  return text.replace(/([%_\\])/g, '\\$1');
}

/**
 * 稠密向量相似度检索（基于 cosine 距离 <=>，SQL 层前置执行用户/知识库 ACL、软删除过滤、最新版本过滤与章节路径前缀收敛）
 */
export async function searchDocumentChunksDense(params: {
  userId: string;
  knowledgeBaseId: string;
  queryVector: number[];
  topK?: number;
  filter?: MetadataFilter;
  headingPath?: string | null;
  documentId?: string | null;
}): Promise<DocumentChunkDenseMatch[]> {
  const { userId, knowledgeBaseId, queryVector, topK = 20, filter, headingPath, documentId } = params;
  const vectorStr = formatVector(queryVector);

  const filterRes = buildMetadataFilterClause(filter, 4, 'dc');
  const whereClauses = [
    `dc."user_id" = $2`,
    `dc."knowledge_base_id" = $3`,
    `d."deleted_at" IS NULL`,
    `dc."document_version" = d."version"`,
    `dc."embedding" IS NOT NULL`,
    ...filterRes.sqlClauses,
  ];

  let currentParamIndex = filterRes.nextParamIndex;
  const extraParams: unknown[] = [];

  if (headingPath) {
    const escaped = escapeLikeWildcards(headingPath);
    whereClauses.push(`(dc."heading_path" = $${currentParamIndex} OR dc."heading_path" LIKE $${currentParamIndex + 1} || ' > %')`);
    extraParams.push(headingPath, escaped);
    currentParamIndex += 2;
  }

  if (documentId) {
    whereClauses.push(`dc."document_id" = $${currentParamIndex}`);
    extraParams.push(documentId);
    currentParamIndex++;
  }

  const limitPlaceholder = `$${currentParamIndex}`;
  const queryParams = [vectorStr, userId, knowledgeBaseId, ...filterRes.params, ...extraParams, topK];

  interface RawDenseRow {
    id: string;
    document_id: string;
    document_name: string;
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
      dc."id",
      dc."document_id",
      d."name" AS "document_name",
      dc."knowledge_base_id",
      dc."user_id",
      dc."document_version",
      dc."chunk_index",
      dc."content",
      dc."content_segmented",
      dc."heading_path",
      dc."page_number",
      dc."token_count",
      dc."metadata",
      dc."created_at",
      (1 - (dc."embedding" <=> $1::vector)) AS "similarity"
    FROM "document_chunks" dc
    INNER JOIN "documents" d ON dc."document_id" = d."id"
    WHERE ${whereClauses.join('\n      AND ')}
    ORDER BY dc."embedding" <=> $1::vector ASC
    LIMIT ${limitPlaceholder};
    `,
    ...queryParams
  );

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    documentName: row.document_name,
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
 * 词法全文检索（基于 ts_rank_cd 与 content_tsv 生成列，SQL 层前置执行用户/知识库 ACL、软删除过滤、最新版本过滤与章节路径前缀收敛）
 */
export async function searchDocumentChunksLexical(params: {
  userId: string;
  knowledgeBaseId: string;
  query: string;
  topK?: number;
  filter?: MetadataFilter;
  headingPath?: string | null;
  documentId?: string | null;
}): Promise<DocumentChunkLexicalMatch[]> {
  const { userId, knowledgeBaseId, query, topK = 20, filter, headingPath, documentId } = params;

  const filterRes = buildMetadataFilterClause(filter, 4, 'dc');
  const baseWhereClauses = [
    `dc."user_id" = $2`,
    `dc."knowledge_base_id" = $3`,
    `d."deleted_at" IS NULL`,
    `dc."document_version" = d."version"`,
    ...filterRes.sqlClauses,
  ];

  let currentParamIndex = filterRes.nextParamIndex;
  const extraParams: unknown[] = [];

  if (headingPath) {
    const escaped = escapeLikeWildcards(headingPath);
    baseWhereClauses.push(`(dc."heading_path" = $${currentParamIndex} OR dc."heading_path" LIKE $${currentParamIndex + 1} || ' > %')`);
    extraParams.push(headingPath, escaped);
    currentParamIndex += 2;
  }

  if (documentId) {
    baseWhereClauses.push(`dc."document_id" = $${currentParamIndex}`);
    extraParams.push(documentId);
    currentParamIndex++;
  }

  const limitPlaceholder = `$${currentParamIndex}`;
  const queryParams = [query, userId, knowledgeBaseId, ...filterRes.params, ...extraParams, topK];

  interface RawLexicalRow {
    id: string;
    document_id: string;
    document_name: string;
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

  let rows = await prisma.$queryRawUnsafe<RawLexicalRow[]>(
    `
    SELECT
      dc."id",
      dc."document_id",
      d."name" AS "document_name",
      dc."knowledge_base_id",
      dc."user_id",
      dc."document_version",
      dc."chunk_index",
      dc."content",
      dc."content_segmented",
      dc."heading_path",
      dc."page_number",
      dc."token_count",
      dc."metadata",
      dc."created_at",
      ts_rank_cd(dc."content_tsv", plainto_tsquery('simple', $1)) AS "rank"
    FROM "document_chunks" dc
    INNER JOIN "documents" d ON dc."document_id" = d."id"
    WHERE ${[...baseWhereClauses, `dc."content_tsv" @@ plainto_tsquery('simple', $1)`].join('\n      AND ')}
    ORDER BY "rank" DESC
    LIMIT ${limitPlaceholder};
    `,
    ...queryParams
  );

  // 若默认严格 AND 未命中且包含多词，使用 OR (to_tsquery) 平滑降级
  if (rows.length === 0 && query && query.includes(' ')) {
    const rawTokens = query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0);
    const cleanTokens = rawTokens
      .map((t) => t.replace(/[^a-zA-Z0-9_一-龥]/g, ''))
      .filter((t) => t.length > 0);

    if (cleanTokens.length > 0) {
      const orQuery = cleanTokens.join(' | ');
      try {
        const orRows = await prisma.$queryRawUnsafe<RawLexicalRow[]>(
          `
          SELECT
            dc."id",
            dc."document_id",
            d."name" AS "document_name",
            dc."knowledge_base_id",
            dc."user_id",
            dc."document_version",
            dc."chunk_index",
            dc."content",
            dc."content_segmented",
            dc."heading_path",
            dc."page_number",
            dc."token_count",
            dc."metadata",
            dc."created_at",
            ts_rank_cd(dc."content_tsv", to_tsquery('simple', $1)) AS "rank"
          FROM "document_chunks" dc
          INNER JOIN "documents" d ON dc."document_id" = d."id"
          WHERE ${[...baseWhereClauses, `dc."content_tsv" @@ to_tsquery('simple', $1)`].join('\n            AND ')}
          ORDER BY "rank" DESC
          LIMIT ${limitPlaceholder};
          `,
          orQuery,
          userId,
          knowledgeBaseId,
          ...filterRes.params,
          ...extraParams,
          topK
        );
        if (orRows.length > 0) {
          rows = orRows;
        }
      } catch {
        // 忽略降级解析异常，维持原空结果
      }
    }
  }

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    documentName: row.document_name,
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
 * 章节顺序连续切片提取（基于 chunk_index 升序，支持指定 headingPath 前缀收敛与 documentId，ADR-0036）
 */
export async function getSequentialChapterChunks(params: {
  userId: string;
  knowledgeBaseId: string;
  headingPath?: string | null;
  documentId?: string | null;
  limit?: number;
}): Promise<DocumentChunkRow[]> {
  const { userId, knowledgeBaseId, headingPath, documentId, limit = 20 } = params;

  const whereClauses = [
    `dc."user_id" = $1`,
    `dc."knowledge_base_id" = $2`,
    `d."deleted_at" IS NULL`,
    `dc."document_version" = d."version"`,
  ];
  const queryParams: unknown[] = [userId, knowledgeBaseId];
  let paramIdx = 3;

  if (headingPath) {
    const escaped = escapeLikeWildcards(headingPath);
    whereClauses.push(`(dc."heading_path" = $${paramIdx} OR dc."heading_path" LIKE $${paramIdx + 1} || ' > %')`);
    queryParams.push(headingPath, escaped);
    paramIdx += 2;
  }

  if (documentId) {
    whereClauses.push(`dc."document_id" = $${paramIdx}`);
    queryParams.push(documentId);
    paramIdx++;
  }

  const limitPlaceholder = `$${paramIdx}`;
  queryParams.push(limit);

  interface RawSequentialRow {
    id: string;
    document_id: string;
    document_name: string;
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
  }

  const rows = await prisma.$queryRawUnsafe<RawSequentialRow[]>(
    `
    SELECT
      dc."id",
      dc."document_id",
      d."name" AS "document_name",
      dc."knowledge_base_id",
      dc."user_id",
      dc."document_version",
      dc."chunk_index",
      dc."content",
      dc."content_segmented",
      dc."heading_path",
      dc."page_number",
      dc."token_count",
      dc."metadata",
      dc."created_at"
    FROM "document_chunks" dc
    INNER JOIN "documents" d ON dc."document_id" = d."id"
    WHERE ${whereClauses.join('\n      AND ')}
    ORDER BY dc."document_id" ASC, dc."chunk_index" ASC
    LIMIT ${limitPlaceholder};
    `,
    ...queryParams
  );

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    documentName: row.document_name,
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

/**
 * 稠密向量命中的会话记忆切片结果
 */
export interface ConversationMemoryChunkDenseMatch extends ConversationMemoryChunkRow {
  similarity: number;
}

/**
 * 词法全文检索命中的会话记忆切片结果
 */
export interface ConversationMemoryChunkLexicalMatch extends ConversationMemoryChunkRow {
  rank: number;
}

/**
 * 会话记忆切片稠密向量检索（基于 cosine 距离 <=>，SQL 层前置强制过滤当前用户 userId）
 */
export async function searchMemoryChunksDense(params: {
  userId: string;
  queryVector: number[];
  topK?: number;
}): Promise<ConversationMemoryChunkDenseMatch[]> {
  const { userId, queryVector, topK = 20 } = params;
  const vectorStr = formatVector(queryVector);

  interface RawMemoryDenseRow {
    id: string;
    user_id: string;
    session_id: string;
    message_id: string | null;
    chunk_index: number;
    content: string;
    content_segmented: string;
    token_count: number;
    metadata: Record<string, unknown>;
    created_at: Date;
    similarity: number;
  }

  const rows = await prisma.$queryRawUnsafe<RawMemoryDenseRow[]>(
    `
    SELECT
      cmc."id",
      cmc."user_id",
      cmc."session_id",
      cmc."message_id",
      cmc."chunk_index",
      cmc."content",
      cmc."content_segmented",
      cmc."token_count",
      cmc."metadata",
      cmc."created_at",
      (1 - (cmc."embedding" <=> $1::vector)) AS "similarity"
    FROM "conversation_memory_chunks" cmc
    WHERE cmc."user_id" = $2
      AND cmc."embedding" IS NOT NULL
    ORDER BY cmc."embedding" <=> $1::vector ASC
    LIMIT $3;
    `,
    vectorStr,
    userId,
    topK
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    messageId: row.message_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    contentSegmented: row.content_segmented,
    tokenCount: row.token_count,
    metadata: row.metadata,
    createdAt: row.created_at,
    similarity: Number(row.similarity),
  }));
}

/**
 * 会话记忆切片词法全文检索（基于 ts_rank_cd 与 content_tsv 生成列，SQL 层前置强制过滤当前用户 userId）
 */
export async function searchMemoryChunksLexical(params: {
  userId: string;
  query: string;
  topK?: number;
}): Promise<ConversationMemoryChunkLexicalMatch[]> {
  const { userId, query, topK = 20 } = params;

  interface RawMemoryLexicalRow {
    id: string;
    user_id: string;
    session_id: string;
    message_id: string | null;
    chunk_index: number;
    content: string;
    content_segmented: string;
    token_count: number;
    metadata: Record<string, unknown>;
    created_at: Date;
    rank: number;
  }

  const rows = await prisma.$queryRawUnsafe<RawMemoryLexicalRow[]>(
    `
    SELECT
      cmc."id",
      cmc."user_id",
      cmc."session_id",
      cmc."message_id",
      cmc."chunk_index",
      cmc."content",
      cmc."content_segmented",
      cmc."token_count",
      cmc."metadata",
      cmc."created_at",
      ts_rank_cd(cmc."content_tsv", plainto_tsquery('simple', $1)) AS "rank"
    FROM "conversation_memory_chunks" cmc
    WHERE cmc."user_id" = $2
      AND cmc."content_tsv" @@ plainto_tsquery('simple', $1)
    ORDER BY "rank" DESC
    LIMIT $3;
    `,
    query,
    userId,
    topK
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    messageId: row.message_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    contentSegmented: row.content_segmented,
    tokenCount: row.token_count,
    metadata: row.metadata,
    createdAt: row.created_at,
    rank: Number(row.rank),
  }));
}

/**
 * 原地即时同步更新文档及其切片的标签与元数据 (ADR-0032 / ADR-0032 2026-11-10 修订)
 * 无需重新切块与重新向量化，毫秒级原子更新。
 * 切片 metadata 采用合并语义：仅覆写 A 层（用户继承键）与 B 层（系统派生键，主表权威重算），
 * 切片私有键因 `metadata || $1` 拼接天然保留，历史缺失的系统字段在下次编辑时自动补齐。
 */
export async function updateDocumentMetadataInPlace(params: {
  documentId: string;
  userId: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  client?: Prisma.TransactionClient | typeof prisma;
}): Promise<{ documentId: string; updatedChunkCount: number }> {
  const { documentId, userId, tags, metadata = {}, client } = params;

  const runWithClient = async (tx: Prisma.TransactionClient | typeof prisma) => {
    // 1. 验证文档归属并获取当前版本与系统字段权威来源
    const doc = await tx.document.findFirst({
      where: { id: documentId, userId, deletedAt: null },
      select: { id: true, version: true, sourceType: true, name: true, storageKey: true },
    });

    if (!doc) {
      throw new Error('文档不存在或无权操作');
    }

    // 2. 构造打平继承后的切片元数据载荷（A 层编辑后值 + B 层主表重算值，剔除 outline）
    const mergedChunkMetadata = buildChunkInheritedMetadata({
      sourceType: doc.sourceType,
      name: doc.name,
      storageKey: doc.storageKey,
      tags,
      metadata,
    });
    const metadataJsonStr = JSON.stringify(mergedChunkMetadata);

    // 3. 原地批量合并更新该版本的所有切片（切片私有键保留，B 层自愈）
    const updatedChunkCount = await tx.$executeRawUnsafe(
      `
      UPDATE "document_chunks"
      SET "metadata" = "metadata" || $1::jsonb
      WHERE "document_id" = $2
        AND "document_version" = $3
        AND "user_id" = $4;
      `,
      metadataJsonStr,
      documentId,
      doc.version,
      userId
    );

    // 4. 更新文档主表
    await tx.document.update({
      where: { id: documentId },
      data: {
        tags,
        metadata: metadata as any,
      },
    });

    return {
      documentId,
      updatedChunkCount: Number(updatedChunkCount),
    };
  };

  if (client) {
    return runWithClient(client);
  }

  return (prisma as any).$transaction(async (tx: Prisma.TransactionClient) => {
    return runWithClient(tx);
  });
}


