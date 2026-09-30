import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-email-send-code-tests-32ch!!';

  /** 内存版 Redis 假实现：覆盖验证码存储与日计数用到的命令子集 */
  function createFakeRedis() {
    const entries = new Map<string, { value: string; expireAt: number | null }>();
    const now = () => Date.now();
    return {
      entries,
      async set(key: string, value: string, _mode?: string, seconds?: number) {
        entries.set(key, {
          value,
          expireAt: typeof seconds === 'number' ? now() + seconds * 1000 : null,
        });
        return 'OK';
      },
      async get(key: string) {
        const entry = entries.get(key);
        if (!entry) return null;
        if (entry.expireAt !== null && entry.expireAt <= now()) {
          entries.delete(key);
          return null;
        }
        return entry.value;
      },
      async del(key: string) {
        return entries.delete(key) ? 1 : 0;
      },
      async incr(key: string) {
        const entry = entries.get(key);
        const next = (entry ? Number(entry.value) : 0) + 1;
        entries.set(key, { value: String(next), expireAt: entry?.expireAt ?? null });
        return next;
      },
      async expire(key: string, seconds: number) {
        const entry = entries.get(key);
        if (!entry) return 0;
        entry.expireAt = now() + seconds * 1000;
        return 1;
      },
      async ttl(key: string) {
        const entry = entries.get(key);
        if (!entry || entry.expireAt === null) return -1;
        return Math.max(0, Math.ceil((entry.expireAt - now()) / 1000));
      },
    };
  }

  return {
    createFakeRedis,
    redis: null as unknown as ReturnType<typeof createFakeRedis>,
    userFindUnique: vi.fn(),
    userFindFirst: vi.fn(),
    check: vi.fn(),
    sendVerificationCode: vi.fn(),
    sendPasswordReset: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: { user: { findUnique: mocks.userFindUnique, findFirst: mocks.userFindFirst } },
}));

vi.mock('@repo/redis', () => ({ getRedisClient: () => mocks.redis }));

vi.mock('@repo/shared/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared/server')>();
  class FakeRateLimiter {
    check = mocks.check;
  }
  return { ...actual, RateLimiter: FakeRateLimiter };
});

import { POST } from './route';
import { setMailer, type MailAdapter } from '@/lib/mail/mailer';
import { signAccessToken } from '@/lib/auth/jwt';

function sendCodeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return new NextRequest('http://localhost/api/auth/email/send-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7', ...headers },
    body: JSON.stringify(body),
  });
}

