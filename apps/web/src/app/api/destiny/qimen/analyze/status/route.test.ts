import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore = {
  getAllStatuses: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('@repo/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared')>();
  return {
    ...actual,
    QimenAnalysisStore: class {
      constructor() {
        return mockStore;
      }
    },
  };
});

describe('GET /api/destiny/qimen/analyze/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.disconnect.mockResolvedValue(undefined);
  });

  it('返回分块状态快照', async () => {
    const { GET } = await import('./route');
    mockStore.getAllStatuses.mockResolvedValue({
      baseResult: 'completed',
      strategyOverview: 'pending',
      timingWindows: 'completed',
      chartSummary: 'failed',
    });

    const response = await GET(
      new Request('http://localhost/api/destiny/qimen/analyze/status?analysisId=analysis-123')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      analysisId: 'analysis-123',
      statuses: {
        baseResult: 'completed',
        strategyOverview: 'pending',
        timingWindows: 'completed',
        chartSummary: 'failed',
      },
    });
  });
});
