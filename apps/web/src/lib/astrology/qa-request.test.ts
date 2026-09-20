/**
 * qa-request.test.ts —— 星座寰宇 · 星语问答调用侧守则测试（04 工单接缝切换）
 *
 * 锁定的规则（全部为外部行为：给定 SSE 流 → 兑现答案与可见文案）：
 * - 请求体携带报告上下文（盘面事实 + 生活模块）、用户问题、本报告已提问数与模型切换器口径的 provider；
 * - 正文增量逐帧回调（流式浮现），终帧给出完整回答（kind / text / citations）；
 * - 过期响应整体丢弃：连续提问时先发的流既不回调增量，也不改写结论（令牌单调递增）；
 * - 中断：流意外关闭按失败收口；被新提问取代的请求以「已取消」收口；
 * - 失败映射：额度不足 'quota'、超 3 问 'limit'、鉴权 'auth'、请求体不合法 'validation'、
 *   服务端失败 'model'、其余 'unknown'；可见文案一律中文。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }));

import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { computeChartFacts } from './chart-engine';
import { SAMPLE_PROFILE_ACCURATE } from './sample-chart';
import type { AstrologyChartFacts } from './chart-facts';
import type { ModuleReading } from './interpretation';
import {
  ASTROLOGY_QA_ENDPOINT,
  AstrologyQaRequestError,
  abortAstrologyQaRequest,
  astrologyQaErrorMessage,
  isLatestAstrologyQaRequest,
  requestAstrologyAnswer,
  startAstrologyQaRequest,
} from './qa-request';

const authFetchMock = vi.mocked(authFetch);
const encoder = new TextEncoder();

const FACTS: AstrologyChartFacts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
/** 生活模块夹具：真实报告里由模型产出（报告路由下发），这里按同一形状构造一份稳定数据 */
const MODULES: ModuleReading[] = [
  { id: 'who', title: '我是谁', summary: '核心气质偏向先照顾气氛。', tags: ['太阳 天秤'], action: '先说自己的想法。', factReferences: ['planet:sun:sign'] },
  { id: 'love', title: '关系如何运作', summary: '在关系里需要被稳定回应。', tags: ['月亮 白羊'], action: '先说感受，再谈事情。', factReferences: ['planet:moon:sign'] },
  { id: 'career', title: '事业如何发挥', summary: '推进工作偏向细致务实。', tags: ['水星 天秤'], action: '把大事拆成最小一步。', factReferences: ['planet:mercury:sign'] },
  { id: 'strengths', title: '我的优势与盲点', summary: '天赋来自自然同频的相位。', tags: ['金星 处女'], action: '记录毫不费力的瞬间。', factReferences: ['planet:venus:sign'] },
  { id: 'week', title: '本周宇宙提示', summary: '本周适合主动创造新鲜体验。', tags: ['本周', '行运'], action: '写下三件做得好小事。', factReferences: ['planet:mars:sign'] },
];
const QUESTION = '我在亲密关系里最需要被理解的是什么？';
const ANSWER_TEXT = '你在关系里最需要的是被认真回应。\n可以练习：先说感受，再谈事情。';

/* ---------- SSE 测试流工具 ---------- */

/** 手工可控的 SSE 流：测试自行决定何时推帧、何时关流 */
function manualSseStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
    /** 推送一帧（可传原始文本以模拟分块与 CRLF） */
    push(event: unknown | string) {
      const text = typeof event === 'string' ? event : `data: ${JSON.stringify(event)}\n\n`;
      controller.enqueue(encoder.encode(text));
    },
    close() {
      controller.close();
    },
  };
}

