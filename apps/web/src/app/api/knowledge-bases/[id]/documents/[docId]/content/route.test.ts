import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'user_1', username: 'testuser' } as { id: string; username: string } | null,
    kbFindUnique: vi.fn(),
    docFindFirst: vi.fn(),
    project: vi.fn(),
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
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@repo/storage', () => ({
  createStorageProvider: vi.fn(() => ({
    download: vi.fn(),
    getUrl: vi.fn(),
  })),
}));

// 路由测试只验证 HTTP 装配；正文矩阵由 DocumentPreviewProjection 测试覆盖
vi.mock('@/lib/rag/document-preview-projection', () => ({
  DocumentPreviewProjection: class {
    project = mocks.project;
  },
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
  });

  it('TC08-1 未登录返回 401', async () => {
    mocks.currentUser = null;

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/content');
    const res = await GET(req, routeContext);

    expect(res.status).toBe(401);
    expect(mocks.project).not.toHaveBeenCalled();
  });

  it('TC08-2 跨租户或不存在知识库返回 404', async () => {
    mocks.kbFindUnique.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_other/documents/doc_1/content');
    const res = await GET(req, {
      params: Promise.resolve({ id: 'kb_other', docId: 'doc_1' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('知识库不存在');
    expect(mocks.project).not.toHaveBeenCalled();
  });

  it('TC08-3 文档不存在软删除或跨租户返回 404', async () => {
    mocks.docFindFirst.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_deleted/content');
    const res = await GET(req, {
      params: Promise.resolve({ id: 'kb_1', docId: 'doc_deleted' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('文档不存在');
    expect(mocks.project).not.toHaveBeenCalled();
  });

  it('TC08-4 成功 DTO 不含 fileType/bodySource', async () => {
    mocks.docFindFirst.mockResolvedValueOnce({
      id: 'doc_1',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      name: '架构规范.md',
      storageKey: 'docs/user_1/doc_1/v1/架构规范.md',
      status: 'ready',
      version: 1,
      chunkCount: 12,
      sourceType: 'file',
      sourceUrl: null,
      errorMessage: null,
      deletedAt: null,
    });
    const projectionData = {
      id: 'doc_1',
      name: '架构规范.md',
      version: 1,
      chunkCount: 2,
      status: 'ready',
      errorMessage: null,
      sourceFormat: 'md',
      renderMode: 'markdown',
      content: '# 架构设计规范',
      chunks: [
        { chunkIndex: 0, content: '第一片', headingPath: '简介', pageNumber: null },
        { chunkIndex: 1, content: '第二片', headingPath: '分层', pageNumber: null },
      ],
      originalUrl: 'https://storage.example.com/架构规范.md?token=abc',
      sourceType: 'file',
      sourceUrl: null,
    };
    mocks.project.mockResolvedValueOnce({ data: projectionData, bodySource: 'stored' });

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/content');
    const res = await GET(req, routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual(projectionData);
    expect(json.data).not.toHaveProperty('fileType');
    expect(json.data).not.toHaveProperty('bodySource');
  });

  it('TC08-5 非 ready 不含 renderMode 且计数为 null', async () => {
    mocks.docFindFirst.mockResolvedValueOnce({
      id: 'doc_failed',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      name: '解析异常.md',
      storageKey: 'docs/user_1/doc_failed/v1/解析异常.md',
      status: 'failed',
      version: 1,
      chunkCount: 12,
      sourceType: 'file',
      sourceUrl: null,
      errorMessage: '文件编码格式异常，无法完成切片',
      deletedAt: null,
    });
    const projectionData = {
      id: 'doc_failed',
      name: '解析异常.md',
      version: 1,
      chunkCount: null,
      status: 'failed',
      errorMessage: '文件编码格式异常，无法完成切片',
      sourceFormat: 'md',
      content: '',
      chunks: [],
      originalUrl: 'https://storage.example.com/解析异常.md?token=abc',
      sourceType: 'file',
      sourceUrl: null,
    };
    mocks.project.mockResolvedValueOnce({ data: projectionData });

    const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_failed/content');
    const res = await GET(req, {
      params: Promise.resolve({ id: 'kb_1', docId: 'doc_failed' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual(projectionData);
    expect(json.data.chunkCount).toBeNull();
    expect(json.data.renderMode).toBeUndefined();
    expect(json.data).not.toHaveProperty('renderMode');
    expect(json.data).not.toHaveProperty('fileType');
    expect(json.data).not.toHaveProperty('bodySource');
  });

  it('TC08-6 投影读取失败映射中文 500', async () => {
    mocks.docFindFirst.mockResolvedValueOnce({
      id: 'doc_1',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      name: '故障文件.md',
      storageKey: 'docs/user_1/doc_1/v1/故障文件.md',
      status: 'ready',
      version: 1,
      chunkCount: 5,
      sourceType: 'file',
      sourceUrl: null,
      errorMessage: null,
      deletedAt: null,
    });
    mocks.project.mockRejectedValueOnce(new Error('文档正文读取失败'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/content');
      const res = await GET(req, routeContext);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain('获取文档内容失败');
      expect(json.data).toBeUndefined();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
