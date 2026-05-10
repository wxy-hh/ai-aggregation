import { useAuthStore } from '@/stores/auth-store';

/** 从 Zustand store 读取当前 Access Token（非 React 环境可用） */
export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

/** 生成带 Authorization 的请求头，默认 Content-Type: application/json */
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

/** 带 Authorization 的 fetch 封装 */
export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: authHeaders(options?.headers),
  });
}
