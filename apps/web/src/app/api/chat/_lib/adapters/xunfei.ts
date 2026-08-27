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
import { estimateOutputTokens } from '@/lib/billing/usage-measurement';
import type { ChatContext, ChatProviderAdapter, StreamResult } from '../types';
import { textStreamToSse, createSseResponse } from '../sse';
import type { BillingManager } from '../billing-manager';

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
        if (this.billing.hasReservation) {
          await this.billing.settle(usage, this.billing.inputUnits + estimateOutputTokens(text));
        } else {
          await this.billing.recordUsage(usage);
        }
      },
      onError: async (err) => {
        console.error('[chat] 讯飞流式错误:', {
          errorId: ctx.errorId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (this.billing.hasReservation) {
          const status = text ? 'partial' : 'failed';
          const fallback = this.billing.inputUnits + estimateOutputTokens(text);
          // settle 内部会判断 finalized，这里强制结算
          if (!this.billing.finalized) {
            await this.billing.settle(usage, fallback);
          }
        }
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
