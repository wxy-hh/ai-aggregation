/**
 * 讯飞星火 — ChatProviderAdapter
 *
 * 讯飞使用 OpenAI 兼容格式但有自定义解析逻辑，
 * 通过 createXunfeiStreamResponse 生成原始流，
 * 再由 textStreamToSse 包装为 SSE 事件流。
 */

import {
  createXunfeiStreamResponse,
  type XunfeiMessage,
} from '@repo/providers';
import { normalizeUsage } from '@/lib/ai-usage';
import type { ChatContext, ChatProviderAdapter } from '../types';
import { textStreamToSse } from '../sse';

export class XunfeiAdapter implements ChatProviderAdapter {
  async stream(ctx: ChatContext): Promise<ReadableStream<Uint8Array>> {
    let usage: ReturnType<typeof normalizeUsage> | null = null;
    let text = '';

    const rawStream = createXunfeiStreamResponse({
      model: ctx.model,
      messages: ctx.messages as XunfeiMessage[],
      stream: true,
      maxTokens: ctx.outputLimit,
      signal: ctx.signal,
      onUsage: (u) => { usage = normalizeUsage(u); },
    });

    const sseStream = textStreamToSse(rawStream, {
      onText: (chunk) => { text += chunk; },
      onDone: async () => {
        // 流正常结束：报告 success，结算交由 handler 侧 QuotaSession 处理
        await ctx.onFinish({ outcome: 'success', usage, outputText: text });
      },
      onError: async (err) => {
        console.error('[chat] 讯飞流式错误:', {
          errorId: ctx.errorId,
          error: err instanceof Error ? err.message : String(err),
        });
        // 有输出文本 → partial；完全无输出 → failed（取消应退款）
        await ctx.onFinish({
          outcome: text ? 'partial' : 'failed',
          usage,
          outputText: text,
          reason: err instanceof Error ? err.message : String(err),
        });
      },
    });

    return sseStream;
  }
}