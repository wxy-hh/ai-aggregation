import { streamText } from 'ai';
import {
  createProvider,
  getDefaultModel,
  type ProviderName,
  createXunfeiStreamResponse,
  type XunfeiMessage,
} from '@repo/providers';
import { getRateLimiter, getQuotaManager } from '@repo/shared';
import type { Attachment, Message as ChatMessage } from '@/stores/chat-store';
import { getDoubaoIncompleteWarning } from './doubao-warning';
import { requireAuth } from '@/lib/auth/require-auth';

function createErrorId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

// 豆包多模态内容类型
type DoubaoContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; file_id: string };

const sseEncoder = new TextEncoder();
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

function encodeSseEvent(payload: Record<string, unknown>): Uint8Array {
  return sseEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function createSseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}

function createSseStreamFromTextStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            const rest = decoder.decode();
            if (rest) {
              controller.enqueue(encodeSseEvent({ type: 'text-delta', text: rest }));
            }
            controller.enqueue(encodeSseEvent({ type: 'done' }));
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            controller.enqueue(encodeSseEvent({ type: 'text-delta', text: chunk }));
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}


// 解析豆包 API 错误信息
function parseDoubaoError(errorText: string): string {
  try {
    const errorData = JSON.parse(errorText);
    const errorMessage = errorData?.error?.message || '';

    // 文件还在处理中
    if (errorMessage.includes('invalid state: processing')) {
      return '文件正在处理中，请等待几秒钟后重试。大文件需要更长的处理时间。';
    }

    // 图片像素超限（豆包 API 将 PDF 当作图片处理，限制总像素数）
    if (errorMessage.includes('exceeds the maximum allowed total pixels')) {
      // 尝试提取当前像素和最大像素
      const currentMatch = errorMessage.match(/Current dimensions:.*?=\s*(\d+)\s*pixels/);
      const maxMatch = errorMessage.match(/Maximum allowed:\s*(\d+)\s*pixels/);

      if (currentMatch && maxMatch) {
        const currentPixels = parseInt(currentMatch[1]);
        const maxPixels = parseInt(maxMatch[1]);
        return `豆包 API 限制：PDF 总像素数超限（当前 ${(currentPixels / 1000000).toFixed(1)}MP，最大 ${(maxPixels / 1000000).toFixed(1)}MP）。请尝试：1) 减少 PDF 页数 2) 压缩 PDF 分辨率 3) 分批上传`;
      }

      return '豆包 API 限制：PDF 总像素数超限（最大支持 3600 万像素）。请尝试减少 PDF 页数或压缩分辨率后重试。';
    }

    // 文件类型不支持
    if (errorMessage.includes('file type not supported')) {
      return '不支持的文件类型。目前仅支持 PDF 格式的文件。';
    }

    // 其他错误
    if (errorMessage) {
      return `处理失败: ${errorMessage}`;
    }

    return `请求失败，请稍后重试`;
  } catch {
    return `请求失败，请稍后重试`;
  }
}

