import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'user_1', username: 'testuser' },
    kbFindUnique: vi.fn(),
    kbUpdate: vi.fn(),
    kbDelete: vi.fn(),
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
      update: mocks.kbUpdate,
      delete: mocks.kbDelete,
    },
  },
}));

import { GET, PATCH, DELETE } from './route';

describe('GET, PATCH & DELETE /api/knowledge-bases/[id] (知识库详情、重命名与归档)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
  });

  describe('GET /api/knowledge-bases/[id]', () => {
    it('未登录用户返回 401', async () => {
      mocks.currentUser = null as any;

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1');
      const res = await GET(req, { params: Promise.resolve({ id: 'kb_1' }) });

      expect(res.status).toBe(401);
    });

    it('知识库不存在返回 404', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_not_exist');
      const res = await GET(req, { params: Promise.resolve({ id: 'kb_not_exist' }) });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('不存在');
    });

    it('跨用户访问他人知识库返回 404 越权保护', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_other',
        userId: 'user_other',
        name: '他人私有库',
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_other');
      const res = await GET(req, { params: Promise.resolve({ id: 'kb_other' }) });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('不存在');
    });

    it('正常获取知识库详情与文档计数', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_1',
        userId: 'user_1',
        name: '我的知识库',
        description: '测试描述',
        status: 'active',
        createdAt: new Date('2026-10-20'),
        updatedAt: new Date('2026-10-20'),
        _count: { documents: 2 },
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1');
      const res = await GET(req, { params: Promise.resolve({ id: 'kb_1' }) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.knowledgeBase.name).toBe('我的知识库');
      expect(body.data.knowledgeBase.documentCount).toBe(2);
    });
  });

  describe('PATCH /api/knowledge-bases/[id]', () => {
    it('跨用户更新他人知识库返回 404', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_other',
        userId: 'user_other',
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_other', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '改名' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'kb_other' }) });

      expect(res.status).toBe(404);
      expect(mocks.kbUpdate).not.toHaveBeenCalled();
    });

    it('支持重命名与更新描述', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_1',
        userId: 'user_1',
        name: '原名称',
      });
      mocks.kbUpdate.mockResolvedValueOnce({
        id: 'kb_1',
        userId: 'user_1',
        name: '新名称',
        description: '新描述',
        status: 'active',
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '新名称', description: '新描述' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'kb_1' }) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.knowledgeBase.name).toBe('新名称');
      expect(mocks.kbUpdate).toHaveBeenCalledWith({
        where: { id: 'kb_1' },
        data: { name: '新名称', description: '新描述' },
      });
    });

    it('支持将知识库归档 (status=archived)', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_1',
        userId: 'user_1',
        status: 'active',
      });
      mocks.kbUpdate.mockResolvedValueOnce({
        id: 'kb_1',
        userId: 'user_1',
        status: 'archived',
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'kb_1' }) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.knowledgeBase.status).toBe('archived');
      expect(mocks.kbUpdate).toHaveBeenCalledWith({
        where: { id: 'kb_1' },
        data: { status: 'archived' },
      });
    });
  });

  describe('DELETE /api/knowledge-bases/[id]', () => {
    it('跨用户删除他人知识库返回 404', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_other',
        userId: 'user_other',
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_other', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'kb_other' }) });

      expect(res.status).toBe(404);
      expect(mocks.kbDelete).not.toHaveBeenCalled();
    });

    it('正常删除属于自己的知识库', async () => {
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_1',
        userId: 'user_1',
      });
      mocks.kbDelete.mockResolvedValueOnce({ id: 'kb_1' });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1', {
        method: 'DELETE',
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'kb_1' }) });

      expect(res.status).toBe(200);
      expect(mocks.kbDelete).toHaveBeenCalledWith({
        where: { id: 'kb_1' },
      });
    });
  });
});
