// 标记为客户端组件（Next.js 15 App Router 特性）
// 这意味着这个组件会在浏览器中运行，可以使用 React Hooks 和浏览器 API
'use client';

// ============ 导入外部组件 ============
import React from 'react';
import { AppLayout } from '@/components/layout/app-layout'; // 应用的整体布局组件（包含侧边栏、头部等）
import { MessageItem } from '@/components/chat/message-item'; // 单条聊天消息的展示组件
import { ChatInput } from '@/components/chat/chat-input'; // 聊天输入框组件（底部的输入区域）
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

// ============ 导入状态管理 Store ============
import {
  useConversationsStore, // 对话列表管理 Store（管理多个对话的创建、删除、切换）
  useChatStore, // 当前对话的消息管理 Store（管理当前对话的消息、发送、加载状态）
  type ProviderName, // AI 服务提供商类型（如 'xunfei'、'doubao'）
  type Message, // 消息类型定义
  type ChatMessage as ConvMessage, // 对话消息类型（别名为 ConvMessage）
} from '@/stores';

// ============ 导入 React Hooks ============
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
// useRef: 用于引用 DOM 元素或保存不触发重渲染的值
// useEffect: 用于处理副作用（如数据加载、订阅等）
// useCallback: 用于缓存函数，避免不必要的重新创建
// useState: 用于管理组件内部状态
// useMemo: 用于缓存计算结果，避免重复计算

// ============ 导入图标组件 ============
import {
  Plus, // 加号图标（新建对话按钮）
  Search, // 搜索图标（搜索历史对话）
  MessageSquare, // 消息方框图标（对话列表项）
  BarChart2, // 柱状图图标（页面标题）
  Trash2, // 垃圾桶图标（删除对话）
  Bot, // 机器人图标（欢迎页面）
  FileText, // 文件图标（功能卡片）
  Code2, // 代码图标（功能卡片）
  Lightbulb, // 灯泡图标（功能卡片）
  ShieldCheck, // 盾牌图标（功能说明）
  Globe, // 地球图标（功能说明）
  FileEdit, // 编辑图标（功能卡片）
  PanelLeft,
  SlidersHorizontal,
} from 'lucide-react';

// ============ 导入工具函数 ============
import { cn } from '@/lib/utils'; // 用于合并 CSS 类名的工具函数
import { useShallow } from 'zustand/react/shallow'; // Zustand 的浅比较 Hook，用于优化性能

// ============ 模型配置常量 ============
// 定义所有支持的 AI 模型及其配置信息
// Record<ProviderName, ...> 表示这是一个对象，键是 ProviderName 类型
const MODELS: Record<ProviderName, { name: string; models: { id: string; label: string }[] }> = {
  // 讯飞星火模型配置
  xunfei: {
    name: '讯飞星火', // 显示名称
    models: [
      { id: 'lite', label: 'Spark Lite (免费)' }, // 免费版本
      { id: 'generalv3.5', label: 'Spark Max' }, // 标准版本
      { id: '4.0Ultra', label: 'Spark 4.0 Ultra' }, // 高级版本
    ],
  },
  // 豆包模型配置
  doubao: {
    name: '豆包', // 显示名称
    models: [
      { id: 'doubao-seed-2-0-lite-260428', label: 'Doubao Lite (轻量级)' }, // 轻量级版本
      { id: 'doubao-seed-2-0-pro-260215', label: 'Doubao Pro (专业级)' }, // 专业级版本
    ],
  },
};

