/**
 * web_search 通用内置联网检索工具（ADR-0059，取代 ADR-0017 双轨规约）
 *
 * 核心机制：
 * 1. 三级韧性分流：
 *    - 首选：配置 DEEPSEEK_TOOLS_API_KEY 时优先调用 DeepSeek Search 官方原生检索 API；
 *    - 次选：配置 TAVILY_API_KEY 时平滑降级至 Tavily 商业检索轨；
 *    - 兜底：免密轻量检索流，开箱即用。
 * 2. 结构化长摘要优先规约：
 *    优先提取 DeepSeek 提供的深度长摘要 (summary)，若无则使用片段 (snippet)；
 *    累计字符数超过 2,000 字符时平滑截断，并附带精读指引。
 * 3. 错误边界与优雅降级：
 *    400/401 配置与参数错误作为终态快速抛出；402/429/5xx/网络超时记录警告并顺次向下级平滑降级。
 */

import { z } from 'zod';
import { ToolError, type AgentToolSpec, type ToolExecutionResult } from '@/lib/agent/registry';
import { detectChatSensitiveTopic } from '../../chat-safety';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet?: string;
  summary?: string;
}

const SEARCH_TIMEOUT_MS = 6_000;
const MAX_SEARCH_RESULTS = 5;
const DEEPSEEK_SEARCH_DEFAULT_URL = 'https://api.deepseek.com/v1/tools/search';
const MAX_SEARCH_CONTENT_CHARS = 2_000;

/** 真实桌面浏览器请求头，避免免密检索源针对 Bot 的误伤拦截 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/** 解析 HTML 中的特殊字符编码 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** 剥离 DuckDuckGo 的跳转外链 /l/?kh=-1&uddg=... 还原为原始目标 URL */
function unwrapDuckDuckGoUrl(rawUrl: string): string {
  try {
    if (rawUrl.startsWith('//')) {
      rawUrl = 'https:' + rawUrl;
    }
    const parsed = new URL(rawUrl, 'https://html.duckduckgo.com');
    const target = parsed.searchParams.get('uddg');
    if (target) {
      return decodeURIComponent(target);
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

/** DeepSeek 商业检索接口 */
async function searchWithDeepSeek(
  query: string,
  apiKey: string,
  searchUrl: string,
  signal: AbortSignal
): Promise<SearchResultItem[]> {
  const res = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      count: MAX_SEARCH_RESULTS,
    }),
    signal,
  });

  // 仅服务可用性故障（欠费 402、限流 429、服务端错误 5xx）属于降级白名单，抛出普通 Error 供外层捕获并降级
  if (res.status === 402 || res.status === 429 || (res.status >= 500 && res.status < 600)) {
    throw new Error(`DeepSeek Search 服务故障 (HTTP ${res.status})`);
  }

  // 其余非 200 状态码（400 参数异常、401 鉴权失效、以及 405 等其他 4xx 非白名单错误）均为终态错误，直接阻断严禁降级
  if (!res.ok) {
    throw new ToolError(`DeepSeek Search 接口配置或请求异常 (HTTP ${res.status})`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      snippet?: string;
      summary?: string;
    }>;
  };

  if (!data.results || !Array.isArray(data.results)) return [];

  return data.results
    .slice(0, MAX_SEARCH_RESULTS)
    .map((item) => ({
      title: item.title?.trim() || '无标题',
      url: item.url || '',
      snippet: item.snippet?.trim() || '',
      summary: item.summary?.trim() || '',
    }))
    .filter((item) => item.url.startsWith('http'));
}

