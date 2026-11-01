'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createQuotaFallbackStorage } from '@/lib/storage/quota-fallback-storage';
import type { SelectedModel, ComparisonTurn } from '@/types/comparison';
import type { Message } from '@/types/chat-message';
import type { Artifact } from '@repo/shared';

// ==================== 类型定义 ====================

// 单条消息类型：本地快照使用完整运行时消息字段，不再裁剪
export type ChatMessage = Message;

// 对话类型
export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    provider: string;
    model: string;
    createdAt: number;
    updatedAt: number;
    // 比较会话扩展（单聊时缺省，向后兼容旧数据）
    mode?: 'single' | 'compare'; // 会话模式
    selectedModels?: SelectedModel[]; // 比较模式已选模型
    turns?: ComparisonTurn[]; // 比较模式：会话→轮次→模型分支
    // P0b 场景能力包与会话级工具覆盖（ADR-0014）
    capabilityPack?: string;
    toolOverrides?: Record<string, boolean>;
    // P1 会话级产物集合池（ADR-0015）
    artifacts?: Artifact[];
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

/** 会话指针、模式与双模式记忆的原子补丁 */
export interface SessionStatePatch {
    currentConversationId?: string | null;
    mode?: 'single' | 'compare';
    lastActiveSingleId?: string | null;
    lastActiveCompareId?: string | null;
}

interface ConversationsState {
    // 状态
    conversations: Conversation[];
    currentConversationId: string | null;
    isLoaded: boolean;
    mode: 'single' | 'compare'; // 当前活动的全局模式权威
    lastActiveSingleId: string | null; // 单聊模式最近活跃的会话 ID
    lastActiveCompareId: string | null; // 对比模式最近活跃的会话 ID

    // 计算属性 (通过 getter 函数实现)
    getCurrentConversation: () => Conversation | null;
    getGroupedConversations: () => ConversationGroup[];

    // 原子操作：跨 store 编排由 conversation-orchestrator 负责
    setIsLoaded: (loaded: boolean) => void;
    setSessionState: (patch: SessionStatePatch) => void;
    createConversation: (provider?: string, model?: string, capabilityPack?: string) => string;
    updateMessages: (id: string, messages: ChatMessage[], artifacts?: Artifact[]) => void;
    updateConversationSettings: (id: string, provider: string, model: string) => void;
    updateConversationCapabilityPack: (id: string, capabilityPack?: string | null) => void;
    updateConversationToolOverrides: (id: string, toolOverrides?: Record<string, boolean>) => void;

    // 比较会话：创建与更新轮次分支
    createComparisonConversation: (selectedModels: SelectedModel[], firstPromptTitle?: string) => string;
    updateComparisonTurns: (id: string, turns: ComparisonTurn[]) => void;
    // 比较会话：同步已选模型（取消/新增模型后持久化，避免刷新后回退）
    updateComparisonSelectedModels: (id: string, selectedModels: SelectedModel[]) => void;

    // 查找空对话
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
            mode: 'single',
            lastActiveSingleId: null,
            lastActiveCompareId: null,

            // 设置加载状态
            setIsLoaded: (loaded) => set({ isLoaded: loaded }),

            // 原子更新会话指针、模式与双模式记忆
            setSessionState: (patch) => set(patch),

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

            // 查找未被定制的空白对话（无消息、无能力包绑定且无工具覆盖）
            findEmptyConversation: () => {
                const { conversations } = get();
                return conversations.find(
                    c =>
                        c.messages.length === 0 &&
                        c.mode !== 'compare' &&
                        !c.capabilityPack &&
                        (!c.toolOverrides || Object.keys(c.toolOverrides).length === 0)
                );
            },

            // 创建新对话（支持可选能力包参数）
            createConversation: (provider = 'xunfei', model = 'lite', capabilityPack) => {
                const newConv: Conversation = {
                    id: generateId(),
                    title: '新对话',
                    messages: [],
                    provider,
                    model,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    mode: 'single',
                    ...(capabilityPack ? { capabilityPack } : {}),
                };

                set(state => ({
                    conversations: [newConv, ...state.conversations],
                    currentConversationId: newConv.id,
                    mode: 'single',
                    lastActiveSingleId: newConv.id,
                }));

                return newConv.id;
            },

            // 更新会话的能力包绑定
            updateConversationCapabilityPack: (id, capabilityPack) => {
                set(state => ({
                    conversations: state.conversations.map(conv =>
                        conv.id === id
                            ? {
                                  ...conv,
                                  capabilityPack: capabilityPack || undefined,
                                  updatedAt: Date.now(),
                              }
                            : conv
                    ),
                }));
            },

