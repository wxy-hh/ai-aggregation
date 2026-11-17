import { beforeEach, describe, expect, it, vi } from 'vitest';

const { matchMock } = vi.hoisted(() => ({
  matchMock: vi.fn(),
}));

vi.mock('./faq-match-policy-defaults', () => ({
  knowledgeFaqMatchPolicy: {
    match: matchMock,
  },
}));

import { checkFaqShortCircuit, createFaqShortCircuitStream } from './faq-short-circuit';

describe('FAQ 前置精准短路包装 (ADR-0055)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('政策返回 short-circuit 时映射为 FAQ 直出结果', async () => {
    matchMock.mockResolvedValueOnce({
      kind: 'short-circuit',
      faq: {
        faqId: 'faq-1',
        question: '如何申请退款？',
        answer: '在订单中心申请退款即可。',
        matchedQuestionText: '如何申请退款？',
        knowledgeBaseId: 'kb-1',
        similarity: 0.95,
      },
    });

    const result = await checkFaqShortCircuit({
      userId: 'user-1',
      query: '如何申请退款？',
      hasCurrentAttachments: false,
    });

    expect(result).toEqual({
      question: '如何申请退款？',
      answer: '在订单中心申请退款即可。',
      faqId: 'faq-1',
    });
    expect(matchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        query: '如何申请退款？',
        scene: 'chat-short-circuit',
        hasCurrentAttachments: false,
      })
    );
  });

  it('政策返回 no-match 时包装结果为 null', async () => {
    matchMock.mockResolvedValueOnce({ kind: 'no-match', reason: 'below-threshold' });

    await expect(
      checkFaqShortCircuit({ userId: 'user-1', query: '我想退掉昨天买的商品' })
    ).resolves.toBeNull();
  });

  it('短路流仍输出官方标准口径标识与答案', async () => {
    const stream = createFaqShortCircuitStream({
      question: '如何申请退款？',
      answer: '在订单中心申请退款即可。',
    });
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
});
