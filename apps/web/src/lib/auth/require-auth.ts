import { verifyAccessToken } from './jwt';
import { AuthError } from './errors';
import { prisma } from '@repo/db';

/**
 * 从请求头 Authorization: Bearer <token> 中提取并验证 JWT，返回 userId。
 * 同时检查用户账号状态，已禁用的用户将抛出 FORBIDDEN 错误。
 * 验证失败时抛出 AuthError，由调用方捕获并返回 401/403。
 */
export async function requireAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('缺少认证令牌', 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);
  const { userId } = verifyAccessToken(token);

  // 检查用户是否存在及是否被禁用
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  if (!user) {
    throw new AuthError('用户不存在', 'UNAUTHORIZED');
  }

  if (user.status === 'disabled') {
    throw new AuthError('账号已被停用，请联系管理员', 'FORBIDDEN');
  }

  return userId;
}
