import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RagIndexJobData } from '@repo/queue';
import { buildChunkInheritedMetadata, deriveParsedContentKey } from '@repo/shared';
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
    tags?: string[];
    sourceType?: string;
    sourceUrl?: string | null;
    storageKey?: string;
    metadata?: Record<string, unknown>;
  } | null;

  let updateCalls: Array<{ where: { id: string }; data: Record<string, unknown> }>;
  let replaceCalls: Array<{
    documentId: string;
    version: number;
    chunks: any[];
    metadata?: any;
    inheritance?: any;
  }>;
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

  const asEmbedTexts = (embedManyFn: any) =>
    vi.fn(async (values: string[]) => {
      const result = await embedManyFn({ values });
      return result.embeddings;
    });

  /**
   * 构造模板化处理器依赖：默认 Markdown 正文、1024 维向量与事务替换桩。
   * 特殊用例通过 download / embedMany / replaceChunks 覆盖，避免每处重复装配。
   */
  const createDefaultDeps = (
    options: {
      download?: () => Promise<Buffer>;
      embedMany?: any;
      replaceChunks?: any;
    } = {}
  ) => {
    const storage = {
      upload: vi.fn(),
      download: vi.fn(
        options.download ?? (async () => Buffer.from('# 默认正文\n默认内容。', 'utf-8'))
      ),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };
    const embedManyFn =
      options.embedMany ??
      vi.fn(async ({ values }: any) => ({
        embeddings: values.map(() => new Array(1024).fill(0.123)),
        usage: { tokens: values.length * 10 },
      }));
    const embedTextsFn = asEmbedTexts(embedManyFn);
    const replaceChunksFn =
      options.replaceChunks ??
      vi.fn(async (params: any) => {
        replaceCalls.push(params);
        return { chunkCount: params.chunks.length };
      });

    return {
      deps: {
        prismaClient: createMockDb(),
        storage: storage as any,
        embedTextsFn: embedTextsFn as any,
        replaceChunksFn: replaceChunksFn as any,
      },
      storage,
      embedTextsFn,
      replaceChunksFn,
    };
  };

  it('成功全流程：下载 → 解析 → 分词 → 批量向量化 → 事务原子入库', async () => {
    const { deps, embedTextsFn } = createDefaultDeps({
      download: async () => Buffer.from('# 知识库架构\n本项目基于 RAG 混合检索。', 'utf-8'),
    });

    const result = await processRagIndexJob(dummyJobData, deps);

    expect(result.success).toBe(true);
    expect(result.chunkCount).toBeGreaterThan(0);

    // 状态流转断言：先更新为 processing
    expect(updateCalls[0].data.status).toBe('processing');

    // 向量化调用断言
    expect(embedTextsFn).toHaveBeenCalled();

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
    const { deps } = createDefaultDeps({
      download: async () => Buffer.from('# 知识库更新版本\n更新后的技术规范。', 'utf-8'),
    });

    const result = await processRagIndexJob(v2JobData, deps);

    expect(result.success).toBe(true);
    expect(result.version).toBe(2);
    expect(replaceCalls[0].version).toBe(2);
    expect(replaceCalls[0].chunks[0].documentVersion).toBe(2);
  });

  it('损坏 PDF 文件：更新为 failed 态与中文原因，不向外抛错以避免 BullMQ 死循环重试 (QA-016)', async () => {
    // SourceFormat 从 storageKey 派生，损坏夹具必须同时维护 fileName 与 storageKey 为 .pdf
    const corruptedJob = {
      ...dummyJobData,
      fileName: 'corrupted.pdf',
      storageKey: 'docs/user_test_789/doc_test_123/v1/corrupted.pdf',
    };
    const { deps } = createDefaultDeps({
      download: async () => Buffer.from('corrupted-pdf-invalid-header'),
    });

    const result = await processRagIndexJob(corruptedJob, deps);

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
    const { deps } = createDefaultDeps({
      download: async () => Buffer.from('# 普通内容\n正文。'),
      embedMany: vi.fn(async () => {
        throw new Error('503 Service Unavailable upstream network spike');
      }),
    });

    await expect(processRagIndexJob(dummyJobData, deps)).rejects.toThrow(
      '503 Service Unavailable'
    );

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
      embedTextsFn: asEmbedTexts(mockEmbedMany),
      replaceChunksFn: mockReplaceChunks as any,
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
      embedTextsFn: asEmbedTexts(mockEmbedMany),
      replaceChunksFn: mockReplaceChunks as any,
    });

    expect(result.success).toBe(true);
    expect(result.chunkCount).toBeGreaterThan(0);

    // 验证 content.md 缓存被上传至对象存储
    expect(mockStorage.upload).toHaveBeenCalledWith(
      'docs/user_test_789/doc_test_123/v1/content.md',
      expect.any(Buffer),
      'text/markdown'
    );

    // 验证切片经继承事实构造后含 parsedContentKey（C1：processor 不再自行拼 metadata，
    // 由共享构造规则在 chunk-store 层统一拼装）
    expect(replaceCalls.length).toBe(1);
    expect(replaceCalls[0].chunks[0].metadata).toBeUndefined();
    expect(replaceCalls[0].inheritance.storageKey).toBe(
      'docs/user_test_789/doc_test_123/v1/inventory.csv'
    );
    const inherited = buildChunkInheritedMetadata(replaceCalls[0].inheritance);
    expect(inherited.parsedContentKey).toBe('docs/user_test_789/doc_test_123/v1/content.md');
  });

  it('P-W7 验证：存量文档重建索引时，旧 outline 不会污染切片 metadata，且 Document 大纲元数据被干净覆盖', async () => {
    // 模拟存量文档的 metadata 中残留有旧大纲
    const oldOutline = {
      version: 1,
      totalHeadings: 1,
      maxDepth: 1,
      tree: [
        {
          title: '旧章节大纲',
          level: 1,
          headingPath: '旧章节大纲',
          chunkRange: [0, 0],
          tokenCount: 50,
          children: [],
        },
      ],
    };

    const mockDbWithOldOutline = {
      document: {
        findUnique: vi.fn(async () => ({
          ...mockDoc,
          tags: ['安全'],
          sourceType: 'file',
          metadata: {
            author: 'alice',
            outline: oldOutline,
          },
        })),
        update: vi.fn(async (params: any) => {
          updateCalls.push(params);
          return mockDoc;
        }),
      },
    };

    const newMdContent = '# 新章节标题\n全新的技术说明文本。';
    const mockStorage = {
      upload: vi.fn(),
      download: vi.fn(async () => Buffer.from(newMdContent, 'utf-8')),
      delete: vi.fn(),
      getUrl: vi.fn(),
    };

    const mockEmbedMany = vi.fn(async ({ values }: any) => ({
      embeddings: values.map(() => new Array(1024).fill(0.123)),
      usage: { tokens: values.length * 10 },
    }));

    const mockReplaceChunks = vi.fn(async (params: any) => {
      replaceCalls.push(params);
      return { chunkCount: params.chunks.length };
    });

    const result = await processRagIndexJob(dummyJobData, {
      prismaClient: mockDbWithOldOutline as any,
      storage: mockStorage as any,
      embedTextsFn: asEmbedTexts(mockEmbedMany),
      replaceChunksFn: mockReplaceChunks as any,
    });

    expect(result.success).toBe(true);
    expect(replaceCalls.length).toBe(1);
    const insertedChunk = replaceCalls[0].chunks[0];

    // 断言 1（C1 新契约）：processor 不再自行拼切片 metadata，改传文档继承事实；
    // outline 由共享构造规则剔除，根除切片数据膨胀 (P-W7 / S-J3)
    expect(insertedChunk.metadata).toBeUndefined();
    expect(replaceCalls[0].inheritance.metadata.author).toBe('alice');
    const inherited = buildChunkInheritedMetadata(replaceCalls[0].inheritance);
    expect(inherited).not.toHaveProperty('outline');
    expect(inherited.author).toBe('alice');
    expect(inherited.sourceType).toBe('file');
    expect(inherited.fileName).toBe('test.md');
    expect(inherited.tags).toEqual(['安全']);

    // 断言 2：Document 的新 metadata 成功更新为新解析出的大纲，不再残留旧大纲
    expect(replaceCalls[0].metadata.outline.tree[0].title).toBe('新章节标题');
  });

  describe('SourceFormat 派生与衍生写入 (TC03)', () => {
    it('TC03-1 任务与主表 key 不一致时以任务版本为准', async () => {
      mockDoc = {
        ...mockDoc!,
        sourceType: 'file',
        // 主表可能已指向重传后的 v2 PDF，但本次任务处理的仍是 v1 Markdown
        storageKey: 'docs/user_test_789/doc_test_123/v2/archive.pdf',
      };
      const jobData: RagIndexJobData = {
        ...dummyJobData,
        version: 1,
        storageKey: 'docs/user_test_789/doc_test_123/v1/spec.md',
        fileName: 'spec.md',
      };

      const mockStorage = {
        upload: vi.fn(),
        download: vi.fn(async () => Buffer.from('# v1 规范\n任务同源正文。', 'utf-8')),
        delete: vi.fn(),
        getUrl: vi.fn(),
      };
      const mockEmbedMany = vi.fn(async ({ values }: any) => ({
        embeddings: values.map(() => new Array(1024).fill(0.123)),
        usage: { tokens: values.length * 10 },
      }));
      const mockReplaceChunks = vi.fn(async (params: any) => {
        replaceCalls.push(params);
        return { chunkCount: params.chunks.length };
      });

      const result = await processRagIndexJob(jobData, {
        prismaClient: createMockDb(),
        storage: mockStorage as any,
        embedTextsFn: asEmbedTexts(mockEmbedMany),
        replaceChunksFn: mockReplaceChunks as any,
      });

      expect(result.success).toBe(true);
      expect(mockStorage.download).toHaveBeenCalledTimes(1);
      expect(mockStorage.download).toHaveBeenCalledWith(jobData.storageKey);
      expect(mockStorage.download).not.toHaveBeenCalledWith(
        'docs/user_test_789/doc_test_123/v2/archive.pdf'
      );
      expect(replaceCalls[0].inheritance.storageKey).toBe(jobData.storageKey);
      expect(replaceCalls[0].chunks[0].headingPath).toBe('v1 规范');
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('TC03-2 旧 file 任务缺 sourceType 仍兼容', async () => {
      mockDoc = { ...mockDoc!, sourceType: 'file' };
      const legacyJobData: RagIndexJobData = {
        documentId: dummyJobData.documentId,
        knowledgeBaseId: dummyJobData.knowledgeBaseId,
        userId: dummyJobData.userId,
        version: 1,
        storageKey: 'docs/user_test_789/doc_test_123/v1/legacy.txt',
        fileName: 'legacy.txt',
      };
      expect('sourceType' in legacyJobData).toBe(false);

      const mockStorage = {
        upload: vi.fn(),
        download: vi.fn(async () => Buffer.from('旧任务纯文本内容。', 'utf-8')),
        delete: vi.fn(),
        getUrl: vi.fn(),
      };
      const mockEmbedMany = vi.fn(async ({ values }: any) => ({
        embeddings: values.map(() => new Array(1024).fill(0.124)),
        usage: { tokens: values.length * 10 },
      }));
      const mockReplaceChunks = vi.fn(async (params: any) => {
        replaceCalls.push(params);
        return { chunkCount: params.chunks.length };
      });

      const result = await processRagIndexJob(legacyJobData, {
        prismaClient: createMockDb(),
        storage: mockStorage as any,
        embedTextsFn: asEmbedTexts(mockEmbedMany),
        replaceChunksFn: mockReplaceChunks as any,
      });

      expect(result.success).toBe(true);
      expect(mockStorage.download).toHaveBeenCalledWith(legacyJobData.storageKey);
      expect(replaceCalls[0].chunks[0].headingPath).toBeNull();
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('来源类型按 Document.sourceType、jobData.sourceType、file-like 顺序回退', async () => {
      const mockEmbedMany = vi.fn(async ({ values }: any) => ({
        embeddings: values.map(() => new Array(1024).fill(0.129)),
        usage: { tokens: values.length * 10 },
      }));
      const mockReplaceChunks = vi.fn(async (params: any) => {
        replaceCalls.push(params);
        return { chunkCount: params.chunks.length };
      });

      // 场景 1：主表已记录 file，即使任务携带 url 也以主表为准（不抓取网页，按 csv key 解析并写衍生件）
      mockDoc = {
        id: dummyJobData.documentId,
        status: 'pending',
        deletedAt: null,
        errorMessage: null,
        sourceType: 'file',
      };
      const fileStorage = {
        upload: vi.fn(),
        download: vi.fn(async () => Buffer.from('编号,名称\n1,苹果', 'utf-8')),
        delete: vi.fn(),
        getUrl: vi.fn(),
      };
      const unexpectedFetch = vi.fn();
      const fileResult = await processRagIndexJob(
        {
          ...dummyJobData,
          sourceType: 'url',
          sourceUrl: 'https://example.com/should-not-fetch',
          storageKey: 'docs/user_test_789/doc_test_123/v1/inventory.csv',
          fileName: 'inventory.csv',
        },
        {
          prismaClient: createMockDb(),
          storage: fileStorage as any,
          guardedFetchFn: unexpectedFetch as any,
          embedTextsFn: asEmbedTexts(mockEmbedMany),
          replaceChunksFn: mockReplaceChunks as any,
        }
      );
      expect(fileResult.success).toBe(true);
      expect(unexpectedFetch).not.toHaveBeenCalled();
      expect(fileStorage.download).toHaveBeenCalledWith(
        'docs/user_test_789/doc_test_123/v1/inventory.csv'
      );
      expect(fileStorage.upload).toHaveBeenCalledWith(
        deriveParsedContentKey('docs/user_test_789/doc_test_123/v1/inventory.csv'),
        expect.any(Buffer),
        'text/markdown'
      );

      // 场景 2：主表来源缺失时回退任务携带的 url，走网页抓取并解析归一化 Markdown
      updateCalls = [];
      replaceCalls = [];
      mockDoc = {
        id: dummyJobData.documentId,
        status: 'pending',
        deletedAt: null,
        errorMessage: null,
      };
      const urlStorage = {
        upload: vi.fn(),
        download: vi.fn(),
        delete: vi.fn(),
        getUrl: vi.fn(),
      };
      const guardedFetch = vi.fn(async () => ({
        status: 200,
        finalUrl: 'https://example.com/fallback',
        contentType: 'text/html; charset=utf-8',
        text: '<html><body><h1>回退标题</h1><p>回退正文。</p></body></html>',
        buffer: Buffer.from('test'),
        isTruncated: false,
      }));
      const urlResult = await processRagIndexJob(
        {
          ...dummyJobData,
          sourceType: 'url',
          sourceUrl: 'https://example.com/fallback',
          storageKey: 'docs/user_test_789/url-1700000000001-fallback/v1/content.md',
          fileName: 'example.com/fallback.md',
        },
        {
          prismaClient: createMockDb(),
          storage: urlStorage as any,
          guardedFetchFn: guardedFetch as any,
          extractContentFn: vi.fn(() => ({
            title: '回退标题',
            markdown: '# 回退标题\n\n回退正文。',
            contentLength: 20,
          })) as any,
          embedTextsFn: asEmbedTexts(mockEmbedMany),
          replaceChunksFn: mockReplaceChunks as any,
        }
      );
      expect(urlResult.success).toBe(true);
      expect(guardedFetch).toHaveBeenCalledWith('https://example.com/fallback');
      expect(urlStorage.download).not.toHaveBeenCalled();

      // 场景 3：主表与任务都没有 sourceType 时按 file-like 从 storageKey 派生，不默认 Markdown
      updateCalls = [];
      replaceCalls = [];
      const defaultStorage = {
        upload: vi.fn(),
        download: vi.fn(async () => Buffer.from('编号,名称\n2,香蕉', 'utf-8')),
        delete: vi.fn(),
        getUrl: vi.fn(),
      };
      const defaultResult = await processRagIndexJob(
        {
          documentId: dummyJobData.documentId,
          knowledgeBaseId: dummyJobData.knowledgeBaseId,
          userId: dummyJobData.userId,
          version: 1,
          storageKey: 'docs/user_test_789/doc_test_123/v1/default.csv',
          fileName: 'default.csv',
        },
        {
          prismaClient: createMockDb(),
          storage: defaultStorage as any,
          embedTextsFn: asEmbedTexts(mockEmbedMany),
          replaceChunksFn: mockReplaceChunks as any,
        }
      );
      expect(defaultResult.success).toBe(true);
      expect(defaultStorage.download).toHaveBeenCalledWith(
        'docs/user_test_789/doc_test_123/v1/default.csv'
      );
      expect(defaultStorage.upload).toHaveBeenCalledWith(
        deriveParsedContentKey('docs/user_test_789/doc_test_123/v1/default.csv'),
        expect.any(Buffer),
        'text/markdown'
      );
    });

    it('TC03-3 URL 含点标题无需合成 Markdown 后缀', async () => {
      const sourceUrl = 'https://example.com/release/1.5';
      mockDoc = { ...mockDoc!, sourceType: 'url', sourceUrl };
      const urlJobData: RagIndexJobData = {
        ...dummyJobData,
        sourceType: 'url',
        sourceUrl,
        fileName: 'example.com/release.md',
      };

      const mockStorage = {
        upload: vi.fn(),
        download: vi.fn(),
        delete: vi.fn(),
        getUrl: vi.fn(),
      };
      const mockGuardedFetch = vi.fn(async () => ({
        status: 200,
        finalUrl: sourceUrl,
        contentType: 'text/html; charset=utf-8',
        text: '<html><body><h1>版本 1.5 发布说明</h1><p>本次更新内容。</p></body></html>',
        buffer: Buffer.from('test'),
        isTruncated: false,
      }));
      const mockExtractContent = vi.fn(() => ({
        title: '版本 1.5 发布说明',
        markdown: '# 版本 1.5 发布说明\n\n本次更新内容。',
        contentLength: 40,
      }));
      const mockEmbedMany = vi.fn(async ({ values }: any) => ({
        embeddings: values.map(() => new Array(1024).fill(0.125)),
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
        embedTextsFn: asEmbedTexts(mockEmbedMany),
        replaceChunksFn: mockReplaceChunks as any,
      });

      expect(result.success).toBe(true);
      expect(updateCalls.find((call) => call.data.name === '版本 1.5 发布说明')).toBeDefined();
      expect(updateCalls.every((call) => !String(call.data.name ?? '').endsWith('.md'))).toBe(true);
      expect(replaceCalls[0].chunks[0].headingPath).toBe('版本 1.5 发布说明');
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        urlJobData.storageKey,
        expect.any(Buffer),
        'text/markdown'
      );
    });

    it('TC03-4 unknown 永久失败且不瞬态重试', async () => {
      mockDoc = { ...mockDoc!, sourceType: 'file' };
      const unknownJobData: RagIndexJobData = {
        ...dummyJobData,
        storageKey: 'docs/user_test_789/doc_test_123/v1/payload.bin',
        fileName: 'payload.bin',
      };

      const mockStorage = {
        upload: vi.fn(),
        download: vi.fn(async () => Buffer.from('unknown-binary-payload')),
        delete: vi.fn(),
        getUrl: vi.fn(),
      };
      const mockEmbedMany = vi.fn();

      const result = await processRagIndexJob(unknownJobData, {
        prismaClient: createMockDb(),
        storage: mockStorage as any,
        embedTextsFn: asEmbedTexts(mockEmbedMany),
      });

      expect(result.success).toBe(false);
      expect(result.isFatal).toBe(true);
      expect(result.errorMessage).toContain('不支持的文件格式');
      expect(mockEmbedMany).not.toHaveBeenCalled();
      expect(mockStorage.upload).not.toHaveBeenCalled();

      const lastUpdate = updateCalls[updateCalls.length - 1];
      expect(lastUpdate.data.status).toBe('failed');
      expect(lastUpdate.data.errorMessage).toContain('不支持的文件格式');
    });

    it('TC03-5 MD/TXT 新索引与重传不写额外衍生件', async () => {
      mockDoc = { ...mockDoc!, sourceType: 'file' };
      const cases: Array<{ job: RagIndexJobData; buffer: Buffer }> = [
        {
          job: {
            ...dummyJobData,
            version: 1,
            storageKey: 'docs/user_test_789/doc_test_123/v1/new-index.md',
            fileName: 'new-index.md',
          },
          buffer: Buffer.from('# 新索引标题\n新索引正文。', 'utf-8'),
        },
        {
          job: {
            ...dummyJobData,
            version: 2,
            storageKey: 'docs/user_test_789/doc_test_123/v2/reupload.md',
            fileName: 'reupload.md',
          },
          buffer: Buffer.from('# 重传 Markdown 标题\n重传 Markdown 正文。', 'utf-8'),
        },
        {
          job: {
            ...dummyJobData,
            version: 1,
            storageKey: 'docs/user_test_789/doc_test_123/v1/new-index.txt',
            fileName: 'new-index.txt',
          },
          buffer: Buffer.from('新索引纯文本正文。', 'utf-8'),
        },
        {
          job: {
            ...dummyJobData,
            version: 2,
            storageKey: 'docs/user_test_789/doc_test_123/v2/reupload.txt',
            fileName: 'reupload.txt',
          },
          buffer: Buffer.from('重传纯文本正文。', 'utf-8'),
        },
      ];

      let downloadIndex = 0;
      const mockStorage = {
        upload: vi.fn(),
        download: vi.fn(async () => cases[downloadIndex++]!.buffer),
        delete: vi.fn(),
        getUrl: vi.fn(),
      };
      const mockEmbedMany = vi.fn(async ({ values }: any) => ({
        embeddings: values.map(() => new Array(1024).fill(0.126)),
        usage: { tokens: values.length * 10 },
      }));
      const mockReplaceChunks = vi.fn(async (params: any) => {
        replaceCalls.push(params);
        return { chunkCount: params.chunks.length };
      });

      const deps = {
        prismaClient: createMockDb(),
        storage: mockStorage as any,
        embedTextsFn: asEmbedTexts(mockEmbedMany),
        replaceChunksFn: mockReplaceChunks as any,
      };

      for (const testCase of cases) {
        const result = await processRagIndexJob(testCase.job, deps);
        expect(result.success).toBe(true);
      }

      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(replaceCalls).toHaveLength(cases.length);
      expect(replaceCalls[0].chunks.length).toBeGreaterThan(0);
      expect(replaceCalls[0].metadata.outline.tree[0].title).toBe('新索引标题');
      expect(replaceCalls[1].version).toBe(2);
      expect(replaceCalls[1].metadata.outline.tree[0].title).toBe('重传 Markdown 标题');
      expect(replaceCalls[2].chunks[0].headingPath).toBeNull();
      expect(replaceCalls[3].chunks[0].content).toContain('重传纯文本正文');
    });

    it('TC03-6 结构化文档经共享派生写入 content.md', async () => {
      mockDoc = { ...mockDoc!, sourceType: 'file' };
      const mammothSpy = vi.spyOn(mammoth, 'convertToHtml').mockResolvedValue({
        value: '<h1>Word 标题</h1><p>Word 正文。</p>',
        messages: [],
      });

      try {
        const xlsxWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          xlsxWorkbook,
          XLSX.utils.aoa_to_sheet([
            ['编号', '名称'],
            ['1', '苹果'],
          ]),
          '数据表'
        );
        const xlsxBuffer = XLSX.write(xlsxWorkbook, {
          type: 'buffer',
          bookType: 'xlsx',
        }) as Buffer;

        const structuredJobs: Array<{ job: RagIndexJobData; buffer: Buffer }> = [
          {
            job: {
              ...dummyJobData,
              version: 1,
              storageKey: 'docs/user_test_789/doc_test_123/v1/report.docx',
              fileName: 'report.docx',
            },
            buffer: Buffer.from('mock-docx-data'),
          },
          {
            job: {
              ...dummyJobData,
              version: 2,
              storageKey: 'docs/user_test_789/doc_test_123/v2/book.xlsx',
              fileName: 'book.xlsx',
            },
            buffer: xlsxBuffer,
          },
          {
            job: {
              ...dummyJobData,
              version: 3,
              storageKey: 'docs/user_test_789/doc_test_123/v3/data.csv',
              fileName: 'data.csv',
            },
            buffer: Buffer.from('编号,名称\n1,苹果', 'utf-8'),
          },
        ];

        const mockStorage = {
          upload: vi.fn(),
          download: vi
            .fn()
            .mockResolvedValueOnce(structuredJobs[0].buffer)
            .mockResolvedValueOnce(structuredJobs[1].buffer)
            .mockResolvedValueOnce(structuredJobs[2].buffer),
          delete: vi.fn(),
          getUrl: vi.fn(),
        };
        const mockEmbedMany = vi.fn(async ({ values }: any) => ({
          embeddings: values.map(() => new Array(1024).fill(0.127)),
          usage: { tokens: values.length * 10 },
        }));
        const mockReplaceChunks = vi.fn(async (params: any) => {
          replaceCalls.push(params);
          return { chunkCount: params.chunks.length };
        });

        const deps = {
          prismaClient: createMockDb(),
          storage: mockStorage as any,
          embedTextsFn: asEmbedTexts(mockEmbedMany),
          replaceChunksFn: mockReplaceChunks as any,
        };

        for (const { job } of structuredJobs) {
          const result = await processRagIndexJob(job, deps);
          expect(result.success).toBe(true);
        }

        expect(mockStorage.upload).toHaveBeenCalledTimes(structuredJobs.length);
        for (const { job } of structuredJobs) {
          expect(mockStorage.upload).toHaveBeenCalledWith(
            deriveParsedContentKey(job.storageKey),
            expect.any(Buffer),
            'text/markdown'
          );
        }

        const uploadedTexts = mockStorage.upload.mock.calls.map((call: any[]) =>
          (call[1] as Buffer).toString('utf-8')
        );
        expect(uploadedTexts[0]).toContain('Word 标题');
        expect(uploadedTexts[1]).toContain('| 编号 | 名称 |');
        expect(uploadedTexts[2]).toContain('| 1 | 苹果 |');
      } finally {
        mammothSpy.mockRestore();
      }
    });

    it('TC03-7 URL 仅写自身源资产而不重复衍生上传', async () => {
      const sourceUrl = 'https://example.com/articles/one';
      mockDoc = { ...mockDoc!, sourceType: 'url', sourceUrl };
      const urlJobData: RagIndexJobData = {
        ...dummyJobData,
        sourceType: 'url',
        sourceUrl,
        storageKey: 'docs/user_test_789/url-1700000000000-abcd1234/v1/content.md',
        fileName: 'example.com/articles.md',
      };

      const mockStorage = {
        upload: vi.fn(),
        download: vi.fn(),
        delete: vi.fn(),
        getUrl: vi.fn(),
      };
      const mockGuardedFetch = vi.fn(async () => ({
        status: 200,
        finalUrl: sourceUrl,
        contentType: 'text/html; charset=utf-8',
        text: '<html><body><h1>单篇归档</h1><p>归档正文。</p></body></html>',
        buffer: Buffer.from('test'),
        isTruncated: false,
      }));
      const mockExtractContent = vi.fn(() => ({
        title: '单篇归档',
        markdown: '# 单篇归档\n\n归档正文。',
        contentLength: 30,
      }));
      const mockEmbedMany = vi.fn(async ({ values }: any) => ({
        embeddings: values.map(() => new Array(1024).fill(0.128)),
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
        embedTextsFn: asEmbedTexts(mockEmbedMany),
        replaceChunksFn: mockReplaceChunks as any,
      });

      expect(result.success).toBe(true);
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        urlJobData.storageKey,
        expect.any(Buffer),
        'text/markdown'
      );
    });
  });
});

