/**
 * 讯飞实时语音转写 WebSocket 网关。
 *
 * 网关不再允许匿名直连上游：浏览器先在 start 消息中提供登录令牌，
 * 网关向 Web 应用换取已预留额度的会话。计费依据为实际转发到上游的 PCM 字节数。
 */

import { buildXunfeiWebSocketUrl, parseXunfeiResultPayload } from './xunfei-signature';

interface Env {
  XUNFEI_APP_ID: string;
  XUNFEI_API_KEY: string;
  XUNFEI_PD?: string;
  BILLING_API_URL: string;
  RTASR_GATEWAY_SECRET: string;
}

interface ControlMessage {
  type: 'start' | 'end' | 'ping';
  accessToken?: string;
  requestId?: string;
}

interface BillingSession {
  userId: string;
  requestId: string;
  reservationId: string | null;
  maxDurationSeconds: number;
}

type SessionOutcome = 'success' | 'partial' | 'failed';

type GatewayEvent =
  | { type: 'status'; status: 'connected' | 'started' | 'stopped' }
  | { type: 'result'; segId?: number; isEnd?: boolean; text: string; raw?: unknown }
  | { type: 'error'; message: string; raw?: unknown };

interface SessionState {
  upstream: WebSocket | null;
  upstreamReady: boolean;
  started: boolean;
  ending: boolean;
  endFrameSent: boolean;
  pendingAudio: ArrayBuffer[];
  acceptedAudioBytes: number;
  forwardedAudioBytes: number;
  billing: BillingSession | null;
  billingStarted: boolean;
  billingStartPromise: Promise<void> | null;
  outcome: SessionOutcome;
  finalized: boolean;
  finalizeTimer: number | null;
  sessionLimitTimer: number | null;
}

const END_MESSAGE = '{"end": true}';
const PCM_BYTES_PER_SECOND = 16_000 * 2;
const FINALIZE_TIMEOUT_MS = 7_000;
const SETTLE_RETRY_COUNT = 3;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Upgrade',
        },
      });
    }

    if (new URL(request.url).pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'rtasr-gateway' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    void handleWebSocket(server, env);

    return new Response(null, { status: 101, webSocket: client });
  },
};

async function handleWebSocket(ws: WebSocket, env: Env): Promise<void> {
  ws.accept();
  safeSend(ws, { type: 'status', status: 'connected' });

  const state: SessionState = {
    upstream: null,
    upstreamReady: false,
    started: false,
    ending: false,
    endFrameSent: false,
    pendingAudio: [],
    acceptedAudioBytes: 0,
    forwardedAudioBytes: 0,
    billing: null,
    billingStarted: false,
    billingStartPromise: null,
    outcome: 'success',
    finalized: false,
    finalizeTimer: null,
    sessionLimitTimer: null,
  };

  ws.addEventListener('message', (event) => {
    void handleClientMessage(ws, env, state, event.data);
  });

  ws.addEventListener('close', () => {
    console.log('[Gateway] 客户端断开连接');
    void requestSessionEnd(ws, env, state, state.outcome);
  });

  ws.addEventListener('error', (error) => {
    console.error('[Gateway] 客户端 WebSocket 错误:', error);
  });
}

async function handleClientMessage(
  client: WebSocket,
  env: Env,
  state: SessionState,
  data: unknown
): Promise<void> {
  try {
    if (typeof data === 'string') {
      const msg = JSON.parse(data) as ControlMessage;
      await handleControlMessage(client, env, state, msg);
      return;
    }

    if (data instanceof ArrayBuffer) {
      await handleAudioChunk(client, env, state, data);
    }
  } catch (error) {
    console.error('[Gateway] 处理消息失败:', error);
    safeSend(client, {
      type: 'error',
      message: error instanceof Error ? error.message : '处理消息失败',
    });
  }
}

