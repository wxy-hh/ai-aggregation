import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://weixiaoyu@localhost:5432/ai_aggregation';
  }
});

import { prisma } from '../client';
import {
  insertDocumentChunks,
  deleteDocumentChunks,
  searchDocumentChunksDense,
  searchDocumentChunksLexical,
} from '../rag/chunk-store';

describe('RAG 数据库 Schema Drift 与 ChunkStore 契约验证', () => {
  let testUserId: string;
  let testKbId: string;
  let testDocId: string;

  beforeAll(async () => {
    // 创建测试基准数据：用户 -> 知识库 -> 文档
    const user = await prisma.user.create({
      data: {
        username: `rag_drift_tester_${Date.now()}`,
        tokens: 10000,
      },
    });
    testUserId = user.id;

    const kb = await prisma.knowledgeBase.create({
      data: {
        userId: testUserId,
        name: '测试知识库',
      },
    });
    testKbId = kb.id;

    const doc = await prisma.document.create({
      data: {
        knowledgeBaseId: testKbId,
        userId: testUserId,
        name: 'test-spec.md',
        storageKey: `docs/${testUserId}/${testKbId}/v1/test-spec.md`,
        version: 1,
      },
    });
    testDocId = doc.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  it('1. document_chunks 表结构：含 vector(1024) 与 tsvector 生成列', async () => {
    interface ColumnInfo {
      column_name: string;
      data_type: string;
      udt_name: string;
      is_generated: string;
    }

    const columns = await prisma.$queryRawUnsafe<ColumnInfo[]>(`
      SELECT column_name, data_type, udt_name, is_generated
      FROM information_schema.columns
      WHERE table_name = 'document_chunks'
        AND column_name IN ('embedding', 'content_tsv', 'content_segmented', 'heading_path', 'page_number');
    `);

    const colMap = new Map(columns.map((c) => [c.column_name, c]));

    // 向量列必须为 pgvector 提供的 vector 类型
    expect(colMap.get('embedding')?.udt_name).toBe('vector');

    // 词法检索列必须为 tsvector 生成列
    const tsvCol = colMap.get('content_tsv');
    expect(tsvCol?.udt_name).toBe('tsvector');
    expect(tsvCol?.is_generated).toBe('ALWAYS');

    expect(colMap.get('content_segmented')?.data_type).toBe('text');
  });

  it('2. conversation_memory_chunks 表结构：含 vector 与 tsvector 列', async () => {
    interface ColumnInfo {
      column_name: string;
      udt_name: string;
    }

    const columns = await prisma.$queryRawUnsafe<ColumnInfo[]>(`
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_name = 'conversation_memory_chunks'
        AND column_name IN ('embedding', 'content_tsv', 'user_id', 'session_id');
    `);

    const colMap = new Map(columns.map((c) => [c.column_name, c]));
    expect(colMap.get('embedding')?.udt_name).toBe('vector');
    expect(colMap.get('content_tsv')?.udt_name).toBe('tsvector');
    expect(colMap.has('user_id')).toBe(true);
    expect(colMap.has('session_id')).toBe(true);
  });

  it('3. HNSW 索引与 GIN 索引在两张切片表中均已建立', async () => {
    interface IndexInfo {
      indexname: string;
      indexdef: string;
    }

    const indexes = await prisma.$queryRawUnsafe<IndexInfo[]>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename IN ('document_chunks', 'conversation_memory_chunks');
    `);

    const indexNames = new Set(indexes.map((i) => i.indexname));

    // 文档切片索引
    expect(indexNames.has('document_chunks_embedding_hnsw_idx')).toBe(true);
    expect(indexNames.has('document_chunks_content_tsv_idx')).toBe(true);
    expect(indexNames.has('document_chunks_document_id_document_version_chunk_index_key')).toBe(true);

    // 会话记忆切片索引
    expect(indexNames.has('conversation_memory_chunks_embedding_hnsw_idx')).toBe(true);
    expect(indexNames.has('conversation_memory_chunks_content_tsv_idx')).toBe(true);

    // 验证 HNSW 索引定义采用 vector_cosine_ops
    const hnswDef = indexes.find((i) => i.indexname === 'document_chunks_embedding_hnsw_idx')?.indexdef;
    expect(hnswDef).toContain('hnsw');
    expect(hnswDef).toContain('vector_cosine_ops');
  });

  it('4. users 表含 memory_search_enabled 列且默认值为 false', async () => {
    interface UserColumnInfo {
      column_name: string;
      column_default: string;
      is_nullable: string;
    }

    const cols = await prisma.$queryRawUnsafe<UserColumnInfo[]>(`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'memory_search_enabled';
    `);

    expect(cols.length).toBe(1);
    expect(cols[0].column_default).toContain('false');
    expect(cols[0].is_nullable).toBe('NO');
  });

  it('5. rag_eval_cases 表结构含 golden_anchors JSON 列', async () => {
    interface ColumnInfo {
      column_name: string;
      data_type: string;
    }

    const cols = await prisma.$queryRawUnsafe<ColumnInfo[]>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'rag_eval_cases' AND column_name IN ('golden_anchors', 'knowledge_base_id');
    `);

    const colMap = new Map(cols.map((c) => [c.column_name, c]));
    expect(colMap.get('golden_anchors')?.data_type).toBe('jsonb');
    expect(colMap.has('knowledge_base_id')).toBe(true);
  });

  it('6. ChunkStore 读写能力：raw SQL 写入 1024 维向量并在稠密/词法两路正确召回', async () => {
    // 构造一个 1024 维模拟向量（单位向量）
    const dummyEmbedding = new Array(1024).fill(0);
    dummyEmbedding[0] = 0.8;
    dummyEmbedding[1] = 0.6;

    const count = await insertDocumentChunks([
      {
        documentId: testDocId,
        knowledgeBaseId: testKbId,
        userId: testUserId,
        documentVersion: 1,
        chunkIndex: 0,
        content: 'AI 聚合平台的混合检索架构基于倒数排名融合算法与 PostgreSQL pgvector。',
        contentSegmented: 'AI 聚合 平台 的 混合 检索 架构 基于 倒数 排名 融合 算法 与 PostgreSQL pgvector',
        headingPath: '架构设计 > 混合检索',
        pageNumber: 1,
        tokenCount: 65,
        embedding: dummyEmbedding,
      },
    ]);
    expect(count).toBe(1);

    // 稠密向量路检索：用相同向量检索，相似度应接近 1.0
    const denseMatches = await searchDocumentChunksDense({
      userId: testUserId,
      knowledgeBaseId: testKbId,
      queryVector: dummyEmbedding,
      topK: 5,
    });
    expect(denseMatches.length).toBeGreaterThan(0);
    expect(denseMatches[0].documentId).toBe(testDocId);
    expect(denseMatches[0].similarity).toBeGreaterThan(0.99);

    // 词法检索路：分词内容应自动生成 tsvector，匹配「倒数 排名 融合」
    const lexicalMatches = await searchDocumentChunksLexical({
      userId: testUserId,
      knowledgeBaseId: testKbId,
      query: '倒数 排名 融合',
      topK: 5,
    });
    expect(lexicalMatches.length).toBeGreaterThan(0);
    expect(lexicalMatches[0].documentId).toBe(testDocId);
    expect(lexicalMatches[0].rank).toBeGreaterThan(0);

    // 清理切片
    const deleted = await deleteDocumentChunks(testDocId, 1);
    expect(deleted).toBe(1);
  });
});