// ============ 聊天页面主组件 ============
// 这是整个聊天页面的核心组件，负责：
// 1. 管理对话列表（左侧边栏）
// 2. 显示当前对话的消息（中间区域）
// 3. 处理用户输入和发送消息（底部输入框）
// 4. 切换 AI 模型和对话
export default function ChatPage() {
  // ============ 组件内部状态 ============

  // 控制模型选择器的显示/隐藏状态
  // showModelSelector 为 true 时，显示模型下拉列表
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showConversationDrawer, setShowConversationDrawer] = useState(false);
  const [showMobileModelDrawer, setShowMobileModelDrawer] = useState(false);

  // 搜索框的输入内容
  // 用于过滤左侧的历史对话列表
  const [searchQuery, setSearchQuery] = useState('');

  // ============ Refs（引用） ============

  // 指向消息列表底部的 DOM 元素
  // 用于实现自动滚动到最新消息的功能
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 指向模型选择器的 DOM 元素
  // 用于检测点击外部区域时关闭下拉列表
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  // 标记页面是否已经初始化
  // 防止 useEffect 重复执行初始化逻辑
  const hasInitialized = useRef(false);

  // ============ 从 Conversations Store 获取状态和方法 ============
  // Conversations Store 负责管理所有对话的列表、创建、删除、切换等操作

  // 获取所有对话列表（数组）
  // 每个对话包含：id、标题、消息列表、创建时间等信息
  const conversations = useConversationsStore((state) => state.conversations);

  // 获取当前激活的对话 ID
  // 用于高亮显示左侧列表中的当前对话
  const currentConversationId = useConversationsStore((state) => state.currentConversationId);

  // 获取数据是否已从本地存储加载完成的标志
  // 在数据加载完成前，显示加载动画
  const isLoaded = useConversationsStore((state) => state.isLoaded);

  // 使用 useShallow 批量获取 Store 中的方法
  // useShallow 会进行浅比较，只有当这些方法引用变化时才重新渲染
  // 这样可以避免不必要的组件重渲染，提升性能
  const {
    createConversation, // 创建新对话的方法
    switchConversation, // 切换到指定对话的方法
    deleteConversation, // 删除指定对话的方法
    findEmptyConversation, // 查找空对话（没有消息的对话）的方法
    getGroupedConversations, // 获取按时间分组的对话列表（今天、昨天、更早等）
    getCurrentConversation, // 获取当前激活的对话对象
    updateConversationSettings, // 更新对话设置（如切换模型）的方法
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

  // ============ 从 Chat Store 获取状态和方法 ============
  // Chat Store 负责管理当前对话的消息、发送、加载状态等
  const {
    messages, // 当前对话的所有消息列表（数组）
    isLoading, // 是否正在等待 AI 回复（显示加载动画）
    error, // 错误信息对象（如果发生错误）
    provider, // 当前使用的 AI 服务提供商（如 'xunfei'、'doubao'）
    model, // 当前使用的具体模型 ID（如 'lite'、'generalv3.5'）
    activeConversationId, // Chat Store 中当前激活的对话 ID
    sendMessage, // 发送消息的方法（会调用 API 并更新消息列表）
    reload, // 重新生成最后一条 AI 回复的方法
    loadConversation, // 加载指定对话的消息到 Chat Store 的方法
    switchProvider, // 切换 AI 服务提供商和模型的方法
    reset, // 重置 Chat Store 状态的方法（清空消息等）
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

  // ============ 计算属性（派生状态） ============
  // 这些值是从 Store 中的数据计算得出的，不需要单独存储

  // 获取当前激活的对话对象（包含完整信息）
  const currentConversation = getCurrentConversation();

  // 获取按时间分组的对话列表
  // 返回格式：[{ title: '今天', items: [...] }, { title: '昨天', items: [...] }, ...]
  const groupedConversations = getGroupedConversations();

  // ============ URL 参数处理（页面初始化逻辑） ============
  // 这个 useEffect 在页面首次加载时执行，处理 URL 中的参数
  // 例如：/chat?new=true（创建新对话）或 /chat?historyId=xxx（加载历史对话）
  useEffect(() => {
    // 如果数据还没加载完成，或者已经初始化过了，就不执行
    if (!isLoaded || hasInitialized.current) return;

    // 标记为已初始化，防止重复执行
    hasInitialized.current = true;

    // 解析 URL 中的查询参数
    const urlParams = new URLSearchParams(window.location.search);

    // 检查是否是创建新对话的请求（URL 中有 ?new=true）
    const isNewConversation = urlParams.get('new') === 'true';

    // 检查是否是从历史记录页面跳转过来的（URL 中有 ?historyId=xxx）
    const historyId = urlParams.get('historyId');

    if (historyId) {
      // ============ 场景1：从历史记录加载对话 ============
      // 用户从历史记录页面点击某条聊天记录，跳转到这里
      console.log('[ChatPage] Loading from history:', historyId);

      // 动态导入 history-store（按需加载，减少初始包体积）
      import('@/stores/history-store').then(({ useHistoryStore }) => {
        // 从历史记录 Store 中查找指定 ID 的记录
        const historyItem = useHistoryStore.getState().getItemById(historyId);

        // 检查是否找到了对应的聊天历史记录
        if (historyItem && historyItem.type === 'chat') {
          console.log('[ChatPage] Found chat history item:', historyItem);

          // 将历史记录转换为聊天记录类型
          const chatItem = historyItem as import('@/types/history').ChatHistoryItem;

          // 获取历史记录中使用的 AI 提供商和模型（如果没有则使用默认值）
          const newProvider = (chatItem.provider || 'xunfei') as ProviderName;
          const newModel = chatItem.model || 'lite';

          // 创建一个新的对话（用于承载历史消息）
          const newConvId = createConversation(newProvider, newModel);

          // 将历史消息转换为当前系统的消息格式
          // 每条消息需要有唯一的 id、角色（user/assistant）和内容
          const historyMessages: Message[] = chatItem.messages.map((msg, index) => ({
            id: `${newConvId}-msg-${index}`, // 生成唯一 ID
            role: msg.role, // 'user' 或 'assistant'
            content: msg.content, // 消息内容
          }));

          // 将历史消息加载到 Chat Store 中
          loadConversation(newConvId, historyMessages, newProvider, newModel);

          // 记录已加载的对话 ID，防止重复加载
          loadedIdRef.current = newConvId;

          console.log('[ChatPage] Loaded history conversation:', newConvId);
        } else {
          // 如果没找到或类型不对，输出警告
          console.warn('[ChatPage] History item not found or not chat type:', historyId);
        }
      });

      // 清除 URL 中的参数，保持 URL 干净
      // 使用 replaceState 不会触发页面刷新
      window.history.replaceState({}, '', '/chat');
    } else if (isNewConversation) {
      // ============ 场景2：创建新对话 ============
      // 用户点击了"新建对话"按钮，URL 中有 ?new=true

      // 先查找是否已经有空对话（没有消息的对话）
      const emptyConversation = findEmptyConversation();

      if (emptyConversation) {
        // 如果有空对话，直接切换到它（避免创建太多空对话）
        switchConversation(emptyConversation.id);
      } else {
        // 如果没有空对话，创建一个新的
        createConversation();
      }

      // 清除 URL 参数
      window.history.replaceState({}, '', '/chat');
    } else if (!currentConversationId && conversations.length > 0) {
      // ============ 场景3：默认加载第一个对话 ============
      // 如果没有当前对话，但有历史对话列表，就加载第一个
      switchConversation(conversations[0].id);
    }
  }, [
    // 依赖项列表：当这些值变化时，useEffect 会重新执行
    isLoaded, // 数据加载状态
    conversations, // 对话列表
    currentConversationId, // 当前对话 ID
    createConversation, // 创建对话方法
    switchConversation, // 切换对话方法
    findEmptyConversation, // 查找空对话方法
    loadConversation, // 加载对话方法
  ]);

  // ============ 对话切换时加载消息 ============
  // 当用户切换到不同的对话时，需要将该对话的消息加载到 Chat Store 中

  // 使用 ref 记录当前已加载的对话 ID，防止重复加载
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 如果数据还没加载完成，不执行
    if (!isLoaded) return;

    // 如果当前没有选中任何对话
    if (!currentConversationId) {
      // 如果之前有加载过对话，需要重置 Chat Store
      if (loadedIdRef.current) {
        reset(); // 清空消息列表等状态
        loadedIdRef.current = null; // 清空已加载标记
      }
      return;
    }

    // 如果当前对话 ID 和已加载的 ID 不同，说明需要加载新对话
    if (currentConversationId !== loadedIdRef.current) {
      // 从对话列表中找到当前对话的完整信息
      const conv = conversations.find((c) => c.id === currentConversationId);

      if (conv) {
        // 将对话的消息加载到 Chat Store
        // 需要传入：对话 ID、消息列表、AI 提供商、模型
        loadConversation(conv.id, conv.messages as Message[], conv.provider, conv.model);

        // 更新已加载标记，防止重复加载
        loadedIdRef.current = currentConversationId;
      }
    }
    // 如果 ID 相同，说明已经加载过了，不需要重复加载
    // Chat Store 内部会处理消息的更新
  }, [
    currentConversationId, // 当前对话 ID 变化时触发
    conversations, // 对话列表变化时触发（可能有新消息）
    isLoaded, // 数据加载状态
    loadConversation, // 加载对话方法
    reset, // 重置方法
  ]);

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

  // ============ 自动滚动到最新消息 ============
  // 当有新消息或 AI 正在回复时，自动滚动到消息列表底部
  useEffect(() => {
    // scrollIntoView 会将元素滚动到可见区域
    // behavior: 'smooth' 表示平滑滚动（有动画效果）
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]); // 依赖项：消息列表变化或加载状态变化时触发

  // ============ 消息展示处理 ============
  // 为每条消息添加流式输出状态标记
  // 流式输出：AI 的回复是逐字显示的，而不是一次性显示完整内容
  const displayMessages: Message[] = messages.map((msg) => ({
    ...msg, // 保留消息的所有原有属性
    // 判断是否正在流式输出：
    // 1. 如果消息本身有 isStreaming 标记，使用它
    // 2. 否则，如果当前正在加载 && 是 AI 消息 && 是最后一条消息，则标记为流式输出
    isStreaming:
      msg.isStreaming ??
      (isLoading && msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id),
  }));

  // ============ 发送消息处理函数 ============
  // useCallback 用于缓存函数，避免每次渲染都创建新函数
  // 只有当依赖项变化时，才会创建新的函数实例
  const handleSend = useCallback(
    (content: string) => {
      // 检查是否有当前对话
      if (!currentConversationId) {
        // 如果没有当前对话，需要先创建一个新对话
        // 使用当前选中的 AI 提供商和模型
        const newId = createConversation(provider, model);

        // 立即加载这个新对话到 Chat Store
        // 传入空消息列表 []，因为是新对话
        loadConversation(newId, [], provider, model || 'lite'); // 确保 model 有默认值

        // 更新已加载标记，防止 useEffect 重复加载
        loadedIdRef.current = newId;

        // 发送用户输入的消息
        sendMessage(content);
      } else {
        // 如果已经有当前对话，直接发送消息
        sendMessage(content);
      }
    },
    // 依赖项列表：这些值变化时，函数会重新创建
    [currentConversationId, createConversation, provider, model, loadConversation, sendMessage]
  );

  // ============ 新建对话处理函数 ============
  // 用户点击"新建对话"按钮时调用
  const handleNewConversation = useCallback(() => {
    // 先查找是否已经有空对话（没有消息的对话）
    const emptyConversation = findEmptyConversation();

    if (emptyConversation) {
      // 如果有空对话，直接切换到它
      // 这样可以避免创建太多空对话，节省存储空间
      switchConversation(emptyConversation.id);
    } else {
      // 如果没有空对话，创建一个新的
      // 使用当前选中的 AI 提供商和模型
      createConversation(provider, model);
    }
  }, [findEmptyConversation, switchConversation, createConversation, provider, model]);

  // ============ 切换 AI 提供商和模型 ============
  // 用户在模型选择器中选择不同的模型时调用
  const handleSwitchProvider = useCallback(
    (newProvider: ProviderName, newModel: string) => {
      // 1. 更新 Chat Store 中的提供商和模型
      //    这会影响后续发送的消息使用哪个 AI 模型
      switchProvider(newProvider, newModel);

      // 2. 如果有当前对话，也要更新对话的设置
      //    这样下次加载这个对话时，会使用正确的模型
      if (currentConversationId) {
        updateConversationSettings(currentConversationId, newProvider, newModel);
      }
    },
    [switchProvider, currentConversationId, updateConversationSettings]
  );

  // ============ 搜索过滤逻辑 ============
  // useMemo 用于缓存计算结果，避免每次渲染都重新计算
  // 只有当 groupedConversations 或 searchQuery 变化时，才会重新计算
  const filteredGroups = useMemo(() => {
    // 如果搜索框为空，直接返回所有分组
    if (!searchQuery.trim()) return groupedConversations;

    // 将搜索关键词转为小写，实现不区分大小写的搜索
    const lowerQuery = searchQuery.toLowerCase();

    // 过滤逻辑：
    return (
      groupedConversations
        .map((group) => ({
          ...group, // 保留分组的其他属性（如 title）
          // 过滤每个分组中的对话项
          // 只保留标题包含搜索关键词的对话
          items: group.items.filter((item) => item.title.toLowerCase().includes(lowerQuery)),
        }))
        // 过滤掉没有对话项的分组
        // 例如："今天"分组中没有匹配的对话，就不显示这个分组
        .filter((group) => group.items.length > 0)
    );
  }, [groupedConversations, searchQuery]); // 依赖项：对话列表或搜索关键词变化时重新计算

  // ============ 当前模型显示名称 ============
  // 根据当前选中的 provider 和 model，获取要显示的模型名称

  // 1. 获取当前提供商的配置信息
  const currentModelConfig = MODELS[provider];

  // 2. 查找当前模型的显示标签
  //    如果找不到，依次尝试：当前 model ID -> 第一个模型的标签 -> '未知模型'
  const currentModelLabel =
    currentModelConfig?.models.find((m) => m.id === model)?.label || // 查找匹配的模型标签
    model || // 如果找不到，使用 model ID
    currentModelConfig?.models[0]?.label || // 如果还找不到，使用第一个模型的标签
    '未知模型'; // 最后的兜底值

  // 3. 获取当前对话的标题
  //    如果没有对话或对话没有标题，显示"新对话"
  const currentTitle = currentConversation?.title || '新对话';

  // ============ 空状态快捷入口 ============
  // 借首页的视觉语气，但保持聊天页自己的信息结构
  const quickActions = [
    {
      title: '写一封周报',
      description: '总结本周工作重点与计划',
      prompt: '帮我写一封周报，总结本周工作重点与计划',
      icon: FileEdit,
      iconClassName: 'bg-orange-100 text-orange-500 dark:bg-orange-900/30 dark:text-orange-300',
    },
    {
      title: '润色代码',
      description: '优化逻辑与代码风格',
      prompt: '请帮我润色以下代码，优化逻辑与代码风格：\n',
      icon: Code2,
      iconClassName: 'bg-blue-100 text-blue-500 dark:bg-blue-900/30 dark:text-blue-300',
    },
    {
      title: '总结长文',
      description: '快速提取文章核心观点',
      prompt: '请帮我总结这篇文章的核心观点：\n',
      icon: FileText,
      iconClassName: 'bg-violet-100 text-violet-500 dark:bg-violet-900/30 dark:text-violet-300',
    },
    {
      title: '图片创意建议',
      description: '为设计项目寻找灵感',
      prompt: '我需要一些图片设计的创意灵感，关于...',
      icon: Lightbulb,
      iconClassName: 'bg-emerald-100 text-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
  ] as const;

  const renderConversationList = (onSelect?: () => void) => (
    <>
      <button
        onClick={handleNewConversation}
        className="w-full bg-white dark:bg-blue-600 text-blue-600 dark:text-white border border-blue-100 dark:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-700 rounded-xl py-3 px-4 font-medium flex items-center justify-center gap-2 transition-all shadow-sm group hover:shadow-md"
      >
        <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
        新建对话
      </button>

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
                      onClick={() => {
                        switchConversation(item.id);
                        onSelect?.();
                      }}
                    >
                      <MessageSquare
                        className={cn(
                          'w-4 h-4 flex-shrink-0',
                          isActive ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-500'
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
    </>
  );

  const renderModelOptions = (onSelect?: () => void) =>
    (Object.entries(MODELS) as [ProviderName, (typeof MODELS)[ProviderName]][]).map(
      ([providerKey, config]) => (
        <div key={providerKey} className="px-2 py-1">
          <div className="text-xs text-slate-400 font-medium px-2 py-1">{config.name}</div>
          {config.models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                handleSwitchProvider(providerKey, m.id);
                setShowModelSelector(false);
                onSelect?.();
              }}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                provider === providerKey && model === m.id
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )
    );

  // ============ 加载状态显示 ============
  // 如果数据还没从本地存储加载完成，显示加载动画
  if (!isLoaded) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center w-full h-full">
          {/* 旋转的加载动画 */}
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex w-full h-full">
        {/* 聊天历史侧边栏 */}
        <aside className="hidden lg:flex w-[280px] flex-shrink-0 flex-col p-4 gap-4 border-r border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur-sm">
          {renderConversationList()}
        </aside>

        {/* 主聊天区域 */}
        <div className="flex-1 p-4 min-w-0 h-full">
          <div className="relative h-full overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.76))] shadow-[0_18px_40px_rgba(76,95,154,0.1)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(15,23,42,0.82))] dark:shadow-[0_20px_48px_rgba(0,0,0,0.24)]">
            <div className="pointer-events-none absolute inset-x-12 top-0 h-28 rounded-full bg-[radial-gradient(circle_at_top,rgba(125,145,255,0.18),transparent_72%)] dark:bg-[radial-gradient(circle_at_top,rgba(93,124,250,0.16),transparent_72%)]" />
            {/* 头部 */}
            <header className="z-20 flex-none border-b border-slate-200/70 bg-white/72 px-4 py-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/50 dark:border-slate-800/80 dark:bg-slate-900/70 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/75 bg-white/80 text-blue-600 shadow-[0_8px_20px_rgba(76,95,154,0.08)] dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-blue-300">
                    <BarChart2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50/80 px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                        智能对话
                      </span>
                      <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:inline">
                        当前会话
                      </span>
                    </div>
                    <h1 className="break-words font-heading text-sm font-bold leading-snug text-slate-900 dark:text-white sm:text-base">
                      {currentTitle}
                    </h1>
                    <div className="mt-1 hidden lg:flex lg:items-center lg:gap-2">
                      {/* 模型选择器 */}
                      <div className="relative" ref={modelSelectorRef}>
                        <button
                          onClick={() => setShowModelSelector(!showModelSelector)}
                          className="flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-xs text-slate-500 transition-colors hover:border-slate-200 hover:bg-white/80 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 dark:hover:text-slate-200"
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
                          <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-3xl border border-white/80 bg-white/90 py-2 shadow-[0_18px_40px_rgba(76,95,154,0.16)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 dark:border-slate-700/80 dark:bg-slate-900/92">
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
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    aria-label="打开会话列表"
                    onClick={() => setShowConversationDrawer(true)}
                    className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-slate-600 shadow-[0_8px_20px_rgba(76,95,154,0.08)] transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <PanelLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="打开模型选择"
                    onClick={() => setShowMobileModelDrawer(true)}
                    className="lg:hidden inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-medium text-slate-600 shadow-[0_8px_20px_rgba(76,95,154,0.08)] transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="max-w-[88px] truncate">{currentModelLabel}</span>
                  </button>
                </div>
              </div>
            </header>

            {/* 错误显示 */}
            {error && (
              <div className="mx-6 mt-4 rounded-2xl border border-red-200/80 bg-red-50/90 p-4 text-sm text-red-600 shadow-[0_8px_20px_rgba(229,67,80,0.08)] dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
                <strong>错误：</strong> {error.message}
              </div>
            )}

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-transparent">
              {displayMessages.length === 0 ? (
                <div className="relative z-0 flex h-full flex-col items-center justify-center px-4">
                  <div className="pointer-events-none absolute top-1/2 h-[320px] w-[min(88vw,640px)] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(93,124,250,0.1),transparent_72%)] blur-[96px] dark:bg-[radial-gradient(circle,rgba(93,124,250,0.16),transparent_72%)]" />

                  <div className="relative w-full max-w-3xl rounded-[32px] border border-white/75 bg-white/72 p-6 shadow-[0_20px_44px_rgba(76,95,154,0.1)] backdrop-blur-2xl dark:border-slate-700/70 dark:bg-slate-900/72 md:p-8">
                    <div className="mb-8 flex flex-col items-center text-center">
                      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#4969E9_0%,#7D91FF_100%)] text-white shadow-[0_16px_32px_rgba(93,124,250,0.24)]">
                        <Bot className="h-8 w-8" />
                      </div>
                      <div className="mb-3 inline-flex items-center rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-xs font-semibold text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                        智能对话助手
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {quickActions.map((action) => {
                        const ActionIcon = action.icon;

                        return (
                          <button
                            key={action.title}
                            onClick={() => handleSend(action.prompt)}
                            className="group flex items-start gap-4 rounded-[24px] border border-white/80 bg-white/84 p-4 text-left shadow-[0_10px_24px_rgba(76,95,154,0.06)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_32px_rgba(93,124,250,0.12)] dark:border-slate-700/80 dark:bg-slate-800/82 dark:hover:border-blue-500/30"
                          >
                            <div
                              className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                                action.iconClassName
                              )}
                            >
                              <ActionIcon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-300">
                                {action.title}
                              </div>
                              <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                {action.description}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3 pt-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/78 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/78 dark:text-slate-300">
                        <FileText className="h-3.5 w-3.5 text-blue-500" />
                        支持长文本分析
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/78 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/78 dark:text-slate-300">
                        <Globe className="h-3.5 w-3.5 text-blue-500" />
                        实时联网搜索
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/78 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/78 dark:text-slate-300">
                        <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                        企业级数据安全
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto flex flex-col pt-4 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] lg:pb-6">
                  {displayMessages.map((msg) => (
                    <MessageItem key={msg.id} message={msg} onRegenerate={reload} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* 输入区域 */}
            <div className="sticky bottom-0 z-10 flex-none bg-transparent pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:static lg:pb-2">
              <ChatInput onSend={handleSend} isLoading={isLoading} />
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showConversationDrawer} onOpenChange={setShowConversationDrawer}>
        <DialogContent className="inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none border-0 bg-white p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom dark:bg-slate-950 lg:hidden">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="text-left text-base font-semibold text-slate-900 dark:text-white">
              对话列表
            </DialogTitle>
            <DialogDescription className="mt-1 text-left text-sm text-slate-500 dark:text-slate-400">
              在移动端快速切换历史会话
            </DialogDescription>
          </div>
          <div className="max-h-[78vh] overflow-y-auto p-4 flex flex-col gap-4">
            {renderConversationList(() => setShowConversationDrawer(false))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showMobileModelDrawer} onOpenChange={setShowMobileModelDrawer}>
        <DialogContent className="inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none border-0 bg-white p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom dark:bg-slate-950 lg:hidden">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="text-left text-base font-semibold text-slate-900 dark:text-white">
              模型选择
            </DialogTitle>
            <DialogDescription className="mt-1 text-left text-sm text-slate-500 dark:text-slate-400">
              选择当前对话使用的模型与提供商
            </DialogDescription>
          </div>
          <div className="max-h-[78vh] overflow-y-auto px-4 py-4">
            {renderModelOptions(() => setShowMobileModelDrawer(false))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
