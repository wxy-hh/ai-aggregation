/**
 * chart-request.ts —— 星座寰宇 · 报告流的调用侧守则（02 工单接真实路由；03 工单接流式解读）
 *
 * 提交链路（表单提交 / 仪式重试 / 结果页重试）统一走本模块，避免多处各写一遍时序、失败映射与事件落库：
 * - 请求体为表单同形数据 + 当前 provider（模型切换器口径，默认豆包）；
 * - 真值先行：chart-facts 帧到达即 resolve（result），仪式窗走满后据此转场；
 * - 解读分区：headline → bigThree → modules → transits 逐区写入工作区（status 推进到 ready，
 *   界面按分区替换骨架），同一份 report 累计到达；解读降级事件清空 report 并落 unavailable；
 * - 解读首帧收口：真值到达后 ${INTERPRETATION_SIGNAL_TIMEOUT_MS}ms 内没有任何解读信号
 *   （分区或降级事件），按「解读未完成」收口并中止流——结果页不无限骨架（重试只重跑解读链路）；
 * - 超时：15s 内真值未到即判失败（真值在途时仪式等待室不会永久停在「最后校准中…」）；
 * - 过期响应丢弃：连续提交时先发的响应不得覆盖后发的结果（令牌单调递增，事件与全部收口点
 *   ——失败响应、流结束、abort 中断、异常——同样按令牌过滤：旧流不得改写新一轮的工作区状态）；
 * - 失败映射：超时 → 'timeout'，请求体不合法 → 'validation'，服务端失败 → 'model'，其余 → 'unknown'。
 */

import { authFetch } from '@/lib/api/client';
import { dispatchQuotaExhausted } from '@/lib/api/quota-events';
import {
  useDestinyWorkspaceStore,
  type AstrologyErrorKind,
  type AstrologyInterpretationReason,
  type AstrologyInterpretationState,
} from '@/stores/destiny-workspace-store';
import type { AstrologyFormData } from '@/app/destiny/_components/astrology-types';
import type { AstrologyChartFacts } from './chart-facts';
import type {
  AstrologyBigThree,
  AstrologyHeadline,
  AstrologyInterpretationReport,
  AstrologyTransitsSection,
  ModuleReading,
} from './interpretation';
import type { AstrologyReportEvent } from './report-events';

/** 报告流端点（协议见 ./report-events.ts） */
export const ASTROLOGY_REPORT_ENDPOINT = '/api/destiny/astrology/report';

/** 真值请求超时上限（毫秒）：超时即进既有失败恢复卡（errorKind='timeout'） */
export const CHART_FACTS_TIMEOUT_MS = 15_000;

/**
 * 解读首帧收口上限（毫秒）：真值已到但迟迟没有任何解读信号（分区或降级事件）时，
 * 按「解读未完成」收口并中止流。45s 的取值兼顾 DeepSeek 的思考模式（首段正文前会先跑一段推理），
 * 又不让用户对着骨架无限等待——收口后结果页给诚实失败卡与「重试解读」入口。
 */
export const INTERPRETATION_SIGNAL_TIMEOUT_MS = 45_000;

/** 真值请求失败档位：与工作区 AstrologyErrorKind 同名同义（'unknown' 为未预期的网络/中断类失败） */
export type ChartFactsRequestErrorKind = 'timeout' | 'model' | 'validation' | 'unknown';

/** 真值请求失败（携带失败原因档，调用方据此映射工作区 errorKind） */
export class ChartFactsRequestError extends Error {
  readonly kind: ChartFactsRequestErrorKind;

  constructor(kind: ChartFactsRequestErrorKind, message: string) {
    super(message);
    this.name = 'ChartFactsRequestError';
    this.kind = kind;
  }
}

/** 最近一次真值请求的令牌：只有最新请求的响应允许写进工作区 */
let latestRequestToken = 0;
/** 最近一次真值请求的连接：新提交让位时中止旧流，避免陈旧请求继续占着连接 */
let latestAbortController: AbortController | null = null;

/** 单次请求的可注入参数（测试用） */
export type ChartFactsRequestOptions = {
  timeoutMs?: number;
  /** 解读首帧收口上限（真值到达后多久没有解读信号就收口） */
  signalTimeoutMs?: number;
};

/**
 * 发起一次报告请求（提交与重试共用）。
 * @returns token  本次请求令牌——写回工作区前用 isLatestChartFactsRequest 校验，过期响应直接丢弃
 * @returns result 结果 Promise：chart-facts 帧到达即兑现星盘真值；超时 / 失败以 ChartFactsRequestError 拒绝
 */
