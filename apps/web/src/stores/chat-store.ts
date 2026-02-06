'use client';

import { create } from 'zustand';
import { useConversationsStore } from './conversations-store';
import { useHistoryStore } from './history-store';
import { createChatHistoryItem } from '@/lib/utils/history-helpers';

// ==================== 类型定义 ====================

export type ProviderName = 'zhipu' | 'deepseek' | 'dashscope' | 'xunfei';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
}

export interface ChatState {
  // 状态
  messages: Message[];
  input: string;
  isLoading: boolean;
  error: Error | null;
  provider: ProviderName;
  model: string | undefined;
  activeConversationId: string | null;

  // Actions
  setInput: (value: string) => void;
  setMessages: (messages: Message[]) => void;
  switchProvider: (provider: ProviderName, model?: string) => void;

  // 核心交互
  sendMessage: (content?: string) => Promise<void>;
  reload: (msgId?: string) => Promise<void>;
  stop: () => void;

  // 生命周期
  loadConversation: (id: string, messages: Message[], provider: string, model: string) => void;
  reset: () => void;
}

// ==================== Store 实现 ====================

export const useChatStore = create<ChatState>((set, get) => {
  // AbortController 实例，不作为响应式状态
  let abortController: AbortController | null = null;

  return {
    // 初始状态
    messages: [],
    input: '',
    isLoading: false,
    error: null,
    provider: 'zhipu',
    model: undefined,
    activeConversationId: null,

    // 设置输入
    setInput: (value) => set({ input: value }),

    // 设置消息
    setMessages: (messages) => set({ messages }),

    // 切换模型
    switchProvider: (provider, model) => set({ provider, model }),

    // 加载对话
    loadConversation: (id, messages, provider, model) => {
      // 停止之前的生成（如果有）
      if (abortController) {
        abortController.abort();
        abortController = null;
      }

      set({
        activeConversationId: id,
        messages,
        provider: provider as ProviderName,
        model,
        input: '',
        isLoading: false,
        error: null,
      });
    },

    // 重置
    reset: () => {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      set({
        messages: [],
        input: '',
        isLoading: false,
        error: null,
        activeConversationId: null,
        // provider/model 保持不变，或者重置为默认？通常保持用户选择
      });
    },

    // 停止生成
    stop: () => {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      set({ isLoading: false });
    },

    // 发送消息
    sendMessage: async (contentOverrides) => {
      const { input, messages, provider, model, isLoading, activeConversationId } = get();
      const content = contentOverrides || input;

      if (!content.trim() || isLoading) return;

      // 1. 中断之前的请求
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      // 2. 构造消息对象
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

      // 3. 更新 UI 状态
      const newMessages = [...messages, userMessage, assistantMessage];
      set({
        messages: newMessages,
        input: '',
        isLoading: true,
        error: null,
      });

      // 同步到历史记录
      if (activeConversationId) {
        useConversationsStore.getState().updateMessages(activeConversationId, newMessages);
      }

      try {
        // 4. 发起请求
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            provider,
            model,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `请求失败: ${response.status}`);
        }

        if (!response.body) throw new Error('响应体为空');

        // 5. 处理流
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

          // 更新状态
          set((state) => {
            const updatedMessages = state.messages.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: accumulatedContent } : msg
            );
            return { messages: updatedMessages };
          });

          // 流式更新历史记录 (可选：加上节流以提高性能，这里先实时更)
          /* 
                       注意：频繁更新 localStorage 可能会有性能问题。
                       conversations-store 是 zustand persist，内部可能是同步写入 localStorage。
                       如果消息很长，每几毫秒写一次 localStorage 可能不好。
                       但暂时先这样，后续优化。
                    */
        }

        // 完成后再次同步完整消息
        set((state) => {
          // 确保最后状态正确，并移除 isStreaming
          const finalMessages = state.messages.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, isStreaming: false } : msg
          );

          // 再次同步到 store
          if (activeConversationId) {
            useConversationsStore.getState().updateMessages(activeConversationId, finalMessages);
          }

          // 保存到历史记录
          if (finalMessages.length >= 2) {
            // 至少有一轮对话
            const historyItem = {
              id: `chat-${activeConversationId || Date.now()}`,
              ...createChatHistoryItem(
                finalMessages.map((m) => ({ role: m.role, content: m.content })),
                provider,
                model || 'unknown'
              ),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            useHistoryStore.getState().addItem(historyItem);
          }

          return { messages: finalMessages };
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;

        const error = err instanceof Error ? err : new Error('未知错误');
        set({ error });

        // 移除错误的助手消息
        set((state) => {
          const filteredMessages = state.messages.filter((msg) => msg.id !== assistantMessage.id);
          if (activeConversationId) {
            useConversationsStore.getState().updateMessages(activeConversationId, filteredMessages);
          }
          return { messages: filteredMessages };
        });
      } finally {
        set({ isLoading: false });
        abortController = null;
      }
    },

    // 重新生成
    reload: async (msgId) => {
      const { messages, isLoading, provider, model, activeConversationId } = get();
      if (isLoading) return;

      // 确定上下文和内容
      let history: Message[] = [];
      let content = '';

      if (msgId) {
        const index = messages.findIndex((m) => m.id === msgId);
        if (index === -1 || messages[index].role !== 'user') return;
        history = messages.slice(0, index);
        content = messages[index].content;
      } else {
        // 重新生成最后一次
        let index = messages.length - 1;
        while (index >= 0 && messages[index].role !== 'user') {
          index--;
        }
        if (index === -1) return;
        history = messages.slice(0, index);
        content = messages[index].content;
      }

      // 中断
      if (abortController) abortController.abort();
      abortController = new AbortController();

      // 构造新消息
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

      const newMessages = [...history, userMessage, assistantMessage];

      set({
        messages: newMessages,
        isLoading: true,
        error: null,
      });

      if (activeConversationId) {
        useConversationsStore.getState().updateMessages(activeConversationId, newMessages);
      }

      try {
        // ... 重复 fetch 逻辑 ...
        // 为了减少代码重复，可以将 fetch 逻辑抽离，但这里直接写吧
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...history, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            provider,
            model,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `请求失败: ${response.status}`);
        }

        if (!response.body) throw new Error('响应体为空');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulatedContent += typeof chunk === 'string' ? chunk : String(chunk);

          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: accumulatedContent } : msg
            ),
          }));
        }

        // 完成
        set((state) => {
          const finalMessages = state.messages.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, isStreaming: false } : msg
          );
          if (activeConversationId) {
            useConversationsStore.getState().updateMessages(activeConversationId, finalMessages);
          }
          return { messages: finalMessages };
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        set({ error: err instanceof Error ? err : new Error('未知错误') });
        // revert
        set((state) => {
          const filtered = state.messages.filter((msg) => msg.id !== assistantMessage.id);
          if (activeConversationId) {
            useConversationsStore.getState().updateMessages(activeConversationId, filtered);
          }
          return { messages: filtered };
        });
      } finally {
        set({ isLoading: false });
        abortController = null;
      }
    },
  };
});
