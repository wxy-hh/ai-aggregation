import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'user_1', username: 'testuser' },
    kbFindUnique: vi.fn(),
    insertFaq: vi.fn(),
    updateFaq: vi.fn(),
    deleteFaq: vi.fn(),
    toggleFaq: vi.fn(),
    getFaqs: vi.fn(),
    embedText: vi.fn().mockResolvedValue(new Array(1024).fill(0)),
    segmentText: vi.fn().mockReturnValue('分 词'),
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
  insertFaqWithQuestions: mocks.insertFaq,
  updateFaqWithQuestions: mocks.updateFaq,
  deleteFaq: mocks.deleteFaq,
  toggleFaqStatus: mocks.toggleFaq,
  getFaqsByKnowledgeBase: mocks.getFaqs,
}));

vi.mock('@/lib/rag/faq-service', () => ({
  embedFaqText: mocks.embedText,
  segmentFaqText: mocks.segmentText,
}));

import { GET as getFaqsList, POST as createFaq } from '../route';
import { PUT as updateFaq, DELETE as deleteFaqRoute } from '../[faqId]/route';
import { PATCH as toggleFaqRoute } from '../[faqId]/toggle/route';

describe('FAQ 管理 API 路由契约与权限测试 (TC08 / ADR-0027)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
    mocks.kbFindUnique.mockResolvedValue({
      id: 'kb_1',
      userId: 'user_1',
      name: '研发知识库',
      status: 'active',
    });
  });

  describe('GET /api/knowledge-bases/[id]/faqs', () => {
    it('TC08-1: 未携带合法登录凭证请求时返回 401 Unauthorized', async () => {
      mocks.currentUser = null as any;

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/faqs');
      const res = await getFaqsList(req, { params: Promise.resolve({ id: 'kb_1' }) });

      expect(res.status).toBe(401);
    });

    it('TC08-2: 用户尝试操作不属于自己的知识库时返回 404/403 越权拦截', async () => {
      // 模拟知识库归属于其他用户
      mocks.kbFindUnique.mockResolvedValueOnce({
        id: 'kb_other',
        userId: 'user_other',
        name: '他人私有库',
        status: 'active',
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_other/faqs');
      const res = await getFaqsList(req, { params: Promise.resolve({ id: 'kb_other' }) });

      expect([403, 404]).toContain(res.status);
    });

    it('合法用户可正常获取 FAQ 列表', async () => {
      mocks.getFaqs.mockResolvedValueOnce([
        {
          id: 'faq_1',
          question: '如何报销差旅？',
          answer: '进入财务系统填写报销单。',
          similarQuestions: ['差旅报销流程'],
          enabled: true,
          hitCount: 5,
        },
      ]);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/faqs?page=1&pageSize=10');
      const res = await getFaqsList(req, { params: Promise.resolve({ id: 'kb_1' }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.faqs).toHaveLength(1);
      expect(json.data.faqs[0].question).toBe('如何报销差旅？');
    });
  });

  describe('POST /api/knowledge-bases/[id]/faqs', () => {
    it('TC08-3: 创建 FAQ 时若标准问题为空或超过 500 字符返回 400 Bad Request', async () => {
      // 空问题
      const reqEmpty = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '', answer: '有效答案' }),
      });
      const resEmpty = await createFaq(reqEmpty, { params: Promise.resolve({ id: 'kb_1' }) });
      expect(resEmpty.status).toBe(400);

      // 超长问题
      const reqTooLong = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '超长'.repeat(300), answer: '有效答案' }),
      });
      const resTooLong = await createFaq(reqTooLong, { params: Promise.resolve({ id: 'kb_1' }) });
      expect(resTooLong.status).toBe(400);
    });

    it('合法参数成功创建 FAQ 并返回 201', async () => {
      mocks.insertFaq.mockResolvedValueOnce({
        id: 'faq_new',
        knowledgeBaseId: 'kb_1',
        userId: 'user_1',
        question: '如何重置密码？',
        answer: '点击登录页的忘记密码链接进行重置。',
        similarQuestions: ['忘记密码怎么办'],
        enabled: true,
        hitCount: 0,
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: '如何重置密码？',
          answer: '点击登录页的忘记密码链接进行重置。',
          similarQuestions: ['忘记密码怎么办'],
        }),
      });
      const res = await createFaq(req, { params: Promise.resolve({ id: 'kb_1' }) });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.faq.id).toBe('faq_new');
      expect(mocks.insertFaq).toHaveBeenCalled();
    });
  });

  describe('PUT & DELETE /api/knowledge-bases/[id]/faqs/[faqId]', () => {
    it('更新问答对成功返回 200', async () => {
      mocks.updateFaq.mockResolvedValueOnce({
        id: 'faq_1',
        question: '如何修改密码？',
        answer: '进入个人中心进行修改。',
        similarQuestions: [],
        enabled: true,
      });

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/faqs/faq_1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '如何修改密码？', answer: '进入个人中心进行修改。' }),
      });
      const res = await updateFaq(req, { params: Promise.resolve({ id: 'kb_1', faqId: 'faq_1' }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.faq.question).toBe('如何修改密码？');
    });

    it('删除问答对成功返回 200', async () => {
      mocks.deleteFaq.mockResolvedValueOnce(true);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/faqs/faq_1', {
        method: 'DELETE',
      });
      const res = await deleteFaqRoute(req, { params: Promise.resolve({ id: 'kb_1', faqId: 'faq_1' }) });

      expect(res.status).toBe(200);
      expect(mocks.deleteFaq).toHaveBeenCalledWith('user_1', 'faq_1');
    });
  });

  describe('PATCH /api/knowledge-bases/[id]/faqs/[faqId]/toggle', () => {
    it('切换启用状态成功返回 200', async () => {
      mocks.toggleFaq.mockResolvedValueOnce(true);

      const req = new NextRequest('http://localhost:3030/api/knowledge-bases/kb_1/faqs/faq_1/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      const res = await toggleFaqRoute(req, { params: Promise.resolve({ id: 'kb_1', faqId: 'faq_1' }) });

      expect(res.status).toBe(200);
      expect(mocks.toggleFaq).toHaveBeenCalledWith('user_1', 'faq_1', false);
    });
  });
});
