import { streamText } from 'ai';
import {
  createProvider,
  getDefaultModel,
  type ProviderName,
  createXunfeiStreamResponse,
  type XunfeiMessage,
} from '@repo/providers';

// 豆包消息格式转换
interface DoubaoMessage {
  role: 'user' | 'assistant' | 'system';
  content: Array<{ type: 'text'; text: string }>;
}

function convertToDoubaoMessages(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): DoubaoMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: [{ type: 'text', text: msg.content }],
  }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages,
      model,
      provider = 'xunfei',
    } = body as {
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
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
      const doubaoMessages = convertToDoubaoMessages(messages);

      // 直接使用 fetch 调用豆包 API
      const arkApiKey = process.env.ARK_API_KEY;
      const arkBaseUrl =
        process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v3';

      if (!arkApiKey) {
        return new Response(JSON.stringify({ error: 'Missing ARK_API_KEY' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 添加日志以调试
      const requestBody = {
        model: modelName,
        messages: doubaoMessages,
        stream: true,
        max_output_tokens: 2000,
        temperature: 0.7,
        top_p: 0.9,
      };

      console.log('Doubao API 调用参数:', {
        model: modelName,
        messagesCount: doubaoMessages.length,
        url: `${arkBaseUrl}/chat/completions`,
      });
      console.log('完整请求体:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${arkBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${arkApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Doubao API error:', errorText);
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

      // 转换豆包的 SSE 流为纯文本流
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
                if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

                if (trimmedLine.startsWith('data: ')) {
                  try {
                    const jsonStr = trimmedLine.slice(6);
                    const data = JSON.parse(jsonStr);

                    // 提取内容
                    if (data.choices && data.choices[0]?.delta?.content) {
                      const content = data.choices[0].delta.content;
                      controller.enqueue(encoder.encode(content));
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
