import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import {
  getRefreshTokenFromCookie,
  clearRefreshTokenCookie,
  clearAuthKindCookie,
  hashRefreshToken,
} from '@/lib/auth/jwt';
import { createSuccessResponse } from '@/lib/api/responses';

/**
 * POST /api/auth/logout
 * 清除 Cookie 与会话令牌。仅接受 POST：GET 登出会被第三方页面的图片标签/链接强制触发。
 * 返回 JSON 而非重定向，前端拿到结果后自行跳转登录页。
 */
export async function POST(_req: NextRequest) {
  let token: string | undefined;

  try {
    token = await getRefreshTokenFromCookie();
  } catch {
    // 读取 Cookie 失败不影响登出
  }

  // 先清除 Cookie，确保登出始终生效
  try {
    await clearRefreshTokenCookie();
    await clearAuthKindCookie();
  } catch {
    // Cookie 清除失败继续执行
  }

  // 清理数据库中的 refresh token（失败不影响登出）
  if (token) {
    try {
      // 库中只存摘要：先对 cookie 明文算摘要再删
      await prisma.refreshToken.deleteMany({ where: { token: hashRefreshToken(token) } });
    } catch (error) {
      // 常见：refresh_tokens 表不存在（迁移未执行）、数据库连接异常
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.includes('refresh_tokens') &&
        !message.includes("Can't reach database server") &&
        !message.includes('P2021')
      ) {
        console.error('登出清理 refresh token 失败:', message);
      }
    }
  }

  return createSuccessResponse(null, '已退出登录');
}
