import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  mockDeleteMany: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    chatSession: {
      deleteMany: mocks.mockDeleteMany,
    },
  },
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: mocks.mockRequireAuth,
}));

import { AuthError } from '@/lib/auth/errors';
import { DELETE } from './route';

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/conversations${query}`, {
    method: 'DELETE',
  });
}

describe('DELETE /api/conversations（ADR-0058 删除传播）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRequireAuth.mockResolvedValue('user-a');
    mocks.mockDeleteMany.mockResolvedValue({ count: 2 });
  });

  it('未登录返回 401', async () => {
    mocks.mockRequireAuth.mockRejectedValue(new AuthError('缺少认证令牌', 'UNAUTHORIZED'));

    const res = await DELETE(request('?ids=conv-1'));
    expect(res.status).toBe(401);
  });

  it('按 userId 过滤删除并返回删除数量', async () => {
    const res = await DELETE(request('?ids=conv-1,conv-2,conv-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ deleted: 2 });
    expect(mocks.mockDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['conv-1', 'conv-2'] },
        userId: 'user-a',
      },
    });
  });

  it('空 ids 返回成功且不查询数据库', async () => {
    const res = await DELETE(request('?ids='));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ deleted: 0 });
    expect(mocks.mockDeleteMany).not.toHaveBeenCalled();
  });

  it('超过 100 个 ids 返回 400 与中文错误', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `conv-${index}`).join(',');
    const res = await DELETE(request(`?ids=${ids}`));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toContain('数量');
  });

  it('重复删除同一 ID 幂等：第二次删除数量为 0', async () => {
    mocks.mockDeleteMany.mockResolvedValueOnce({ count: 1 });
    await DELETE(request('?ids=conv-1'));

    mocks.mockDeleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await DELETE(request('?ids=conv-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 0 });
  });
});
