'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { emit, StoreEvents } from './store-events';
import type { SelectedModel, ComparisonTurn } from '@/types/comparison';

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
    // 比较会话扩展（单聊时缺省，向后兼容旧数据）
    mode?: 'single' | 'compare'; // 会话模式
    selectedModels?: SelectedModel[]; // 比较模式已选模型
    turns?: ComparisonTurn[]; // 比较模式：会话→轮次→模型分支
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

import { useChatStore } from './chat-store';
import { useComparisonStore } from './comparison-store';

// ==================== Store 接口 ====================

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

    // 操作方法
    setIsLoaded: (loaded: boolean) => void;
    createConversation: (provider?: string, model?: string) => string;
    switchConversation: (id: string) => void;
    updateMessages: (id: string, messages: ChatMessage[]) => void;
    updateConversationSettings: (id: string, provider: string, model: string) => void;
    deleteConversation: (id: string, _isSyncDelete?: boolean) => void;

    // 比较会话：创建与更新轮次分支
    createComparisonConversation: (selectedModels: SelectedModel[], firstPromptTitle?: string) => string;
    updateComparisonTurns: (id: string, turns: ComparisonTurn[]) => void;
    // 比较会话：同步已选模型（取消/新增模型后持久化，避免刷新后回退）
    updateComparisonSelectedModels: (id: string, selectedModels: SelectedModel[]) => void;

    // 新增：查找空对话
    findEmptyConversation: () => Conversation | undefined;

    // 编排中枢动作（候选 05：会话与模式原子联动）
    switchMode: (targetMode: 'single' | 'compare') => void;
    startNewSession: (mode?: 'single' | 'compare') => void;
    openComparisonSession: (id: string) => void;
    openHistorySession: (historyItem: import('@/types/history').ChatHistoryItem) => void;
    prepareRelaySession: () => void;
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
                return conversations.find(c => c.messages.length === 0 && c.mode !== 'compare');
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
                    mode: 'single',
                };

                set(state => ({
                    conversations: [newConv, ...state.conversations],
                    currentConversationId: newConv.id,
                    mode: 'single',
                    lastActiveSingleId: newConv.id,
                }));

                return newConv.id;
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

            // 切换对话（原子驱动模式流转、数据加载与交叉流中止）
            switchConversation: (id) => {
                const conv = get().conversations.find((c) => c.id === id);
                if (!conv) return;
                const isCompare = conv.mode === 'compare';

                if (isCompare) {
                    try { useChatStore.getState().stop(); } catch {}
                    set({
                        currentConversationId: id,
                        mode: 'compare',
                        lastActiveCompareId: id,
                    });
                    try { useComparisonStore.getState().loadComparison(id); } catch {}
                } else {
                    try {
                        const comp = useComparisonStore.getState();
                        if (comp) {
                            comp.selectedModels.forEach(m => comp.stopModel(`${m.provider}:${m.model}`));
                        }
                    } catch {}
                    set({
                        currentConversationId: id,
                        mode: 'single',
                        lastActiveSingleId: id,
                    });
                    try {
                        useChatStore.getState().loadConversation(conv.id, conv.messages as any, conv.provider as any, conv.model);
                    } catch {}
                }
            },

            // 模式切换状态机（M-1 策略：双模式记忆流转，消灭幽灵态）
            switchMode: (targetMode) => {
                const current = get();
                if (current.mode === targetMode) return;

                const updates: Partial<ConversationsState> = { mode: targetMode };
                if (current.mode === 'single' && current.currentConversationId) {
                    updates.lastActiveSingleId = current.currentConversationId;
                } else if (current.mode === 'compare' && current.currentConversationId) {
                    updates.lastActiveCompareId = current.currentConversationId;
                }

                if (targetMode === 'compare') {
                    const targetId = updates.lastActiveCompareId ?? current.lastActiveCompareId;
                    const targetConv = targetId ? current.conversations.find((c) => c.id === targetId && c.mode === 'compare') : null;

                    if (targetConv) {
                        set({ ...updates, currentConversationId: targetConv.id });
                        try { useComparisonStore.getState().loadComparison(targetConv.id); } catch {}
                    } else {
                        set({ ...updates, currentConversationId: null });
                        try { useComparisonStore.getState().startNewComparison(); } catch {}
                    }
                } else {
                    const targetId = updates.lastActiveSingleId ?? current.lastActiveSingleId;
                    const targetConv = targetId ? current.conversations.find((c) => c.id === targetId && c.mode !== 'compare') : null;

                    if (targetConv) {
                        set({ ...updates, currentConversationId: targetConv.id });
                        try {
                            useChatStore.getState().loadConversation(targetConv.id, targetConv.messages as any, targetConv.provider as any, targetConv.model);
                        } catch {}
                    } else {
                        const emptyConv = current.findEmptyConversation();
                        if (emptyConv && emptyConv.mode !== 'compare') {
                            set({ ...updates, currentConversationId: emptyConv.id });
                            try {
                                useChatStore.getState().loadConversation(emptyConv.id, [], emptyConv.provider as any, emptyConv.model);
                            } catch {}
                        } else {
                            set(updates);
                            const currentChat = useChatStore.getState();
                            const userProvider = currentChat?.provider || 'xunfei';
                            const userModel = currentChat?.model || 'lite';
                            const newId = get().createConversation(userProvider, userModel);
                            try {
                                useChatStore.getState().loadConversation(newId, [], userProvider, userModel);
                            } catch {}
                        }
                    }
                }
            },

            // 统一新建会话入口
            startNewSession: (targetMode) => {
                const mode = targetMode ?? get().mode;
                if (mode === 'compare') {
                    set({ mode: 'compare', currentConversationId: null });
                    try { useComparisonStore.getState().startNewComparison(); } catch {}
                } else {
                    set({ mode: 'single' });
                    const emptyConv = get().findEmptyConversation();
                    if (emptyConv && emptyConv.mode !== 'compare') {
                        get().switchConversation(emptyConv.id);
                    } else {
                        const currentChat = useChatStore.getState();
                        const userProvider = currentChat?.provider || 'xunfei';
                        const userModel = currentChat?.model || 'lite';
                        const newId = get().createConversation(userProvider, userModel);
                        try {
                            useChatStore.getState().loadConversation(newId, [], userProvider, userModel);
                        } catch {}
                    }
                }
            },

            // 外部唤起对比会话（E-1 契约）
            openComparisonSession: (id) => {
                get().switchConversation(id);
            },

            // 外部从历史记录唤起单聊会话（E-1 契约）
            openHistorySession: (historyItem) => {
                const provider = (historyItem.provider || 'xunfei') as any;
                const model = historyItem.model || 'lite';
                const newId = get().createConversation(provider, model);
                const historyMessages = (historyItem.messages || []).map((msg, index) => ({
                    id: `${newId}-msg-${index}`,
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                }));
                set({
                    mode: 'single',
                    currentConversationId: newId,
                    lastActiveSingleId: newId,
                });
                get().updateMessages(newId, historyMessages as any);
                try {
                    useChatStore.getState().loadConversation(newId, historyMessages as any, provider, model);
                } catch {}
            },

            // 外部跨模态接力到达对话时的就绪保证（E-1 契约）
            prepareRelaySession: () => {
                const current = get();
                if (current.mode === 'compare') {
                    get().switchMode('single');
                }
                const updated = get();
                const currentConv = updated.getCurrentConversation();
                if (!currentConv || currentConv.mode === 'compare') {
                    get().startNewSession('single');
                }
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

            // 删除对话（联动清理失效的模式记忆指针并安全重载运行时，消灭删除孤岛）
            deleteConversation: (id, _isSyncDelete = false) => {
                const { conversations, currentConversationId, mode } = get();
                const isDeletingCurrent = id === currentConversationId;
                const updated = conversations.filter(conv => conv.id !== id);

                const updates: Partial<ConversationsState> = {
                    conversations: updated,
                };
                if (id === get().lastActiveSingleId) updates.lastActiveSingleId = null;
                if (id === get().lastActiveCompareId) updates.lastActiveCompareId = null;

                // 若 comparison-store 当前指向已删会话，同步重置运行时
                try {
                    const comp = useComparisonStore.getState();
                    if (comp.activeComparisonId === id) {
                        comp.startNewComparison();
                    }
                } catch {}

                if (isDeletingCurrent) {
                    // 按当前全局模式挑选同模式的候选会话
                    const sameModeCandidates = updated.filter(c =>
                        mode === 'compare' ? c.mode === 'compare' : c.mode !== 'compare'
                    );

                    if (sameModeCandidates.length > 0) {
                        const nextId = sameModeCandidates[0].id;
                        set({ ...updates, currentConversationId: nextId });
                        get().switchConversation(nextId);
                    } else {
                        // 该模式下已无会话，执行安全新建/重置草稿
                        set({ ...updates, currentConversationId: null });
                        get().startNewSession(mode);
                    }
                } else {
                    set(updates);
                }

                // 通过事件总线同步删除 history-store（避免循环依赖）
                if (!_isSyncDelete) {
                    emit(StoreEvents.CONVERSATION_DELETED, { id });
                }
            },
        }),
        {
            name: 'ai-chat-conversations', // 本地存储键名
            storage: createJSONStorage(() => localStorage),
            // 持久化会话列表、全局活动模式、当前会话指针及双模式记忆
            partialize: (state) => ({
                conversations: state.conversations,
                mode: state.mode,
                currentConversationId: state.currentConversationId,
                lastActiveSingleId: state.lastActiveSingleId,
                lastActiveCompareId: state.lastActiveCompareId,
            }),
            onRehydrateStorage: () => (state) => {
                // 数据恢复完成后，设置加载状态并联动恢复对应运行时的状态（消灭刷新数据覆盖）
                if (state) {
                    state.setIsLoaded(true);
                    const { mode, currentConversationId, conversations } = state;
                    if (currentConversationId) {
                        const conv = conversations.find(c => c.id === currentConversationId);
                        if (conv) {
                            if (mode === 'compare' && conv.mode === 'compare') {
                                try {
                                    useComparisonStore.getState().loadComparison(conv.id);
                                } catch {}
                            } else if (mode === 'single' && conv.mode !== 'compare') {
                                try {
                                    useChatStore.getState().loadConversation(
                                        conv.id,
                                        conv.messages as any,
                                        conv.provider as any,
                                        conv.model
                                    );
                                } catch {}
                            }
                        }
                    }
                }
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
export const useConversationsActions = () => useConversationsStore(
    useShallow((state) => ({
        createConversation: state.createConversation,
        switchConversation: state.switchConversation,
        switchMode: state.switchMode,
        startNewSession: state.startNewSession,
        openComparisonSession: state.openComparisonSession,
        openHistorySession: state.openHistorySession,
        prepareRelaySession: state.prepareRelaySession,
        updateMessages: state.updateMessages,
        updateConversationSettings: state.updateConversationSettings,
        deleteConversation: state.deleteConversation,
        findEmptyConversation: state.findEmptyConversation,
        getCurrentConversation: state.getCurrentConversation,
        getGroupedConversations: state.getGroupedConversations,
    }))
);
