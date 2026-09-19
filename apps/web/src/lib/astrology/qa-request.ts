/**
 * qa-request.ts —— 星座寰宇 · 星语问答调用侧守则（04 工单接缝切换）
 *
 * 面板/抽屉（astrology-qa.tsx）只通过本模块提问，避免多处各写一遍时序、失败映射与文案：
 * - 请求体为报告上下文（盘面事实 + 生活模块）+ 用户问题 + 本报告已提问数 + 当前 provider；
 * - 正文增量经 onDelta 回调（气泡内逐字浮现），answer 帧给出完整回答（kind / text / citations）；
 * - 令牌单调递增：新提问让位旧请求（旧的增量与结论一律丢弃，调用方按令牌过滤可见状态）；
 * - 中断：流意外关闭按失败收口，绝不把半句正文当成答案；
 * - 失败映射：超 3 问 'limit'、额度不足 'quota'、鉴权 'auth'、请求体不合法 'validation'、
 *   服务端失败 'model'、被取代 'aborted'，其余 'unknown'。
 *
 * 服务端口径见 app/api/destiny/astrology/copilot/route.ts（协议见 ./qa-events.ts）。
 */

import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import type { AstrologyChartFacts, TimePrecision } from './chart-facts';
import type { ModuleReading } from './interpretation';
import type { AstrologyQaAnswer, AstrologyQaEvent } from './qa-events';
import { takeSseFrames } from './chart-request';

/** 问答端点（协议见 ./qa-events.ts） */
export const ASTROLOGY_QA_ENDPOINT = '/api/destiny/astrology/copilot';

/** 失败兜底文案：不给用户看技术细节，也不猜测失败原因 */
export const QA_RETRY_MESSAGE = '这次没能取回回答，可以稍后换一种问法再试一次。';

/** 被新提问取代（调用方按令牌过滤后通常不展示这条） */
const QA_ABORTED_MESSAGE = '已取消本次提问。';

export type AstrologyQaErrorKind =
  | 'limit'
  | 'quota'
  | 'auth'
  | 'validation'
  | 'model'
  | 'aborted'
  | 'unknown';

/** 问答请求失败（携带失败原因档，调用方据此决定可见文案） */
export class AstrologyQaRequestError extends Error {
  readonly kind: AstrologyQaErrorKind;

  constructor(kind: AstrologyQaErrorKind, message: string) {
    super(message);
    this.name = 'AstrologyQaRequestError';
    this.kind = kind;
  }
}

/** 失败 → 可见中文文案：额度 / 超限 / 鉴权沿用服务端提示，其余给中性重试话术 */
export function astrologyQaErrorMessage(error: unknown): string {
  if (!(error instanceof AstrologyQaRequestError)) return QA_RETRY_MESSAGE;
  if (error.kind === 'limit' || error.kind === 'quota' || error.kind === 'auth') return error.message;
  if (error.kind === 'aborted') return QA_ABORTED_MESSAGE;
  return QA_RETRY_MESSAGE;
}

export type AstrologyQaRequestOptions = {
  /** 本报告已提问数（服务端据此强制 3 问上限，两层一致） */
  askedCount: number;
  /** 正文增量回调（流式浮现；过期请求的增量不会送达） */
  onDelta?: (text: string) => void;
};

/** 最近一次提问的令牌：只有最新请求的响应允许送达调用方 */
let latestToken = 0;
/** 最近一次提问的连接：新提问让位时中止旧流 */
let latestAbort: AbortController | null = null;
/** 最近一次在途请求：被取代时立即收口（避免调用方悬着一个永不落地的 Promise） */
let latestPending: Deferred<AstrologyQaAnswer> | null = null;

/**
 * 发起一次星语提问。
 * @returns token  本次提问令牌——写回界面状态前用 isLatestAstrologyQaRequest 校验
 * @returns result 回答 Promise：answer 帧到达即兑现；失败 / 被取代以 AstrologyQaRequestError 拒绝
 */
export function startAstrologyQaRequest(
  question: string,
  facts: AstrologyChartFacts,
  modules: ModuleReading[],
  options: AstrologyQaRequestOptions
): { token: number; result: Promise<AstrologyQaAnswer> } {
  const token = ++latestToken;

  // 上一次提问让位：连接中止、在途 Promise 立即收口（其响应因令牌过期被整体丢弃）
  latestAbort?.abort();
  latestPending?.reject(new AstrologyQaRequestError('aborted', QA_ABORTED_MESSAGE));
  const controller = new AbortController();
  latestAbort = controller;

  const deferred = createDeferred<AstrologyQaAnswer>();
  latestPending = deferred;

  void consumeQaStream({
    token,
    controller,
    deferred,
    question,
    facts,
    modules,
    askedCount: options.askedCount,
    onDelta: options.onDelta,
  });

  return { token, result: deferred.promise };
}

/** 该令牌是否仍是最新一次提问（过期响应必须丢弃，不得覆盖新提问的结果） */
export function isLatestAstrologyQaRequest(token: number): boolean {
  return token === latestToken;
}

