import { verifyAccessToken } from './jwt';

/**
 * 从请求头 Authorization: Bearer <token> 中提取并验证 JWT，检查是否为管理员。
 * 验证失败时抛出错误，由调用方捕获并返回 401/403。
 * 兼容 Request 和 NextRequest 类型。
 */
export async function requireAdmin(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('缺少认证令牌');
  }

  const token = authHeader.slice(7);
  const { userId, role } = verifyAccessToken(token);

  if (role !== 'admin') {
    throw new Error('无权访问：需要管理员权限');
  }

  return userId;
}
