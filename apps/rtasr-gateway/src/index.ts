import { createServer } from 'node:http';
import { createHmac, createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '@repo/logger';

type ClientControlMessage = { type: 'start'; pd?: string } | { type: 'end' } | { type: 'ping' };

type GatewayEvent =
  | { type: 'status'; status: 'connected' | 'started' | 'stopped' }
  | { type: 'result'; segId?: number; isEnd?: boolean; text: string; raw?: unknown }
  | { type: 'error'; message: string; raw?: unknown };

const APP_ID = process.env.XFYUN_RTASR_APPID;
const API_KEY = process.env.XFYUN_RTASR_API_KEY;
const DEFAULT_PD = process.env.XFYUN_RTASR_PD;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function buildSigna(appId: string, apiKey: string, ts: string): string {
  const baseString = `${appId}${ts}`;
  const md5 = createHash('md5').update(baseString).digest('hex');
  const hmac = createHmac('sha1', apiKey).update(md5).digest('base64');
  return hmac;
}

function formatTime(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function extractCnText(data: any): {
  text: string;
  segId?: number;
  bg?: number;
  ed?: number;
  isEnd?: boolean;
} {
  const cn = data?.cn;
  const st = cn?.st;
  const segId = typeof data?.seg_id === 'number' ? data.seg_id : undefined;
  const bg = st?.bg !== undefined ? Number(st.bg) : undefined;
  const ed = st?.ed !== undefined ? Number(st.ed) : undefined;
  const rt = Array.isArray(st?.rt) ? st.rt : [];

  const text = rt
    .flatMap((r: any) => (Array.isArray(r?.ws) ? r.ws : []))
    .flatMap((w: any) => (Array.isArray(w?.cw) ? w.cw : []))
    .map((cw: any) => (typeof cw?.w === 'string' ? cw.w : ''))
    .join('')
    .trim();

  const isEnd = typeof data?.isEnd === 'boolean' ? data.isEnd : undefined;

  return { text, segId, bg, ed, isEnd };
}

async function connectXfyun(params: { pd?: string }) {
  const appId = requireEnv(APP_ID, 'XFYUN_RTASR_APPID');
  const apiKey = requireEnv(API_KEY, 'XFYUN_RTASR_API_KEY');

  const ts = String(Math.floor(Date.now() / 1000));
  const signa = buildSigna(appId, apiKey, ts);

  const qs = new URLSearchParams({
    appid: appId,
    ts,
    signa,
  });

  const pd = params.pd || DEFAULT_PD;
  if (pd) {
    qs.set('pd', pd);
  }

  const url = `wss://rtasr.xfyun.cn/v1/ws?${qs.toString()}`;
  const ws = new WebSocket(url);

  return ws;
}

function safeSend(ws: WebSocket, event: GatewayEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (client) => {
  let upstream: WebSocket | null = null;
  let upstreamReady = false;
  let ended = false;
  const pendingAudio: Buffer[] = [];

  safeSend(client, { type: 'status', status: 'connected' });

  const startUpstream = async (pd?: string) => {
    if (upstream) return;

    try {
      upstream = await connectXfyun({ pd });

      upstream.on('open', () => {
        upstreamReady = true;
        safeSend(client, { type: 'status', status: 'started' });
        while (pendingAudio.length > 0) {
          const chunk = pendingAudio.shift();
          if (chunk && upstream && upstream.readyState === WebSocket.OPEN) {
            upstream.send(chunk);
          }
        }
      });

      upstream.on('message', (msg) => {
        try {
          const text = typeof msg === 'string' ? msg : msg.toString('utf8');
          const payload = JSON.parse(text);

          if (payload?.action === 'result' && payload?.data) {
            const data = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;
            const extracted = extractCnText(data);

            if (extracted.text) {
              safeSend(client, {
                type: 'result',
                segId: extracted.segId,
                isEnd: extracted.isEnd,
                text: extracted.text,
                raw: {
                  segId: extracted.segId,
                  isEnd: extracted.isEnd,
                  bg: extracted.bg,
                  ed: extracted.ed,
                  timestamp: extracted.bg !== undefined ? formatTime(extracted.bg) : undefined,
                },
              });
            }
          } else if (payload?.action === 'error') {
            safeSend(client, {
              type: 'error',
              message: payload?.desc || 'Upstream error',
              raw: payload,
            });
          }
        } catch (err) {
          safeSend(client, { type: 'error', message: 'Failed to parse upstream message' });
        }
      });

      upstream.on('close', () => {
        upstreamReady = false;
        if (!ended) {
          safeSend(client, { type: 'status', status: 'stopped' });
        }
      });

      upstream.on('error', (err) => {
        safeSend(client, {
          type: 'error',
          message: err instanceof Error ? err.message : 'Upstream error',
        });
      });
    } catch (err) {
      safeSend(client, {
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to connect upstream',
      });
    }
  };

  client.on('message', async (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString()) as ClientControlMessage;
        if (msg.type === 'start') {
          await startUpstream(msg.pd);
          return;
        }
        if (msg.type === 'end') {
          ended = true;
          if (upstream && upstream.readyState === WebSocket.OPEN) {
            upstream.send(Buffer.from('{"end": true}'));
          }
          safeSend(client, { type: 'status', status: 'stopped' });
          return;
        }
        if (msg.type === 'ping') {
          safeSend(client, { type: 'status', status: 'connected' });
          return;
        }
      } catch (err) {
        safeSend(client, { type: 'error', message: 'Invalid control message' });
      }
      return;
    }

    if (!upstream) {
      await startUpstream();
    }

    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

    if (!upstream || upstream.readyState !== WebSocket.OPEN || !upstreamReady) {
      pendingAudio.push(chunk);
      return;
    }

    upstream.send(chunk);
  });

  client.on('close', () => {
    ended = true;
    try {
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(Buffer.from('{"end": true}'));
      }
    } catch {}

    try {
      upstream?.close();
    } catch {}
  });
});

const startServer = async (basePort: number, maxAttempts: number = 10) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentPort = basePort + attempt;

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: any) => {
          if (error.code === 'EADDRINUSE') {
            logger.warn(`端口 ${currentPort} 被占用，尝试端口 ${currentPort + 1}...`);
            server.close();
            reject(new Error(`PORT_IN_USE:${currentPort}`));
          } else {
            reject(error);
          }
        };

        server.once('error', onError);

        server.listen(currentPort, () => {
          server.off('error', onError);
          logger.info(`RTASR gateway 监听端口 :${currentPort}`);
          resolve();
        });
      });

      // 成功启动，返回
      return;
    } catch (error: any) {
      if (error.message.startsWith('PORT_IN_USE:')) {
        // 端口被占用，继续尝试下一个端口
        if (attempt === maxAttempts - 1) {
          // 最后一次尝试也失败了
          throw new Error(
            `尝试了 ${maxAttempts} 个端口 (${basePort}-${basePort + maxAttempts - 1}) 都已被占用`
          );
        }
        // 继续循环，尝试下一个端口
        continue;
      }
      // 其他错误，直接抛出
      throw error;
    }
  }

  throw new Error(`无法启动服务器，所有端口都被占用`);
};

const basePort = Number(process.env.PORT || 8787);
startServer(basePort).catch((error) => {
  logger.error(`启动服务器失败:`, error);
  process.exit(1);
});
