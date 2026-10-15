/**
 * web_fetch 工具（spec §6.2 安全红线，重点工程）
 *
 * 安全设计的两个支点：
 * 1. **字面量校验**（url-guard）：协议白名单、危险主机名、内网 IP 字面量。
 * 2. **连接级校验**（guardedLookup）：DNS 解析交给自定义 lookup 回调，
 *    解析出的**每一个** IP 都必须通过 url-guard 的 `guardResolvedAddresses`，
 *    且连接用的就是这些 IP —— 校验与连接是同一次解析，杜绝 DNS 重绑定（TOCTOU）绕过。
 *
 * 重定向逐跳重新走完整校验（否则 302 到内网即绕过）。失败一律 fail-closed。
 *
 * 注：使用 node:http/https 而非全局 fetch，因为只有前者支持自定义 lookup，
 * 从而把「解析→校验→连接」收敛为一个不可分割的动作。
 */

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { z } from 'zod';
import { validateUrlLiteral } from '@/lib/agent/url-guard';
import { guardedLookup } from '@/lib/agent/guarded-lookup';
import { detectChatSensitiveTopic } from '../../chat-safety';
import { ToolError, type AgentToolSpec, type ToolExecutionResult } from '@/lib/agent/registry';

/** 连接（含 TLS）超时 */
const CONNECT_TIMEOUT_MS = 5_000;
/** 响应体体积上限：放宽至 2MB，覆盖技术文档与重型单页，达到上限平滑截断而非报错抛弃（ADR-0017） */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/** 注入模型的正文上限 */
const MAX_CONTENT_CHARS = 8_000;
/** 最大重定向跳数 */
const MAX_REDIRECTS = 5;

/** 单次请求结果 */
interface RawResponse {
  status: number;
  location?: string;
  contentType: string;
  body: Buffer;
  isTruncated?: boolean;
}

/** 真实的现代桌面 Chrome 请求头，避免被各大平台反爬拦截返回 14 字空壳（ADR-0017） */
const BROWSER_FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,text/plain;q=0.8,*/*;q=0.5',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

/** 发起一次 GET（不跟随重定向）；重定向响应不读 body */
function requestOnce(target: URL, signal: AbortSignal): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    const isHttps = target.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const req = requestFn(
      {
        protocol: target.protocol,
        // IPv6 字面量在 URL.hostname 中带方括号，交给 http 模块前需剥离
        hostname: target.hostname.replace(/^\[|\]$/g, ''),
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers: BROWSER_FETCH_HEADERS,
        lookup: guardedLookup,
        timeout: CONNECT_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;

        // 重定向：只取 location，丢弃 body
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({
            status,
            location: res.headers.location,
            contentType: '',
            body: Buffer.alloc(0),
          });
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let reachedMax = false;

        res.on('data', (chunk: Buffer) => {
          if (reachedMax) return;
          total += chunk.length;
          chunks.push(chunk);

          // 达到 2MB 上限：优雅截断停止读取，保留已收到的前 2MB 内容提取正文，绝不直接抛错中断！
          if (total >= MAX_RESPONSE_BYTES) {
            reachedMax = true;
            res.destroy(); // 停止接收后续字节，节省网络
            resolve({
              status,
              contentType: String(res.headers['content-type'] ?? ''),
              body: Buffer.concat(chunks),
              isTruncated: true,
            });
          }
        });

        res.on('end', () => {
          if (!reachedMax) {
            resolve({
              status,
              contentType: String(res.headers['content-type'] ?? ''),
              body: Buffer.concat(chunks),
              isTruncated: false,
            });
          }
        });

        res.on('error', (err) => {
          if (reachedMax) return; // 截断后的主动销毁不作为错误
          reject(err);
        });
      }
    );

    req.on('timeout', () => req.destroy(new ToolError('连接超时，请稍后重试')));
    req.on('error', reject);

    // 信号中止（用户中断，或 tool-policy 的超时派生中止）：立即销毁请求，spec §7 中止贯穿。
    // 这里**不写**「已取消」这类用户文案 —— 通过派生信号无法区分取消与超时，
    // 自行判定会把超时误报成取消；区分由 tool-policy 负责（它掌握父信号与 timedOut）。
    const onAbort = () => req.destroy(new Error('request aborted'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    req.on('close', () => signal.removeEventListener('abort', onAbort));

    req.end();
  });
}

/** 从 HTML 中提取可读正文（轻量实现，不引重型解析依赖） */
function extractReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|li|h[1-6]|tr|table|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/^[ \t]+/gm, '')
    .trim();
}

