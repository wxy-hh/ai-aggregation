/**
 * web_search 通用内置联网检索工具（ADR-0017）
 *
 * 核心机制：
 * 1. 双轨自适应：若配置了 TAVILY_API_KEY 等商业检索凭据，优先调用高速高纯度检索；
 *    默认零配置环境下，自动走免密轻量检索提取流，开箱即用。
 * 2. 结构化规约：过滤无用广告与 HTML 噪声，仅向模型输出前 3~5 条格式化条目：
 *    包含清晰的标题 (Title)、准确的来源直链 (URL) 与精简的事实摘要 (Snippet)。
 * 3. 两步协同引导：搜索结果仅作为定位依据，引导模型根据 URL 按需使用 web_fetch 深读或直接推理。
 */

import { z } from 'zod';
import { ToolError, type AgentToolSpec, type ToolExecutionResult } from '@/lib/agent/registry';
import { detectChatSensitiveTopic } from '../../chat-safety';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

const SEARCH_TIMEOUT_MS = 6_000;
const MAX_SEARCH_RESULTS = 5;

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
  signal: AbortSignal
): Promise<SearchResultItem[]> {
  const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();

  // 优先商业检索轨
  if (tavilyApiKey) {
    try {
      const tavilyResults = await searchWithTavily(query, tavilyApiKey, signal);
      if (tavilyResults.length > 0) return tavilyResults;
    } catch (e) {
      console.warn('[web_search] 商业检索接口失败，自动降级至免密检索流:', e);
    }
  }

  // 兜底免密检索轨
  return await searchWithFreeProvider(query, signal);
}

/** 格式化输出给模型的提示内容 */
function formatSearchResultsForModel(query: string, results: SearchResultItem[]): string {
  if (results.length === 0) {
    return `【联网搜索（关键词：${query}）】：未检索到直接相关的公开网页，建议更换更简洁的关键词重新尝试。`;
  }

  const formattedItems = results
    .map((item, index) => {
      const snippetPart = item.snippet ? `\n   摘要：${item.snippet}` : '';
      return `${index + 1}. [${item.title}](${item.url})${snippetPart}`;
    })
    .join('\n\n');

  return `【联网搜索结果（关键词：${query}，共找到 ${results.length} 条权威线索）】：\n\n${formattedItems}\n\n【精读指引】：以上为精选摘要。如需深入阅读具体某篇官方文档、详细定价表或长文，请直接使用 web_fetch 传入对应的目标 URL 进行单页精读；若线索已足够充实，可直接组织全面专业的最终回答。`;
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
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        throw new ToolError('搜索关键词不能为空');
      }

      // 安全合规预检
      if (detectChatSensitiveTopic(trimmedQuery)) {
        throw new ToolError('搜索关键词包含敏感内容，无法执行');
      }

      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), SEARCH_TIMEOUT_MS);
      const combinedSignal = ctx.signal
        ? AbortSignal.any([ctx.signal, timeoutController.signal])
        : timeoutController.signal;

      try {
        const results = await executeSearch(trimmedQuery, combinedSignal);

        const shortQuery = trimmedQuery.length > 20 ? `${trimmedQuery.slice(0, 18)}…` : trimmedQuery;

        return {
          ok: true,
          contentForModel: formatSearchResultsForModel(trimmedQuery, results),
          summaryForDisplay: `已搜索“${shortQuery}” · 获取 ${results.length} 条线索`,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (combinedSignal.aborted) {
          throw new ToolError('联网搜索请求超时，请稍后重试');
        }
        throw new ToolError(`联网搜索失败: ${msg}`);
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