async function handleControlMessage(
  client: WebSocket,
  env: Env,
  state: SessionState,
  msg: ControlMessage
): Promise<void> {
  if (msg.type === 'start') {
    if (state.started || state.upstream || state.billing) {
      safeSend(client, { type: 'error', message: '会话已启动' });
      return;
    }
    if (!msg.accessToken?.trim()) {
      safeSend(client, { type: 'error', message: '缺少登录令牌，无法启动实时转写' });
      return;
    }

    try {
      state.billing = await createBillingSession(env, msg.accessToken, msg.requestId);
      scheduleSessionLimit(client, env, state);
      await connectUpstream(client, env, state);
    } catch (error) {
      state.outcome = 'failed';
      await finalizeSession(env, state);
      throw error;
    }
    return;
  }

  if (!state.billing) {
    safeSend(client, { type: 'error', message: '请先完成认证并启动会话' });
    return;
  }

  if (msg.type === 'end') {
    await requestSessionEnd(client, env, state, state.outcome);
    return;
  }

  if (msg.type === 'ping') {
    safeSend(client, { type: 'status', status: state.started ? 'started' : 'connected' });
  }
}

async function handleAudioChunk(
  client: WebSocket,
  env: Env,
  state: SessionState,
  chunk: ArrayBuffer
): Promise<void> {
  if (!state.billing) {
    safeSend(client, { type: 'error', message: '未认证的音频数据已拒绝' });
    return;
  }
  if (state.ending) return;

  if (!state.upstream) {
    try {
      await connectUpstream(client, env, state);
    } catch (error) {
      state.outcome = 'failed';
      await finalizeSession(env, state);
      throw error;
    }
  }

  const accepted = acceptAudioWithinLimit(state, chunk);
  if (!accepted) {
    safeSend(client, { type: 'error', message: '本次实时转写已达到可用额度上限' });
    await requestSessionEnd(client, env, state, state.outcome);
    return;
  }

  if (state.upstream && state.upstreamReady && state.upstream.readyState === WebSocket.OPEN) {
    await forwardAudioChunk(env, state, accepted);
  } else {
    state.pendingAudio.push(accepted);
  }

  const maxBytes = state.billing.maxDurationSeconds * PCM_BYTES_PER_SECOND;
  if (state.acceptedAudioBytes >= maxBytes) {
    safeSend(client, { type: 'error', message: '本次实时转写已达到可用额度上限，已停止继续录音' });
    await requestSessionEnd(client, env, state, state.outcome);
  }
}

function acceptAudioWithinLimit(state: SessionState, chunk: ArrayBuffer): ArrayBuffer | null {
  if (!state.billing) return null;
  const maxBytes = state.billing.maxDurationSeconds * PCM_BYTES_PER_SECOND;
  const remainingBytes = maxBytes - state.acceptedAudioBytes;
  const acceptedBytes = Math.min(chunk.byteLength, Math.max(0, remainingBytes));
  // PCM 是 16-bit 采样，避免把半个采样点传给供应商。
  const alignedBytes = acceptedBytes - (acceptedBytes % 2);
  if (alignedBytes <= 0) return null;

  state.acceptedAudioBytes += alignedBytes;
  // 未截断时直接转发原 buffer（event.data 独占所有权），避免每条音频 chunk 全量拷贝。
  return alignedBytes === chunk.byteLength ? chunk : chunk.slice(0, alignedBytes);
}

async function connectUpstream(client: WebSocket, env: Env, state: SessionState): Promise<void> {
  if (state.upstream || !state.billing) return;
  if (!env.XUNFEI_APP_ID || !env.XUNFEI_API_KEY) {
    throw new Error('未配置讯飞实时转写服务凭据');
  }

  const upstreamUrl = await buildXunfeiWebSocketUrl(env.XUNFEI_APP_ID, env.XUNFEI_API_KEY, {
    pd: env.XUNFEI_PD,
  });
  const upstream = new WebSocket(upstreamUrl);
  state.upstream = upstream;
  state.upstreamReady = false;
  state.started = true;

  upstream.addEventListener('open', () => {
    console.log('[Gateway] 已连接到讯飞服务');
  });

  upstream.addEventListener('message', (event) => {
    void handleUpstreamEvent(client, env, state, event.data);
  });

  upstream.addEventListener('close', () => {
    console.log('[Gateway] 讯飞 WebSocket 已关闭');
    const shouldNotifyStopped = state.started && getReadyState(client) === WebSocket.OPEN;
    state.upstream = null;
    state.upstreamReady = false;
    state.started = false;
    state.pendingAudio = [];
    if (!state.ending && state.outcome === 'success') {
      state.outcome = state.forwardedAudioBytes > 0 ? 'partial' : 'failed';
    }
    if (shouldNotifyStopped) safeSend(client, { type: 'status', status: 'stopped' });
    void finalizeSession(env, state);
  });

  upstream.addEventListener('error', (error) => {
    console.error('[Gateway] 讯飞 WebSocket 错误:', error);
    state.outcome = state.forwardedAudioBytes > 0 ? 'partial' : 'failed';
    safeSend(client, { type: 'error', message: '讯飞服务连接错误' });
    void requestSessionEnd(client, env, state, state.outcome);
  });
}

