/**
 * 豆包 (Doubao) — ChatProviderAdapter
 *
 * 豆包使用 Responses API，SSE 事件格式与 OpenAI 不同，
 * 需要自定义解析逻辑，同时支持多模态附件。
 */

import { normalizeUsage } from '@/lib/ai-usage';
import { getDoubaoIncompleteWarning } from '../../doubao-warning';
import type { ChatContext, ChatProviderAdapter, StreamResult } from '../types';
import { encodeSseEvent, createSseResponse } from '../sse';
import { finalizeChatStream, type BillingManager } from '../billing-manager';
import type { Attachment, Message as ChatMessage } from '@/stores/chat-store';

// 豆包多模态内容类型
type DoubaoContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; file_id: string };

/** 将消息转换为豆包多模态格式 */
function convertToDoubaoInput(
  msgs: ChatMessage[]
): Array<{ role: string; content: string | DoubaoContentPart[] }> {
  return msgs.map((msg) => {
    if (msg.attachments && msg.attachments.length > 0) {
      const parts: DoubaoContentPart[] = [];
      for (const a of msg.attachments) {
        if (a.type === 'image' && a.imageUrl) {
          parts.push({ type: 'input_image', image_url: a.imageUrl });
        } else if (a.type === 'file' && a.fileId) {
          parts.push({ type: 'input_file', file_id: a.fileId });
        }
      }
      if (msg.content.trim()) {
        parts.push({ type: 'input_text', text: msg.content });
      }
      return { role: msg.role, content: parts };
    }
    return { role: msg.role, content: msg.content };
  });
}

