import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'u_test_1', username: 'testuser' },
    agentRunCount: vi.fn(),
    agentRunFindMany: vi.fn(),
  };
});

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(async () => {
    if (!mocks.currentUser) {
      const { AuthError } = await import('@/lib/auth/errors');
      throw new AuthError('未授权访问', 'UNAUTHORIZED');
    }
    return mocks.currentUser;
  }),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    agentRun: {
      count: mocks.agentRunCount,
      findMany: mocks.agentRunFindMany,
    },
  },
}));

import { GET } from './route';

describe('GET /api/agent-runs (ADR-0015 / 工单 02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'u_test_1', username: 'testuser' };
  });

  it('未登录用户访问返回 401', async () => {
    mocks.currentUser = null as any;

    const req = new NextRequest('http://localhost:3030/api/agent-runs');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('未授权');
  });

  it('已登录用户正常分页查询返回 runs 与 total', async () => {
    mocks.agentRunCount.mockResolvedValueOnce(2);
    mocks.agentRunFindMany.mockResolvedValueOnce([
      {
        id: 'run_1',
        userId: 'u_test_1',
        goalText: '调研大模型',
        steps: 3,
        outcome: 'success',
        quotaCost: 1500,
        durationMs: 4200,
        createdAt: new Date(),
      },
    ]);

    const req = new NextRequest('http://localhost:3030/api/agent-runs?page=1&limit=10');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(2);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(10);
    expect(body.data.runs.length).toBe(1);
    expect(body.data.runs[0].goalText).toBe('调研大模型');
  });

  it('支持 outcome 状态过滤', async () => {
    mocks.agentRunCount.mockResolvedValueOnce(0);
    mocks.agentRunFindMany.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost:3030/api/agent-runs?outcome=failed');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mocks.agentRunCount).toHaveBeenCalledWith({
      where: {
        userId: 'u_test_1',
        outcome: 'failed',
      },
    });
  });
});
