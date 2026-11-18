import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://weixiaoyu@localhost:5432/ai_aggregation';
  }
});

import { prisma } from '../client';
import { persistMemoryTurn } from '../chat/message-store';
import { insertMemoryChunksIfEnabled } from '../rag/chunk-store';


describe('MessageStore 记忆输入消息持久化与切片开关守卫', () => {
  let userAId: string;
  let userBId: string;
  const sessionA = `conv-mem-a-${Date.now()}`;
  const sessionB = `conv-mem-b-${Date.now()}`;

  beforeAll(async () => {
    const userA = await prisma.user.create({
      data: {
        username: `mem_msg_a_${Date.now()}`,
        tokens: 10000,
        memorySearchEnabled: true,
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        username: `mem_msg_b_${Date.now()}`,
        tokens: 10000,
        memorySearchEnabled: true,
      },
    });
    userBId = userB.id;
  });

  afterAll(async () => {
    await prisma.chatSession.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
  });

  it('写入一轮 user/assistant 消息并建立客户端会话身份', async () => {
    const result = await persistMemoryTurn({
      userId: userAId,
      sessionId: sessionA,
      turnId: 'user-1001',
      requestId: 'req-1001',
      userContent: '记住暗号是蓝色大象42',
      assistantContent: '好的，我记住了蓝色大象42。',
    });

    expect(result.persisted).toBe(true);

    const session = await prisma.chatSession.findUnique({ where: { id: sessionA } });
    expect(session?.userId).toBe(userAId);

    const rows = await prisma.message.findMany({
      where: { sessionId: sessionA },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      role: 'user',
      content: '记住暗号是蓝色大象42',
      turnId: 'user-1001',
      idempotencyKey: 'turn:user-1001',
    });
    expect(rows[1]).toMatchObject({
      role: 'assistant',
      content: '好的，我记住了蓝色大象42。',
      turnId: 'user-1001',
      requestId: 'req-1001',
      idempotencyKey: 'complete:req-1001',
    });
  });

  it('同一完成重复写入不产生重复消息', async () => {
    await persistMemoryTurn({
      userId: userAId,
      sessionId: sessionA,
      turnId: 'user-1001',
      requestId: 'req-1001',
      userContent: '记住暗号是蓝色大象42',
      assistantContent: '好的，我记住了蓝色大象42。',
    });

    const count = await prisma.message.count({ where: { sessionId: sessionA } });
    expect(count).toBe(2);
  });

  it('同一轮次的新完成追加 assistant 行，user 行保持一条', async () => {
    await persistMemoryTurn({
      userId: userAId,
      sessionId: sessionA,
      turnId: 'user-1001',
      requestId: 'req-1002',
      userContent: '记住暗号是蓝色大象42',
      assistantContent: '重新生成后的回答。',
    });

    const users = await prisma.message.count({
      where: { sessionId: sessionA, role: 'user' },
    });
    const assistants = await prisma.message.count({
      where: { sessionId: sessionA, role: 'assistant' },
    });
    expect(users).toBe(1);
    expect(assistants).toBe(2);

    const contents = await prisma.message.findMany({
      where: { sessionId: sessionA, role: 'assistant' },
      select: { content: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(contents.map((row) => row.content)).toContain('重新生成后的回答。');
  });

  it('跨用户会话 ID 不写入且不污染对方会话', async () => {
    await prisma.chatSession.create({
      data: { id: sessionB, userId: userBId },
    });

    const result = await persistMemoryTurn({
      userId: userAId,
      sessionId: sessionB,
      turnId: 'user-2001',
      requestId: 'req-2001',
      userContent: '试图写入他人的会话',
      assistantContent: '不应落库',
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toBe('session_owned_by_other_user');
    const count = await prisma.message.count({ where: { sessionId: sessionB } });
    expect(count).toBe(0);
  });

  it('关闭与在途切片写入互斥：关闭先提交时插入返回 0', async () => {
    const user = await prisma.user.create({
      data: {
        username: `mem_msg_lock_${Date.now()}`,
        tokens: 10000,
        memorySearchEnabled: true,
      },
    });
    const session = await prisma.chatSession.create({
      data: { id: `conv-lock-${Date.now()}`, userId: user.id },
    });

    let releaseLock!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const closer = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id} FOR UPDATE`;
        await lockHeld;
        await tx.user.update({
          where: { id: user.id },
          data: { memorySearchEnabled: false },
        });
        await tx.conversationMemoryChunk.deleteMany({ where: { userId: user.id } });
        await tx.chatSession.deleteMany({ where: { userId: user.id } });
      },
      { timeout: 10000, maxWait: 10000 }
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const insertPromise = insertMemoryChunksIfEnabled([
      {
        userId: user.id,
        sessionId: session.id,
        chunkIndex: 0,
        content: '关闭期间的写入',
        contentSegmented: '关闭 期间 的 写入',
        embedding: new Array(1024).fill(0.1),
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseLock();
    await closer;

    expect(await insertPromise).toBe(0);
    expect(await prisma.conversationMemoryChunk.count({ where: { userId: user.id } })).toBe(0);

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('插入先提交、关闭后提交时切片被删除，另一用户不受影响', async () => {
    const userD = await prisma.user.create({
      data: {
        username: `mem_msg_d_${Date.now()}`,
        tokens: 10000,
        memorySearchEnabled: true,
      },
    });
    const userE = await prisma.user.create({
      data: {
        username: `mem_msg_e_${Date.now()}`,
        tokens: 10000,
        memorySearchEnabled: true,
      },
    });
    const sessionD = await prisma.chatSession.create({
      data: { id: `conv-d-${Date.now()}`, userId: userD.id },
    });
    const sessionE = await prisma.chatSession.create({
      data: { id: `conv-e-${Date.now()}`, userId: userE.id },
    });

    await insertMemoryChunksIfEnabled([
      {
        userId: userD.id,
        sessionId: sessionD.id,
        chunkIndex: 0,
        content: '用户 D 的切片',
        contentSegmented: '用户 D 的 切片',
        embedding: new Array(1024).fill(0.1),
      },
    ]);
    await insertMemoryChunksIfEnabled([
      {
        userId: userE.id,
        sessionId: sessionE.id,
        chunkIndex: 0,
        content: '用户 E 的切片',
        contentSegmented: '用户 E 的 切片',
        embedding: new Array(1024).fill(0.1),
      },
    ]);

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userD.id} FOR UPDATE`;
      await tx.user.update({
        where: { id: userD.id },
        data: { memorySearchEnabled: false },
      });
      await tx.conversationMemoryChunk.deleteMany({ where: { userId: userD.id } });
      await tx.chatSession.deleteMany({ where: { userId: userD.id } });
    });

    expect(
      await prisma.conversationMemoryChunk.count({ where: { userId: userD.id } })
    ).toBe(0);
    expect(
      await prisma.conversationMemoryChunk.count({ where: { userId: userE.id } })
    ).toBe(1);

    await prisma.chatSession.deleteMany({
      where: { userId: { in: [userD.id, userE.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userD.id, userE.id] } },
    });
  });

  it('删除会话级联删除消息与切片，批量删除与清空互不影响', async () => {
    const user = await prisma.user.create({
      data: {
        username: `mem_msg_cascade_${Date.now()}`,
        tokens: 10000,
        memorySearchEnabled: true,
      },
    });
    const sessionOne = `conv-cascade-1-${Date.now()}`;
    const sessionTwo = `conv-cascade-2-${Date.now()}`;

    await persistMemoryTurn({
      userId: user.id,
      sessionId: sessionOne,
      turnId: 'user-c1',
      requestId: 'req-c1',
      userContent: '第一个会话的问题',
      assistantContent: '第一个会话的回答',
    });
    await persistMemoryTurn({
      userId: user.id,
      sessionId: sessionTwo,
      turnId: 'user-c2',
      requestId: 'req-c2',
      userContent: '第二个会话的问题',
      assistantContent: '第二个会话的回答',
    });

    await insertMemoryChunksIfEnabled([
      {
        userId: user.id,
        sessionId: sessionOne,
        chunkIndex: 0,
        content: '第一个会话的切片',
        contentSegmented: '第一个 会话 的 切片',
        embedding: new Array(1024).fill(0.1),
      },
    ]);

    await prisma.chatSession.delete({ where: { id: sessionOne } });
    expect(await prisma.message.count({ where: { sessionId: sessionOne } })).toBe(0);
    expect(
      await prisma.conversationMemoryChunk.count({ where: { sessionId: sessionOne } })
    ).toBe(0);
    expect(await prisma.message.count({ where: { sessionId: sessionTwo } })).toBe(2);

    const deleted = await prisma.chatSession.deleteMany({
      where: { id: { in: [sessionTwo] }, userId: user.id },
    });
    expect(deleted.count).toBe(1);
    expect(await prisma.message.count({ where: { sessionId: sessionTwo } })).toBe(0);

    const missing = await prisma.chatSession.deleteMany({
      where: { id: { in: ['conv-does-not-exist'] }, userId: user.id },
    });
    expect(missing.count).toBe(0);

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('切片写入守卫：关闭记忆的用户不写入切片', async () => {
    const disabled = await prisma.user.create({
      data: {
        username: `mem_msg_disabled_${Date.now()}`,
        tokens: 10000,
        memorySearchEnabled: false,
      },
    });
    const session = await prisma.chatSession.create({
      data: { id: `conv-disabled-${Date.now()}`, userId: disabled.id },
    });

    const inserted = await insertMemoryChunksIfEnabled([
      {
        userId: disabled.id,
        sessionId: session.id,
        chunkIndex: 0,
        content: '不应写入的切片',
        contentSegmented: '不应 写入 的 切片',
        embedding: new Array(1024).fill(0.1),
      },
    ]);

    expect(inserted).toBe(0);
    expect(
      await prisma.conversationMemoryChunk.count({ where: { userId: disabled.id } })
    ).toBe(0);

    await prisma.chatSession.deleteMany({ where: { userId: disabled.id } });
    await prisma.user.delete({ where: { id: disabled.id } });
  });
});
