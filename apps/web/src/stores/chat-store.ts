'use client';

import { create } from 'zustand';
import { useConversationsStore } from './conversations-store';
import { useHistoryStore } from './history-store';
import { createChatHistoryItem } from '@/lib/utils/history-helpers';

// ==================== 类型定义 ====================

// AI 提供商类型：讯飞星火 或 豆包
export type ProviderName = 'xunfei' | 'doubao';

// 附件上传状态：上传中 | 就绪 | 错误
export type AttachmentStatus = 'uploading' | 'ready' | 'error';

// 附件类型定义
export interface Attachment {
  id: string; // 附件唯一标识
  type: 'image' | 'file'; // 附件类型：图片或文件
  name: string; // 文件名
  size?: number; // 文件大小（字节）
  // 图片附件：存储 base64 编码的数据 URL
  imageUrl?: string;
  // 文件附件：存储上传后服务器返回的文件 ID
  fileId?: string;
  // 当前上传状态
  status: AttachmentStatus;
  // 错误信息（仅在 status 为 'error' 时有值）
  error?: string;
}

// 消息类型定义
export interface Message {
  id: string; // 消息唯一标识
  role: 'user' | 'assistant' | 'system'; // 消息角色：用户 | AI助手 | 系统
  content: string; // 消息文本内容
  isStreaming?: boolean; // 是否正在流式传输（AI回复时为true）
  // 附件列表（可选）
  attachments?: Attachment[];
}

// 聊天状态管理接口
export interface ChatState {
  // ========== 状态数据 ==========
  messages: Message[]; // 当前对话的所有消息
  input: string; // 输入框的文本内容
  isLoading: boolean; // 是否正在等待AI回复
  error: Error | null; // 错误信息（如果有）
  provider: ProviderName; // 当前使用的AI提供商
  model: string | undefined; // 当前使用的模型名称
  activeConversationId: string | null; // 当前激活的对话ID
  attachment: Attachment | null; // 当前待发送的附件（单文件模式）

  // ========== 基础操作 ==========
  setInput: (value: string) => void; // 设置输入框内容
  setMessages: (messages: Message[]) => void; // 设置消息列表
  switchProvider: (provider: ProviderName, model?: string) => void; // 切换AI提供商和模型
  setAttachment: (attachment: Attachment | null) => void; // 设置附件

  // ========== 核心交互功能 ==========
  sendMessage: (content?: string) => Promise<void>; // 发送消息（支持流式响应）
  reload: (msgId?: string) => Promise<void>; // 重新生成AI回复
  stop: () => void; // 停止当前的AI生成

  // ========== 生命周期管理 ==========
  loadConversation: (id: string, messages: Message[], provider: string, model: string) => void; // 加载历史对话
  reset: () => void; // 重置聊天状态
}

// ==================== Store 实现 ====================

