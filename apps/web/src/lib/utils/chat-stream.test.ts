import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consumeChatResponse, streamChatResponse } from './chat-stream';
import { encodeChatStreamEvent, parseChatStreamEvent } from '@repo/shared';
import { authFetch } from '@/lib/api/client';

// 编排函数依赖 authFetch（评审 C4 抽出）：mock 网络层，用真实 consumeChatResponse 消费流
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
  fetchWithAuth: vi.fn(),
  authHeaders: vi.fn(),
}));

const mockedAuthFetch = vi.mocked(authFetch);

/** 构造 SSE 字符串流对应的 Response */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

describe('consumeChatResponse', () => {
  it('正常流（text-delta + done）时逐块回调内容', async () => {
    const res = sseResponse([
      'data: {"type":"text-delta","text":"你好"}\n\n',
      'data: {"type":"text-delta","text":"世界"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, onChunk)).resolves.toBeUndefined();
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['你好', '世界']);
  });

  it('回归：流被截断（无 done / 无 error）时必须抛错，不能静默产出空回答', async () => {
    // 模拟部署超时截断 / 上游空流：只有 delta，永远没有完成事件
    const res = sseResponse([
      'data: {"type":"text-delta","text":"被截断的"}\n\n',
      'data: {"type":"text-delta","text":"内容"}\n\n',
    ]);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, onChunk)).rejects.toThrow('回答流被中断');
    expect(onChunk).toHaveBeenCalledTimes(2); // 已到达的文本仍应回调
  });

  it('回归：完全空的流（无任何事件）必须抛错，不能显示为已成功', async () => {
    const res = sseResponse(['data: {"type":"response.created","foo":1}\n\n']);
    await expect(consumeChatResponse(res, vi.fn())).rejects.toThrow('回答流被中断');
  });

  it('error 事件直接抛出错误信息', async () => {
    const res = sseResponse([
      'data: {"type":"error","error":"模型未返回任何内容，请重试"}\n\n',
    ]);
    await expect(consumeChatResponse(res, vi.fn())).rejects.toThrow(
      '模型未返回任何内容，请重试'
    );
  });

  it('warning 事件回调 onWarning 且不终止流', async () => {
    const res = sseResponse([
      'data: {"type":"warning","warning":"回答在此处被截断，内容可能不完整"}\n\n',
      'data: {"type":"text-delta","text":"后续内容"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();
    const onWarning = vi.fn();

    await expect(consumeChatResponse(res, onChunk, onWarning)).resolves.toBeUndefined();
    expect(onWarning).toHaveBeenCalledWith('回答在此处被截断，内容可能不完整');
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['后续内容']);
  });

  it('未知事件类型必须显式处理：不回调、不终止，遇 done 正常结束', async () => {
    const res = sseResponse([
      'data: {"type":"response.created","foo":1}\n\n',
      'data: {"type":"text-delta","text":"你好"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, onChunk)).resolves.toBeUndefined();
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['你好']);
  });

  it('回归：死兼容分支 response.output_text.delta / response.done 不再被消费', async () => {
    // 旧协议帧（豆包上游原始事件）：以前被当作 delta 输出 / 当作 done 终止。
    // 当前后端不产出此类事件，必须被忽略——内容不回显，也不能终止流。
    const res = sseResponse([
      'data: {"type":"response.output_text.delta","delta":"旧协议文本"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, onChunk)).resolves.toBeUndefined();
    expect(onChunk).not.toHaveBeenCalled();

    // 只有 response.done、没有任何契约内终止事件 → 一律按截断抛错
    const res2 = sseResponse(['data: {"type":"response.done"}\n\n']);
    await expect(consumeChatResponse(res2, vi.fn())).rejects.toThrow('回答流被中断');
  });

  it('非 JSON 帧按协议外数据忽略，不当作文本输出', async () => {
    const res = sseResponse(['data: 纯文本帧\n\n', 'data: {"type":"done"}\n\n']);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, onChunk)).resolves.toBeUndefined();
    expect(onChunk).not.toHaveBeenCalled();
  });
});

describe('ChatStreamEvent 契约（@repo/shared）', () => {
  it('parseChatStreamEvent 解析 4 种契约事件', () => {
    expect(parseChatStreamEvent({ type: 'text-delta', text: '你好' })).toEqual({
      type: 'text-delta',
      text: '你好',
    });
    expect(parseChatStreamEvent({ type: 'done' })).toEqual({ type: 'done' });
    expect(parseChatStreamEvent({ type: 'warning', warning: '警告' })).toEqual({
      type: 'warning',
      warning: '警告',
    });
    expect(parseChatStreamEvent({ type: 'error', error: '失败' })).toEqual({
      type: 'error',
      error: '失败',
    });
  });

  it('parseChatStreamEvent 对未知类型 / 非法帧显式返回 null（即忽略）', () => {
    expect(parseChatStreamEvent({ type: 'response.created' })).toBeNull();
    expect(parseChatStreamEvent({ type: 'text-delta', text: '' })).toBeNull();
    expect(parseChatStreamEvent({ type: 'text-delta', text: 123 })).toBeNull();
    expect(parseChatStreamEvent({ type: 'done', extra: 1 })).toEqual({ type: 'done' });
    expect(parseChatStreamEvent(null)).toBeNull();
    expect(parseChatStreamEvent('字符串')).toBeNull();
  });

  it('encodeChatStreamEvent 产物可被 parse 解析回原事件（编码解码同源）', () => {
    const events = [
      { type: 'text-delta', text: '你好' },
      { type: 'done' },
      { type: 'warning', warning: '警告' },
      { type: 'error', error: '失败' },
    ] as const;

    for (const event of events) {
      const frame = encodeChatStreamEvent(event);
      expect(frame.startsWith('data: ')).toBe(true);
      expect(frame.endsWith('\n\n')).toBe(true);
      expect(parseChatStreamEvent(JSON.parse(frame.slice(6).trim()))).toEqual(event);
    }
  });
});

describe('streamChatResponse（评审 C4：统一编排）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
  });

  it('正常流：POST /api/chat 并返回累计文本，onChunk 收到累计值', async () => {
    let seenBody: unknown;
    mockedAuthFetch.mockImplementation(async (url, init) => {
      seenBody = JSON.parse((init as RequestInit).body as string);
      return sseResponse([
        'data: {"type":"text-delta","text":"你好"}\n\n',
        'data: {"type":"text-delta","text":"世界"}\n\n',
        'data: {"type":"done"}\n\n',
      ]);
    });
    const onChunk = vi.fn();
    const onWarning = vi.fn();

    const text = await streamChatResponse(
      { body: { messages: [], provider: 'xunfei' }, signal: new AbortController().signal },
      { onChunk, onWarning }
    );

    expect(text).toBe('你好世界');
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['你好', '你好世界']);
    expect(onWarning).not.toHaveBeenCalled();
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST' })
    );
    expect(seenBody).toEqual({ messages: [], provider: 'xunfei' });
  });

  it('warning 事件透传给 onWarning', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"warning","warning":"回答在此处被截断，内容可能不完整"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    const onWarning = vi.fn();
    await streamChatResponse(
      { body: { messages: [] }, signal: new AbortController().signal },
      { onWarning }
    );
    expect(onWarning).toHaveBeenCalledWith('回答在此处被截断，内容可能不完整');
  });

  it('HTTP !ok：优先取上游 error 文案，JSON 解析失败时回退状态码文案', async () => {
    mockedAuthFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: '服务不可用' }), { status: 500 })
    );
    await expect(
      streamChatResponse({ body: { messages: [] }, signal: new AbortController().signal }, {})
    ).rejects.toThrow('服务不可用');

    mockedAuthFetch.mockResolvedValue(new Response('not json', { status: 503 }));
    await expect(
      streamChatResponse({ body: { messages: [] }, signal: new AbortController().signal }, {})
    ).rejects.toThrow('请求失败: 503');
  });

  it('AbortError 原样透传（由调用方按各自语义处理）', async () => {
    const abortError = new Error('canceled');
    abortError.name = 'AbortError';
    mockedAuthFetch.mockRejectedValue(abortError);
    await expect(
      streamChatResponse({ body: { messages: [] }, signal: new AbortController().signal }, {})
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
