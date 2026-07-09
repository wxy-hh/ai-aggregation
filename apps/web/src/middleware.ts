import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** 仅供未登录用户访问的路径（已登录用户访问时重定向到 /home） */
const UNAUTH_ONLY_PATHS = ['/login', '/register', '/', '/forgot-password', '/reset-password'];

export function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;

  const hasToken = !!req.cookies.get('refresh_token')?.value;

  // 已登录用户访问登录/注册/首页等，重定向到聊天页
  if (hasToken && UNAUTH_ONLY_PATHS.includes(pathname)) {
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
