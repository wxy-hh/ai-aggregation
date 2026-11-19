/**
 * Webhook 执行器与连通性探测（spec §4.1 / §4.3 / §4.5）
 *
 * 核心安全红线：
 * 1. 仅允许 https 协议，复用 validateWebhookUrl 二次防篡改校验；
 * 2. DNS 重绑定防御：传输层内聚 guardedLookup，解析与连接同质不可分，内网与保留地址直接阻断；
 * 3. 禁重定向：天然不跟随重定向，收到 3xx 一律判定失败并产出模型可读中文文案；
 * 4. 超时保护：执行器默认 15 秒总超时兜底与 5 秒连接超时，探测默认 5 秒超时，超时及时中止出站连接；
 * 5. 鉴权头注入：authHeaderName 与 authHeaderValueEnc 齐全时解密注入，解密失败显式报错不降级；
 * 6. 响应流式截断：流式累计限制最大 200KB，超限立即销毁连接并按失败处理；JSON 格式美化后截断，非 JSON 文本直接截断；
 * 7. 全量审计：执行器调用（含拦截、超时、重定向）全量写入 WebhookToolCall，hostname 仅存域名，写库失败仅记录警告不阻断。
 */

import { request as httpsRequest } from 'node:https';
import type { ClientRequestArgs } from 'node:http';
import { prisma, type UserWebhookTool, type WebhookHttpMethod } from '@repo/db';
import { decryptWebhookSecret } from '@/lib/crypto';
import { validateWebhookUrl } from '@/lib/webhook/validation';
import { guardedLookup } from '@/lib/agent/guarded-lookup';
import { ToolError } from '@/lib/agent/tool-error';
import { truncate, DEFAULT_TOOL_POLICY } from '@/lib/agent/tool-policy';

/** Webhook 工具执行上下文（与既有 ToolExecutionContext 契约对齐） */
export interface WebhookExecutionContext {
  userId?: string;
  signal?: AbortSignal;
  errorId?: string;
}

/** Webhook 执行结果（与既有 ToolExecutionResult 结构对齐） */
export interface WebhookExecutionResult {
  ok: boolean;
  contentForModel: string;
  summaryForDisplay: string;
}

/** 握手连通性探测结果 */
export type WebhookProbeResult =
  | { reachable: true; statusCode: number; durationMs: number }
  | { reachable: false; reason: string };

/** 探测超时时长（5 秒） */
const PROBE_TIMEOUT_MS = 5_000;

/** 执行单次总超时时长（15 秒，对齐既有 tool-policy） */
const EXECUTION_TIMEOUT_MS = DEFAULT_TOOL_POLICY.timeoutMs; // 15_000

/** 单次连接（含 TLS）超时时长（5 秒，对齐 web-fetch CONNECT_TIMEOUT_MS） */
const CONNECT_TIMEOUT_MS = 5_000;

/** 进模型上下文的正文截断上限（字符数，对齐 DEFAULT_TOOL_POLICY.maxContentChars） */
const MAX_CONTENT_CHARS = DEFAULT_TOOL_POLICY.maxContentChars; // 8_000

/** 前端展示摘要截断上限（字符数，对齐 DEFAULT_TOOL_POLICY.maxSummaryChars） */
const MAX_SUMMARY_CHARS = DEFAULT_TOOL_POLICY.maxSummaryChars; // 240

/** 响应体读取最大字节数（200KB，防止超大响应占用内存） */
const MAX_RESPONSE_BYTES = 200 * 1024;

/** 自定义错误：响应体体积超出 200KB 上限 */
class WebhookPayloadTooLargeError extends Error {
  constructor(message = '目标接口响应内容过大，超过 200KB 上限') {
    super(message);
    this.name = 'WebhookPayloadTooLargeError';
  }
}

/**
 * 尝试从 URL 字符串中提取主机域名（不含端口与路径）。
 * 用于在异常或拦截时记录审计字段，绝不包含 query 参数。
 */
export function tryExtractHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return 'unknown-host';
  }
}

