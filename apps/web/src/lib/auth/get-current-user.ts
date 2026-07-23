/**
 * 获取当前请求用户上下文。
 *
 * 在 `requireAuth` 验证 JWT 之后，再查询一次用户表获取 role / isAnonymous / status，
 * 供需要业务权限判断的 API 路由复用，避免每个路由重复写同样的 `prisma.user.findUnique`。
 */

import { requireAuth } from './require-auth';
import { AuthError } from './errors';
import { prisma } from '@repo/db';

export interface UserContext {
  id: string;
  role: string;
  isAnonymous: boolean;
  status: string;
  tokens?: number;
}

const DEFAULT_SELECT = {
  id: true,
  role: true,
  isAnonymous: true,
  status: true,
  tokens: true,
} as const;

/**
 * 返回包含默认字段的当前用户上下文。
 * 如路由需要额外字段，可通过 `select` 参数自定义查询列。
 */
export async function getCurrentUser(req: Request): Promise<UserContext> {
  const userId = await requireAuth(req);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: DEFAULT_SELECT,
  });

  if (!user) {
    throw new AuthError('用户不存在', 'UNAUTHORIZED');
  }

  return user as UserContext;
}
