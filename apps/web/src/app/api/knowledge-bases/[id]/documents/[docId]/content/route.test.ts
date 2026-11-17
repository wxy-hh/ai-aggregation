import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'user_1', username: 'testuser' },
    kbFindUnique: vi.fn(),
    docFindFirst: vi.fn(),
    chunkFindMany: vi.fn(),
    storageDownload: vi.fn(),
    storageGetUrl: vi.fn(),
  };
});

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(async () => {
    if (!mocks.currentUser) {
      const { AuthError } = await import('@/lib/auth/errors');
      throw new AuthError('未授权访问', 'UNAUTHORIZED');
    }
    return mocks.currentUser;
  }),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    knowledgeBase: {
      findUnique: mocks.kbFindUnique,
    },
    document: {
      findFirst: mocks.docFindFirst,
    },
    documentChunk: {
      findMany: mocks.chunkFindMany,
    },
  },
}));

vi.mock('@repo/storage', () => ({
  createStorageProvider: vi.fn(() => ({
    download: mocks.storageDownload,
    getUrl: mocks.storageGetUrl,
  })),
}));

import { GET } from './route';

describe('GET /api/knowledge-bases/[id]/documents/[docId]/content (只读文档内容与租户隔离)', () => {
  const routeContext = {
    params: Promise.resolve({ id: 'kb_1', docId: 'doc_1' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
    mocks.kbFindUnique.mockResolvedValue({ id: 'kb_1', userId: 'user_1' });
    mocks.chunkFindMany.mockResolvedValue([]);
  });

  it('未登录访问返回 401', async () => {
    mocks.currentUser = null as any;

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/content');
    const res = await GET(req, routeContext);

    expect(res.status).toBe(401);
  });

  it('跨租户或不存在知识库统一返回 404', async () => {
    mocks.kbFindUnique.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_other/documents/doc_1/content');
    const res = await GET(req, {
      params: Promise.resolve({ id: 'kb_other', docId: 'doc_1' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('知识库不存在');
  });

  it('文档不存在、已软删除或不属于当前用户时返回 404', async () => {
    mocks.docFindFirst.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_deleted/content');
    const res = await GET(req, {
      params: Promise.resolve({ id: 'kb_1', docId: 'doc_deleted' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('文档不存在');
  });

  it('正常获取 Markdown 文档内容，从存储提供者读取 UTF-8 纯文本', async () => {
    const mockDoc = {
      id: 'doc_1',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      name: '架构规范.md',
      storageKey: 'docs/user_1/doc_1/v1/架构规范.md',
      status: 'ready',
      version: 1,
      chunkCount: 12,
      deletedAt: null,
    };
    mocks.docFindFirst.mockResolvedValueOnce(mockDoc);
    const mdContent = '# 架构设计规范\n\n## 1. 简介\n\n本规范定义了服务分层与数据隔离原则。';
    mocks.storageDownload.mockResolvedValueOnce(Buffer.from(mdContent, 'utf-8'));

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/content');
    const res = await GET(req, routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.content).toBe(mdContent);
    expect(json.data.fileType).toBe('markdown');
    expect(json.data.name).toBe('架构规范.md');
    expect(json.data.version).toBe(1);
    expect(json.data.chunkCount).toBe(12);
    expect(json.data.status).toBe('ready');
  });

  it('针对失败（failed）状态文档：返回结构化失败状态与原因面板数据，不抛出 500 (US-12)', async () => {
    const mockDoc = {
      id: 'doc_failed',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      name: '解析异常.md',
      storageKey: 'docs/user_1/doc_failed/v1/解析异常.md',
      status: 'failed',
      errorMessage: '文件编码格式异常，无法完成切片',
      version: 1,
      chunkCount: 0,
      sourceType: 'file',
      sourceUrl: null,
      deletedAt: null,
    };
    mocks.docFindFirst.mockResolvedValueOnce(mockDoc);
    mocks.storageGetUrl.mockResolvedValueOnce('https://storage.example.com/failed.md?token=abc');

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_failed/content');
    const res = await GET(req, {
      params: Promise.resolve({ id: 'kb_1', docId: 'doc_failed' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('failed');
    expect(json.data.errorMessage).toBe('文件编码格式异常，无法完成切片');
    expect(json.data.content).toBe('');
    expect(json.data.chunks).toEqual([]);
    expect(json.data.chunkCount).toBeNull();
    expect(json.data.originalUrl).toBe('https://storage.example.com/failed.md?token=abc');
  });

  it('针对 PDF 文档：聚合切片结构化文本并附带带签名的原版临时下载 URL', async () => {
    const mockDoc = {
      id: 'doc_pdf',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      name: '技术白皮书.pdf',
      storageKey: 'docs/user_1/doc_pdf/v1/技术白皮书.pdf',
      status: 'ready',
      version: 2,
      chunkCount: 2,
      deletedAt: null,
    };
    mocks.docFindFirst.mockResolvedValueOnce(mockDoc);
    mocks.chunkFindMany.mockResolvedValueOnce([
      {
        chunkIndex: 0,
        content: '第一章：概述\n这是技术白皮书第一部分。',
        headingPath: '第一章 概述',
        pageNumber: 1,
      },
      {
        chunkIndex: 1,
        content: '第二章：核心架构\n这是技术白皮书第二部分。',
        headingPath: '第二章 核心架构',
        pageNumber: 3,
      },
    ]);
    mocks.storageGetUrl.mockResolvedValueOnce('https://storage.example.com/docs/technical.pdf?token=abc');

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_pdf/content');
    const res = await GET(req, {
      params: Promise.resolve({ id: 'kb_1', docId: 'doc_pdf' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.fileType).toBe('pdf');
    expect(json.data.originalUrl).toBe('https://storage.example.com/docs/technical.pdf?token=abc');
    expect(json.data.chunks).toHaveLength(2);
    expect(json.data.content).toContain('第一章：概述');
  });

  it('存储层发生异常时优雅降级为 500 并返回中文错误', async () => {
    const mockDoc = {
      id: 'doc_1',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      name: '故障文件.md',
      storageKey: 'docs/user_1/doc_1/v1/故障文件.md',
      status: 'ready',
      version: 1,
      chunkCount: 5,
      deletedAt: null,
    };
    mocks.docFindFirst.mockResolvedValueOnce(mockDoc);
    mocks.storageDownload.mockRejectedValueOnce(new Error('S3 Connection Timeout'));

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/content');
    const res = await GET(req, routeContext);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('获取文档内容失败');
  });
});
