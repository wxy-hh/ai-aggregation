/** 管理端 API 客户端封装 */

import { useAuthStore } from '@/stores/auth-store';

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

function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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

    const res = await fetch(`/api/admin/users?${searchParams.toString()}`, {
      headers: authHeaders(),
    });
    return handleResponse<UsersListResponse>(res);
  },

  async createUser(data: { username: string; password: string; name?: string }) {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<UserResponse>(res);
  },

  async updateUser(id: string, data: { name?: string; role?: string; status?: string; tokens?: number }) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<UserResponse>(res);
  },

  async deleteUser(id: string) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse<{ success: boolean; message?: string }>(res);
  },
};
