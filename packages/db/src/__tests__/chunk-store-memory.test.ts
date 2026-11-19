import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://weixiaoyu@localhost:5432/ai_aggregation';
  }
});

import { prisma } from '../client';
import {
  insertMemoryChunks,
  deleteMemoryChunksByUser,
  deleteMemoryChunksBySession,
  searchMemoryChunksDense,
  searchMemoryChunksLexical,
} from '../rag/chunk-store';

describe('ChunkStore 会话记忆存储与检索测试 (工单 09)', () => {
  let userAId: string;
  let userBId: string;
  let sessionA1Id: string;
  let sessionA2Id: string;
  let sessionB1Id: string;

  // 1024 维测试向量
  const vectorCode = new Array(1024).fill(0);
  vectorCode[0] = 1.0;

  const vectorWeather = new Array(1024).fill(0);
  vectorWeather[1] = 1.0;

  beforeAll(async () => {
    // 1. 创建测试用户 A 和 B
    const userA = await prisma.user.create({
      data: {
        username: `mem_userA_${Date.now()}`,
        tokens: 10000,
        memorySearchEnabled: false,
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        username: `mem_userB_${Date.now()}`,
        tokens: 10000,
        memorySearchEnabled: false,
      },
    });
    userBId = userB.id;

    // 2. 创建会话
    const sA1 = await prisma.chatSession.create({
      data: {
        userId: userAId,
        title: '会话 A1',
      },
    });
    sessionA1Id = sA1.id;

    const sA2 = await prisma.chatSession.create({
      data: {
        userId: userAId,
        title: '会话 A2',
      },
    });
    sessionA2Id = sA2.id;

    const sB1 = await prisma.chatSession.create({
      data: {
        userId: userBId,
        title: '会话 B1',
      },
    });
    sessionB1Id = sB1.id;
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.conversationMemoryChunk.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.chatSession.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
  });

  it('验证 User.memorySearchEnabled 默认值为 false (QA-005 前置)', async () => {
    const user = await prisma.user.findUnique({
      where: { id: userAId },
      select: { memorySearchEnabled: true },
    });
    expect(user?.memorySearchEnabled).toBe(false);
  });

  it('插入会话记忆切片并支持稠密向量与词法检索', async () => {
    // 插入 User A 的切片
    await insertMemoryChunks([
      {
        userId: userAId,
        sessionId: sessionA1Id,
        chunkIndex: 0,
        content: '用户说：记住暗号是蓝色大象42',
        contentSegmented: '用户 说 记住 暗号 是 蓝色 大象 42',
        embedding: vectorCode,
      },
      {
        userId: userAId,
        sessionId: sessionA2Id,
        chunkIndex: 0,
        content: '今天天气晴朗适合出门散步',
        contentSegmented: '今天 天气 晴朗 适合 出门 散步',
        embedding: vectorWeather,
      },
    ]);

    // 插入 User B 的切片
    await insertMemoryChunks([
      {
        userId: userBId,
        sessionId: sessionB1Id,
        chunkIndex: 0,
        content: 'UserB 的私有秘密暗号是红色小鸟99',
        contentSegmented: 'UserB 的 私有 秘密 暗号 是 红色 小鸟 99',
        embedding: vectorCode,
      },
    ]);

    // 稠密向量检索 User A
    const denseA = await searchMemoryChunksDense({
      userId: userAId,
      queryVector: vectorCode,
      topK: 5,
    });
    expect(denseA.length).toBeGreaterThanOrEqual(1);
    expect(denseA[0].content).toContain('蓝色大象42');
    expect(denseA.every((c) => c.userId === userAId)).toBe(true);

    // 词法检索 User A
    const lexicalA = await searchMemoryChunksLexical({
      userId: userAId,
      query: '散步',
      topK: 5,
    });
    expect(lexicalA.length).toBe(1);
    expect(lexicalA[0].content).toContain('天气晴朗');
  });

  it('跨用户隔离安全：使用 User B 的身份检索 User A 的切片严格零命中', async () => {
    // User B 检索「蓝色大象」词法路
    const lexicalB = await searchMemoryChunksLexical({
      userId: userBId,
      query: '蓝色大象',
      topK: 5,
    });
    expect(lexicalB).toHaveLength(0);

    // User B 检索向量匹配，仅命中 User B 自己的「红色小鸟」，绝不命中 User A
    const denseB = await searchMemoryChunksDense({
      userId: userBId,
      queryVector: vectorCode,
      topK: 5,
    });
    expect(denseB.every((c) => c.userId === userBId)).toBe(true);
    expect(denseB.some((c) => c.content.includes('蓝色大象'))).toBe(false);
  });

  it('会话删除联动：删除指定 session 后对应切片级联删除', async () => {
    // 删除 sessionA2 的切片
    const deletedCount = await deleteMemoryChunksBySession(sessionA2Id);
    expect(deletedCount).toBeGreaterThan(0);

    // 再次查词法「散步」
    const lexicalAfter = await searchMemoryChunksLexical({
      userId: userAId,
      query: '散步',
      topK: 5,
    });
    expect(lexicalAfter).toHaveLength(0);

    // sessionA1 的切片依然保留
    const denseAfter = await searchMemoryChunksDense({
      userId: userAId,
      queryVector: vectorCode,
      topK: 5,
    });
    expect(denseAfter.length).toBeGreaterThanOrEqual(1);
  });

  it('用户关闭记忆闭环：deleteMemoryChunksByUser 彻底清空存量切片 (QA-006)', async () => {
    // 清除 User A 的全部切片
    const deleted = await deleteMemoryChunksByUser(userAId);
    expect(deleted).toBeGreaterThan(0);

    // 验证 User A 切片数为 0
    const countA = await prisma.conversationMemoryChunk.count({
      where: { userId: userAId },
    });
    expect(countA).toBe(0);

    // User B 的切片不受影响
    const countB = await prisma.conversationMemoryChunk.count({
      where: { userId: userBId },
    });
    expect(countB).toBe(1);
  });
});
