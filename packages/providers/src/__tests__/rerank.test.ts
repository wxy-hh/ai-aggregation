import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SiliconFlowRerankProvider,
  type RerankResult,
} from '../rerank';
import type { Logger } from '@repo/logger';

describe('@repo/providers Rerank 二次精排深模块 (rerank.ts) 单元测试', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
  });

  it('1. 正常打分重排：调用硅基流动接口并按分数降序排列 (TC01.1)', async () => {
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
      logger: mockLogger,
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
    expect(mockLogger.info).toHaveBeenCalledWith(
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

  it('2. 空候选短路与空查询保护：无网络调用或全零打分 (TC01.2)', async () => {
    const mockFetch = vi.fn();
    const provider = new SiliconFlowRerankProvider({
      apiKey: 'test-key',
      fetchFn: mockFetch as any,
      logger: mockLogger,
    });

    // documents 为空直接返回空
    const resEmpty = await provider.rerank('查询词', []);
    expect(resEmpty).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();

    // query 为空时返回原顺序分数为 0
    const resEmptyQuery = await provider.rerank('', ['docA', 'docB']);
    expect(resEmptyQuery).toEqual([
      { index: 0, relevanceScore: 0 },
      { index: 1, relevanceScore: 0 },
    ]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('3. 密钥缺失校验：未配置 API Key 时抛出异常 (TC01.3)', async () => {
    const provider = new SiliconFlowRerankProvider({
      apiKey: '',
      fetchFn: vi.fn() as any,
      logger: mockLogger,
    });

    await expect(provider.rerank('查询词', ['doc1'])).rejects.toThrow(
      '未配置 SILICONFLOW_API_KEY，无法调用硅基流动 Rerank 服务'
    );
  });

  it('4. 超时与网络异常防护：处理 AbortError 并中断 (TC01.3)', async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    const provider = new SiliconFlowRerankProvider({
      apiKey: 'test-key',
      fetchFn: mockFetch as any,
      timeoutMs: 1000,
      logger: mockLogger,
    });

    await expect(provider.rerank('查询', ['docA'])).rejects.toThrow(
      '硅基流动 Rerank 请求超时 (1000ms 超时中断)'
    );
  });

  it('5. API 错误处理：非 200 响应抛出错误并记录 warn 日志', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API Key',
    });

    const provider = new SiliconFlowRerankProvider({
      apiKey: 'invalid-key',
      fetchFn: mockFetch as any,
      logger: mockLogger,
    });

    await expect(provider.rerank('查询', ['docA'])).rejects.toThrow(
      '硅基流动 Rerank 接口返回错误 (401): Invalid API Key'
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '硅基流动 Rerank 请求异常',
      expect.objectContaining({
        feature: 'rag-rerank',
        candidateCount: 1,
        error: expect.stringContaining('401'),
      })
    );
  });
});
