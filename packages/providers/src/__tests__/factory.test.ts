import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * doubaoFetch shim 的契约测试（Ark /responses 兼容层）：
 * - 剥除 OpenAI 专属 include 值 web_search_call.action.sources（其它 include 值保留）
 * - 给缺 type 的 message 历史项补 type:"message"（Ark 对缺 type 的 assistant 项 400）
 * 通过 createProvider + streamText 真实调用链触发，stub 全局 fetch 捕获请求体。
 */

function createCompletedSseResponse(): Response {
  const sse =
    'data: {"type":"response.completed","response":{"id":"resp_stub","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\ndata: [DONE]\n\n';
  return new Response(sse, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('doubaoFetch /responses 兼容 shim', () => {
  const originalEnv = process.env;
  let capturedBodies: Record<string, unknown>[];

  beforeEach(() => {
    process.env = { ...originalEnv, ARK_API_KEY: 'test_ark_key' };
    capturedBodies = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        if (typeof init?.body === 'string') {
          capturedBodies.push(JSON.parse(init.body) as Record<string, unknown>);
        }
        return createCompletedSseResponse();
      })
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  /** 走真实 SDK 链路发一次带 assistant 历史 + web_search 的请求，返回捕获的请求体 */
  async function captureResponsesBody() {
    const { createProvider } = await import('../factory');
    const { streamText, stepCountIs } = await import('ai');
    const provider = createProvider('doubao');
    const result = streamText({
      model: provider('doubao-seed-evolving'),
      messages: [
        { role: 'user', content: '今天有什么新闻' },
        { role: 'assistant', content: '今日新闻速览：油价 102 美元。' },
        { role: 'user', content: '用一句话总结刚才的新闻' },
      ],
      tools: { web_search: provider.tools.webSearch({}) },
      stopWhen: stepCountIs(1),
      maxOutputTokens: 64,
      providerOptions: { openai: { maxToolCalls: 3 } },
    });
    try {
      for await (const part of result.fullStream) {
        void part;
      }
    } catch {
      // 桩响应只保证请求被发出，流收尾异常不影响断言
    }
    return capturedBodies[0];
  }

  it('多轮历史：所有 message 输入项补齐 type:"message"（Ark 对缺 type 的 assistant 项 400）', async () => {
    const body = await captureResponsesBody();
    expect(body).toBeDefined();
    const input = body.input as { role?: string; type?: string }[];
    expect(input).toHaveLength(3);
    for (const item of input) {
      expect(item.type).toBe('message');
    }
    expect(input.map((i) => i.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('剥除 OpenAI 专属 include 值 web_search_call.action.sources', async () => {
    const body = await captureResponsesBody();
    // 该值是唯一会被自动附加的 include，剥净后键应整体消失
    expect(body.include).toBeUndefined();
  });

  it('非 /responses 请求（chat completions）原样透传，不补 type 不动结构', async () => {
    const { createProvider } = await import('../factory');
    const { streamText, stepCountIs } = await import('ai');
    const provider = createProvider('doubao');
    // provider.chat() 走 /chat/completions：shim 只应拦截 /responses
    const result = streamText({
      model: provider.chat('doubao-seed-evolving'),
      messages: [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好呀' },
        { role: 'user', content: '再见' },
      ],
      stopWhen: stepCountIs(1),
      maxOutputTokens: 64,
    });
    try {
      for await (const part of result.fullStream) {
        void part;
      }
    } catch {
      // 桩响应格式与 chat completions 不符时收尾可能报错，不影响请求体断言
    }
    const body = capturedBodies[0];
    expect(body).toBeDefined();
    // chat completions 体保持 messages 形状，未被改写成 responses 的 input
    expect(body.input).toBeUndefined();
    const messages = body.messages as { role: string; type?: string }[];
    expect(messages).toHaveLength(3);
    for (const m of messages) {
      expect(m.type).toBeUndefined();
    }
  });
});
