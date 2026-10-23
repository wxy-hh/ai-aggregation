import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    mockDeleteMemoryChunksByUser: vi.fn().mockResolvedValue(3),
    mockUserUpdate: vi.fn(),
    mockUserFindUnique: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: mocks.mockUserFindUnique,
      update: mocks.mockUserUpdate,
    },
  },
  deleteMemoryChunksByUser: mocks.mockDeleteMemoryChunksByUser,
}));

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: async (req: NextRequest, handler: (user: any) => Promise<any>) => {
    return handler({ id: 'test-user-id', username: 'test_user' });
  },
}));

import { PATCH } from './route';

describe('PATCH /api/profile/update (会话记忆开关与隐私闭环 / QA-005 / QA-006)', () => {
  it('开启记忆检索：正常更新 User.memorySearchEnabled 为 true', async () => {
    mocks.mockUserUpdate.mockResolvedValue({
      id: 'test-user-id',
      username: 'test_user',
      email: 'test@example.com',
      name: '测试用户',
      avatar: null,
      memorySearchEnabled: true,
    });

    const req = new NextRequest('http://localhost:3000/api/profile/update', {
      method: 'PATCH',
      body: JSON.stringify({ memorySearchEnabled: true }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.user.memorySearchEnabled).toBe(true);
    expect(mocks.mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-user-id' },
        data: expect.objectContaining({ memorySearchEnabled: true }),
      })
    );
    // 开启时不触发清空
    expect(mocks.mockDeleteMemoryChunksByUser).not.toHaveBeenCalled();
  });

  it('关闭记忆检索：立即物理级联删除当前用户的全部存量记忆切片 (QA-006 授权撤回闭环)', async () => {
    mocks.mockUserUpdate.mockResolvedValue({
      id: 'test-user-id',
      username: 'test_user',
      email: 'test@example.com',
      name: '测试用户',
      avatar: null,
      memorySearchEnabled: false,
    });

    const req = new NextRequest('http://localhost:3000/api/profile/update', {
      method: 'PATCH',
      body: JSON.stringify({ memorySearchEnabled: false }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.user.memorySearchEnabled).toBe(false);

    // 关键断言：严格调用 deleteMemoryChunksByUser 清除该用户数据
    expect(mocks.mockDeleteMemoryChunksByUser).toHaveBeenCalledWith('test-user-id');
  });

  it('参数非法时返回 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile/update', {
      method: 'PATCH',
      body: JSON.stringify({ memorySearchEnabled: 'invalid_boolean' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});
