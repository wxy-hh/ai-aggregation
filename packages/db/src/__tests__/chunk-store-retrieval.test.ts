import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://weixiaoyu@localhost:5432/ai_aggregation';
  }
});

import { prisma } from '../client';
import {
  insertDocumentChunks,
  searchDocumentChunksDense,
  searchDocumentChunksLexical,
  updateDocumentMetadataInPlace,
} from '../rag/chunk-store';

describe('ChunkStore 检索增强集成测试 (工单 06)', () => {
  let userAId: string;
  let userBId: string;
  let kbAId: string;
  let docV1Id: string;
  let docV2Id: string;
  let docDeletedId: string;

  // 1024 维测试向量
  const baseVector = new Array(1024).fill(0);
  baseVector[0] = 1.0;

  const similarVector = new Array(1024).fill(0);
  similarVector[0] = 0.95;
  similarVector[1] = 0.05;

  const distantVector = new Array(1024).fill(0);
  distantVector[0] = 0.1;
  distantVector[1] = 0.99;

  beforeAll(async () => {
    // 1. 创建两个隔离用户
    const userA = await prisma.user.create({
      data: {
        username: `rag_retrieval_userA_${Date.now()}`,
        tokens: 10000,
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        username: `rag_retrieval_userB_${Date.now()}`,
        tokens: 10000,
      },
    });
    userBId = userB.id;

    // 2. 为 User A 创建知识库
    const kbA = await prisma.knowledgeBase.create({
      data: {
        userId: userAId,
        name: '技术架构知识库',
      },
    });
    kbAId = kbA.id;

    // 3. 创建正常就绪文档 (version = 1)
    const doc1 = await prisma.document.create({
      data: {
        knowledgeBaseId: kbAId,
        userId: userAId,
        name: 'architecture-guide.md',
        storageKey: `docs/${userAId}/${kbAId}/v1/architecture-guide.md`,
        version: 1,
        status: 'ready',
      },
    });
    docV1Id = doc1.id;

    // 插入 doc1 的切片（含 ADR-0008 编号和中文切词）
    await insertDocumentChunks([
      {
        documentId: docV1Id,
        knowledgeBaseId: kbAId,
        userId: userAId,
        documentVersion: 1,
        chunkIndex: 0,
        content: '根据 ADR-0008 规范，连败熔断的触发条件是连续 3 次工具调用失败。',
        contentSegmented: '根据 ADR-0008 规范 连败 熔断 的 触发 条件 是 连续 3 次 工具 调用 失败',
        headingPath: '架构决策 > ADR-0008',
        pageNumber: 1,
        tokenCount: 40,
        embedding: baseVector,
      },
      {
        documentId: docV1Id,
        knowledgeBaseId: kbAId,
        userId: userAId,
        documentVersion: 1,
        chunkIndex: 1,
        content: '关于珀金协议技术规范的初始版本描述。',
        contentSegmented: '关于 珀金 协议 技术 规范 的 初始 版本 描述',
        headingPath: '架构决策 > 珀金协议',
        pageNumber: 2,
        tokenCount: 30,
        embedding: distantVector,
      },
    ]);

    // 4. 创建经历版本升级的文档 (从 version 1 升级到 version 2)
    const doc2 = await prisma.document.create({
      data: {
        knowledgeBaseId: kbAId,
        userId: userAId,
        name: 'versioned-doc.md',
        storageKey: `docs/${userAId}/${kbAId}/v2/versioned-doc.md`,
        version: 2, // 当前有效版本为 2
        status: 'ready',
      },
    });
    docV2Id = doc2.id;

    // 插入旧版本 version=1 的废弃切片
    await insertDocumentChunks([
      {
        documentId: docV2Id,
        knowledgeBaseId: kbAId,
        userId: userAId,
        documentVersion: 1, // 旧版本切片
        chunkIndex: 0,
        content: '这是旧版本的独有内容：旧版本遗留秘钥 99999。',
        contentSegmented: '这是 旧 版本 的 独有 内容 旧 版本 遗留 秘钥 99999',
        headingPath: '版本历史',
        tokenCount: 30,
        embedding: similarVector,
      },
      {
        documentId: docV2Id,
        knowledgeBaseId: kbAId,
        userId: userAId,
        documentVersion: 2, // 当前有效新版本切片
        chunkIndex: 0,
        content: '这是新版本的独有内容：珀金协议修订版上线生效。',
        contentSegmented: '这是 新 版本 的 独有 内容 珀金 协议 修订版 上线 生效',
        headingPath: '最新版本',
        tokenCount: 30,
        embedding: similarVector,
      },
    ]);

    // 5. 创建软删除文档 (deletedAt 非空)
    const docDeleted = await prisma.document.create({
      data: {
        knowledgeBaseId: kbAId,
        userId: userAId,
        name: 'secret-deleted.md',
        storageKey: `docs/${userAId}/${kbAId}/v1/secret-deleted.md`,
        version: 1,
        status: 'ready',
        deletedAt: new Date(), // 已软删除
      },
    });
    docDeletedId = docDeleted.id;

    await insertDocumentChunks([
      {
        documentId: docDeletedId,
        knowledgeBaseId: kbAId,
        userId: userAId,
        documentVersion: 1,
        chunkIndex: 0,
        content: '机密已删除文件：绝密代码 88888 连败熔断。',
        contentSegmented: '机密 已 删除 文件 绝密 代码 88888 连败 熔断',
        headingPath: '机密',
        tokenCount: 20,
        embedding: baseVector,
      },
    ]);
  });

  afterAll(async () => {
    // 级联清理测试用户数据
    if (userAId) {
      await prisma.user.delete({ where: { id: userAId } });
    }
    if (userBId) {
      await prisma.user.delete({ where: { id: userBId } });
    }
    await prisma.$disconnect();
  });

  it('1. 稠密向量检索：返回按余弦相似度降序排列且带有 documentName', async () => {
    const matches = await searchDocumentChunksDense({
      userId: userAId,
      knowledgeBaseId: kbAId,
      queryVector: baseVector,
      topK: 5,
    });

    expect(matches.length).toBeGreaterThan(0);
    // 第一名应为完全重合的 baseVector
    expect(matches[0].documentId).toBe(docV1Id);
    expect(matches[0].documentName).toBe('architecture-guide.md');
    expect(matches[0].similarity).toBeGreaterThan(0.99);

    // 验证相似度严格单调非递增
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].similarity).toBeGreaterThanOrEqual(matches[i].similarity);
    }
  });

  it('2. 词法全文检索：技术编号（ADR-0008）与中文分词关键词精准命中', async () => {
    // 2.1 技术编号命中测试
    const adrMatches = await searchDocumentChunksLexical({
      userId: userAId,
      knowledgeBaseId: kbAId,
      query: 'ADR-0008',
      topK: 5,
    });

    expect(adrMatches.length).toBeGreaterThan(0);
    expect(adrMatches[0].documentId).toBe(docV1Id);
    expect(adrMatches[0].content).toContain('ADR-0008');
    expect(adrMatches[0].documentName).toBe('architecture-guide.md');
    expect(adrMatches[0].rank).toBeGreaterThan(0);

    // 2.2 中文分词多词命中测试
    const chineseMatches = await searchDocumentChunksLexical({
      userId: userAId,
      knowledgeBaseId: kbAId,
      query: '连败 熔断',
      topK: 5,
    });

    expect(chineseMatches.length).toBeGreaterThan(0);
    expect(chineseMatches[0].documentId).toBe(docV1Id);
    expect(chineseMatches[0].content).toContain('连败熔断');
  });

  it('3. 版本过滤 (QA-007)：仅召回 document.version 最新版本切片，旧版本切片零召回', async () => {
    // 3.1 词法路查询新版本独有词：「珀金 协议 修订版」
    const newVerMatches = await searchDocumentChunksLexical({
      userId: userAId,
      knowledgeBaseId: kbAId,
      query: '珀金 协议 修订版',
      topK: 5,
    });
    expect(newVerMatches.length).toBe(1);
    expect(newVerMatches[0].documentId).toBe(docV2Id);
    expect(newVerMatches[0].documentVersion).toBe(2);

    // 3.2 词法路查询旧版本独有词：「旧 版本 遗留 秘钥 99999」
    const oldVerMatches = await searchDocumentChunksLexical({
      userId: userAId,
      knowledgeBaseId: kbAId,
      query: '99999',
      topK: 5,
    });
    // 旧版本切片 document_version 为 1，而文档当前 version 为 2，必须零命中
    expect(oldVerMatches.length).toBe(0);

    // 3.3 稠密向量路对旧版本切片同样零召回
    const denseMatches = await searchDocumentChunksDense({
      userId: userAId,
      knowledgeBaseId: kbAId,
      queryVector: similarVector,
      topK: 10,
    });
    const doc2Matches = denseMatches.filter((m) => m.documentId === docV2Id);
    expect(doc2Matches.length).toBe(1);
    expect(doc2Matches[0].documentVersion).toBe(2);
  });

  it('4. 软删除过滤 (QA-008)：已删除文档切片在两路检索中均被完全排除', async () => {
    // 词法路查询软删除文档独有的关键词「88888」
    const lexicalDeleted = await searchDocumentChunksLexical({
      userId: userAId,
      knowledgeBaseId: kbAId,
      query: '88888',
      topK: 5,
    });
    expect(lexicalDeleted.length).toBe(0);

    // 稠密路验证
    const denseMatches = await searchDocumentChunksDense({
      userId: userAId,
      knowledgeBaseId: kbAId,
      queryVector: baseVector,
      topK: 10,
    });
    const deletedMatch = denseMatches.find((m) => m.documentId === docDeletedId);
    expect(deletedMatch).toBeUndefined();
  });

  it('5. 跨用户隔离安全 (QA-010)：User B 查询 User A 的知识库切片必须绝对零命中', async () => {
    // User B 带着 User A 的 kbAId 查询
    const denseB = await searchDocumentChunksDense({
      userId: userBId, // 用户 B
      knowledgeBaseId: kbAId, // 用户 A 的库
      queryVector: baseVector,
      topK: 10,
    });
    expect(denseB.length).toBe(0);

    const lexicalB = await searchDocumentChunksLexical({
      userId: userBId, // 用户 B
      knowledgeBaseId: kbAId, // 用户 A 的库
      query: 'ADR-0008',
      topK: 10,
    });
    expect(lexicalB.length).toBe(0);
  });

  it('6. 元数据前置过滤与原地批量同步 (TC07 / ADR-0032)', async () => {
    // 6.1 原地更新 docV1 标签与元数据
    const updateRes = await updateDocumentMetadataInPlace({
      documentId: docV1Id,
      userId: userAId,
      tags: ['架构规范', '2026'],
      metadata: { department: 'rd', year: 2026 },
    });
    expect(updateRes.documentId).toBe(docV1Id);
    expect(updateRes.updatedChunkCount).toBeGreaterThan(0);

    // 验证文档主表已更新
    const doc = await prisma.document.findUnique({ where: { id: docV1Id } });
    expect(doc?.tags).toEqual(['架构规范', '2026']);

    // 6.2 稠密向量检索：带匹配 filter 前置过滤精准召回 docV1
    const denseMatched = await searchDocumentChunksDense({
      userId: userAId,
      knowledgeBaseId: kbAId,
      queryVector: baseVector,
      topK: 5,
      filter: { tags: ['2026'], department: 'rd' },
    });
    expect(denseMatched.length).toBeGreaterThan(0);
    expect(denseMatched[0].documentId).toBe(docV1Id);

    // 6.3 稠密向量检索：带不匹配 filter（如 department: 'finance'）零召回
    const denseMismatched = await searchDocumentChunksDense({
      userId: userAId,
      knowledgeBaseId: kbAId,
      queryVector: baseVector,
      topK: 5,
      filter: { department: 'finance' },
    });
    expect(denseMismatched.length).toBe(0);

    // 6.4 词法全文检索：带匹配 filter 前置过滤精准召回 docV1
    const lexicalMatched = await searchDocumentChunksLexical({
      userId: userAId,
      knowledgeBaseId: kbAId,
      query: 'ADR-0008',
      topK: 5,
      filter: { tags: ['架构规范'] },
    });
    expect(lexicalMatched.length).toBeGreaterThan(0);
    expect(lexicalMatched[0].documentId).toBe(docV1Id);

    // 6.5 词法全文检索：带不匹配 tags 过滤零召回
    const lexicalMismatched = await searchDocumentChunksLexical({
      userId: userAId,
      knowledgeBaseId: kbAId,
      query: 'ADR-0008',
      topK: 5,
      filter: { tags: ['未存在标签_xyz'] },
    });
    expect(lexicalMismatched.length).toBe(0);
  });
});

