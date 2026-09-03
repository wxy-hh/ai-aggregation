/**
 * 通用 AI 提供方适配器（Vercel AI SDK）
 *
 * 适用于所有通过 OpenAI 兼容接口接入的模型（如 DeepSeek、Qwen 等），
 * 使用 Vercel AI SDK 的 streamText 获取流式响应。
 */

import { streamText } from 'ai';
import { createProvider } from '@repo/providers';
import { normalizeUsage } from '@/lib/ai-usage';
import type { ChatContext, ChatProviderAdapter } from '../types';
import { textStreamToSse } from '../sse';
import type { ProviderName } from '@repo/providers';

export class GenericAdapter implements ChatProviderAdapter {
  async stream(ctx: ChatContext): Promise<ReadableStream<Uint8Array>> {
    const aiProvider = createProvider(ctx.provider as ProviderName);
    const result = streamText({
      model: aiProvider(ctx.model),
      messages: ctx.messages,
      abortSignal: ctx.signal,
      maxOutputTokens: ctx.outputLimit,
    });

    const textResponse = result.toTextStreamResponse();
    if (!textResponse.body) {
      throw new Error('上游未返回流式响应体');
    }

    // 累计输出文本：结算侧以它计算输出估算兜底
    let text = '';
    const sseStream = textStreamToSse(textResponse.body, {
      onText: (chunk) => { text += chunk; },
      onDone: async () => {
        let usage: unknown = null;
        try {
          const total = await result.totalUsage;
          usage = normalizeUsage(total).rawUsage;
        } catch (err) {
          // usage 读取失败：走估算兜底结算，不静默跳过
          console.error('[chat] 读取 usage 失败:', err);
        }
        await ctx.onFinish({ outcome: 'success', usage, outputText: text });
      },
      onError: async (err) => {
        // 有输出文本 → partial；完全无输出 → failed（取消应退款），
        // 决策交给 handler 侧 QuotaSession.finalize，adapter 只报告完成态。
        await ctx.onFinish({
          outcome: text ? 'partial' : 'failed',
          usage: null,
          outputText: text,
          reason: err instanceof Error ? err.message : String(err),
        });
      },
    });

    return sseStream;
  }
}