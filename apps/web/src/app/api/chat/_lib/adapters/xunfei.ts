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
import type { ChatContext, ChatProviderAdapter, StreamResult } from '../types';
import { textStreamToSse, createSseResponse } from '../sse';
import { finalizeChatStream, type BillingManager } from '../billing-manager';

export class XunfeiAdapter implements ChatProviderAdapter {
  constructor(private billing: BillingManager) {}

  async stream(ctx: ChatContext): Promise<StreamResult> {
    let usage: ReturnType<typeof normalizeUsage> | null = null;
    let text = '';

    const rawStream = createXunfeiStreamResponse({
      model: ctx.model,
      messages: ctx.messages as XunfeiMessage[],
      stream: true,
      maxTokens: this.billing.outputLimit,
      signal: ctx.signal,
      onUsage: (u) => { usage = normalizeUsage(u); },
    });

    const sseStream = textStreamToSse(rawStream, {
      onText: (chunk) => { text += chunk; },
      onDone: async () => {
        // 流正常结束：统一结算（success）
        await finalizeChatStream(this.billing, {
          outcome: 'success',
          usage,
          outputText: text,
        });
      },
      onError: async (err) => {
        console.error('[chat] 讯飞流式错误:', {
          errorId: ctx.errorId,
          error: err instanceof Error ? err.message : String(err),
        });
        // 有输出文本 → partial 结算；完全无输出 → 释放预留（取消应退款）
        await finalizeChatStream(this.billing, {
          outcome: text ? 'partial' : 'failed',
          usage,
          outputText: text,
          reason: err instanceof Error ? err.message : String(err),
        });
      },
    });

    return {
      stream: sseStream,
      getUsage: () => usage ? {
        meterType: 'tokens' as const,
        sourceUnits: usage.totalTokens ?? 0,
        quotaUnits: usage.totalTokens ?? 0,
        inputUnits: usage.inputTokens,
        outputUnits: usage.outputTokens,
        source: usage.totalTokens === null ? 'local_estimate' as const : 'provider' as const,
      } : null,
    };
  }
}