/** 等待豆包文件处理就绪 */
async function waitForFileReady(
  fileId: string,
  arkApiKey: string,
  arkBaseUrl: string,
  maxWaitTime = 8000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const res = await fetch(`${arkBaseUrl}/files/${fileId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${arkApiKey}` },
      });
      if (res.ok) {
        const result = await res.json();
        if (result.status === 'active') return true;
        if (result.status === 'error' || result.status === 'failed') return false;
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

/** 解析豆包 API 错误为友好提示 */
function parseDoubaoError(errorText: string): string {
  try {
    const data = JSON.parse(errorText);
    const msg: string = data?.error?.message || '';
    const code: string = data?.error?.code || '';

    if (msg.includes('invalid state: processing'))
      return '文件正在处理中，请等待几秒钟后重试。大文件需要更长的处理时间。';
    if (code === 'RateLimitExceeded' || msg.includes('System protection triggered by request burst') || msg.includes('request burst') || msg.toLowerCase().includes('rate limit'))
      return '当前请求过于频繁，已触发系统保护机制。请稍等 1-2 分钟后重试，并避免短时间内连续发送。';
    if (msg.includes('exceeds the maximum allowed total pixels')) {
      const currentMatch = msg.match(/Current dimensions:.*?=\s*(\d+)\s*pixels/);
      const maxMatch = msg.match(/Maximum allowed:\s*(\d+)\s*pixels/);
      if (currentMatch && maxMatch) {
        const cur = parseInt(currentMatch[1]);
        const max = parseInt(maxMatch[1]);
        return `豆包 API 限制：PDF 总像素数超限（当前 ${(cur / 1e6).toFixed(1)}MP，最大 ${(max / 1e6).toFixed(1)}MP）。请尝试：1) 减少 PDF 页数 2) 压缩 PDF 分辨率 3) 分批上传`;
      }
      return '豆包 API 限制：PDF 总像素数超限（最大支持 3600 万像素）。请尝试减少 PDF 页数或压缩分辨率后重试。';
    }
    if (msg.includes('file type not supported'))
      return '不支持的文件类型。目前仅支持 PDF 格式的文件。';
    if (msg) return `处理失败: ${msg}`;
    return '请求失败，请稍后重试';
  } catch {
    return '请求失败，请稍后重试';
  }
}

export class DoubaoAdapter implements ChatProviderAdapter {
  constructor(
    private billing: BillingManager,
    private arkApiKey: string,
    private arkBaseUrl: string
  ) {}

  async stream(ctx: ChatContext): Promise<StreamResult> {
    // 等待文件附件就绪
    const fileAttachments = ctx.messages
      .flatMap((m) => m.attachments || [])
      .filter((a): a is Attachment & { fileId: string } => a.type === 'file' && !!a.fileId);

    for (const attachment of fileAttachments) {
      const isReady = await waitForFileReady(attachment.fileId, this.arkApiKey, this.arkBaseUrl);
      if (!isReady) {
        throw new DoubaoFileNotReadyError(attachment.fileId);
      }
    }

    const input = convertToDoubaoInput(ctx.messages);
    // 不传 max_output_tokens：doubao-seed-evolving 等推理模型的该上限同时约束
    // reasoning + 正文（与 destiny copilot 同一结论）。多轮对话中思考变长，
    // 2048 预算会被 reasoning 独占（实测 reasoning_tokens=2048、正文=0），
    // 上游返回 incomplete/length，适配器零文本分支向前端发 error，
    // 表现为「第一轮正常、第二轮无返回」。超预留部分由结算侧 billing_pending 对账兜底。
    const requestBody = {
      model: ctx.model,
      input,
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
    };

    console.log('[chat] 豆包 API 调用:', {
      model: ctx.model,
      messagesCount: ctx.messages.length,
      hasAttachments: ctx.messages.some((m) => m.attachments && m.attachments.length > 0),
    });

    const response = await fetch(`${this.arkBaseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.arkApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: ctx.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[chat] 豆包 API 错误:', {
        status: response.status,
        body: errorText,
      });
      const friendlyError = parseDoubaoError(errorText);
      throw new DoubaoApiError(response.status, friendlyError);
    }

    if (!response.body) {
      throw new DoubaoApiError(500, '上游未返回响应体');
    }

    // 解析豆包 Responses API 的 SSE 流
    const stream = this.parseDoubaoSseStream(response.body, ctx);
    return {
      stream,
      getUsage: () => null, // usage 在流内部结算
    };
  }

  private parseDoubaoSseStream(
    body: ReadableStream<Uint8Array>,
    ctx: ChatContext
  ): ReadableStream<Uint8Array> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let usage: ReturnType<typeof normalizeUsage> | null = null;
    let text = '';
    const billing = this.billing;

    return new ReadableStream({
      async start(controller) {
        try {
          let buffer = '';
          let hasSentDone = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() || '';

            for (const block of blocks) {
              const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
              const dataLine = lines.find((l) => l.startsWith('data: '));
              if (!dataLine) continue;

              try {
                const jsonStr = dataLine.slice(6);
                if (jsonStr === '[DONE]') {
                  hasSentDone = true;
                  // 不立即发送 done 事件：需等流结束后再检查是否有文本输出，
                  // 若为空应发送 error 事件而非 done，避免前端展示空消息。
                  break;
                }

                const data = JSON.parse(jsonStr);

                if (data.type === 'response.output_text.delta') {
                  const content = data.delta;
                  if (content) {
                    text += content;
                    controller.enqueue(encodeSseEvent({ type: 'text-delta', text: content }));
                  }
                } else if (
                  data.type === 'response.done' ||
                  data.type === 'response.completed' ||
                  data.type === 'response.incomplete'
                ) {
                  const usagePayload =
                    data.response?.usage ?? data.usage ?? data.response?.metadata?.usage ?? null;
                  if (usagePayload) {
                    usage = normalizeUsage(usagePayload);
                  }
                  hasSentDone = true;
                  const warning = getDoubaoIncompleteWarning(data);
                  if (warning) {
                    controller.enqueue(encodeSseEvent({ type: 'warning', warning }));
                  }
                  // 不立即发送 done 事件：需等流结束后再检查是否有文本输出，
                  // 若为空应发送 error 事件而非 done，避免前端展示空消息。
                  break;
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                console.error('[chat] SSE 解析失败:', e);
              }
            }
            if (hasSentDone) break;
          }

          // 上游流已关闭：判定完成态并统一结算（评审 C2：finalizeChatStream 唯一决策点）。
          // 正常响应的最后必有 response.done/completed/incomplete（含 usage）；
          // 若未收到任何结束事件即为异常（部署超时截断、网络中断或上游空流），
          // 不能再静默补发 done——前端会把空回答当作「调用成功」展示。
          if (hasSentDone) {
            // 关键修复：即使收到 response.done，也要检查是否有文本输出。
            // 若文本为空（模型成功完成但无输出），应标记为 failed 而非 success，
            // 否则前端会把空回答当作「调用成功」展示为空消息。
            if (!text) {
              // 上游空流：错误事件 + 释放预留（无产出不扣费，取消应退款）
              controller.enqueue(
                encodeSseEvent({ type: 'error', error: '模型未返回任何内容，请重试' })
              );
              await finalizeChatStream(billing, {
                outcome: 'failed',
                usage: null,
                outputText: '',
                reason: '模型未返回任何内容',
              });
            } else {
              // 有输出文本：发送 done 事件并结算为 success
              controller.enqueue(encodeSseEvent({ type: 'done' }));
              await finalizeChatStream(billing, {
                outcome: 'success',
                usage,
                outputText: text,
              });
            }
          } else if (text) {
            // 截断但已有部分内容：先补发 warning + done 让前端正常收尾，按 partial 结算
            controller.enqueue(
              encodeSseEvent({ type: 'warning', warning: '回答在此处被截断，内容可能不完整' })
            );
            controller.enqueue(encodeSseEvent({ type: 'done' }));
            await finalizeChatStream(billing, {
              outcome: 'partial',
              usage,
              outputText: text,
              reason: '上游流截断',
            });
          } else {
            // 上游空流：错误事件 + 释放预留（无产出不扣费，取消应退款）
            controller.enqueue(
              encodeSseEvent({ type: 'error', error: '模型未返回任何内容，请重试' })
            );
            await finalizeChatStream(billing, {
              outcome: 'failed',
              usage: null,
              outputText: '',
              reason: '模型未返回任何内容',
            });
          }
          controller.close();
        } catch (error) {
          console.error('[chat] 豆包流错误:', error);
          // 有输出文本 → partial 结算；完全无输出 → 释放预留（取消应退款）
          await finalizeChatStream(billing, {
            outcome: text ? 'partial' : 'failed',
            usage,
            outputText: text,
            reason: error instanceof Error ? error.message : String(error),
          });
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });
  }
}

/** 豆包文件未就绪 */
export class DoubaoFileNotReadyError extends Error {
  constructor(public fileId: string) {
    super('文件正在处理中，请稍后重试。大文件需要更长的处理时间。');
    this.name = 'DoubaoFileNotReadyError';
  }
}

/** 豆包 API 错误 */
export class DoubaoApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'DoubaoApiError';
  }
}