export function startChartFactsRequest(
  formData: AstrologyFormData,
  options: ChartFactsRequestOptions = {}
): { token: number; result: Promise<AstrologyChartFacts> } {
  const token = ++latestRequestToken;
  const timeoutMs = options.timeoutMs ?? CHART_FACTS_TIMEOUT_MS;
  const signalTimeoutMs = options.signalTimeoutMs ?? INTERPRETATION_SIGNAL_TIMEOUT_MS;

  // 上一次提交让位：其事件因令牌过期被丢弃，连接一并中止
  latestAbortController?.abort();
  const controller = new AbortController();
  latestAbortController = controller;

  // 新提交：解读回到「在途」（旧分区随新流重建，绝不留上一次的文案）
  writeInterpretation({ status: 'pending', reason: null, report: null });

  const facts = createDeferred<AstrologyChartFacts>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ChartFactsRequestError('timeout', '星盘真值请求超时')),
      timeoutMs
    );
  });
  const result = Promise.race([facts.promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });

  // 真值未按时到达（超时或失败）即中止仍在读的流；真值到达则继续在后台消费解读事件
  result.then(
    () => {},
    () => {
      if (latestAbortController === controller) controller.abort();
    }
  );

  void consumeReportStream(formData, { token, controller, facts, signalTimeoutMs });

  return { token, result };
}

/** 该令牌是否仍是最新一次请求（过期响应必须丢弃，不得覆盖新提交的结果） */
export function isLatestChartFactsRequest(token: number): boolean {
  return token === latestRequestToken;
}

/**
 * 失败原因 → 工作区 errorKind：真值请求错误按档位直落，其余一律 'unknown'
 * （未预期的异常不猜测原因，失败卡只给出「网络中断或计算异常」）。
 */
export function chartFactsErrorKind(error: unknown): AstrologyErrorKind {
  return error instanceof ChartFactsRequestError ? error.kind : 'unknown';
}

/* ---------- 报告流消费 ---------- */

type Deferred<T> = {
  promise: Promise<T>;
  settled: boolean;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolveFn!: (value: T) => void;
  let rejectFn!: (error: unknown) => void;
  const deferred: Deferred<T> = {
    settled: false,
    promise: new Promise<T>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    }),
    resolve: (value) => {
      deferred.settled = true;
      resolveFn(value);
    },
    reject: (error) => {
      deferred.settled = true;
      rejectFn(error);
    },
  };
  return deferred;
}

/**
 * 消费一条报告流：chart-facts 兑现结果、解读分区逐区落工作区。
 * 本函数不抛错（全部收敛进 deferred / 工作区状态），调用方以 void 方式后台启动。
 */
async function consumeReportStream(
  formData: AstrologyFormData,
  context: {
    token: number;
    controller: AbortController;
    facts: Deferred<AstrologyChartFacts>;
    signalTimeoutMs: number;
  }
): Promise<void> {
  const { token, controller, facts, signalTimeoutMs } = context;
  let signalTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSignalTimer = () => {
    if (signalTimer !== null) {
      clearTimeout(signalTimer);
      signalTimer = null;
    }
  };
  /**
   * 真值已到之后的「解读首帧」计时：分区与降级事件都算信号；久候不至即按「解读未完成」收口，
   * 中止流并让结果页显示诚实失败卡与重试入口（不无限骨架）。
   */
  const armSignalTimer = () => {
    signalTimer = setTimeout(() => {
      if (!isLatestChartFactsRequest(token)) return;
      settleInterpretation('model');
      controller.abort();
    }, signalTimeoutMs);
  };

  try {
    const response = await authFetch(ASTROLOGY_REPORT_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ ...formData, provider: currentProvider() }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 过期流：本次提交已被新一轮取代（旧流 abort 后 read() 也走 catch），一律不得改写工作区
      if (!isLatestChartFactsRequest(token)) return;
      facts.reject(await requestErrorFromResponse(response));
      clearSignalTimer();
      settleInterpretationIfPending('unknown');
      return;
    }
    if (!response.body) {
      if (!isLatestChartFactsRequest(token)) return;
      facts.reject(new ChartFactsRequestError('unknown', '星盘计算响应缺少数据流'));
      clearSignalTimer();
      settleInterpretationIfPending('unknown');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) buffer += decoder.decode(value, { stream: true });

      const { frames, rest } = takeSseFrames(buffer);
      buffer = rest;

      for (const frame of frames) {
        const event = parseSseFrame(frame);
        if (!event) continue;
        // 过期响应：本次结果已被新提交取代，真值与解读事件一律不写回
        if (!isLatestChartFactsRequest(token)) return;

        if (event.type === 'chart-facts') {
          facts.resolve(event.facts);
          armSignalTimer();
          continue;
        }
        // 任何解读信号（分区或降级）都撤掉首帧计时：后续由服务端超时与流结束收口
        clearSignalTimer();
        if (event.type === 'interpretation-unavailable') {
          settleInterpretation(event.reason);
        } else if (event.type === 'headline') {
          applyInterpretationSection({ headline: event.headline });
        } else if (event.type === 'bigThree') {
          applyInterpretationSection({ bigThree: event.bigThree });
        } else if (event.type === 'modules') {
          applyInterpretationSection({ modules: event.modules });
        } else if (event.type === 'transits') {
          applyInterpretationSection({ transits: event.transits });
        } else if (event.type === 'error') {
          // 真值未下发时按服务端失败落档；真值已下发则只影响解读层（星盘照常展示）
          settleInterpretationIfPending('unknown');
          facts.reject(new ChartFactsRequestError('model', event.message));
        } else {
          // complete：协议保证此前已给出解读结论，防御式兜底（无结论即按未知收口）
          settleInterpretationIfPending('unknown');
        }
      }
    }

    clearSignalTimer();
    // 过期流：真值与解读结论都不得改写新一轮的工作区状态（真值 Promise 由调用方按令牌丢弃）
    if (!isLatestChartFactsRequest(token)) return;
    if (!facts.settled) facts.reject(new ChartFactsRequestError('unknown', '星盘真值未能送达，请重试'));
    // 流结束时仍无解读结论才收口；已到达的分区（ready）不因流收尾被推翻
    settleInterpretationIfPending('unknown');
  } catch (error) {
    clearSignalTimer();
    // 让位时旧流会被 abort：read() 以 AbortError 拒绝，这里必须按令牌丢弃，
    // 否则旧流会把新一轮的「解读在途」误判为失败并清空其分区
    if (!isLatestChartFactsRequest(token)) return;
    if (!facts.settled) facts.reject(toRequestError(error));
    // 真值已到：流中断只影响解读层（已到达的分区保留，界面照常呈现；真值不受影响）
    settleInterpretationIfPending('unknown');
  }
}

