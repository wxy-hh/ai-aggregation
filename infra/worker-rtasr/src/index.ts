/**
 * 讯飞实时语音转写 WebSocket 网关
 *
 * 功能：
 * 1. 接收浏览器 WebSocket 连接
 * 2. 按现有 RTASR 协议连接讯飞上游
 * 3. 缓冲上游握手完成前的音频数据，避免首句丢失
 * 4. 在结束会话时发送结束帧并等待尾包结果
 */

import { buildXunfeiWebSocketUrl, parseXunfeiResultPayload } from './xunfei-signature';

interface Env {
  XUNFEI_APP_ID: string;
  XUNFEI_API_KEY: string;
  XUNFEI_PD?: string;
}

interface ControlMessage {
  type: 'start' | 'end' | 'ping';
  pd?: string;
}

type GatewayEvent =
  | { type: 'status'; status: 'connected' | 'started' | 'stopped' }
  | { type: 'result'; segId?: number; isEnd?: boolean; text: string; raw?: unknown }
  | { type: 'error'; message: string; raw?: unknown };

interface SessionState {
  upstream: WebSocket | null;
  upstreamReady: boolean;
  started: boolean;
  ending: boolean;
  pendingAudio: ArrayBuffer[];
}

const END_MESSAGE = '{"end": true}';

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

    handleWebSocket(server, env);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
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
    pendingAudio: [],
  };

  ws.addEventListener('message', async (event) => {
    try {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data) as ControlMessage;
        await handleControlMessage(ws, env, state, msg);
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        await handleAudioChunk(ws, env, state, event.data);
      }
    } catch (error) {
      console.error('[Gateway] 处理消息失败:', error);
      safeSend(ws, {
        type: 'error',
        message: error instanceof Error ? error.message : '处理消息失败',
      });
    }
  });

  ws.addEventListener('close', () => {
    console.log('[Gateway] 客户端断开连接');
    state.ending = true;
    void finalizeSession(state);
  });

  ws.addEventListener('error', (error) => {
    console.error('[Gateway] 客户端 WebSocket 错误:', error);
  });
}

async function handleControlMessage(
  client: WebSocket,
  env: Env,
  state: SessionState,
  msg: ControlMessage
): Promise<void> {
  if (msg.type === 'start') {
    if (state.started || state.upstream) {
      safeSend(client, { type: 'error', message: '会话已启动' });
      return;
    }

    await connectUpstream(client, env, state, msg.pd);
    return;
  }

  if (msg.type === 'end') {
    state.ending = true;
    await sendEndFrame(state);
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
  if (!state.upstream) {
    await connectUpstream(client, env, state);
  }

  if (!state.upstream || !state.upstreamReady || state.upstream.readyState !== WebSocket.OPEN) {
    state.pendingAudio.push(chunk.slice(0));
    return;
  }

  state.upstream.send(chunk);
}

async function connectUpstream(
  client: WebSocket,
  env: Env,
  state: SessionState,
  pd?: string
): Promise<void> {
  if (state.upstream) {
    return;
  }

  const upstreamUrl = await buildXunfeiWebSocketUrl(env.XUNFEI_APP_ID, env.XUNFEI_API_KEY, {
    pd: pd || env.XUNFEI_PD,
  });

  const upstream = new WebSocket(upstreamUrl);
  state.upstream = upstream;
  state.upstreamReady = false;
  state.started = true;

  upstream.addEventListener('open', () => {
    console.log('[Gateway] 已连接到讯飞服务');
  });

  upstream.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
      handleUpstreamMessage(client, state, payload);
    } catch (error) {
      console.error('[Gateway] 解析讯飞消息失败:', error);
      safeSend(client, { type: 'error', message: '解析讯飞消息失败' });
    }
  });

  upstream.addEventListener('close', () => {
    console.log('[Gateway] 讯飞 WebSocket 已关闭');
    const shouldNotifyStopped = state.started && getReadyState(client) === WebSocket.OPEN;
    state.upstream = null;
    state.upstreamReady = false;
    state.started = false;
    state.pendingAudio = [];
    if (shouldNotifyStopped) {
      safeSend(client, { type: 'status', status: 'stopped' });
    }
  });

  upstream.addEventListener('error', (error) => {
    console.error('[Gateway] 讯飞 WebSocket 错误:', error);
    safeSend(client, { type: 'error', message: '讯飞服务连接错误' });
  });
}

function handleUpstreamMessage(
  client: WebSocket,
  state: SessionState,
  payload: Record<string, unknown>
): void {
  if (payload.action === 'started') {
    state.upstreamReady = true;
    flushPendingAudio(state);
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
        raw: {
          segId: result.segId,
          isEnd: result.isEnd,
          bg: result.bg,
          ed: result.ed,
        },
      });
    }
    return;
  }

  if (payload.action === 'error') {
    safeSend(client, {
      type: 'error',
      message: typeof payload.desc === 'string' ? payload.desc : '讯飞服务错误',
      raw: payload,
    });
  }
}

function flushPendingAudio(state: SessionState): void {
  if (!state.upstream || state.upstream.readyState !== WebSocket.OPEN) {
    return;
  }

  while (state.pendingAudio.length > 0) {
    const chunk = state.pendingAudio.shift();
    if (chunk) {
      state.upstream.send(chunk);
    }
  }
}

async function sendEndFrame(state: SessionState): Promise<void> {
  if (!state.upstream || state.upstream.readyState !== WebSocket.OPEN) {
    state.started = false;
    state.upstreamReady = false;
    return;
  }

  try {
    state.upstream.send(END_MESSAGE);
  } catch (error) {
    console.error('[Gateway] 发送结束帧失败:', error);
  }
}

async function finalizeSession(state: SessionState): Promise<void> {
  await sendEndFrame(state);

  try {
    state.upstream?.close();
  } catch {
    // 客户端已经断开时仅做兜底清理
  }
}

function safeSend(ws: WebSocket, event: GatewayEvent): void {
  if (getReadyState(ws) !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify(event));
}

function getReadyState(ws: WebSocket): number {
  return typeof ws.readyState === 'number' ? ws.readyState : WebSocket.CLOSED;
}
