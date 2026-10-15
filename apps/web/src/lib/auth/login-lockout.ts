import { logger } from '@repo/logger';
import { getRedisClient } from '@repo/redis';

/**
 * 登录失败计数与渐进锁定（存 Redis，不动数据库 schema）。
 *
 * 策略：同一「用户名 + IP」连续失败 5 次锁定 15 分钟；**锁定期内的尝试只拒绝，
 * 不累计失败、不延长锁定**（否则攻击者周期性尝试即可把账号永久锁死——锁定 DoS）；
 * 锁定期满后再次失败才从已有计数继续累进、锁定时长逐次翻倍，上限 24 小时；登录成功清零。
 */

/** 触发锁定的连续失败次数阈值 */
export const LOCKOUT_FAILURE_THRESHOLD = 5;
/** 首次锁定时长（秒）：15 分钟 */
export const LOCKOUT_BASE_SECONDS = 15 * 60;
/** 锁定时长上限（秒）：24 小时 */
export const LOCKOUT_MAX_SECONDS = 24 * 60 * 60;
/** 失败计数与锁定状态的 Redis 保留时长（秒）：24 小时，避免长期占用内存 */
export const LOCKOUT_FAILURE_TTL_SECONDS = 24 * 60 * 60;

/**
 * 按「当前是第几次连续失败」推导锁定时长（秒）。
 * 未达阈值返回 0；达阈值后每多失败一次翻倍，封顶 24 小时。
 */
export function computeLockSeconds(failureCount: number): number {
  if (failureCount < LOCKOUT_FAILURE_THRESHOLD) {
    return 0;
  }

  const doublings = failureCount - LOCKOUT_FAILURE_THRESHOLD;
  return Math.min(LOCKOUT_BASE_SECONDS * 2 ** doublings, LOCKOUT_MAX_SECONDS);
}

/** 锁定提示文案：剩余分钟数向上取整（只剩 1 秒也要提示 1 分钟） */
export function formatLockoutMessage(remainingSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
  return `尝试次数过多，账号已临时锁定，请 ${minutes} 分钟后再试`;
}

/** 失败计数键：用户名 + IP（用户名统一小写，与登录入参归一化保持一致） */
export function buildLoginAttemptKey(username: string, ip: string): string {
  return `${username.toLowerCase()}:${ip}`;
}

/** 登录失败计数状态 */
export interface LoginLockState {
  /** 连续失败次数 */
  failures: number;
  /** 锁定截止时间（秒），未锁定为 null */
  lockedUntil: number | null;
}

/** 计入一次失败后的状态 */
export interface LoginFailureState extends LoginLockState {
  /** 本次失败触发的锁定时长（秒），未触发为 0 */
  lockSeconds: number;
}

export interface LoginAttemptStore {
  /** 读取当前失败计数与锁定状态 */
  getLock(key: string): Promise<LoginLockState>;
  /**
   * 计入一次失败并返回最新状态（达阈值时同时刷新锁定期限）。
   * 锁定期内调用不会累计也不会延长，原样返回当前状态（lockSeconds 为 0）。
   */
  recordFailure(key: string): Promise<LoginFailureState>;
  /** 登录成功后清零 */
  clear(key: string): Promise<void>;
}

const STORE_PREFIX = 'auth:login-lock';
const EMPTY_STATE: LoginLockState = { failures: 0, lockedUntil: null };

/**
 * 计数存储需要的 Redis 命令子集。
 * 用结构类型而非 ioredis 类型，避免 web 包直接依赖 ioredis（连接由 @repo/redis 治理）。
 */
export interface LoginAttemptRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/**
 * 创建失败计数存储（连接显式注入，便于测试与复用共享连接）。
 *
 * Redis 异常时按「未锁定」处理并记 warn：安全边界由认证限流层（fail-closed）兜底，
 * 不让计数设施的抖动把用户挡在登录之外。
 */
export function createLoginAttemptStore(redis: LoginAttemptRedis): LoginAttemptStore {
  const redisKey = (key: string) => `${STORE_PREFIX}:${key}`;

  const getLock = async (key: string): Promise<LoginLockState> => {
    try {
      const raw = await redis.get(redisKey(key));
      if (!raw) {
        return EMPTY_STATE;
      }

      const parsed = JSON.parse(raw) as Partial<LoginLockState>;
      return {
        failures: typeof parsed.failures === 'number' ? parsed.failures : 0,
        lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : null,
      };
    } catch (error) {
      logger.warn('读取登录失败计数失败，按未锁定处理', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return EMPTY_STATE;
    }
  };

  return {
    getLock,

    async recordFailure(key) {
      const current = await getLock(key);
      const now = Math.floor(Date.now() / 1000);

      // 锁定期内不喂养计数器：原样返回当前状态，不累计、不延长（防锁定 DoS）
      if (current.lockedUntil && current.lockedUntil > now) {
        return { ...current, lockSeconds: 0 };
      }

      const failures = current.failures + 1;
      const lockSeconds = computeLockSeconds(failures);
      const lockedUntil = lockSeconds > 0 ? now + lockSeconds : null;

      try {
        await redis.set(
          redisKey(key),
          JSON.stringify({ failures, lockedUntil } satisfies LoginLockState),
          'EX',
          LOCKOUT_FAILURE_TTL_SECONDS
        );
      } catch (error) {
        logger.warn('写入登录失败计数失败', {
          key,
          error: error instanceof Error ? error.message : String(error),
        });
        return { failures: 0, lockedUntil: null, lockSeconds: 0 };
      }

      return { failures, lockedUntil, lockSeconds };
    },

    async clear(key) {
      try {
        await redis.del(redisKey(key));
      } catch (error) {
        logger.warn('清除登录失败计数失败', {
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

/** 进程内唯一失败计数存储（复用共享 Redis 连接） */
let store: LoginAttemptStore | null = null;

export function getLoginAttemptStore(): LoginAttemptStore {
  if (!store) {
    store = createLoginAttemptStore(getRedisClient());
  }
  return store;
}
