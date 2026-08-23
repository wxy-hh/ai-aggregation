import { NextRequest } from 'next/server';

/**
 * 从请求中获取正确的 origin，用于构建重定向 URL
 *
 * 优先级：
 * 1. 请求头中的 Origin（浏览器发送的真实来源）
 * 2. 请求头中的 Host（回退方案）
 * 3. 环境变量 NEXT_PUBLIC_APP_URL（最后手段）
 *
 * 问题背景：在 Docker 环境中，req.nextUrl.origin 可能返回 http://0.0.0.0:3000
 * 导致用户被重定向到错误的地址。使用请求头可以确保使用浏览器实际访问的地址。
 */
export function getOriginFromRequest(req: NextRequest): string {
  // 优先使用 Origin 头（浏览器发送的真实来源）
  const origin = req.headers.get('origin');
  if (origin) {
    return origin;
  }

  // 回退到 Host 头
  const host = req.headers.get('host');
  if (host) {
    // Host 头不包含协议，需要添加
    return host.startsWith('http') ? host : `https://${host}`;
  }

  // 最后使用环境变量
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    return appUrl;
  }

  // 默认回退到相对路径（由浏览器处理）
  return '';
}

/**
 * 构建完整的重定向 URL
 * @param req - NextRequest 对象
 * @param path - 重定向路径，如 '/login?logout=1'
 * @returns 完整的 URL 或相对路径
 */
export function buildRedirectUrl(req: NextRequest, path: string): string {
  const origin = getOriginFromRequest(req);

  if (origin) {
    // 有 origin 时构建完整 URL
    return `${origin}${path}`;
  }

  // 没有 origin 时使用相对路径
  return path;
}
