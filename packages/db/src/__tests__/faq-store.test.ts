import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://weixiaoyu@localhost:5432/ai_aggregation';
  }
});

import { prisma } from '../client';
import {
  insertFaqWithQuestions,
  updateFaqWithQuestions,
  deleteFaq,
  toggleFaqStatus,
  searchFaqsDense,
  getFaqsByKnowledgeBase,
  listActiveKnowledgeBasesForFaq,
  validateKnowledgeBaseForFaq,
  incrementFaqHitCount,
} from '../rag/faq-store';

describe('FAQStore 数据访问与向量检索测试 (TC06 / ADR-0027)', () => {
  let userAId: string;
  let userBId: string;
  let kbAId: string;
  let kbBId: string;

  // 1024 维测试向量生成辅助
  function createTestVector(primaryIndex = 0, magnitude = 1.0): number[] {
    const vec = new Array(1024).fill(0);
    vec[primaryIndex] = magnitude;
    return vec;
  }

  // 模拟 embedding 函数
  const mockEmbed = async (text: string): Promise<number[]> => {
    if (text.includes('退款') || text.includes('退钱') || text.includes('退货')) {
      return createTestVector(0, 1.0);
    }
    if (text.includes('发票') || text.includes('报销')) {
      return createTestVector(1, 1.0);
    }
    return createTestVector(100, 1.0);
  };

  // 模拟分词函数
  const mockTokenize = (text: string): string => text.split('').join(' ');

  beforeAll(async () => {
    // 创建两个测试用户
    const userA = await prisma.user.create({
      data: {
        username: `faq_test_userA_${Date.now()}`,
        tokens: 10000,
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        username: `faq_test_userB_${Date.now()}`,
        tokens: 10000,
      },
    });
    userBId = userB.id;

    // 为两个用户分别创建知识库
    const kbA = await prisma.knowledgeBase.create({
      data: {
        userId: userAId,
        name: '用户A知识库',
      },
    });
    kbAId = kbA.id;

    const kbB = await prisma.knowledgeBase.create({
      data: {
        userId: userBId,
        name: '用户B知识库',
      },
    });
    kbBId = kbB.id;
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.knowledgeBase.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
  });

  it('TC06-1: insertFaqWithQuestions 成功在事务内写入主表并为标准问与相似问分别写入独立向量记录', async () => {
    const faq = await insertFaqWithQuestions({
      userId: userAId,
      knowledgeBaseId: kbAId,
      question: '如何申请退款？',
      answer: '请在订单中心点击申请退款，工作日24小时内原路退回。',
      similarQuestions: ['退钱流程是什么', '怎么退货退款'],
      embedFn: mockEmbed,
      tokenizeFn: mockTokenize,
    });

    expect(faq.id).toBeDefined();
    expect(faq.question).toBe('如何申请退款？');
    expect(faq.enabled).toBe(true);

    // 检查数据库中的问法记录数（主问题 1 个 + 相似问 2 个 = 3 个）
    const questionRows = await prisma.knowledgeFaqQuestion.findMany({
      where: { faqId: faq.id },
      orderBy: { isPrimary: 'desc' },
    });

    expect(questionRows).toHaveLength(3);
    expect(questionRows[0]?.isPrimary).toBe(true);
    expect(questionRows[0]?.questionText).toBe('如何申请退款？');
    expect(questionRows[1]?.isPrimary).toBe(false);
  });

  it('TC06-2: searchFaqsDense 检索相似文本能够按余弦相似度降序正确召回匹配的 FAQ', async () => {
    // 使用退款特征向量检索
    const queryVector = createTestVector(0, 1.0);
    const matches = await searchFaqsDense({
      userId: userAId,
      knowledgeBaseIds: [kbAId],
      queryVector,
      topK: 5,
    });

    expect(matches.length).toBeGreaterThan(0);
    const topMatch = matches[0];
    expect(topMatch).toBeDefined();
    expect(topMatch!.question).toBe('如何申请退款？');
    expect(topMatch!.similarity).toBeGreaterThan(0.9);
  });

  it('TC06-3: 传入不同 userId 进行检索时，由于 SQL 前置 ACL 隔离，返回空结果，杜绝跨租户越权', async () => {
    const queryVector = createTestVector(0, 1.0);
    // User B 检索 User A 的知识库或在自身名下检索，不应获取 User A 的问答对
    const matchesForB = await searchFaqsDense({
      userId: userBId,
      knowledgeBaseIds: [kbAId], // 试图指定 A 的知识库
      queryVector,
      topK: 5,
    });

    expect(matchesForB).toHaveLength(0);
  });

  it('TC06-4: 将记录设置为 enabled: false 后，searchFaqsDense 自动过滤不返回该记录', async () => {
    // 1. 获取 User A 的 FAQ
    const list = await getFaqsByKnowledgeBase(userAId, kbAId);
    expect(list.length).toBeGreaterThan(0);
    const targetFaq = list[0]!;

    // 2. 停用该 FAQ
    await toggleFaqStatus(userAId, targetFaq.id, false);

    // 3. 再次执行稠密检索
    const queryVector = createTestVector(0, 1.0);
    const matches = await searchFaqsDense({
      userId: userAId,
      knowledgeBaseIds: [kbAId],
      queryVector,
      topK: 5,
    });

    expect(matches).toHaveLength(0);

    // 4. 恢复启用
    await toggleFaqStatus(userAId, targetFaq.id, true);
    const reMatches = await searchFaqsDense({
      userId: userAId,
      knowledgeBaseIds: [kbAId],
      queryVector,
      topK: 5,
    });
    expect(reMatches.length).toBeGreaterThan(0);
  });

  it('TC07-1: 新 FAQ 候选适配层返回活跃库、候选事实与知识库更新时间', async () => {
    const newer = await prisma.knowledgeBase.create({
      data: { userId: userAId, name: '最近更新库' },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE knowledge_bases SET updated_at = NOW() + INTERVAL '1 hour' WHERE id = $1`,
      newer.id
    );

    const activeKbs = await listActiveKnowledgeBasesForFaq(userAId, 3);
    expect(activeKbs[0]?.id).toBe(newer.id);
    expect(activeKbs.map((kb) => kb.id)).toContain(kbAId);
    expect(activeKbs.every((kb) => kb.status === 'active')).toBe(true);

    expect(await validateKnowledgeBaseForFaq(userAId, kbAId)).toBe(true);
    expect(await validateKnowledgeBaseForFaq(userBId, kbAId)).toBe(false);

    const candidates = await searchFaqsDense({
      userId: userAId,
      knowledgeBaseIds: [kbAId],
      queryVector: createTestVector(0, 1.0),
      topK: 3,
    });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toMatchObject({
      faqId: expect.any(String),
      knowledgeBaseId: kbAId,
      enabled: true,
      knowledgeBaseUpdatedAt: expect.any(Date),
    });
    expect(candidates[0]).not.toHaveProperty('isShortCircuit');
    expect(candidates[0]).not.toHaveProperty('isGroundTruth');
  });

  it('TC07-2: 归档知识库不进入活跃列表且其 FAQ 不进入检索候选', async () => {
    const archived = await prisma.knowledgeBase.create({
      data: { userId: userAId, name: '归档库', status: 'archived' },
    });
    await insertFaqWithQuestions({
      userId: userAId,
      knowledgeBaseId: archived.id,
      question: '归档库专属问题？',
      answer: '归档库答案',
      embedFn: mockEmbed,
      tokenizeFn: mockTokenize,
    });

    const activeKbs = await listActiveKnowledgeBasesForFaq(userAId, 3);
    expect(activeKbs.some((kb) => kb.id === archived.id)).toBe(false);
    expect(await validateKnowledgeBaseForFaq(userAId, archived.id)).toBe(false);

    const candidates = await searchFaqsDense({
      userId: userAId,
      knowledgeBaseIds: [archived.id],
      queryVector: createTestVector(0, 1.0),
      topK: 3,
    });
    expect(candidates).toHaveLength(0);
  });

  it('TC07-3: 命中计数按 FAQ ID 原子增加 1', async () => {
    const list = await getFaqsByKnowledgeBase(userAId, kbAId);
    const target = list[0]!;
    const before = target.hitCount;
    await incrementFaqHitCount(target.id);
    const after = await prisma.knowledgeFaq.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.hitCount).toBe(before + 1);
  });

});
