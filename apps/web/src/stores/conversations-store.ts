'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ==================== 类型定义 ====================

// 单条消息类型
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
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

// ==================== 工具函数 ====================

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
        return content.length > 30 ? content.slice(0, 30) + '...' : content;
    }
    return '新对话';
}

// ==================== Store 接口 ====================

interface ConversationsState {
    // 状态
    conversations: Conversation[];
    currentConversationId: string | null;
    isLoaded: boolean;

    // 计算属性 (通过 getter 函数实现)
    getCurrentConversation: () => Conversation | null;
    getGroupedConversations: () => ConversationGroup[];

    // Actions
    setIsLoaded: (loaded: boolean) => void;
    createConversation: (provider?: string, model?: string) => string;
    switchConversation: (id: string) => void;
    updateMessages: (id: string, messages: ChatMessage[]) => void;
    updateConversationSettings: (id: string, provider: string, model: string) => void;
    deleteConversation: (id: string) => void;

    // 新增：查找空对话
    findEmptyConversation: () => Conversation | undefined;
}

// ==================== Store 实现 ====================

export const useConversationsStore = create<ConversationsState>()(
    persist(
        (set, get) => ({
            // 初始状态
            conversations: [],
            currentConversationId: null,
            isLoaded: false,

            // 设置加载状态
            setIsLoaded: (loaded) => set({ isLoaded: loaded }),

            // 获取当前对话
            getCurrentConversation: () => {
                const { conversations, currentConversationId } = get();
                return conversations.find(c => c.id === currentConversationId) || null;
            },

            // 获取分组对话
            getGroupedConversations: () => {
                const { conversations } = get();
                return conversations.reduce((groups, conv) => {
                    const groupTitle = getDateGroup(conv.updatedAt);
                    const existingGroup = groups.find(g => g.title === groupTitle);

                    if (existingGroup) {
                        existingGroup.items.push(conv);
                    } else {
                        groups.push({ title: groupTitle, items: [conv] });
                    }

                    return groups;
                }, [] as ConversationGroup[]);
            },

            // 查找空对话
            findEmptyConversation: () => {
                const { conversations } = get();
                return conversations.find(c => c.messages.length === 0);
            },

            // 创建新对话
            createConversation: (provider = 'xunfei', model = 'lite') => {
                const newConv: Conversation = {
                    id: generateId(),
                    title: '新对话',
                    messages: [],
                    provider,
                    model,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };

                set(state => ({
                    conversations: [newConv, ...state.conversations],
                    currentConversationId: newConv.id,
                }));

                return newConv.id;
            },

            // 切换对话
            switchConversation: (id) => {
                set({ currentConversationId: id });
            },

            // 更新对话消息
            updateMessages: (id, messages) => {
                set(state => ({
                    conversations: state.conversations.map(conv => {
                        if (conv.id === id) {
                            return {
                                ...conv,
                                messages,
                                title: extractTitle(messages) || conv.title,
                                updatedAt: Date.now(),
                            };
                        }
                        return conv;
                    }),
                }));
            },

            // 更新对话设置
            updateConversationSettings: (id, provider, model) => {
                set(state => ({
                    conversations: state.conversations.map(conv => {
                        if (conv.id === id) {
                            return { ...conv, provider, model, updatedAt: Date.now() };
                        }
                        return conv;
                    }),
                }));
            },

            // 删除对话
            deleteConversation: (id) => {
                set(state => {
                    const updated = state.conversations.filter(conv => conv.id !== id);
                    const newCurrentId = id === state.currentConversationId
                        ? (updated.length > 0 ? updated[0].id : null)
                        : state.currentConversationId;

                    return {
                        conversations: updated,
                        currentConversationId: newCurrentId,
                    };
                });
            },
        }),
        {
            name: 'ai-chat-conversations', // 本地存储键名 (与原来保持一致)
            storage: createJSONStorage(() => localStorage),
            // 只持久化 conversations，不持久化 currentConversationId 和 isLoaded
            partialize: (state) => ({
                conversations: state.conversations,
            }),
            onRehydrateStorage: () => (state) => {
                // 数据恢复完成后，设置加载状态
                if (state) {
                    state.setIsLoaded(true);
                }
            },
        }
    )
);

import { useShallow } from 'zustand/react/shallow';

// 选择 conversations 列表
export const useConversations = () => useConversationsStore(state => state.conversations);

// 选择当前对话 ID
export const useCurrentConversationId = () => useConversationsStore(state => state.currentConversationId);

// 选择加载状态
export const useIsConversationsLoaded = () => useConversationsStore(state => state.isLoaded);

// 获取 actions (不会导致重新渲染)
export const useConversationsActions = () => useConversationsStore(
    useShallow((state) => ({
        createConversation: state.createConversation,
        switchConversation: state.switchConversation,
        updateMessages: state.updateMessages,
        updateConversationSettings: state.updateConversationSettings,
        deleteConversation: state.deleteConversation,
        findEmptyConversation: state.findEmptyConversation,
    }))
);
