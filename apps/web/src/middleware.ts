import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** 无需登录即可访问的路径 */
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

/** 公开 API 路径前缀 */
const PUBLIC_API_PREFIXES = [
  '/api/auth',
];

/** 静态资源前缀 */
const STATIC_PREFIXES = [
  '/_next',
  '/favicon',
  '/assets',
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;

  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;

  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;

  return false;
}

/** 仅供未登录用户访问的路径（已登录用户访问时重定向到 /chat） */
const UNAUTH_ONLY_PATHS = ['/login', '/register', '/', '/forgot-password', '/reset-password'];

export function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;

  const hasToken = !!req.cookies.get('refresh_token')?.value;

  // 已登录用户访问登录/注册/首页等，重定向到聊天页
  if (hasToken && UNAUTH_ONLY_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/home', origin));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 未登录用户访问受保护页面，重定向到登录页
  if (!hasToken) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.svg).*)',
  ],
};
