import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildUrlStorageKey } from '@repo/shared';

const mocks = vi.hoisted(() => ({
  currentUser: { id: 'user_1', username: 'testuser' },
  kbFindUnique: vi.fn(),
  docCount: vi.fn(),
  docCreate: vi.fn(),
  queueAdd: vi.fn(),
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
    $transaction: vi.fn(async (callback: any) => {
      if (typeof callback === 'function') {
        return callback({
          document: {
            create: mocks.docCreate,
          },
        });
      }
      return Promise.all(callback);
    }),
  },
}));

vi.mock('@repo/queue', () => ({
  ragIndexQueue: {
    add: mocks.queueAdd,
  },
  JOB_NAMES: {
    RAG_INDEX: 'rag-index',
  },
}));

import { POST } from './route';

describe('POST /api/knowledge-bases/[id]/documents/url (TC04: 外链批量录入 API)', () => {
  const routeContext = { params: Promise.resolve({ id: 'kb_1' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
    mocks.kbFindUnique.mockResolvedValue({ id: 'kb_1', userId: 'user_1', name: '技术知识库' });
    mocks.docCount.mockResolvedValue(10);
    mocks.docCreate.mockImplementation(async ({ data }: any) => ({
      id: `doc_${Math.random().toString(36).slice(2, 8)}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it('断言 1: 未登录返回 401，非本人知识库返回 404', async () => {
    // 1. 未登录
    mocks.currentUser = null as any;
    const req1 = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/url', {
      method: 'POST',
      body: JSON.stringify({ urls: ['https://example.com/1'] }),
    });
    const res1 = await POST(req1, routeContext);
    expect(res1.status).toBe(401);

    // 2. 知识库不存在或属于他人
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
    mocks.kbFindUnique.mockResolvedValue(null);
    const req2 = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/url', {
      method: 'POST',
      body: JSON.stringify({ urls: ['https://example.com/1'] }),
    });
    const res2 = await POST(req2, routeContext);
    expect(res2.status).toBe(404);
  });

  it('断言 2: 提交空数组、超过 10 个 URL 或包含内网 IP 的 URL 时返回 400 校验错误', async () => {
    // 空数组
    const reqEmpty = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/url', {
      method: 'POST',
      body: JSON.stringify({ urls: [] }),
    });
    const resEmpty = await POST(reqEmpty, routeContext);
    expect(resEmpty.status).toBe(400);
    const jsonEmpty = await resEmpty.json();
    expect(jsonEmpty.error).toContain('至少提供一个');

    // 超过 10 个
    const urls11 = Array.from({ length: 11 }, (_, i) => `https://example.com/page-${i}`);
    const reqOver = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/url', {
      method: 'POST',
      body: JSON.stringify({ urls: urls11 }),
    });
    const resOver = await POST(reqOver, routeContext);
    expect(resOver.status).toBe(400);
    const jsonOver = await resOver.json();
    expect(jsonOver.error).toContain('最多允许导入 10 个');

    // 包含内网 IP
    const reqSsrf = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/url', {
      method: 'POST',
      body: JSON.stringify({ urls: ['https://example.com/valid', 'http://127.0.0.1:8080/admin'] }),
    });
    const resSsrf = await POST(reqSsrf, routeContext);
    expect(resSsrf.status).toBe(400);
    const jsonSsrf = await resSsrf.json();
    expect(jsonSsrf.error).toContain('内部私有网络');
  });

  it('断言 3: 当知识库已有文档数加上新增 URL 数量超过 50 篇时，返回 429 配额错误', async () => {
    mocks.docCount.mockResolvedValue(48); // 已有 48 篇
    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/url', {
      method: 'POST',
      body: JSON.stringify({
        urls: [
          'https://example.com/1',
          'https://example.com/2',
          'https://example.com/3', // 总计 48 + 3 = 51 > 50
        ],
      }),
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain('上限');
  });

  it('断言 4: 提交合法的 1~10 个外网 URL 时返回 202 Accepted，DB 插入且入队', async () => {
    mocks.docCount.mockResolvedValue(10);
    const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/url', {
      method: 'POST',
      body: JSON.stringify({
        urls: [
          'https://mp.weixin.qq.com/s/article_abc',
          'https://example.com/blog/arch',
        ],
      }),
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.documents.length).toBe(2);

    // 数据库插入断言
    expect(mocks.docCreate).toHaveBeenCalledTimes(2);
    expect(mocks.docCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          knowledgeBaseId: 'kb_1',
          userId: 'user_1',
          sourceType: 'url',
          status: 'pending',
        }),
      })
    );

    // 队列投递断言
    expect(mocks.queueAdd).toHaveBeenCalledTimes(2);
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      'rag-index',
      expect.objectContaining({
        knowledgeBaseId: 'kb_1',
        userId: 'user_1',
        sourceType: 'url',
      }),
      expect.any(Object)
    );
  });

  it('TC04-2 URL 导入使用共享 URL key 构造', async () => {
    // 固定调用方产生的时间与随机事实，让期望值来自共享构造器而非字符串模板
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1760000000000);
    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.123456789)
      .mockReturnValueOnce(0.987654321);
    // 主表创建回显传入事实，避免替身自身消耗随机序列
    mocks.docCreate.mockImplementation(async ({ data }: any) => ({ ...data }));

    try {
      const req = new NextRequest('http://localhost:3000/api/knowledge-bases/kb_1/documents/url', {
        method: 'POST',
        body: JSON.stringify({
          urls: ['https://example.com/arch', 'https://example.com/blog'],
        }),
      });
      const res = await POST(req, routeContext);
      expect(res.status).toBe(202);

      const expectedKeys = [
        buildUrlStorageKey({
          userId: 'user_1',
          timestamp: 1760000000000,
          randomToken: '4fzzzxjy',
        }),
        buildUrlStorageKey({
          userId: 'user_1',
          timestamp: 1760000000000,
          randomToken: 'zk00000y',
        }),
      ];

      // 主表持久化 key 与共享 URL 构造器输出完全一致
      const persistedKeys = mocks.docCreate.mock.calls.map(([arg]: any[]) => arg.data.storageKey);
      expect(persistedKeys).toEqual(expectedKeys);

      // 队列载荷沿用同一持久化 key，不另行拼装
      const queuedKeys = mocks.queueAdd.mock.calls.map(([, job]: any[]) => job.storageKey);
      expect(queuedKeys).toEqual(expectedKeys);
    } finally {
      nowSpy.mockRestore();
      randomSpy.mockRestore();
    }
  });
});
