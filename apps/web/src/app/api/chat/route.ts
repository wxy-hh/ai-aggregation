import { streamText } from 'ai';
import {
    createProvider,
    getDefaultModel,
    type ProviderName,
    createXunfeiStreamResponse,
    type XunfeiMessage
} from '@repo/providers';

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

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return new Response(JSON.stringify({ error: 'Messages are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const modelName = model || getDefaultModel(provider);

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

        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
}
