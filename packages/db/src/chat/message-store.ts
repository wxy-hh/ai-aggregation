/**
 * 记忆输入消息持久化 (ADR-0058)
 *
 * 唯一写入入口：完成生命周期把当前轮的 user/assistant 纯文本写入客户端会话身份对应的
 * ChatSession。幂等键保证同一轮 user 只有一条、同一完成 assistant 只有一条。
 */

import { prisma } from '../client';

export interface PersistMemoryTurnInput {
  userId: string;
  /** 客户端 `conv-*` 会话 ID，直接作为 ChatSession.id */
  sessionId: string;
  /** 当前轮 user 消息的本地 ID */
  turnId: string;
  /** 本次完成的请求标识 */
  requestId: string;
  userContent: string;
  assistantContent: string;
}

export interface PersistMemoryTurnResult {
  persisted: boolean;
  reason?: 'session_owned_by_other_user';
}

/**
 * 在一个事务内 upsert 记忆会话、user 消息与 assistant 消息。
 * 会话 ID 已属于其他用户时返回 persisted=false，不写入任何消息。
 */
export async function persistMemoryTurn(
  input: PersistMemoryTurnInput
): Promise<PersistMemoryTurnResult> {
  const { userId, sessionId, turnId, requestId, userContent, assistantContent } = input;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (existing && existing.userId !== userId) {
      return { persisted: false, reason: 'session_owned_by_other_user' };
    }

    if (!existing) {
      try {
        await tx.chatSession.create({
          data: { id: sessionId, userId },
        });
      } catch (error) {
        // 并发首次写入：唯一键冲突后复核归属，避免把别人的会话当成自己的
        if ((error as { code?: string } | null)?.code !== 'P2002') throw error;
        const raced = await tx.chatSession.findUnique({
          where: { id: sessionId },
          select: { userId: true },
        });
        if (!raced || raced.userId !== userId) {
          return { persisted: false, reason: 'session_owned_by_other_user' as const };
        }
      }
    }

    await tx.message.upsert({
      where: {
        sessionId_idempotencyKey: {
          sessionId,
          idempotencyKey: `turn:${turnId}`,
        },
      },
      create: {
        sessionId,
        role: 'user',
        content: userContent,
        turnId,
        idempotencyKey: `turn:${turnId}`,
      },
      update: {
        content: userContent,
        turnId,
      },
    });

    await tx.message.upsert({
      where: {
        sessionId_idempotencyKey: {
          sessionId,
          idempotencyKey: `complete:${requestId}`,
        },
      },
      create: {
        sessionId,
        role: 'assistant',
        content: assistantContent,
        turnId,
        requestId,
        idempotencyKey: `complete:${requestId}`,
      },
      update: {
        content: assistantContent,
        turnId,
        requestId,
      },
    });

    return { persisted: true };
  });
}
