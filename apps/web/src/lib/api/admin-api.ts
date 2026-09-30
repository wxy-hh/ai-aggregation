/** 管理端 API 客户端封装 */

import { authFetch } from './client';

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  role: string;
  status: string;
  tokens: number;
  createdAt: string;
}

interface UsersListResponse {
  success: boolean;
  data?: {
    users: AdminUser[];
    meta: { total: number; page: number; limit: number; adminCount: number; disabledCount: number };
  };
  error?: string;
}

interface UserResponse {
  success: boolean;
  data?: { user: AdminUser };
  error?: string;
  message?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `请求失败: ${res.status}`);
  }
  return data;
}

export const adminApi = {
  async listUsers(params?: { search?: string; page?: number; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));

    // 统一走 authFetch：401 时自动刷新 token 并重试，裸 fetch 会把管理端挡在会话过期之外
    const res = await authFetch(`/api/admin/users?${searchParams.toString()}`);
    return handleResponse<UsersListResponse>(res);
  },

  async createUser(data: { username: string; password: string; name?: string }) {
    const res = await authFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleResponse<UserResponse>(res);
  },

  async updateUser(id: string, data: { name?: string; role?: string; status?: string; tokens?: number }) {
    const res = await authFetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return handleResponse<UserResponse>(res);
  },

  async deleteUser(id: string) {
    const res = await authFetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean; message?: string }>(res);
  },
};
