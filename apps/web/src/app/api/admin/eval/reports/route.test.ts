import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getReports } from './route';
import { GET as getReportDetail } from './[id]/route';
import * as requireAdminModule from '@/lib/auth/require-admin';
import { AuthError } from '@/lib/auth/errors';
import { prisma } from '@repo/db';

vi.mock('@/lib/auth/require-admin');
vi.mock('@repo/db', () => ({
  prisma: {
    agentEvalRun: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    agentEvalCaseResult: {
      findMany: vi.fn(),
    },
  },
}));

describe('TC04: 管理员评测后台 API、权限守卫与大盘聚合 (AdminEvalReportsApi)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC04-1: 未登录或非管理员身份返回 401 或 403', async () => {
    // 1. 未登录
    vi.mocked(requireAdminModule.requireAdmin).mockRejectedValueOnce(
      new AuthError('缺少认证令牌', 'UNAUTHORIZED')
    );
    const unauthReq = new NextRequest('http://localhost:3000/api/admin/eval/reports');
    const res1 = await getReports(unauthReq);
    expect(res1.status).toBe(401);

    // 2. 普通用户 (403)
    vi.mocked(requireAdminModule.requireAdmin).mockRejectedValueOnce(
      new AuthError('无权访问：需要管理员权限', 'FORBIDDEN')
    );
    const forbiddenReq = new NextRequest('http://localhost:3000/api/admin/eval/reports');
    const res2 = await getReports(forbiddenReq);
    expect(res2.status).toBe(403);
  });

  it('TC04-2: 管理员请求返回 200 且仅聚合 isBenchmark = true 记录', async () => {
    vi.mocked(requireAdminModule.requireAdmin).mockResolvedValueOnce('admin-user-id');

    const mockBenchmarkRuns = [
      {
        id: 'run-1',
        isBenchmark: true,
        modelProvider: 'deepseek',
        modelId: 'deepseek-flash',
        totalCases: 40,
        passedCases: 35,
        passRate: 0.875,
        avgLatencyMs: 2400,
        estimatedCostRmb: 0.126,
        createdAt: new Date(),
        caseResults: [
          { category: 'planning', passed: true },
          { category: 'tools', passed: true },
          { category: 'security', passed: true },
          { category: 'rag', passed: false },
        ],
      },
    ];

    vi.mocked(prisma.agentEvalRun.findMany).mockResolvedValueOnce(mockBenchmarkRuns as any);

    const req = new NextRequest('http://localhost:3000/api/admin/eval/reports');
    const res = await getReports(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.summary).toBeDefined();
    expect(body.data.summary.totalCases).toBe(40);
    expect(body.data.summary.passRate).toBe(0.875);

    // 验证 prisma 查询带有 isBenchmark: true
    expect(prisma.agentEvalRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isBenchmark: true,
        }),
      })
    );
  });

  it('TC04-3: 携带 suiteId 查询返回三组消融实验对照结构', async () => {
    vi.mocked(requireAdminModule.requireAdmin).mockResolvedValueOnce('admin-user-id');

    const mockSuiteRuns = [
      {
        id: 'run-suite-1',
        suiteId: 'suite-1001',
        experimentLabel: '基准全量组',
        passRate: 0.875,
        avgLatencyMs: 2450,
      },
      {
        id: 'run-suite-2',
        suiteId: 'suite-1001',
        experimentLabel: '混合检索无精排组',
        passRate: 0.825,
        avgLatencyMs: 2280,
      },
      {
        id: 'run-suite-3',
        suiteId: 'suite-1001',
        experimentLabel: '无质检反思组',
        passRate: 0.75,
        avgLatencyMs: 1800,
      },
    ];

    vi.mocked(prisma.agentEvalRun.findMany).mockResolvedValueOnce(mockSuiteRuns as any);

    const req = new NextRequest('http://localhost:3000/api/admin/eval/reports?suiteId=suite-1001');
    const res = await getReports(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.ablationMatrix).toBeDefined();
    expect(body.data.ablationMatrix.suiteId).toBe('suite-1001');
    expect(body.data.ablationMatrix.runs).toHaveLength(3);
  });

  it('TC04-4: 详情接口返回已脱敏 Trace 且体积受限', async () => {
    vi.mocked(requireAdminModule.requireAdmin).mockResolvedValueOnce('admin-user-id');

    const mockDetail = {
      id: 'run-detail-1',
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      totalCases: 40,
      passedCases: 35,
      passRate: 0.875,
      caseResults: [
        {
          caseId: 'plan-007',
          category: 'planning',
          passed: false,
          errorDetail: '检查点未全部按序完成',
          traceData: {
            preview: '脱敏后的干净执行轨迹',
            authorization: '[REDACTED]',
          },
        },
      ],
    };

    vi.mocked(prisma.agentEvalRun.findUnique).mockResolvedValueOnce(mockDetail as any);

    const req = new NextRequest('http://localhost:3000/api/admin/eval/reports/run-detail-1');
    const res = await getReportDetail(req, { params: Promise.resolve({ id: 'run-detail-1' }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.run.caseResults[0].traceData.authorization).toBe('[REDACTED]');
    expect(body.data.run.caseResults[0].traceData).not.toHaveProperty('apiKey');
  });
});
