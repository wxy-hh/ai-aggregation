import { streamText } from 'ai';
import {
  createProvider,
  getDefaultModel,
  type ProviderName,
  createXunfeiStreamResponse,
  type XunfeiMessage,
} from '@repo/providers';

// 导入扩展的消息类型
interface MessageContent {
  type: 'input_text' | 'input_image' | 'input_file';
  text?: string;
  image_url?: string;
  file_id?: string;
}

interface ExtendedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MessageContent[];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages,
      model,
      provider = 'xunfei',
    } = body as {
      messages: ExtendedMessage[];
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

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
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

      // 将消息转换为豆包 Responses API 格式
      // 支持混合内容消息（文本 + 图片 + 文件）
      let input: string | Array<{ role: string; content: string | any[] }>;

      if (messages.length === 1 && messages[0].role === 'user') {
        const message = messages[0];

        // 检查是否为混合内容消息
        if (typeof message.content === 'string') {
          // 纯文本消息
          input = message.content;
        } else {
          // 混合内容消息，使用数组格式
          input = [
            {
              role: message.role,
              content: message.content, // 直接传递 MessageContent 数组
            },
          ];
        }
      } else {
        // 多条消息，使用数组格式
        input = messages.map((msg) => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : msg.content,
        }));
      }

      // 添加日志以调试
      const requestBody = {
        model: modelName,
        input: input,
        stream: true,
        max_output_tokens: 2000,
        temperature: 0.7,
        top_p: 0.9,
      };

      console.log('Doubao Responses API 调用参数:', {
        model: modelName,
        messagesCount: messages.length,
        inputType: typeof input === 'string' ? 'string' : 'array',
        url: `${arkBaseUrl}/responses`,
      });
      console.log('完整请求体:', JSON.stringify(requestBody, null, 2));

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
        return new Response(JSON.stringify({ error: `Doubao API error: ${response.status}` }), {
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

      // 转换豆包 Responses API 的 SSE 流为纯文本流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          try {
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                // Responses API 使用 event: 和 data: 格式
                if (trimmedLine.startsWith('data: ')) {
                  try {
                    const jsonStr = trimmedLine.slice(6);
                    const data = JSON.parse(jsonStr);

                    // 处理文本增量事件
                    if (data.type === 'response.output_text.delta') {
                      const content = data.delta;
                      if (content) {
                        controller.enqueue(encoder.encode(content));
                      }
                    }
                    // 处理完成事件
                    else if (data.type === 'response.done') {
                      // 流结束
                      break;
                    }
                  } catch (e) {
                    console.error('Failed to parse SSE data:', e);
                  }
                }
              }
            }

            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // 其他 provider 使用 Vercel AI SDK
    const aiProvider = createProvider(provider);
    const result = streamText({
      model: aiProvider(modelName),
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);

    if (error instanceof Error && error.message.includes('Missing')) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