export const useChatStore = create<ChatState>((set, get) => {
  // AbortController 实例：用于取消正在进行的网络请求
  // 不作为响应式状态，避免触发不必要的重新渲染
  let abortController: AbortController | null = null;

  return {
    // ========== 初始状态 ==========
    messages: [], // 空消息列表
    input: '', // 空输入框
    isLoading: false, // 未加载
    error: null, // 无错误
    provider: 'xunfei', // 默认使用讯飞星火
    model: undefined, // 使用默认模型
    activeConversationId: null, // 无激活对话
    attachment: null, // 无附件

    // ========== 基础操作方法 ==========

    // 设置输入框内容
    setInput: (value) => set({ input: value }),

    // 设置消息列表
    setMessages: (messages) => set({ messages }),

    // 设置附件
    setAttachment: (attachment) => set({ attachment }),

    // 切换AI提供商和模型
    // 切换时会清空附件（因为不同提供商支持的附件类型可能不同）
    switchProvider: (provider, model) => set({ provider, model, attachment: null }),

    // 加载历史对话
    // 用于从对话列表切换到某个历史对话
    loadConversation: (id, messages, provider, model) => {
      // 停止之前的AI生成（如果有）
      if (abortController) {
        abortController.abort();
        abortController = null;
      }

      // 更新状态
      set({
        activeConversationId: id, // 设置当前对话ID
        messages, // 加载历史消息
        provider: provider as ProviderName, // 恢复之前使用的提供商
        model, // 恢复之前使用的模型
        input: '', // 清空输入框
        isLoading: false, // 重置加载状态
        error: null, // 清空错误
      });
    },

    // 重置聊天状态
    // 用于开始新对话
    reset: () => {
      // 停止之前的AI生成（如果有）
      if (abortController) {
        abortController.abort();
        abortController = null;
      }

      // 重置所有状态
      set({
        messages: [], // 清空消息
        input: '', // 清空输入框
        isLoading: false, // 重置加载状态
        error: null, // 清空错误
        activeConversationId: null, // 清空对话ID
        // 注意：provider 和 model 保持不变，保留用户的选择
      });
    },

    // 停止AI生成
    // 用于用户主动中断AI回复
    stop: () => {
      // 取消网络请求
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      // 更新加载状态
      set({ isLoading: false });
    },

    // 发送消息
    sendMessage: async (contentOverrides) => {
      const { input, messages, provider, model, isLoading, activeConversationId, attachment } =
        get();
      const content = contentOverrides || input;

      // 有附件时允许空文本，否则需要文本内容
      if ((!content.trim() && !attachment) || isLoading) return;

      // 附件只能在豆包 provider 下使用
      if (attachment && provider !== 'doubao') {
        set({ error: new Error('附件功能仅支持豆包模型') });
        return;
      }

      // 附件必须准备就绪
      if (attachment && attachment.status !== 'ready') {
        set({ error: new Error('附件尚未准备就绪') });
        return;
      }

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
        // 包含附件
        attachments: attachment ? [attachment] : undefined,
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
        // 清空附件
        attachment: null,
      });

      // 同步到历史记录
      if (activeConversationId) {
        useConversationsStore.getState().updateMessages(activeConversationId, newMessages);
      }

      try {
        // ===== 5. 发起流式请求 =====
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // 发送历史消息 + 新用户消息
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
              attachments: m.attachments,
            })),
            provider, // AI提供商
            model, // 模型名称
          }),
          signal: abortController.signal, // 支持取消请求
        });

        // 检查响应状态
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `请求失败: ${response.status}`);
        }

        // 检查响应体
        if (!response.body) throw new Error('响应体为空');

        // ===== 6. 处理流式响应 =====
        const reader = response.body.getReader(); // 获取流读取器
        const decoder = new TextDecoder(); // 用于解码二进制数据
        let accumulatedContent = ''; // 累积的AI回复内容

        // 循环读取流数据
        while (true) {
          const { done, value } = await reader.read();
          if (done) break; // 流结束

          // 解码当前数据块
          const chunk = decoder.decode(value, { stream: true });
          // 累加到总内容
          if (typeof chunk === 'string') {
            accumulatedContent += chunk;
          } else {
            accumulatedContent += String(chunk);
          }

          // ===== 7. 实时更新UI =====
          // 每次收到新数据就更新消息列表
          set((state) => {
            console.log(`state -->`, state);
            const updatedMessages = state.messages.map((msg) =>
              // 找到AI消息并更新其内容
              msg.id === assistantMessage.id ? { ...msg, content: accumulatedContent } : msg
            );
            return { messages: updatedMessages };
          });

          // 注意：频繁更新 localStorage 可能影响性能
          // 这里每次都更新，后续可以考虑节流优化
        }

        // ===== 8. 流式传输完成 =====
        set((state) => {
          // 移除 isStreaming 标记，表示AI回复完成
          const finalMessages = state.messages.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, isStreaming: false } : msg
          );

          // 同步到对话列表
          if (activeConversationId) {
            useConversationsStore.getState().updateMessages(activeConversationId, finalMessages);
          }

          // 保存到历史记录
          if (finalMessages.length >= 2 && activeConversationId) {
            // 至少有一轮对话才保存
            const historyItem = {
              id: activeConversationId, // 使用对话ID作为历史记录ID
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
        // ===== 9. 错误处理 =====
        // 用户主动取消不算错误
        if (err instanceof Error && err.name === 'AbortError') return;

        // 设置错误信息
        const error = err instanceof Error ? err : new Error('未知错误');
        set({ error });

        // 移除错误的AI消息（因为没有成功生成）
        set((state) => {
          const filteredMessages = state.messages.filter((msg) => msg.id !== assistantMessage.id);
          if (activeConversationId) {
            useConversationsStore.getState().updateMessages(activeConversationId, filteredMessages);
          }
          return { messages: filteredMessages };
        });
      } finally {
        // ===== 10. 清理工作 =====
        set({ isLoading: false }); // 重置加载状态
        abortController = null; // 清空 AbortController
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
