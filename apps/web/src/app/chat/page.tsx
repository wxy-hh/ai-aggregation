'use client';

import { AppLayout } from '@/components/layout/app-layout'; // 应用布局组件
import { MessageItem } from '@/components/chat/message-item'; // 消息项组件
import { ChatInput } from '@/components/chat/chat-input'; // 聊天输入组件
import {
  useConversationsStore,
  useChatStore,
  type ProviderName,
  type Message,
  type ChatMessage as ConvMessage,
} from '@/stores';
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  BarChart2,
  Trash2,
  Sparkles,
  FileText,
  Code2,
  Lightbulb,
  ShieldCheck,
  Globe,
  FileEdit,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

// 模型配置
const MODELS: Record<ProviderName, { name: string; models: { id: string; label: string }[] }> = {
  xunfei: {
    name: '讯飞星火',
    models: [
      { id: 'lite', label: 'Spark Lite (免费)' },
      { id: 'generalv3.5', label: 'Spark Max' },
      { id: '4.0Ultra', label: 'Spark 4.0 Ultra' },
    ],
  },
  zhipu: {
    name: '智谱 AI',
    models: [
      { id: 'glm-4-flash', label: 'GLM-4 Flash (免费)' },
      { id: 'glm-4', label: 'GLM-4' },
      { id: 'glm-4-plus', label: 'GLM-4 Plus' },
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-coder', label: 'DeepSeek Coder' },
    ],
  },
  dashscope: {
    name: '通义千问',
    models: [
      { id: 'qwen-turbo', label: 'Qwen Turbo' },
      { id: 'qwen-plus', label: 'Qwen Plus' },
      { id: 'qwen-max', label: 'Qwen Max' },
    ],
  },
};