/* ---------- 解读层落库 ---------- */

/** 当前模型切换器口径（工作区 provider，持久化，默认豆包） */
function currentProvider(): string {
  return useDestinyWorkspaceStore.getState().provider;
}

/**
 * 解读分区到达：累计进工作区 report 并把状态推进到 ready（界面逐区替换骨架）。
 * 重复到达的分区覆盖同名字段，未到达的分区保持 null / 空数组（界面按分区骨架占位）。
 */
function applyInterpretationSection(section: {
  headline?: AstrologyHeadline;
  bigThree?: AstrologyBigThree;
  modules?: ModuleReading[];
  transits?: AstrologyTransitsSection;
}): void {
  useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', (current) => {
    const previous = current.interpretation;
    // 已降级（unavailable）或未发起（idle）时不接受迟到分区：结论只认本次流
    if (previous.status !== 'pending' && previous.status !== 'ready') return {};
    const report: AstrologyInterpretationReport = {
      headline: section.headline ?? previous.report?.headline ?? null,
      bigThree: section.bigThree ?? previous.report?.bigThree ?? null,
      modules: section.modules ?? previous.report?.modules ?? [],
      transits: section.transits ?? previous.report?.transits ?? null,
    };
    return {
      interpretation: { status: 'ready', reason: null, report } satisfies AstrologyInterpretationState,
    };
  });
}

/* ---------- 解读层落库 ---------- */

function writeInterpretation(next: AstrologyInterpretationState): void {
  useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', { interpretation: next });
}

/**
 * 解读结论：不可用（额度不足时同步唤起既有额度耗尽对话框）。
 * 同时清空已到达的分区：解读失败绝不留半份冒充产出（界面给诚实失败卡 + 重试）。
 */
function settleInterpretation(reason: AstrologyInterpretationReason): void {
  writeInterpretation({ status: 'unavailable', reason, report: null });
  if (reason === 'quota') dispatchQuotaExhausted();
}

/** 仅在结论尚未落定时收口（已到达的解读分区不因迟到中断被推翻，不覆盖已到达的结论） */
function settleInterpretationIfPending(reason: AstrologyInterpretationReason): void {
  if (useDestinyWorkspaceStore.getState().astrology.interpretation.status !== 'pending') return;
  settleInterpretation(reason);
}

/* ---------- 响应与帧解析 ---------- */

async function requestErrorFromResponse(response: Response): Promise<ChartFactsRequestError> {
  let message = '星盘计算请求失败，请稍后重试';
  try {
    const payload = (await response.json()) as {
      error?: string;
      details?: Array<{ message?: string }>;
    };
    const detail = payload.details?.[0]?.message;
    if (payload.error) message = detail ? `${payload.error}：${detail}` : payload.error;
  } catch {
    // 非 JSON 响应体：沿用默认文案
  }
  const kind: ChartFactsRequestErrorKind =
    response.status === 400 ? 'validation' : response.status >= 500 ? 'model' : 'unknown';
  return new ChartFactsRequestError(kind, message);
}

function toRequestError(error: unknown): ChartFactsRequestError {
  if (error instanceof ChartFactsRequestError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ChartFactsRequestError('unknown', '星盘计算请求已中止');
  }
  return new ChartFactsRequestError('unknown', '网络中断或计算异常，请重试');
}

/** 切出完整 SSE 帧（`data: <json>`，兼容 CRLF）；返回残段供下一块续接 */
export function takeSseFrames(buffer: string): { frames: string[]; rest: string } {
  const chunks = buffer.split(/\r?\n\r?\n/);
  const rest = chunks.pop() ?? '';
  return { frames: chunks, rest };
}

/** 单帧 → 报告流事件（只看 data 行；解析失败按未知帧丢弃） */
export function parseSseFrame(frame: string): AstrologyReportEvent | null {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join('\n')) as AstrologyReportEvent;
  } catch {
    return null;
  }
}
