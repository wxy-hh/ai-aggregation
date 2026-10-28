import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  currentUser: { id: 'user_1', username: 'testuser' },
  generateText: vi.fn(),
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

vi.mock('ai', () => ({
  generateText: mocks.generateText,
}));

vi.mock('@repo/providers', () => ({
  createProvider: () => () => ({}),
}));

import { POST } from './route';

describe('POST /api/chat/distill-faq (TC06: 对话提炼 FAQ API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
    mocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        question: '如何申请差旅报销？',
        answer: '进入财务系统，在日常报销中填写行程单并上传发票。',
        similarQuestions: ['差旅报销流程是什么', '怎么报销出差费用'],
      }),
    });
  });

  it('断言 1: 未登录返回 HTTP 401', async () => {
    mocks.currentUser = null as any;
    const req = new NextRequest('http://localhost:3000/api/chat/distill-faq', {
      method: 'POST',
      body: JSON.stringify({
        userQuery: '怎么报销',
        aiResponse: '在财务系统操作',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('断言 2: 请求体字段缺失返回 HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/chat/distill-faq', {
      method: 'POST',
      body: JSON.stringify({
        userQuery: '',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('断言 3: 正常模型调用提取标准问答并返回 200 与 isFallback=false', async () => {
    const req = new NextRequest('http://localhost:3000/api/chat/distill-faq', {
      method: 'POST',
      body: JSON.stringify({
        userQuery: '那个，请问咱们公司怎么申请出差报销来着？',
        aiResponse: '好的！关于出差报销，您可以直接进入财务系统提交申请。',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.question).toBe('如何申请差旅报销？');
    expect(json.data.answer).toBe('进入财务系统，在日常报销中填写行程单并上传发票。');
    expect(json.data.similarQuestions).toEqual(['差旅报销流程是什么', '怎么报销出差费用']);
    expect(json.data.isFallback).toBe(false);
  });

  it('断言 4: 模型调用抛出异常时平滑降级返回 isFallback=true 且状态码为 200', async () => {
    mocks.generateText.mockRejectedValue(new Error('上游网络异常'));
    const req = new NextRequest('http://localhost:3000/api/chat/distill-faq', {
      method: 'POST',
      body: JSON.stringify({
        userQuery: '口语化问题内容',
        aiResponse: '口语化回答内容',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.question).toBe('口语化问题内容');
    expect(json.data.answer).toBe('口语化回答内容');
    expect(Array.isArray(json.data.similarQuestions)).toBe(true);
    expect(json.data.isFallback).toBe(true);
  });
});
