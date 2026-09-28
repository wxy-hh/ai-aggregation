import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runChatStreamSession, type ChatStreamSessionDeps, type Message } from './chat-store';
import { authFetch } from '@/lib/api/client';
import { on, StoreEvents } from './store-events';

// 网络层 mock：runChatStreamSession 走真实 streamChatResponse / consumeChatResponse（评审 C6 三态单点可测）
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
  fetchWithAuth: vi.fn(),
  authHeaders: vi.fn(),
}));

const mockedAuthFetch = vi.mocked(authFetch);
const assistantId = 'assistant-1';

/** 构造 SSE 流式 Response */
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

/** 构造中途抛出 AbortError 的 SSE 流式 Response：首帧正常返回增量文本，随后流中断 */
function abortedSseResponse(firstChunk: string): Response {
  const encoder = new TextEncoder();
  const abortError = new Error('canceled');
  abortError.name = 'AbortError';
  let readOnce = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!readOnce) {
        readOnce = true;
        controller.enqueue(encoder.encode(firstChunk));
      } else {
        controller.error(abortError);
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

/** 构造中途抛出普通错误的 SSE 流式 Response：首帧正常返回增量文本，随后流中断抛出普通错误 */
function failingSseResponse(firstChunk: string, error = new Error('upstream broken')): Response {
  const encoder = new TextEncoder();
  let readOnce = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!readOnce) {
        readOnce = true;
        controller.enqueue(encoder.encode(firstChunk));
      } else {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

function createDeps(messages: Message[]) {
  const deps: ChatStreamSessionDeps = {
    getMessages: () => [...messages],
    updateMessages: (updater) => {
      const next = updater(messages);
      messages.splice(0, messages.length, ...next);
      return messages;
    },
    setError: vi.fn(),
    activeConversationId: () => 'conv-1',
  };
  return deps as typeof deps & { setError: ReturnType<typeof vi.fn> };
}

function makeMessages(): Message[] {
  return [
    { id: 'user-1', role: 'user', content: '你好' },
    { id: assistantId, role: 'assistant', content: '', isStreaming: true },
  ];
}

function requestBody() {
  return {
    body: { messages: [{ role: 'user', content: '你好' }], provider: 'xunfei', model: undefined },
    signal: new AbortController().signal,
  };
}

describe('runChatStreamSession（评审 C6：统一会话语义映射）', () => {
  let onUpdated: (payload: unknown) => void;
  let off: () => void;

  beforeEach(() => {
    mockedAuthFetch.mockReset();
    onUpdated = vi.fn((_payload: unknown) => undefined);
    off = on(StoreEvents.CONVERSATION_UPDATED, onUpdated);
  });

  afterEach(() => {
    off();
  });

  it('成功流：返回 sent，assistant 关闭 isStreaming，onDone 收到最终消息并同步会话', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"你好"}\n\n',
        'data: {"type":"text-delta","text":"世界"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    const messages = makeMessages();
    const deps = createDeps(messages);
    const onDone = vi.fn();

    const result = await runChatStreamSession(deps, assistantId, requestBody(), onDone);

    expect(result).toBe('sent');
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant?.content).toBe('你好世界');
    expect(assistant?.isStreaming).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith({ id: 'conv-1', messages });
  });

  it('HTTP !ok：返回 failed，设置错误并移除空的 assistant 消息', async () => {
    mockedAuthFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: '额度不足' }), { status: 500 })
    );
    const messages = makeMessages();
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('failed');
    expect(deps.setError).toHaveBeenCalledWith(expect.objectContaining({ message: '额度不足' }));
    expect(messages.find((m) => m.id === assistantId)).toBeUndefined();
    expect(onUpdated).toHaveBeenCalledWith({
      id: 'conv-1',
      messages: [expect.objectContaining({ id: 'user-1' })],
    });
  });

  it('AbortError 且内容为空：返回 aborted，assistant 空消息被移除，不设错误，同步会话列表', async () => {
    const abortError = new Error('canceled');
    abortError.name = 'AbortError';
    mockedAuthFetch.mockRejectedValue(abortError);
    const messages = makeMessages();
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('aborted');
    expect(deps.setError).not.toHaveBeenCalled();
    expect(messages.find((m) => m.id === assistantId)).toBeUndefined();
    expect(onUpdated).toHaveBeenCalledWith({
      id: 'conv-1',
      messages: [expect.objectContaining({ id: 'user-1' })],
    });
  });

  it('AbortError 且已有部分内容：返回 aborted，消息保留并标记 isStreaming:false + stopped:true，不设错误，同步会话列表', async () => {
    mockedAuthFetch.mockResolvedValue(
      abortedSseResponse('data: {"type":"text-delta","text":"部分回答"}\n\n')
    );
    const messages = makeMessages();
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('aborted');
    expect(deps.setError).not.toHaveBeenCalled();
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant).toBeDefined();
    expect(assistant?.content).toBe('部分回答');
    expect(assistant?.isStreaming).toBe(false);
    expect(assistant?.stopped).toBe(true);
    expect(onUpdated).toHaveBeenCalledWith({ id: 'conv-1', messages });
  });

  it('AbortError 且已被同步收尾：返回 aborted，幂等不重复 emit', async () => {
    const abortError = new Error('canceled');
    abortError.name = 'AbortError';
    mockedAuthFetch.mockRejectedValue(abortError);
    const messages: Message[] = [
      { id: 'user-1', role: 'user', content: '你好' },
      { id: assistantId, role: 'assistant', content: '已收尾内容', isStreaming: false, stopped: true },
    ];
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('aborted');
    expect(deps.setError).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('流中途错误且已有部分内容：返回 failed，消息保留并标记 failed:true + isStreaming:false，设置错误，同步会话列表', async () => {
    mockedAuthFetch.mockResolvedValue(
      failingSseResponse('data: {"type":"text-delta","text":"部分回答"}\n\n')
    );
    const messages = makeMessages();
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('failed');
    expect(deps.setError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'upstream broken' })
    );
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant).toBeDefined();
    expect(assistant?.content).toBe('部分回答');
    expect(assistant?.isStreaming).toBe(false);
    expect(assistant?.failed).toBe(true);
    expect(onUpdated).toHaveBeenCalledWith({ id: 'conv-1', messages });
  });

  it('流中节流落盘：chunk 间隔超过 1s 时同步会话列表', async () => {
    vi.useFakeTimers();
    try {
      const encoder = new TextEncoder();
      let step = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (step === 0) {
            step++;
            controller.enqueue(encoder.encode('data: {"type":"text-delta","text":"第一段"}\n\n'));
          } else if (step === 1) {
            step++;
            vi.setSystemTime(Date.now() + 2000);
            controller.enqueue(encoder.encode('data: {"type":"text-delta","text":"第二段"}\n\n'));
          } else if (step === 2) {
            step++;
            controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
            controller.close();
          }
        },
      });
      mockedAuthFetch.mockResolvedValue(
        new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        })
      );
      const messages = makeMessages();
      const deps = createDeps(messages);
      let updateCallsBeforeDone = 0;
      const onDone = vi.fn(() => {
        updateCallsBeforeDone = (onUpdated as any).mock.calls.length;
      });

      const result = await runChatStreamSession(deps, assistantId, requestBody(), onDone);

      expect(result).toBe('sent');
      // 流式进行中（done 之前）已触发过同步
      expect(updateCallsBeforeDone).toBeGreaterThanOrEqual(1);
      // 整个会话过程中 onUpdated 调用次数 ≥ 2（流中节流落盘 + 最终完成）
      expect((onUpdated as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rAF 合帧：同帧多个 onChunk 不重复触发 set，调度器执行前 store 不更新，flush 后为最新', async () => {
    let scheduledCallback: (() => void) | null = null;
    const manualScheduler = (cb: () => void) => {
      scheduledCallback = cb;
      return () => {
        scheduledCallback = null;
      };
    };

    let sendChunk1: () => void;
    let sendChunk2: () => void;
    let closeStream: () => void;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        sendChunk1 = () => {
          controller.enqueue(encoder.encode('data: {"type":"text-delta","text":"第一段"}\n\n'));
        };
        sendChunk2 = () => {
          controller.enqueue(encoder.encode('data: {"type":"text-delta","text":"第二段"}\n\n'));
        };
        closeStream = () => {
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          controller.close();
        };
      },
    });

    mockedAuthFetch.mockResolvedValue(
      new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      })
    );

    const messages = makeMessages();
    const deps = createDeps(messages);
    const updateSpy = vi.spyOn(deps, 'updateMessages');

    const sessionPromise = runChatStreamSession(
      deps,
      assistantId,
      requestBody(),
      undefined,
      { scheduleFlush: manualScheduler }
    );

    // 发送第一个 chunk
    sendChunk1!();
    await vi.waitFor(() => expect(scheduledCallback).not.toBeNull());

    // 同帧发送第二个 chunk
    sendChunk2!();
    // 等待微任务让 reader 消费第二个 chunk
    await new Promise((r) => setTimeout(r, 10));

    // 调度器回调执行前，store 消息未更新（updateMessages 尚未被调用）
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant?.content).toBe('');
    expect(updateSpy).toHaveBeenCalledTimes(0);

    // 手动 flush 一次
    scheduledCallback!();

    // 手动 flush 后仅触发一次 updateMessages，内容为最新
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const updatedAssistant = messages.find((m) => m.id === assistantId);
    expect(updatedAssistant?.content).toBe('第一段第二段');

    // 关闭流并完成
    closeStream!();
    const result = await sessionPromise;
    expect(result).toBe('sent');
  });

  it('完成时兜底 flush：最后一个 chunk 到达后未手动 flush 直接完成，最终 content 完整且 isStreaming:false', async () => {
    let scheduledCallback: (() => void) | null = null;
    const manualScheduler = (cb: () => void) => {
      scheduledCallback = cb;
      return () => {
        scheduledCallback = null;
      };
    };

    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"第一段"}\n\n',
        'data: {"type":"text-delta","text":"最后一帧未flush的内容"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );

    const messages = makeMessages();
    const deps = createDeps(messages);
    const onDone = vi.fn();

    // 这里完全不调用 scheduledCallback，模拟流结束时最后一帧仍在 rAF 队列中
    const result = await runChatStreamSession(
      deps,
      assistantId,
      requestBody(),
      onDone,
      { scheduleFlush: manualScheduler }
    );

    expect(result).toBe('sent');
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant?.content).toBe('第一段最后一帧未flush的内容');
    expect(assistant?.isStreaming).toBe(false);
    expect(onDone).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: assistantId,
          content: '第一段最后一帧未flush的内容',
          isStreaming: false,
        }),
      ])
    );
    expect(onUpdated).toHaveBeenCalledWith({ id: 'conv-1', messages });
  });

  it('中止时兜底 flush：最后一个 chunk 未手动 flush 直接发生 AbortError，保留完整内容并标记 stopped:true', async () => {
    let scheduledCallback: (() => void) | null = null;
    const manualScheduler = (cb: () => void) => {
      scheduledCallback = cb;
      return () => {
        scheduledCallback = null;
      };
    };

    mockedAuthFetch.mockResolvedValue(
      abortedSseResponse('data: {"type":"text-delta","text":"尾部未flush的部分内容"}\n\n')
    );

    const messages = makeMessages();
    const deps = createDeps(messages);

    // 不调用 scheduledCallback，模拟中止前 rAF 尚未执行
    const result = await runChatStreamSession(
      deps,
      assistantId,
      requestBody(),
      undefined,
      { scheduleFlush: manualScheduler }
    );

    expect(result).toBe('aborted');
    expect(deps.setError).not.toHaveBeenCalled();
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant).toBeDefined();
    expect(assistant?.content).toBe('尾部未flush的部分内容');
    expect(assistant?.isStreaming).toBe(false);
    expect(assistant?.stopped).toBe(true);
    expect(onUpdated).toHaveBeenCalledWith({ id: 'conv-1', messages });
  });

  it('渲染与落盘分离：后台停帧（调度器不执行）时，1s 节流落盘仍在 onChunk 同步路径生效且包含最新内容', async () => {
    vi.useFakeTimers();
    try {
      // 调度器完全不执行任何 flush，模拟标签页切到后台 rAF 挂起
      const noopScheduler = () => () => {};

      let sendFirstChunk: () => void;
      let sendSecondChunk: () => void;
      let completeStream: () => void;

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          sendFirstChunk = () => {
            controller.enqueue(encoder.encode('data: {"type":"text-delta","text":"第一段"}\n\n'));
          };
          sendSecondChunk = () => {
            controller.enqueue(encoder.encode('data: {"type":"text-delta","text":"第二段最新"}\n\n'));
          };
          completeStream = () => {
            controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
            controller.close();
          };
        },
      });

      mockedAuthFetch.mockResolvedValue(
        new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        })
      );

      const messages = makeMessages();
      const deps = createDeps(messages);

      const sessionPromise = runChatStreamSession(
        deps,
        assistantId,
        requestBody(),
        undefined,
        { scheduleFlush: noopScheduler }
      );

      // 发送第 1 个 chunk
      sendFirstChunk!();
      await vi.advanceTimersByTimeAsync(10);

      // 时间前进 2000ms（超过 1s 节流阈值）
      vi.setSystemTime(Date.now() + 2000);

      // 发送第 2 个 chunk
      sendSecondChunk!();
      await vi.advanceTimersByTimeAsync(10);

      // 验证：尽管调度器从未执行 flush，onUpdated 已经同步收到了第 2 个 chunk 的落盘同步
      const persistCalls = (onUpdated as any).mock.calls;
      expect(persistCalls.length).toBeGreaterThanOrEqual(1);
      const lastCallPayload = persistCalls[persistCalls.length - 1][0];
      expect(lastCallPayload.id).toBe('conv-1');
      const persistedAssistant = lastCallPayload.messages.find((m: Message) => m.id === assistantId);
      expect(persistedAssistant?.content).toBe('第一段第二段最新');

      completeStream!();
      await sessionPromise;
    } finally {
      vi.useRealTimers();
    }
  });
});

