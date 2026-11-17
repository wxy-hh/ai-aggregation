import { describe, expect, it, vi } from 'vitest';
import type { DocumentPreviewChunk } from './document-preview-contract';
import {
  DocumentPreviewProjection,
  DocumentPreviewReadError,
  type DocumentPreviewDocumentFacts,
} from './document-preview-projection';

/** 构造最小文档事实；默认是一篇 file 来源的 DOCX */
function buildDocument(
  overrides: Partial<DocumentPreviewDocumentFacts> = {}
): DocumentPreviewDocumentFacts {
  return {
    id: 'doc_1',
    name: '季度报告.md',
    version: 3,
    status: 'pending',
    storageKey: 'docs/user_1/doc_1/v3/季度报告.docx',
    sourceType: 'file',
    sourceUrl: null,
    errorMessage: null,
    chunkCount: 12,
    ...overrides,
  };
}

const TWO_CHUNKS: DocumentPreviewChunk[] = [
  { chunkIndex: 0, content: '第一片正文', headingPath: '第一章', pageNumber: null },
  { chunkIndex: 1, content: '第二片正文', headingPath: '第二章', pageNumber: null },
];

const PDF_CHUNKS: DocumentPreviewChunk[] = [
  { chunkIndex: 0, content: '第一章：概述', headingPath: '第一章 概述', pageNumber: 1 },
  { chunkIndex: 1, content: '第二章：架构', headingPath: '第二章 架构', pageNumber: 3 },
];

interface ProjectionOptions {
  download?: (key: string) => Promise<Buffer>;
  getUrl?: (key: string) => Promise<string>;
  chunks?: DocumentPreviewChunk[];
}

/** 用存储与切片替身记录正文读取与切片查询 */
function createProjection(options: ProjectionOptions = {}) {
  const getUrl = vi.fn<(key: string) => Promise<string>>(
    options.getUrl ?? (async () => 'https://storage.example.com/original.docx?token=abc')
  );
  const download = vi.fn<(key: string) => Promise<Buffer>>(
    options.download ?? (async () => Buffer.from('默认正文'))
  );
  const loadCurrentVersionChunks = vi.fn<
    (document: DocumentPreviewDocumentFacts) => Promise<DocumentPreviewChunk[]>
  >(async () => options.chunks ?? []);

  const projection = new DocumentPreviewProjection({
    getStorage: () => ({ download, getUrl }),
    loadCurrentVersionChunks,
  });

  return { projection, getUrl, download, loadCurrentVersionChunks };
}

