'use client';

import { useState, useEffect, useCallback } from 'react';

// 单条消息类型
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt?: number;
}

// 对话类型
export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    provider: string;
    model: string;
    createdAt: number;
    updatedAt: number;
}

// 按日期分组的对话
export interface ConversationGroup {
    title: string;
    items: Conversation[];
}

const STORAGE_KEY = 'ai-chat-conversations';

// 生成唯一 ID
function generateId(): string {
    return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 根据时间戳获取日期分组标题
function getDateGroup(timestamp: number): string {
    const now = new Date();
    const date = new Date(timestamp);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        // 检查是否是今天
        if (now.toDateString() === date.toDateString()) {
            return '今天';
        }
        return '昨天';
    } else if (diffDays === 1) {
        return '昨天';
    } else if (diffDays < 7) {
        return '最近7天';
    } else if (diffDays < 30) {
        return '最近30天';
    } else {
        return '更早';
    }
}

// 从消息中提取对话标题
function extractTitle(messages: ChatMessage[]): string {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
        const content = firstUserMessage.content.trim();
        // 截取前 30 个字符作为标题
        return content.length > 30 ? content.slice(0, 30) + '...' : content;
    }
    return '新对话';
}

export function useConversations() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // 从 localStorage 加载对话历史
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Conversation[];
                setConversations(parsed);
                // 默认选中最新的对话
                if (parsed.length > 0) {
                    setCurrentConversationId(parsed[0].id);
                }
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
        setIsLoaded(true);
    }, []);

    // 保存对话到 localStorage
    const saveToStorage = useCallback((convs: Conversation[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
        } catch (error) {
            console.error('Failed to save conversations:', error);
        }
    }, []);

    // 获取当前对话
    const currentConversation = conversations.find(c => c.id === currentConversationId) || null;

    // 创建新对话
    const createConversation = useCallback((provider: string = 'xunfei', model: string = 'lite'): string => {
        const newConv: Conversation = {
            id: generateId(),
            title: '新对话',
            messages: [],
            provider,
            model,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        setConversations(prev => {
            const updated = [newConv, ...prev];
            saveToStorage(updated);
            return updated;
        });
        setCurrentConversationId(newConv.id);

        return newConv.id;
    }, [saveToStorage]);

    // 切换对话
    const switchConversation = useCallback((id: string) => {
        setCurrentConversationId(id);
    }, []);

    // 更新对话消息
    const updateMessages = useCallback((id: string, messages: ChatMessage[]) => {
        setConversations(prev => {
            const updated = prev.map(conv => {
                if (conv.id === id) {
                    return {
                        ...conv,
                        messages,
                        title: extractTitle(messages) || conv.title,
                        updatedAt: Date.now(),
                    };
                }
                return conv;
            });
            // 不再按更新时间排序，保持创建顺序
            saveToStorage(updated);
            return updated;
        });
    }, [saveToStorage]);

    // 更新对话的 provider 和 model
    const updateConversationSettings = useCallback((id: string, provider: string, model: string) => {
        setConversations(prev => {
            const updated = prev.map(conv => {
                if (conv.id === id) {
                    return { ...conv, provider, model, updatedAt: Date.now() };
                }
                return conv;
            });
            saveToStorage(updated);
            return updated;
        });
    }, [saveToStorage]);

    // 删除对话
    const deleteConversation = useCallback((id: string) => {
        setConversations(prev => {
            const updated = prev.filter(conv => conv.id !== id);
            saveToStorage(updated);

            // 如果删除的是当前对话，切换到第一个
            if (id === currentConversationId) {
                setCurrentConversationId(updated.length > 0 ? updated[0].id : null);
            }

            return updated;
        });
    }, [currentConversationId, saveToStorage]);

    // 按日期分组对话
    const groupedConversations: ConversationGroup[] = conversations.reduce((groups, conv) => {
        const groupTitle = getDateGroup(conv.updatedAt);
        const existingGroup = groups.find(g => g.title === groupTitle);

        if (existingGroup) {
            existingGroup.items.push(conv);
        } else {
            groups.push({ title: groupTitle, items: [conv] });
        }

        return groups;
    }, [] as ConversationGroup[]);

    return {
        conversations,
        currentConversation,
        currentConversationId,
        groupedConversations,
        isLoaded,
        createConversation,
        switchConversation,
        updateMessages,
        updateConversationSettings,
        deleteConversation,
    };
}
