import type { RedisOptions } from 'ioredis';

type RedisEnv = Record<string, string | undefined>;

function parseBoolean(value: string | undefined) {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseMaxRetriesPerRequest(value: string | undefined): number | null {
  if (!value) return null;
  if (value.toLowerCase() === 'null') return null;

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const port = parsed.port ? parseInt(parsed.port, 10) : 6379;
  const db = parsed.pathname && parsed.pathname !== '/' ? parseInt(parsed.pathname.slice(1), 10) : 0;

  return {
    host: parsed.hostname,
    port,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number.isNaN(db) ? 0 : db,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

export function resolveRedisConnectionOptions(env: RedisEnv): RedisOptions {
  const redisUrl = env.REDIS_URL?.trim();
  const base = redisUrl
    ? parseRedisUrl(redisUrl)
    : {
        host: env.REDIS_HOST || 'localhost',
        port: parseInt(env.REDIS_PORT || '6379', 10),
        username: env.REDIS_USERNAME || undefined,
        password: env.REDIS_PASSWORD || undefined,
        db: env.REDIS_DB ? parseInt(env.REDIS_DB, 10) : 0,
        tls: undefined,
      };

  const shouldUseTls = Boolean(base.tls) || parseBoolean(env.REDIS_TLS);

  return {
    ...base,
    db: Number.isNaN(base.db ?? 0) ? 0 : base.db,
    port: Number.isNaN(base.port ?? 0) ? 6379 : base.port,
    tls: shouldUseTls ? {} : undefined,
    lazyConnect: parseBoolean(env.REDIS_LAZY_CONNECT),
    maxRetriesPerRequest: parseMaxRetriesPerRequest(env.REDIS_MAX_RETRIES_PER_REQUEST),
    connectTimeout: env.REDIS_CONNECT_TIMEOUT
      ? parseInt(env.REDIS_CONNECT_TIMEOUT, 10)
      : 10000,
    enableReadyCheck: !parseBoolean(env.REDIS_DISABLE_READY_CHECK),
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
  };
}

export function getRedisConnectionSummary(env: RedisEnv) {
  const options = resolveRedisConnectionOptions(env);

  return {
    host: options.host,
    port: options.port,
    db: options.db ?? 0,
    tls: Boolean(options.tls),
    hasPassword: Boolean(options.password),
    viaUrl: Boolean(env.REDIS_URL),
  };
}
