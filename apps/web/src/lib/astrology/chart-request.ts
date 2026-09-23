/**
 * chart-request.ts —— 星座寰宇 · 报告流调用与会话管理深模块
 *
 * 本模块为前端调用星座报告流的唯一入口（深模块）：
 * - 对外暴露统一面向意图的 astrologySession 单例门面（submit / retryFacts / retryInterpretation / abort）；
 * - 模块内部自闭环请求令牌递增、并发冲突防抖、旧流自动中止与工作区双超时定时器；
 * - 模块内部自闭环工作区状态流转（loading ➔ ready ➔ unavailable）；
 * - 模块内部自闭环统一历史记录生命周期（真值首帧落库、流式分区增量合并摘要）；
 * - 对历史代码与集成测试保留兼容垫片 startChartFactsRequest。
 */

import { authFetch } from '@/lib/api/client';
import { dispatchQuotaExhausted } from '@/lib/api/quota-events';
import {
  saveAstrologyHistoryRecord,
  updateAstrologyHistoryInterpretation,
} from '@/lib/astrology/history';
import {
  useDestinyWorkspaceStore,
  type AstrologyErrorKind,
  type AstrologyInterpretationReason,
  type AstrologyInterpretationSectionPatch,
  type AstrologyInterpretationState,
} from '@/stores/destiny-workspace-store';
import type { AstrologyFormData } from '@/app/destiny/_components/astrology-types';
import type { AstrologyChartFacts } from './chart-facts';
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

/** 会话运行模式：全新提交 / 重试真值 / 仅重试解读 */
export type AstrologySessionMode = 'fresh' | 'retryFacts' | 'retryInterpretation';

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
/** 最近一次活动会话的真值超时定时器：中止时同步清理，避免悬挂触发迟到拒绝 */
let currentSessionTimer: ReturnType<typeof setTimeout> | null = null;
/** 最近一次请求发起的时间戳，用于防重入过滤 */
let lastSubmitTimestamp = 0;
/** 最近一次提交的 Promise，用于 300ms 防抖复用 */
let latestSubmitPromise: Promise<AstrologyChartFacts> | null = null;

/** 单次请求的可注入参数（测试用） */
export type ChartFactsRequestOptions = {
  timeoutMs?: number;
  /** 解读首帧收口上限（真值到达后多久没有解读信号就收口） */
  signalTimeoutMs?: number;
  /** 运行模式：fresh（默认全新提交）、retryFacts（真值重试）、retryInterpretation（解读重试） */
  mode?: AstrologySessionMode;
};

/* ---------- 内部会话启动函数 ---------- */

function executeSession(
  formData: AstrologyFormData,
  options: ChartFactsRequestOptions = {}
): { token: number; result: Promise<AstrologyChartFacts> } {
  const mode = options.mode ?? 'fresh';
  const token = ++latestRequestToken;
  const timeoutMs = options.timeoutMs ?? CHART_FACTS_TIMEOUT_MS;
  const signalTimeoutMs = options.signalTimeoutMs ?? INTERPRETATION_SIGNAL_TIMEOUT_MS;

  // 上一次提交让位：其中止旧流并清除旧定时器，避免陈旧连接在后台继续浪费资源
  if (currentSessionTimer !== null) {
    clearTimeout(currentSessionTimer);
    currentSessionTimer = null;
  }
  latestAbortController?.abort();
  const controller = new AbortController();
  latestAbortController = controller;

  if (mode === 'retryInterpretation') {
    // 模式 1：解读重试，锚点冻结，保持既有 chartFacts 与结果页布局，仅解读层进入 pending 骨架
    useDestinyWorkspaceStore.getState().beginAstrologyInterpretationRetry();
  } else {
    // 全新提交或真值重试：重置为 loading 仪式态，清空历史真值与错误，重置解读为 pending
    useDestinyWorkspaceStore.getState().beginAstrologySession();
  }

  const facts = createDeferred<AstrologyChartFacts>();
  let sessionTimer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    sessionTimer = setTimeout(
      () => reject(new ChartFactsRequestError('timeout', '星盘真值请求超时')),
      timeoutMs
    );
  });
  currentSessionTimer = sessionTimer;

  const result = Promise.race([facts.promise, timeout]).finally(() => {
    if (sessionTimer !== null) {
      clearTimeout(sessionTimer);
      sessionTimer = null;
    }
    if (currentSessionTimer === sessionTimer) {
      currentSessionTimer = null;
    }
  });

  // 真值未按时到达（超时或失败）即中止仍在读取的流；真值到达则继续在后台消费解读事件
  result.then(
    () => {},
    () => {
      if (latestAbortController === controller) controller.abort();
    }
  );

  void consumeReportStream(formData, {
    token,
    controller,
    facts,
    signalTimeoutMs,
    mode,
  });

  return { token, result };
}

