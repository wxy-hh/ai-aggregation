/** 客户端认证 API 封装 */

interface User {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  role: string;
  tokens?: number;
  isAnonymous?: boolean;
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

export interface RegisterPayload {
  username: string;
  password: string;
  name?: string;
  /** 选填邮箱；填写时必须同时带 emailCode */
  email?: string;
  /** 邮箱验证码（6 位数字） */
  emailCode?: string;
}

export const authApi = {
  async login(username: string, password: string) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async register(payload: RegisterPayload) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
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

  /** 发送邮箱验证码（注册验证 / 绑定邮箱两处复用；忘记密码走重置链接） */
  async sendEmailCode(purpose: 'register' | 'bind', email: string) {
    return request('/api/auth/email/send-code', {
      method: 'POST',
      body: JSON.stringify({ purpose, email }),
    });
  },

  /** 忘记密码：传用户名或邮箱均可 */
  async forgotPassword(account: string) {
    return request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ account }),
    });
  },

  async anonymous(deviceId: string) {
    return request('/api/auth/anonymous', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });
  },

  async resetPassword(token: string, newPassword: string) {
    return request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },
};
