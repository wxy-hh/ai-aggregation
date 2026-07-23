import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** 仅供未登录用户访问的路径（真实登录用户访问时重定向到 /home，匿名用户仍可停留） */
const UNAUTH_ONLY_PATHS = ['/login', '/register', '/', '/forgot-password', '/reset-password'];

export function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;

  const hasToken = !!req.cookies.get('refresh_token')?.value;
  // auth_kind 由登录/匿名接口写入：'user' 表示真实账号，'anonymous' 表示匿名设备账号
  const authKind = req.cookies.get('auth_kind')?.value;
  const isRealUser = hasToken && authKind === 'user';

  // 仅真实登录用户访问登录/注册/首页时重定向到聊天页；匿名用户允许停留以便切换为账号登录
  if (isRealUser && UNAUTH_ONLY_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/home', origin));
  }

  // 所有页面均允许访问；未登录用户的权限控制由 API 路由内部处理
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.svg|xingpan.svg).*)',
  ],
};
