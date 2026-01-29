'use client';

import { useCallback, useState, useRef, useEffect } from 'react';

export type ProviderName = 'zhipu' | 'deepseek' | 'dashscope' | 'xunfei';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    isStreaming?: boolean;
}

export interface UseChatOptions {
    provider?: ProviderName;
    model?: string;
    initialMessages?: Message[];
    onError?: (error: Error) => void;
    onMessagesChange?: (messages: Message[]) => void;
}

export function useChat(options: UseChatOptions = {}) {
    const { provider = 'zhipu', model, initialMessages = [], onError, onMessagesChange } = options;

    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const [currentProvider, setCurrentProvider] = useState<ProviderName>(provider);
    const [currentModel, setCurrentModel] = useState<string | undefined>(model);

    const abortControllerRef = useRef<AbortController | null>(null);

    // 清理函数
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    // 当消息变化时通知外部（排除 streaming 状态的变化）
    const messagesRef = useRef(messages);
    const prevIsLoadingRef = useRef(isLoading);

    useEffect(() => {
        // 只在消息内容真正变化时调用（不包括 isStreaming 状态）
        const hasRealChange = messages.length !== messagesRef.current.length ||
            messages.some((m, i) => {
                const prev = messagesRef.current[i];
                return !prev || m.id !== prev.id || m.content !== prev.content;
            });

        // 当请求完成时（isLoading 从 true 变为 false），保存消息
        const justFinishedLoading = prevIsLoadingRef.current && !isLoading;

        if (onMessagesChange && !isLoading && (hasRealChange || justFinishedLoading) && messages.length > 0) {
            console.log('触发 onMessagesChange:', { messageCount: messages.length, justFinishedLoading });
            onMessagesChange(messages);
        }

        messagesRef.current = messages;
        prevIsLoadingRef.current = isLoading;
    }, [messages, onMessagesChange, isLoading]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    const handleSubmit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>, submitOptions?: { data?: { content?: string } }) => {
            e.preventDefault();
            const content = submitOptions?.data?.content || input;
            if (!content.trim() || isLoading) return;

            // 中断之前的请求
            abortControllerRef.current?.abort();
            abortControllerRef.current = new AbortController();

            const userMessage: Message = {
                id: `user-${Date.now()}`,
                role: 'user',
                content,
            };

            const assistantMessage: Message = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: '',
            };

            setMessages((prev) => [...prev, userMessage, assistantMessage]);
            setInput('');
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [...messages, userMessage].map((m) => ({
                            role: m.role,
                            content: m.content,
                        })),
                        provider: currentProvider,
                        model: currentModel,
                    }),
                    signal: abortControllerRef.current.signal,
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `请求失败: ${response.status}`);
                }

                if (!response.body) {
                    throw new Error('响应体为空');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let accumulatedContent = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });

                    // 确保 chunk 是字符串
                    if (typeof chunk === 'string') {
                        accumulatedContent += chunk;
                    } else {
                        console.warn('Received non-string chunk:', chunk);
                        accumulatedContent += String(chunk);
                    }

                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === assistantMessage.id ? { ...msg, content: accumulatedContent } : msg
                        )
                    );
                }
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    return;
                }
                const error = err instanceof Error ? err : new Error('未知错误');
                setError(error);
                onError?.(error);
                // 移除空的助手消息
                setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessage.id));
            } finally {
                setIsLoading(false);
            }
        },
        [input, isLoading, messages, currentProvider, currentModel, onError]
    );

    const switchProvider = useCallback((newProvider: ProviderName, newModel?: string) => {
        setCurrentProvider(newProvider);
        setCurrentModel(newModel);
    }, []);

    const append = useCallback(
        async (message: Message) => {
            setMessages((prev) => [...prev, message]);
        },
        []
    );

    const reload = useCallback(async (msgId?: string) => {
        if (isLoading) return;

        let history: Message[] = [];
        let content = '';

        if (msgId) {
            // 重新生成指定消息
            const index = messages.findIndex(m => m.id === msgId);
            if (index === -1 || messages[index].role !== 'user') return;
            history = messages.slice(0, index);
            content = messages[index].content;
        } else {
            // 默认行为：重新生成最后一次对话
            let index = messages.length - 1;
            while (index >= 0 && messages[index].role !== 'user') {
                index--;
            }

            if (index === -1) return;
            history = messages.slice(0, index);
            content = messages[index].content;
        }

        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content,
        };

        const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: '',
            isStreaming: true,
        };

        setMessages([...history, userMessage, assistantMessage]);
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...history, userMessage].map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                    provider: currentProvider,
                    model: currentModel,
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `请求失败: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('响应体为空');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                if (typeof chunk === 'string') {
                    accumulatedContent += chunk;
                } else {
                    accumulatedContent += String(chunk);
                }

                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === assistantMessage.id
                            ? { ...msg, content: accumulatedContent, isStreaming: true }
                            : msg
                    )
                );
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }
            const error = err instanceof Error ? err : new Error('未知错误');
            setError(error);
            onError?.(error);
            setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessage.id));
        } finally {
            setIsLoading(false);
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === assistantMessage.id ? { ...msg, isStreaming: false } : msg
                )
            );
        }
    }, [messages, isLoading, currentProvider, currentModel, onError]);

    const stop = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsLoading(false);
    }, []);

    return {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        isLoading,
        error,
        provider: currentProvider,
        model: currentModel,
        switchProvider,
        append,
        reload,
        stop,
        setMessages,
    };
}
