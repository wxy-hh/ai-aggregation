import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  RAG_EMBEDDING_DIM,
  RAG_EMBEDDING_MODEL,
  RAG_EMBEDDING_BATCH_SIZE,
  RAG_CAPACITY_LIMITS,
  RAG_RETRIEVAL_CONFIG,
  RAG_RERANK_ENABLED,
  RAG_RERANK_CONFIG,
  isRagRerankEnabled,
} from '../rag-config';

describe('rag-config 基础配置约束', () => {
  const originalEnv = process.env.RAG_RERANK_ENABLED;

  beforeEach(() => {
    delete process.env.RAG_RERANK_ENABLED;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.RAG_RERANK_ENABLED = originalEnv;
    } else {
      delete process.env.RAG_RERANK_ENABLED;
    }
  });

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

  it('Rerank 配置约束：默认开启、模型为 BAAI/bge-reranker-v2-m3、候选上限 30 与阈值 0.20', () => {
    // ADR-0030：生产环境默认开启 Rerank
    expect(RAG_RERANK_ENABLED).toBe(true);
    expect(RAG_RERANK_CONFIG.model).toBe('BAAI/bge-reranker-v2-m3');
    expect(RAG_RERANK_CONFIG.endpoint).toBe('https://api.siliconflow.cn/v1/rerank');
    expect(RAG_RERANK_CONFIG.timeoutMs).toBeGreaterThan(0);
    expect(RAG_RERANK_CONFIG.maxCandidates).toBe(30);
    expect(RAG_RERANK_CONFIG.minRelevanceScore).toBe(0.20);
  });

  it('isRagRerankEnabled 开关动态切换与环境变量解析', () => {
    // ADR-0030：无环境变量时必须遵循默认值 true
    expect(isRagRerankEnabled()).toBe(true);

    // 环境变量显式关闭
    process.env.RAG_RERANK_ENABLED = 'false';
    expect(isRagRerankEnabled()).toBe(false);

    process.env.RAG_RERANK_ENABLED = '0';
    expect(isRagRerankEnabled()).toBe(false);

    // 环境变量显式开启
    process.env.RAG_RERANK_ENABLED = 'true';
    expect(isRagRerankEnabled()).toBe(true);

    process.env.RAG_RERANK_ENABLED = '1';
    expect(isRagRerankEnabled()).toBe(true);
  });
});

