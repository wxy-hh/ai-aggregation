import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { getProfileUsageSummary, requireAuth } = vi.hoisted(() => ({
  getProfileUsageSummary: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('@repo/db', () => ({
  getProfileUsageSummary,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth,
}));

describe('GET /api/profile/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回个人中心资源消耗汇总', async () => {
    requireAuth.mockResolvedValue('user-123');
    getProfileUsageSummary.mockResolvedValue({
      period: 'all',
      totalTokens: 666,
      totalTaskCount: 8,
      features: [
        {
          feature: 'chat',
          label: '智能对话',
          totalTokens: 666,
          taskCount: 3,
          percent: 100,
          hasTokenData: true,
          sourceKind: 'tokens',
        },
      ],
    });

    const response = await GET(new Request('http://localhost/api/profile/usage'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getProfileUsageSummary).toHaveBeenCalledWith('user-123');
    expect(payload.totalTokens).toBe(666);
  });

  it('未登录时返回 401', async () => {
    requireAuth.mockRejectedValue(new Error('缺少认证令牌'));

    const response = await GET(new Request('http://localhost/api/profile/usage'));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('请先登录');
  });
});
