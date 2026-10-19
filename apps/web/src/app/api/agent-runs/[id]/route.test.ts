import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'u_test_1', username: 'testuser' },
    agentRunFindUnique: vi.fn(),
    agentRunDelete: vi.fn(),
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
      findUnique: mocks.agentRunFindUnique,
      delete: mocks.agentRunDelete,
    },
  },
}));

import { DELETE } from './route';

describe('DELETE /api/agent-runs/[id] (ADR-0019)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'u_test_1', username: 'testuser' };
  });

  it('未登录用户访问返回 401', async () => {
    mocks.currentUser = null as any;

    const req = new NextRequest('http://localhost:3030/api/agent-runs/run_1', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'run_1' }) });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('未授权');
  });

  it('记录不存在时返回 404', async () => {
    mocks.agentRunFindUnique.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost:3030/api/agent-runs/non_existent', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'non_existent' }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('不存在');
  });

  it('尝试删除他人记录返回 404 越权保护', async () => {
    mocks.agentRunFindUnique.mockResolvedValueOnce({
      id: 'run_other',
      userId: 'u_other_user',
    });

    const req = new NextRequest('http://localhost:3030/api/agent-runs/run_other', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'run_other' }) });

    expect(res.status).toBe(404);
    expect(mocks.agentRunDelete).not.toHaveBeenCalled();
  });

  it('合法用户正常删除本人记录', async () => {
    mocks.agentRunFindUnique.mockResolvedValueOnce({
      id: 'run_1',
      userId: 'u_test_1',
    });
    mocks.agentRunDelete.mockResolvedValueOnce({ id: 'run_1' });

    const req = new NextRequest('http://localhost:3030/api/agent-runs/run_1', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'run_1' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('run_1');
    expect(mocks.agentRunDelete).toHaveBeenCalledWith({
      where: { id: 'run_1' },
    });
  });
});
