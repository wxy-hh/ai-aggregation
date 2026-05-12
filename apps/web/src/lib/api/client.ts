import { useAuthStore } from '@/stores/auth-store';

/** 从 Zustand store 读取当前 Access Token（非 React 环境可用） */
export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

/**
 * 构建带 Authorization 的请求头。
 * - contentType 不传时默认 application/json
 * - contentType 传 null 时不设 Content-Type（用于 FormData 上传）
 */
export function authHeaders(init?: HeadersInit, contentType?: string | null): HeadersInit {
  const token = getAccessToken();
  const headers: Record<string, string> = {};

  if (init) {
    for (const [k, v] of Object.entries(init)) {
      headers[k] = v as string;
    }
  }

  const ct = contentType === undefined ? 'application/json' : contentType;
  if (ct && !headers['Content-Type']) {
    headers['Content-Type'] = ct;
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

// 防止并发刷新：多个 401 请求共享同一个刷新 Promise
let refreshPromise: Promise<string | null> | null = null;

function getRefreshPromise(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = useAuthStore.getState().refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** 构建请求头，自动附加 Bearer token，FormData 时不设 Content-Type */
function buildRequestHeaders(explicitHeaders?: HeadersInit): Headers {
  const headers = new Headers(explicitHeaders ?? {});

  // 如果外部已传 Authorization 则保留，否则用 store 中的 token
  if (!headers.has('Authorization')) {
    const token = getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return headers;
}

/**
 * 带 Authorization 的 fetch 封装，401 自动刷新 token 并重试一次。
 * - 自动从 auth-store 读取 Access Token
 * - FormData body 时不设 Content-Type（由浏览器自动设置 multipart boundary）
 * - 非 FormData 且未显式设 Content-Type 时默认 application/json
 */
export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = buildRequestHeaders(options?.headers);
  const isFormData = options?.body instanceof FormData;

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status !== 401) {
    return response;
  }

  // 401：尝试刷新 token
  const newToken = await getRefreshPromise();

  if (!newToken) {
    // 刷新失败，清除登录状态，跳转登录页
    useAuthStore.getState().logout();
    return response;
  }

  // 用新 token 重试，复用之前构建的 headers（含 Content-Type 决策）
  headers.set('Authorization', `Bearer ${newToken}`);

  return fetch(url, {
    ...options,
    headers,
  });
}
