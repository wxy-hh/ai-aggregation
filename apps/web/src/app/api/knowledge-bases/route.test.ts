import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'user_1', username: 'testuser' },
    kbCount: vi.fn(),
    kbFindMany: vi.fn(),
    kbCreate: vi.fn(),
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
      count: mocks.kbCount,
      findMany: mocks.kbFindMany,
      create: mocks.kbCreate,
    },
  },
}));

import { GET, POST } from './route';

describe('GET & POST /api/knowledge-bases (工单 04 / 知识库列表与创建)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
  });

  describe('GET /api/knowledge-bases', () => {
    it('未登录用户访问返回 401', async () => {
      mocks.currentUser = null as any;

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases');
      const res = await GET(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('未授权');
    });

    it('已登录用户返回当前用户的知识库列表及文档统计', async () => {
      const mockList = [
        {
          id: 'kb_1',
          userId: 'user_1',
          name: '产品文档库',
          description: '用于产品 PRD 检索',
          status: 'active',
          createdAt: new Date('2026-10-20T10:00:00Z'),
          updatedAt: new Date('2026-10-20T10:00:00Z'),
          _count: { documents: 3 },
        },
      ];
      mocks.kbFindMany.mockResolvedValueOnce(mockList);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.knowledgeBases).toHaveLength(1);
      expect(body.data.knowledgeBases[0].id).toBe('kb_1');
      expect(body.data.knowledgeBases[0].documentCount).toBe(3);
      expect(mocks.kbFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user_1' },
        })
      );
    });
  });

  describe('POST /api/knowledge-bases', () => {
    it('未登录用户创建知识库返回 401', async () => {
      mocks.currentUser = null as any;

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '新知识库' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
    });

    it('请求体缺少名称或名称为空时返回 400', async () => {
      const req = new NextRequest('http://localhost:3030/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '   ' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('名称');
    });

    it('超出容量配额（已有 5 个知识库时）返回 429 与中文配额文案 (QA-009)', async () => {
      // 模拟当前用户已有 5 个知识库
      mocks.kbCount.mockResolvedValueOnce(5);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '第 6 个知识库' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('知识库数量已达上限（最多 5 个）');
      expect(mocks.kbCreate).not.toHaveBeenCalled();
    });

    it('配额未满时成功创建知识库并返回 201', async () => {
      mocks.kbCount.mockResolvedValueOnce(2);
      const createdKb = {
        id: 'kb_new',
        userId: 'user_1',
        name: '研发技术规范',
        description: '后端架构指南',
        status: 'active',
        createdAt: new Date('2026-10-23T12:00:00Z'),
        updatedAt: new Date('2026-10-23T12:00:00Z'),
      };
      mocks.kbCreate.mockResolvedValueOnce(createdKb);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '研发技术规范', description: '后端架构指南' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.knowledgeBase.name).toBe('研发技术规范');
      expect(mocks.kbCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user_1',
          name: '研发技术规范',
          description: '后端架构指南',
          status: 'active',
        },
      });
    });
  });
});
