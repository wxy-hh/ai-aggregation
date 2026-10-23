import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'user_1', username: 'testuser' },
    docFindFirst: vi.fn(),
    docUpdate: vi.fn(),
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
    document: {
      findFirst: mocks.docFindFirst,
      update: mocks.docUpdate,
    },
  },
}));

import { GET, DELETE } from './route';

describe('GET & DELETE /api/knowledge-bases/[id]/documents/[docId] (单文档状态轮询与软删除)', () => {
  const routeContext = {
    params: Promise.resolve({ id: 'kb_1', docId: 'doc_1' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
  });

  describe('GET /api/knowledge-bases/[id]/documents/[docId]', () => {
    it('未登录访问返回 401', async () => {
      mocks.currentUser = null as any;

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1');
      const res = await GET(req, routeContext);

      expect(res.status).toBe(401);
    });

    it('跨用户或不存在文档返回 404', async () => {
      mocks.docFindFirst.mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_other');
      const res = await GET(req, {
        params: Promise.resolve({ id: 'kb_1', docId: 'doc_other' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('文档不存在');
    });

    it('正常轮询获取文档状态 (pending/processing/ready/failed)', async () => {
      const mockDoc = {
        id: 'doc_1',
        knowledgeBaseId: 'kb_1',
        userId: 'user_1',
        name: '产品规划.pdf',
        storageKey: 'docs/user_1/doc_1/v1/产品规划.pdf',
        status: 'pending',
        version: 1,
        chunkCount: 0,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mocks.docFindFirst.mockResolvedValueOnce(mockDoc);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1');
      const res = await GET(req, routeContext);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.document.status).toBe('pending');
      expect(body.data.document.version).toBe(1);
      expect(mocks.docFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'doc_1',
          knowledgeBaseId: 'kb_1',
          userId: 'user_1',
          deletedAt: null,
        },
      });
    });
  });

  describe('DELETE /api/knowledge-bases/[id]/documents/[docId]', () => {
    it('未登录用户删除返回 401', async () => {
      mocks.currentUser = null as any;

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1', {
        method: 'DELETE',
      });
      const res = await DELETE(req, routeContext);

      expect(res.status).toBe(401);
    });

    it('跨用户删除他人文档返回 404', async () => {
      mocks.docFindFirst.mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_other', {
        method: 'DELETE',
      });
      const res = await DELETE(req, {
        params: Promise.resolve({ id: 'kb_1', docId: 'doc_other' }),
      });

      expect(res.status).toBe(404);
      expect(mocks.docUpdate).not.toHaveBeenCalled();
    });

    it('正常软删除文档（标记 deletedAt 而非物理删除）', async () => {
      mocks.docFindFirst.mockResolvedValueOnce({
        id: 'doc_1',
        knowledgeBaseId: 'kb_1',
        userId: 'user_1',
        deletedAt: null,
      });
      mocks.docUpdate.mockResolvedValueOnce({
        id: 'doc_1',
        deletedAt: new Date(),
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1', {
        method: 'DELETE',
      });
      const res = await DELETE(req, routeContext);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mocks.docUpdate).toHaveBeenCalledWith({
        where: { id: 'doc_1' },
        data: {
          deletedAt: expect.any(Date),
        },
      });
    });
  });
});