/**
 * 异步写入 Webhook 工具调用审计记录（spec §4.1 / §4.5）。
 *
 * 纪律：
 * - hostname 仅存主机域名，绝对不存完整 URL，防止 query 中的敏感数据入库；
 * - 写库失败仅警告（console.warn），绝不阻断调用流程。
 */
export async function writeAuditRecord(data: {
  userId: string;
  toolId?: string | null;
  hostname: string;
  method: WebhookHttpMethod;
  statusCode?: number | null;
  durationMs: number;
  responseBytes?: number;
  outcome: 'success' | 'failed' | 'skipped' | 'blocked' | 'pending_approval';
  errorKind?: string | null;
}): Promise<void> {
  try {
    await prisma.webhookToolCall.create({
      data: {
        userId: data.userId,
        toolId: data.toolId ?? null,
        hostname: data.hostname,
        method: data.method,
        statusCode: data.statusCode ?? null,
        durationMs: data.durationMs,
        responseBytes: data.responseBytes ?? 0,
        outcome: data.outcome,
        errorKind: data.errorKind ?? null,
      },
    });
  } catch (error) {
    console.warn('[webhook] 审计日志落库失败:', error);
  }
}

/** 单次请求原始响应 */
interface WebhookRawResponse {
  status: number;
  location?: string;
  body: Buffer;
}

/**
 * 发起单次 Webhook 出站请求（node:https.request + guardedLookup 校验合一）。
 * 杜绝 DNS 重绑定 TOCTOU 漏洞，流式控制 200KB 内存上限。
 */
function requestWebhookOnce(options: {
  url: URL;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}): Promise<WebhookRawResponse> {
  return new Promise<WebhookRawResponse>((resolve, reject) => {
    const target = options.url;
    const reqOptions: ClientRequestArgs = {
      protocol: target.protocol,
      // IPv6 字面量在 URL.hostname 中带方括号，交给 http/https 模块前需剥离
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port ? Number(target.port) : 443,
      path: `${target.pathname}${target.search}`,
      method: options.method,
      headers: options.headers,
      lookup: guardedLookup,
      timeout: CONNECT_TIMEOUT_MS,
    };

    const req = httpsRequest(reqOptions, (res) => {
      const status = res.statusCode ?? 0;

      // 重定向：天然不跟随，只保留 location，丢弃 body
      if (status >= 300 && status < 400) {
        res.resume();
        const location =
          typeof res.headers.location === 'string' ? res.headers.location : undefined;
        resolve({
          status,
          location,
          body: Buffer.alloc(0),
        });
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;

      res.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          res.destroy(new WebhookPayloadTooLargeError());
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({
          status,
          location:
            typeof res.headers.location === 'string' ? res.headers.location : undefined,
          body: Buffer.concat(chunks),
        });
      });

      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error('connect timeout'));
    });
    req.on('error', reject);

    // 信号中止（用户中断或超时派生中止）：立即销毁请求
    const signal = options.signal;
    if (signal) {
      const onAbort = () => {
        req.destroy(new Error('request aborted'));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      req.on('close', () => {
        signal.removeEventListener('abort', onAbort);
      });
    }

    if (options.body && options.method === 'POST') {
      req.end(options.body);
    } else {
      req.end();
    }
  });
}

/**
 * 探测 Webhook 目标地址连通性（握手级测试，不落审计日志）。
 *
 * 规范要求（spec §4.3 / §0 D-三期-8）：
 * 1. 走完整安全检查（字面量 https-only + DNS 重绑定内网守卫在传输层不可分割）；
 * 2. 5 秒超时、天然不跟随重定向、不带 secret、不带 body；
 * 3. 任何 HTTP 响应（含 4xx/5xx）均视为「可达」；
 * 4. 网络层失败（DNS 解析失败/连接超时/TLS 错误/命中黑名单/重定向被拒）返回对应中文原因。
 */
