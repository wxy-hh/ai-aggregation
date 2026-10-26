import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findManyKb: vi.fn(),
  findBestFaq: vi.fn(),
  incrementHit: vi.fn().mockResolvedValue(undefined),
  embedText: vi.fn().mockResolvedValue(new Array(1024).fill(0)),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    knowledgeBase: {
      findMany: mocks.findManyKb,
    },
  },
  findBestFaqMatch: mocks.findBestFaq,
  incrementFaqHitCount: mocks.incrementHit,
}));

vi.mock('@/lib/rag/faq-service', () => ({
  embedFaqText: mocks.embedText,
}));

import { checkFaqShortCircuit, createFaqShortCircuitStream } from './faq-short-circuit';

describe('FAQ 前置精准短路测试 (ADR-0027)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('当提问达到 Cosine >= 0.92 短路阈值时，成功返回 FAQ 并触发命中计数', async () => {
    mocks.findManyKb.mockResolvedValueOnce([{ id: 'kb-1' }]);
    mocks.findBestFaq.mockResolvedValueOnce({
      faqId: 'faq-1',
      knowledgeBaseId: 'kb-1',
      question: '如何申请退款？',
      answer: '在订单中心申请退款即可。',
      matchedQuestionText: '如何申请退款？',
      similarity: 0.95,
      isShortCircuit: true,
      isGroundTruth: true,
    });

    const result = await checkFaqShortCircuit({
      userId: 'user-1',
      query: '如何申请退款？',
    });

    expect(result).not.toBeNull();
    expect(result?.question).toBe('如何申请退款？');
    expect(result?.answer).toBe('在订单中心申请退款即可。');
    expect(mocks.incrementHit).toHaveBeenCalledWith('faq-1');

    // 验证短路流生成
    const stream = createFaqShortCircuitStream(result!);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toContain('官方标准口径答复');
    expect(text).toContain('在订单中心申请退款即可。');
  });

  it('当相似度未达到短路阈值时返回 null', async () => {
    mocks.findManyKb.mockResolvedValueOnce([{ id: 'kb-1' }]);
    mocks.findBestFaq.mockResolvedValueOnce({
      faqId: 'faq-1',
      question: '如何申请退款？',
      answer: '在订单中心申请退款即可。',
      similarity: 0.82,
      isShortCircuit: false,
      isGroundTruth: true,
    });

    const result = await checkFaqShortCircuit({
      userId: 'user-1',
      query: '我想退掉昨天买的商品',
    });

    expect(result).toBeNull();
  });
});
