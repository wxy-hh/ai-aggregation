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

    const response = await fetch(XUNFEI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiPassword}`,
        },
        body: JSON.stringify({
            model: options.model || 'lite',
            messages: options.messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            stream: false,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Xunfei API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as XunfeiResponse;

    if (data.code !== 0) {
        throw new Error(`Xunfei API error: ${data.code} - ${data.message}`);
    }

    return {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
        } : undefined,
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

    const response = await fetch(XUNFEI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiPassword}`,
        },
        body: JSON.stringify({
            model: options.model || 'lite',
            messages: options.messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            stream: true,
        }),
    });

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

                try {
                    const data: XunfeiStreamResponse = JSON.parse(jsonStr);
                    if (data.code !== 0) {
                        throw new Error(`Xunfei stream error: ${data.code} - ${data.message}`);
                    }

                    const content = data.choices[0]?.delta?.content;

                    // 确保 content 是字符串类型
                    if (content && typeof content === 'string') {
                        yield content;
                    } else if (content) {
                        // 如果 content 不是字符串，尝试转换
                        console.warn('Received non-string content:', content);
                        yield String(content);
                    }
                } catch (parseError) {
                    // 忽略解析错误，继续处理下一行
                    console.warn('Failed to parse Xunfei stream chunk:', parseError);
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
                controller.error(error);
            }
        },
    });
}