            // 更新会话的工具覆盖字典（ADR-0014 / 工单 02）
            updateConversationToolOverrides: (id, toolOverrides) => {
                set(state => ({
                    conversations: state.conversations.map(conv =>
                        conv.id === id
                            ? {
                                  ...conv,
                                  toolOverrides: toolOverrides ? { ...toolOverrides } : undefined,
                                  updatedAt: Date.now(),
                              }
                            : conv
                    ),
                }));
            },

            // 创建比较会话（并行对比模式）
            // messages 保持为空数组，实际分支数据放在 turns 中
            createComparisonConversation: (selectedModels, firstPromptTitle) => {
                const title = firstPromptTitle
                    ? (firstPromptTitle.length > 30 ? firstPromptTitle.slice(0, 30) + '...' : firstPromptTitle)
                    : '比较对话';

                const newConv: Conversation = {
                    id: generateId(),
                    title,
                    messages: [],
                    provider: 'compare',
                    model: 'multi',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    mode: 'compare',
                    selectedModels,
                    turns: [],
                };

                set(state => ({
                    conversations: [newConv, ...state.conversations],
                    currentConversationId: newConv.id,
                    mode: 'compare',
                    lastActiveCompareId: newConv.id,
                }));

                return newConv.id;
            },

            // 更新比较会话的轮次分支（由 comparison-store 同步调用）
            updateComparisonTurns: (id, turns) => {
                set(state => ({
                    conversations: state.conversations.map(conv => {
                        if (conv.id === id) {
                            const firstPrompt = turns[0]?.prompt;
                            const title = firstPrompt
                                ? (firstPrompt.length > 30 ? firstPrompt.slice(0, 30) + '...' : firstPrompt)
                                : conv.title;
                            return { ...conv, turns, title, updatedAt: Date.now() };
                        }
                        return conv;
                    }),
                }));
            },

            // 同步比较会话的已选模型（由 comparison-store.toggleModel 调用）
            updateComparisonSelectedModels: (id, selectedModels) => {
                set(state => ({
                    conversations: state.conversations.map(conv =>
                        conv.id === id ? { ...conv, selectedModels, updatedAt: Date.now() } : conv
                    ),
                }));
            },

            // 更新对话消息与产物（ADR-0015）
            updateMessages: (id, messages, artifacts) => {
                set(state => ({
                    conversations: state.conversations.map(conv => {
                        if (conv.id === id) {
                            return {
                                ...conv,
                                messages,
                                ...(artifacts !== undefined ? { artifacts } : {}),
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

        }),
        {
            name: 'ai-chat-conversations', // 本地存储键名
            // 超配额时淘汰最旧产物版本后重试，保证会话列表整体写入不失败（ADR-0037）
            storage: createJSONStorage(() => createQuotaFallbackStorage(localStorage)),
            // 持久化会话列表、全局活动模式、当前会话指针及双模式记忆
            partialize: (state) => ({
                conversations: state.conversations,
                mode: state.mode,
                currentConversationId: state.currentConversationId,
                lastActiveSingleId: state.lastActiveSingleId,
                lastActiveCompareId: state.lastActiveCompareId,
            }),
            onRehydrateStorage: () => (state) => {
                // 水合只标记加载完成；刷新恢复规则由 conversationOrchestrator.initialize 统一执行，
                // 避免水合回调与页面初始化各走一套恢复路径
                state?.setIsLoaded(true);
            },
        }
    )
);

import { useShallow } from 'zustand/react/shallow';

// 选择会话列表
export const useConversations = () => useConversationsStore(state => state.conversations);

// 选择当前对话 ID
export const useCurrentConversationId = () => useConversationsStore(state => state.currentConversationId);

// 选择全局对话模式
export const useConversationMode = () => useConversationsStore(state => state.mode);

// 选择加载状态
export const useIsConversationsLoaded = () => useConversationsStore(state => state.isLoaded);

// 获取操作方法集合（浅比较，避免不必要的重新渲染）
/**
 * 会话 store 的原子操作集合。
 *
 * 跨 store 的编排动作（切换、模式流转、新建、外部唤起、删除）不在本 hook 中，
 * 统一由 conversationOrchestrator 提供。
 */
export const useConversationsActions = () => useConversationsStore(
    useShallow((state) => ({
        createConversation: state.createConversation,
        updateMessages: state.updateMessages,
        updateConversationSettings: state.updateConversationSettings,
        findEmptyConversation: state.findEmptyConversation,
        getCurrentConversation: state.getCurrentConversation,
        getGroupedConversations: state.getGroupedConversations,
    }))
);
