import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore = {
  initializeAnalysis: vi.fn(),
  disconnect: vi.fn(),
};

const mockAddBulk = vi.fn();
const mockBaseQueueAdd = vi.fn();

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

vi.mock('@repo/queue', () => {
  return {
    qimenBaseQueue: {
      add: mockBaseQueueAdd,
    },
    qimenSectionQueue: {
      addBulk: mockAddBulk,
    },
  };
});

describe('POST /api/destiny/qimen/analyze/start', () => {
  const originalRandomUUID = crypto.randomUUID;

  beforeEach(() => {
    vi.clearAllMocks();
    crypto.randomUUID = vi.fn(() => 'analysis-123') as typeof crypto.randomUUID;
    mockStore.initializeAnalysis.mockResolvedValue(undefined);
    mockStore.disconnect.mockResolvedValue(undefined);
    mockBaseQueueAdd.mockResolvedValue(undefined);
    mockAddBulk.mockResolvedValue(undefined);
  });

  afterEach(() => {
    crypto.randomUUID = originalRandomUUID;
  });

  it('返回 analysisId，并为基础盘与三个分块创建任务', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/destiny/qimen/analyze/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            datetime: '2026-04-16 09:30',
            location: '上海',
            chartMethod: 'time',
          },
          question: {
            category: 'career',
            description: '我想判断近期是否适合换工作，以及该怎么安排节奏。',
            focus: 'risk_control',
            outputStyle: 'plain',
            outputLength: 'brief',
          },
        }),
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      analysisId: string;
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.analysisId).toBe('analysis-123');
    expect(mockStore.initializeAnalysis).toHaveBeenCalledWith('analysis-123');
    expect(mockBaseQueueAdd).toHaveBeenCalledWith(
      'analysis-123',
      expect.objectContaining({
        analysisId: 'analysis-123',
        input: expect.objectContaining({
          context: expect.objectContaining({ location: '上海' }),
        }),
      }),
      expect.objectContaining({
        jobId: 'analysis-123-baseResult',
      })
    );
    expect(mockAddBulk).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'strategyOverview', jobId: 'analysis-123-strategyOverview' }),
      expect.objectContaining({ name: 'timingWindows', jobId: 'analysis-123-timingWindows' }),
      expect.objectContaining({ name: 'chartSummary', jobId: 'analysis-123-chartSummary' }),
    ]);
  });

  it('当入队失败时返回 500', async () => {
    const { POST } = await import('./route');

    mockBaseQueueAdd.mockRejectedValue(new Error('queue unavailable'));

    const response = await POST(
      new Request('http://localhost/api/destiny/qimen/analyze/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            datetime: '2026-04-16 09:30',
            location: '上海',
            chartMethod: 'time',
          },
          question: {
            category: 'career',
            description: '我想判断近期是否适合换工作，以及该怎么安排节奏。',
            focus: 'risk_control',
            outputStyle: 'plain',
            outputLength: 'brief',
          },
        }),
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      error: string;
    };

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('queue unavailable');
    expect(mockStore.disconnect).toHaveBeenCalled();
  });
});
