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

/**
 * 解析 Redis 连接配置。
 *
 * Serverless（Vercel）上若 Redis 不可达且仍启用 offline queue，
 * ioredis 会无限排队导致 /api/chat 等接口挂起不返回。
 * 默认：短连接超时 + 关闭 offline queue + 有限重试，失败由调用方放行。
 */
function isUsableRedisUrl(url: string | undefined): url is string {
  if (!url) return false;
  // Vercel 敏感变量偶发被导出为占位符，不能当真实连接串
  if (url === '[SENSITIVE]' || url.includes('[SENSITIVE]')) return false;
  try {
    const parsed = new URL(url);
    return Boolean(parsed.hostname) && (parsed.protocol === 'redis:' || parsed.protocol === 'rediss:');
  } catch {
    return false;
  }
}

export function resolveRedisConnectionOptions(env: RedisEnv): RedisOptions {
  const redisUrl = env.REDIS_URL?.trim();
  // Vercel Upstash 集成常见变量名
  const kvUrl = env.KV_URL?.trim() || env.REDIS_KV_URL?.trim();
  // 优先 REDIS_URL；无效时回退 HOST/PASSWORD（避免死掉的 KV 集成域名抢优先级）
  const effectiveUrl = isUsableRedisUrl(redisUrl)
    ? redisUrl
    : isUsableRedisUrl(kvUrl)
      ? kvUrl
      : undefined;

  const base = effectiveUrl
    ? parseRedisUrl(effectiveUrl)
    : {
        host: env.REDIS_HOST || 'localhost',
        port: parseInt(env.REDIS_PORT || '6379', 10),
        username: env.REDIS_USERNAME || undefined,
        password: env.REDIS_PASSWORD || undefined,
        db: env.REDIS_DB ? parseInt(env.REDIS_DB, 10) : 0,
        tls: undefined,
      };

  const host = base.host || 'localhost';
  // Upstash / rediss / 显式 REDIS_TLS 时启用 TLS
  const looksLikeUpstash =
    host.includes('upstash.io') || host.includes('upstash') || host.endsWith('.kv.vercel-storage.com');
  const shouldUseTls =
    Boolean(base.tls) || parseBoolean(env.REDIS_TLS) || looksLikeUpstash;

  // Upstash 通常要求 username=default；未配置时补上
  const username =
    base.username ||
    env.REDIS_USERNAME ||
    (looksLikeUpstash && base.password ? 'default' : undefined);

  // 未显式配置时：短超时、有限重试，避免 Serverless 挂死
  const explicitMaxRetries = parseMaxRetriesPerRequest(env.REDIS_MAX_RETRIES_PER_REQUEST);
  const connectTimeout = env.REDIS_CONNECT_TIMEOUT
    ? parseInt(env.REDIS_CONNECT_TIMEOUT, 10)
    : 2000;
  const commandTimeout = env.REDIS_COMMAND_TIMEOUT
    ? parseInt(env.REDIS_COMMAND_TIMEOUT, 10)
    : 2000;

  // enableOfflineQueue：仅当显式 REDIS_ENABLE_OFFLINE_QUEUE=true 时开启
  const enableOfflineQueue = parseBoolean(env.REDIS_ENABLE_OFFLINE_QUEUE);

  return {
    ...base,
    host,
    username,
    db: Number.isNaN(base.db ?? 0) ? 0 : base.db,
    port: Number.isNaN(base.port ?? 0) ? 6379 : base.port,
    tls: shouldUseTls ? {} : undefined,
    // Serverless 默认懒连接：避免构造客户端时同步建连拖垮冷启动
    lazyConnect:
      env.REDIS_LAZY_CONNECT !== undefined
        ? parseBoolean(env.REDIS_LAZY_CONNECT)
        : true,
    // null 表示不限制；未配置时用 1，连接失败快速抛错
    maxRetriesPerRequest:
      explicitMaxRetries !== null || env.REDIS_MAX_RETRIES_PER_REQUEST
        ? explicitMaxRetries
        : 1,
    connectTimeout: Number.isNaN(connectTimeout) ? 2000 : connectTimeout,
    commandTimeout: Number.isNaN(commandTimeout) ? 2000 : commandTimeout,
    enableOfflineQueue,
    enableReadyCheck: !parseBoolean(env.REDIS_DISABLE_READY_CHECK),
    // 失败后少重试，避免长时间占用 Serverless 实例
    retryStrategy: (times: number) => {
      if (times > 2) return null;
      return Math.min(times * 50, 200);
    },
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
    viaUrl: Boolean(env.REDIS_URL || env.KV_URL || env.REDIS_KV_URL),
    offlineQueue: Boolean(options.enableOfflineQueue),
  };
}
