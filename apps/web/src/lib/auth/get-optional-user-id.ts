import { verifyAccessToken } from './jwt';

/**
 * 尝试从 Authorization 头中解析用户 ID。
 * 未登录、令牌缺失或令牌无效时返回 null，不中断原有接口流程。
 */
export async function getOptionalUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.slice(7);
    const { userId } = verifyAccessToken(token);
    return userId;
  } catch {
    return null;
  }
}
