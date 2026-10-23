import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'user_1', username: 'testuser' } as { id: string; username: string } | null,
    kbFindUnique: vi.fn(),
    hybridRetrieval: vi.fn(),
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
  },
}));

vi.mock('@/lib/rag/hybrid-retrieval', () => ({
  hybridRetrieval: mocks.hybridRetrieval,
}));

import { POST } from './route';

describe('POST /api/knowledge-bases/[id]/query 检索调试接口测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
    mocks.kbFindUnique.mockResolvedValue({
      id: 'kb_1',
      userId: 'user_1',
      name: '研发知识库',
    });
    mocks.hybridRetrieval.mockResolvedValue({
      query: '连败熔断',
      preparedLexicalQuery: '连败 熔断',
      topK: 20,
      chunks: [
        {
          chunkId: 'chk_1',
          documentId: 'doc_1',
          documentName: 'adr.md',
          documentVersion: 1,
          content: '连败熔断机制详情',
          score: 0.032,
          denseRank: 1,
          lexicalRank: 1,
          citationAnchor: {
            documentId: 'doc_1',
            documentName: 'adr.md',
            documentVersion: 1,
            pageNumber: 1,
            headingPath: 'ADR-0008',
            chunkIndex: 0,
          },
        },
      ],
      denseMatches: [
        {
          id: 'chk_1',
          rank: 1,
          similarity: 0.92,
          content: '连败熔断机制详情',
          documentName: 'adr.md',
        },
      ],
      lexicalMatches: [
        {
          id: 'chk_1',
          rank: 1,
          rankScore: 0.38,
          content: '连败熔断机制详情',
          documentName: 'adr.md',
        },
      ],
      durationMs: 45,
      stats: {
        embeddingDurationMs: 15,
        denseDurationMs: 12,
        lexicalDurationMs: 10,
        fusionDurationMs: 1,
        totalDurationMs: 45,
      },
    });
  });

  it('1. 未登录时返回 401', async () => {
    mocks.currentUser = null;

    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/query', {
      method: 'POST',
      body: JSON.stringify({ query: '测试' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'kb_1' }) });
    expect(res.status).toBe(401);
  });

  it('2. 知识库不存在或非当前用户所有时返回 404', async () => {
    mocks.kbFindUnique.mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_not_exist/query', {
      method: 'POST',
      body: JSON.stringify({ query: '测试' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'kb_not_exist' }) });
    expect(res.status).toBe(404);

    // 存在但属主不匹配
    mocks.kbFindUnique.mockResolvedValue({ id: 'kb_other', userId: 'user_other' });
    const resOther = await POST(req, { params: Promise.resolve({ id: 'kb_other' }) });
    expect(resOther.status).toBe(404);
  });

  it('3. 请求体参数不合法返回 400', async () => {
    // 3.1 非法 JSON
    const reqInvalidJson = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/query', {
      method: 'POST',
      body: 'invalid-json-body',
    });
    const res1 = await POST(reqInvalidJson, { params: Promise.resolve({ id: 'kb_1' }) });
    expect(res1.status).toBe(400);

    // 3.2 空 query
    const reqEmptyQuery = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/query', {
      method: 'POST',
      body: JSON.stringify({ query: '   ' }),
    });
    const res2 = await POST(reqEmptyQuery, { params: Promise.resolve({ id: 'kb_1' }) });
    expect(res2.status).toBe(400);

    // 3.3 超出 topK 范围
    const reqInvalidTopK = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/query', {
      method: 'POST',
      body: JSON.stringify({ query: '测试', topK: 100 }),
    });
    const res3 = await POST(reqInvalidTopK, { params: Promise.resolve({ id: 'kb_1' }) });
    expect(res3.status).toBe(400);
  });

  it('4. 正常检索请求：返回 200 与混合检索明细数据', async () => {
    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/query', {
      method: 'POST',
      body: JSON.stringify({ query: '连败熔断', topK: 10 }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'kb_1' }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.query).toBe('连败熔断');
    expect(data.data.chunks.length).toBe(1);
    expect(data.data.denseMatches.length).toBe(1);
    expect(data.data.lexicalMatches.length).toBe(1);
    expect(data.data.stats).toBeDefined();

    expect(mocks.hybridRetrieval).toHaveBeenCalledWith({
      userId: 'user_1',
      knowledgeBaseId: 'kb_1',
      query: '连败熔断',
      topK: 10,
    });
  });

  it('5. 检索底层抛出未知异常返回 500', async () => {
    mocks.hybridRetrieval.mockRejectedValue(new Error('Embedding API 超时'));

    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/query', {
      method: 'POST',
      body: JSON.stringify({ query: '连败熔断' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'kb_1' }) });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('异常');
  });
});
