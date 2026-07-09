import { describe, it, expect, vi, beforeAll } from 'vitest';
import { withAuth } from './with-auth';

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
  const { signAccessToken } = await import('@/lib/auth/jwt');
  return signAccessToken(userId, role);
}

describe('withAuth', () => {
  it('认证成功时将用户上下文注入 handler', async () => {
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

    const handler = vi.fn(async (user) => {
      return Response.json({ userId: user.id, role: user.role });
    });

    const res = await withAuth(req, handler);
    const data = await res.json();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ userId: 'user-1', role: 'user' });
  });

  it('缺少 Authorization 头时返回 401', async () => {
    const req = new Request('http://localhost/api/test');
    const handler = vi.fn(async () => Response.json({ ok: true }));

    const res = await withAuth(req, handler);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('已禁用用户返回 403', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'disabled-user',
      role: 'user',
      isAnonymous: false,
      status: 'disabled',
      tokens: 0,
    } as any);

    const token = await createTestToken('disabled-user', 'user');
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await withAuth(req, async () => Response.json({ ok: true }));

    expect(res.status).toBe(403);
  });
});
