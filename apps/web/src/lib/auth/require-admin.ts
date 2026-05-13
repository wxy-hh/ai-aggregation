import { verifyAccessToken } from './jwt';
import { AuthError } from './errors';
import { prisma } from '@repo/db';

/**
 * 从请求头验证 JWT 并检查 admin 角色。
 * 同时检查用户当前数据库中的角色和账号状态。
 * 非 admin 用户抛出 AuthError(FORBIDDEN)，未认证抛出 AuthError(UNAUTHORIZED)。
 */
export async function requireAdmin(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('缺少认证令牌', 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);
  const { userId, role } = verifyAccessToken(token);

  if (role !== 'admin') {
    throw new AuthError('无权访问：需要管理员权限', 'FORBIDDEN');
  }

  // 检查用户当前数据库中的角色和状态（JWT 可能已过时）
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });

  if (!user) {
    throw new AuthError('用户不存在', 'UNAUTHORIZED');
  }

  if (user.status === 'disabled') {
    throw new AuthError('账号已被停用，请联系管理员', 'FORBIDDEN');
  }

  if (user.role !== 'admin') {
    throw new AuthError('管理员权限已变更，请重新登录', 'FORBIDDEN');
  }

  return userId;
}
