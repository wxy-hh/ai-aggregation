import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://weixiaoyu@localhost:5432/ai_aggregation';
  }
});

import { prisma } from '../client';
import {
  insertDocumentChunksWithInheritance,
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
    await insertDocumentChunksWithInheritance([
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
    ], {
      sourceType: 'file',
      name: 'architecture-guide.md',
      storageKey: `docs/${userAId}/${kbAId}/v1/architecture-guide.md`,
      tags: [],
      metadata: {},
    });

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
    await insertDocumentChunksWithInheritance([
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
    ], {
      sourceType: 'file',
      name: 'versioned-doc.md',
      storageKey: `docs/${userAId}/${kbAId}/v2/versioned-doc.md`,
      tags: [],
      metadata: {},
    });

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

    await insertDocumentChunksWithInheritance([
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
    ], {
      sourceType: 'file',
      name: 'secret-deleted.md',
      storageKey: `docs/${userAId}/${kbAId}/v1/secret-deleted.md`,
      tags: [],
      metadata: {},
    });
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

describe('ChunkStore 切片系统字段保留 (C1 / ADR-0032 2026-11-10 修订)', () => {
  let userId: string;
  let kbId: string;

  const baseVector = new Array(1024).fill(0);
  baseVector[0] = 1.0;

  /** 模拟 Worker 写入的完整切片（含 B 层系统字段） */
  const workerStyleMetadata = (storageKey: string, fileName: string, tags: string[]) => ({
    tags,
    sourceType: 'file',
    fileName,
    storageKey,
    parsedContentKey: storageKey.replace(/\/[^/]+$/, '/content.md'),
  });

  async function fetchChunkMetadata(documentId: string) {
    const rows = await prisma.$queryRaw<Array<{ metadata: unknown }>>`
      SELECT "metadata" FROM "document_chunks"
      WHERE "document_id" = ${documentId}
      ORDER BY "chunk_index" ASC;
    `;
    return rows.map((r) => r.metadata as Record<string, unknown>);
  }

  async function seedWorkerStyleDoc(name: string) {
    const doc = await prisma.document.create({
      data: {
        knowledgeBaseId: kbId,
        userId,
        name,
        storageKey: `docs/${userId}/${kbId}/v1/${name}`,
        version: 1,
        status: 'ready',
        sourceType: 'file',
        tags: ['原始标签'],
        metadata: { department: 'rd', outline: { title: '应被剔除' } },
      },
    });
    const facts = {
      sourceType: 'file',
      name,
      storageKey: `docs/${userId}/${kbId}/v1/${name}`,
      tags: ['原始标签'],
      metadata: {},
    };
    await insertDocumentChunksWithInheritance([
      {
        documentId: doc.id,
        knowledgeBaseId: kbId,
        userId,
        documentVersion: 1,
        chunkIndex: 0,
        content: `${name} 的第一段切片内容：连败熔断触发条件。`,
        contentSegmented: `${name} 的 第一段 切片 内容 连败 熔断 触发 条件`,
        tokenCount: 20,
        metadata: workerStyleMetadata(`docs/${userId}/${kbId}/v1/${name}`, name, ['原始标签']),
        embedding: baseVector,
      },
      {
        documentId: doc.id,
        knowledgeBaseId: kbId,
        userId,
        documentVersion: 1,
        chunkIndex: 1,
        content: `${name} 的第二段切片内容：珀金协议规范。`,
        contentSegmented: `${name} 的 第二段 切片 内容 珀金 协议 规范`,
        tokenCount: 18,
        metadata: workerStyleMetadata(`docs/${userId}/${kbId}/v1/${name}`, name, ['原始标签']),
        embedding: baseVector,
      },
    ], facts);
    return doc;
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { username: `c1_field_keep_${Date.now()}`, tokens: 10000 },
    });
    userId = user.id;
    const kb = await prisma.knowledgeBase.create({
      data: { userId, name: 'C1字段保留测试库' },
    });
    kbId = kb.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('TC01-1 断言1: 编辑标签与自定义元数据后 B 层系统字段逐键保留', async () => {
    const doc = await seedWorkerStyleDoc('c1-keep-a.md');
    const before = await fetchChunkMetadata(doc.id);
    expect(before[0].sourceType).toBe('file');

    await updateDocumentMetadataInPlace({
      documentId: doc.id,
      userId,
      tags: ['架构规范', '2026'],
      metadata: { department: '平台组', year: 2026 },
    });

    const after = await fetchChunkMetadata(doc.id);
    for (const chunk of after) {
      expect(chunk.sourceType).toBe(before[0].sourceType);
      expect(chunk.fileName).toBe(before[0].fileName);
      expect(chunk.storageKey).toBe(before[0].storageKey);
      expect(chunk.parsedContentKey).toBe(before[0].parsedContentKey);
    }
  });

  it('TC01-2 断言2: A 层为编辑后值，未涉及的主表自定义键保留，outline 不流入切片', async () => {
    const doc = await seedWorkerStyleDoc('c1-keep-b.md');
    await updateDocumentMetadataInPlace({
      documentId: doc.id,
      userId,
      tags: ['新标签'],
      // retention 模拟路由层浅合并后携带的既有自定义键（见 TC03-3 路由合并断言）
      metadata: { department: '平台组', retention: '长期' },
    });

    const after = await fetchChunkMetadata(doc.id);
    expect(after[0].tags).toEqual(['新标签']);
    expect(after[0].department).toBe('平台组');
    // 未涉及的既有自定义键随合并载荷保留到切片
    expect(after[0].retention).toBe('长期');
    expect(after[0]).not.toHaveProperty('outline');
    expect(after[0]).not.toHaveProperty('year');
  });

  it('TC01-3 断言3: 切片私有键因合并语义保留', async () => {
    const doc = await seedWorkerStyleDoc('c1-keep-c.md');
    // 构造切片私有键（逐片不同的值，模拟任何调用方的切片级扩展）
    await prisma.$executeRaw`
      UPDATE "document_chunks"
      SET "metadata" = "metadata" || '{"privateFlag": true}'::jsonb
      WHERE "document_id" = ${doc.id};
    `;

    await updateDocumentMetadataInPlace({
      documentId: doc.id,
      userId,
      tags: ['新标签'],
      metadata: { department: '平台组' },
    });

    const after = await fetchChunkMetadata(doc.id);
    for (const chunk of after) {
      expect(chunk.privateFlag).toBe(true);
    }
  });

  it('TC01-4 断言4: MetadataFilter 按新标签命中、按旧标签不命中', async () => {
    const doc = await seedWorkerStyleDoc('c1-keep-d.md');
    await updateDocumentMetadataInPlace({
      documentId: doc.id,
      userId,
      tags: ['架构规范'],
      metadata: { department: '平台组' },
    });

    const matched = await searchDocumentChunksLexical({
      userId,
      knowledgeBaseId: kbId,
      query: '连败 熔断',
      topK: 5,
      filter: { tags: ['架构规范'] },
    });
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.some((m) => m.documentId === doc.id)).toBe(true);

    const oldTagMissed = await searchDocumentChunksLexical({
      userId,
      knowledgeBaseId: kbId,
      query: '连败 熔断',
      topK: 5,
      filter: { tags: ['原始标签'] },
    });
    expect(oldTagMissed.filter((m) => m.documentId === doc.id).length).toBe(0);
  });

  it('TC01-5 断言5: 编辑前后切片 content、contentSegmented、embedding 不变（不重切块不重向量化）', async () => {
    const doc = await seedWorkerStyleDoc('c1-keep-e.md');
    const before = await prisma.$queryRaw<Array<{ content: string; content_segmented: string; embedding: string }>>`
      SELECT "content", "content_segmented", "embedding"::text AS "embedding"
      FROM "document_chunks"
      WHERE "document_id" = ${doc.id}
      ORDER BY "chunk_index" ASC;
    `;

    await updateDocumentMetadataInPlace({
      documentId: doc.id,
      userId,
      tags: ['架构规范'],
      metadata: { department: '平台组' },
    });

    const after = await prisma.$queryRaw<Array<{ content: string; content_segmented: string; embedding: string }>>`
      SELECT "content", "content_segmented", "embedding"::text AS "embedding"
      FROM "document_chunks"
      WHERE "document_id" = ${doc.id}
      ORDER BY "chunk_index" ASC;
    `;
    expect(after.map((r) => r.content)).toEqual(before.map((r) => r.content));
    expect(after.map((r) => r.content_segmented)).toEqual(before.map((r) => r.content_segmented));
    expect(after.map((r) => r.embedding)).toEqual(before.map((r) => r.embedding));
  });

  it('TC02-1 断言1: 空标签编辑后切片 tags 为 [] 且系统字段仍在', async () => {
    const doc = await seedWorkerStyleDoc('c1-empty-tags.md');
    await updateDocumentMetadataInPlace({
      documentId: doc.id,
      userId,
      tags: [],
      metadata: {},
    });

    const after = await fetchChunkMetadata(doc.id);
    for (const chunk of after) {
      expect(chunk.tags).toEqual([]);
      expect(chunk.sourceType).toBe('file');
      expect(chunk.storageKey).toBe(`docs/${userId}/${kbId}/v1/c1-empty-tags.md`);
    }
  });

  it('TC05-1 断言1: 存量残缺切片（缺失 B 层键）在编辑后自动补齐为主表派生值', async () => {
    const doc = await seedWorkerStyleDoc('c1-self-heal.md');
    // 构造存量脏数据：抹掉 B 层键（模拟历史整体覆盖 bug）
    await prisma.$executeRaw`
      UPDATE "document_chunks"
      SET "metadata" = '{}'::jsonb
      WHERE "document_id" = ${doc.id};
    `;
    const dirty = await fetchChunkMetadata(doc.id);
    expect(dirty[0]).not.toHaveProperty('sourceType');

    await updateDocumentMetadataInPlace({
      documentId: doc.id,
      userId,
      tags: ['自愈标签'],
      metadata: {},
    });

    const after = await fetchChunkMetadata(doc.id);
    for (const chunk of after) {
      expect(chunk.sourceType).toBe('file');
      expect(chunk.fileName).toBe('c1-self-heal.md');
      expect(chunk.storageKey).toBe(`docs/${userId}/${kbId}/v1/c1-self-heal.md`);
      expect(chunk.parsedContentKey).toBe(`docs/${userId}/${kbId}/v1/content.md`);
    }
  });

  it('TC08 store 半边: replaceDocumentChunksInTransaction 经继承事实构造的切片元数据与共享纯函数逐键一致', async () => {
    const doc = await prisma.document.create({
      data: {
        knowledgeBaseId: kbId,
        userId,
        name: 'c1-replace.md',
        storageKey: `docs/${userId}/${kbId}/v1/c1-replace.md`,
        version: 2,
        status: 'processing',
        sourceType: 'file',
        tags: ['旧标签'],
        metadata: { author: 'alice', outline: { title: '应被剔除' } },
      },
    });

    const { replaceDocumentChunksInTransaction } = await import('../rag/chunk-store');
    const { buildChunkInheritedMetadata } = await import('@repo/shared');

    await replaceDocumentChunksInTransaction({
      documentId: doc.id,
      version: 2,
      metadata: { author: 'alice' },
      inheritance: {
        sourceType: 'file',
        name: 'c1-replace.md',
        storageKey: `docs/${userId}/${kbId}/v1/c1-replace.md`,
        tags: ['重建标签'],
        metadata: { author: 'alice', outline: { title: '应被剔除' } },
      },
      chunks: [
        {
          documentId: doc.id,
          knowledgeBaseId: kbId,
          userId,
          documentVersion: 2,
          chunkIndex: 0,
          content: '重建后的切片内容。',
          contentSegmented: '重建 后 的 切片 内容',
          tokenCount: 10,
          embedding: baseVector,
        },
      ],
    });

    const after = await fetchChunkMetadata(doc.id);
    expect(after.length).toBe(1);
    const expected = buildChunkInheritedMetadata({
      sourceType: 'file',
      name: 'c1-replace.md',
      storageKey: `docs/${userId}/${kbId}/v1/c1-replace.md`,
      tags: ['重建标签'],
      metadata: { author: 'alice', outline: { title: '应被剔除' } },
    });
    expect(after[0]).toEqual(expected);
    expect(after[0].parsedContentKey).toBe(`docs/${userId}/${kbId}/v1/content.md`);
  });
});