describe('DocumentPreviewProjection 非 ready 投影', () => {
  it('TC05-1 pending/processing file 状态门控与空投影', async () => {
    for (const status of ['pending', 'processing'] as const) {
      const { projection, getUrl, download, loadCurrentVersionChunks } = createProjection();
      const document = buildDocument({ status });

      const result = await projection.projectNonReady(document);

      expect(result.data.sourceFormat).toBe('docx');
      expect(result.data.status).toBe(status);
      expect(result.data.content).toBe('');
      expect(result.data.chunks).toEqual([]);
      expect(result.data.chunkCount).toBeNull();
      expect(result.data.renderMode).toBeUndefined();
      expect(result.data.originalUrl).toBe('https://storage.example.com/original.docx?token=abc');
      expect(getUrl).toHaveBeenCalledWith(document.storageKey, 3600);
      expect(download).not.toHaveBeenCalled();
      expect(loadCurrentVersionChunks).not.toHaveBeenCalled();
    }
  });

  it('TC05-2 failed DOCX 失败事实格式与原件下载', async () => {
    const { projection, getUrl, download, loadCurrentVersionChunks } = createProjection();
    const document = buildDocument({
      id: 'doc_failed',
      status: 'failed',
      // 展示名后缀故意误导，格式必须仍以 storageKey 的 .docx 为准
      name: '季度报告.md',
      storageKey: 'docs/user_1/doc_failed/v3/季度报告.docx',
      errorMessage: 'DOCX 文件结构损坏，无法完成解析',
    });

    const result = await projection.projectNonReady(document);

    expect(result.data.sourceFormat).toBe('docx');
    expect(result.data.status).toBe('failed');
    expect(result.data.errorMessage).toBe('DOCX 文件结构损坏，无法完成解析');
    expect(result.data).not.toHaveProperty('fileType');
    expect(result.data).not.toHaveProperty('bodySource');
    expect(result.data.renderMode).toBeUndefined();
    expect(result.data.originalUrl).toBe('https://storage.example.com/original.docx?token=abc');
    expect(getUrl).toHaveBeenCalledWith(document.storageKey, 3600);
    expect(download).not.toHaveBeenCalled();
    expect(loadCurrentVersionChunks).not.toHaveBeenCalled();
  });

  it('TC05-3 非 ready URL 仅保留外部来源', async () => {
    for (const status of ['pending', 'processing', 'failed'] as const) {
      const { projection, getUrl, download, loadCurrentVersionChunks } = createProjection();
      const document = buildDocument({
        status,
        name: '网页文章',
        storageKey: 'docs/user_1/url-1730000000000-abc123/v1/content.md',
        sourceType: 'url',
        sourceUrl: 'https://example.com/articles/1',
        errorMessage: status === 'failed' ? '网页抓取失败' : null,
      });

      const result = await projection.projectNonReady(document);

      expect(result.data.sourceFormat).toBe('md');
      expect(result.data).not.toHaveProperty('fileType');
      expect(result.data.renderMode).toBeUndefined();
      expect(result.data.originalUrl).toBeNull();
      expect(result.data.sourceUrl).toBe('https://example.com/articles/1');
      expect(getUrl).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
      expect(loadCurrentVersionChunks).not.toHaveBeenCalled();
    }
  });

  it('TC05-4 非 ready 不展示主表旧切片计数', async () => {
    for (const status of ['pending', 'processing', 'failed'] as const) {
      const { projection } = createProjection();
      const document = buildDocument({ status, chunkCount: 12 });

      const result = await projection.projectNonReady(document);

      expect(result.data.chunkCount).toBeNull();
    }
  });

  it('TC05-5 非 ready 签名失败不改状态', async () => {
    const { projection, getUrl } = createProjection();
    getUrl.mockRejectedValueOnce(new Error('签名服务超时'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const document = buildDocument({
      status: 'failed',
      errorMessage: '文档解析索引失败',
    });

    try {
      const result = await projection.projectNonReady(document);

      expect(result.data.originalUrl).toBeNull();
      expect(result.data.status).toBe('failed');
      expect(result.data.errorMessage).toBe('文档解析索引失败');
      expect(result.data.sourceFormat).toBe('docx');
      expect(result.data).not.toHaveProperty('fileType');
      expect(result.data.renderMode).toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('非 ready unknown 的 sourceFormat 固定为 unknown 不冒充 Markdown', async () => {
    const { projection } = createProjection();
    const document = buildDocument({
      status: 'failed',
      name: '未知对象',
      storageKey: 'docs/user_1/doc_1/v3/未知对象.bin',
      errorMessage: '不支持的文件格式',
    });

    const result = await projection.projectNonReady(document);

    expect(result.data.sourceFormat).toBe('unknown');
    expect(result.data).not.toHaveProperty('fileType');
    expect(result.data.renderMode).toBeUndefined();
  });
});

describe('DocumentPreviewProjection ready 正文矩阵', () => {
  it('TC06-1 MD/TXT stored 正文矩阵', async () => {
    const cases = [
      {
        format: 'md',
        fileName: '规范.md',
        content: '# 规范正文\n\n正文来自源资产。',
      },
      {
        format: 'txt',
        fileName: '说明.txt',
        content: '纯文本正文来自源资产。',
      },
    ] as const;

    for (const testCase of cases) {
      const document = buildDocument({
        status: 'ready',
        name: testCase.fileName,
        storageKey: `docs/user_1/doc_1/v3/${testCase.fileName}`,
      });
      const { projection, download, loadCurrentVersionChunks } = createProjection({
        chunks: TWO_CHUNKS,
        download: async (key) => {
          if (key === document.storageKey) {
            return Buffer.from(testCase.content, 'utf-8');
          }
          throw new Error(`不应读取其他对象: ${key}`);
        },
      });

      const result = await projection.project(document);

      expect(result.bodySource).toBe('stored');
      expect(result.data.sourceFormat).toBe(testCase.format);
      expect(result.data.renderMode).toBe('markdown');
      expect(result.data.content).toBe(testCase.content);
      expect(result.data.chunks).toEqual(TWO_CHUNKS);
      expect(result.data.chunkCount).toBe(2);
      expect(result.data).not.toHaveProperty('fileType');
      expect(download).toHaveBeenCalledWith(document.storageKey);
      expect(download).not.toHaveBeenCalledWith('docs/user_1/doc_1/v3/content.md');
      expect(loadCurrentVersionChunks).toHaveBeenCalledWith(document);
    }
  });

  it('TC06-2 DOCX/XLSX/CSV derived 正文矩阵', async () => {
    const cases = [
      { format: 'docx', fileName: '季度报告.docx' },
      { format: 'xlsx', fileName: '经营报表.xlsx' },
      { format: 'csv', fileName: '明细.csv' },
    ] as const;
    const derivedContent = '# 提纯正文\n\n统一由共享布局定位的 Markdown。';
    const derivedKey = 'docs/user_1/doc_1/v3/content.md';

    for (const testCase of cases) {
      const document = buildDocument({
        status: 'ready',
        name: testCase.fileName,
        storageKey: `docs/user_1/doc_1/v3/${testCase.fileName}`,
      });
      const { projection, download } = createProjection({
        chunks: TWO_CHUNKS,
        download: async (key) => {
          if (key === derivedKey) {
            return Buffer.from(derivedContent, 'utf-8');
          }
          if (key === document.storageKey) {
            return Buffer.from('原始二进制不应被读取');
          }
          throw new Error(`未知对象: ${key}`);
        },
      });

      const result = await projection.project(document);

      expect(result.bodySource).toBe('derived');
      expect(result.data.sourceFormat).toBe(testCase.format);
      expect(result.data.renderMode).toBe('markdown');
      expect(result.data.content).toBe(derivedContent);
      expect(result.data.chunkCount).toBe(2);
      expect(result.data).not.toHaveProperty('fileType');
      expect(download).toHaveBeenCalledWith(derivedKey);
      expect(download).not.toHaveBeenCalledWith(document.storageKey);
    }
  });

  it('TC06-3 PDF chunks 与渲染契约', async () => {
    const document = buildDocument({
      status: 'ready',
      name: '技术白皮书.pdf',
      storageKey: 'docs/user_1/doc_pdf/v2/技术白皮书.pdf',
      version: 2,
    });
    const { projection, download, getUrl } = createProjection({
      chunks: PDF_CHUNKS,
      download: async () => {
        throw new Error('PDF 不应读取正文对象');
      },
      getUrl: async () => 'https://storage.example.com/技术白皮书.pdf?token=pdf',
    });

    const result = await projection.project(document);

    expect(result.bodySource).toBe('chunks');
    expect(result.data.sourceFormat).toBe('pdf');
    expect(result.data.renderMode).toBe('pdf-chunks');
    expect(result.data.content).toBe('');
    expect(result.data.chunks).toEqual(PDF_CHUNKS);
    expect(result.data.chunkCount).toBe(2);
    expect(result.data).not.toHaveProperty('fileType');
    expect(result.data.originalUrl).toBe('https://storage.example.com/技术白皮书.pdf?token=pdf');
    expect(getUrl).toHaveBeenCalledWith(document.storageKey, 3600);
    expect(download).not.toHaveBeenCalled();
  });

  it('TC06-4 unknown 仅使用 chunks 且不解码源对象', async () => {
    const document = buildDocument({
      status: 'ready',
      name: '未知归档',
      storageKey: 'docs/user_1/doc_1/v3/归档.bin',
    });
    const { projection, download } = createProjection({
      chunks: TWO_CHUNKS,
      download: async () => Buffer.from('未知对象的字节不应按 UTF-8 解码'),
    });

    const result = await projection.project(document);

    expect(result.bodySource).toBe('chunks');
    expect(result.data.sourceFormat).toBe('unknown');
    expect(result.data.renderMode).toBe('markdown');
    expect(result.data.content).toBe('');
    expect(result.data.chunks).toEqual(TWO_CHUNKS);
    expect(result.data.chunkCount).toBe(2);
    expect(result.data).not.toHaveProperty('fileType');
    expect(download).not.toHaveBeenCalled();
  });

  it('TC06-5 ready URL 快照与外部来源边界', async () => {
    const document = buildDocument({
      status: 'ready',
      name: '网页文章',
      storageKey: 'docs/user_1/url-1730000000000-abc123/v1/content.md',
      sourceType: 'url',
      sourceUrl: 'https://example.com/articles/1',
    });
    const snapshotUrl = 'https://storage.example.com/url-abc/content.md?token=snapshot';
    const { projection, download, getUrl } = createProjection({
      chunks: [],
      download: async (key) => {
        if (key === document.storageKey) {
          return Buffer.from('# 网页正文\n\n来自 Markdown 快照。', 'utf-8');
        }
        throw new Error(`不应读取其他对象: ${key}`);
      },
      getUrl: async () => snapshotUrl,
    });

    const result = await projection.project(document);

    expect(result.bodySource).toBe('stored');
    expect(result.data.sourceFormat).toBe('md');
    expect(result.data.renderMode).toBe('markdown');
    expect(result.data.content).toBe('# 网页正文\n\n来自 Markdown 快照。');
    expect(result.data.originalUrl).toBe(snapshotUrl);
    expect(result.data.sourceUrl).toBe('https://example.com/articles/1');
    expect(result.data.originalUrl).not.toBe(result.data.sourceUrl);
    expect(result.data).not.toHaveProperty('fileType');
    expect(download).toHaveBeenCalledWith(document.storageKey);
    expect(getUrl).toHaveBeenCalledWith(document.storageKey, 3600);
  });

  it('TC06-6 ready Artifact Markdown 快照与来源事实', async () => {
    const document = buildDocument({
      status: 'ready',
      name: '对话产物',
      storageKey: 'docs/user_1/artifact-1730000000000-xyz789/v1/content.md',
      sourceType: 'chat_artifact',
      sourceUrl: null,
    });
    const snapshotUrl = 'https://storage.example.com/artifact-xyz/content.md?token=snapshot';
    const { projection, getUrl } = createProjection({
      chunks: [],
      download: async () => Buffer.from('# 对话产物\n\n来自 Artifact。', 'utf-8'),
      getUrl: async () => snapshotUrl,
    });

    const result = await projection.project(document);

    expect(result.bodySource).toBe('stored');
    expect(result.data.sourceFormat).toBe('md');
    expect(result.data.sourceType).toBe('chat_artifact');
    expect(result.data.sourceUrl).toBeNull();
    expect(result.data.originalUrl).toBe(snapshotUrl);
    expect(result.data).not.toHaveProperty('fileType');
    expect(getUrl).toHaveBeenCalledWith(document.storageKey, 3600);
  });

  it('TC06-7 ready 切片计数以实际 chunks 为准', async () => {
    const document = buildDocument({
      status: 'ready',
      name: '规范.md',
      storageKey: 'docs/user_1/doc_1/v3/规范.md',
      chunkCount: 99,
    });
    const { projection } = createProjection({
      chunks: TWO_CHUNKS,
      download: async () => Buffer.from('# 规范正文', 'utf-8'),
    });

    const result = await projection.project(document);

    expect(result.data.chunkCount).toBe(2);
    expect(result.data.chunks).toHaveLength(2);
  });
});

describe('DocumentPreviewProjection 读取失败与降级', () => {
  it('TC07-1 stored 读取失败回退当前版本 chunks', async () => {
    const document = buildDocument({
      status: 'ready',
      name: '规范.md',
      storageKey: 'docs/user_1/doc_1/v3/规范.md',
    });
    const { projection, download } = createProjection({
      chunks: TWO_CHUNKS,
      download: async () => {
        throw new Error('源资产缺失');
      },
    });

    const result = await projection.project(document);

    expect(result.bodySource).toBe('chunks');
    expect(result.data.content).toBe('');
    expect(result.data.chunks).toEqual(TWO_CHUNKS);
    expect(result.data.chunkCount).toBe(2);
    expect(result.data.renderMode).toBe('markdown');
    expect(result.data).not.toHaveProperty('fileType');
    expect(download).toHaveBeenCalledWith(document.storageKey);
  });

  it('TC07-2 derived 读取失败仅回退 chunks', async () => {
    const cases = [
      { fileName: '季度报告.docx' },
      { fileName: '经营报表.xlsx' },
      { fileName: '明细.csv' },
    ] as const;
    const derivedKey = 'docs/user_1/doc_1/v3/content.md';

    for (const testCase of cases) {
      const document = buildDocument({
        status: 'ready',
        name: testCase.fileName,
        storageKey: `docs/user_1/doc_1/v3/${testCase.fileName}`,
      });
      const { projection, download } = createProjection({
        chunks: TWO_CHUNKS,
        download: async (key) => {
          if (key === derivedKey) {
            throw new Error('提纯件缺失');
          }
          if (key === document.storageKey) {
            return Buffer.from('原始二进制或 CSV 文本不应被回退读取');
          }
          throw new Error(`未知对象: ${key}`);
        },
      });

      const result = await projection.project(document);

      expect(result.bodySource).toBe('chunks');
      expect(result.data.content).toBe('');
      expect(result.data.chunks).toEqual(TWO_CHUNKS);
      expect(result.data.chunkCount).toBe(2);
      expect(result.data).not.toHaveProperty('fileType');
      expect(download).toHaveBeenCalledWith(derivedKey);
      expect(download).not.toHaveBeenCalledWith(document.storageKey);
    }
  });

  it('TC07-3 ready 无正文读取失败矩阵', async () => {
    const cases = [
      {
        name: 'stored',
        storageKey: 'docs/user_1/doc_1/v3/规范.md',
        sourceType: 'file',
        download: async () => {
          throw new Error('源资产缺失');
        },
        expectDownload: true,
      },
      {
        name: 'derived',
        storageKey: 'docs/user_1/doc_1/v3/季度报告.docx',
        sourceType: 'file',
        download: async () => {
          throw new Error('提纯件缺失');
        },
        expectDownload: true,
      },
      {
        name: 'pdf',
        storageKey: 'docs/user_1/doc_1/v3/白皮书.pdf',
        sourceType: 'file',
        download: undefined,
        expectDownload: false,
      },
      {
        name: 'unknown',
        storageKey: 'docs/user_1/doc_1/v3/归档.bin',
        sourceType: 'file',
        download: undefined,
        expectDownload: false,
      },
    ] as const;

    for (const testCase of cases) {
      const document = buildDocument({
        status: 'ready',
        storageKey: testCase.storageKey,
        sourceType: testCase.sourceType,
      });
      const { projection, download } = createProjection({
        chunks: [],
        download: testCase.download,
      });

      const error: unknown = await projection.project(document).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error, testCase.name).toBeInstanceOf(DocumentPreviewReadError);
      expect((error as Error).message, testCase.name).toBe('文档正文读取失败');
      expect(document.status).toBe('ready');
      if (!testCase.expectDownload) {
        expect(download).not.toHaveBeenCalled();
      }
    }
  });

  it('TC07-4 空白正文且无 chunks 不返回 ready 空白', async () => {
    const cases = [
      { fileName: '空白.md', content: '   \n\t  ' },
      { fileName: '空白.docx', content: '\n\n  ' },
    ] as const;

    for (const testCase of cases) {
      const document = buildDocument({
        status: 'ready',
        name: testCase.fileName,
        storageKey: `docs/user_1/doc_1/v3/${testCase.fileName}`,
      });
      const { projection } = createProjection({
        chunks: [],
        download: async () => Buffer.from(testCase.content, 'utf-8'),
      });

      const error: unknown = await projection.project(document).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(DocumentPreviewReadError);
      expect((error as Error).message).toBe('文档正文读取失败');
    }
  });

  it('首选正文 trim 后为空且存在 chunks 时回退切片', async () => {
    const cases = ['空白.md', '空白.docx'] as const;

    for (const fileName of cases) {
      const document = buildDocument({
        status: 'ready',
        name: fileName,
        storageKey: `docs/user_1/doc_1/v3/${fileName}`,
      });
      const { projection } = createProjection({
        chunks: TWO_CHUNKS,
        download: async () => Buffer.from(' \n\t ', 'utf-8'),
      });

      const result = await projection.project(document);

      expect(result.bodySource).toBe('chunks');
      expect(result.data.content).toBe('');
      expect(result.data.chunks).toEqual(TWO_CHUNKS);
    }
  });

  it('TC07-5 签名失败不阻断可用正文', async () => {
    const document = buildDocument({
      status: 'ready',
      name: '规范.md',
      storageKey: 'docs/user_1/doc_1/v3/规范.md',
    });
    const { projection, getUrl } = createProjection({
      chunks: [],
      download: async () => Buffer.from('# 可用正文', 'utf-8'),
      getUrl: async () => {
        throw new Error('签名服务超时');
      },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = await projection.project(document);

      expect(result.bodySource).toBe('stored');
      expect(result.data.content).toBe('# 可用正文');
      expect(result.data.originalUrl).toBeNull();
      expect(result.data.status).toBe('ready');
      expect(document.status).toBe('ready');
      expect(getUrl).toHaveBeenCalledWith(document.storageKey, 3600);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
