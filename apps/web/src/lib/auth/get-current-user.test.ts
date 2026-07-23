import { describe, it, expect, vi, beforeAll } from 'vitest';
import { getCurrentUser } from './get-current-user';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-jwt-tests-minimum-32-chars!!';
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const { prisma } = await import('@repo/db');

async function createTestToken(userId: string, role: string): Promise<string> {
  const { signAccessToken } = await import('./jwt');
  return signAccessToken(userId, role);
}

describe('getCurrentUser', () => {
  it('返回包含默认字段的用户上下文', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ status: 'active' } as any)
      .mockResolvedValueOnce({
        id: 'user-1',
        role: 'user',
        isAnonymous: false,
        status: 'active',
        tokens: 100,
      } as any);

    const token = await createTestToken('user-1', 'user');
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await getCurrentUser(req);

    expect(user).toEqual({
      id: 'user-1',
      role: 'user',
      isAnonymous: false,
      status: 'active',
      tokens: 100,
    });
  });

  it('匿名用户上下文包含 isAnonymous: true', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ status: 'active' } as any)
      .mockResolvedValueOnce({
        id: 'anon-1',
        role: 'user',
        isAnonymous: true,
        status: 'active',
        tokens: 0,
      } as any);

    const token = await createTestToken('anon-1', 'user');
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await getCurrentUser(req);
    expect(user.isAnonymous).toBe(true);
  });

  it('用户不存在时抛出 AuthError', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const token = await createTestToken('user-missing', 'user');
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    await expect(getCurrentUser(req)).rejects.toThrow('用户不存在');
  });
});