export async function probeWebhookConnection(targetUrl: string): Promise<WebhookProbeResult> {
  // 1. 字面量安全校验（仅允许 https，拦截内网字面量与危险主机名）
  const urlGuard = validateWebhookUrl(targetUrl);
  if (!urlGuard.ok) {
    return {
      reachable: false,
      reason: urlGuard.reason === 'Webhook 网址必须使用 https 协议' ? urlGuard.reason : '命中黑名单',
    };
  }

  // 2. 发送轻量握手请求（GET，5s 超时，禁重定向，无 body，无鉴权，传输层内聚 guardedLookup）
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('timeout'));
  }, PROBE_TIMEOUT_MS);

  const startTime = Date.now();
  try {
    const response = await requestWebhookOnce({
      url: urlGuard.url,
      method: 'GET',
      headers: {
        'User-Agent': 'AI-Aggregation-Webhook-Probe/1.0',
        Accept: '*/*',
      },
      signal: controller.signal,
    });

    const durationMs = Date.now() - startTime;

    // 禁重定向：收到 3xx 判定为重定向被拒
    if (response.status >= 300 && response.status < 400) {
      return {
        reachable: false,
        reason: '重定向被拒',
      };
    }

    // 任何 HTTP 响应（含 2xx/4xx/5xx）均视为可达
    return {
      reachable: true,
      statusCode: response.status,
      durationMs,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    const errName = error instanceof Error ? error.name : '';

    // 命中黑名单：guardedLookup 校验失败抛出的 ToolError 且错误码为 ADDRESS_BLOCKED
    if (error instanceof ToolError && error.code === 'ADDRESS_BLOCKED') {
      return { reachable: false, reason: '命中黑名单' };
    }

    // 连接超时
    if (
      timedOut ||
      controller.signal.aborted ||
      /timeout/i.test(errMessage) ||
      errName === 'AbortError' ||
      /abort/i.test(errMessage)
    ) {
      return { reachable: false, reason: '连接超时' };
    }

    // TLS 错误
    if (/certificate|CERT_|TLS|SSL|DEPTH_ZERO_SELF_SIGNED_CERT/i.test(errMessage)) {
      return { reachable: false, reason: 'TLS 错误' };
    }

    // DNS 解析失败
    if (
      /ENOTFOUND|EAI_AGAIN|DNS|getaddrinfo/i.test(errMessage) ||
      errMessage.includes('域名无法解析')
    ) {
      return { reachable: false, reason: 'DNS 解析失败' };
    }

    return { reachable: false, reason: '连接超时' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 执行用户自定义 Webhook 工具调用（spec §4.5 安全红线与执行器）。
 *
 * 核心逻辑：
 * 1. https-only 与字面量二次校验；
 * 2. 鉴权头解密注入（解密失败显式报错，绝不降级请求）；
 * 3. GET 拼接 query / POST 发送 JSON body；
 * 4. 传输层一体化 DNS 防重绑定（guardedLookup）与 15s 总超时 / 5s 连接超时；
 * 5. 禁重定向（收到 3xx 判定失败）；
 * 6. 响应体流式读取，超 200KB 立即销毁并报「响应过大」失败；
 * 7. 响应内容 JSON 美化截断或文本截断；
 * 8. 全流程落库 WebhookToolCall 审计（写库失败仅警告不阻断）。
 */
export async function executeWebhookTool(
  tool: UserWebhookTool,
  args: unknown,
  ctx?: WebhookExecutionContext
): Promise<WebhookExecutionResult> {
  const startTime = Date.now();
  const userId = ctx?.userId || tool.userId;
  let hostname = tryExtractHostname(tool.url);

  try {
    // 1. 安全红线 1：URL 字面量与协议收紧校验（必须为 https，且非内网/保留地址字面量）
    const urlValidation = validateWebhookUrl(tool.url);
    if (!urlValidation.ok) {
      const durationMs = Date.now() - startTime;
      await writeAuditRecord({
        userId,
        toolId: tool.id,
        hostname,
        method: tool.method,
        statusCode: null,
        durationMs,
        responseBytes: 0,
        outcome: 'blocked',
        errorKind: 'blocked',
      });
      return {
        ok: false,
        contentForModel: `Webhook 工具「${tool.name}」配置的网址未通过安全校验：${urlValidation.reason}`,
        summaryForDisplay: `安全拦截：${urlValidation.reason}`,
      };
    }

    hostname = urlValidation.hostname;

    // 2. 鉴权头处理：解密注入，解密失败显式报错不降级（不发无鉴权请求）
    const headers: Record<string, string> = {
      'User-Agent': 'AI-Aggregation-Webhook-Executor/1.0',
      Accept: 'application/json, text/plain, */*',
    };

    if (tool.authHeaderName && tool.authHeaderValueEnc) {
      try {
        const decryptedSecret = decryptWebhookSecret(tool.authHeaderValueEnc);
        headers[tool.authHeaderName] = decryptedSecret;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        console.warn(`[webhook] 工具 ${tool.name} 凭证解密失败:`, error);
        await writeAuditRecord({
          userId,
          toolId: tool.id,
          hostname,
          method: tool.method,
          statusCode: null,
          durationMs,
          responseBytes: 0,
          outcome: 'failed',
          errorKind: 'auth_error',
        });
        return {
          ok: false,
          contentForModel: `Webhook 工具「${tool.name}」的鉴权凭证解密失败，请在个人中心重新配置鉴权凭证。`,
          summaryForDisplay: '鉴权凭证解密失败',
        };
      }
    }

    // 3. 请求构造：GET 拼 query，POST 作 JSON body
    const targetUrl = new URL(urlValidation.url.toString());
    let body: string | undefined = undefined;

    if (tool.method === 'GET') {
      if (args && typeof args === 'object') {
        for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
          if (value !== undefined && value !== null) {
            targetUrl.searchParams.set(
              key,
              typeof value === 'object' ? JSON.stringify(value) : String(value)
            );
          }
        }
      }
    } else {
      headers['Content-Type'] = 'application/json';
      try {
        body = JSON.stringify(args ?? {});
      } catch {
        body = '{}';
      }
    }

    // 4. 超时与取消信号控制（15 秒总超时兜底）
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('timeout'));
    }, EXECUTION_TIMEOUT_MS);

    // 串联外部中止信号
    const externalSignal = ctx?.signal;
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), {
          once: true,
        });
      }
    }

    // 5. 发起出站请求（传输层通过 guardedLookup 确保解析与连接同一步，防 DNS 重绑定）
    let response: WebhookRawResponse;
    try {
      response = await requestWebhookOnce({
        url: targetUrl,
        method: tool.method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (networkError) {
      const durationMs = Date.now() - startTime;
      const isUserAborted = ctx?.signal?.aborted;
      const errMessage =
        networkError instanceof Error ? networkError.message : String(networkError);
      const errName = networkError instanceof Error ? networkError.name : '';

      // 判定 1：DNS 解析解析到内网或保留地址（命中黑名单）
      const isBlocked =
        networkError instanceof ToolError && networkError.code === 'ADDRESS_BLOCKED';

      if (isBlocked) {
        await writeAuditRecord({
          userId,
          toolId: tool.id,
          hostname,
          method: tool.method,
          statusCode: null,
          durationMs,
          responseBytes: 0,
          outcome: 'blocked',
          errorKind: 'blocked',
        });
        return {
          ok: false,
          contentForModel: `Webhook 工具「${tool.name}」域名解析失败：该地址不允许访问`,
          summaryForDisplay: '该地址不允许访问',
        };
      }

      // 判定 2：响应体超过 200KB 限制
      const isPayloadTooLarge =
        networkError instanceof WebhookPayloadTooLargeError;

      if (isPayloadTooLarge) {
        await writeAuditRecord({
          userId,
          toolId: tool.id,
          hostname,
          method: tool.method,
          statusCode: null,
          durationMs,
          responseBytes: 0,
          outcome: 'failed',
          errorKind: 'http_error',
        });
        return {
          ok: false,
          contentForModel: `工具「${tool.name}」执行失败：目标接口响应内容过大，超过 200KB 上限。请在回答中如实告知用户调用失败的原因。`,
          summaryForDisplay: '执行失败：响应内容过大',
        };
      }

      // 判定 3：其他网络错误分类
      let errorKind = 'http_error';
      let reason = '请求发送失败，请稍后重试';

      if (isUserAborted) {
        errorKind = 'timeout';
        reason = '已取消';
      } else if (
        timedOut ||
        controller.signal.aborted ||
        /timeout/i.test(errMessage) ||
        errName === 'AbortError' ||
        /abort/i.test(errMessage)
      ) {
        errorKind = 'timeout';
        reason = '连接超时，请稍后重试';
      } else if (/certificate|CERT_|TLS|SSL/i.test(errMessage)) {
        errorKind = 'tls';
        reason = '目标网站证书校验失败，无法建立安全连接';
      } else if (
        /ENOTFOUND|EAI_AGAIN|DNS|getaddrinfo/i.test(errMessage) ||
        errMessage.includes('域名无法解析')
      ) {
        errorKind = 'dns';
        reason = '域名无法解析，请检查网址是否正确';
      }

      await writeAuditRecord({
        userId,
        toolId: tool.id,
        hostname,
        method: tool.method,
        statusCode: null,
        durationMs,
        responseBytes: 0,
        outcome: 'failed',
        errorKind,
      });

      return {
        ok: false,
        contentForModel: `工具「${tool.name}」执行失败：${reason}。请在回答中如实告知用户调用失败的原因。`,
        summaryForDisplay: `执行失败：${reason}`,
      };
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - startTime;
    const status = response.status;

    // 6. 禁重定向处理：收到 3xx 一律判失败，输出模型可读文案
    if (status >= 300 && status < 400) {
      const location = response.location || '';
      await writeAuditRecord({
        userId,
        toolId: tool.id,
        hostname,
        method: tool.method,
        statusCode: status,
        durationMs,
        responseBytes: 0,
        outcome: 'failed',
        errorKind: 'http_error',
      });

      return {
        ok: false,
        contentForModel: `目标地址返回重定向（HTTP ${status}${location ? ` -> ${location}` : ''}），出于安全策略已拒绝。请直接提供重定向后的最终地址。`,
        summaryForDisplay: `重定向已拒绝 (HTTP ${status})`,
      };
    }

    // 7. 读取流式累计后的响应文本与体积
    const rawText = response.body.toString('utf8');
    const responseBytes = Buffer.byteLength(rawText, 'utf8');

    // 8. 响应格式化：JSON 美化后截断，非 JSON 纯文本截断
    let formattedContent: string;
    try {
      const parsedJson = JSON.parse(rawText);
      formattedContent = JSON.stringify(parsedJson, null, 2);
    } catch {
      formattedContent = rawText.trim();
    }

    const truncatedContent = truncate(formattedContent, MAX_CONTENT_CHARS);

    // 9. 判定成功或失败（HTTP 2xx 视为成功，4xx/5xx 视为失败并带错误内容）
    const isSuccess = status >= 200 && status < 300;
    const outcome = isSuccess ? 'success' : 'failed';
    const errorKind = isSuccess ? null : 'http_error';

    await writeAuditRecord({
      userId,
      toolId: tool.id,
      hostname,
      method: tool.method,
      statusCode: status,
      durationMs,
      responseBytes,
      outcome,
      errorKind,
    });

    if (isSuccess) {
      return {
        ok: true,
        contentForModel: truncatedContent || '（目标接口返回空响应）',
        summaryForDisplay: truncate(`调用成功 (HTTP ${status})`, MAX_SUMMARY_CHARS),
      };
    }

    return {
      ok: false,
      contentForModel: `目标接口返回错误状态码 HTTP ${status}。\n响应内容：\n${truncatedContent || '（无响应体）'}`,
      summaryForDisplay: truncate(`调用失败 (HTTP ${status})`, MAX_SUMMARY_CHARS),
    };
  } catch (unexpectedError) {
    const durationMs = Date.now() - startTime;
    console.error(`[webhook] 工具 ${tool.name} 执行发生未知错误:`, unexpectedError);
    await writeAuditRecord({
      userId,
      toolId: tool.id,
      hostname,
      method: tool.method,
      statusCode: null,
      durationMs,
      responseBytes: 0,
      outcome: 'failed',
      errorKind: 'http_error',
    });
    return {
      ok: false,
      contentForModel: `工具「${tool.name}」执行异常，请稍后重试。`,
      summaryForDisplay: '执行异常',
    };
  }
}
