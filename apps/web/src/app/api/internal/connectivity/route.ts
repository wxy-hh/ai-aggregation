import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 受保护连通性诊断：从 Vercel 运行时实测上游 AI / Redis 是否可达。
 * 仅用于排查生产环境 fetch failed，不暴露密钥内容。
 */
export async function GET(request: Request) {
  const secret = process.env.BILLING_RECONCILE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: '未配置 BILLING_RECONCILE_SECRET' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '无权访问' }, { status: 401 });
  }

  const startedAt = Date.now();
  const results: Record<string, unknown> = {
    region: process.env.VERCEL_REGION || null,
    node: process.version,
  };

  // 1) 讯飞
  results.xunfei = await probeFetch({
    name: 'xunfei',
    url: 'https://spark-api-open.xf-yun.com/v1/chat/completions',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XUNFEI_API_PASSWORD || ''}`,
      },
      body: JSON.stringify({
        model: 'lite',
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        max_tokens: 8,
      }),
    },
    hasKey: Boolean(process.env.XUNFEI_API_PASSWORD),
  });

  // 2) 豆包 chat completions
  const arkBase = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(
    /\/$/,
    ''
  );
  const arkModel = process.env.ARK_MODEL || 'doubao-seed-2-0-lite-260215';
  results.doubaoChat = await probeFetch({
    name: 'doubao-chat',
    url: `${arkBase}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ARK_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: arkModel,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        max_tokens: 8,
      }),
    },
    hasKey: Boolean(process.env.ARK_API_KEY),
  });

  // 3) 豆包 responses
  results.doubaoResponses = await probeFetch({
    name: 'doubao-responses',
    url: `${arkBase}/responses`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ARK_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: arkModel,
        input: [{ role: 'user', content: 'ping' }],
        stream: false,
        max_output_tokens: 8,
      }),
    },
    hasKey: Boolean(process.env.ARK_API_KEY),
  });

  // 4) Redis TCP 粗测：DNS + 一次 PING（若 ioredis 可用）
  results.redis = await probeRedis();

  results.totalMs = Date.now() - startedAt;
  return NextResponse.json(results);
}

async function probeFetch(input: {
  name: string;
  url: string;
  init: RequestInit;
  hasKey: boolean;
}) {
  const t0 = Date.now();
  if (!input.hasKey) {
    return { ok: false, error: 'missing_key', ms: 0, urlHost: safeHost(input.url) };
  }
  try {
    const res = await fetch(input.url, input.init);
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - t0,
      urlHost: safeHost(input.url),
      bodyPreview: text.slice(0, 180),
    };
  } catch (error) {
    const err = error as Error & { cause?: unknown };
    return {
      ok: false,
      ms: Date.now() - t0,
      urlHost: safeHost(input.url),
      error: err.message,
      causeName: err.cause && typeof err.cause === 'object' && 'name' in err.cause
        ? String((err.cause as { name?: string }).name)
        : null,
      causeCode: err.cause && typeof err.cause === 'object' && 'code' in err.cause
        ? String((err.cause as { code?: string }).code)
        : null,
      causeMessage:
        err.cause && typeof err.cause === 'object' && 'message' in err.cause
          ? String((err.cause as { message?: string }).message)
          : err.cause
            ? String(err.cause)
            : null,
    };
  }
}

async function probeRedis() {
  const t0 = Date.now();
  try {
    const { createRedisClient } = await import('@repo/shared/server');
    const redis = createRedisClient();
    try {
      // lazyConnect 默认开启时需显式 connect
      if (typeof (redis as { connect?: () => Promise<void> }).connect === 'function') {
        await (redis as { connect: () => Promise<void> }).connect();
      }
      const pong = await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('redis_ping_timeout')), 4000)),
      ]);
      return {
        ok: pong === 'PONG',
        pong,
        ms: Date.now() - t0,
        host: process.env.REDIS_HOST || null,
        viaUrl: Boolean(process.env.REDIS_URL),
      };
    } finally {
      try {
        redis.disconnect();
      } catch {
        // ignore
      }
    }
  } catch (error) {
    const err = error as Error & { cause?: unknown };
    return {
      ok: false,
      ms: Date.now() - t0,
      error: err.message,
      causeCode:
        err.cause && typeof err.cause === 'object' && 'code' in err.cause
          ? String((err.cause as { code?: string }).code)
          : null,
      host: process.env.REDIS_HOST || null,
      viaUrlHost: safeHost(process.env.REDIS_URL || ''),
    };
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
