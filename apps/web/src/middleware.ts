import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** 认证与账号恢复页面：是否可访问不取决于 Cookie 存在性 */
const AUTH_FLOW_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

export function middleware(req: NextRequest) {
  const { pathname, search, origin } = req.nextUrl;

  const hasToken = !!req.cookies.get('refresh_token')?.value;

  // 1. API 路由认证由各 handler 内部用 requireAuth() 自行处理，中间件不拦截
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 2. 根路径访问处理：统一收敛至智能体工作台 /chat
  if (pathname === '/') {
    return NextResponse.redirect(new URL(hasToken ? '/chat' : '/login', origin));
  }

  // 3. 认证页始终放行：Cookie 存在不等于会话有效，登录页由客户端真实引导结果决定去向
  if (AUTH_FLOW_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // 4. 未登录访客访问任何受保护业务页面，302 拦截并重定向到登录页（携带来源路径意图回跳）
  if (!hasToken) {
    const redirectTarget = `${pathname}${search}`;
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('redirect', redirectTarget);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.svg|xingpan.svg).*)',
  ],
};
