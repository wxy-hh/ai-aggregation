import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { embed, embedMany } from 'ai';
import {
  createEmbeddingModel,
  _clearEmbeddingModelCacheForTest,
} from '../embedding';

describe('createEmbeddingModel 工厂测试', () => {
  const originalEnv = process.env;
  let capturedRequests: Array<{ url: string; body: Record<string, unknown> }>;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ARK_API_KEY: 'test-ark-key-12345',
      ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3',
    };
    _clearEmbeddingModelCacheForTest();
    capturedRequests = [];

    // Mock 全局 fetch 拦截 /embeddings 请求
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as { url: string }).url;
        let body: Record<string, unknown> = {};
        if (typeof init?.body === 'string') {
          try {
            body = JSON.parse(init.body);
          } catch {
            // 忽略
          }
        }
        capturedRequests.push({ url, body });

        const mockVector = new Array(1024).fill(0.0123);
        const inputs = Array.isArray(body.input) ? body.input : [body.input];
        const data = inputs.map((_, index) => ({
          index,
          object: 'embedding',
          embedding: mockVector,
        }));

        return new Response(
          JSON.stringify({
            object: 'list',
            data,
            model: body.model || 'doubao-embedding-large',
            usage: { prompt_tokens: 10, total_tokens: 10 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    _clearEmbeddingModelCacheForTest();
    vi.restoreAllMocks();
  });

  it('缺失 ARK_API_KEY 时应抛出明确的中文错误信息', () => {
    delete process.env.ARK_API_KEY;
    expect(() => createEmbeddingModel('doubao')).toThrowError(/缺少提供商 doubao 的 API 密钥/);
  });

  it('不支持未知提供商标识符时应抛出错误', () => {
    // @ts-expect-error 故意传入非法 provider
    expect(() => createEmbeddingModel('unknown')).toThrowError(/未知的 Embedding 提供商/);
  });

  it('成功创建 EmbeddingModel 实例，且单例缓存生效', () => {
    const model1 = createEmbeddingModel('doubao');
    const model2 = createEmbeddingModel('doubao');
    expect(model1).toBe(model2);

    const modelCustom = createEmbeddingModel('doubao', 'doubao-embedding-large-custom');
    expect(modelCustom).not.toBe(model1);
  });

  it('清空缓存函数 _clearEmbeddingModelCacheForTest 能有效重置单例', () => {
    const model1 = createEmbeddingModel('doubao');
    _clearEmbeddingModelCacheForTest();
    const model2 = createEmbeddingModel('doubao');
    expect(model1).not.toBe(model2);
  });

  it('通过 AI SDK embed 调用能成功发送请求并获得 1024 维向量', async () => {
    const model = createEmbeddingModel('doubao');
    const result = await embed({
      model,
      value: '测试单条文本嵌入',
    });

    expect(capturedRequests.length).toBe(1);
    expect(capturedRequests[0].url).toContain('/embeddings');
    expect(capturedRequests[0].body.model).toBe('doubao-embedding-large');
    expect(capturedRequests[0].body.input).toEqual(['测试单条文本嵌入']);

    expect(result.embedding.length).toBe(1024);
  });

  it('通过 AI SDK embedMany 调用支持批量向量化', async () => {
    const model = createEmbeddingModel('doubao');
    const values = ['第一条切片内容', '第二条切片内容', '第三条切片内容'];
    const result = await embedMany({
      model,
      values,
    });

    expect(capturedRequests.length).toBe(1);
    expect(capturedRequests[0].body.input).toEqual(values);
    expect(result.embeddings.length).toBe(3);
    expect(result.embeddings[0].length).toBe(1024);
  });
});
