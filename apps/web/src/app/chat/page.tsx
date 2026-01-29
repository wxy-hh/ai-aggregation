'use client';

import { AppLayout } from '@/components/layout/app-layout';
import { MessageItem, type Message } from '@/components/chat/message-item';
import { ChatInput } from '@/components/chat/chat-input';
import { useChat, type ProviderName, type Message as ChatMessage } from '@/hooks/use-chat';
import { useConversations, type ChatMessage as ConvMessage } from '@/hooks/use-conversations';
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Plus, Search, MessageSquare, BarChart2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  // 对话历史管理
  const {
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
  } = useConversations();

  // 获取当前对话的 provider 和 model
  const currentProvider = (currentConversation?.provider as ProviderName) || 'xunfei';
  const currentModel = currentConversation?.model || 'lite';

  // 消息变化时同步到对话历史
  const handleMessagesChange = useCallback(
    (msgs: ChatMessage[]) => {
      console.log('handleMessagesChange 被调用:', {
        currentConversationId,
        messagesCount: msgs.length,
        messages: msgs,
      });
      if (currentConversationId) {
        updateMessages(
          currentConversationId,
          msgs.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            createdAt: Date.now(),
          }))
        );
      }
    },
    [currentConversationId, updateMessages]
  );

  // 聊天 Hook
  const {
    messages,
    handleSubmit,
    isLoading,
    error,
    provider,
    model,
    switchProvider,
    reload,
    setMessages,
  } = useChat({
    provider: currentProvider,
    model: currentModel,
    initialMessages: currentConversation?.messages || [],
    onMessagesChange: handleMessagesChange,
  });

  // 当切换对话时，加载对应的消息
  // 使用 ref 存储最新的 conversations，避免闭包问题
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  // 用于标记是否正在创建新对话（避免竞态条件）
  const isCreatingConversationRef = useRef(false);

  useEffect(() => {
    // 如果正在创建新对话，跳过加载消息的逻辑
    if (isCreatingConversationRef.current) {
      console.log('正在创建新对话，跳过加载消息');
      isCreatingConversationRef.current = false;
      return;
    }

    if (!currentConversationId) {
      setMessages([]);
      return;
    }

    // 使用 ref 获取最新的 conversations
    const targetConversation = conversationsRef.current.find((c) => c.id === currentConversationId);

    console.log('切换对话:', {
      targetId: currentConversationId,
      found: !!targetConversation,
      messageCount: targetConversation?.messages?.length || 0,
    });

    if (targetConversation && targetConversation.messages.length > 0) {
      setMessages(
        targetConversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
      );
    } else {
      // 切换到空对话时清空消息
      setMessages([]);
    }
  }, [currentConversationId, setMessages]);

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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 转换消息格式
  const displayMessages: Message[] = messages.map((msg: any) => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    isStreaming:
      msg.isStreaming ??
      (isLoading && msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id),
  }));

  // 发送消息
  const handleSend = useCallback(
    (content: string) => {
      console.log('handleSend 被调用:', { content, currentConversationId });
      // 如果没有当前对话，先创建一个
      if (!currentConversationId) {
        console.log('没有当前对话，创建新对话');
        isCreatingConversationRef.current = true; // 标记正在创建
        createConversation(currentProvider, currentModel);
      }
      console.log('调用 handleSubmit');
      handleSubmit(new Event('submit') as unknown as React.FormEvent<HTMLFormElement>, {
        data: { content },
      });
    },
    [currentConversationId, createConversation, currentProvider, currentModel, handleSubmit]
  );

  // 新建对话
  const handleNewConversation = useCallback(() => {
    // 先检查是否已存在空对话（没有消息的对话）
    const emptyConversation = conversations.find((c) => c.messages.length === 0);

    if (emptyConversation) {
      // 如果已有空对话，直接切换到那个对话
      console.log('已有空对话，直接切换:', emptyConversation.id);
      setMessages([]);
      switchConversation(emptyConversation.id);
    } else {
      // 没有空对话，创建新对话
      console.log('新建对话');
      isCreatingConversationRef.current = true;
      setMessages([]);
      createConversation(currentProvider, currentModel);
    }
  }, [
    conversations,
    createConversation,
    currentProvider,
    currentModel,
    setMessages,
    switchConversation,
  ]);

  // 切换对话（用户点击历史记录）
  const handleSwitchConversation = useCallback(
    (id: string) => {
      console.log('切换到对话:', id);
      // 先查找目标对话的消息
      const targetConv = conversations.find((c) => c.id === id);
      if (targetConv && targetConv.messages.length > 0) {
        setMessages(
          targetConv.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          }))
        );
      } else {
        setMessages([]);
      }
      switchConversation(id);
    },
    [conversations, setMessages, switchConversation]
  );

  // 切换 Provider/Model
  const handleSwitchProvider = useCallback(
    (newProvider: ProviderName, newModel: string) => {
      switchProvider(newProvider, newModel);
      if (currentConversationId) {
        updateConversationSettings(currentConversationId, newProvider, newModel);
      }
    },
    [switchProvider, currentConversationId, updateConversationSettings]
  );

  // 根据搜索过滤对话
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedConversations;
    }
    const lowerQuery = searchQuery.toLowerCase();
    return groupedConversations
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.title.toLowerCase().includes(lowerQuery)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedConversations, searchQuery]);

  // 获取当前模型标签
  const currentModelConfig = MODELS[provider];
  const currentModelLabel =
    currentModelConfig?.models.find((m) => m.id === model)?.label ||
    model ||
    currentModelConfig?.models[0]?.label ||
    '未知模型';

  // 获取当前对话标题
  const currentTitle = currentConversation?.title || '新对话';

  // 等待数据加载
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
        {/* Chat History Sidebar */}
        <aside className="w-[280px] flex-shrink-0 flex flex-col p-4 gap-4 border-r border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur-sm">
          {/* New Chat Button */}
          <button
            onClick={handleNewConversation}
            className="w-full bg-white dark:bg-blue-600 text-blue-600 dark:text-white border border-blue-100 dark:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-700 rounded-xl py-3 px-4 font-medium flex items-center justify-center gap-2 transition-all shadow-sm group hover:shadow-md"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            新建对话
          </button>

          {/* History List */}
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
                          onClick={() => handleSwitchConversation(item.id)}
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
                          {/* Delete Button */}
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

          {/* Search */}
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

        {/* Main Chat Area Container */}
        <div className="flex-1 p-4 min-w-0 h-full">
          <div className="h-full flex flex-col bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 relative">
            {/* Header */}
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
                      {/* Model Selector */}
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

                        {/* Dropdown */}
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

                <div className="flex items-center gap-1">
                  <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                  </button>
                  <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </header>

            {/* Error Display */}
            {error && (
              <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                <strong>错误：</strong> {error.message}
              </div>
            )}

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-white dark:bg-slate-900">
              {displayMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
                  <p className="text-sm">开始一个新对话吧</p>
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

            {/* Input Area */}
            <div className="flex-none z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur pb-2">
              <ChatInput onSend={handleSend} isLoading={isLoading} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
