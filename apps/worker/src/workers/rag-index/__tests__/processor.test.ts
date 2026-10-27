import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RagIndexJobData } from '@repo/queue';
import { processRagIndexJob } from '../processor';

describe('RAG 索引处理器单元测试 (processRagIndexJob)', () => {
  const dummyJobData: RagIndexJobData = {
    documentId: 'doc_test_123',
    knowledgeBaseId: 'kb_test_456',
    userId: 'user_test_789',
    version: 1,
    storageKey: 'docs/user_test_789/doc_test_123/v1/test.md',
    fileName: 'test.md',
  };

  let mockDoc: {
    id: string;
    status: string;
    deletedAt: Date | null;
    errorMessage: string | null;
  } | null;

  let updateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }>;
  let replaceCalls: Array<{ documentId: string; version: number; chunks: any[] }>;
  const mockEmbeddingModel = {
    specificationVersion: 'v1',
    modelId: 'mock-bge-m3',
    maxEmbeddingsPerCall: 64,
    supportsParallelCalls: true,
    doEmbed: vi.fn(),
  } as any;

  beforeEach(() => {
    mockDoc = {
      id: dummyJobData.documentId,
      status: 'pending',
      deletedAt: null,
      errorMessage: null,
    };
    updateCalls = [];
    replaceCalls = [];
  });

  const createMockDb = () => ({
    document: {
      findUnique: vi.fn(async () => mockDoc),
      update: vi.fn(async ({ where, data }: any) => {
        updateCalls.push({ where, data });
        if (mockDoc) {
          mockDoc = { ...mockDoc, ...data };
        }
        return mockDoc;
      }),
    },
  } as any);

  it('成功全流程：下载 → 解析 → 分词 → 批量向量化 → 事务原子入库', async () => {
    const mdContent = '# 知识库架构\n本项目基于 RAG 混合检索。';
    const mockStorage = {
      upload: vi.fn(),
      download: vi.fn(async () => Buffer.from(mdContent, 'utf-8')),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };

    const mockEmbedMany = vi.fn(async ({ values }: any) => {
      return {
        embeddings: values.map(() => new Array(1024).fill(0.123)),
        usage: { tokens: values.length * 10 },
      };
    });

    const mockReplaceChunks = vi.fn(async (params: any) => {
      replaceCalls.push(params);
      return { chunkCount: params.chunks.length };
    });

    const result = await processRagIndexJob(dummyJobData, {
      prismaClient: createMockDb(),
      storage: mockStorage as any,
      embedManyFn: mockEmbedMany as any,
      replaceChunksFn: mockReplaceChunks as any,
      embeddingModel: mockEmbeddingModel,
    });

    expect(result.success).toBe(true);
    expect(result.chunkCount).toBeGreaterThan(0);

    // 状态流转断言：先更新为 processing
    expect(updateCalls[0].data.status).toBe('processing');

    // 向量化调用断言
    expect(mockEmbedMany).toHaveBeenCalled();

    // 事务替换断言：入参包含 version=1，切片含有 1024 维向量与空格分词
    expect(replaceCalls.length).toBe(1);
    expect(replaceCalls[0].version).toBe(1);
    expect(replaceCalls[0].chunks[0].headingPath).toBe('知识库架构');
    expect(replaceCalls[0].chunks[0].embedding.length).toBe(1024);
    expect(replaceCalls[0].chunks[0].contentSegmented).toContain('混合 检索');
    expect(replaceCalls[0].chunks[0].contentSegmented).toMatch(/\s+/);
  });

  it('重传版本化删旧插新：version=2 时切片正确带入新版本并在事务中替换', async () => {
    const v2JobData = { ...dummyJobData, version: 2 };
    const mdContent = '# 知识库更新版本\n更新后的技术规范。';
    const mockStorage = {
      upload: vi.fn(),
      download: vi.fn(async () => Buffer.from(mdContent, 'utf-8')),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };

    const mockEmbedMany = vi.fn(async ({ values }: any) => ({
      embeddings: values.map(() => new Array(1024).fill(0.456)),
      usage: { tokens: values.length * 10 },
    }));

    const mockReplaceChunks = vi.fn(async (params: any) => {
      replaceCalls.push(params);
      return { chunkCount: params.chunks.length };
    });

    const result = await processRagIndexJob(v2JobData, {
      prismaClient: createMockDb(),
      storage: mockStorage as any,
      embedManyFn: mockEmbedMany as any,
      replaceChunksFn: mockReplaceChunks as any,
      embeddingModel: mockEmbeddingModel,
    });

    expect(result.success).toBe(true);
    expect(result.version).toBe(2);
    expect(replaceCalls[0].version).toBe(2);
    expect(replaceCalls[0].chunks[0].documentVersion).toBe(2);
  });

  it('损坏 PDF 文件：更新为 failed 态与中文原因，不向外抛错以避免 BullMQ 死循环重试 (QA-016)', async () => {
    const corruptedJob = { ...dummyJobData, fileName: 'corrupted.pdf' };
    const mockStorage = {
      upload: vi.fn(),
      download: vi.fn(async () => Buffer.from('corrupted-pdf-invalid-header')),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };

    const result = await processRagIndexJob(corruptedJob, {
      prismaClient: createMockDb(),
      storage: mockStorage as any,
    });

    // 致命错误应当直接返回结果，而不是抛出异常让队列无限死等
    expect(result.success).toBe(false);
    expect(result.isFatal).toBe(true);
    expect(result.errorMessage).toContain('PDF 文件损坏或格式不正确');

    // 数据库状态落盘为 failed 且记录中文原因
    const lastUpdate = updateCalls[updateCalls.length - 1];
    expect(lastUpdate.data.status).toBe('failed');
    expect(lastUpdate.data.errorMessage).toContain('PDF 文件损坏或格式不正确');
  });

  it('瞬态网络或接口异常：更新文档 failed 并向外抛出异常供 BullMQ 退避重试', async () => {
    const mockStorage = {
      upload: vi.fn(),
      download: vi.fn(async () => Buffer.from('# 普通内容\n正文。')),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };

    const mockEmbedMany = vi.fn(async () => {
      throw new Error('503 Service Unavailable upstream network spike');
    });

    await expect(
      processRagIndexJob(dummyJobData, {
        prismaClient: createMockDb(),
        storage: mockStorage as any,
        embedManyFn: mockEmbedMany as any,
        embeddingModel: mockEmbeddingModel,
      })
    ).rejects.toThrow('503 Service Unavailable');

    const lastUpdate = updateCalls[updateCalls.length - 1];
    expect(lastUpdate.data.status).toBe('failed');
    expect(lastUpdate.data.errorMessage).toContain('向量化失败: 503 Service Unavailable');
  });

  it('软删除文档直接跳过索引，不执行后续下载与向量化', async () => {
    mockDoc = {
      id: dummyJobData.documentId,
      status: 'pending',
      deletedAt: new Date(), // 已被软删除
      errorMessage: null,
    };

    const mockStorage = {
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };

    const result = await processRagIndexJob(dummyJobData, {
      prismaClient: createMockDb(),
      storage: mockStorage as any,
    });

    expect(result.success).toBe(false);
    expect(mockStorage.download).not.toHaveBeenCalled();
  });

  it('外链与微信文章全流程：拉取 HTML → 提纯 Markdown → 上传 Storage → 切片入库', async () => {
    const urlJobData: RagIndexJobData = {
      ...dummyJobData,
      sourceType: 'url',
      sourceUrl: 'https://mp.weixin.qq.com/s/sample_article_123',
    };

    const mockStorage = {
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };

    const mockGuardedFetch = vi.fn(async () => ({
      status: 200,
      finalUrl: 'https://mp.weixin.qq.com/s/sample_article_123',
      contentType: 'text/html; charset=utf-8',
      text: '<html><body><h1 id="activity-name">微信架构实战</h1><div id="js_content"><p>本文详细介绍分布式切片架构实践。</p></div></body></html>',
      buffer: Buffer.from('test'),
      isTruncated: false,
    }));

    const mockExtractContent = vi.fn(() => ({
      title: '微信架构实战',
      markdown: '# 微信架构实战\n\n本文详细介绍分布式切片架构实践。',
      contentLength: 60,
    }));

    const mockEmbedMany = vi.fn(async ({ values }: any) => ({
      embeddings: values.map(() => new Array(1024).fill(0.111)),
      usage: { tokens: values.length * 10 },
    }));

    const mockReplaceChunks = vi.fn(async (params: any) => {
      replaceCalls.push(params);
      return { chunkCount: params.chunks.length };
    });

    const result = await processRagIndexJob(urlJobData, {
      prismaClient: createMockDb(),
      storage: mockStorage as any,
      guardedFetchFn: mockGuardedFetch as any,
      extractContentFn: mockExtractContent as any,
      embedManyFn: mockEmbedMany as any,
      replaceChunksFn: mockReplaceChunks as any,
      embeddingModel: mockEmbeddingModel,
    });

    expect(result.success).toBe(true);
    expect(mockGuardedFetch).toHaveBeenCalledWith('https://mp.weixin.qq.com/s/sample_article_123');
    expect(mockExtractContent).toHaveBeenCalled();
    // 应当将清洗出的 Markdown 上传至对象存储
    expect(mockStorage.upload).toHaveBeenCalledWith(
      dummyJobData.storageKey,
      expect.any(Buffer),
      'text/markdown'
    );
    // 数据库标题应更新为真实网页标题
    const titleUpdate = updateCalls.find((c) => c.data.name === '微信架构实战');
    expect(titleUpdate).toBeDefined();
    expect(replaceCalls.length).toBe(1);
  });

  it('外链抓取触发 SSRF 拦截：记录 failed 态与中文原因，不向外抛错以避免死循环重试', async () => {
    const ssrfJobData: RagIndexJobData = {
      ...dummyJobData,
      sourceType: 'url',
      sourceUrl: 'http://127.0.0.1:8080/internal',
    };

    const mockStorage = {
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };

    const result = await processRagIndexJob(ssrfJobData, {
      prismaClient: createMockDb(),
      storage: mockStorage as any,
    });

    expect(result.success).toBe(false);
    expect(result.isFatal).toBe(true);
    expect(result.errorMessage).toContain('内部私有网络');

    const lastUpdate = updateCalls[updateCalls.length - 1];
    expect(lastUpdate.data.status).toBe('failed');
    expect(lastUpdate.data.errorMessage).toContain('安全拦截');
  });

  it('表格与结构化文档：解析切片成功，并将提纯后的 content.md 缓存写入 Storage (ADR-0029)', async () => {
    const csvJobData: RagIndexJobData = {
      ...dummyJobData,
      fileName: 'inventory.csv',
      storageKey: 'docs/user_test_789/doc_test_123/v1/inventory.csv',
    };

    const csvContent = '编号,商品,价格\n1,苹果,5.5\n2,西瓜,18.0';
    const mockStorage = {
      upload: vi.fn(),
      download: vi.fn(async () => Buffer.from(csvContent, 'utf-8')),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };

    const mockEmbedMany = vi.fn(async ({ values }: any) => ({
      embeddings: values.map(() => new Array(1024).fill(0.222)),
      usage: { tokens: values.length * 10 },
    }));

    const mockReplaceChunks = vi.fn(async (params: any) => {
      replaceCalls.push(params);
      return { chunkCount: params.chunks.length };
    });

    const result = await processRagIndexJob(csvJobData, {
      prismaClient: createMockDb(),
      storage: mockStorage as any,
      embedManyFn: mockEmbedMany as any,
      replaceChunksFn: mockReplaceChunks as any,
      embeddingModel: mockEmbeddingModel,
    });

    expect(result.success).toBe(true);
    expect(result.chunkCount).toBeGreaterThan(0);

    // 验证 content.md 缓存被上传至对象存储
    expect(mockStorage.upload).toHaveBeenCalledWith(
      'docs/user_test_789/doc_test_123/v1/content.md',
      expect.any(Buffer),
      'text/markdown'
    );

    // 验证切片包含 parsedContentKey
    expect(replaceCalls.length).toBe(1);
    expect(replaceCalls[0].chunks[0].metadata.parsedContentKey).toBe(
      'docs/user_test_789/doc_test_123/v1/content.md'
    );
  });
});

