import { describe, it, expect, vi, beforeAll } from 'vitest';
import { requireAuth } from './require-auth';

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

describe('requireAuth', () => {
  it('拒绝缺少 Authorization 头的请求', async () => {
    const req = new Request('http://localhost/api/test');
    await expect(requireAuth(req)).rejects.toThrow('缺少认证令牌');
  });

  it('拒绝非 Bearer 格式的 Authorization 头', async () => {
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: 'NotBearer token123' },
    });
    await expect(requireAuth(req)).rejects.toThrow('缺少认证令牌');
  });

  it('拒绝无效的 token', async () => {
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    await expect(requireAuth(req)).rejects.toThrow('登录已过期');
  });

  it('拒绝不存在的用户', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const token = await createTestToken('user-999', 'user');

    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(requireAuth(req)).rejects.toThrow('用户不存在');
  });

  it('拒绝已禁用的用户', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ status: 'disabled' } as any);

    const token = await createTestToken('disabled-user', 'user');

    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(requireAuth(req)).rejects.toThrow('账号已被停用');
  });

  it('接受有效的请求并返回 userId', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ status: 'active' } as any);

    const token = await createTestToken('valid-user', 'admin');

    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const userId = await requireAuth(req);
    expect(userId).toBe('valid-user');
  });
});

/** 辅助函数：生成测试用 JWT token */
async function createTestToken(userId: string, role: string): Promise<string> {
  const { signAccessToken } = await import('./jwt');
  return signAccessToken(userId, role);
}
