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
  try {
    const token = await getRefreshTokenFromCookie();

    // 先清除 Cookie（确保即使数据库失败也能退出）
    await clearRefreshTokenCookie();

    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } });
    }
  } catch (error) {
    console.error('登出清理失败:', error);
  }

  // 全页面重定向，确保浏览器处理 Set-Cookie
  return Response.redirect(new URL('/login?logout=1', req.nextUrl.origin));
}
