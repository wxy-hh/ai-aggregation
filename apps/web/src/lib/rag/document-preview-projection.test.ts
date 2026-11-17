import { describe, expect, it, vi } from 'vitest';
import {
  DocumentPreviewProjection,
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

/** 用存储与切片替身记录是否发生正文读取或切片查询 */
function createProjection() {
  const getUrl = vi.fn(async () => 'https://storage.example.com/original.docx?token=abc');
  const download = vi.fn(async () => Buffer.from('不应被读取的正文'));
  const loadCurrentVersionChunks = vi.fn(async () => [
    {
      chunkIndex: 0,
      content: '不应被读取的切片',
      headingPath: null,
      pageNumber: null,
    },
  ]);

  const projection = new DocumentPreviewProjection({
    getStorage: () => ({ getUrl, download }),
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

      expect(result.sourceFormat).toBe('docx');
      expect(result.data.status).toBe(status);
      expect(result.data.content).toBe('');
      expect(result.data.chunks).toEqual([]);
      expect(result.data.chunkCount).toBeNull();
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

    expect(result.sourceFormat).toBe('docx');
    expect(result.data.status).toBe('failed');
    expect(result.data.errorMessage).toBe('DOCX 文件结构损坏，无法完成解析');
    expect(result.data.fileType).toBe('docx');
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
      expect(result.data.fileType).toBe('docx');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