export default function ChatPage() {
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Conversations Store
  const conversations = useConversationsStore((state) => state.conversations);
  const currentConversationId = useConversationsStore((state) => state.currentConversationId);
  const isLoaded = useConversationsStore((state) => state.isLoaded);

  const {
    createConversation,
    switchConversation,
    deleteConversation,
    findEmptyConversation,
    getGroupedConversations,
    getCurrentConversation,
    updateConversationSettings,
  } = useConversationsStore(
    useShallow((state) => ({
      createConversation: state.createConversation,
      switchConversation: state.switchConversation,
      deleteConversation: state.deleteConversation,
      findEmptyConversation: state.findEmptyConversation,
      getGroupedConversations: state.getGroupedConversations,
      getCurrentConversation: state.getCurrentConversation,
      updateConversationSettings: state.updateConversationSettings,
    }))
  );

  // Chat Store
  const {
    messages,
    isLoading,
    error,
    provider,
    model,
    activeConversationId,
    sendMessage,
    reload,
    loadConversation,
    switchProvider,
    reset,
  } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
      isLoading: state.isLoading,
      error: state.error,
      provider: state.provider,
      model: state.model,
      activeConversationId: state.activeConversationId,
      sendMessage: state.sendMessage,
      reload: state.reload,
      loadConversation: state.loadConversation,
      switchProvider: state.switchProvider,
      reset: state.reset,
    }))
  );

  // 计算属性
  const currentConversation = getCurrentConversation();
  const groupedConversations = getGroupedConversations();

  // URL 参数处理
  useEffect(() => {
    if (!isLoaded || hasInitialized.current) return;
    hasInitialized.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const isNewConversation = urlParams.get('new') === 'true';
    const historyId = urlParams.get('historyId');

    if (historyId) {
      // 从统一历史记录加载对话
      console.log('[ChatPage] Loading from history:', historyId);

      // 动态导入 history-store 以获取历史记录
      import('@/stores/history-store').then(({ useHistoryStore }) => {
        const historyItem = useHistoryStore.getState().getItemById(historyId);

        if (historyItem && historyItem.type === 'chat') {
          console.log('[ChatPage] Found chat history item:', historyItem);

          // 创建新对话并加载历史消息
          const chatItem = historyItem as import('@/types/history').ChatHistoryItem;
          const newProvider = (chatItem.provider || 'xunfei') as ProviderName;
          const newModel = chatItem.model || 'lite';

          // 创建新对话
          const newConvId = createConversation(newProvider, newModel);

          // 将历史消息转换为对话消息格式
          const historyMessages: Message[] = chatItem.messages.map((msg, index) => ({
            id: `${newConvId}-msg-${index}`,
            role: msg.role,
            content: msg.content,
          }));

          // 加载对话
          loadConversation(newConvId, historyMessages, newProvider, newModel);
          loadedIdRef.current = newConvId;

          console.log('[ChatPage] Loaded history conversation:', newConvId);
        } else {
          console.warn('[ChatPage] History item not found or not chat type:', historyId);
        }
      });

      // 清除 URL 参数
      window.history.replaceState({}, '', '/chat');
    } else if (isNewConversation) {
      const emptyConversation = findEmptyConversation();
      if (emptyConversation) {
        switchConversation(emptyConversation.id);
      } else {
        createConversation();
      }
      window.history.replaceState({}, '', '/chat');
    } else if (!currentConversationId && conversations.length > 0) {
      switchConversation(conversations[0].id);
    }
  }, [
    isLoaded,
    conversations,
    currentConversationId,
    createConversation,
    switchConversation,
    findEmptyConversation,
    loadConversation,
  ]);

  // 对话 ID 变化时，加载消息到 Chat Store
  // 使用 ref 来防止重复加载
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 如果 ID 没变，或者是空（表示清空了），或者还没从 storage 加载完
    if (!isLoaded) return;

    if (!currentConversationId) {
      if (loadedIdRef.current) {
        reset();
        loadedIdRef.current = null;
      }
      return;
    }

    if (currentConversationId !== loadedIdRef.current) {
      const conv = conversations.find((c) => c.id === currentConversationId);
      if (conv) {
        // 加载新对话
        // 映射消息类型：ConvMessage -> Message (role 兼容)
        loadConversation(conv.id, conv.messages as Message[], conv.provider, conv.model);
        loadedIdRef.current = currentConversationId;
      }
    } else {
      // ID 相同，也要检查 provider/model 及其它变更?
      // 主要逻辑在 chat-store 内部处理，不需要每次都 load
    }
  }, [currentConversationId, conversations, isLoaded, loadConversation, reset]);

  // 点击外部关闭模型选择器
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(event.target as Node)) {
        setShowModelSelector(false);
      }
    }

    if (showModelSelector) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showModelSelector]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]); // 消息增加或正在加载时滚动

  // 消息展示处理
  const displayMessages: Message[] = messages.map((msg) => ({
    ...msg,
    // 如果正在加载，且是最后一条 assistant 消息，则视为 streaming（其实 store 里已经有 isStreaming 标记了，这里可以简化）
    isStreaming:
      msg.isStreaming ??
      (isLoading && msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id),
  }));

  // 发送消息处理
  const handleSend = useCallback(
    (content: string) => {
      if (!currentConversationId) {
        // 创建新对话
        const newId = createConversation(provider, model); // 使用当前 UI 选中的 model（如果有）
        // 立即加载并发送
        loadConversation(newId, [], provider, model || 'lite'); // 确保有默认值
        loadedIdRef.current = newId; // 更新 ref 防止 effect 重复加载
        sendMessage(content);
      } else {
        sendMessage(content);
      }
    },
    [currentConversationId, createConversation, provider, model, loadConversation, sendMessage]
  );

  // 新建对话
  const handleNewConversation = useCallback(() => {
    const emptyConversation = findEmptyConversation();
    if (emptyConversation) {
      switchConversation(emptyConversation.id);
    } else {
      createConversation(provider, model);
    }
  }, [findEmptyConversation, switchConversation, createConversation, provider, model]);

  // 切换 Provider
  const handleSwitchProvider = useCallback(
    (newProvider: ProviderName, newModel: string) => {
      switchProvider(newProvider, newModel);
      if (currentConversationId) {
        updateConversationSettings(currentConversationId, newProvider, newModel);
      }
    },
    [switchProvider, currentConversationId, updateConversationSettings]
  );

  // 搜索过滤
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedConversations;
    const lowerQuery = searchQuery.toLowerCase();
    return groupedConversations
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.title.toLowerCase().includes(lowerQuery)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedConversations, searchQuery]);

  // 当前模型显示
  const currentModelConfig = MODELS[provider];
  const currentModelLabel =
    currentModelConfig?.models.find((m) => m.id === model)?.label ||
    model ||
    currentModelConfig?.models[0]?.label ||
    '未知模型';

  const currentTitle = currentConversation?.title || '新对话';

  if (!isLoaded) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center w-full h-full">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex w-full h-full">
        {/* 聊天历史侧边栏 */}
        <aside className="w-[280px] flex-shrink-0 flex flex-col p-4 gap-4 border-r border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur-sm">
          {/* 新建聊天按钮 */}
          <button
            onClick={handleNewConversation}
            className="w-full bg-white dark:bg-blue-600 text-blue-600 dark:text-white border border-blue-100 dark:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-700 rounded-xl py-3 px-4 font-medium flex items-center justify-center gap-2 transition-all shadow-sm group hover:shadow-md"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            新建对话
          </button>

          {/* 历史列表 */}
          <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-6 custom-scrollbar">
            {filteredGroups.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">
                {searchQuery ? '未找到匹配的对话' : '暂无对话记录'}
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.title}>
                  <div className="text-xs font-medium text-slate-400 mb-3 px-2">{group.title}</div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = item.id === currentConversationId;
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-3 group cursor-pointer',
                            isActive
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm font-medium border border-slate-100 dark:border-slate-700'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                          )}
                          onClick={() => switchConversation(item.id)}
                        >
                          <MessageSquare
                            className={cn(
                              'w-4 h-4 flex-shrink-0',
                              isActive
                                ? 'text-blue-500'
                                : 'text-slate-400 group-hover:text-slate-500'
                            )}
                          />
                          <span className="truncate flex-1">{item.title}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConversation(item.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-slate-400 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 搜索框 */}
          <div className="relative mt-auto pt-4 border-t border-slate-200 dark:border-slate-800">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 mt-4" />
            <input
              type="text"
              placeholder="搜索历史..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border-none rounded-xl py-2.5 pl-9 pr-4 text-sm text-slate-600 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 shadow-sm mt-4"
            />
          </div>
        </aside>

        {/* 主聊天区域 */}
        <div className="flex-1 p-4 min-w-0 h-full">
          <div className="h-full flex flex-col bg-gradient-to-br from-[#eff6ff] to-white dark:from-slate-900 dark:to-slate-950 shadow-sm rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 relative">
            {/* 头部 */}
            <header className="flex-none px-6 py-4 border-b border-slate-50 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 z-20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                    <BarChart2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-base font-bold text-slate-900 dark:text-white">
                      {currentTitle}
                    </h1>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* 模型选择器 */}
                      <div className="relative" ref={modelSelectorRef}>
                        <button
                          onClick={() => setShowModelSelector(!showModelSelector)}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors py-0.5 px-1.5 -ml-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <svg
                            className="w-3.5 h-3.5 text-blue-500"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                          </svg>
                          <span>{currentModelLabel}</span>
                          <svg
                            className={`w-3 h-3 text-slate-400 transition-transform ${showModelSelector ? 'rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>

                        {/* 下拉列表 */}
                        {showModelSelector && (
                          <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                            {(
                              Object.entries(MODELS) as [
                                ProviderName,
                                (typeof MODELS)[ProviderName],
                              ][]
                            ).map(([providerKey, config]) => (
                              <div key={providerKey} className="px-2 py-1">
                                <div className="text-xs text-slate-400 font-medium px-2 py-1">
                                  {config.name}
                                </div>
                                {config.models.map((m) => (
                                  <button
                                    key={m.id}
                                    onClick={() => {
                                      handleSwitchProvider(providerKey, m.id);
                                      setShowModelSelector(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                      provider === providerKey && model === m.id
                                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                    }`}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 头部操作区 */}
                <div className="flex items-center gap-1">{/* 可扩展更多操作 */}</div>
              </div>
            </header>

            {/* 错误显示 */}
            {error && (
              <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                <strong>错误：</strong> {error.message}
              </div>
            )}

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-transparent">
              {displayMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-4 relative z-0">
                  {/* Ambient Background Glow */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-[100px] -z-10 pointer-events-none" />

                  <div className="max-w-3xl w-full bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2rem] p-8 md:p-12 border border-white/60 dark:border-slate-700/60 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.05)]">
                    {/* Logo & Greeting */}
                    <div className="flex flex-col items-center text-center mb-10">
                      <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20 mb-6 rotate-3 hover:rotate-6 transition-transform">
                        <Sparkles className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3">
                        你好，我是您的智能助手
                      </h2>
                      <p className="text-slate-500 dark:text-slate-400 max-w-lg">
                        我可以协助您完成写作、编程、分析等任务，让工作更高效。
                      </p>
                    </div>

                    {/* Capability Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-10">
                      <button
                        onClick={() => handleSend('帮我写一封周报，总结本周工作重点与计划')}
                        className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md transition-all group text-left"
                      >
                        <div className="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                          <FileEdit className="w-6 h-6 text-orange-500" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            写一封周报
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            总结本周工作重点与计划
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleSend('请帮我润色以下代码，优化逻辑与代码风格：\n')}
                        className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md transition-all group text-left"
                      >
                        <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                          <Code2 className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            润色代码
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            优化逻辑与代码风格
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleSend('请帮我总结这篇文章的核心观点：\n')}
                        className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md transition-all group text-left"
                      >
                        <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                          <FileText className="w-6 h-6 text-purple-500" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            总结长文
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            快速提取文章核心观点
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleSend('我需要一些图片设计的创意灵感，关于...')}
                        className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md transition-all group text-left"
                      >
                        <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                          <Lightbulb className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            图片创意建议
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            为设计项目寻找灵感
                          </div>
                        </div>
                      </button>
                    </div>

                    {/* Features Footer */}
                    <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 pt-6 border-t border-slate-200/50 dark:border-white/5">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                          <FileText className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        </div>
                        支持长文本分析
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                          <Globe className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        </div>
                        实时联网搜索
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                          <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        </div>
                        企业级数据安全
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto flex flex-col pt-4">
                  {displayMessages.map((msg) => (
                    <MessageItem key={msg.id} message={msg} onRegenerate={reload} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* 输入区域 */}
            <div className="flex-none z-10 bg-transparent pb-2">
              <ChatInput onSend={handleSend} isLoading={isLoading} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