/** 取标题（用于展示摘要） */
function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const title = m[1].replace(/\s+/g, ' ').trim();
  return title ? title.slice(0, 100) : null;
}

/** 解析目标 URL 并逐跳跟随重定向，每一跳都走完整字面量校验 */
async function fetchWithRedirects(startUrl: URL, signal: AbortSignal): Promise<{
  finalUrl: URL;
  response: RawResponse;
}> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await requestOnce(current, signal);

    if (response.status >= 300 && response.status < 400) {
      if (!response.location) {
        throw new ToolError('目标网站返回了无效的重定向');
      }
      const next = new URL(response.location, current);
      // 关键：重定向目标必须重新校验，否则可被用来跳到内网
      const guard = validateUrlLiteral(next.toString());
      if (!guard.ok) {
        throw new ToolError('该地址不允许访问');
      }
      current = guard.url;
      continue;
    }
    return { finalUrl: current, response };
  }
  throw new ToolError('重定向次数过多，已放弃抓取');
}

/** 创建 web_fetch 工具 */
export function createWebFetchTool(): AgentToolSpec {
  return {
    name: 'web_fetch',
    description:
      '抓取指定网页的正文内容并返回纯文本。仅在已有具体网页地址、需要深读该页内容时使用；查新闻/汇率/天气等时效信息请改用 web_search。仅支持 http/https 公网地址，无法访问内网或本机地址。',
    parameters: z.object({
      url: z.string().describe('要抓取的网页完整地址，必须以 http:// 或 https:// 开头'),
    }),
    async execute(args, ctx): Promise<ToolExecutionResult> {
      const { url } = args as { url: string };

      const guard = validateUrlLiteral(url);
      if (!guard.ok) {
        throw new ToolError(guard.reason);
      }

      const { finalUrl, response } = await fetchWithRedirects(guard.url, ctx.signal);

      if (response.status < 200 || response.status >= 300) {
        throw new ToolError(`目标网页返回 ${response.status}，无法抓取`);
      }

      const rawText = response.body.toString('utf8');
      const isHtml = /text\/html|application\/xhtml/i.test(response.contentType) || /<html|<body|<div|<p[ >]/i.test(rawText);
      const text = isHtml ? extractReadableText(rawText) : rawText.trim();
      const rawTitle = isHtml ? extractTitle(rawText) : null;
      // 标题是第三方任意内容，且会进展示摘要直出前端（不经「注入模型前」检查点）——
      // 单独过一道合规，命中则退化为仅主机名（B-5）
      const title = rawTitle && !detectChatSensitiveTopic(rawTitle) ? rawTitle : null;

      if (!text) {
        throw new ToolError('目标网页没有可提取的正文内容');
      }

      // 识别依赖客户端 JS 动态渲染或防爬拦截的极短页面（如 14 字空壳），给出明确引导防止模型死循环（ADR-0017）
      const isDynamicSpaOrBlocked =
        text.length < 60 &&
        /(javascript|noscript|loading|登录|验证码|403|forbidden|challenge|安全验证)/i.test(rawText);

      if (isDynamicSpaOrBlocked) {
        return {
          ok: true,
          contentForModel: `来源：${finalUrl.toString()}\n${title ? `标题：${title}\n` : ''}正文提取说明：该网页依赖客户端 JavaScript 动态渲染或需要登录鉴权，静态抓取仅能获取部分前置文本（${text}）。请参考搜索摘要中的已知信息继续组织回答，避免重复尝试抓取该页面。`,
          summaryForDisplay: `已访问 ${finalUrl.hostname}${title ? ` · ${title}` : ''}（动态渲染页，正文较少）`,
        };
      }

      const byteTruncatedNote = response.isTruncated
        ? '\n\n（提示：网页原始文件体积超过 2MB，以上为前 2MB 提取的核心正文内容）'
        : '';
      const charTruncatedNote =
        text.length > MAX_CONTENT_CHARS ? '\n\n（正文过长，以上为前部分内容）' : '';
      const content = text.slice(0, MAX_CONTENT_CHARS);

      return {
        ok: true,
        contentForModel: `来源：${finalUrl.toString()}\n${title ? `标题：${title}\n` : ''}\n正文：\n${content}${charTruncatedNote}${byteTruncatedNote}`,
        summaryForDisplay: `已抓取 ${finalUrl.hostname}${title ? ` · ${title}` : ''}（正文 ${text.length} 字${response.isTruncated ? '，大页面截断' : ''}）`,
      };
    },
  };
}
