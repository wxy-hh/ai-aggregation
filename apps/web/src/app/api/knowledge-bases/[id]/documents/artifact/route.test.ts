import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  currentUser: { id: 'user_1', username: 'testuser' },
  kbFindUnique: vi.fn(),
  docCount: vi.fn(),
  docCreate: vi.fn(),
  depositService: vi.fn(),
}));

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
      create: mocks.docCreate,
    },
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === 'function') {
        return cb({
          document: { create: mocks.docCreate },
        });
      }
      return Promise.all(cb);
    }),
  },
  insertDocumentChunks: vi.fn(),
}));

vi.mock('@/lib/rag/artifact-deposit-service', () => ({
  depositArtifactToKnowledgeBase: mocks.depositService,
}));

import { POST } from './route';

describe('POST /api/knowledge-bases/[id]/documents/artifact (TC05: 产物即时入库 API)', () => {
  const routeContext = { params: Promise.resolve({ id: 'kb_1' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
    mocks.kbFindUnique.mockResolvedValue({ id: 'kb_1', userId: 'user_1', name: '技术知识库' });
    mocks.docCount.mockResolvedValue(5);
    mocks.depositService.mockResolvedValue({
      document: {
        id: 'doc_123',
        knowledgeBaseId: 'kb_1',
        userId: 'user_1',
        name: '竞品分析报告',
        status: 'ready',
        chunkCount: 3,
        sourceType: 'chat_artifact',
        tags: ['竞品', '调研'],
        metadata: {
          sourceType: 'chat_artifact',
          sourceSessionId: 'sess_1',
          sourceArtifactId: 'art_1',
        },
      },
      chunkCount: 3,
    });
  });

  it('断言 1: 未登录请求返回 HTTP 401', async () => {
    mocks.currentUser = null as any;
    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/artifact', {
      method: 'POST',
      body: JSON.stringify({
        artifactId: 'art_1',
        title: '研报',
        content: '# 测试内容',
        type: 'markdown',
      }),
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(401);
  });

  it('断言 2: 越权访问他人的知识库返回 HTTP 404', async () => {
    mocks.kbFindUnique.mockResolvedValue({ id: 'kb_1', userId: 'user_other', name: '他人知识库' });
    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/artifact', {
      method: 'POST',
      body: JSON.stringify({
        artifactId: 'art_1',
        title: '研报',
        content: '# 测试内容',
        type: 'markdown',
      }),
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(404);
  });

  it('断言 3: 超出 30,000 字符硬限制返回 HTTP 400', async () => {
    const hugeContent = 'a'.repeat(30001);
    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/artifact', {
      method: 'POST',
      body: JSON.stringify({
        artifactId: 'art_1',
        title: '超长产物',
        content: hugeContent,
        type: 'markdown',
      }),
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('30,000');
  });

  it('断言 4: 知识库容量超限 (>=50篇) 返回 HTTP 429', async () => {
    mocks.docCount.mockResolvedValue(50);
    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/artifact', {
      method: 'POST',
      body: JSON.stringify({
        artifactId: 'art_1',
        title: '产物',
        content: '# 正常内容',
        type: 'markdown',
      }),
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(429);
  });

  it('断言 5: 合法请求调用服务成功入库并返回 200 与 ready 状态文档', async () => {
    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/artifact', {
      method: 'POST',
      body: JSON.stringify({
        artifactId: 'art_1',
        title: '竞品分析报告',
        content: '# 竞品分析\n\n详细对比内容...',
        type: 'markdown',
        tags: ['竞品', '调研'],
        sourceSessionId: 'sess_1',
      }),
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ready');
    expect(json.data.sourceType).toBe('chat_artifact');
    expect(mocks.depositService).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        knowledgeBaseId: 'kb_1',
        input: expect.objectContaining({
          artifactId: 'art_1',
          title: '竞品分析报告',
          tags: ['竞品', '调研'],
        }),
      })
    );
  });
});
