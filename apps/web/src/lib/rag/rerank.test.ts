import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SiliconFlowRerankProvider,
  type RerankResult,
} from './rerank';
import { logger } from '@repo/logger';

vi.mock('@repo/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Rerank 二次精排深模块 (rerank.ts) 单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. 正常打分重排：调用硅基流动接口并按分数降序排列', async () => {
    const mockApiResponse = {
      id: 'rerank-test-123',
      results: [
        { index: 1, relevance_score: 0.985 },
        { index: 0, relevance_score: 0.421 },
        { index: 2, relevance_score: 0.103 },
      ],
      usage: {
        total_tokens: 156,
        prompt_tokens: 156,
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    });

    const provider = new SiliconFlowRerankProvider({
      apiKey: 'test-siliconflow-key',
      fetchFn: mockFetch as any,
    });

    const docs = [
      '次要切片内容',
      '核心连败熔断机制说明',
      '无关配置内容',
    ];

    const results = await provider.rerank('连败熔断', docs, 2);

    // 验证网络请求参数
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://api.siliconflow.cn/v1/rerank');
    expect(calledInit.headers.Authorization).toBe('Bearer test-siliconflow-key');
    const sentBody = JSON.parse(calledInit.body);
    expect(sentBody.query).toBe('连败熔断');
    expect(sentBody.documents).toEqual(docs);
    expect(sentBody.top_n).toBe(2);

    // 验证排序：得分最高的 index 1 排在第一位，截取 topN=2
    expect(results.length).toBe(2);
    expect(results[0].index).toBe(1);
    expect(results[0].relevanceScore).toBe(0.985);
    expect(results[1].index).toBe(0);
    expect(results[1].relevanceScore).toBe(0.421);

    // 验证用量观测日志记录 (feature: 'rag-rerank', tokens)
    expect(logger.info).toHaveBeenCalledWith(
      'Rerank 二次精排执行完成',
      expect.objectContaining({
        feature: 'rag-rerank',
        candidateCount: 3,
        topN: 2,
        tokens: 156,
        model: 'BAAI/bge-reranker-v2-m3',
      })
    );
  });

  it('2. 空候选短路：documents 为空时不发起任何网络调用', async () => {
    const mockFetch = vi.fn();
    const provider = new SiliconFlowRerankProvider({
      apiKey: 'test-key',
      fetchFn: mockFetch as any,
    });

    const res = await provider.rerank('查询词', []);
    expect(res).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('3. 密钥缺失校验：未配置 API Key 时抛出异常', async () => {
    const provider = new SiliconFlowRerankProvider({
      apiKey: '',
      fetchFn: vi.fn() as any,
    });

    await expect(
      provider.rerank('查询词', ['候选内容'])
    ).rejects.toThrowError(/未配置 SILICONFLOW_API_KEY/);
  });

  it('4. API 异常处理：429 限流或 500 错误时抛出对应详细错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    const provider = new SiliconFlowRerankProvider({
      apiKey: 'test-key',
      fetchFn: mockFetch as any,
    });

    await expect(
      provider.rerank('查询词', ['内容 1', '内容 2'])
    ).rejects.toThrowError(/硅基流动 Rerank 接口返回错误 \(429\)/);

    expect(logger.warn).toHaveBeenCalledWith(
      '硅基流动 Rerank 请求异常',
      expect.objectContaining({
        feature: 'rag-rerank',
      })
    );
  });

  it('5. 超时中断：网络超时时触发 AbortError 并抛出清晰中文提示', async () => {
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    });

    const provider = new SiliconFlowRerankProvider({
      apiKey: 'test-key',
      timeoutMs: 50, // 50ms 快速超时
      fetchFn: mockFetch as any,
    });

    await expect(
      provider.rerank('查询词', ['切片文本 1'])
    ).rejects.toThrowError(/超时/);
  });
});