async function handleUpstreamEvent(
  client: WebSocket,
  env: Env,
  state: SessionState,
  raw: unknown
): Promise<void> {
  try {
    const payload = JSON.parse(String(raw)) as Record<string, unknown>;
    if (payload.action === 'started') {
      state.upstreamReady = true;
      await flushPendingAudio(env, state);
      if (state.ending) await sendEndFrame(state);
      safeSend(client, { type: 'status', status: 'started' });
      return;
    }

    if (payload.action === 'result') {
      const result = parseXunfeiResultPayload(payload);
      if (result) {
        safeSend(client, {
          type: 'result',
          segId: result.segId,
          isEnd: result.isEnd,
          text: result.text,
          raw: { segId: result.segId, isEnd: result.isEnd, bg: result.bg, ed: result.ed },
        });
      }
      return;
    }

    if (payload.action === 'error') {
      state.outcome = state.forwardedAudioBytes > 0 ? 'partial' : 'failed';
      safeSend(client, {
        type: 'error',
        message: typeof payload.desc === 'string' ? payload.desc : '讯飞服务错误',
        raw: payload,
      });
      await requestSessionEnd(client, env, state, state.outcome);
    }
  } catch (error) {
    console.error('[Gateway] 解析讯飞消息失败:', error);
    safeSend(client, { type: 'error', message: '解析讯飞消息失败' });
  }
}

async function flushPendingAudio(env: Env, state: SessionState): Promise<void> {
  while (
    state.pendingAudio.length > 0 &&
    state.upstream &&
    state.upstream.readyState === WebSocket.OPEN
  ) {
    const chunk = state.pendingAudio.shift();
    if (chunk) await forwardAudioChunk(env, state, chunk);
  }
}

async function forwardAudioChunk(env: Env, state: SessionState, chunk: ArrayBuffer): Promise<void> {
  if (!state.upstream || state.upstream.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    state.upstream.send(chunk);
    state.forwardedAudioBytes += chunk.byteLength;
    scheduleBillingStart(env, state);
  } catch (error) {
    console.error('[Gateway] 转发音频失败:', error);
    state.outcome = state.forwardedAudioBytes > 0 ? 'partial' : 'failed';
    await requestSessionEnd(null, env, state, state.outcome);
  }
}

async function requestSessionEnd(
  client: WebSocket | null,
  env: Env,
  state: SessionState,
  outcome: SessionOutcome
): Promise<void> {
  if (state.finalized) return;
  state.ending = true;
  state.outcome = outcome;
  await sendEndFrame(state);
  scheduleFinalization(env, state);
  if (client && getReadyState(client) === WebSocket.OPEN && !state.upstream) {
    safeSend(client, { type: 'status', status: 'stopped' });
  }
}

