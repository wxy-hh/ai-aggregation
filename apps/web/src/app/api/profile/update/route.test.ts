import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    mockUserUpdate: vi.fn(),
    mockUserFindUnique: vi.fn(),
    mockTransaction: vi.fn(),
    mockTxQueryRaw: vi.fn(),
    mockTxUserUpdate: vi.fn(),
    mockTxChunkDeleteMany: vi.fn(),
    mockTxSessionDeleteMany: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: mocks.mockUserFindUnique,
      update: mocks.mockUserUpdate,
    },
    $transaction: mocks.mockTransaction,
  },
  deleteMemoryChunksByUser: vi.fn(),
}));

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: async (req: NextRequest, handler: (user: any) => Promise<any>) => {
    return handler({ id: 'test-user-id', username: 'test_user' });
  },
}));

import { PATCH } from './route';

describe('PATCH /api/profile/update (会话记忆开关与隐私闭环 / QA-005 / QA-006 / ADR-0058)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockTransaction.mockImplementation(async (callback: any) =>
      callback({
        $queryRaw: mocks.mockTxQueryRaw,
        user: { update: mocks.mockTxUserUpdate },
        conversationMemoryChunk: { deleteMany: mocks.mockTxChunkDeleteMany },
        chatSession: { deleteMany: mocks.mockTxSessionDeleteMany },
      })
    );
  });

  it('开启记忆检索：只更新 User.memorySearchEnabled，不删除任何数据', async () => {
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
    expect(mocks.mockTransaction).not.toHaveBeenCalled();
    expect(mocks.mockTxSessionDeleteMany).not.toHaveBeenCalled();
  });

  it('关闭记忆检索：同一事务内锁定用户行、更新开关并删除会话与切片', async () => {
    mocks.mockTxUserUpdate.mockResolvedValue({
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

    expect(mocks.mockTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.mockTxQueryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.mockTxUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-user-id' },
        data: expect.objectContaining({ memorySearchEnabled: false }),
      })
    );
    expect(mocks.mockTxChunkDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'test-user-id' },
    });
    expect(mocks.mockTxSessionDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'test-user-id' },
    });
  });

  it('关闭记忆检索时事务失败则返回 500，不返回成功', async () => {
    mocks.mockTransaction.mockRejectedValue(new Error('db down'));

    const req = new NextRequest('http://localhost:3000/api/profile/update', {
      method: 'PATCH',
      body: JSON.stringify({ memorySearchEnabled: false }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(500);
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
