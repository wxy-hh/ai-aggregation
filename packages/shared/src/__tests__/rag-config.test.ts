import { describe, expect, it } from 'vitest';
import {
  RAG_EMBEDDING_DIM,
  RAG_EMBEDDING_MODEL,
  RAG_EMBEDDING_BATCH_SIZE,
  RAG_CAPACITY_LIMITS,
  RAG_RETRIEVAL_CONFIG,
} from '../rag-config';

describe('rag-config 基础配置约束', () => {
  it('向量维度必须与火山方舟 doubao-embedding-large 标称 1024 维严格一致', () => {
    expect(RAG_EMBEDDING_DIM).toBe(1024);
  });

  it('默认模型必须为 BAAI/bge-m3', () => {
    expect(RAG_EMBEDDING_MODEL).toBe('BAAI/bge-m3');
  });

  it('单批批次大小不超过 64 条', () => {
    expect(RAG_EMBEDDING_BATCH_SIZE).toBeLessThanOrEqual(64);
  });

  it('用户容量配额满足 5 库 x 50 文档 x 20000 切片契约', () => {
    expect(RAG_CAPACITY_LIMITS.maxKnowledgeBasesPerUser).toBe(5);
    expect(RAG_CAPACITY_LIMITS.maxDocumentsPerKnowledgeBase).toBe(50);
    expect(RAG_CAPACITY_LIMITS.maxChunksPerUser).toBe(20000);
  });

  it('混合检索参数 denseTopK=20, lexicalTopK=20, rrfK=60', () => {
    expect(RAG_RETRIEVAL_CONFIG.denseTopK).toBe(20);
    expect(RAG_RETRIEVAL_CONFIG.lexicalTopK).toBe(20);
    expect(RAG_RETRIEVAL_CONFIG.rrfK).toBe(60);
  });
});