/* ---------- AstrologySession 深模块门面 ---------- */

/**
 * 星座寰宇原子化会话深模块（推荐调用入口）
 */
export const astrologySession = {
  /**
   * 表单提交：发起星盘计算与流式解读。
   * 内部自动处理 loading 态、真值持久化、逐区解读推送与错误降级。
   */
  submit(
    formData: AstrologyFormData,
    options?: ChartFactsRequestOptions
  ): Promise<AstrologyChartFacts> {
    const now = Date.now();
    // 300ms 内狂点防抖：复用在途请求，避免重复发起网络连接与破坏交互状态
    if (now - lastSubmitTimestamp < 300 && latestSubmitPromise) {
      return latestSubmitPromise;
    }
    lastSubmitTimestamp = now;

    const { token, result } = executeSession(formData, { ...options, mode: 'fresh' });
    const sessionPromise = (async () => {
      try {
        const facts = await result;
        return facts;
      } catch (error) {
        if (isLatestChartFactsRequest(token)) {
          useDestinyWorkspaceStore
            .getState()
            .failAstrologySession('星盘计算出现异常，请重试', chartFactsErrorKind(error));
        }
        throw error;
      } finally {
        if (isLatestChartFactsRequest(token)) {
          latestSubmitPromise = null;
        }
      }
    })();

    latestSubmitPromise = sessionPromise;
    return sessionPromise;
  },

  /**
   * 重试真值：仪式页真值缺失时的重新发起。
   */
  async retryFacts(
    formData: AstrologyFormData,
    options?: ChartFactsRequestOptions
  ): Promise<AstrologyChartFacts> {
    const { token, result } = executeSession(formData, { ...options, mode: 'retryFacts' });
    try {
      const facts = await result;
      return facts;
    } catch (error) {
      if (isLatestChartFactsRequest(token)) {
        useDestinyWorkspaceStore
          .getState()
          .failAstrologySession('星盘计算出现异常，请重试', chartFactsErrorKind(error));
      }
      throw error;
    }
  },

  /**
   * 重试解读：在结果页针对已计算出的星盘重新发起流式解读。
   * 遵循模式 1：锚点冻结，保持既有 chartFacts 与历史时间戳不变，仅解读层进入骨架等待。
   */
  async retryInterpretation(
    formData: AstrologyFormData,
    options?: ChartFactsRequestOptions
  ): Promise<void> {
    const currentFacts = useDestinyWorkspaceStore.getState().astrology.chartFacts;
    if (!currentFacts) return;

    const { token, result } = executeSession(formData, {
      ...options,
      mode: 'retryInterpretation',
    });

    try {
      await result;
    } catch {
      // 解读重试时真值阶段失败，由底层流接缝落成 unavailable，星盘与错误状态不动
      if (!isLatestChartFactsRequest(token)) return;
    }
  },

  /**
   * 显式中止会话并释放资源（用户返回首页或离开测试视图时调用）。
   */
  abort(reason?: string): void {
    latestRequestToken++;
    lastSubmitTimestamp = 0;
    latestSubmitPromise = null;
    if (currentSessionTimer !== null) {
      clearTimeout(currentSessionTimer);
      currentSessionTimer = null;
    }
    if (latestAbortController) {
      latestAbortController.abort(reason);
      latestAbortController = null;
    }
  },
};

/**
 * 兼容垫片：保留对既有低层调用的兼容性。
 * @deprecated 推荐使用 astrologySession.submit / retryFacts / retryInterpretation
 */