/** 商业接口检索：Tavily API */
async function searchWithTavily(
  query: string,
  apiKey: string,
  signal: AbortSignal
): Promise<SearchResultItem[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: MAX_SEARCH_RESULTS,
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Tavily API 返回异常 HTTP ${res.status}`);
  }

  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  if (!data.results || !Array.isArray(data.results)) return [];

  return data.results.slice(0, MAX_SEARCH_RESULTS).map((item) => ({
    title: item.title?.trim() || '无标题',
    url: item.url || '',
    snippet: item.content?.trim() || '',
  })).filter((item) => item.url.startsWith('http'));
}

/** 免密检索提取：基于 DuckDuckGo HTML 结果解析 */
async function searchWithFreeProvider(
  query: string,
  signal: AbortSignal
): Promise<SearchResultItem[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(searchUrl, {
    method: 'GET',
    headers: BROWSER_HEADERS,
    signal,
  });

  if (!res.ok) {
    throw new Error(`免密检索服务暂时不可用 (HTTP ${res.status})`);
  }

  const html = await res.text();
  const results: SearchResultItem[] = [];

  // 按条目块切分 HTML（DuckDuckGo 每一项以 <div class="...result results_links... 开头）
  const parts = html.split(/<div[^>]*class="[^"]*result\s+results_links[^"]*"/i);

  for (let i = 1; i < parts.length && results.length < MAX_SEARCH_RESULTS; i += 1) {
    const part = parts[i];

    // 匹配标题与真实链接
    const linkMatch = part.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const rawUrl = linkMatch[1];
    const realUrl = unwrapDuckDuckGoUrl(rawUrl);
    const title = decodeHtmlEntities(linkMatch[2]);

    // 匹配事实摘要
    const snippetMatch = part.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = snippetMatch ? decodeHtmlEntities(snippetMatch[1]) : '';

    if (realUrl.startsWith('http') && title) {
      results.push({
        title,
        url: realUrl,
        snippet,
      });
    }
  }

  return results;
}

/** 综合调度检索 */
export async function executeSearch(
  query: string,
  signal?: AbortSignal
): Promise<SearchResultItem[]> {
  const dsApiKey = process.env.DEEPSEEK_TOOLS_API_KEY?.trim();
  const dsSearchUrl = process.env.DEEPSEEK_SEARCH_URL?.trim() || DEEPSEEK_SEARCH_DEFAULT_URL;

  // 1. 优先走 DeepSeek Search 原生检索
  if (dsApiKey) {
    const dsTimeoutController = new AbortController();
    const dsTimeoutId = setTimeout(() => dsTimeoutController.abort(), SEARCH_TIMEOUT_MS);
    const dsSignal = signal
      ? AbortSignal.any([signal, dsTimeoutController.signal])
      : dsTimeoutController.signal;

    try {
      const dsResults = await searchWithDeepSeek(query, dsApiKey, dsSearchUrl, dsSignal);
      // 空数组为合法的终态“未找到”，直接返回空数组，不降级！
      return dsResults;
    } catch (e) {
      if (e instanceof ToolError) {
        // 400/401 终态报错，严禁降级
        throw e;
      }
      if (signal?.aborted) {
        // 上下文主动中止（用户中断），直接抛出
        throw e;
      }
      console.warn('[web_search] DeepSeek 检索接口故障，自动降级至备用链路:', e);
    } finally {
      clearTimeout(dsTimeoutId);
    }
  }

  const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();

  // 2. 次选商业检索轨：Tavily API
  if (tavilyApiKey) {
    const tavilyTimeoutController = new AbortController();
    const tavilyTimeoutId = setTimeout(() => tavilyTimeoutController.abort(), SEARCH_TIMEOUT_MS);
    const tavilySignal = signal
      ? AbortSignal.any([signal, tavilyTimeoutController.signal])
      : tavilyTimeoutController.signal;

    try {
      const tavilyResults = await searchWithTavily(query, tavilyApiKey, tavilySignal);
      if (tavilyResults.length > 0) return tavilyResults;
    } catch (e) {
      if (signal?.aborted) {
        throw e;
      }
      console.warn('[web_search] 商业检索接口失败，自动降级至免密检索流:', e);
    } finally {
      clearTimeout(tavilyTimeoutId);
    }
  }

  // 3. 兜底免密检索轨
  return await searchWithFreeProvider(query, signal ?? new AbortController().signal);
}

/** 格式化输出给模型的提示内容 */
function formatSearchResultsForModel(query: string, results: SearchResultItem[]): string {
  if (results.length === 0) {
    return `【联网搜索（关键词：${query}）】：未检索到直接相关的公开网页，建议更换更简洁的关键词重新尝试。`;
  }

  const itemsText = results
    .map((item, index) => {
      const content = item.summary || item.snippet;
      const snippetPart = content ? `\n   摘要：${content}` : '';
      return `${index + 1}. [${item.title}](${item.url})${snippetPart}`;
    })
    .join('\n\n');

  let truncatedNote = '';
  let finalItemsText = itemsText;
  if (itemsText.length > MAX_SEARCH_CONTENT_CHARS) {
    finalItemsText = itemsText.slice(0, MAX_SEARCH_CONTENT_CHARS);
    truncatedNote = '\n\n（提示：长摘要累计内容过长已平滑截断，以上为前 2,000 字符精选摘要）';
  }

  return `【联网搜索结果（关键词：${query}，共找到 ${results.length} 条权威线索）】：\n\n${finalItemsText}${truncatedNote}\n\n【精读指引】：以上为精选摘要。如需深入阅读具体某篇官方文档、详细定价表或长文，请直接使用 web_fetch 传入对应的目标 URL 进行单页精读；若线索已足够充实，可直接组织全面专业的最终回答。`;
}

/** 创建 web_search Agent 工具实例 */
export function createWebSearchTool(): AgentToolSpec {
  return {
    name: 'web_search',
    description:
      '联网搜索实时资讯、新闻、技术文档与官方网站地址。输入具体的搜索关键词 Query，返回 3~5 条权威网页的标题、链接和摘要。查时效事实必须优先使用本工具，禁止用 web_fetch 抓取搜索引擎结果。',
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe('搜索关键词，例如：“智谱 GLM Coding Plan 价格”或“DeepSeek API 最新模型版本”'),
    }),
    async execute(args, ctx): Promise<ToolExecutionResult> {
      const { query } = args as { query: string };
      const trimmedQuery = typeof query === 'string' ? query.trim() : '';

      if (!trimmedQuery) {
        throw new ToolError('搜索关键词不能为空');
      }

      // 安全合规预检
      if (detectChatSensitiveTopic(trimmedQuery)) {
        throw new ToolError('搜索关键词包含敏感内容，无法执行');
      }

      try {
        const results = await executeSearch(trimmedQuery, ctx.signal);

        const shortQuery = trimmedQuery.length > 20 ? `${trimmedQuery.slice(0, 18)}…` : trimmedQuery;

        return {
          ok: true,
          contentForModel: formatSearchResultsForModel(trimmedQuery, results),
          summaryForDisplay: `已搜索“${shortQuery}” · 获取 ${results.length} 条线索`,
        };
      } catch (error) {
        if (error instanceof ToolError) {
          throw error;
        }
        if (ctx.signal?.aborted) {
          throw error;
        }
        const msg = error instanceof Error ? error.message : String(error);
        throw new ToolError(`联网搜索失败: ${msg}`);
      }
    },
  };
}