/** 在给定时限内该 Promise 是否已兑现（用于断言「过期响应整体丢弃」） */
async function settledWithin(promise: Promise<unknown>, ms = 60): Promise<boolean> {
  return Promise.race([
    promise.then(
      () => true,
      () => true
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

function errorOf(error: unknown) {
  return error as AstrologyQaRequestError;
}

describe('startAstrologyQaRequest（真实 SSE 问答接缝）', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
  });

  afterEach(() => {
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
  });

  it('流式消费：正文增量逐帧回调，终帧兑现完整回答', async () => {
    const deltas: string[] = [];
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { token, result } = startAstrologyQaRequest(QUESTION, FACTS, MODULES, {
      onDelta: (text) => deltas.push(text),
    });
    expect(isLatestAstrologyQaRequest(token)).toBe(true);

    await vi.waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    const [, init] = authFetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBeTruthy();
    // 请求体携带报告上下文（盘面事实 + 生活模块）、问题与模型口径（不设每报告次数上限）
    const body = JSON.parse(init!.body as string) as {
      report: { facts: AstrologyChartFacts; modules: ModuleReading[] };
      question: string;
      timePrecision: string;
      provider: string;
    };
    expect(body.question).toBe(QUESTION);
    expect(body.provider).toBe('doubao');
    expect(body.timePrecision).toBe('accurate');
    expect(body.report.facts.calculationRevision).toBe(FACTS.calculationRevision);
    expect(body.report.modules).toHaveLength(MODULES.length);

    stream.push({ type: 'text-delta', text: '你在关系里' });
    stream.push({ type: 'text-delta', text: '最需要的是被认真回应。' });
    expect(await settledWithin(result)).toBe(false);

    stream.push({
      type: 'answer',
      answer: {
        kind: 'answer',
        text: ANSWER_TEXT,
        citations: [{ label: '关系如何运作', moduleId: 'love' }],
      },
    });
    stream.close();

    await expect(result).resolves.toEqual({
      kind: 'answer',
      text: ANSWER_TEXT,
      citations: [{ label: '关系如何运作', moduleId: 'love' }],
    });
    expect(deltas).toEqual(['你在关系里', '最需要的是被认真回应。']);
  });

  it('敏感拦截：服务端给的是正常回答帧（kind=blocked），前端无感知差异', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startAstrologyQaRequest('我该不该去看病？', FACTS, MODULES, {});
    await vi.waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    stream.push({
      type: 'answer',
      answer: {
        kind: 'blocked',
        text: '这个问题触及医疗话题——星盘解读不能据此作出医疗、财务或法律判断。',
        citations: [{ label: '我是谁', moduleId: 'who' }],
      },
    });
    stream.close();

    await expect(result).resolves.toMatchObject({ kind: 'blocked' });
  });

  it('请求体带当前模型切换器口径的 provider（默认豆包，切换后随请求发送）', async () => {
    useDestinyWorkspaceStore.getState().setProvider('deepseek');
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startAstrologyQaRequest(QUESTION, FACTS, MODULES, {});
    await vi.waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse(authFetchMock.mock.calls[0][1]!.body as string) as Record<string, unknown>;
    expect(body.provider).toBe('deepseek');

    stream.push({ type: 'error', error: '问答暂时不可用' });
    stream.close();
    await expect(result).rejects.toBeInstanceOf(AstrologyQaRequestError);
    useDestinyWorkspaceStore.getState().setProvider('doubao');
  });

  it('中断：流意外关闭且没有终帧时按失败收口（已到达的增量不当作答案）', async () => {
    const deltas: string[] = [];
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startAstrologyQaRequest(QUESTION, FACTS, MODULES, {
      onDelta: (text) => deltas.push(text),
    });
    await vi.waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    stream.push({ type: 'text-delta', text: '半句' });
    stream.close();

    const error = await result.catch((e: unknown) => e);
    expect(errorOf(error).kind).toBe('unknown');
    expect(errorOf(error).message).toBe('这次没能取回回答，可以稍后换一种问法再试一次。');
    expect(deltas).toEqual(['半句']);
  });

  it('令牌失效：新提问让位旧请求，旧流的增量与结论一律丢弃', async () => {
    const staleDeltas: string[] = [];
    const freshDeltas: string[] = [];
    const stale = manualSseStream();
    const fresh = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stale.response).mockResolvedValueOnce(fresh.response);

    const first = startAstrologyQaRequest(QUESTION, FACTS, MODULES, {
      onDelta: (text) => staleDeltas.push(text),
    });
    const second = startAstrologyQaRequest('本周工作中适合主动争取什么？', FACTS, MODULES, {
      onDelta: (text) => freshDeltas.push(text),
    });
    expect(isLatestAstrologyQaRequest(first.token)).toBe(false);
    expect(isLatestAstrologyQaRequest(second.token)).toBe(true);

    // 旧请求被取代即收口（调用方按令牌过滤，不会展示这条失败）
    await expect(first.result.catch((e: unknown) => e)).resolves.toMatchObject({ kind: 'aborted' });

    // 旧流即便仍在推送，也不得回调增量或改写结论
    stale.push({ type: 'text-delta', text: '过期正文' });
    stale.push({ type: 'answer', answer: { kind: 'answer', text: '过期答案', citations: [] } });
    expect(await settledWithin(second.result)).toBe(false);
    expect(staleDeltas).toEqual([]);

    fresh.push({ type: 'text-delta', text: '新正文' });
    fresh.push({ type: 'answer', answer: { kind: 'answer', text: '新答案', citations: [] } });
    fresh.close();
    await expect(second.result).resolves.toMatchObject({ text: '新答案' });
    expect(freshDeltas).toEqual(['新正文']);
    stale.close();
  });

  it('取消：在途请求以「已取消」收口，后续帧不再回调增量', async () => {
    const deltas: string[] = [];
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startAstrologyQaRequest(QUESTION, FACTS, MODULES, {
      onDelta: (text) => deltas.push(text),
    });
    await vi.waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));

    abortAstrologyQaRequest();
    await expect(result.catch((e: unknown) => e)).resolves.toMatchObject({ kind: 'aborted' });

    stream.push({ type: 'text-delta', text: '取消后的正文' });
    stream.push({ type: 'answer', answer: { kind: 'answer', text: '取消后的答案', citations: [] } });
    stream.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(deltas).toEqual([]);
  });

  it('失败映射：额度 402 → quota，400 → validation，5xx → model，401 → auth', async () => {
    const cases: Array<{ response: Response; kind: string; messagePart: string }> = [
      {
        response: new Response(
          JSON.stringify({ error: '当前额度不足以处理本次对话', code: 'QUOTA_INSUFFICIENT' }),
          { status: 402 }
        ),
        kind: 'quota',
        messagePart: '额度不足',
      },
      {
        response: new Response(
          JSON.stringify({
            error: '请求参数错误',
            details: [{ path: 'question', message: '问题不能为空' }],
          }),
          { status: 400 }
        ),
        kind: 'validation',
        messagePart: '问题不能为空',
      },
      {
        response: new Response(JSON.stringify({ error: '模型服务暂时不可用' }), { status: 502 }),
        kind: 'model',
        messagePart: '模型服务暂时不可用',
      },
      {
        response: new Response(JSON.stringify({ error: '登录状态已失效' }), { status: 401 }),
        kind: 'auth',
        messagePart: '登录状态已失效',
      },
    ];

    for (const item of cases) {
      authFetchMock.mockResolvedValueOnce(item.response);
      const error = await requestAstrologyAnswer(QUESTION, FACTS, MODULES, {}).catch(
        (e: unknown) => e
      );
      expect(errorOf(error).kind, item.messagePart).toBe(item.kind);
      expect(errorOf(error).message).toContain(item.messagePart);
    }
  });

  it('error 帧：按服务端文案失败收口（不透出兜底答案）', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startAstrologyQaRequest(QUESTION, FACTS, MODULES, {});
    await vi.waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    stream.push({ type: 'error', error: '问答超时，请稍后重试' });
    stream.close();

    const error = await result.catch((e: unknown) => e);
    expect(errorOf(error).kind).toBe('model');
    expect(errorOf(error).message).toBe('问答超时，请稍后重试');
  });

  it('帧解析：兼容 CRLF 与跨块切割', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startAstrologyQaRequest(QUESTION, FACTS, MODULES, {});
    await vi.waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    const frame = `data: ${JSON.stringify({
      type: 'answer',
      answer: { kind: 'answer', text: ANSWER_TEXT, citations: [] },
    })}\r\n\r\n`;
    stream.push(frame.slice(0, 24));
    stream.push(frame.slice(24));
    stream.close();

    await expect(result).resolves.toMatchObject({ text: ANSWER_TEXT });
  });
});

describe('astrologyQaErrorMessage（可见文案一律中文）', () => {
  it('额度沿用服务端提示，其余给中性重试话术', () => {
    const quota = new AstrologyQaRequestError('quota', '当前额度不足以处理本次对话');
    expect(astrologyQaErrorMessage(quota)).toBe('当前额度不足以处理本次对话');

    expect(astrologyQaErrorMessage(new AstrologyQaRequestError('model', '上游失败'))).toBe(
      '这次没能取回回答，可以稍后换一种问法再试一次。'
    );
    expect(astrologyQaErrorMessage(new Error('boom'))).toBe(
      '这次没能取回回答，可以稍后换一种问法再试一次。'
    );
  });
});