// 等待文件处理就绪
// 豆包文档说明：status 为 active 时才能在 Responses API 中使用
async function waitForFileReady(
  fileId: string,
  arkApiKey: string,
  arkBaseUrl: string,
  maxWaitTime: number = 10000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await fetch(`${arkBaseUrl}/files/${fileId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${arkApiKey}` },
      });

      if (response.ok) {
        const result = await response.json();
        // 豆包文档：status 为 active 时表示文件处理完成可用
        if (result.status === 'active') {
          return true;
        }
        if (result.status === 'error' || result.status === 'failed') {
          return false;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  return false;
}

export async function POST(req: Request) {
  const errorId = createErrorId();
  const startTime = Date.now();

  try {
    // 1. 限流检查
    const userId = await requireAuth(req);
    const rateLimiter = getRateLimiter();
    const quotaManager = getQuotaManager();

    // 检查 API 限流
    const rateLimitResult = await rateLimiter.check(userId);
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: '请求过于频繁，请稍后再试',
          errorId,
          retryAfter: 60,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': String(rateLimitResult.reset),
            'Retry-After': '60',
          },
        }
      );
    }

    // 检查用户配额
    const quotaResult = await quotaManager.checkQuota(userId, 'requests');
    if (!quotaResult.allowed) {
      return new Response(
        JSON.stringify({
          error: '今日请求次数已达上限',
          errorId,
          remaining: quotaResult.remaining,
          quota: quotaResult.quota,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-Quota-Remaining': String(quotaResult.remaining),
            'X-Quota-Limit': String(quotaResult.quota),
          },
        }
      );
    }

    // 2. 解析请求体
    const body = await req.json();
    const {
      messages,
      model,
      provider = 'xunfei',
    } = body as {
      messages: ChatMessage[];
      model?: string;
      provider?: ProviderName;
    };

    // 添加请求日志
    console.log('Chat API 请求参数:', {
      provider,
      model,
      messagesCount: messages?.length,
    });

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const modelName = model || getDefaultModel(provider);
    console.log('使用的模型名称:', modelName);

    // 对于讯飞，使用自定义的流式处理
    if (provider === 'xunfei') {
      const stream = createXunfeiStreamResponse({
        model: modelName,
        messages: messages as XunfeiMessage[],
        stream: true,
      });

      // 记录讯飞请求成功并更新配额
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log('讯飞 API 请求成功:', {
        userId,
        provider: 'xunfei',
        model: modelName,
        messagesCount: messages.length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      // 异步更新配额使用量
      quotaManager.incrementQuota(userId, 'requests', 1).catch((err) => {
        console.error('更新配额失败:', err);
      });

      return createSseResponse(createSseStreamFromTextStream(stream));
    }

    // 豆包需要特殊的消息格式处理
    if (provider === 'doubao') {
      // 直接使用 fetch 调用豆包 Responses API
      const arkApiKey = process.env.ARK_API_KEY;
      const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

      if (!arkApiKey) {
        return new Response(JSON.stringify({ error: 'Missing ARK_API_KEY' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      console.log('🔍 豆包 API 配置:', {
        arkBaseUrl,
        modelName,
      });

      // 辅助函数：将消息转换为豆包多模态格式
      const convertToDoubaoInput = (
        msgs: ChatMessage[]
      ): Array<{ role: string; content: string | DoubaoContentPart[] }> => {
        return msgs.map((msg) => {
          // 如果有附件，使用多模态格式
          if (msg.attachments && msg.attachments.length > 0) {
            const contentParts: DoubaoContentPart[] = [];

            // 先添加附件
            for (const attachment of msg.attachments) {
              if (attachment.type === 'image' && attachment.imageUrl) {
                contentParts.push({
                  type: 'input_image',
                  image_url: attachment.imageUrl,
                });
              } else if (attachment.type === 'file' && attachment.fileId) {
                contentParts.push({
                  type: 'input_file',
                  file_id: attachment.fileId,
                });
              }
            }

            // 再添加文本
            if (msg.content.trim()) {
              contentParts.push({
                type: 'input_text',
                text: msg.content,
              });
            }

            return {
              role: msg.role,
              content: contentParts,
            };
          }

          // 没有附件，使用纯文本格式
          return {
            role: msg.role,
            content: msg.content,
          };
        });
      };

      // 检查并等待所有文件附件就绪
      const fileAttachments = messages
        .flatMap((m) => m.attachments || [])
        .filter((a) => a.type === 'file' && a.fileId);

      if (fileAttachments.length > 0) {
        console.log(`[Chat API] 等待 ${fileAttachments.length} 个文件处理就绪...`);

        for (const attachment of fileAttachments) {
          if (attachment.fileId) {
            const isReady = await waitForFileReady(
              attachment.fileId,
              arkApiKey,
              arkBaseUrl,
              8000 // 最多等待 8 秒
            );

            if (!isReady) {
              console.warn(`[Chat API] 文件 ${attachment.fileId} 未在超时时间内就绪`);
              return new Response(
                JSON.stringify({ error: '文件正在处理中，请稍后重试。大文件需要更长的处理时间。' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        console.log('[Chat API] 所有文件已就绪');
      }

      // 将消息转换为 Responses API 格式
      const input = convertToDoubaoInput(messages);

      // 添加日志以调试
      const requestBody = {
        model: modelName,
        input: input,
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
      };

      console.log('Doubao Responses API 调用参数:', {
        model: modelName,
        messagesCount: messages.length,
        hasAttachments: messages.some((m) => m.attachments && m.attachments.length > 0),
        url: `${arkBaseUrl}/responses`,
      });

      const response = await fetch(`${arkBaseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${arkApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Doubao API 错误响应:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          requestUrl: `${arkBaseUrl}/responses`,
          requestBody: JSON.stringify(requestBody, null, 2),
        });

        // 解析并返回更友好的错误信息
        const friendlyError = parseDoubaoError(errorText);
        return new Response(JSON.stringify({ error: friendlyError }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!response.body) {
        return new Response(JSON.stringify({ error: 'No response body' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 转换豆包 Responses API 的 SSE 流为标准 SSE 文本增量事件
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
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
                const lines = block
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean);

                const dataLine = lines.find((line) => line.startsWith('data: '));
                if (!dataLine) {
                  continue;
                }

                try {
                  const jsonStr = dataLine.slice(6);

                  if (jsonStr === '[DONE]') {
                    hasSentDone = true;
                    controller.enqueue(encodeSseEvent({ type: 'done' }));
                    break;
                  }

                  const data = JSON.parse(jsonStr);

                  if (data.type === 'response.output_text.delta') {
                    const content = data.delta;
                    if (content) {
                      controller.enqueue(encodeSseEvent({ type: 'text-delta', text: content }));
                    }
                  } else if (data.type === 'response.done') {
                    hasSentDone = true;
                    const warning = getDoubaoIncompleteWarning(data);
                    if (warning) {
                      controller.enqueue(encodeSseEvent({ type: 'warning', warning }));
                    }
                    controller.enqueue(encodeSseEvent({ type: 'done' }));
                    break;
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) {
                    continue;
                  }
                  console.error('Failed to parse SSE data:', e);
                }
              }

              if (hasSentDone) {
                break;
              }
            }

            if (!hasSentDone) {
              controller.enqueue(encodeSseEvent({ type: 'done' }));
            }
            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        },
      });

      // 记录豆包请求成功并更新配额
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log('豆包 API 请求成功:', {
        userId,
        provider: 'doubao',
        model: modelName,
        messagesCount: messages.length,
        hasAttachments: messages.some((m) => m.attachments && m.attachments.length > 0),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      // 异步更新配额使用量
      quotaManager.incrementQuota(userId, 'requests', 1).catch((err) => {
        console.error('更新配额失败:', err);
      });

      return createSseResponse(stream);
    }

    // 其他 provider 使用 Vercel AI SDK
    const aiProvider = createProvider(provider);
    const result = streamText({
      model: aiProvider(modelName),
      messages,
    });

    // 记录成功请求并更新配额
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('Chat API 请求成功:', {
      userId,
      provider,
      model: modelName,
      messagesCount: messages.length,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });

    // 异步更新配额使用量
    quotaManager.incrementQuota(userId, 'requests', 1).catch((err) => {
      console.error('更新配额失败:', err);
    });

    const textResponse = result.toTextStreamResponse();
    if (!textResponse.body) {
      throw new Error('上游未返回流式响应体');
    }

    return createSseResponse(createSseStreamFromTextStream(textResponse.body));
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.error('Chat API 错误:', {
      errorId,
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // 认证错误
    if (error instanceof Error) {
      if (
        error.message === '缺少认证令牌' ||
        error.message.includes('jwt expired') ||
        error.message.includes('invalid signature') ||
        error.message.includes('jwt malformed')
      ) {
        return new Response(
          JSON.stringify({
            error: '请先登录',
            errorId,
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'X-Error-ID': errorId,
            },
          }
        );
      }

      // 配置错误
      if (error.message.includes('Missing') || error.message.includes('未设置')) {
        return new Response(
          JSON.stringify({
            error: '服务配置错误，请联系管理员',
            errorId,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'X-Error-ID': errorId,
            },
          }
        );
      }

      // 超时错误
      if (error.message.includes('timeout') || error.message.includes('超时')) {
        return new Response(
          JSON.stringify({
            error: '请求超时，请稍后重试',
            errorId,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 504,
            headers: {
              'Content-Type': 'application/json',
              'X-Error-ID': errorId,
            },
          }
        );
      }

      // 网络错误
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return new Response(
          JSON.stringify({
            error: '网络连接失败，请检查网络后重试',
            errorId,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 503,
            headers: {
              'Content-Type': 'application/json',
              'X-Error-ID': errorId,
            },
          }
        );
      }
    }

    // 未知错误
    return new Response(
      JSON.stringify({
        error: '服务暂时不可用，请稍后重试',
        errorId,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Error-ID': errorId,
        },
      }
    );
  }
}
