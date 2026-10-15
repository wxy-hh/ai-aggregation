import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  constructedConfigs: [] as Array<Record<string, unknown>>,
}));

vi.mock('@repo/redis', () => ({ getRedisClient: () => ({ 标记: '测试用 Redis 连接' }) }));

// 只替换限流器构造，保留真实的配置常量与响应映射
vi.mock('@repo/shared/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared/server')>();
  class FakeRateLimiter {
    check = mocks.check;

    constructor(_redis: unknown, config: Record<string, unknown>) {
      mocks.constructedConfigs.push(config);
    }
  }
  return { ...actual, RateLimiter: FakeRateLimiter };
});

import {
  AUTH_RATE_LIMITS,
  enforceAuthRateLimit,
  getAuthRateLimiter,
  resolveAuthRateLimitFailureMode,
} from './rate-limit';

function loginRequest(ip = '203.0.113.7') {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify({ username: 'alice', password: 'password123' }),
  });
}

describe('认证接口限流阈值常量', () => {
  it('按已拍板阈值配置各认证路由（登录 10/分、注册 5/分、忘记密码 5/分、重置密码 10/分）', () => {
    expect(AUTH_RATE_LIMITS).toMatchObject({
      login: { window: 60, limit: 10 },
      register: { window: 60, limit: 5 },
      forgotPassword: { window: 60, limit: 5 },
      resetPassword: { window: 60, limit: 10 },
    });
  });

  it('邮箱验证码类路由的阈值同样收敛在本表（发码 5/分、绑定点验 10/分）', () => {
    expect(AUTH_RATE_LIMITS.emailSendCode).toEqual({
      prefix: 'auth:email-send-code',
      window: 60,
      limit: 5,
    });
    expect(AUTH_RATE_LIMITS.emailBindVerify).toEqual({
      prefix: 'auth:email-bind-verify',
      window: 60,
      limit: 10,
    });
  });
});

describe('认证限流器工厂的故障处置模式', () => {
  beforeEach(() => {
    mocks.constructedConfigs.length = 0;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('默认 fail-closed：限流设施故障时拒绝认证请求', () => {
    delete process.env.AUTH_RATE_LIMIT_FAILURE_MODE;

    expect(resolveAuthRateLimitFailureMode()).toBe('closed');
    getAuthRateLimiter({ prefix: 'auth:test-default', window: 60, limit: 10 });
    expect(mocks.constructedConfigs.at(-1)).toMatchObject({ failureMode: 'closed' });
  });

  it('运维应急开关 AUTH_RATE_LIMIT_FAILURE_MODE=open 时放行', () => {
    process.env.AUTH_RATE_LIMIT_FAILURE_MODE = 'open';

    expect(resolveAuthRateLimitFailureMode()).toBe('open');
    getAuthRateLimiter({ prefix: 'auth:test-open', window: 60, limit: 10 });
    expect(mocks.constructedConfigs.at(-1)).toMatchObject({ failureMode: 'open' });
  });
});

describe('enforceAuthRateLimit 的响应映射', () => {
  beforeEach(() => {
    mocks.check.mockReset();
  });

  it('放行时返回 null，并把客户端 IP 作为限流键', async () => {
    mocks.check.mockResolvedValue({ allowed: true, remaining: 9, reset: 0, limit: 10 });

    const response = await enforceAuthRateLimit(
      loginRequest('198.51.100.9'),
      AUTH_RATE_LIMITS.login
    );

    expect(response).toBeNull();
    expect(mocks.check).toHaveBeenCalledWith('198.51.100.9');
  });

  it('超限时返回 429，并下发剩余等待秒数', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: now + 42, limit: 10 });

    const response = await enforceAuthRateLimit(loginRequest(), AUTH_RATE_LIMITS.login);

    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toMatchObject({
      errorCode: 'TOO_MANY_REQUESTS',
      details: { retryAfter: 42 },
    });
  });

  it('限流设施故障时返回 503 且不下发 Retry-After（reset 无窗口）', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({
      allowed: false,
      remaining: 0,
      reset: now,
      limit: 10,
      reason: 'limiter-unavailable',
    });

    const response = await enforceAuthRateLimit(loginRequest(), AUTH_RATE_LIMITS.login);

    expect(response?.status).toBe(503);
    expect(response?.headers.get('retry-after')).toBeNull();
    await expect(response?.json()).resolves.toMatchObject({
      error: '服务暂不可用，请稍后再试',
      errorCode: 'SERVICE_UNAVAILABLE',
    });
  });
});
