import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'user_1', username: 'testuser' },
    kbFindUnique: vi.fn(),
    docCount: vi.fn(),
    chunkCount: vi.fn(),
    docFindUnique: vi.fn(),
    docFindFirst: vi.fn(),
    docFindMany: vi.fn(),
    docCreate: vi.fn(),
    docUpdate: vi.fn(),
    taskFindUnique: vi.fn(),
    taskCreate: vi.fn(),
    storageUpload: vi.fn(),
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
      count: mocks.docCount,
      findUnique: mocks.docFindUnique,
      findFirst: mocks.docFindFirst,
      findMany: mocks.docFindMany,
      create: mocks.docCreate,
      update: mocks.docUpdate,
    },
    documentChunk: {
      count: mocks.chunkCount,
    },
    task: {
      findUnique: mocks.taskFindUnique,
      create: mocks.taskCreate,
    },
    $transaction: vi.fn(async (callback: any) => {
      if (typeof callback === 'function') {
        return callback({
          document: {
            create: mocks.docCreate,
            update: mocks.docUpdate,
          },
          task: {
            create: mocks.taskCreate,
          },
        });
      }
      return Promise.all(callback);
    }),
  },
}));

vi.mock('@repo/storage', () => ({
  createStorageProvider: vi.fn(() => ({
    upload: mocks.storageUpload,
    getUrl: vi.fn(async (key: string) => `http://storage.local/${key}`),
  })),
}));

import { POST, GET } from './route';