async function sendEndFrame(state: SessionState): Promise<void> {
  if (
    state.endFrameSent ||
    !state.upstream ||
    !state.upstreamReady ||
    state.upstream.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  try {
    state.upstream.send(END_MESSAGE);
    state.endFrameSent = true;
  } catch (error) {
    console.error('[Gateway] 发送结束帧失败:', error);
  }
}

function scheduleFinalization(env: Env, state: SessionState): void {
  if (state.finalizeTimer !== null || state.finalized) return;
  state.finalizeTimer = setTimeout(() => {
    void finalizeSession(env, state);
  }, FINALIZE_TIMEOUT_MS) as unknown as number;
}

async function finalizeSession(env: Env, state: SessionState): Promise<void> {
  if (state.finalized) return;
  state.finalized = true;
  if (state.finalizeTimer !== null) {
    clearTimeout(state.finalizeTimer);
    state.finalizeTimer = null;
  }
  if (state.sessionLimitTimer !== null) {
    clearTimeout(state.sessionLimitTimer);
    state.sessionLimitTimer = null;
  }

  await sendEndFrame(state);
  try {
    state.upstream?.close();
  } catch {
    // 连接已关闭时无需额外处理。
  }

  if (state.billingStartPromise) {
    await state.billingStartPromise;
  }
  await settleBillingSession(env, state);
}

function scheduleBillingStart(env: Env, state: SessionState): void {
  if (
    state.billingStarted ||
    state.billingStartPromise ||
    !state.billing?.reservationId ||
    state.forwardedAudioBytes <= 0
  ) {
    return;
  }

  const pending = markBillingStarted(env, state);
  state.billingStartPromise = pending;
  void pending.finally(() => {
    if (state.billingStartPromise === pending) {
      state.billingStartPromise = null;
    }
  });
}

async function markBillingStarted(env: Env, state: SessionState): Promise<void> {
  const billing = state.billing;
  if (!billing?.reservationId) return;

  try {
    const response = await fetch(
      `${withoutTrailingSlash(env.BILLING_API_URL)}/api/internal/billing/rtasr/start`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RTASR_GATEWAY_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: billing.userId,
          requestId: billing.requestId,
          reservationId: billing.reservationId,
        }),
      }
    );
    if (!response.ok) {
      console.error('[Gateway] 无法锁定实时转写计费会话:', response.status);
      return;
    }
    state.billingStarted = true;
  } catch (error) {
    console.error('[Gateway] 锁定实时转写计费会话失败:', error);
  }
}

function scheduleSessionLimit(client: WebSocket, env: Env, state: SessionState): void {
  if (!state.billing || state.sessionLimitTimer !== null) return;
  state.sessionLimitTimer = setTimeout(() => {
    safeSend(client, { type: 'error', message: '本次实时转写已达到会话时长上限' });
    void requestSessionEnd(client, env, state, state.outcome);
  }, state.billing.maxDurationSeconds * 1000) as unknown as number;
}

async function createBillingSession(
  env: Env,
  accessToken: string,
  requestId?: string
): Promise<BillingSession> {
  const response = await fetch(`${withoutTrailingSlash(env.BILLING_API_URL)}/api/voice/realtime/session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId }),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '无法创建实时转写计费会话');
  }

  const userId = typeof payload?.userId === 'string' ? payload.userId : '';
  const sessionRequestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
  const reservationId = typeof payload?.reservationId === 'string' ? payload.reservationId : null;
  const maxDurationSeconds = Number(payload?.maxDurationSeconds);
  if (!userId || !sessionRequestId || !Number.isInteger(maxDurationSeconds) || maxDurationSeconds < 1) {
    throw new Error('实时转写计费会话响应无效');
  }

  return { userId, requestId: sessionRequestId, reservationId, maxDurationSeconds };
}

async function settleBillingSession(env: Env, state: SessionState): Promise<void> {
  if (!state.billing) return;
  const audioSeconds = Math.ceil(state.forwardedAudioBytes / PCM_BYTES_PER_SECOND);
  const payload = {
    userId: state.billing.userId,
    requestId: state.billing.requestId,
    reservationId: state.billing.reservationId,
    audioSeconds,
    outcome: state.outcome,
  };

  for (let attempt = 1; attempt <= SETTLE_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(
        `${withoutTrailingSlash(env.BILLING_API_URL)}/api/internal/billing/rtasr/settle`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RTASR_GATEWAY_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      if (response.ok) return;
      console.error('[Gateway] 实时转写结算响应失败:', response.status);
    } catch (error) {
      console.error('[Gateway] 实时转写结算请求失败:', error);
    }

    if (attempt < SETTLE_RETRY_COUNT) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function safeSend(ws: WebSocket, event: GatewayEvent): void {
  if (getReadyState(ws) !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(event));
}

function getReadyState(ws: WebSocket): number {
  return typeof ws.readyState === 'number' ? ws.readyState : WebSocket.CLOSED;
}
