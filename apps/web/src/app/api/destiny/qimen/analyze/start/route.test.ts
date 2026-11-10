import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  currentUser: { id: 'user_1', role: 'user' },
  initializeAnalysis: vi.fn(),
  saveBaseResult: vi.fn(),
  qimenBaseAdd: vi.fn(),
  qimenSectionAddBulk: vi.fn(),
  computeQimenChart: vi.fn(() => ({ chartMeta: { dun: '阴遁', ju: '一局' } })),
  getBillingRequestId: vi.fn(),
}));

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(async () => {
    if (!mocks.currentUser) {
      const { AuthError } = await import('@/lib/auth/errors');
      throw new AuthError('未授权访问', 'UNAUTHORIZED');
    }
    return mocks.currentUser;
  }),
}));

vi.mock('@/lib/billing/request-id', () => ({
  getBillingRequestId: mocks.getBillingRequestId,
  createBillingRequestId: vi.fn(() => 'generated-id'),
}));

vi.mock('@repo/redis', () => ({
  getRedisClient: () => ({}),
  QimenAnalysisStore: class {
    initializeAnalysis = mocks.initializeAnalysis;
    saveBaseResult = mocks.saveBaseResult;
  },
  WorkerHeartbeatStore: class {
    isHealthy = vi.fn(async () => true);
  },
}));

vi.mock('@repo/queue', () => ({
  qimenBaseQueue: { add: mocks.qimenBaseAdd },
  qimenSectionQueue: { addBulk: mocks.qimenSectionAddBulk },
}));

vi.mock('@repo/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@repo/shared')>();
  return { ...original, computeQimenChart: mocks.computeQimenChart };
});

import { POST } from './route';

describe('POST /api/destiny/qimen/analyze/start (TC08-1: 非管理员入队 Fail-Closed 断言)', () => {
  const validBody = {
    context: {
      datetime: '2026-11-10 12:00',
      location: '北京',
      chartMethod: 'time',
      longitude: 116.4,
    },
    question: {
      category: 'career',
      description: '近期事业发展方向与关键节点如何选择',
      focus: 'short_term',
      outputStyle: 'plain',
      outputLength: 'brief',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', role: 'user' };
    mocks.initializeAnalysis.mockResolvedValue(undefined);
    mocks.saveBaseResult.mockResolvedValue(true);
    mocks.qimenBaseAdd.mockResolvedValue(undefined);
    mocks.qimenSectionAddBulk.mockResolvedValue(undefined);
  });

  it('非管理员入队且幂等键为空时，拒绝入队（addBulk 0 次）并返回错误响应', async () => {
    mocks.getBillingRequestId.mockReturnValue('');

    const request = new NextRequest('http://localhost/api/destiny/qimen/analyze/start', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.success).toBe(false);
    expect(mocks.qimenSectionAddBulk).not.toHaveBeenCalled();
    expect(mocks.qimenBaseAdd).not.toHaveBeenCalled();
    expect(mocks.initializeAnalysis).not.toHaveBeenCalled();
  });

  it('非管理员携带合法幂等键时正常入队三个分块任务，幂等键按分块加后缀', async () => {
    mocks.getBillingRequestId.mockReturnValue('req-abc');

    const request = new NextRequest('http://localhost/api/destiny/qimen/analyze/start', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(mocks.qimenSectionAddBulk).toHaveBeenCalledTimes(1);
    const jobs = mocks.qimenSectionAddBulk.mock.calls[0][0];
    expect(jobs).toHaveLength(3);
    expect(jobs.map((job: { data: { billingRequestId?: string } }) => job.data.billingRequestId)).toEqual([
      'req-abc:strategyOverview',
      'req-abc:timingWindows',
      'req-abc:chartSummary',
    ]);
  });
});
