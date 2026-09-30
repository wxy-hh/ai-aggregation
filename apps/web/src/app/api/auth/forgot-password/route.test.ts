import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  refreshTokenCreate: vi.fn(),
  check: vi.fn(),
  sendPasswordReset: vi.fn(),
  sendVerificationCode: vi.fn(),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, findFirst: mocks.userFindFirst },
    refreshToken: { create: mocks.refreshTokenCreate },
  },
}));

// 限流接缝：替换限流器实现，保留真实的阈值常量与 fail-closed 响应映射
vi.mock('@repo/redis', () => ({ getRedisClient: () => ({ 标记: '测试用 Redis 连接' }) }));

vi.mock('@repo/shared/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared/server')>();
  class FakeRateLimiter {
    check = mocks.check;
  }
  return { ...actual, RateLimiter: FakeRateLimiter };
});

import { POST } from './route';
import { setMailer, type MailAdapter } from '@/lib/mail/mailer';

/** 对外恒定文案：无论账号是否存在、是否绑定邮箱、是否发送成功都返回它 */
const CONSTANT_MESSAGE =
  '若账号已绑定邮箱，重置邮件已发送（链接 5 分钟内有效）；未绑定邮箱的账号请使用微信/QQ 登录或重新注册';

function forgotRequest(body: Record<string, unknown> = { account: 'alice' }) {
  return new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
    body: JSON.stringify(body),
  });
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fakeMailer(): MailAdapter {
  return {
    configured: true,
    sendVerificationCode: mocks.sendVerificationCode,
    sendPasswordReset: mocks.sendPasswordReset,
  };
}

/** 从发出的重置链接中取回明文令牌 */
function resetUrlFromMail(): string {
  return mocks.sendPasswordReset.mock.calls[0][1] as string;
}

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    for (const mock of [
      mocks.userFindUnique,
      mocks.userFindFirst,
      mocks.refreshTokenCreate,
      mocks.check,
      mocks.sendPasswordReset,
      mocks.sendVerificationCode,
    ]) {
      mock.mockReset();
    }
    mocks.check.mockResolvedValue({ allowed: true, remaining: 4, reset: 0, limit: 5 });
    mocks.userFindUnique.mockResolvedValue({
      id: 'user_1',
      username: 'alice',
      email: 'alice@example.com',
    });
    mocks.userFindFirst.mockResolvedValue({
      id: 'user_1',
      username: 'alice',
      email: 'alice@example.com',
    });
    mocks.refreshTokenCreate.mockResolvedValue({ id: 'token_1' });
    mocks.sendPasswordReset.mockResolvedValue(undefined);
    setMailer(fakeMailer());
  });

  afterEach(() => {
    setMailer(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('限流命中时返回 429，且不生成重置令牌', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: now + 25, limit: 5 });

    const response = await POST(forgotRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'TOO_MANY_REQUESTS',
      details: { retryAfter: 25 },
    });
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('限流设施故障时 fail-closed 返回 503，且不生成重置令牌', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({
      allowed: false,
      remaining: 0,
      reset: now,
      limit: 5,
      reason: 'limiter-unavailable',
    });

    const response = await POST(forgotRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ error: '服务暂不可用，请稍后再试' });
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('用户名命中且已绑定邮箱：令牌只存摘要，并向绑定邮箱发出重置链接', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com/');
    // 固定随机源，使明文令牌在测试内可推导，从而验证「库里是摘要不是明文」
    const plainToken = 'ab'.repeat(32);
    vi.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from(plainToken, 'hex') as never);

    const response = await POST(forgotRequest({ account: 'alice' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, message: CONSTANT_MESSAGE });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { username: 'alice' } });

    const stored = mocks.refreshTokenCreate.mock.calls[0][0].data.token as string;
    expect(stored).not.toBe(`reset:${plainToken}`);
    expect(stored).toBe(`reset:${sha256(plainToken)}`);

    expect(mocks.sendPasswordReset).toHaveBeenCalledTimes(1);
    const [to, resetUrl] = mocks.sendPasswordReset.mock.calls[0];
    expect(to).toBe('alice@example.com');
    expect(resetUrl).toBe(`https://app.example.com/reset-password?token=${plainToken}`);
  });

  it('支持按邮箱查找账号；未配置应用地址时回退到请求来源', async () => {
    const response = await POST(forgotRequest({ account: 'Alice@Example.com' }));

    expect(response.status).toBe(200);
    expect(mocks.userFindFirst).toHaveBeenCalledWith({ where: { email: 'alice@example.com' } });
    expect(resetUrlFromMail()).toMatch(/^http:\/\/localhost\/reset-password\?token=/);
  });

  it('兼容旧客户端的 username 字段', async () => {
    const response = await POST(forgotRequest({ username: 'alice' }));

    expect(response.status).toBe(200);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { username: 'alice' } });
  });

  it('用户存在但未绑定邮箱：不发信，返回同一恒定文案', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'user_1', username: 'alice', email: null });

    const response = await POST(forgotRequest({ account: 'alice' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ message: CONSTANT_MESSAGE });
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('用户不存在时返回同一恒定文案，不复刻账号是否存在', async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const missing = await POST(forgotRequest({ account: 'nobody' }));
    const missingPayload = await missing.json();

    expect(missing.status).toBe(200);
    expect(missingPayload.message).toBe(CONSTANT_MESSAGE);
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();

    // 已绑定邮箱的账号拿到完全相同的响应体
    mocks.userFindUnique.mockResolvedValue({
      id: 'user_1',
      username: 'alice',
      email: 'alice@example.com',
    });
    const existing = await POST(forgotRequest({ account: 'alice' }));
    expect(await existing.json()).toEqual(missingPayload);
    expect(mocks.sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('未配置邮件凭证时对任何账号都返回 503，避免成为账号存在性的旁路', async () => {
    setMailer(null);
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await POST(forgotRequest({ account: 'nobody' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'SERVICE_UNAVAILABLE' });
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('发信失败时仍返回恒定文案（错误只落服务端日志）', async () => {
    mocks.sendPasswordReset.mockRejectedValue(new Error('InvalidMailAddress'));

    const response = await POST(forgotRequest({ account: 'alice' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ message: CONSTANT_MESSAGE });
  });

  it('服务端异常返回 500，且不把内部错误细节透给客户端', async () => {
    mocks.userFindUnique.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const response = await POST(forgotRequest());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('ECONNREFUSED');
    await expect(JSON.parse(text)).toMatchObject({ error: '处理失败，请稍后重试' });
  });
});
