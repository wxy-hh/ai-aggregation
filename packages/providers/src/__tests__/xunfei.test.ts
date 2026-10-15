import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { xunfeiChatStream } from '../xunfei';

function createMockSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('讯飞流式响应处理', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, XUNFEI_API_PASSWORD: 'mock_password' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('含业务错误帧时生成器抛出异常并包含原始错误码和信息', async () => {
    const sseData = [
      'data: {"code":11200,"message":"授权失败","sid":"test_sid","id":"1","created":123,"choices":[]}\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createMockSseResponse(sseData)));

    const stream = xunfeiChatStream({
      messages: [{ role: 'user', content: '你好' }],
    });

    await expect(async () => {
      // 遍历流式生成器触发读取
      for await (const chunk of stream) {
        void chunk;
      }
    }).rejects.toThrow('讯飞服务返回错误（码 11200）：授权失败');
  });

  it('正常流完整产出内容、用量及处理结束标识', async () => {
    const sseData = [
      'data: {"code":0,"message":"Success","sid":"test_sid","id":"1","created":123,"choices":[{"delta":{"role":"assistant","content":"你好"},"index":0}]}\n\n',
      'data: {"code":0,"message":"Success","sid":"test_sid","id":"1","created":123,"choices":[{"delta":{"role":"assistant","content":"世界"},"index":0}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n',
      'data: [DONE]\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createMockSseResponse(sseData)));

    const onUsage = vi.fn();
    const stream = xunfeiChatStream({
      messages: [{ role: 'user', content: '你好' }],
      onUsage,
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('你好世界');
    expect(onUsage).toHaveBeenCalledWith({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it('含异常 JSON 格式的数据分片时跳过该行继续处理后续内容', async () => {
    const sseData = [
      'data: {bad json format\n\n',
      'data: {"code":0,"message":"Success","sid":"test_sid","id":"1","created":123,"choices":[{"delta":{"role":"assistant","content":"正常内容"},"index":0}]}\n\n',
      'data: [DONE]\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createMockSseResponse(sseData)));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const stream = xunfeiChatStream({
      messages: [{ role: 'user', content: '你好' }],
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('正常内容');
    expect(warnSpy).toHaveBeenCalledWith(
      '[Xunfei] 解析流式分片失败:',
      expect.any(Error)
    );
  });
});
