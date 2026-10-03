/**
 * /api/agent-tools/[id]/test 路由单元测试（spec §4.3 / §5 / 工单 02 / 返工强化）
 *
 * 验证目标：
 * - 认证与权限：未登录 401、工具不存在 404、越权访问他人工具 404
 * - 限流控制：触发 agentToolsTest 限流返回 429
 * - 可达性判定：HTTP 200 判定为可达；HTTP 4xx / 5xx 同样判定为可达并返回真实状态码
 * - 不可达准确分类（基于 node:https 与 guardedLookup 新传输层）：
 *   - DNS 解析失败 → reason: 'DNS 解析失败'
 *   - 命中黑名单（字面量内网或 DNS 重绑定到内网）→ reason: '命中黑名单'
 *   - 连接超时 → reason: '连接超时'
 *   - TLS 错误 → reason: 'TLS 错误'
 *   - 重定向被拒（HTTP 3xx）→ reason: '重定向被拒'
 * - 纪律验证：测试探测绝不向 WebhookToolCall 审计表落库
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ClientRequestArgs } from 'node:http';
import { signAccessToken } from '@/lib/auth/jwt';
import { ToolError } from '@/lib/agent/tool-error';
import { POST } from './route';

/** 模拟客户端请求对象 */
class MockClientRequest extends EventEmitter {
  writtenData: string[] = [];
  destroyed = false;
  destroyError?: Error;

  write(chunk: unknown) {
    if (typeof chunk === 'string') {
      this.writtenData.push(chunk);
    } else if (Buffer.isBuffer(chunk)) {
      this.writtenData.push(chunk.toString('utf8'));
    }
    return true;
  }

  end(chunk?: unknown) {
    if (chunk) {
      this.write(chunk);
    }
    return this;
  }

  destroy(err?: Error) {
    this.destroyed = true;
    this.destroyError = err;
    if (err) {
      process.nextTick(() => this.emit('error', err));
    }
    this.emit('close');
    return this;
  }

  setTimeout(_ms: number, cb?: () => void) {
    if (cb) this.on('timeout', cb);
    return this;
  }
}

/** 模拟响应流对象 */
class MockIncomingMessage extends PassThrough {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  destroyed = false;

  constructor(options: {
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
  }) {
    super();
    this.statusCode = options.statusCode ?? 200;
    this.headers = options.headers ?? {};
  }

  override destroy(err?: Error): this {
    this.destroyed = true;
    if (err) {
      this.emit('error', err);
    }
    return super.destroy(err);
  }
}

interface MockResponseConfig {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | Buffer;
  error?: Error;
  hangs?: boolean;
}

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-agent-tools-test-route-32c!';
  process.env.WEBHOOK_SECRET_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  let currentResponseConfig: MockResponseConfig = {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: 'ok',
  };

  const dnsLookupMock = vi.fn(
    (
      _hostname: string,
      options: unknown,
      callback?: (...args: unknown[]) => void
    ) => {
      const cb = (typeof options === 'function' ? options : callback) as (
        err: Error | null,
        addresses?: Array<{ address: string; family: number }>
      ) => void;
      if (cb) {
        cb(null, [{ address: '93.184.216.34', family: 4 }]);
      }
    }
  );

  const httpsRequestMock = vi.fn(
    (options: ClientRequestArgs, callback?: (res: MockIncomingMessage) => void) => {
      const req = new MockClientRequest();

      // 模拟底层网络库行为：如果配置了 lookup，在建连前先调用 lookup 进行解析与安全校验
      if (typeof options.lookup === 'function') {
        const hostname = typeof options.hostname === 'string' ? options.hostname : 'localhost';
        options.lookup(
          hostname,
          { all: true },
          (err: Error | null) => {
            if (err) {
              // 域名解析失败或命中黑名单：Node 不会发起实际 TCP/TLS 连接，直接派发 error
              process.nextTick(() => {
                req.emit('error', err);
              });
              return;
            }

            dispatchMockResponse(req, callback);
          }
        );
      } else {
        dispatchMockResponse(req, callback);
      }

      return req;
    }
  );

  function dispatchMockResponse(
    req: MockClientRequest,
    callback?: (res: MockIncomingMessage) => void
  ) {
    if (currentResponseConfig.error) {
      process.nextTick(() => {
        req.emit('error', currentResponseConfig.error);
      });
      return;
    }

    if (currentResponseConfig.hangs) {
      return;
    }

    const res = new MockIncomingMessage({
      statusCode: currentResponseConfig.statusCode ?? 200,
      headers: currentResponseConfig.headers ?? {},
    });

    process.nextTick(() => {
      if (callback) {
        callback(res);
      }
      if (currentResponseConfig.body !== undefined) {
        if (!res.destroyed) {
          res.end(currentResponseConfig.body);
        }
      } else {
        if (!res.destroyed) {
          res.end();
        }
      }
    });
  }

  function createFakeRedis() {
    const entries = new Map<string, { value: string; expireAt: number | null }>();
    const now = () => Date.now();
    return {
      entries,
      unavailable: false,
      async get(key: string) {
        if (this.unavailable) throw new Error('connect ECONNREFUSED 10.0.0.5:6379');
        const entry = entries.get(key);
        if (!entry) return null;
        if (entry.expireAt !== null && entry.expireAt <= now()) {
          entries.delete(key);
          return null;
        }
        return entry.value;
      },
      async del(key: string) {
        if (this.unavailable) throw new Error('connect ECONNREFUSED 10.0.0.5:6379');
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
    };
  }

  return {
    createFakeRedis,
    redis: null as unknown as ReturnType<typeof createFakeRedis>,
    userFindUnique: vi.fn(),
    toolFindUnique: vi.fn(),
    auditCreate: vi.fn(),
    check: vi.fn(),
    dnsLookupMock,
    httpsRequestMock,
    setResponseConfig: (config: MockResponseConfig) => {
      currentResponseConfig = config;
    },
    resetState: () => {
      currentResponseConfig = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: 'ok',
      };
      dnsLookupMock.mockReset();
      dnsLookupMock.mockImplementation((_h, options, callback) => {
        const cb = (typeof options === 'function' ? options : callback) as (
          err: Error | null,
          addresses?: Array<{ address: string; family: number }>
        ) => void;
        if (cb) {
          cb(null, [{ address: '93.184.216.34', family: 4 }]);
        }
      });
    },
  };
});

vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  return {
    ...actual,
    lookup: mocks.dnsLookupMock,
    default: {
      ...actual,
      lookup: mocks.dnsLookupMock,
    },
  };
});

vi.mock('node:https', () => ({
  request: mocks.httpsRequestMock,
  default: {
    request: mocks.httpsRequestMock,
  },
}));

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    userWebhookTool: {
      findUnique: mocks.toolFindUnique,
    },
    webhookToolCall: {
      create: mocks.auditCreate,
    },
  },
}));

vi.mock('@repo/redis', () => ({ getRedisClient: () => mocks.redis }));

vi.mock('@repo/shared/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared/server')>();
  class FakeRateLimiter {
    check = mocks.check;
  }
  return { ...actual, RateLimiter: FakeRateLimiter };
});

function createTestRequest(
  id: string,
  token: string | null = signAccessToken('user_1', 'user')
) {
  const req = new NextRequest(`http://localhost/api/agent-tools/${id}/test`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.195',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  const context = {
    params: Promise.resolve({ id }),
  };

  return { req, context };
}

describe('POST /api/agent-tools/[id]/test 测试连接路由', () => {
  const testUser = {
    id: 'user_1',
    email: 'user1@example.com',
    role: 'user',
    status: 'active',
  };

  const myTool = {
    id: 'tool_1',
    userId: 'user_1',
    name: '我的探测工具',
    callName: 'probe_tool',
    description: '用于测试连接',
    url: 'https://api.example.com/health',
    method: 'GET',
    authHeaderName: null,
    authHeaderValueEnc: null,
    params: [],
    enabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetState();
    mocks.redis = mocks.createFakeRedis();
    mocks.userFindUnique.mockResolvedValue(testUser);
    mocks.toolFindUnique.mockResolvedValue(myTool);
    mocks.check.mockResolvedValue({ allowed: true, remaining: 9, reset: 60 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未登录请求返回 401', async () => {
    const { req, context } = createTestRequest('tool_1', null);
    const res = await POST(req, context);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('限流超限返回 429', async () => {
    mocks.check.mockResolvedValueOnce({
      allowed: false,
      reason: 'rate-limited',
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 45,
    });

    const { req, context } = createTestRequest('tool_1');
    const res = await POST(req, context);

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('工具不存在时返回 404', async () => {
    mocks.toolFindUnique.mockResolvedValueOnce(null);

    const { req, context } = createTestRequest('not_found_tool');
    const res = await POST(req, context);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('工具不存在');
  });

  it('越权访问他人工具返回 404', async () => {
    mocks.toolFindUnique.mockResolvedValueOnce({
      ...myTool,
      userId: 'other_user',
    });

    const { req, context } = createTestRequest('tool_1');
    const res = await POST(req, context);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('工具不存在');
  });

  it('目标地址返回 HTTP 200 判为可达', async () => {
    mocks.setResponseConfig({ statusCode: 200, body: 'ok' });

    const { req, context } = createTestRequest('tool_1');
    const res = await POST(req, context);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.reachable).toBe(true);
    expect(json.data.statusCode).toBe(200);
    expect(typeof json.data.durationMs).toBe('number');
  });

  it('目标地址返回 HTTP 4xx/5xx 同样判定为可达', async () => {
    // 404 响应
    mocks.setResponseConfig({ statusCode: 404, body: 'not found' });

    const { req: req404, context: ctx404 } = createTestRequest('tool_1');
    const res404 = await POST(req404, ctx404);

    expect(res404.status).toBe(200);
    const json404 = await res404.json();
    expect(json404.data.reachable).toBe(true);
    expect(json404.data.statusCode).toBe(404);

    // 500 响应
    mocks.setResponseConfig({ statusCode: 500, body: 'error' });

    const { req: req500, context: ctx500 } = createTestRequest('tool_1');
    const res500 = await POST(req500, ctx500);

    expect(res500.status).toBe(200);
    const json500 = await res500.json();
    expect(json500.data.reachable).toBe(true);
    expect(json500.data.statusCode).toBe(500);
  });

  it('DNS 解析失败返回不可达且分类准确', async () => {
    mocks.dnsLookupMock.mockImplementation((_hostname, options, callback) => {
      const cb = (typeof options === 'function' ? options : callback) as (
        err: Error | null
      ) => void;
      if (cb) {
        cb(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
      }
    });

    const { req, context } = createTestRequest('tool_1');
    const res = await POST(req, context);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.reachable).toBe(false);
    expect(json.data.reason).toBe('DNS 解析失败');
  });

  it('命中内网黑名单返回不可达且分类准确', async () => {
    // DNS 解析出 10.0.0.1 内网地址，由 guardedLookup 拦截
    mocks.dnsLookupMock.mockImplementation((_hostname, options, callback) => {
      const cb = (typeof options === 'function' ? options : callback) as (
        err: Error | null,
        addresses?: Array<{ address: string; family: number }>
      ) => void;
      if (cb) {
        cb(null, [{ address: '10.0.0.1', family: 4 }]);
      }
    });

    const { req, context } = createTestRequest('tool_1');
    const res = await POST(req, context);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.reachable).toBe(false);
    expect(json.data.reason).toBe('命中黑名单');
  });

  it('模拟底层抛出 ToolError(ADDRESS_BLOCKED) 拦截时返回不可达且 reason 为命中黑名单', async () => {
    mocks.setResponseConfig({
      error: new ToolError('该地址不允许访问', 'ADDRESS_BLOCKED'),
    });

    const { req, context } = createTestRequest('tool_1');
    const res = await POST(req, context);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.reachable).toBe(false);
    expect(json.data.reason).toBe('命中黑名单');
  });

  it('连接超时返回不可达且分类准确', async () => {
    mocks.setResponseConfig({
      error: Object.assign(new Error('connect timeout'), { name: 'AbortError' }),
    });

    const { req, context } = createTestRequest('tool_1');
    const res = await POST(req, context);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.reachable).toBe(false);
    expect(json.data.reason).toBe('连接超时');
  });

  it('TLS 证书错误返回不可达且分类准确', async () => {
    mocks.setResponseConfig({
      error: new Error('CERT_HAS_EXPIRED'),
    });

    const { req, context } = createTestRequest('tool_1');
    const res = await POST(req, context);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.reachable).toBe(false);
    expect(json.data.reason).toBe('TLS 错误');
  });

  it('重定向 302 判定为不可达且分类为重定向被拒', async () => {
    mocks.setResponseConfig({
      statusCode: 302,
      headers: { location: 'https://redirected.example.com' },
    });

    const { req, context } = createTestRequest('tool_1');
    const res = await POST(req, context);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.reachable).toBe(false);
    expect(json.data.reason).toBe('重定向被拒');
  });

  it('测试探测绝不写入 WebhookToolCall 审计表', async () => {
    mocks.setResponseConfig({ statusCode: 200, body: 'ok' });

    const { req, context } = createTestRequest('tool_1');
    await POST(req, context);

    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
