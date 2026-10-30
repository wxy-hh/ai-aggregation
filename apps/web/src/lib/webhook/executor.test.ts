/**
 * Webhook 执行器单元测试（spec §4.1 / §4.5 / §5 / 返工强化）
 *
 * 验证目标：
 * - 传输层重构：使用 node:https.request 与 node:dns.lookup 模拟出站请求，替代全局 fetch；
 * - TOCTOU 防御：guardedLookup 在传输层内聚，解析出内网 IP 时直接拦截且不发生实际网络连接，记录 blocked 审计；
 * - 内存保护：响应流式累计超过 200KB 立即销毁连接并按「响应过大」失败处理；
 * - 请求构造：POST body 与鉴权头（解密后）真实写出到请求；GET 参数正确追加到 query；
 * - 禁重定向：收到 3xx 触发重定向拒绝；
 * - 纯函数边界用例：https-only 拦截、内网字面量拦截；
 * - 鉴权凭证处理：解密失败显式报错不降级，绝不发无鉴权请求；
 * - 超时控制与中文文案；
 * - 响应内容 JSON 美化与超长 8000 字符截断；
 * - 审计字段断言（hostname 仅含域名不含 query、outcome 分类准确）；
 * - 审计写库失败不阻断正常调用流程；
 * - 握手级连通性探测 probeWebhookConnection 行为与分类。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ClientRequestArgs } from 'node:http';
import type { UserWebhookTool, WebhookHttpMethod } from '@repo/db';
import { encryptWebhookSecret } from '@/lib/crypto';
import { ToolError } from '@/lib/agent/tool-error';
import { executeWebhookTool, probeWebhookConnection } from './executor';

const TEST_SECRET_KEY = crypto.randomBytes(32).toString('hex');

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
  chunks?: (string | Buffer)[];
  error?: Error;
  hangs?: boolean;
}

const mocks = vi.hoisted(() => {
  process.env.WEBHOOK_SECRET_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  let currentResponseConfig: MockResponseConfig = {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'ok' }),
  };
  let lastReq: MockClientRequest | null = null;
  let lastRes: MockIncomingMessage | null = null;
  let lastOptions: ClientRequestArgs | null = null;
  let connectionAttempted = false;

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
      lastOptions = options;
      const req = new MockClientRequest();
      lastReq = req;

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

            // lookup 成功后建立连接
            connectionAttempted = true;
            dispatchMockResponse(req, callback);
          }
        );
      } else {
        connectionAttempted = true;
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
    lastRes = res;

    process.nextTick(() => {
      if (callback) {
        callback(res);
      }
      if (currentResponseConfig.chunks) {
        for (const chunk of currentResponseConfig.chunks) {
          if (!res.destroyed) {
            res.write(chunk);
          }
        }
        if (!res.destroyed) {
          res.end();
        }
      } else if (currentResponseConfig.body !== undefined) {
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

  return {
    auditCreate: vi.fn(),
    dnsLookupMock,
    httpsRequestMock,
    setResponseConfig: (config: MockResponseConfig) => {
      currentResponseConfig = config;
    },
    resetState: () => {
      currentResponseConfig = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ok' }),
      };
      lastReq = null;
      lastRes = null;
      lastOptions = null;
      connectionAttempted = false;
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
    getLastReq: () => lastReq,
    getLastRes: () => lastRes,
    getLastOptions: () => lastOptions,
    isConnectionAttempted: () => connectionAttempted,
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
    webhookToolCall: {
      create: mocks.auditCreate,
    },
  },
  WebhookHttpMethod: {
    GET: 'GET',
    POST: 'POST',
  },
}));

/** 创建用于测试的基础 Webhook 工具对象 */
function createTestTool(overrides?: Partial<UserWebhookTool>): UserWebhookTool {
  return {
    id: 'tool_test_1',
    userId: 'user_test_1',
    name: '测试工具',
    callName: 'test_tool',
    description: '这是一个测试工具',
    url: 'https://api.example.com/webhook',
    method: 'POST' as WebhookHttpMethod,
    authHeaderName: null,
    authHeaderValueEnc: null,
    params: [],
    enabled: true,
    requiresApproval: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Webhook 执行器与探测测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBHOOK_SECRET_KEY = TEST_SECRET_KEY;
    mocks.resetState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('边界与纯函数判定层', () => {
    it('拒绝 http 协议地址，记录 blocked 审计', async () => {
      const tool = createTestTool({ url: 'http://api.example.com/webhook' });
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(false);
      expect(result.contentForModel).toContain('Webhook 网址必须使用 https 协议');
      expect(result.summaryForDisplay).toContain('Webhook 网址必须使用 https 协议');

      expect(mocks.isConnectionAttempted()).toBe(false);
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'blocked',
            errorKind: 'blocked',
            hostname: 'api.example.com',
          }),
        })
      );
    });

    it('拒绝内网 IP 与危险主机名，记录 blocked 审计', async () => {
      const blockedUrls = [
        'https://127.0.0.1/api',
        'https://10.0.0.1/webhook',
        'https://192.168.1.1/hook',
        'https://169.254.169.254/latest/meta-data',
        'https://localhost/api',
        'https://internal.localdomain/hook',
      ];

      for (const url of blockedUrls) {
        mocks.auditCreate.mockClear();
        mocks.resetState();
        const tool = createTestTool({ url });
        const result = await executeWebhookTool(tool, {});

        expect(result.ok).toBe(false);
        expect(result.contentForModel).toContain('该地址不允许访问');
        expect(mocks.isConnectionAttempted()).toBe(false);
        expect(mocks.auditCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              outcome: 'blocked',
              errorKind: 'blocked',
            }),
          })
        );
      }
    });

    it('DNS 重绑定防护：lookup 校验失败（内网 IP 解析结果）→ 连接不发生且审计 outcome=blocked', async () => {
      // 模拟解析阶段返回内网 IP，由传输层内聚的 guardedLookup 拦截
      mocks.dnsLookupMock.mockImplementation((_hostname, options, callback) => {
        const cb = (typeof options === 'function' ? options : callback) as (
          err: Error | null,
          addresses?: Array<{ address: string; family: number }>
        ) => void;
        if (cb) {
          cb(null, [{ address: '127.0.0.1', family: 4 }]);
        }
      });

      const tool = createTestTool({ url: 'https://evil-rebinding.example.com/hook' });
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(false);
      expect(result.contentForModel).toContain('该地址不允许访问');
      // 验证核心安全防御：由于 lookup 阶段直接被拒，实际网络连接绝不发生
      expect(mocks.isConnectionAttempted()).toBe(false);
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'blocked',
            errorKind: 'blocked',
            hostname: 'evil-rebinding.example.com',
          }),
        })
      );
    });

    it('模拟黑名单拦截抛出 ToolError(ADDRESS_BLOCKED) → 判定为 blocked 审计', async () => {
      mocks.setResponseConfig({
        error: new ToolError('该地址不允许访问', 'ADDRESS_BLOCKED'),
      });

      const tool = createTestTool();
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(false);
      expect(result.summaryForDisplay).toBe('该地址不允许访问');
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'blocked',
            errorKind: 'blocked',
          }),
        })
      );
    });
  });

  describe('请求构造（GET query 与 POST body）', () => {
    it('GET 请求将参数正确拼入 query，并保留原有 query', async () => {
      mocks.setResponseConfig({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ok' }),
      });

      const tool = createTestTool({
        url: 'https://api.example.com/search?sort=desc',
        method: 'GET',
      });

      const args = {
        keyword: '测试',
        page: 1,
        filter: { tag: 'ai' },
      };

      const result = await executeWebhookTool(tool, args);

      expect(result.ok).toBe(true);
      expect(mocks.isConnectionAttempted()).toBe(true);

      const options = mocks.getLastOptions();
      expect(options?.method).toBe('GET');

      // 从请求路径中解析 query 参数验证
      const parsedUrl = new URL(`https://api.example.com${options?.path}`);
      expect(parsedUrl.searchParams.get('sort')).toBe('desc');
      expect(parsedUrl.searchParams.get('keyword')).toBe('测试');
      expect(parsedUrl.searchParams.get('page')).toBe('1');
      expect(parsedUrl.searchParams.get('filter')).toBe(JSON.stringify({ tag: 'ai' }));
    });

    it('POST 请求将参数作为 JSON body 传递，POST body 与鉴权头确实写出', async () => {
      const secret = 'sk-live-webhook-secret-token-123';
      const encrypted = encryptWebhookSecret(secret);

      mocks.setResponseConfig({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true }),
      });

      const tool = createTestTool({
        url: 'https://api.example.com/orders',
        method: 'POST',
        authHeaderName: 'Authorization',
        authHeaderValueEnc: encrypted,
      });

      const args = { orderId: '1001', amount: 99.5 };
      const result = await executeWebhookTool(tool, args);

      expect(result.ok).toBe(true);
      expect(mocks.isConnectionAttempted()).toBe(true);

      const options = mocks.getLastOptions();
      const req = mocks.getLastReq();

      // 断言请求方法、路径、鉴权头与 Content-Type
      expect(options?.method).toBe('POST');
      expect(options?.path).toBe('/orders');
      const headers = options?.headers as Record<string, string | undefined>;
      expect(headers?.['Authorization']).toBe(secret);
      expect(headers?.['Content-Type']).toBe('application/json');

      // 断言 POST body 确实写出
      expect(req?.writtenData.join('')).toBe(JSON.stringify(args));
    });
  });

  describe('鉴权凭证处理', () => {
    it('鉴权头齐全时解密并注入请求头', async () => {
      const secret = 'sk-custom-auth-key-888';
      const encrypted = encryptWebhookSecret(secret);

      mocks.setResponseConfig({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authenticated: true }),
      });

      const tool = createTestTool({
        authHeaderName: 'X-Api-Key',
        authHeaderValueEnc: encrypted,
      });

      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(true);
      const options = mocks.getLastOptions();
      const headers = options?.headers as Record<string, string | undefined>;
      expect(headers?.['X-Api-Key']).toBe(secret);
    });

    it('解密失败显式报错不降级，不发网络请求并写审计', async () => {
      const tool = createTestTool({
        authHeaderName: 'X-API-Key',
        authHeaderValueEnc: 'invalid-corrupted-base64-payload',
      });

      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(false);
      expect(result.contentForModel).toContain('鉴权凭证解密失败');
      expect(result.summaryForDisplay).toContain('鉴权凭证解密失败');
      expect(mocks.isConnectionAttempted()).toBe(false);

      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'failed',
            errorKind: 'auth_error',
            toolId: tool.id,
          }),
        })
      );
    });
  });

  describe('禁重定向与网络异常', () => {
    it('3xx 重定向一律判失败，输出模型可读中文文案', async () => {
      mocks.setResponseConfig({
        statusCode: 302,
        headers: { location: 'https://redirected.example.com/target' },
      });

      const tool = createTestTool();
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(false);
      expect(result.contentForModel).toContain('目标地址返回重定向（HTTP 302');
      expect(result.contentForModel).toContain('出于安全策略已拒绝');
      expect(result.summaryForDisplay).toContain('重定向已拒绝 (HTTP 302)');

      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'failed',
            errorKind: 'http_error',
            statusCode: 302,
          }),
        })
      );
    });

    it('请求超时输出中文文案并记录 timeout 审计', async () => {
      mocks.setResponseConfig({
        error: Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'AbortError',
        }),
      });

      const tool = createTestTool();
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(false);
      expect(result.contentForModel).toContain('连接超时，请稍后重试');
      expect(result.summaryForDisplay).toContain('连接超时，请稍后重试');

      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'failed',
            errorKind: 'timeout',
          }),
        })
      );
    });

    it('DNS 解析失败输出中文文案并记录 dns 审计', async () => {
      mocks.dnsLookupMock.mockImplementation((_hostname, options, callback) => {
        const cb = (typeof options === 'function' ? options : callback) as (
          err: Error | null
        ) => void;
        if (cb) {
          cb(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
        }
      });

      const tool = createTestTool({ url: 'https://non-existent-domain-xyz123.com/hook' });
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(false);
      expect(result.contentForModel).toContain('域名无法解析，请检查网址是否正确');
      expect(mocks.isConnectionAttempted()).toBe(false);
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'failed',
            errorKind: 'dns',
          }),
        })
      );
    });
  });

  describe('响应格式化与超大响应截断防护', () => {
    it('成功响应 JSON 格式自动美化，4xx/5xx 正常返回错误内容供模型阅读', async () => {
      mocks.setResponseConfig({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 0, data: { status: 'completed' } }),
      });

      const tool = createTestTool();
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(true);
      expect(result.contentForModel).toContain('{\n  "code": 0');
      expect(result.summaryForDisplay).toContain('调用成功 (HTTP 200)');

      // 测试 404 返回
      mocks.setResponseConfig({
        statusCode: 404,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: '资源不存在' }),
      });

      const failResult = await executeWebhookTool(tool, {});
      expect(failResult.ok).toBe(false);
      expect(failResult.contentForModel).toContain('HTTP 404');
      expect(failResult.contentForModel).toContain('资源不存在');
      expect(failResult.summaryForDisplay).toContain('调用失败 (HTTP 404)');
    });

    it('超过 8000 字符但未超 200KB 的响应进行文本截断', async () => {
      const longData = 'A'.repeat(10_000);
      mocks.setResponseConfig({
        statusCode: 200,
        headers: { 'content-type': 'text/plain' },
        body: longData,
      });

      const tool = createTestTool();
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(true);
      expect(result.contentForModel).toContain('…（已截断）');
      expect(result.contentForModel.length).toBeLessThan(8100);
    });

    it('响应超 200KB → 流式检测立即 destroy 且按失败文案处理', async () => {
      // 构造超过 200KB 的超大响应分块
      const chunk1 = Buffer.alloc(120 * 1024, 'x');
      const chunk2 = Buffer.alloc(100 * 1024, 'y'); // 累计 220KB > 200KB

      mocks.setResponseConfig({
        statusCode: 200,
        headers: { 'content-type': 'text/plain' },
        chunks: [chunk1, chunk2],
      });

      const tool = createTestTool();
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(false);
      expect(result.contentForModel).toContain('响应内容过大');
      expect(result.contentForModel).toContain('超过 200KB 上限');
      expect(result.summaryForDisplay).toContain('执行失败：响应内容过大');

      // 验证流被及时 destroy，防内存打爆
      const res = mocks.getLastRes();
      expect(res?.destroyed).toBe(true);

      // 验证审计日志记录为 failed
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'failed',
            errorKind: 'http_error',
          }),
        })
      );
    });
  });

  describe('审计字段安全与容错', () => {
    it('审计表中的 hostname 仅存域名，绝对不含 query 参数', async () => {
      mocks.setResponseConfig({
        statusCode: 200,
        body: 'ok',
      });

      const tool = createTestTool({
        url: 'https://api.example.com/v1/hook?secretToken=sensitive123456&param=abc',
      });

      await executeWebhookTool(tool, {});

      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hostname: 'api.example.com',
          }),
        })
      );

      const calledData = mocks.auditCreate.mock.calls[0][0].data;
      expect(calledData.hostname).not.toContain('secretToken');
      expect(calledData.hostname).not.toContain('sensitive123456');
    });

    it('审计写库失败仅记录警告，绝不阻断工具正常执行', async () => {
      mocks.setResponseConfig({
        statusCode: 200,
        body: 'ok',
      });
      mocks.auditCreate.mockRejectedValue(new Error('数据库写入超时'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const tool = createTestTool();
      const result = await executeWebhookTool(tool, {});

      expect(result.ok).toBe(true);
      expect(result.summaryForDisplay).toContain('调用成功');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[webhook] 审计日志落库失败'),
        expect.any(Error)
      );
    });
  });

  describe('握手级连通性探测 probeWebhookConnection', () => {
    it('HTTP 200 返回 reachable: true', async () => {
      mocks.setResponseConfig({
        statusCode: 200,
        body: 'pong',
      });

      const result = await probeWebhookConnection('https://api.example.com/health');

      expect(result.reachable).toBe(true);
      if (result.reachable) {
        expect(result.statusCode).toBe(200);
        expect(typeof result.durationMs).toBe('number');
      }
    });

    it('HTTP 4xx / 5xx 依然判定为可达', async () => {
      mocks.setResponseConfig({
        statusCode: 403,
        body: 'forbidden',
      });

      const result = await probeWebhookConnection('https://api.example.com/protected');

      expect(result.reachable).toBe(true);
      if (result.reachable) {
        expect(result.statusCode).toBe(403);
      }
    });

    it('DNS 解析失败返回对应 reason', async () => {
      mocks.dnsLookupMock.mockImplementation((_hostname, options, callback) => {
        const cb = (typeof options === 'function' ? options : callback) as (
          err: Error | null
        ) => void;
        if (cb) {
          cb(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
        }
      });

      const result = await probeWebhookConnection('https://invalid-host.com/ping');

      expect(result.reachable).toBe(false);
      if (!result.reachable) {
        expect(result.reason).toBe('DNS 解析失败');
      }
    });

    it('DNS 解析命中内网黑名单返回对应 reason', async () => {
      mocks.dnsLookupMock.mockImplementation((_hostname, options, callback) => {
        const cb = (typeof options === 'function' ? options : callback) as (
          err: Error | null,
          addresses?: Array<{ address: string; family: number }>
        ) => void;
        if (cb) {
          cb(null, [{ address: '10.0.0.1', family: 4 }]);
        }
      });

      const result = await probeWebhookConnection('https://private-host.com/ping');

      expect(result.reachable).toBe(false);
      if (!result.reachable) {
        expect(result.reason).toBe('命中黑名单');
      }
    });

    it('模拟底层抛出 ToolError(ADDRESS_BLOCKED) → probeWebhookConnection 分类为命中黑名单', async () => {
      mocks.setResponseConfig({
        error: new ToolError('该地址不允许访问', 'ADDRESS_BLOCKED'),
      });

      const result = await probeWebhookConnection('https://api.example.com/health');

      expect(result.reachable).toBe(false);
      if (!result.reachable) {
        expect(result.reason).toBe('命中黑名单');
      }
    });

    it('重定向 302 判定为不可达且分类为重定向被拒', async () => {
      mocks.setResponseConfig({
        statusCode: 302,
        headers: { location: 'https://api.example.com/target' },
      });

      const result = await probeWebhookConnection('https://api.example.com/redirect');

      expect(result.reachable).toBe(false);
      if (!result.reachable) {
        expect(result.reason).toBe('重定向被拒');
      }
    });
  });
});
