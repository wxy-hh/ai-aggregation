import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatHandler } from './chat-handler';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';
import { encodeSseEvent } from './sse';
import type { ChatContext, ChatProviderAdapter } from './types';
import type { ProviderName } from '@repo/providers';

const { currentUserMock, rateLimiterMock, quotaSessionReserveMock, faqShortCircuitMock } = vi.hoisted(
  () => ({
    currentUserMock: vi.fn(),
    rateLimiterMock: { check: vi.fn() },
    quotaSessionReserveMock: vi.fn(),
    faqShortCircuitMock: vi.fn(),
  })
);

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: currentUserMock,
}));

vi.mock('@repo/redis', () => ({
  getRateLimiter: () => rateLimiterMock,
}));

vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: {
    reserve: quotaSessionReserveMock,
  },
}));

vi.mock('./faq-short-circuit', () => ({
  checkFaqShortCircuit: faqShortCircuitMock,
  createFaqShortCircuitStream: (faq: { answer: string }) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeSseEvent({ type: 'text-delta', text: `官方标准口径答复\n${faq.answer}` }));
        controller.enqueue(encodeSseEvent({ type: 'done' }));
        controller.close();
      },
    }),
}));

async function readSseText(response: Response): Promise<string> {
  return response.text();
}

function postJson(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('聊天场景边界：对比模式与旧预留请求不短路', () => {
  let mockAdapterStream: ReturnType<typeof vi.fn<(ctx: ChatContext) => Promise<ReadableStream<Uint8Array>>>>;
  let handler: ReturnType<typeof createChatHandler>;
  let fakeSession: ReturnType<typeof createFakeQuotaSession>;

  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: 'test-user-id', role: 'user' });
    rateLimiterMock.check.mockResolvedValue({ allowed: true, remaining: 60, reset: Date.now() + 60000 });
    fakeSession = createFakeQuotaSession({ outputLimit: 2048 });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);
    faqShortCircuitMock.mockResolvedValue({
      question: '如何申请退款？',
      answer: '在订单中心申请退款即可。',
      faqId: 'faq-1',
    });
    mockAdapterStream = vi.fn(async (ctx: ChatContext) => {
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encodeSseEvent({ type: 'text-delta', text: '对比模型回答' }));
          await ctx.onFinish({
            outcome: 'success',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimated: false },
            outputText: '对比模型回答',
          });
          controller.enqueue(encodeSseEvent({ type: 'done' }));
          controller.close();
        },
      });
    });
    const adapter: ChatProviderAdapter = { stream: (ctx) => mockAdapterStream(ctx) };
    handler = createChatHandler({ getAdapter: (_provider: ProviderName) => adapter });
  });

  it('TC01-4: chatScene=compare 不直出并正常调用适配器与配额终态', async () => {
    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '如何申请退款？' }],
        provider: 'xunfei',
        chatScene: 'compare',
      })
    );

    const text = await readSseText(response);
    expect(text).not.toContain('官方标准口径答复');
    expect(text).toContain('对比模型回答');
    expect(faqShortCircuitMock).not.toHaveBeenCalled();
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
    expect(quotaSessionReserveMock).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
  });

  it('TC01-5: 旧客户端携带 reservationId 且缺 chatScene 时不直出', async () => {
    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '如何申请退款？' }],
        provider: 'xunfei',
        requestId: 'req-compare-1',
        reservationId: 'res-compare-1',
      })
    );

    const text = await readSseText(response);
    expect(text).not.toContain('官方标准口径答复');
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
  });

  it('TC01-6: 非法 chatScene 返回 HTTP 400', async () => {
    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '如何申请退款？' }],
        provider: 'xunfei',
        chatScene: 'compare-typo',
      })
    );

    expect(response.status).toBe(400);
    expect(faqShortCircuitMock).not.toHaveBeenCalled();
  });

  it('TC03-1: 当前消息携带附件时不直出并继续适配器链路', async () => {
    faqShortCircuitMock.mockImplementation(async (params: { hasCurrentAttachments?: boolean }) =>
      params.hasCurrentAttachments
        ? null
        : {
            question: '如何申请退款？',
            answer: '在订单中心申请退款即可。',
            faqId: 'faq-1',
          }
    );

    const response = await handler(
      postJson({
        messages: [
          {
            role: 'user',
            content: '如何申请退款？',
            attachments: [{ type: 'image', imageUrl: 'data:image/png;base64,AAA' }],
          },
        ],
        provider: 'xunfei',
      })
    );

    const text = await readSseText(response);
    expect(text).not.toContain('官方标准口径答复');
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
    expect(faqShortCircuitMock).toHaveBeenCalledWith(
      expect.objectContaining({ hasCurrentAttachments: true })
    );
  });

  it('TC03-2: 会话已有历史时当前问题仍可 FAQ 直出', async () => {
    const response = await handler(
      postJson({
        messages: [
          { role: 'user', content: '我想咨询售后' },
          { role: 'assistant', content: '请描述你的问题' },
          { role: 'user', content: '如何申请退款？' },
        ],
        provider: 'xunfei',
      })
    );

    const text = await readSseText(response);
    expect(text).toContain('官方标准口径答复');
    expect(mockAdapterStream).not.toHaveBeenCalled();
  });

  it('TC03-2b: 历史消息含附件、当前消息无附件时仍可 FAQ 直出', async () => {
    const response = await handler(
      postJson({
        messages: [
          {
            role: 'user',
            content: '看图',
            attachments: [{ type: 'image', imageUrl: 'data:image/png;base64,AAA' }],
          },
          { role: 'assistant', content: '收到图片' },
          { role: 'user', content: '如何申请退款？' },
        ],
        provider: 'xunfei',
      })
    );

    const text = await readSseText(response);
    expect(text).toContain('官方标准口径答复');
    expect(faqShortCircuitMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ hasCurrentAttachments: false })
    );
  });

  it('TC03-3: 普通聊天相似度 0.78–0.92 不直出并继续模型链路', async () => {
    faqShortCircuitMock.mockResolvedValueOnce(null);

    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '我想退掉昨天买的商品' }],
        provider: 'xunfei',
      })
    );

    const text = await readSseText(response);
    expect(text).not.toContain('官方标准口径答复');
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
  });

  it('TC03-4: 普通聊天问题超过 500 字符不直出并继续模型链路', async () => {
    faqShortCircuitMock.mockImplementationOnce(
      async (params: { query: string }) => (params.query.length > 500 ? null : {
        question: '如何申请退款？',
        answer: '在订单中心申请退款即可。',
        faqId: 'faq-1',
      })
    );

    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '退款'.repeat(251) }],
        provider: 'xunfei',
      })
    );

    const text = await readSseText(response);
    expect(text).not.toContain('官方标准口径答复');
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
  });

  it('TC03-4b: FAQ 未命中时响应不出现官方标准口径标识', async () => {
    faqShortCircuitMock.mockResolvedValueOnce(null);

    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '如何申请退款？' }],
        provider: 'xunfei',
      })
    );

    const text = await readSseText(response);
    expect(text).not.toContain('官方标准口径答复');
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
  });

  it('TC03-5: FAQ 政策异常时降级为无 FAQ 并继续模型链路', async () => {
    faqShortCircuitMock.mockRejectedValueOnce(new Error('policy down'));

    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '如何申请退款？' }],
        provider: 'xunfei',
      })
    );

    const text = await readSseText(response);
    expect(text).not.toContain('官方标准口径答复');
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
  });

  it('TC01-7: 普通单聊缺省 chatScene 仍可 FAQ 直出', async () => {
    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '如何申请退款？' }],
        provider: 'xunfei',
      })
    );

    const text = await readSseText(response);
    expect(text).toContain('官方标准口径答复');
    expect(faqShortCircuitMock).toHaveBeenCalledTimes(1);
    expect(mockAdapterStream).not.toHaveBeenCalled();
    expect(quotaSessionReserveMock).not.toHaveBeenCalled();
  });
});