/**
 * 取消当前在途提问（组件卸载 / 离开结果页时调用）：
 * 连接中止、在途 Promise 以「已取消」收口，避免用户已离开还继续为答案消耗额度；
 * 令牌一并推进——被取消请求的迟到帧同样按「过期响应」丢弃。
 */
export function abortAstrologyQaRequest(): void {
  latestToken += 1;
  latestAbort?.abort();
  latestPending?.reject(new AstrologyQaRequestError('aborted', QA_ABORTED_MESSAGE));
}

/** 提问便捷入口：只要回答（面板调用，界面状态由调用方按令牌守则写回） */
export function requestAstrologyAnswer(
  question: string,
  facts: AstrologyChartFacts,
  modules: ModuleReading[],
  options: AstrologyQaRequestOptions
): Promise<AstrologyQaAnswer> {
  return startAstrologyQaRequest(question, facts, modules, options).result;
}

/* ---------- 流消费 ---------- */

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
      if (deferred.settled) return;
      deferred.settled = true;
      resolveFn(value);
    },
    reject: (error) => {
      if (deferred.settled) return;
      deferred.settled = true;
      rejectFn(error);
    },
  };
  return deferred;
}

/** 当前模型切换器口径（工作区 provider，持久化，默认豆包） */
function currentProvider(): 'doubao' | 'deepseek' {
  return useDestinyWorkspaceStore.getState().provider;
}

/** 当前报告的出生时间精度（提示词降级口径与服务端一致） */
function currentTimePrecision(): TimePrecision {
  return useDestinyWorkspaceStore.getState().astrology.formData.timePrecision ?? 'accurate';
}

/**
 * 消费一条问答流：正文增量回调调用方，answer / error 帧收口 Promise。
 * 本函数不抛错（全部收敛进 deferred），调用方以 void 方式后台启动。
 */
async function consumeQaStream(context: {
  token: number;
  controller: AbortController;
  deferred: Deferred<AstrologyQaAnswer>;
  question: string;
  facts: AstrologyChartFacts;
  modules: ModuleReading[];
  askedCount: number;
  onDelta?: (text: string) => void;
}): Promise<void> {
  const { token, controller, deferred } = context;

  try {
    const response = await authFetch(ASTROLOGY_QA_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        report: { facts: context.facts, modules: context.modules },
        question: context.question,
        askedCount: context.askedCount,
        timePrecision: currentTimePrecision(),
        provider: currentProvider(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      deferred.reject(await requestErrorFromResponse(response));
      return;
    }
    if (!response.body) {
      deferred.reject(new AstrologyQaRequestError('unknown', QA_RETRY_MESSAGE));
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
        const event = parseQaFrame(frame);
        if (!event) continue;
        // 过期响应：本次提问已被新提问取代，增量与结论一律不送达
        if (!isLatestAstrologyQaRequest(token)) return;

        if (event.type === 'text-delta') {
          context.onDelta?.(event.text);
        } else if (event.type === 'answer') {
          deferred.resolve(event.answer);
          return;
        } else {
          deferred.reject(new AstrologyQaRequestError('model', event.error));
          return;
        }
      }
    }

    // 流结束仍没有结论帧：不把半句正文当答案，按失败收口
    deferred.reject(new AstrologyQaRequestError('unknown', QA_RETRY_MESSAGE));
  } catch (error) {
    // 中止（让位 / 取消）：由发起方收口 Promise，这里不再重复落错
    if (error instanceof DOMException && error.name === 'AbortError') return;
    deferred.reject(new AstrologyQaRequestError('unknown', QA_RETRY_MESSAGE));
  }
}

/* ---------- 响应与帧解析 ---------- */

async function requestErrorFromResponse(response: Response): Promise<AstrologyQaRequestError> {
  let message = QA_RETRY_MESSAGE;
  let code = '';
  try {
    const payload = (await response.json()) as {
      error?: string;
      code?: string;
      details?: Array<{ message?: string }>;
    };
    const detail = payload.details?.[0]?.message;
    if (payload.error) message = detail ? `${payload.error}：${detail}` : payload.error;
    code = payload.code ?? '';
  } catch {
    // 非 JSON 响应体：沿用默认文案
  }

  const kind: AstrologyQaErrorKind =
    response.status === 429 && code === 'QA_LIMIT_REACHED'
      ? 'limit'
      : response.status === 402 || code === 'QUOTA_INSUFFICIENT'
        ? 'quota'
        : response.status === 401 || response.status === 403
          ? 'auth'
          : response.status === 400
            ? 'validation'
            : response.status >= 500
              ? 'model'
              : 'unknown';
  return new AstrologyQaRequestError(kind, message);
}

/** 单帧 → 问答流事件（只看 data 行；解析失败按未知帧丢弃） */
function parseQaFrame(frame: string): AstrologyQaEvent | null {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join('\n')) as AstrologyQaEvent;
  } catch {
    return null;
  }
}
