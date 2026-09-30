/**
 * 讯飞星火大模型 Provider
 * 由于讯飞的响应格式与标准 OpenAI 格式略有不同，需要自定义实现
 */

// 讯飞 API 响应格式
interface XunfeiResponse {
  code: number;
  message: string;
  sid: string;
  choices: Array<{
    message?: {
      role: string;
      content: string;
    };
    delta?: {
      role?: string;
      content?: string;
    };
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// 讯飞流式响应格式
interface XunfeiStreamResponse {
  code: number;
  message: string;
  sid: string;
  id: string;
  created: number;
  choices: Array<{
    delta: {
      role?: string;
      content?: string;
    };
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface XunfeiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface XunfeiChatOptions {
  model?: string;
  messages: XunfeiMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onUsage?: (usage: XunfeiChatResult['usage']) => void;
  signal?: AbortSignal;
}

export interface XunfeiChatResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const XUNFEI_API_URL = 'https://spark-api-open.xf-yun.com/v1/chat/completions';

/**
 * 讯飞星火非流式请求
 */
export async function xunfeiChat(options: XunfeiChatOptions): Promise<XunfeiChatResult> {
  const apiPassword = process.env.XUNFEI_API_PASSWORD;
  if (!apiPassword) {
    throw new Error('Missing XUNFEI_API_PASSWORD environment variable');
  }

  let response: Response;
  try {
    response = await fetch(XUNFEI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiPassword}`,
      },
      body: JSON.stringify({
        model: options.model || 'lite',
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: false,
      }),
      signal: options.signal,
    });
  } catch (error) {
    const err = error as Error & { cause?: unknown };
    const causeCode = (err.cause as { code?: string } | undefined)?.code;
    if (err.message?.includes('fetch failed') || causeCode === 'ECONNRESET') {
      throw new Error('连接讯飞星火服务失败，请检查网络连接或代理分流设置');
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xunfei API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as XunfeiResponse;

  if (data.code !== 0) {
    throw new Error(`Xunfei API error: ${data.code} - ${data.message}`);
  }

  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

/**
 * 讯飞星火流式请求 - 返回 AsyncIterable<string>
 */
export async function* xunfeiChatStream(options: XunfeiChatOptions): AsyncIterable<string> {
  const apiPassword = process.env.XUNFEI_API_PASSWORD;
  if (!apiPassword) {
    throw new Error('Missing XUNFEI_API_PASSWORD environment variable');
  }

  let response: Response;
  try {
    response = await fetch(XUNFEI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiPassword}`,
      },
      body: JSON.stringify({
        model: options.model || 'lite',
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: true,
      }),
      signal: options.signal,
    });
  } catch (error) {
    const err = error as Error & { cause?: unknown };
    const causeCode = (err.cause as { code?: string } | undefined)?.code;
    if (err.message?.includes('fetch failed') || causeCode === 'ECONNRESET') {
      throw new Error('连接讯飞星火服务失败，请检查网络连接或代理分流设置');
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xunfei API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

        const jsonStr = trimmedLine.slice(5).trim();
        if (jsonStr === '[DONE]') continue;

        let data: XunfeiStreamResponse;
        try {
          data = JSON.parse(jsonStr);
        } catch (parseError) {
          // 仅真正的 JSON 解析失败才跳过本行
          console.warn('[Xunfei] 解析流式分片失败:', parseError);
          continue;
        }

        // 业务错误帧（code !== 0：内容审核拒绝、鉴权失败、限流等）必须抛出，
        // 由下游适配器翻译为 SSE error 帧并走 partial/failed 结算，不得吞成静默截断
        if (data.code !== 0) {
          throw new Error(`讯飞服务返回错误（码 ${data.code}）：${data.message ?? '未知错误'}`);
        }

        if (data.usage) {
          options.onUsage?.({
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          });
        }

        const content = data.choices[0]?.delta?.content;

        // 确保 content 是字符串类型
        if (content && typeof content === 'string') {
          yield content;
        } else if (content) {
          // 如果 content 不是字符串，尝试转换
          console.warn('[Xunfei] 收到非字符串 content:', content);
          yield String(content);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 创建讯飞流式响应的 ReadableStream（用于 API 路由）
 */
export function createXunfeiStreamResponse(options: XunfeiChatOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of xunfeiChatStream(options)) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        // 向上游 SSE 包装层抛出可读错误，而不是静默 controller.error
        const message = error instanceof Error ? error.message : String(error);
        controller.error(new Error(message));
      }
    },
  });
}
