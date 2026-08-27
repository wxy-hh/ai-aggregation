/**
 * 通用 AI 提供方适配器（Vercel AI SDK）
 *
 * 适用于所有通过 OpenAI 兼容接口接入的模型（如 DeepSeek、Qwen 等），
 * 使用 Vercel AI SDK 的 streamText 获取流式响应。
 */

import { streamText } from 'ai';
import { createProvider } from '@repo/providers';
import { normalizeUsage } from '@/lib/ai-usage';
import { estimateOutputTokens } from '@/lib/billing/usage-measurement';
import type { ChatContext, ChatProviderAdapter, StreamResult } from '../types';
import { textStreamToSse } from '../sse';
import type { BillingManager } from '../billing-manager';
import type { ProviderName } from '@repo/providers';

export class GenericAdapter implements ChatProviderAdapter {
  constructor(private billing: BillingManager) {}

  async stream(ctx: ChatContext): Promise<StreamResult> {
    const aiProvider = createProvider(ctx.provider as ProviderName);
    const result = streamText({
      model: aiProvider(ctx.model),
      messages: ctx.messages,
      abortSignal: ctx.signal,
      maxOutputTokens: this.billing.outputLimit,
    });

    const textResponse = result.toTextStreamResponse();
    if (!textResponse.body) {
      throw new Error('上游未返回流式响应体');
    }

    const sseStream = textStreamToSse(textResponse.body, {
      onDone: async () => {
        try {
          const usage = await result.totalUsage;
          const normalized = normalizeUsage(usage);
          if (this.billing.hasReservation) {
            await this.billing.settle(normalized.rawUsage, this.billing.inputUnits);
          } else {
            await this.billing.recordUsage(normalized.rawUsage);
          }
        } catch (err) {
          console.error('[chat] 读取 usage 失败:', err);
        }
      },
      onError: async () => {
        if (this.billing.hasReservation && !this.billing.finalized) {
          await this.billing.settle(null, this.billing.inputUnits);
        }
      },
    });

    return {
      stream: sseStream,
      getUsage: () => null, // usage 在 onDone 中结算
    };
  }
}
