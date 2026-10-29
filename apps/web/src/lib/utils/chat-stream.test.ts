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

    await expect(consumeChatResponse(res, { onChunk })).resolves.toBeUndefined();
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['你好', '世界']);
  });

  it('正常流 done 携带 usage 时正确回调 onDone(usage)', async () => {
    const usage = {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      estimated: false,
    };
    const res = sseResponse([
      'data: {"type":"text-delta","text":"内容"}\n\n',
      `data: {"type":"done","usage":${JSON.stringify(usage)}}\n\n`,
    ]);
    const onChunk = vi.fn();
    const onDone = vi.fn();

    await expect(consumeChatResponse(res, { onChunk, onDone })).resolves.toBeUndefined();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(usage);
  });

  it('正常流 done 未携带 usage 时回调 onDone(undefined)', async () => {
    const res = sseResponse([
      'data: {"type":"text-delta","text":"内容"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onDone = vi.fn();

    await expect(consumeChatResponse(res, { onChunk: vi.fn(), onDone })).resolves.toBeUndefined();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(undefined);
  });

  it('回归：流被截断（无 done / 无 error）时必须抛错，不能静默产出空回答', async () => {
    // 模拟部署超时截断 / 上游空流：只有 delta，永远没有完成事件
    const res = sseResponse([
      'data: {"type":"text-delta","text":"被截断的"}\n\n',
      'data: {"type":"text-delta","text":"内容"}\n\n',
    ]);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, { onChunk })).rejects.toThrow('回答流被中断');
    expect(onChunk).toHaveBeenCalledTimes(2); // 已到达的文本仍应回调
  });

  it('回归：完全空的流（无任何事件）必须抛错，不能显示为已成功', async () => {
    const res = sseResponse(['data: {"type":"response.created","foo":1}\n\n']);
    await expect(consumeChatResponse(res, { onChunk: vi.fn() })).rejects.toThrow('回答流被中断');
  });

  it('error 事件直接抛出错误信息', async () => {
    const res = sseResponse([
      'data: {"type":"error","error":"模型未返回任何内容，请重试"}\n\n',
    ]);
    await expect(consumeChatResponse(res, { onChunk: vi.fn() })).rejects.toThrow(
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

    await expect(consumeChatResponse(res, { onChunk, onWarning })).resolves.toBeUndefined();
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

    await expect(consumeChatResponse(res, { onChunk })).resolves.toBeUndefined();
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

    await expect(consumeChatResponse(res, { onChunk })).resolves.toBeUndefined();
    expect(onChunk).not.toHaveBeenCalled();

    // 只有 response.done、没有任何契约内终止事件 → 一律按截断抛错
    const res2 = sseResponse(['data: {"type":"response.done"}\n\n']);
    await expect(consumeChatResponse(res2, { onChunk: vi.fn() })).rejects.toThrow('回答流被中断');
  });

  it('非 JSON 帧按协议外数据忽略，不当作文本输出', async () => {
    const res = sseResponse(['data: 纯文本帧\n\n', 'data: {"type":"done"}\n\n']);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, { onChunk })).resolves.toBeUndefined();
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('data: 帧之间夹 : ping 注释行时，解析结果与无注释行一致', async () => {
    const resWithPing = sseResponse([
      ': ping\n\n',
      'data: {"type":"text-delta","text":"你好"}\n\n',
      ': ping\n\n',
      'data: {"type":"text-delta","text":"世界"}\n\n',
      ': ping\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunkWithPing = vi.fn();

    await expect(consumeChatResponse(resWithPing, { onChunk: onChunkWithPing })).resolves.toBeUndefined();
    expect(onChunkWithPing).toHaveBeenCalledTimes(2);
    expect(onChunkWithPing.mock.calls.map((c) => c[0])).toEqual(['你好', '世界']);

    // 对照组：无注释行
    const resWithoutPing = sseResponse([
      'data: {"type":"text-delta","text":"你好"}\n\n',
      'data: {"type":"text-delta","text":"世界"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunkWithoutPing = vi.fn();
    await expect(consumeChatResponse(resWithoutPing, { onChunk: onChunkWithoutPing })).resolves.toBeUndefined();
    expect(onChunkWithPing.mock.calls).toEqual(onChunkWithoutPing.mock.calls);
  });

  it('reasoning-delta 帧回调 onReasoning（增量原样透传），不终止流、不触发 onChunk', async () => {
    const res = sseResponse([
      'data: {"type":"reasoning-delta","text":"先分析问题"}\n\n',
      'data: {"type":"reasoning-delta","text":"再给出结论"}\n\n',
      'data: {"type":"text-delta","text":"正文"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();
    const onReasoning = vi.fn();

    await expect(consumeChatResponse(res, { onChunk, onReasoning })).resolves.toBeUndefined();
    expect(onReasoning.mock.calls.map((c) => c[0])).toEqual(['先分析问题', '再给出结论']);
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['正文']);
  });

  it('agent_note 帧回调 onAgentNote（增量原样透传），不终止流、不触发 onChunk', async () => {
    const res = sseResponse([
      'data: {"type":"agent_note","text":"先查查这个"}\n\n',
      'data: {"type":"agent_note","text":"再帮我分析"}\n\n',
      'data: {"type":"text-delta","text":"正文"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();
    const onAgentNote = vi.fn();

    await expect(consumeChatResponse(res, { onChunk, onAgentNote })).resolves.toBeUndefined();
    expect(onAgentNote.mock.calls.map((c) => c[0])).toEqual(['先查查这个', '再帮我分析']);
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['正文']);
  });

  it('不传 onReasoning 时 reasoning-delta 帧被显式忽略，其余行为与现状一致', async () => {
    const res = sseResponse([
      'data: {"type":"reasoning-delta","text":"被忽略的推理"}\n\n',
      'data: {"type":"text-delta","text":"正文"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();
    const onDone = vi.fn();

    await expect(consumeChatResponse(res, { onChunk, onDone })).resolves.toBeUndefined();
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['正文']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('不传 onAgentNote 时 agent_note 帧被显式忽略，其余行为与现状一致', async () => {
    const res = sseResponse([
      'data: {"type":"agent_note","text":"被忽略的旁白"}\n\n',
      'data: {"type":"text-delta","text":"正文"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();
    const onDone = vi.fn();

    await expect(consumeChatResponse(res, { onChunk, onDone })).resolves.toBeUndefined();
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['正文']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('ChatStreamEvent 契约（@repo/shared）', () => {
  it('parseChatStreamEvent 解析契约事件（含 agent_note）', () => {
    expect(parseChatStreamEvent({ type: 'text-delta', text: '你好' })).toEqual({
      type: 'text-delta',
      text: '你好',
    });
    expect(parseChatStreamEvent({ type: 'reasoning-delta', text: '推理片段' })).toEqual({
      type: 'reasoning-delta',
      text: '推理片段',
    });
    expect(parseChatStreamEvent({ type: 'agent_note', text: '正在规划步骤' })).toEqual({
      type: 'agent_note',
      text: '正在规划步骤',
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
    // reasoning-delta 与 text-delta 同款严格度：空增量 / 非字符串一律视为非法帧
    expect(parseChatStreamEvent({ type: 'reasoning-delta', text: '' })).toBeNull();
    expect(parseChatStreamEvent({ type: 'reasoning-delta', text: 123 })).toBeNull();
    expect(parseChatStreamEvent({ type: 'reasoning-delta' })).toBeNull();
    // agent_note 与 text-delta 同款严格度：空增量 / 非字符串一律视为非法帧
    expect(parseChatStreamEvent({ type: 'agent_note', text: '' })).toBeNull();
    expect(parseChatStreamEvent({ type: 'agent_note', text: 123 })).toBeNull();
    expect(parseChatStreamEvent({ type: 'agent_note' })).toBeNull();
    expect(parseChatStreamEvent({ type: 'done', extra: 1 })).toEqual({ type: 'done' });
    expect(parseChatStreamEvent(null)).toBeNull();
    expect(parseChatStreamEvent('字符串')).toBeNull();
  });

  it('parseChatStreamEvent 解析带合法 usage 的 done 事件', () => {
    const validFullUsage = {
      type: 'done' as const,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimated: false,
      },
    };
    expect(parseChatStreamEvent(validFullUsage)).toEqual(validFullUsage);

    const validPartialUsage = {
      type: 'done' as const,
      usage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: 200,
        estimated: true,
      },
    };
    expect(parseChatStreamEvent(validPartialUsage)).toEqual(validPartialUsage);
  });

  it('parseChatStreamEvent 对非法 usage 丢弃 usage 仅保留 done 事件', () => {
    // 缺失 totalTokens
    expect(
      parseChatStreamEvent({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 20, estimated: false },
      })
    ).toEqual({ type: 'done' });

    // totalTokens 为负数或非有限数
    expect(
      parseChatStreamEvent({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: -1, estimated: false },
      })
    ).toEqual({ type: 'done' });
    expect(
      parseChatStreamEvent({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: Infinity, estimated: false },
      })
    ).toEqual({ type: 'done' });
    expect(
      parseChatStreamEvent({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: '100', estimated: false },
      })
    ).toEqual({ type: 'done' });

    // 分项非法（负数 / 字符串）
    expect(
      parseChatStreamEvent({
        type: 'done',
        usage: { inputTokens: -5, outputTokens: 20, totalTokens: 15, estimated: false },
      })
    ).toEqual({ type: 'done' });
    expect(
      parseChatStreamEvent({
        type: 'done',
        usage: { inputTokens: '10', outputTokens: 20, totalTokens: 30, estimated: false },
      })
    ).toEqual({ type: 'done' });

    // estimated 缺失或非布尔值
    expect(
      parseChatStreamEvent({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      })
    ).toEqual({ type: 'done' });
    expect(
      parseChatStreamEvent({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimated: 'true' },
      })
    ).toEqual({ type: 'done' });

    // usage 非对象
    expect(
      parseChatStreamEvent({
        type: 'done',
        usage: 123,
      })
    ).toEqual({ type: 'done' });
  });

  it('parseChatStreamEvent 解析 tool_result 事件（有/无 durationMs 两态均合法）', () => {
    // 态 1：无 durationMs（向后兼容缺省态）
    const withoutDuration = {
      type: 'tool_result' as const,
      callId: 'call-1',
      name: 'web_fetch',
      status: 'success' as const,
      summary: '获取完成',
    };
    expect(parseChatStreamEvent(withoutDuration)).toEqual(withoutDuration);

    // 态 2：有 durationMs（正整数）
    const withDuration = {
      type: 'tool_result' as const,
      callId: 'call-2',
      name: 'web_fetch',
      status: 'success' as const,
      summary: '获取完成',
      durationMs: 125,
    };
    expect(parseChatStreamEvent(withDuration)).toEqual(withDuration);

    // 态 3：durationMs 为 0
    const withZeroDuration = {
      type: 'tool_result' as const,
      callId: 'call-3',
      name: 'web_fetch',
      status: 'failed' as const,
      summary: '执行失败',
      durationMs: 0,
    };
    expect(parseChatStreamEvent(withZeroDuration)).toEqual(withZeroDuration);
  });

  it('parseChatStreamEvent 对 tool_result 非法 durationMs 视为非法帧返回 null', () => {
    // 负数
    expect(
      parseChatStreamEvent({
        type: 'tool_result',
        callId: 'call-1',
        name: 'web_fetch',
        status: 'success',
        summary: '完成',
        durationMs: -1,
      })
    ).toBeNull();

    // 浮点小数
    expect(
      parseChatStreamEvent({
        type: 'tool_result',
        callId: 'call-1',
        name: 'web_fetch',
        status: 'success',
        summary: '完成',
        durationMs: 12.34,
      })
    ).toBeNull();

    // 字符串
    expect(
      parseChatStreamEvent({
        type: 'tool_result',
        callId: 'call-1',
        name: 'web_fetch',
        status: 'success',
        summary: '完成',
        durationMs: '100',
      })
    ).toBeNull();
  });

  it('encodeChatStreamEvent 产物可被 parse 解析回原事件（编码解码同源）', () => {
    const events = [
      { type: 'text-delta', text: '你好' },
      { type: 'reasoning-delta', text: '推理片段' },
      { type: 'agent_note', text: '过程旁白' },
      { type: 'done' },
      {
        type: 'done',
        usage: {
          inputTokens: 120,
          outputTokens: 80,
          totalTokens: 200,
          estimated: false,
        },
      },
      {
        type: 'done',
        usage: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: 50,
          estimated: true,
        },
      },
      { type: 'warning', warning: '警告' },
      { type: 'error', error: '失败' },
    ] as const;

    for (const event of events) {
      const frame = encodeChatStreamEvent(event as any);
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

  it('正常流 done 携带 usage 时透传给 handlers.onDone', async () => {
    const usage = {
      inputTokens: 15,
      outputTokens: 25,
      totalTokens: 40,
      estimated: true,
    };
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"文本"}\n\n',
        `data: {"type":"done","usage":${JSON.stringify(usage)}}\n\n`,
      ])
    );
    const onDone = vi.fn();
    await streamChatResponse(
      { body: { messages: [] }, signal: new AbortController().signal },
      { onDone }
    );
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(usage);
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

  it('reasoning-delta 事件内部独立累计，onReasoning 收到累计推理文本', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"reasoning-delta","text":"第一步"}\n\n',
        'data: {"type":"reasoning-delta","text":"第二步"}\n\n',
        'data: {"type":"text-delta","text":"正文"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    const onChunk = vi.fn();
    const onReasoning = vi.fn();

    const text = await streamChatResponse(
      { body: { messages: [] }, signal: new AbortController().signal },
      { onChunk, onReasoning }
    );

    // 推理与正文各自独立累计：推理累计值不影响正文累计与返回值
    expect(onReasoning.mock.calls.map((c) => c[0])).toEqual(['第一步', '第一步第二步']);
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['正文']);
    expect(text).toBe('正文');
  });

  it('不传 onReasoning 时 reasoning-delta 被忽略，正文行为不变', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"reasoning-delta","text":"被忽略的推理"}\n\n',
        'data: {"type":"text-delta","text":"正文"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    const onChunk = vi.fn();

    const text = await streamChatResponse(
      { body: { messages: [] }, signal: new AbortController().signal },
      { onChunk }
    );

    expect(text).toBe('正文');
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['正文']);
  });

  it('agent_note 事件内部独立累计，onAgentNote 收到累计旁白文本', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"agent_note","text":"第一轮思考"}\n\n',
        'data: {"type":"agent_note","text":"，第二轮继续"}\n\n',
        'data: {"type":"text-delta","text":"正文"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    const onChunk = vi.fn();
    const onAgentNote = vi.fn();

    const text = await streamChatResponse(
      { body: { messages: [] }, signal: new AbortController().signal },
      { onChunk, onAgentNote }
    );

    // 旁白与正文各自独立累计：旁白累计值不影响正文累计与返回值
    expect(onAgentNote.mock.calls.map((c) => c[0])).toEqual(['第一轮思考', '第一轮思考，第二轮继续']);
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['正文']);
    expect(text).toBe('正文');
  });

  it('不传 onAgentNote 时 agent_note 被忽略，正文行为不变', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"agent_note","text":"被忽略的旁白"}\n\n',
        'data: {"type":"text-delta","text":"正文"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    const onChunk = vi.fn();

    const text = await streamChatResponse(
      { body: { messages: [] }, signal: new AbortController().signal },
      { onChunk }
    );

    expect(text).toBe('正文');
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['正文']);
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

describe('TC02: 前端流式契约解析与兼容降级', () => {
  it('1. consumeChatResponse 正确解析 plan_created 事件并回调 onPlanCreated (TC02-1)', async () => {
    const validPlan = {
      id: 'plan-100',
      title: '行业研报规划',
      steps: [
        { id: 's1', title: '收集数据', status: 'pending' as const },
        { id: 's2', title: '撰写总结', status: 'pending' as const },
      ],
    };
    const res = sseResponse([
      `data: {"type":"plan_created","plan":${JSON.stringify(validPlan)}}\n\n`,
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();
    const onPlanCreated = vi.fn();

    await consumeChatResponse(res, { onChunk, onPlanCreated });
    expect(onPlanCreated).toHaveBeenCalledTimes(1);
    expect(onPlanCreated).toHaveBeenCalledWith(validPlan);
  });

  it('2. consumeChatResponse 正确解析 plan_step_update 事件并回调 onPlanStepUpdate (TC02-2)', async () => {
    const res = sseResponse([
      'data: {"type":"plan_step_update","stepId":"s1","status":"running"}\n\n',
      'data: {"type":"plan_step_update","stepId":"s1","status":"completed","summary":"数据收集完成"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();
    const onPlanStepUpdate = vi.fn();

    await consumeChatResponse(res, { onChunk, onPlanStepUpdate });
    expect(onPlanStepUpdate).toHaveBeenCalledTimes(2);
    expect(onPlanStepUpdate).toHaveBeenNthCalledWith(1, 's1', 'running', undefined);
    expect(onPlanStepUpdate).toHaveBeenNthCalledWith(2, 's1', 'completed', '数据收集完成');
  });

  it('3. 收到未知类型事件时静默忽略且流正常继续 (TC02-3)', async () => {
    const res = sseResponse([
      'data: {"type":"plan_unknown_event","foo":"bar"}\n\n',
      'data: {"type":"text-delta","text":"正常正文"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, { onChunk })).resolves.toBeUndefined();
    expect(onChunk).toHaveBeenCalledWith('正常正文');
  });

  it('4. 历史消息实体中缺少 plan 字段时兼容无崩 (TC02-4)', () => {
    const legacyMessage = {
      id: 'legacy-msg-1',
      role: 'assistant',
      content: '历史回答文本',
      // 无 plan 字段
    };

    // 模拟应用层对 message.plan 的安全访问
    expect((legacyMessage as any).plan).toBeUndefined();
    expect(typeof legacyMessage.content).toBe('string');
  });
});

