import { authFetch } from './client';
import type { ProfileUsageSummary } from '@repo/shared';

export async function fetchProfileUsageSummary(): Promise<ProfileUsageSummary> {
  const response = await authFetch('/api/profile/usage');

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: '获取资源消耗失败' }));
    throw new Error(payload.error || '获取资源消耗失败');
  }

  return response.json();
}

export interface ProfileUser {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

export async function updateProfile(data: {
  username?: string;
  name?: string;
  avatar?: string;
}): Promise<{ user: ProfileUser }> {
  const response = await authFetch('/api/profile/update', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: '更新个人资料失败' }));
    throw new Error(payload.error || '更新个人资料失败');
  }

  const result = await response.json();
  return result.data;
}

export async function uploadAvatar(file: File): Promise<ProfileUser> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await authFetch('/api/profile/avatar', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: '头像上传失败' }));
    throw new Error(payload.error || '头像上传失败');
  }

  const result = await response.json();
  return result.data.user;
}

export async function deleteAccount(password?: string): Promise<void> {
  const response = await authFetch('/api/profile/delete', {
    method: 'DELETE',
    body: JSON.stringify(password ? { password } : {}),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: '账户注销失败' }));
    throw new Error(payload.error || '账户注销失败');
  }
}