export function startChartFactsRequest(
  formData: AstrologyFormData,
  options: ChartFactsRequestOptions = {}
): { token: number; result: Promise<AstrologyChartFacts> } {
  return executeSession(formData, options);
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
 * 消费一条报告流：chart-facts 兑现结果、解读分区逐区落工作区与统一历史。
 * 本函数不向外抛错（全部收敛进 deferred 与工作区状态）。
 */
async function consumeReportStream(
  formData: AstrologyFormData,
  context: {
    token: number;
    controller: AbortController;
    facts: Deferred<AstrologyChartFacts>;
    signalTimeoutMs: number;
    mode: AstrologySessionMode;
  }
): Promise<void> {
  const { token, controller, facts, signalTimeoutMs, mode } = context;
  let signalTimer: ReturnType<typeof setTimeout> | null = null;
  // 记录本轮实际使用的有效真值（用于解读增量合并历史）
  let activeFacts: AstrologyChartFacts | null = null;

  if (mode === 'retryInterpretation') {
    // 解读重试时，锁定既有的 chartFacts 锚点
    activeFacts = useDestinyWorkspaceStore.getState().astrology.chartFacts;
  }

  const clearSignalTimer = () => {
    if (signalTimer !== null) {
      clearTimeout(signalTimer);
      signalTimer = null;
    }
  };

  controller.signal.addEventListener('abort', clearSignalTimer, { once: true });

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
      // 过期流：本次提交已被新一轮取代，一律不得改写工作区
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
          if (mode === 'retryInterpretation') {
            // 模式 1：解读重试时真值锚点冻结，不覆盖工作区，不重新落库历史记录
            facts.resolve(event.facts);
          } else {
            // 防御：若已收到过真值帧，跳过重复写入工作区与落库历史
            if (activeFacts) {
              facts.resolve(event.facts);
              continue;
            }
            // 全新提交或真值重试：真值就绪，写入工作区并自动落库历史记录
            activeFacts = event.facts;
            useDestinyWorkspaceStore.getState().applyAstrologyChartFacts(event.facts);
            saveAstrologyHistoryRecord(formData, event.facts);
            facts.resolve(event.facts);
          }
          armSignalTimer();
          continue;
        }

        // 任何解读信号（分区或降级）都撤掉首帧计时：后续由服务端超时与流结束收口
        clearSignalTimer();

        if (event.type === 'interpretation-unavailable') {
          settleInterpretation(event.reason);
        } else if (event.type === 'headline') {
          applyInterpretationSection({ headline: event.headline });
          syncHistoryInterpretation(formData, activeFacts);
        } else if (event.type === 'bigThree') {
          applyInterpretationSection({ bigThree: event.bigThree });
          syncHistoryInterpretation(formData, activeFacts);
        } else if (event.type === 'modules') {
          applyInterpretationSection({ modules: event.modules });
          syncHistoryInterpretation(formData, activeFacts);
        } else if (event.type === 'transits') {
          applyInterpretationSection({ transits: event.transits });
          syncHistoryInterpretation(formData, activeFacts);
        } else if (event.type === 'error') {
          // 真值未下发时按服务端失败落档；真值已下发则只影响解读层（星盘照常展示）
          settleInterpretationIfPending('unknown');
          facts.reject(new ChartFactsRequestError('model', event.message));
        } else {
          // 报告流完成帧：协议保证此前已给出解读结论，防御式兜底
          settleInterpretationIfPending('unknown');
        }
      }
    }

    clearSignalTimer();
    // 过期流：真值与解读结论都不得改写新一轮的工作区状态
    if (!isLatestChartFactsRequest(token)) return;
    if (!facts.settled) facts.reject(new ChartFactsRequestError('unknown', '星盘真值未能送达，请重试'));
    // 流结束时仍无解读结论才收口；已到达的分区（ready）不因流收尾被推翻
    settleInterpretationIfPending('unknown');
  } catch (error) {
    clearSignalTimer();
    // 让位时旧流会被 abort：read() 以 AbortError 拒绝，必须按令牌丢弃
    if (!isLatestChartFactsRequest(token)) return;
    if (!facts.settled) facts.reject(toRequestError(error));
    // 真值已到：流中断只影响解读层（已到达的分区保留，界面照常呈现；真值不受影响）
    settleInterpretationIfPending('unknown');
  }
}

/* ---------- 统一历史同步辅助函数 ---------- */

function syncHistoryInterpretation(
  formData: AstrologyFormData,
  facts: AstrologyChartFacts | null
): void {
  if (!facts) return;
  const currentInterpretation = useDestinyWorkspaceStore.getState().astrology.interpretation;
  if (currentInterpretation.report) {
    updateAstrologyHistoryInterpretation(formData, facts, currentInterpretation.report);
  }
}

/* ---------- 解读层落库 ---------- */

/** 当前模型切换器口径（工作区 provider，持久化，默认豆包） */
function currentProvider(): string {
  return useDestinyWorkspaceStore.getState().provider;
}

/**
 * 解读分区到达：调 store 具名 action 累积合入解读报告并推进就绪。
 * 重复到达的分区覆盖同名字段，未到达的分区保持 null / 空数组（界面按分区骨架占位）。
 */
function applyInterpretationSection(section: AstrologyInterpretationSectionPatch): void {
  useDestinyWorkspaceStore.getState().applyAstrologyInterpretationSection(section);
}

/**
 * 解读结论：不可用（额度不足时同步唤起既有额度耗尽对话框）。
 * 同时清空已到达的分区：解读失败绝不留半份冒充产出（界面给诚实失败卡 + 重试）。
 */
function settleInterpretation(reason: AstrologyInterpretationReason): void {
  useDestinyWorkspaceStore.getState().settleAstrologyInterpretation({
    status: 'unavailable',
    reason,
    report: null,
  });
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

/** 切出完整 SSE 帧（兼容 CRLF）；返回残段供下一块续接 */
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
