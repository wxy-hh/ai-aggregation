import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createWebSearchTool } from './web-search';
import { ToolError } from '@/lib/agent/registry';

describe('createWebSearchTool 单元测试 (ADR-0059)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TAVILY_API_KEY;
    delete process.env.DEEPSEEK_TOOLS_API_KEY;
    delete process.env.DEEPSEEK_SEARCH_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('关键词为空时抛出 ToolError 校验失败', async () => {
    const tool = createWebSearchTool();
    const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

    await expect(tool.execute({ query: '   ' }, ctx)).rejects.toThrow(
      '搜索关键词不能为空'
    );
  });

  it('商业接口有 Key 时调用 Tavily 接口并格式化输出', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test-key';
    const tool = createWebSearchTool();
    const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

    const fakeTavilyResponse = {
      results: [
        {
          title: '智谱 GLM Coding Plan 官方文档',
          url: 'https://docs.bigmodel.cn/cn/coding-plan/overview',
          content: 'GLM Coding Plan 是面向开发者的专业编程套餐，提供专属限额...',
        },
        {
          title: 'GLM 编码套餐价格与资费详情',
          url: 'https://bigmodel.cn/pricing',
          content: '首月优惠价 99 元，支持 Claude Code 等第三方开发工具对接。',
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(fakeTavilyResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await tool.execute({ query: '智谱 GLM Coding Plan 价格' }, ctx);

    expect(result.ok).toBe(true);
    expect(result.summaryForDisplay).toContain('已搜索“智谱 GLM Coding Plan…” · 获取 2 条线索');
    expect(result.contentForModel).toContain('智谱 GLM Coding Plan 官方文档');
    expect(result.contentForModel).toContain('https://docs.bigmodel.cn/cn/coding-plan/overview');
    expect(result.contentForModel).toContain('web_fetch');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('默认免密轨：基于 DuckDuckGo HTML 结果解析并剥离真实 URL', async () => {
    const tool = createWebSearchTool();
    const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

    const fakeDdgHtml = `
      <div class="result results_links results_links_deep web-result">
        <a class="result__a" href="//duckduckgo.com/l/?kh=-1&uddg=https%3A%2F%2Fplatform.minimaxi.com%2Fdocument%2Fprice">
          MiniMax 开放平台 - 定价说明
        </a>
        <a class="result__snippet">
          abab 6.5 系列大模型每百万 tokens 输入 1 元，输出 2 元。
        </a>
      </div>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(fakeDdgHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const result = await tool.execute({ query: 'MiniMax 模型 定价' }, ctx);

    expect(result.ok).toBe(true);
    expect(result.summaryForDisplay).toContain('已搜索“MiniMax 模型 定价” · 获取 1 条线索');
    expect(result.contentForModel).toContain('MiniMax 开放平台 - 定价说明');
    expect(result.contentForModel).toContain('https://platform.minimaxi.com/document/price');
    expect(result.contentForModel).toContain('abab 6.5 系列大模型');
  });

  it('无搜索结果时友好返回引导提示而不报错中断', async () => {
    const tool = createWebSearchTool();
    const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<div>没有找到相关结果</div>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const result = await tool.execute({ query: '未知超生僻词查询' }, ctx);

    expect(result.ok).toBe(true);
    expect(result.contentForModel).toContain('未检索到直接相关的公开网页');
  });

  describe('TC02: DeepSeek Search 原生检索、长摘要优先与配额截断', () => {
    it('TC02-1: 配置 DEEPSEEK_TOOLS_API_KEY 时优先向 DEEPSEEK_SEARCH_URL 发起 POST 请求且携带 query 与 count: 5', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';
      process.env.DEEPSEEK_SEARCH_URL = 'https://custom-search.deepseek.com/v1/tools/search';

      const tool = createWebSearchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fakeResponse = {
        results: [
          {
            title: 'DeepSeek 官方 API 文档',
            url: 'https://api-docs.deepseek.com/zh-cn/api/search',
            snippet: '短摘要信息',
            summary: '长摘要：DeepSeek 搜索 API 提供高质量的实时联网能力，包含权威线索...',
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await tool.execute({ query: 'DeepSeek 搜索 API' }, ctx);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://custom-search.deepseek.com/v1/tools/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer ds-tools-test-key',
          }),
          body: JSON.stringify({
            query: 'DeepSeek 搜索 API',
            count: 5,
          }),
        })
      );
      expect(result.ok).toBe(true);
    });

    it('TC02-2: DeepSeek Search API 返回 summary 时模型内容优先展示长摘要', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';

      const tool = createWebSearchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fakeResponse = {
        results: [
          {
            title: 'DeepSeek 官方发布',
            url: 'https://deepseek.com/news/1',
            snippet: '普通短摘要',
            summary: '这是一段非常详细深入的独家长摘要说明，包含更多细节事实与数据。',
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await tool.execute({ query: 'DeepSeek 最新动态' }, ctx);

      expect(result.ok).toBe(true);
      expect(result.contentForModel).toContain('这是一段非常详细深入的独家长摘要说明');
      expect(result.contentForModel).not.toContain('摘要：普通短摘要');
    });

    it('TC02-3: 搜索结果长摘要累计字符数超过 2,000 时在 2,000 字符处平滑截断', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';

      const tool = createWebSearchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      // 构造多条搜索结果，累积长摘要字符数超过 2,000 字符
      const fakeResponse = {
        results: [
          {
            title: '权威官方文档 1',
            url: 'https://example.com/doc-1',
            summary: 'A'.repeat(1200),
          },
          {
            title: '权威官方文档 2',
            url: 'https://example.com/doc-2',
            summary: 'B'.repeat(1200),
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await tool.execute({ query: '超长长摘要查询' }, ctx);

      expect(result.ok).toBe(true);
      expect(result.contentForModel).toContain('长摘要累计内容过长已平滑截断，以上为前 2,000 字符精选摘要');
      // 模型注入文本整体不超过截断限制（截断文本切片最大 2,000 字符加上指引提示）
      expect(result.contentForModel.length).toBeLessThan(3000);
    });

    it('TC02-4: summaryForDisplay 呈现格式为已搜索指定词并获取线索条数', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';

      const tool = createWebSearchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fakeResponse = {
        results: [
          {
            title: '结果 1',
            url: 'https://example.com/1',
            summary: '摘要 1',
          },
          {
            title: '结果 2',
            url: 'https://example.com/2',
            summary: '摘要 2',
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await tool.execute({ query: '测试短语' }, ctx);

      expect(result.summaryForDisplay).toBe('已搜索“测试短语” · 获取 2 条线索');
    });
  });

  describe('TC03: web_search 空结果终态判定、错误边界与分流降级', () => {
    it('TC03-1: DeepSeek Search 返回 HTTP 200 且 results 为空数组时返回未检索到直接相关提示且不触发降级', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';
      process.env.TAVILY_API_KEY = 'tvly-test-key';

      const tool = createWebSearchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await tool.execute({ query: '全网冷门词' }, ctx);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      expect(result.contentForModel).toContain('未检索到直接相关的公开网页');
    });

    it('TC03-2: DeepSeek Search 返回 HTTP 400 或 401 错误时直接抛出 ToolError 且不触发下级降级', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';
      process.env.TAVILY_API_KEY = 'tvly-test-key';

      const tool = createWebSearchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      // 验证 400（参数异常）、401（鉴权失败）以及 405（非白名单 4xx）均直接抛出 ToolError 且不触发 Tavily
      for (const status of [400, 401, 405]) {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ error: `HTTP ${status} Error` }), {
            status,
            headers: { 'Content-Type': 'application/json' },
          })
        );

        await expect(tool.execute({ query: '任意关键词' }, ctx)).rejects.toThrowError(ToolError);
        // 仅调用了 DeepSeek 1 次，未发生降级
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        fetchSpy.mockRestore();
      }
    });

    it('TC03-3: DeepSeek Search 返回 HTTP 402/429/5xx 或网络请求超时时自动降级调用 Tavily 或免密检索', async () => {
      process.env.DEEPSEEK_TOOLS_API_KEY = 'ds-tools-test-key';
      process.env.TAVILY_API_KEY = 'tvly-test-key';

      const tool = createWebSearchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fakeTavilyResponse = {
        results: [
          {
            title: 'Tavily 兜底召回结果',
            url: 'https://example.com/fallback',
            content: '成功从备用商业检索轨获取到事实内容',
          },
        ],
      };

      // 覆盖 402 欠费、429 限流、500 服务故障、网络请求超时等场景
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
          name: 'HTTP 500 故障',
          mock: () =>
            Promise.resolve(
              new Response(JSON.stringify({ error: 'Internal Server Error' }), {
                status: 500,
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
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockImplementationOnce(testCase.mock)
          .mockResolvedValueOnce(
            new Response(JSON.stringify(fakeTavilyResponse), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );

        const result = await tool.execute({ query: `测试${testCase.name}` }, ctx);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[web_search] DeepSeek 检索接口故障，自动降级至备用链路'),
          expect.anything()
        );
        expect(result.ok).toBe(true);
        expect(result.contentForModel).toContain('Tavily 兜底召回结果');

        fetchSpy.mockRestore();
        warnSpy.mockRestore();
      }
    });

    it('TC03-4: 传入全空白或空字符串作为 query 时工具在发起任何网络请求前直接抛出 ToolError', async () => {
      const tool = createWebSearchTool();
      const ctx = { userId: 'u1', signal: new AbortController().signal, errorId: 'test' };

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // 验证空字符串与全空白字符串均被前置拦截
      for (const query of ['', '   ', '\t\n']) {
        await expect(tool.execute({ query }, ctx)).rejects.toThrow('搜索关键词不能为空');
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
