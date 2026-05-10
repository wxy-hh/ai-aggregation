/** 客户端认证 API 封装 */

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  emailVerified: string | null;
  createdAt?: string;
}

interface AuthResponse {
  success: boolean;
  data?: {
    user?: User;
    accessToken?: string;
  };
  error?: string;
  errorCode?: string;
  message?: string;
}

async function request<T = AuthResponse>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error((data as AuthResponse).error || `请求失败: ${res.status}`);
  }

  return data;
}

/** 请求中自动附带 Access Token */
function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const authApi = {
  async login(email: string, password: string) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(email: string, password: string, name?: string) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  },

  async logout() {
    return request('/api/auth/logout', { method: 'POST' });
  },

  async getMe(accessToken: string) {
    return request('/api/auth/me', {
      headers: authHeaders(accessToken),
    });
  },

  async refresh() {
    return request<{ accessToken?: string }>('/api/auth/refresh', {
      method: 'POST',
    });
  },

  async forgotPassword(email: string) {
    return request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string) {
    return request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },
};
