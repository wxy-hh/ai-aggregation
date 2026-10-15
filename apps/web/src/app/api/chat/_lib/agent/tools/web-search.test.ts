import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createWebSearchTool } from './web-search';
import { ToolError } from '@/lib/agent/registry';

describe('createWebSearchTool 单元测试 (ADR-0017)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TAVILY_API_KEY;
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
});
