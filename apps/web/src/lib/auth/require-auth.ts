import { verifyAccessToken } from './jwt';

/**
 * 从请求头 Authorization: Bearer <token> 中提取并验证 JWT，返回 userId。
 * 验证失败时抛出错误，由调用方的 withAuth 捕获并返回 401。
 * 兼容 Request 和 NextRequest 类型。
 */
export async function requireAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('缺少认证令牌');
  }

  const token = authHeader.slice(7);
  const { userId } = verifyAccessToken(token);
  return userId;
}
