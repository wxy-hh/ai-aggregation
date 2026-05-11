import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getRefreshTokenFromCookie, clearRefreshTokenCookie } from '@/lib/auth/jwt';

/** GET / POST 均可，清除 Cookie 后重定向到登录页 */
export async function GET(req: NextRequest) {
  return handleLogout(req);
}

export async function POST(req: NextRequest) {
  return handleLogout(req);
}

async function handleLogout(req: NextRequest) {
  let token: string | undefined;

  try {
    token = await getRefreshTokenFromCookie();
  } catch {
    // 读取 Cookie 失败不影响登出
  }

  // 先清除 Cookie，确保登出始终生效
  try {
    await clearRefreshTokenCookie();
  } catch {
    // Cookie 清除失败继续执行
  }

  // 清理数据库中的 refresh token（失败不影响登出）
  if (token) {
    try {
      await prisma.refreshToken.deleteMany({ where: { token } });
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

  return Response.redirect(new URL('/login?logout=1', req.nextUrl.origin));
}
