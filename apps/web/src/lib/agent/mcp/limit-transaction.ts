/**
 * MCP 用户级配置限额短事务（加固修复）
 *
 * 只包裹数据库计数与写入，不得把远程发现、HTTP 调用或解密等待放进本事务。
 * 同一用户的 Server 创建与工具启用通过事务级咨询锁串行化，关闭「先查后写」竞态。
 */

import { prisma, type Prisma } from '@repo/db';

/** 在单用户咨询锁内执行短数据库事务 */
export async function withMcpUserLimitLock<T>(
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mcp-user-limits:${userId}`}, 0))`;
    return work(tx);
  });
}