function bindRequest(body: Record<string, unknown>) {
  return sendCodeRequest(body, { authorization: `Bearer ${signAccessToken('user_1', 'user')}` });
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

describe('POST /api/auth/email/send-code', () => {
  beforeEach(() => {
    mocks.redis = mocks.createFakeRedis();
    for (const mock of [
      mocks.userFindUnique,
      mocks.userFindFirst,
      mocks.check,
      mocks.sendVerificationCode,
      mocks.sendPasswordReset,
    ]) {
      mock.mockReset();
    }

    mocks.check.mockResolvedValue({ allowed: true, remaining: 4, reset: 0, limit: 5 });
    // 认证状态检查（by id）通过；邮箱占用检查（by email）默认无人占用
    mocks.userFindUnique.mockImplementation((args: { where?: { id?: string } }) =>
      Promise.resolve(
        args?.where?.id
          ? { id: args.where.id, status: 'active', role: 'user', isAnonymous: false, tokens: 20000 }
          : null
      )
    );
    mocks.userFindFirst.mockResolvedValue(null);
    mocks.sendVerificationCode.mockResolvedValue(undefined);
    mocks.sendPasswordReset.mockResolvedValue(undefined);
    setMailer(fakeMailer());
  });

  afterEach(() => {
    setMailer(null);
    vi.restoreAllMocks();
  });

  it('注册用途：邮箱未被占用时发送验证码，只存 SHA-256 摘要且 10 分钟有效', async () => {
    vi.spyOn(crypto, 'randomInt').mockReturnValue(246810 as never);

    const response = await POST(
      sendCodeRequest({ purpose: 'register', email: 'Newbie@Example.com' })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: '验证码已发送，请在 10 分钟内完成注册',
    });

    expect(mocks.sendVerificationCode).toHaveBeenCalledTimes(1);
    const [to, code, purpose] = mocks.sendVerificationCode.mock.calls[0];
    expect(to).toBe('newbie@example.com');
    expect(code).toBe('246810');
    expect(purpose).toBe('register');

    const stored = mocks.redis.entries.get('verify:register:newbie@example.com');
    expect(stored?.value).toBe(sha256('246810'));
    expect(stored?.value).not.toContain('246810');
    expect(await mocks.redis.ttl('verify:register:newbie@example.com')).toBeLessThanOrEqual(600);
  });

  it('注册用途：邮箱已被注册时返回 400，且不发验证码', async () => {
    mocks.userFindFirst.mockResolvedValue({ id: 'user_9' });

    const response = await POST(sendCodeRequest({ purpose: 'register', email: 'taken@example.com' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'EMAIL_EXISTS' });
    expect(mocks.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('绑定用途：未登录返回 401，且不发验证码', async () => {
    const response = await POST(sendCodeRequest({ purpose: 'bind', email: 'mine@example.com' }));

    expect(response.status).toBe(401);
    expect(mocks.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('绑定用途：邮箱已被其他账号绑定时返回 400，且不发验证码', async () => {
    mocks.userFindUnique.mockImplementation((args: { where?: { id?: string } }) =>
      Promise.resolve(
        args?.where?.id
          ? { id: args.where.id, status: 'active', role: 'user', isAnonymous: false, tokens: 20000 }
          : null
      )
    );
    mocks.userFindFirst.mockResolvedValue({ id: 'user_other' });

    const response = await POST(bindRequest({ purpose: 'bind', email: 'other@example.com' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'EMAIL_EXISTS' });
    expect(mocks.sendVerificationCode).not.toHaveBeenCalled();
    // 占用检查必须排除当前用户自身，否则换绑回自己邮箱会被误判
    expect(mocks.userFindFirst).toHaveBeenCalledWith({
      where: { email: 'other@example.com', id: { not: 'user_1' } },
    });
  });

  it('绑定用途：已登录且邮箱可用时发送验证码', async () => {
    const response = await POST(bindRequest({ purpose: 'bind', email: 'mine@example.com' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: '验证码已发送，请在 10 分钟内完成绑定',
    });
    expect(mocks.sendVerificationCode).toHaveBeenCalledWith(
      'mine@example.com',
      expect.stringMatching(/^\d{6}$/),
      'bind'
    );
  });

  it('重置用途已下线：purpose=reset 一律 400（忘记密码走重置链接，不发验证码）', async () => {
    const response = await POST(sendCodeRequest({ purpose: 'reset', email: 'known@example.com' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'INVALID_REQUEST' });
    expect(mocks.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('单邮箱日上限：第 11 次请求返回 429，对未注册邮箱同样生效（不泄露存在性）', async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    for (let i = 0; i < 10; i += 1) {
      const allowed = await POST(
        sendCodeRequest({ purpose: 'register', email: 'anyone@example.com' })
      );
      expect(allowed.status).toBe(200);
    }

    const blocked = await POST(
      sendCodeRequest({ purpose: 'register', email: 'anyone@example.com' })
    );

    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({
      errorCode: 'TOO_MANY_REQUESTS',
      details: { retryAfter: expect.any(Number) },
    });
    expect(mocks.sendVerificationCode).toHaveBeenCalledTimes(10);
  });

  it('IP 限流命中时返回 429，且不发验证码', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: now + 31, limit: 5 });

    const response = await POST(sendCodeRequest({ purpose: 'register', email: 'new@example.com' }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ details: { retryAfter: 31 } });
    expect(mocks.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('限流设施故障时 fail-closed 返回 503', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({
      allowed: false,
      remaining: 0,
      reset: now,
      limit: 5,
      reason: 'limiter-unavailable',
    });

    const response = await POST(sendCodeRequest({ purpose: 'register', email: 'new@example.com' }));

    expect(response.status).toBe(503);
    expect(mocks.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('未配置邮件凭证时返回 503，且对已注册与未注册的邮箱表现一致（防枚举）', async () => {
    setMailer(null);
    // 一个邮箱已被占用、一个未占用：邮件通道未配置时两者都必须在查库前统一 503
    mocks.userFindFirst.mockImplementation((args: { where?: { email?: string } }) =>
      Promise.resolve(args?.where?.email === 'taken@example.com' ? { id: 'user_9' } : null)
    );

    for (const email of ['taken@example.com', 'nobody@example.com']) {
      const response = await POST(sendCodeRequest({ purpose: 'register', email }));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ errorCode: 'SERVICE_UNAVAILABLE' });
    }
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('参数非法时返回 400 中文提示', async () => {
    const response = await POST(sendCodeRequest({ purpose: 'unknown', email: 'not-an-email' }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.errorCode).toBe('INVALID_REQUEST');
    expect(payload.error).toMatch(/[\u4e00-\u9fa5]/);
  });
});