describe('POST & GET /api/knowledge-bases/[id]/documents (工单 04 / 文档上传与列表)', () => {
  const routeContext = { params: Promise.resolve({ id: 'kb_1' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
    mocks.kbFindUnique.mockResolvedValue({
      id: 'kb_1',
      userId: 'user_1',
      name: '测试知识库',
    });
    mocks.docCount.mockResolvedValue(0);
    mocks.chunkCount.mockResolvedValue(0);
    mocks.docFindFirst.mockResolvedValue(null);
    mocks.docFindUnique.mockResolvedValue(null);
    mocks.taskFindUnique.mockResolvedValue(null);
    mocks.storageUpload.mockResolvedValue('http://storage.local/uploaded');
  });

  describe('GET /api/knowledge-bases/[id]/documents', () => {
    it('未登录访问返回 401', async () => {
      mocks.currentUser = null as any;

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents');
      const res = await GET(req, routeContext);

      expect(res.status).toBe(401);
    });

    it('跨用户知识库返回 404', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_1',
        userId: 'user_other',
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents');
      const res = await GET(req, routeContext);

      expect(res.status).toBe(404);
    });

    it('返回该知识库下未软删除的文档列表', async () => {
      const mockDocs = [
        {
          id: 'doc_1',
          name: '架构设计.md',
          status: 'ready',
          version: 1,
          chunkCount: 12,
          deletedAt: null,
          createdAt: new Date(),
        },
      ];
      mocks.docFindMany.mockResolvedValueOnce(mockDocs);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents');
      const res = await GET(req, routeContext);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.documents).toHaveLength(1);
      expect(mocks.docFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            knowledgeBaseId: 'kb_1',
            userId: 'user_1',
            deletedAt: null,
          },
        })
      );
    });
  });

  describe('POST /api/knowledge-bases/[id]/documents (上传与版本化)', () => {
    function createMultipartRequest(fileContent: string, fileName: string, fileType: string, extraFields: Record<string, string> = {}) {
      const formData = new FormData();
      const file = new File([fileContent], fileName, { type: fileType });
      formData.append('file', file);

      for (const [key, value] of Object.entries(extraFields)) {
        formData.append(key, value);
      }

      return new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents', {
        method: 'POST',
        body: formData,
      });
    }

    it('未登录用户上传返回 401', async () => {
      mocks.currentUser = null as any;

      const req = createMultipartRequest('hello', 'test.txt', 'text/plain');
      const res = await POST(req, routeContext);

      expect(res.status).toBe(401);
    });

    it('跨用户知识库上传返回 404', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_1',
        userId: 'user_other',
      });

      const req = createMultipartRequest('hello', 'test.txt', 'text/plain');
      const res = await POST(req, routeContext);

      expect(res.status).toBe(404);
      expect(mocks.docCreate).not.toHaveBeenCalled();
      expect(mocks.storageUpload).not.toHaveBeenCalled();
    });

    it('非法文件类型被中文拒绝且 DB/Storage 无残留 (QA-015)', async () => {
      const req = createMultipartRequest('binary-data', 'evil.exe', 'application/x-msdownload');
      const res = await POST(req, routeContext);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('仅支持 PDF、Markdown、TXT');
      expect(mocks.docCreate).not.toHaveBeenCalled();
      expect(mocks.storageUpload).not.toHaveBeenCalled();
    });

    it('超限文件（超过 20MB）被拒绝且 DB 无残留 (QA-015)', async () => {
      const largeFile = new File([new Uint8Array(21 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', largeFile);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents', {
        method: 'POST',
        body: formData,
      });
      const res = await POST(req, routeContext);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('文件大小超过限制');
      expect(mocks.docCreate).not.toHaveBeenCalled();
      expect(mocks.storageUpload).not.toHaveBeenCalled();
    });

    it('单知识库文档数量超过 50 个配额时返回 429 与中文文案 (QA-009)', async () => {
      mocks.docCount.mockResolvedValueOnce(50);

      const req = createMultipartRequest('hello world', 'doc-51.md', 'text/markdown');
      const res = await POST(req, routeContext);

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('知识库文档数量已达上限（最多 50 个）');
      expect(mocks.docCreate).not.toHaveBeenCalled();
    });

    it('用户总切片数量超过 20000 配额时返回 429 与中文文案', async () => {
      mocks.chunkCount.mockResolvedValueOnce(20000);

      const req = createMultipartRequest('hello world', 'doc.txt', 'text/plain');
      const res = await POST(req, routeContext);

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('切片总数已达上限（最多 20000 个）');
      expect(mocks.docCreate).not.toHaveBeenCalled();
    });

    it('合法文档上传成功入库 status=pending 并返回 202，storageKey 包含版本规约', async () => {
      const createdDoc = {
        id: 'doc_100',
        knowledgeBaseId: 'kb_1',
        userId: 'user_1',
        name: '产品设计.pdf',
        storageKey: 'docs/user_1/doc_100/v1/产品设计.pdf',
        status: 'pending',
        version: 1,
        chunkCount: 0,
        errorMessage: null,
      };
      mocks.docCreate.mockResolvedValueOnce(createdDoc);

      const req = createMultipartRequest('pdf-bytes', '产品设计.pdf', 'application/pdf');
      const res = await POST(req, routeContext);

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.document.status).toBe('pending');
      expect(body.data.document.version).toBe(1);

      // 验证 storage key 符合规范 docs/{userId}/{documentId}/v{version}/{filename}
      expect(mocks.storageUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^docs\/user_1\/[^/]+\/v1\/产品设计\.pdf$/),
        expect.any(Buffer),
        'application/pdf'
      );
      expect(mocks.docCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            knowledgeBaseId: 'kb_1',
            userId: 'user_1',
            name: '产品设计.pdf',
            status: 'pending',
            version: 1,
          }),
        })
      );
    });

    it('相同 requestId 重传不产生第二行文档 (幂等保护)', async () => {
      const existingDoc = {
        id: 'doc_existing',
        knowledgeBaseId: 'kb_1',
        userId: 'user_1',
        name: 'manual.txt',
        storageKey: 'docs/user_1/doc_existing/v1/manual.txt',
        status: 'pending',
        version: 1,
      };
      // 模拟已有针对该 requestId 的 Task
      mocks.taskFindUnique.mockResolvedValueOnce({
        id: 'task_1',
        userId: 'user_1',
        requestId: 'req-dup-1',
        output: { documentId: 'doc_existing' },
      });
      mocks.docFindUnique.mockResolvedValueOnce(existingDoc);

      const req = createMultipartRequest('content', 'manual.txt', 'text/plain', {
        requestId: 'req-dup-1',
      });
      const res = await POST(req, routeContext);

      // 返回 202 或 200，并返回已有文档
      expect([200, 202]).toContain(res.status);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.document.id).toBe('doc_existing');
      // 绝对不调用 docCreate 或 storageUpload
      expect(mocks.docCreate).not.toHaveBeenCalled();
      expect(mocks.storageUpload).not.toHaveBeenCalled();
    });

    it('重新上传同名文档时 version+1 并更新为 pending', async () => {
      // 知识库中已有同名文档版本 1
      const existingDoc = {
        id: 'doc_v1',
        knowledgeBaseId: 'kb_1',
        userId: 'user_1',
        name: 'readme.md',
        storageKey: 'docs/user_1/doc_v1/v1/readme.md',
        status: 'ready',
        version: 1,
        deletedAt: null,
      };
      mocks.docFindFirst.mockResolvedValueOnce(existingDoc);

      const updatedDoc = {
        ...existingDoc,
        version: 2,
        status: 'pending',
        storageKey: 'docs/user_1/doc_v1/v2/readme.md',
      };
      mocks.docUpdate.mockResolvedValueOnce(updatedDoc);

      const req = createMultipartRequest('# Version 2', 'readme.md', 'text/markdown');
      const res = await POST(req, routeContext);

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.data.document.version).toBe(2);
      expect(body.data.document.status).toBe('pending');

      // 验证 storage key 中的版本为 v2
      expect(mocks.storageUpload).toHaveBeenCalledWith(
        'docs/user_1/doc_v1/v2/readme.md',
        expect.any(Buffer),
        'text/markdown'
      );
      // 验证更新了已有记录而非新增记录
      expect(mocks.docUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc_v1' },
          data: expect.objectContaining({
            version: 2,
            status: 'pending',
          }),
        })
      );
      expect(mocks.docCreate).not.toHaveBeenCalled();
    });
  });
});
