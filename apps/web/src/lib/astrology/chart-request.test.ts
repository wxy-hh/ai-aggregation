/**
 * chart-request.test.ts —— 星座寰宇 · 报告流调用侧守则测试（02 建接缝，03 接流式解读）
 *
 * 锁定的规则（全部为外部行为：给定 SSE 流 → 兑现结果与工作区状态）：
 * - chart-facts 帧到达即兑现真值；随后 headline → bigThree → modules → transits 分区逐区落工作区，
 *   状态推进到 ready 且 report 累计到达（未到达的分区保持 null / 空数组）；
 * - 解读降级（quota / model）清空 report 并落 unavailable：绝不留半份冒充产出；
 *   额度不足同时唤起既有额度耗尽对话框（星盘照常兑现，不因额度失败）；
 * - 过期响应整体丢弃：连续提交时先发流既不兑现真值，也不改写工作区；
 * - 失败映射：真值超时 'timeout'、请求体不合法 'validation'、服务端失败 'model'、其余 'unknown'；
 * - 真值到达后的解读首帧收口：分区首帧即撤掉计时；久候不至按「解读未完成」收口并中止流。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }));

import { authFetch } from '@/lib/api/client';
import { onQuotaExhausted } from '@/lib/api/quota-events';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { createDefaultAstrologyFormData } from '@/app/destiny/_components/astrology-types';
import type { AstrologyFormData } from '@/app/destiny/_components/astrology-types';
import { SAMPLE_CHART_ACCURATE, SAMPLE_CHART_UNKNOWN } from './sample-chart';
import {
  ASTROLOGY_REPORT_ENDPOINT,
  CHART_FACTS_TIMEOUT_MS,
  ChartFactsRequestError,
  INTERPRETATION_SIGNAL_TIMEOUT_MS,
  chartFactsErrorKind,
  isLatestChartFactsRequest,
  parseSseFrame,
  startChartFactsRequest,
  takeSseFrames,
} from './chart-request';
import type { AstrologyTransitsSection, ModuleReading } from './interpretation';

const authFetchMock = vi.mocked(authFetch);
const encoder = new TextEncoder();

/** 表单口径请求体（1995-10-08 14:30 上海，准确到分钟档） */
function buildFormData(): AstrologyFormData {
  return {
    ...createDefaultAstrologyFormData(),
    name: '小宇',
    birthDate: { year: 1995, month: 10, day: 8 },
    topic: 'self',
    timePrecision: 'accurate',
    birthTime: { hour: '14', minute: '30' },
    location: { name: '上海', lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai' },
  };
}

const FORM_DATA = buildFormData();

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

function interpretationOf() {
  return useDestinyWorkspaceStore.getState().astrology.interpretation;
}

describe('startChartFactsRequest（真实 SSE 报告流接缝）', () => {
  beforeEach(() => {
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
    authFetchMock.mockReset();
  });

  afterEach(() => {
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
  });

  it('chart-facts 帧到达即兑现真值，解读结论随后落到工作区', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { token, result } = startChartFactsRequest(FORM_DATA);
    expect(isLatestChartFactsRequest(token)).toBe(true);
    expect(interpretationOf()).toEqual({ status: 'pending', reason: null, report: null });
    expect(authFetchMock).toHaveBeenCalledWith(
      ASTROLOGY_REPORT_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ...FORM_DATA, provider: 'doubao' }),
      })
    );

    stream.push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(result).resolves.toEqual(SAMPLE_CHART_ACCURATE);

    stream.push({ type: 'interpretation-unavailable', reason: 'not-wired' });
    stream.push({ type: 'complete' });
    stream.close();

    await vi.waitFor(() =>
      expect(interpretationOf()).toEqual({ status: 'unavailable', reason: 'not-wired', report: null })
    );
  });

  it('额度不足：真值照常兑现，解读降级并唤起既有额度耗尽对话框', async () => {
    const quotaListener = vi.fn();
    const off = onQuotaExhausted(quotaListener);
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startChartFactsRequest(FORM_DATA);
    stream.push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(result).resolves.toEqual(SAMPLE_CHART_ACCURATE);

    stream.push({ type: 'interpretation-unavailable', reason: 'quota' });
    stream.push({ type: 'complete' });
    stream.close();

    await vi.waitFor(() =>
      expect(interpretationOf()).toEqual({ status: 'unavailable', reason: 'quota', report: null })
    );
    expect(quotaListener).toHaveBeenCalledTimes(1);
    off();
  });

  it('过期响应整体丢弃：先发流不兑现真值，也不改写工作区', async () => {
    const stale = manualSseStream();
    const fresh = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stale.response).mockResolvedValueOnce(fresh.response);

    const first = startChartFactsRequest(FORM_DATA, { timeoutMs: 4_000 });
    const second = startChartFactsRequest(FORM_DATA, { timeoutMs: 4_000 });
    expect(isLatestChartFactsRequest(first.token)).toBe(false);
    expect(isLatestChartFactsRequest(second.token)).toBe(true);

    // 先发流的真值与解读事件都已过期：既不兑现，也不写回
    stale.push({ type: 'chart-facts', facts: SAMPLE_CHART_UNKNOWN });
    stale.push({ type: 'interpretation-unavailable', reason: 'quota' });
    expect(await settledWithin(first.result)).toBe(false);
    expect(interpretationOf()).toEqual({ status: 'pending', reason: null, report: null });

    // 后发流照常工作
    fresh.push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(second.result).resolves.toEqual(SAMPLE_CHART_ACCURATE);
    fresh.push({ type: 'interpretation-unavailable', reason: 'not-wired' });
    fresh.push({ type: 'complete' });
    fresh.close();
    await vi.waitFor(() =>
      expect(interpretationOf()).toEqual({ status: 'unavailable', reason: 'not-wired', report: null })
    );
  });

  it('让位竞态：旧流被 abort 后的 AbortError 不得改写新一轮的工作区状态', async () => {
    // 真实 fetch 语义：signal 中止后 read() 以 AbortError 拒绝（手动流不会拒绝，必须按信号建流）
    const streams: Array<{ push: (event: unknown) => void }> = [];
    authFetchMock.mockImplementation(async (_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal ?? null;
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      let ended = false;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
          signal?.addEventListener('abort', () => {
            if (ended) return;
            ended = true;
            controller.error(new DOMException('The operation was aborted.', 'AbortError'));
          });
        },
      });
      streams.push({
        push: (event) => {
          if (ended) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    });

    const first = startChartFactsRequest(FORM_DATA, { timeoutMs: 4_000 });
    // 第二次提交：同步 abort 旧流 → 旧流 read() 以 AbortError 拒绝
    const second = startChartFactsRequest(FORM_DATA, { timeoutMs: 4_000 });
    expect(isLatestChartFactsRequest(first.token)).toBe(false);

    // 两条流都已建好，且旧流的失败收口已传播
    await vi.waitFor(() => expect(streams).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 25));
    // 关键断言：旧流的 abort 收口被整体丢弃——新一轮仍是「解读在途」，不被改写成失败
    expect(interpretationOf()).toEqual({ status: 'pending', reason: null, report: null });

    // 新流照常推进：真值兑现、分区落库（不被旧流清空）
    streams[1].push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(second.result).resolves.toEqual(SAMPLE_CHART_ACCURATE);
    streams[1].push({
      type: 'headline',
      headline: { text: '在秩序与自由之间，你正在学会把感受说清楚。', factReferences: ['planet:sun:sign'] },
    });
    await vi.waitFor(() => expect(interpretationOf().status).toBe('ready'));
    expect(interpretationOf().report?.headline?.text).toBe('在秩序与自由之间，你正在学会把感受说清楚。');
  });

  it('真值超时：按 timeout 落档（上限可注入，默认 15s；解读收口上限 20s）', async () => {
    expect(CHART_FACTS_TIMEOUT_MS).toBe(15_000);
    expect(INTERPRETATION_SIGNAL_TIMEOUT_MS).toBe(45_000);

    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);
    const { result } = startChartFactsRequest(FORM_DATA, { timeoutMs: 5 });

    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChartFactsRequestError);
    expect(chartFactsErrorKind(error)).toBe('timeout');
  });

  it('失败映射：请求体不合法 → validation，服务端失败 → model', async () => {
    authFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: '请求参数错误',
          details: [{ path: 'birthDate', message: '日期无效或晚于今天，请检查后重选' }],
        }),
        { status: 400 }
      )
    );
    const validation = await startChartFactsRequest(FORM_DATA).result.catch((e: unknown) => e);
    expect(chartFactsErrorKind(validation)).toBe('validation');
    expect((validation as Error).message).toContain('日期无效或晚于今天');

    authFetchMock.mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const upstream = await startChartFactsRequest(FORM_DATA).result.catch((e: unknown) => e);
    expect(chartFactsErrorKind(upstream)).toBe('model');
  });

  it('真值下发前的 error 事件：按服务端失败落档，解读一并收口', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startChartFactsRequest(FORM_DATA, { timeoutMs: 1_000 });
    stream.push({ type: 'error', message: '星盘计算失败，请稍后重试' });

    const error = await result.catch((e: unknown) => e);
    expect(chartFactsErrorKind(error)).toBe('model');
    expect((error as Error).message).toBe('星盘计算失败，请稍后重试');
    await vi.waitFor(() =>
      expect(interpretationOf()).toEqual({ status: 'unavailable', reason: 'unknown', report: null })
    );
  });

  it('真值到达后流中断（无任何解读信号）：星盘照常兑现，解读按未知收口', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startChartFactsRequest(FORM_DATA, { signalTimeoutMs: 4_000 });
    stream.push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(result).resolves.toEqual(SAMPLE_CHART_ACCURATE);

    stream.close();
    await vi.waitFor(() =>
      expect(interpretationOf()).toEqual({ status: 'unavailable', reason: 'unknown', report: null })
    );
  });

  it('真值到达后解读首帧久候不至：按「解读未完成（model）」收口', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startChartFactsRequest(FORM_DATA, { timeoutMs: 1_000, signalTimeoutMs: 5 });
    stream.push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(result).resolves.toEqual(SAMPLE_CHART_ACCURATE);

    await vi.waitFor(() =>
      expect(interpretationOf()).toEqual({ status: 'unavailable', reason: 'model', report: null })
    );
  });

  /* ---------- 03 工单：流式解读分区 ---------- */

  it('headline → bigThree → modules → transits 逐区落工作区，状态推进到 ready', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startChartFactsRequest(FORM_DATA);
    stream.push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(result).resolves.toEqual(SAMPLE_CHART_ACCURATE);

    // 分区一到达：ready 且只填 headline（未到达的分区保持 null / 空数组，界面按分区骨架占位）
    stream.push({
      type: 'headline',
      headline: { text: '在稳定与自由之间，练习把感受说清楚。', factReferences: ['planet:sun:sign'] },
    });
    await vi.waitFor(() => expect(interpretationOf().status).toBe('ready'));
    expect(interpretationOf().report).toEqual({
      headline: { text: '在稳定与自由之间，练习把感受说清楚。', factReferences: ['planet:sun:sign'] },
      bigThree: null,
      modules: [],
      transits: null,
    });

    // 分区二/三/四到达：累计填充，不覆盖已到达的分区
    stream.push({
      type: 'bigThree',
      bigThree: {
        sun: { plain: '白话', action: '动作' },
        moon: { plain: '白话', action: '动作' },
        ascendant: null,
      },
    });
    const modules: ModuleReading[] = [
      {
        id: 'who',
        title: '我是谁',
        summary: '正文',
        tags: ['太阳天秤'],
        action: '行动',
        factReferences: ['planet:sun:sign'],
      },
    ];
    stream.push({ type: 'modules', modules });
    const transits: AstrologyTransitsSection = {
      weekRange: '9 月 1 日 – 9 月 7 日',
      transitNote: '行运太阳正与本命金星成合相（偏差约 1.2°）',
      opportunity: '机会',
      caution: '留意',
      action: '行动',
      transitReferences: ['transit:sun:conjunction:venus'],
      keyAspects: [{ refKey: 'aspect:moon:square:sun', energy: 'e', life: 'l', practice: 'p' }],
    };
    stream.push({ type: 'transits', transits });
    stream.push({ type: 'complete' });
    stream.close();

    await vi.waitFor(() => expect(interpretationOf().report?.transits).toEqual(transits));
    expect(interpretationOf()).toMatchObject({ status: 'ready', reason: null });
    expect(interpretationOf().report?.headline?.text).toContain('稳定与自由');
    expect(interpretationOf().report?.modules).toEqual(modules);
  });

  it('ready 后流中断：已到达的解读分区保留（不回退、不清空）', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startChartFactsRequest(FORM_DATA, { signalTimeoutMs: 4_000 });
    stream.push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(result).resolves.toEqual(SAMPLE_CHART_ACCURATE);
    stream.push({
      type: 'headline',
      headline: { text: '练习把感受说清楚。', factReferences: ['planet:sun:sign'] },
    });
    await vi.waitFor(() => expect(interpretationOf().status).toBe('ready'));

    stream.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(interpretationOf()).toMatchObject({ status: 'ready', reason: null });
    expect(interpretationOf().report?.headline?.text).toBe('练习把感受说清楚。');
  });

  it('解读降级清空已到达分区：绝不留半份冒充产出', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startChartFactsRequest(FORM_DATA);
    stream.push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(result).resolves.toEqual(SAMPLE_CHART_ACCURATE);
    stream.push({
      type: 'headline',
      headline: { text: '练习把感受说清楚。', factReferences: ['planet:sun:sign'] },
    });
    await vi.waitFor(() => expect(interpretationOf().status).toBe('ready'));

    stream.push({ type: 'interpretation-unavailable', reason: 'model' });
    stream.push({ type: 'complete' });
    stream.close();

    await vi.waitFor(() =>
      expect(interpretationOf()).toEqual({ status: 'unavailable', reason: 'model', report: null })
    );
  });

  it('请求体带当前模型切换器口径的 provider（默认豆包，切换后随请求发送）', async () => {
    useDestinyWorkspaceStore.getState().setProvider('deepseek');
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startChartFactsRequest(FORM_DATA);
    stream.push({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE });
    await expect(result).resolves.toEqual(SAMPLE_CHART_ACCURATE);

    expect(authFetchMock).toHaveBeenCalledWith(
      ASTROLOGY_REPORT_ENDPOINT,
      expect.objectContaining({
        body: JSON.stringify({ ...FORM_DATA, provider: 'deepseek' }),
      })
    );
    useDestinyWorkspaceStore.getState().setProvider('doubao');
  });

  it('帧解析：兼容 CRLF 与跨块切割', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValue(stream.response);

    const { result } = startChartFactsRequest(FORM_DATA);
    const frame = `data: ${JSON.stringify({ type: 'chart-facts', facts: SAMPLE_CHART_ACCURATE })}\r\n\r\n`;
    stream.push(frame.slice(0, 20));
    stream.push(frame.slice(20));

    await expect(result).resolves.toEqual(SAMPLE_CHART_ACCURATE);
    expect(takeSseFrames('data: {"a":1}\n\ndata: {"b"')).toEqual({
      frames: ['data: {"a":1}'],
      rest: 'data: {"b"',
    });
    expect(parseSseFrame('event: ping\ndata: {"type":"complete"}')).toEqual({ type: 'complete' });
    expect(parseSseFrame('data: 不是 JSON')).toBeNull();
  });
});
