import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createWebFetchTool } from './web-fetch';
import { ToolError } from '@/lib/agent/registry';
import EventEmitter from 'node:events';

const mockHttpsRequest = vi.fn();
const mockHttpRequest = vi.fn();

vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  return {
    ...actual,
    default: {
      ...actual,
      request: (...args: any[]) => mockHttpsRequest(...args),
    },
    request: (...args: any[]) => mockHttpsRequest(...args),
  };
});

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return {
    ...actual,
    default: {
      ...actual,
      request: (...args: any[]) => mockHttpRequest(...args),
    },
    request: (...args: any[]) => mockHttpRequest(...args),
  };
});

describe('createWebFetchTool 单元测试 (ADR-0059)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpsRequest.mockReset();
    mockHttpRequest.mockReset();
    delete process.env.DEEPSEEK_TOOLS_API_KEY;
    delete process.env.DEEPSEEK_FETCH_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TC04: web_fetch 出站 URL 安全预检（EgressUrlPreflight）', () => {
    it('TC04-1: 传入回环或私网 IP 时本地前置字面量校验直接抛出 ToolError 且外部 fetch 未被调用', async () => {
      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(tool.execute({ url: 'http://127.0.0.1/admin' }, ctx)).rejects.toThrowError(ToolError);
      await expect(tool.execute({ url: 'http://192.168.1.1' }, ctx)).rejects.toThrowError(ToolError);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockHttpRequest).not.toHaveBeenCalled();
      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });

    it('TC04-2: 传入非 http/https 协议时本地前置校验直接抛出 ToolError 且外部 fetch 未被调用', async () => {
      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(tool.execute({ url: 'file:///etc/passwd' }, ctx)).rejects.toThrowError(ToolError);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockHttpRequest).not.toHaveBeenCalled();
      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });
  });

  describe('TC05: web_fetch DeepSeek 抓取成功、正文截断与终态错误', () => {
    it('TC05-1: 配置 DEEPSEEK_TOOLS_API_KEY 时优先向 DEEPSEEK_FETCH_URL 发起 POST 请求且携带目标 url', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';
      process.env.DEEPSEEK_FETCH_URL = 'https://custom-fetch.deepseek.com/v1/tools/fetch';

      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fakeResponse = {
        title: 'DeepSeek 文档',
        content: '# DeepSeek API\n这是抓取到的官方 Markdown 正文。',
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await tool.execute({ url: 'https://example.com/docs' }, ctx);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://custom-fetch.deepseek.com/v1/tools/fetch',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer ds-tools-test-key',
          }),
          body: JSON.stringify({
            url: 'https://example.com/docs',
          }),
        })
      );
      expect(result.ok).toBe(true);
    });

    it('TC05-2: DeepSeek Fetch 返回 HTTP 200 时成功解析出页面标题与 Markdown 格式正文', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';

      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fakeResponse = {
        title: '示例官方页面',
        content: '## 核心章节\n这是正文内容描述。',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await tool.execute({ url: 'https://example.com/info' }, ctx);

      expect(result.ok).toBe(true);
      expect(result.contentForModel).toContain('标题：示例官方页面');
      expect(result.contentForModel).toContain('## 核心章节\n这是正文内容描述。');
      expect(result.summaryForDisplay).toContain('已抓取 example.com · 示例官方页面');
    });

    it('TC05-3: DeepSeek Fetch 返回超过 8,000 字符时正文平滑截断至 8,000 字符上限并附带提示', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';

      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const longContent = 'B'.repeat(9500);
      const fakeResponse = {
        title: '超长文档',
        content: longContent,
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await tool.execute({ url: 'https://example.com/long-page' }, ctx);

      expect(result.ok).toBe(true);
      expect(result.contentForModel).toContain('[正文已截断，仅保留前 8,000 字符]');
      expect(result.contentForModel).toContain('B'.repeat(8000));
      expect(result.contentForModel).not.toContain('B'.repeat(8001));
    });

    it('TC05-4: DeepSeek Fetch 返回 HTTP 400 或 401 时直接抛出 ToolError 且不发生降级', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';

      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      // 验证 400（参数异常）、401（鉴权失败）以及 405（非白名单 4xx）均直接抛出 ToolError，不触发本地抓取降级
      for (const status of [400, 401, 405]) {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ error: `HTTP ${status} Error` }), {
            status,
            headers: { 'Content-Type': 'application/json' },
          })
        );

        await expect(tool.execute({ url: `https://example.com/auth-fail-${status}` }, ctx)).rejects.toThrowError(
          ToolError
        );
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(mockHttpsRequest).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
      }
    });

    it('TC05-5: DeepSeek Fetch 返回 HTTP 403 安全策略拒绝时直接抛出 ToolError 且严禁降级至本地抓取', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';

      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await expect(tool.execute({ url: 'https://example.com/forbidden' }, ctx)).rejects.toThrowError(ToolError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });

    it('TC05-6: DeepSeek Fetch 返回 HTTP 404 目标不存在或无有效内容时直接抛出 ToolError 且严禁降级至本地抓取', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';

      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await expect(tool.execute({ url: 'https://example.com/not-found' }, ctx)).rejects.toThrowError(ToolError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });
  });

  describe('TC06: web_fetch 服务可用性故障降级与本地大文件保护', () => {
    it('TC06-1: DeepSeek Fetch 返回 HTTP 402/429/5xx 或网络请求超时时记录告警日志并自动降级执行本地高韧性抓取流水线', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';

      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fakeHtml = '<html><head><title>本地降级抓取成功</title></head><body><p>本地获取到的正文</p></body></html>';

      // 覆盖 402 欠费、429 限流、502 网关故障、网络超时场景
      const failureCases = [
        {
          name: 'HTTP 402 欠费',
          mock: () =>
            Promise.resolve(
              new Response(JSON.stringify({ error: 'Payment Required' }), {
                status: 402,
                headers: { 'Content-Type': 'application/json' },
              })
            ),
        },
        {
          name: 'HTTP 429 限流',
          mock: () =>
            Promise.resolve(
              new Response(JSON.stringify({ error: 'Too Many Requests' }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' },
              })
            ),
        },
        {
          name: 'HTTP 502 故障',
          mock: () =>
            Promise.resolve(
              new Response(JSON.stringify({ error: 'Bad Gateway' }), {
                status: 502,
                headers: { 'Content-Type': 'application/json' },
              })
            ),
        },
        {
          name: '网络请求超时',
          mock: () => Promise.reject(new DOMException('The operation was aborted', 'AbortError')),
        },
      ];

      for (const testCase of failureCases) {
        mockHttpsRequest.mockImplementation((options: any, callback: any) => {
          const req: any = new EventEmitter();
          req.end = vi.fn();
          req.destroy = vi.fn();
          req.setTimeout = vi.fn();

          const res: any = new EventEmitter();
          res.statusCode = 200;
          res.headers = { 'content-type': 'text/html; charset=utf-8' };

          process.nextTick(() => {
            callback(res);
            res.emit('data', Buffer.from(fakeHtml));
            res.emit('end');
          });

          return req;
        });

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(testCase.mock);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await tool.execute({ url: `https://example.com/fallback-${testCase.name}` }, ctx);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[web_fetch] DeepSeek 抓取服务故障，自动降级至本地高韧性抓取流水线'),
          expect.anything()
        );
        expect(mockHttpsRequest).toHaveBeenCalled();
        expect(result.ok).toBe(true);
        expect(result.contentForModel).toContain('本地获取到的正文');

        fetchSpy.mockRestore();
        warnSpy.mockRestore();
        mockHttpsRequest.mockReset();
      }
    });

    it('TC06-2: 在未配置 DEEPSEEK_TOOLS_API_KEY 时直接执行本地高韧性抓取流水线', async () => {
      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const fakeHtml = '<html><head><title>直走本地抓取</title></head><body><p>本地流水线正文</p></body></html>';
      mockHttpsRequest.mockImplementation((options: any, callback: any) => {
        const req: any = new EventEmitter();
        req.end = vi.fn();
        req.destroy = vi.fn();
        req.setTimeout = vi.fn();

        const res: any = new EventEmitter();
        res.statusCode = 200;
        res.headers = { 'content-type': 'text/html; charset=utf-8' };

        process.nextTick(() => {
          callback(res);
          res.emit('data', Buffer.from(fakeHtml));
          res.emit('end');
        });

        return req;
      });

      const result = await tool.execute({ url: 'https://example.com/local-direct' }, ctx);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockHttpsRequest).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.contentForModel).toContain('本地流水线正文');
    });

    it('TC06-3: 本地高韧性抓取遇到超过 2MB 的超大页面时平滑截断停止接收并正常返回提取正文', async () => {
      const tool = createWebFetchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fakeChunk = Buffer.alloc(1024 * 1024, 'a'); // 1MB 块
      mockHttpsRequest.mockImplementation((options: any, callback: any) => {
        const req: any = new EventEmitter();
        req.end = vi.fn();
        req.destroy = vi.fn();
        req.setTimeout = vi.fn();

        const res: any = new EventEmitter();
        res.statusCode = 200;
        res.headers = { 'content-type': 'text/plain' };
        res.destroy = vi.fn();

        process.nextTick(() => {
          callback(res);
          res.emit('data', fakeChunk);
          res.emit('data', fakeChunk);
          res.emit('data', fakeChunk); // 总计 >2MB 触发截断
        });

        return req;
      });

      const result = await tool.execute({ url: 'https://example.com/huge-file' }, ctx);

      expect(result.ok).toBe(true);
      expect(result.summaryForDisplay).toContain('大页面截断');
    });
  });
});
