/**
 * 聊天路由处理器工厂
 *
 * 参照 destiny 报告工厂的 createReportHandler 模式，
 * 将鉴权、限流、配额、错误处理统一在此，provider 差异委派给适配器。
 */

import type { ProviderName } from '@repo/providers';
import type { Message as ChatMessage } from '@/stores/chat-store';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { getRateLimiter } from '@repo/redis';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { QuotaSession } from '@/lib/billing/quota-session';
import { getDefaultModel } from '@repo/providers';
import { createSseResponse } from './sse';
import type { ChatProviderAdapter } from './types';
import { DoubaoFileNotReadyError, DoubaoApiError } from './adapters/doubao';

export interface ChatHandlerConfig {
  /** 根据 provider 返回对应适配器 */
  getAdapter: (provider: ProviderName) => ChatProviderAdapter;
}

export function createChatHandler(config: ChatHandlerConfig) {
  return async function POST(req: Request) {
    const errorId = createErrorId();
    const startTime = Date.now();
    // 提升到 try 外：初始化/适配器启动失败时也需释放预留（评审 C2：release 闭环）
    let session: QuotaSession | null = null;

    try {
      // 1. 鉴权
      const user = await getCurrentUser(req);
      console.log('[chat] 鉴权通过', { errorId, userId: user.id, t: Date.now() - startTime });

      // 2. 限流
      await checkRateLimit(user.id, errorId);

      // 3. 解析请求
      const body = await req.json();
      const { messages, model, provider = 'xunfei', reservationId } = body as {
        messages: ChatMessage[];
        model?: string;
        provider?: ProviderName;
        reservationId?: string;
      };

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return jsonResponse({ error: 'Messages are required' }, 400);
      }

      const requestId = getBillingRequestId(req, body as Record<string, unknown>);
      const modelName = model || getDefaultModel(provider);
      const messagesCount = messages.length;
      const attachmentCount = messages.reduce(
        (count, m) => count + (m.attachments?.length ?? 0),
        0
      );

      console.log('[chat] 请求参数:', { provider, model: modelName, messagesCount });

      // 4. 配额管理：QuotaSession 统一 reserve → finalize（评审 C1 唯一决策表）
      const reservedSession = await QuotaSession.reserve({
        userId: user.id,
        requestId,
        feature: 'chat',
        provider,
        model: modelName,
        messages,
        metadata: { messagesCount, attachmentCount },
        reservationId,
      }, user.role);
      session = reservedSession;

      // 5. 委派给适配器：adapter 只产流，结算物料经 onFinish 回传给 handler
      const adapter = config.getAdapter(provider);
      const stream = await adapter.stream({
        userId: user.id,
        provider,
        model: modelName,
        messages,
        outputLimit: reservedSession.outputLimit,
        signal: req.signal,
        errorId,
        onFinish: (finish) => reservedSession.finalize(finish.outcome, {
          requestId,
          action: 'chat-stream',
          endpoint: '/api/chat',
          usage: finish.usage,
          outputText: finish.outputText,
          reason: finish.reason,
          provider,
          model: modelName,
          userId: user.id,
          feature: 'chat',
          metadata: { errorId, messagesCount, attachmentCount },
        }),
      });

      console.log('[chat] 流开始', {
        userId: user.id, provider, model: modelName,
        duration: `${Date.now() - startTime}ms`,
      });

      return createSseResponse(stream);

    } catch (error) {
      // 流尚未开始（豆包文件未就绪、上游 401/429、适配器初始化失败等）：
      // 释放预留额度，避免 reservation 永久泄漏。
      // 响应已发出后的错误由 onFinish → QuotaSession.finalize 在流内结算/释放，不会走到这里。
      if (session) {
        await session.release({
          reason: error instanceof Error ? error.message : '聊天请求失败',
          meterType: 'tokens',
        });
      }
      return handleError(error, errorId, startTime);
    }
  };
}

// ==================== 内部工具函数 ====================

function createErrorId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function jsonResponse(data: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function checkRateLimit(userId: string, errorId: string): Promise<void> {
  try {
    const rateLimiter = getRateLimiter();
    const result = await rateLimiter.check(userId);
    if (!result.allowed) {
      throw new RateLimitError(result.remaining, result.reset);
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    // 限流服务故障不阻断对话
    console.error('[chat] 限流跳过:', error);
  }
}

function handleError(error: unknown, errorId: string, startTime: number): Response {
  const duration = Date.now() - startTime;

  console.error('[chat] 请求错误:', {
    errorId,
    duration: `${duration}ms`,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  // 限流
  if (error instanceof RateLimitError) {
    return new Response(
      JSON.stringify({ error: '请求过于频繁，请稍后再试', errorId, retryAfter: 60 }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(error.remaining),
          'X-RateLimit-Reset': String(error.reset),
          'Retry-After': '60',
        },
      }
    );
  }

  // 认证错误
  if (error instanceof AuthError) {
    return jsonResponse(
      { error: error.message, errorId },
      error.code === 'FORBIDDEN' ? 403 : 401
    );
  }

  // 计费错误
  if (error instanceof BillingError) {
    return billingErrorResponse(error, 402);
  }

  // 豆包文件未就绪
  if (error instanceof DoubaoFileNotReadyError) {
    return jsonResponse({ error: error.message, errorId }, 400);
  }

  // 豆包 API 错误
  if (error instanceof DoubaoApiError) {
    return jsonResponse({ error: error.message, errorId }, error.status);
  }

  // 通用 Error
  if (error instanceof Error) {
    if (error.message.includes('Missing') || error.message.includes('未设置'))
      return jsonResponse({ error: '服务配置错误，请联系管理员', errorId }, 500);
    if (error.message.includes('timeout') || error.message.includes('超时'))
      return jsonResponse({ error: '请求超时，请稍后重试', errorId }, 504);
    if (error.message.includes('fetch') || error.message.includes('network'))
      return jsonResponse({ error: '网络连接失败，请检查网络后重试', errorId }, 503);
  }

  return jsonResponse({ error: '服务暂时不可用，请稍后重试', errorId }, 500);
}

class RateLimitError extends Error {
  constructor(
    public remaining: number,
    public reset: number
  ) {
    super('请求过于频繁');
    this.name = 'RateLimitError';
  }
}
