import { NextRequest, NextResponse } from 'next/server';
import {
  ALLOWED_DOMAINS_ENV_KEY,
  evaluateContentType,
  resolveAllowedDomains,
  resolveProxyTarget,
} from './media-proxy-policy';

/** 上游请求超时（毫秒），避免慢响应长期占用代理连接 */
const UPSTREAM_TIMEOUT_MS = 15_000;

/** 白名单资源的缓存时长（秒） */
const CACHE_TTL_SECONDS = 86_400;

/** 统一的错误响应：错误结果一律禁用缓存 */
function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * 代理第三方生成结果（图片 / 视频）。
 *
 * 接口保持免登录（公开资源场景），安全约束全部来自 media-proxy-policy：
 * 白名单域名 + 仅 https + 拦截内网地址 + 响应类型白名单。
 */
export async function proxyMedia(request: NextRequest, defaultMimeType: string, label: string) {
  const rawUrl = request.nextUrl.searchParams.get('url');
  const decision = resolveProxyTarget(
    rawUrl,
    resolveAllowedDomains(process.env[ALLOWED_DOMAINS_ENV_KEY])
  );

  if (!decision.allowed) {
    return errorResponse(decision.message, decision.status);
  }

  try {
    const response = await fetch(decision.url, {
      // 不跟随跳转：上游若用 302 指向内网地址，跟随即等于绕过白名单
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      return errorResponse(`代理${label}失败：上游返回重定向，已拒绝`, 502);
    }

    if (!response.ok) {
      return errorResponse(`代理${label}失败：上游返回 ${response.status}`, response.status);
    }

    const contentType = evaluateContentType(response.headers.get('Content-Type'), defaultMimeType);
    if (!contentType.allowed) {
      // 不读取上游响应体，避免把 HTML / 脚本内容转发到本站域名下
      return errorResponse(contentType.message ?? '上游返回的资源类型不允许代理', 415);
    }

    const blob = await response.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType.resolved,
        // 仅在白名单命中且响应类型合法时保留缓存头
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return errorResponse(`代理${label}失败，请稍后重试`, 502);
  }
}
