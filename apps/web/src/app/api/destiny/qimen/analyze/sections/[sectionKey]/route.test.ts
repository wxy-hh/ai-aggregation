import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore = {
  getBaseResult: vi.fn(),
  getSectionStatus: vi.fn(),
  getSectionError: vi.fn(),
  getSectionResult: vi.fn(),
  waitForSection: vi.fn(),
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

describe('GET /api/destiny/qimen/analyze/sections/[sectionKey]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.disconnect.mockResolvedValue(undefined);
  });

  it('命中基础盘面缓存时立即返回 200', async () => {
    const { GET } = await import('./route');
    mockStore.getBaseResult.mockResolvedValue({
      chartTitle: '奇门遁甲排盘',
      chartMeta: {
        dun: '阳遁',
        ju: '三局',
        jiaziXunkong: '甲辰旬 寅卯空',
        horsePosition: '马星在巳',
        valueSymbol: '天冲星',
        valueDoor: '伤门',
      },
      board: [],
      score: 78,
      disclaimer: '仅供参考',
    });

    const response = await GET(
      new Request('http://localhost/api/destiny/qimen/analyze/sections/baseResult?analysisId=analysis-123'),
      { params: Promise.resolve({ sectionKey: 'baseResult' }) }
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      analysisId: 'analysis-123',
      sectionKey: 'baseResult',
      status: 'completed',
      data: expect.objectContaining({ chartTitle: '奇门遁甲排盘' }),
    });
  });

  it('基础盘面仍在生成时返回 202', async () => {
    const { GET } = await import('./route');
    mockStore.getBaseResult.mockResolvedValue(null);
    mockStore.getSectionStatus.mockResolvedValue('pending');

    const response = await GET(
      new Request('http://localhost/api/destiny/qimen/analyze/sections/baseResult?analysisId=analysis-123'),
      { params: Promise.resolve({ sectionKey: 'baseResult' }) }
    );

    const json = await response.json();
    expect(response.status).toBe(202);
    expect(json).toEqual({
      success: false,
      analysisId: 'analysis-123',
      sectionKey: 'baseResult',
      status: 'pending',
    });
  });

  it('基础盘面生成失败时返回 failed 状态与错误信息', async () => {
    const { GET } = await import('./route');
    mockStore.getBaseResult.mockResolvedValue(null);
    mockStore.getSectionStatus.mockResolvedValue('failed');
    mockStore.getSectionError.mockResolvedValue('基础盘生成超时');

    const response = await GET(
      new Request('http://localhost/api/destiny/qimen/analyze/sections/baseResult?analysisId=analysis-123'),
      { params: Promise.resolve({ sectionKey: 'baseResult' }) }
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: false,
      analysisId: 'analysis-123',
      sectionKey: 'baseResult',
      status: 'failed',
      error: '基础盘生成超时',
    });
  });

  it('40 秒内未完成时返回 202，且不带半成品数据', async () => {
    const { GET } = await import('./route');
    mockStore.getSectionResult.mockResolvedValue(null);
    mockStore.waitForSection.mockResolvedValue({ status: 'pending' });

    const response = await GET(
      new Request(
        'http://localhost/api/destiny/qimen/analyze/sections/strategyOverview?analysisId=analysis-123'
      ),
      { params: Promise.resolve({ sectionKey: 'strategyOverview' }) }
    );

    const json = await response.json();
    expect(response.status).toBe(202);
    expect(json).toEqual({
      success: false,
      analysisId: 'analysis-123',
      sectionKey: 'strategyOverview',
      status: 'pending',
    });
  });

  it('分块失败时返回 failed 状态与错误信息', async () => {
    const { GET } = await import('./route');
    mockStore.getSectionResult.mockResolvedValue(null);
    mockStore.waitForSection.mockResolvedValue({
      status: 'failed',
      error: '模型超时',
    });

    const response = await GET(
      new Request(
        'http://localhost/api/destiny/qimen/analyze/sections/chartSummary?analysisId=analysis-123'
      ),
      { params: Promise.resolve({ sectionKey: 'chartSummary' }) }
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: false,
      analysisId: 'analysis-123',
      sectionKey: 'chartSummary',
      status: 'failed',
      error: '模型超时',
    });
  });
});
