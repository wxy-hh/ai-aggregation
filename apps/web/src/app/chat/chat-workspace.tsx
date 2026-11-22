// 标记为客户端组件（Next.js 15 App Router 特性）
// 这意味着这个组件会在浏览器中运行，可以使用 React Hooks 和浏览器 API
'use client';

// ============ 导入外部组件 ============
import React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { AuthGuard } from '@/components/auth/auth-guard'; // 应用的整体布局组件（包含侧边栏、头部等）
import { MessageItem } from '@/components/chat/message-item'; // 单条聊天消息的展示组件
import { ChatInput } from '@/components/chat/chat-input'; // 聊天输入框组件（底部的输入区域）
import { ArtifactWorkspace } from '@/components/chat/artifacts/artifact-workspace'; // P1 交付物独立工作台（ADR-0015）
import { ArtifactWorkspaceDock } from '@/components/chat/artifacts/artifact-workspace-dock'; // 桌面端工作台容器（可拖拽调宽）
import { ComparisonView } from '@/components/chat/comparison/comparison-view'; // 并行对比视图（多模型）
import { ModelSelector } from '@/components/chat/comparison/model-selector'; // 多模型选择器（对比模式）
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
// 跨模态接力：目标侧接收（引用条 + 预填 + 派生）
import { ReferenceBar } from '@/components/relay/reference-bar';
import { ReferenceSourcePreview } from '@/components/relay/reference-source-preview';
import { useRelayReceive } from '@/components/relay/use-relay-receive';
import { RELAY_COPY } from '@/lib/relay/copy';
import { isNearBottom } from '@/lib/utils/scroll';
import { useSettingsStore } from '@/stores/settings-store';
import { CAPABILITY_PACKS, type CitationAnchor } from '@repo/shared';
import { DocumentPreviewDrawer } from '@/app/knowledge/_components/document-preview-drawer';
import { collectDocumentAnchors } from '@/lib/chat/citation-anchors';
import type { MatchedCitationAnchor } from '@/types/citation';

// ============ 导入状态管理 Store ============
// 直接路径导入，避免桶文件把无关状态库打进代码块
import {
  useConversationsStore, // 会话列表与当前指针 Store
  useConversationsActions, // 会话 store 的原子操作方法
  type ChatMessage as ConvMessage, // 对话消息类型（别名为 ConvMessage）
} from '@/stores/conversations-store';
// 跨 store 的会话编排动作（切换、模式流转、新建、外部唤起、删除）统一由编排模块提供
import { conversationOrchestrator } from '@/stores/conversation-orchestrator';
import {
  useChatStore, // 当前单聊消息管理 Store（管理当前单聊的消息、发送与流式状态）
  type ProviderName, // AI 服务提供商类型（如 'xunfei'、'doubao'）
} from '@/stores/chat-store';

// 对比模式类型（'single' | 'compare'）
import type { ComparisonMode } from '@/types/comparison';

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
  Lightbulb, // 灯泡图标（功能卡片）
  ShieldCheck, // 盾牌图标（功能说明）
  Globe, // 地球图标（功能说明）
  FileEdit, // 编辑图标（功能卡片）
  PanelLeft,
  SlidersHorizontal,
  GitCompareArrows, // 对比图标（并行对比会话标识）
  Sparkles,
  Wrench,
  BookOpen,
  ArrowLeft,
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
      { id: 'doubao-seed-evolving', label: 'Doubao-Seed-Evolving' }, // 最新版本
      { id: 'doubao-seed-2-0-pro-260215', label: 'Doubao Pro (专业级)' }, // 专业级版本
    ],
  },
  // DeepSeek 模型配置
  deepseek: {
    name: 'DeepSeek', // 显示名称
    models: [
      { id: 'deepseek-flash', label: 'DeepSeek Flash' }, // 官方高性价比模型
    ],
  },
};

// ============ 对话模式分段控制器 ============
// 在「单聊 / 并行对比」之间切换；遵循 DESIGN.md 玻璃拟态与科技蓝强调色
// 采用物理常驻滑动胶囊与对称弹性布局，彻底杜绝 Framer Motion layoutId 在响应式 display:none 容器下的幽灵失真与白字白底空白 Bug
export function ModeSegmentedControl({
  mode,
  onChange,
  id,
}: {
  mode: ComparisonMode;
  onChange: (mode: ComparisonMode) => void;
  id?: string;
}) {
  const isCompare = mode === 'compare';

  return (
    <div
      role="tablist"
      aria-label="对话模式切换"
      id={id}
      className="relative inline-flex flex-shrink-0 items-center rounded-full border border-white/70 bg-white/60 p-0.5 shadow-sm backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/60"
    >
      {/* 物理滑动高亮胶囊：常驻 DOM，CSS 硬件加速平移，彻底避免条件渲染丢帧/消失 */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute top-0.5 bottom-0.5 rounded-full bg-blue-600 shadow-[0_4px_12px_-2px_rgba(59,130,246,0.45)] transition-all duration-200 ease-out pointer-events-none',
          isCompare
            ? 'left-[calc(50%+1px)] w-[calc(50%-2px)]'
            : 'left-0.5 w-[calc(50%-2px)]'
        )}
      />

      {/* 单聊选项 */}
      <button
        type="button"
        role="tab"
        aria-selected={!isCompare}
        onClick={() => onChange('single')}
        className={cn(
          'relative z-10 inline-flex min-h-[44px] min-w-[54px] flex-1 items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-semibold select-none outline-none transition-colors duration-200 active:scale-[0.97]',
          !isCompare
            ? 'text-white'
            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
        )}
      >
        单聊
      </button>

      {/* 并行对比选项 */}
      <button
        type="button"
        role="tab"
        aria-selected={isCompare}
        onClick={() => onChange('compare')}
        className={cn(
          'relative z-10 inline-flex min-h-[44px] min-w-[76px] flex-1 items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-semibold select-none outline-none transition-colors duration-200 active:scale-[0.97]',
          isCompare
            ? 'text-white'
            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
        )}
      >
        并行对比
      </button>
    </div>
  );
}

// ============ 聊天页面主组件 ============
// 这是整个聊天页面的核心组件，负责：
// 1. 管理对话列表（左侧边栏）
// 2. 显示当前对话的消息（中间区域）
// 3. 处理用户输入和发送消息（底部输入框）
// 4. 切换 AI 模型和对话
export default function ChatWorkspace() {
  // ============ 组件内部状态 ============

  // 控制模型选择器的显示/隐藏状态
  // showModelSelector 为 true 时，显示模型下拉列表
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showConversationDrawer, setShowConversationDrawer] = useState(false);
  const [showMobileModelDrawer, setShowMobileModelDrawer] = useState(false);

  // 搜索框的输入内容
  // 用于过滤左侧的历史对话列表
  const [searchQuery, setSearchQuery] = useState('');

  // 知识库文档全文预览抽屉状态 (ADR-0025 / KB-CHAT-CITE)
  const [citationPreviewState, setCitationPreviewState] = useState<{
    isOpen: boolean;
    knowledgeBaseId: string | null;
    documentId: string | null;
    documentName?: string;
    documentVersion?: number;
    focusedAnchor?: {
      chunkIndex: number;
      headingPath?: string | null;
      pageNumber?: number | null;
    };
    allMatchedAnchors: MatchedCitationAnchor[];
    fallbackSnippet?: string;
  }>({
    isOpen: false,
    knowledgeBaseId: null,
    documentId: null,
    allMatchedAnchors: [],
  });

  // ============ Refs（引用） ============

  // 指向消息列表底部的 DOM 元素
  // 用于实现自动滚动到最新消息的功能
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 指向悬浮顶栏 Header 的 DOM 引用与实时高度，用于精准自适应消息滚动列表的顶部内边距（防遮挡）
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(0);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.offsetHeight > 0) {
        setHeaderHeight(el.offsetHeight);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 跟踪滚动容器当前是否处于底部（吸底判断，使用 ref 避免触发组件重新渲染）
  const isAtBottomRef = useRef(true);

  // 滚动容器滚动事件：监听用户是否处于底部（距离底部 <= 80px 视为在底部）
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    isAtBottomRef.current = isNearBottom(e.currentTarget);
  }, []);

  // 指向模型选择器的 DOM 元素
  // 用于检测点击外部区域时关闭下拉列表
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  // 标记页面是否已经初始化
  // 防止 useEffect 重复执行初始化逻辑
  const hasInitialized = useRef(false);

  // ============ 从 Conversations Store（编排中枢）获取状态和方法 ============
  // 会话中枢作为全局唯一的活动会话与模式权威（单一事实源 SSOT）

  // 获取所有对话列表（数组）
  const conversations = useConversationsStore((state) => state.conversations);

  // 获取当前激活的对话 ID
  const currentConversationId = useConversationsStore((state) => state.currentConversationId);

  // 获取数据是否已从本地存储加载完成的标志
  const isLoaded = useConversationsStore((state) => state.isLoaded);

  // 当前全局模式权威：单聊 / 并行对比
  const comparisonMode = useConversationsStore((state) => state.mode);
  const isCompareMode = comparisonMode === 'compare';

  // agent 模式开关（与输入坞的开关同源）：开启期间头部模型选择器置灰 ——
  // 此时它不再决定实际生效的模型（服务端强制豆包 seed），置灰是说真话而不是撒谎。
  const agentModeEnabled = useSettingsStore((state) => state.agentModeEnabled);

  // agent 开启时立即收起已展开的模型选择 UI：否则置灰的只是触发器，列表里的选项仍可点。
  useEffect(() => {
    if (!agentModeEnabled) return;
    setShowModelSelector(false);
    setShowMobileModelDrawer(false);
  }, [agentModeEnabled]);

  // 批量获取会话 store 的原子操作方法（浅比较优化）
  const {
    findEmptyConversation,
    getGroupedConversations,
    getCurrentConversation,
  } = useConversationsActions();

  // 跨 store 编排动作从编排模块取用（模块常量，非 hook 返回值）
  const {
    switchConversation,
    deleteConversation,
    switchMode,
    startNewSession,
  } = conversationOrchestrator;

  // 模式切换别名，兼容分段控制器命名
  const setComparisonMode = switchMode;

  // ============ 从 Chat Store 获取单聊状态和方法 ============
  // Chat Store 负责管理单聊会话的消息、流式输出、附件与发送状态
  const {
    messages,
    isLoading,
    error,
    provider,
    model,
    activeConversationId,
    reload,
    reset,
    artifacts,
    activeArtifactId,
    isWorkspaceOpen,
    setWorkspaceOpen,
  } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
      isLoading: state.isLoading,
      error: state.error,
      provider: state.provider,
      model: state.model,
      activeConversationId: state.activeConversationId,
      reload: state.reload,
      reset: state.reset,
      artifacts: state.artifacts,
      activeArtifactId: state.activeArtifactId,
      isWorkspaceOpen: state.isWorkspaceOpen,
      setWorkspaceOpen: state.setWorkspaceOpen,
    }))
  );

  // 仅将非图片资产（研报、表格、代码）视为工作台有效产物，避免生图结果污染工作台与触发分栏
  const validArtifacts = useMemo(
    () => (artifacts ?? []).filter((a) => a.type !== 'image'),
    [artifacts]
  );
  const hasArtifacts = validArtifacts.length > 0;
  // 移动端单视图双 Tab 模式（ADR-0060）
  const [mobileActiveTab, setMobileActiveTab] = useState<'chat' | 'artifacts'>('chat');

  // ============ 跨模态接力：对话目标接收 ============
  // 携文本/转写/报告段落接力到对话：引用条在输入坞上方，草稿经 externalDraft 预填，不自动发送
  const relay = useRelayReceive('chat');
  // 承载传给 ChatInput 的外部草稿（id 用于只消费一次）
  const [relayDraft, setRelayDraft] = useState<{ id: string; text: string } | null>(null);
  // 产物工作台「让模型重试」：把文本预填进输入框（复用外部草稿通道，只预填不自动发送）
  const prefillInputDraft = useCallback((text: string) => {
    setRelayDraft({ id: `artifact-retry-${Date.now()}`, text });
  }, []);
  // 承载传给 ChatInput 的外部图片附件（来自图像生成页接力，snapshotMediaUrl）
  const [relayAttachmentUrl, setRelayAttachmentUrl] = useState<string | null>(null);
  const [relayAttachmentSourceId, setRelayAttachmentSourceId] = useState<string | null>(null);
  // 查看来源快照预览
  const [relayPreviewOpen, setRelayPreviewOpen] = useState(false);
  // 接力到达且有文本快照时，若当前输入为空则直接预填，非空则由「填入输入框」显式触发
  const relayBundleText = relay.bundle?.items[0]?.snapshotText ?? '';
  const relayBundleMediaUrl = relay.bundle?.items[0]?.snapshotMediaUrl ?? '';
  // 接力到达：草稿与附件属于页面 UI 状态；落点保证与图片判定由编排命令完成
  useEffect(() => {
    if (!relay.initialized || !relay.bundle) return;
    if (!isLoaded) return;

    // 接力上下文进入输入框：文本作为用户引导句（可编辑），不自动发送
    if (relayBundleText && !relay.draft) {
      setRelayDraft({ id: relay.bundle.id, text: relayBundleText });
      relay.setDraft(relayBundleText);
    }

    // 落点保证（E-1 契约）、图片判定与自动切模型；命令幂等，重复执行不重复切换
    const { switchedModel, isImageRelay } =
      conversationOrchestrator.applyRelayArrival(relay.bundle);
    if (isImageRelay) {
      setRelayAttachmentUrl(relayBundleMediaUrl);
      setRelayAttachmentSourceId(relay.bundle.id);
    }
    if (switchedModel) {
      toast.success('已自动切换到豆包模型以支持图片附件');
    }
  }, [relay.initialized, relay.bundle?.id, isLoaded]);

  // ============ 错误提示全局监听 ============
  // 当对话发生异常时（如网络故障、提供方错误、配额超限），统一向用户弹出友好提示
  useEffect(() => {
    if (error) {
      toast.error(error.message || '请求失败，请稍后重试');
    }
  }, [error]);

  // ============ 计算属性（派生状态） ============
  // 这些值是从 Store 中的数据计算得出的，不需要单独存储

  // 获取当前激活的对话对象（包含完整信息）
  const currentConversation = getCurrentConversation();

  // 获取按时间分组的对话列表
  // 返回格式：[{ title: '今天', items: [...] }, { title: '昨天', items: [...] }, ...]
  const groupedConversations = getGroupedConversations();

  // ============ URL 参数处理（页面初始化逻辑） ============
  // 入口优先级、执行与 URL 清理统一由会话编排命令处理；
  // 页面只消费需要呈现的草稿预填文本，并在本页面生命周期内只执行一次
  useEffect(() => {
    if (!isLoaded || hasInitialized.current) return;
    hasInitialized.current = true;

    const { draftText } = conversationOrchestrator.enterChatFromUrl(
      window.location.search
    );
    if (draftText) {
      setRelayDraft({ id: `goal-${Date.now()}`, text: draftText });
    }
  }, [isLoaded]);

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

  // 切换会话时重置吸底状态：加载历史会话应定位到最新消息
  // 声明顺序必须先于下方的自动滚动 effect，保证同一渲染周期内先重置再滚动
  useEffect(() => {
    isAtBottomRef.current = true;
  }, [activeConversationId]);

  // ============ 自动滚动到最新消息 ============
  // 在消息列表容器内滚动，避免误滚到外层布局；仅在吸底状态下执行
  // 流式期间使用 auto（即时滚动）避免每个 chunk 反复重启 smooth 平滑动画
  useEffect(() => {
    const scrollEl = messagesScrollRef.current;
    if (!scrollEl || !isAtBottomRef.current) return;
    scrollEl.scrollTo({
      top: scrollEl.scrollHeight,
      behavior: isLoading ? 'auto' : 'smooth',
    });
  }, [messages, isLoading]);

  // ============ 消息展示处理 ============
  const isEmptyChat = messages.length === 0;

  // ============ 发送消息处理函数 ============
  // 会话创建、接力两段式与附件清理统一由编排命令处理；
  // 页面只负责吸底滚动、接力图片的 UI 状态与输入框需要的布尔结果
  const handleSend = useCallback(async (content: string) => {
    // 发送消息即表达阅读到底的意图：强制将吸底标记置为 true 并立即滚动到底部
    isAtBottomRef.current = true;
    const scrollEl = messagesScrollRef.current;
    if (scrollEl) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'auto' });
    }

    const result = await conversationOrchestrator.sendChatMessage(content);
    // 成功才清理接力图片 UI 状态；失败/取消/早退保留引用允许原地重试
    if (result === 'sent') {
      setRelayAttachmentUrl(null);
      setRelayAttachmentSourceId(null);
      return true;
    }
    return false;
  }, []);

  // ============ 新建会话处理函数 ============
  // 用户点击"新建对话"按钮时调用，由中枢根据全局模式权威统一执行新建契约
  const handleNewConversation = useCallback(() => {
    startNewSession();
  }, [startNewSession]);

  // ============ 切换 AI 提供商和模型 ============
  // 用户在模型选择器中选择不同的模型时调用
  const handleSwitchProvider = useCallback(
    (newProvider: ProviderName, newModel: string) => {
      // 运行时 provider/model 与当前会话绑定由编排命令同时更新，
      // 保证下次加载或刷新该会话时使用正确的模型
      conversationOrchestrator.updateSessionModel(newProvider, newModel);
    },
    []
  );

  // ============ 打开知识库切片全文预览抽屉 ============
  const handleOpenCitation = useCallback(
    (anchor: CitationAnchor) => {
      // 同文档切片的聚合、去重、排序与空结果回退由纯函数处理
      const anchors = collectDocumentAnchors(messages, anchor);

      setCitationPreviewState({
        isOpen: true,
        knowledgeBaseId: anchor.knowledgeBaseId || null,
        documentId: anchor.documentId,
        documentName: anchor.documentName,
        documentVersion: anchor.documentVersion,
        focusedAnchor: {
          chunkIndex: anchor.chunkIndex,
          headingPath: anchor.headingPath,
          pageNumber: anchor.pageNumber,
        },
        allMatchedAnchors: anchors,
        fallbackSnippet: anchor.snippet,
      });
    },
    [messages]
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
      title: '生成周报框架',
      description: '四板块模板，改填即用',
      prompt:
        '请生成一份通用周报框架（Markdown），包含「本周完成」「关键数据与亮点」「遇到的问题」「下周计划」四个部分。每部分用项目符号列出 2～3 条示例占位内容，方便我直接改成自己的实际情况。',
      icon: FileEdit,
      iconClassName: 'bg-orange-100 text-orange-500 dark:bg-orange-900/30 dark:text-orange-300',
    },
    {
      title: '站会纪要模板',
      description: '议题、决议与待办清单',
      prompt:
        '请给我一份适用于 30 分钟团队站会的会议纪要模板（Markdown 表格）。需包含：日期与参会人、议题列表、讨论要点、决议结论、待办事项（负责人 + 截止时间），并各填一行示例说明写法。',
      icon: FileText,
      iconClassName: 'bg-violet-100 text-violet-500 dark:bg-violet-900/30 dark:text-violet-300',
    },
    {
      title: '产品复盘提纲',
      description: '上线后复盘与迭代建议',
      prompt:
        '请列出一份「功能上线后产品复盘」的完整提纲，按顺序覆盖：复盘背景与目标、核心数据指标、用户反馈摘要、做得好的地方、问题与根因、经验教训、后续迭代建议。每个板块用 1～2 句话说明应写什么。',
      icon: BarChart2,
      iconClassName: 'bg-blue-100 text-blue-500 dark:bg-blue-900/30 dark:text-blue-300',
    },
    {
      title: '述职汇报结构',
      description: '六大章节写什么、怎么写',
      prompt:
        '请设计一份季度述职汇报的文档结构（约 6 个章节），说明每章建议篇幅、核心要点和可写的示例要点。面向技术研发岗位，语气务实，避免空泛套话。',
      icon: Lightbulb,
      iconClassName: 'bg-emerald-100 text-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
  ] as const;

  const renderConversationList = (onSelect?: () => void) => (
    <>
      <button
        onClick={handleNewConversation}
        className="w-full bg-white dark:bg-blue-600 text-blue-600 dark:text-white border border-blue-100 dark:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-700 rounded-xl py-3 px-4 font-medium flex items-center justify-center gap-2 select-none transition-[color,background-color,border-color,box-shadow,transform] duration-fast ease-out-expo active:scale-[0.98] shadow-sm group hover:shadow-md"
      >
        <Plus className="w-5 h-5 group-hover:scale-110 transition-transform duration-fast ease-out-expo" />
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
                  const isCompare = item.mode === 'compare';
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
                        // 由会话中枢统一处理模式流转、数据加载与流式交叉中止
                        switchConversation(item.id);
                        onSelect?.();
                      }}
                    >
                      {isCompare ? (
                        <GitCompareArrows
                          className={cn(
                            'w-4 h-4 flex-shrink-0',
                            isActive ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-500'
                          )}
                        />
                      ) : (
                        <MessageSquare
                          className={cn(
                            'w-4 h-4 flex-shrink-0',
                            isActive ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-500'
                          )}
                        />
                      )}
                      <span className="truncate flex-1">{item.title}</span>
                      {isCompare && (
                        <span className="flex-shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                          对比
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(item.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-slate-400 hover:text-red-500 select-none transition-[opacity,color,background-color,transform] duration-fast ease-out-expo active:scale-90"
                        aria-label="删除此对话"
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
      <AuthGuard>
        <AppLayout>
          <div className="flex items-center justify-center w-full h-full">
            {/* 旋转的加载动画 */}
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        </AppLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AppLayout>
        {/* 移动端 main 无确定高度（仅 min-h-screen），h-full 百分比链会失效导致壳体被内容撑爆；
            改为 100dvh 减去固定顶栏/底栏让位（变量来源 AppLayout），桌面端维持 h-full 原链路 */}
        <div className="flex min-h-0 w-full h-[calc(100dvh_-_var(--app-mobile-chrome-top)_-_var(--app-mobile-chrome-bottom))] lg:h-full">
          {/* 聊天历史侧边栏 */}
          <aside className="hidden lg:flex w-[280px] flex-shrink-0 flex-col p-4 gap-4 border-r border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur-sm">
            {renderConversationList()}
          </aside>

          {/* 主聊天区域 */}
          <div className="flex h-full min-h-0 flex-1 flex-col p-4 min-w-0">
            <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.76))] shadow-[0_18px_40px_rgba(76,95,154,0.1)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(15,23,42,0.82))] dark:shadow-[0_20px_48px_rgba(0,0,0,0.24)]">
              <div className="pointer-events-none absolute inset-x-12 top-0 h-28 rounded-full bg-[radial-gradient(circle_at_top,rgba(125,145,255,0.18),transparent_72%)] dark:bg-[radial-gradient(circle_at_top,rgba(93,124,250,0.16),transparent_72%)]" />
              {/* 头部：悬浮毛玻璃顶栏，浮于滚动区之上（DESIGN.md §4.1 / §8.5） */}
              <header
                ref={headerRef}
                className={cn(
                  // 移动端收敛：内边距与行距压到最小档，图标块移入桌面端（2026-10-15 评审 H4，移动端外壳高度）
                  'absolute inset-x-0 top-0 z-20 flex-none px-4 py-2.5 sm:px-6 sm:py-3.5',
                  'border-b border-white/50 bg-white/70 shadow-sm backdrop-blur-xl backdrop-saturate-150',
                  'dark:border-white/10 dark:bg-slate-900/75',
                  'transition-[border-color,background-color] duration-fast ease-out-expo'
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:justify-between min-w-0">
                  <div className="flex min-w-0 flex-1 items-center gap-3 mr-2 sm:mr-3">
                    <div className="hidden sm:flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-white/75 bg-white/80 text-blue-600 shadow-[0_8px_20px_rgba(76,95,154,0.08)] dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-blue-300">
                      <BarChart2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h1
                        title={currentTitle}
                        className="truncate font-heading text-sm font-bold leading-snug text-slate-900 dark:text-white sm:text-base"
                      >
                        {currentTitle}
                      </h1>
                      <div className="mt-1 hidden items-center gap-2 lg:flex">
                        {isCompareMode ? (
                          // 对比模式：多模型选择器（含「已选 N 个模型」与成本提示）
                          <ModelSelector variant="header" />
                        ) : (
                          // 单聊模式：单模型选择器
                          <div className="relative" ref={modelSelectorRef}>
                            <button
                              type="button"
                              disabled={agentModeEnabled}
                              title={
                                agentModeEnabled
                                  ? 'Agent 模式开启期间由系统指定模型（豆包 Seed），此处暂不可切换'
                                  : undefined
                              }
                              onClick={() => setShowModelSelector(!showModelSelector)}
                              className={cn(
                                'flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-xs transition-colors',
                                agentModeEnabled
                                  ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                                  : 'text-slate-500 hover:border-slate-200 hover:bg-white/80 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 dark:hover:text-slate-200'
                              )}
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

                            {/* 下拉列表：实体卡底（DESIGN.md §8.3），禁止半透明玻璃——
                                否则滚动正文透出与选项文字混叠不可读（2026-10-15 评审 H1） */}
                            {showModelSelector && (
                              <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-3xl border border-slate-200 bg-white py-2 shadow-[0_18px_40px_rgba(76,95,154,0.16)] animate-in fade-in zoom-in-95 duration-100 dark:border-slate-700 dark:bg-slate-800">
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
                        )}
                        <ModeSegmentedControl mode={comparisonMode} onChange={setComparisonMode} id="desktop" />
                      </div>
                    </div>
                  </div>

                  {/* 头部操作区 */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* 移动端专属双 Tab 切换器（ADR-0060）：点击热区严格 >= 44x44px */}
                    {!isCompareMode && hasArtifacts && (
                      <div className="flex lg:hidden items-center p-0.5 rounded-2xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80">
                        <button
                          type="button"
                          data-testid="mobile-tab-chat"
                          onClick={() => setMobileActiveTab('chat')}
                          className={cn(
                            'min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all select-none',
                            mobileActiveTab === 'chat'
                              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                          )}
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>对话</span>
                        </button>
                        <button
                          type="button"
                          data-testid="mobile-tab-artifacts"
                          onClick={() => setMobileActiveTab('artifacts')}
                          className={cn(
                            'min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all select-none',
                            mobileActiveTab === 'artifacts'
                              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                          )}
                        >
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span>交付物</span>
                          <span className="rounded-full bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-300">
                            {validArtifacts.length}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* 桌面端产物工作台切换按钮（ADR-0015） */}
                    {!isCompareMode && hasArtifacts && (
                      <button
                        type="button"
                        aria-label={isWorkspaceOpen ? '收起产物工作台' : '打开产物工作台'}
                        title={isWorkspaceOpen ? '收起产物工作台' : '打开产物工作台'}
                        onClick={() => setWorkspaceOpen(!isWorkspaceOpen)}
                        className={cn(
                          'hidden lg:inline-flex min-h-[44px] h-11 items-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold shadow-sm transition-all select-none lg:h-10',
                          isWorkspaceOpen
                            ? 'border-blue-500/60 bg-blue-50 text-blue-600 dark:border-blue-500/50 dark:bg-blue-950/40 dark:text-blue-300'
                            : 'border-white/80 bg-white/80 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700'
                        )}
                      >
                        <FileText className="w-4 h-4 text-blue-500" />
                        <span className="hidden sm:inline">工作台</span>
                        <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
                          {validArtifacts.length}
                        </span>
                      </button>
                    )}

                    {/* 窄屏模式切换留在操作区；桌面端已跟在模型名后面 */}
                    <div className="lg:hidden">
                      <ModeSegmentedControl mode={comparisonMode} onChange={setComparisonMode} id="mobile" />
                    </div>
                    <button
                      type="button"
                      aria-label="打开会话列表"
                      onClick={() => setShowConversationDrawer(true)}
                      className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-slate-600 shadow-[0_8px_20px_rgba(76,95,154,0.08)] transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <PanelLeft className="w-4 h-4" />
                    </button>
                    {isCompareMode ? (
                      // 对比模式（移动/平板）：多模型选择器，内部用底部抽屉
                      <div className="lg:hidden">
                        <ModelSelector variant="header" />
                      </div>
                    ) : (
                      // 单聊模式（移动/平板）：单模型选择抽屉
                      <button
                        type="button"
                        aria-label="打开模型选择"
                        disabled={agentModeEnabled}
                        title={
                          agentModeEnabled
                            ? 'Agent 模式开启期间由系统指定模型（豆包 Seed），此处暂不可切换'
                            : undefined
                        }
                        onClick={() => setShowMobileModelDrawer(true)}
                        className={cn(
                          // 移动端热区 ≥44px（DESIGN.md §5）
                          'lg:hidden inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3 text-xs font-medium shadow-[0_8px_20px_rgba(76,95,154,0.08)] transition-colors',
                          agentModeEnabled
                            ? 'cursor-not-allowed border-slate-200/70 bg-slate-100/70 text-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-600'
                            : 'border-white/80 bg-white/80 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700'
                        )}
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                        <span className="max-w-[88px] truncate">{currentModelLabel}</span>
                      </button>
                    )}
                  </div>
                </div>
              </header>

              {isCompareMode ? (
                // 并行对比模式：多模型聚焦比较视图（自带概览轨道、双列聚焦与输入区）
                <ComparisonView headerHeight={headerHeight} />
              ) : (
                // 单聊模式：现有单聊主体（保持不变）
                <>
                  {/* 消息滚动区域外壳：承载顶部/底部平滑渐变遮罩与滚动列表 */}
                  <div className="relative min-h-0 flex-1">
                    {/* 消息列表：h-full 填满外壳，min-h-0 保证纵向正常滚动 */}
                    <div
                      ref={messagesScrollRef}
                      data-testid="messages-scroll-container"
                      onScroll={handleMessagesScroll}
                      style={{
                        paddingTop: headerHeight > 0 ? `${headerHeight + 16}px` : undefined,
                      }}
                      className={cn(
                        'h-full w-full overflow-y-auto overscroll-y-contain custom-scrollbar',
                        // 非空消息列表：背景取主壳渐变底部色，避免顶部透出渐变白色端形成色带
                        isEmptyChat
                          ? 'bg-transparent px-4 pb-4 pt-[112px] sm:px-5 sm:pb-5 sm:pt-[124px]'
                          : 'bg-[rgba(248,250,252,0.76)] px-4 pt-[116px] pb-[4.5rem] sm:px-5 sm:pt-[124px] sm:pb-20 dark:bg-[rgba(15,23,42,0.82)]'
                      )}
                    >
                    {isEmptyChat ? (
                      <div className="relative z-0 flex min-h-full flex-col items-center justify-center">
                        <div className="pointer-events-none absolute top-1/2 h-[320px] w-[min(88vw,640px)] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(93,124,250,0.1),transparent_72%)] blur-[96px] dark:bg-[radial-gradient(circle,rgba(93,124,250,0.16),transparent_72%)]" />

                        <div className="relative w-full max-w-3xl rounded-[32px] bg-white/50 p-6 shadow-[0_20px_44px_rgba(76,95,154,0.08)] ring-1 ring-white/50 backdrop-blur-2xl dark:bg-slate-900/45 dark:ring-slate-700/35 md:p-8">
                          {agentModeEnabled ? (
                            <>
                              <div className="mb-8 flex flex-col items-center text-center">
                                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#3B82F6_0%,#6366F1_100%)] text-white shadow-[0_16px_32px_rgba(59,130,246,0.28)]">
                                  <Sparkles className="h-8 w-8" />
                                </div>
                                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50/90 px-3.5 py-1 text-xs font-semibold text-blue-700 shadow-sm dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300">
                                  <Wrench className="h-3.5 w-3.5" />
                                  <span>Agent 场景能力包</span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                                  专项设定专属于垂直任务的提示词与工具白名单，为您交付高质量结构化成果
                                </p>
                              </div>

                              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="capability-packs-grid">
                                {CAPABILITY_PACKS.map((pack) => {
                                  const isResearch = pack.key === 'deep-research';
                                  const isKnowledgeQa = pack.key === 'knowledge-qa';
                                  const PackIcon = isResearch ? Search : isKnowledgeQa ? BookOpen : FileText;
                                  return (
                                    <button
                                      key={pack.key}
                                      type="button"
                                      data-testid={`capability-pack-card-${pack.key}`}
                                      onClick={() => {
                                        // 能力包同时写入运行时与当前会话绑定，刷新后仍保留；并预填专业模板到输入框
                                        conversationOrchestrator.updateSessionCapabilityPack(pack.key);
                                        setRelayDraft({
                                          id: `pack-${pack.key}-${Date.now()}`,
                                          text: pack.promptTemplate,
                                        });
                                      }}
                                      className="group relative flex flex-col justify-between rounded-[24px] border border-white/80 bg-white/[0.88] p-5 text-left shadow-[0_10px_24px_rgba(76,95,154,0.06)] select-none transition-[border-color,background-color,box-shadow,transform] duration-fast ease-out-expo hover:-translate-y-0.5 active:scale-[0.99] hover:border-blue-300 hover:shadow-[0_18px_32px_rgba(93,124,250,0.14)] dark:border-slate-700/80 dark:bg-slate-800/[0.88] dark:hover:border-blue-500/40 cursor-pointer"
                                    >
                                      <div>
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                          <div
                                            className={cn(
                                              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-fast ease-out-expo group-hover:scale-105 shadow-sm',
                                              isResearch
                                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
                                                : isKnowledgeQa
                                                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                  : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'
                                            )}
                                          >
                                            <PackIcon className="h-5 w-5" />
                                          </div>
                                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                                            {pack.maxSteps} 步探索上限
                                          </span>
                                        </div>

                                        <div className="text-base font-semibold text-slate-800 transition-colors duration-fast ease-out-expo group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-300">
                                          {pack.name}
                                        </div>
                                        <div className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                          {pack.description}
                                        </div>
                                      </div>

                                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        <span>点击载入专业模板</span>
                                        <span className="font-medium group-hover:translate-x-0.5 transition-transform">→</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 pt-2 text-xs text-slate-400 dark:text-slate-500">
                                <span>按需启用私有 Webhook 插槽 · 随会话状态隔离</span>
                              </div>
                            </>
                          ) : (
                            <>
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
                                      className="group flex items-start gap-4 rounded-[24px] border border-white/80 bg-white/[0.84] p-4 text-left shadow-[0_10px_24px_rgba(76,95,154,0.06)] select-none transition-[border-color,background-color,box-shadow,transform] duration-fast ease-out-expo hover:-translate-y-0.5 active:scale-[0.99] hover:border-blue-200 hover:shadow-[0_18px_32px_rgba(93,124,250,0.12)] dark:border-slate-700/80 dark:bg-slate-800/[0.82] dark:hover:border-blue-500/30"
                                    >
                                      <div
                                        className={cn(
                                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-fast ease-out-expo group-hover:scale-105',
                                          action.iconClassName
                                        )}
                                      >
                                        <ActionIcon className="h-5 w-5" />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold text-slate-800 transition-colors duration-fast ease-out-expo group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-300">
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
                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/[0.78] px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/[0.78] dark:text-slate-300">
                                  <FileText className="h-3.5 w-3.5 text-blue-500" />
                                  支持长文本分析
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/[0.78] px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/[0.78] dark:text-slate-300">
                                  <Globe className="h-3.5 w-3.5 text-blue-500" />
                                  实时联网搜索
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/[0.78] px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/[0.78] dark:text-slate-300">
                                  <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                                  企业级数据安全
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      // 消息列：桌面端限制阅读列宽（DESIGN.md §5：65–75 字符；2026-10-15 评审 M3，
                      // 1920 下行宽近 1500px 换行串行）。用户/AI 气泡共同居中于该列内
                      <div className="mx-auto flex w-full max-w-4xl flex-col pb-4">
                        {messages.map((msg, i) => {
                          // 「重新生成」仅挂在最后一条 AI 消息上：线性会话只允许重生成最后一轮（防中间轮截断丢消息）
                          const isLastAssistant =
                            msg.role === 'assistant' && i === messages.length - 1;
                          const prevUser = isLastAssistant
                            ? [...messages.slice(0, i)].reverse().find((m) => m.role === 'user')
                            : undefined;
                          return (
                            <MessageItem
                              key={msg.id}
                              message={msg}
                              onRegenerate={
                                isLastAssistant && prevUser
                                  ? () => void reload(prevUser.id)
                                  : undefined
                              }
                              onOpenCitation={handleOpenCitation}
                            />
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* 底部过渡，仅柔化输入坞背景与消息列表的衔接，不遮挡消息内容 */}
                  {!isEmptyChat && (
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-[rgba(248,250,252,0.9)] via-[rgba(248,250,252,0.45)] to-transparent dark:from-[rgba(15,23,42,0.88)] dark:via-[rgba(15,23,42,0.35)]"
                      aria-hidden
                    />
                  )}
                </div>

                  {/* 接力引用条：模型标签与输入框之间（REQ-007） */}
                  {(relay.bundle || relay.replaceCandidate || relay.isInvalid) && (
                    <div className="relative z-10 flex-none px-4 pt-2 sm:px-5">
                      {relay.replaceCandidate ? (
                        <ReferenceBar
                          bundle={relay.replaceCandidate.incoming}
                          isReplaceCandidate
                          onConfirmReplace={relay.confirmReplace}
                          onCancelReplace={relay.cancelReplace}
                          onRemove={relay.remove}
                        />
                      ) : relay.bundle ? (
                        <ReferenceBar
                          bundle={relay.bundle}
                          onViewSource={() => setRelayPreviewOpen(true)}
                          onRemove={() => {
                            const bundleId = relay.bundle?.id;
                            relay.remove();
                            // 同步清理对话输入框中的接力图片附件
                            setRelayAttachmentUrl(null);
                            setRelayAttachmentSourceId(null);
                            if (bundleId && useChatStore.getState().attachment?.sourceId === bundleId) {
                              useChatStore.getState().setAttachment(null);
                            }
                          }}
                          showFill={Boolean(relayBundleText) && !relayDraft}
                          fillLabel={RELAY_COPY.referenceBar.fillInput}
                          onFill={() => {
                            if (relay.bundle) {
                              setRelayDraft({ id: relay.bundle.id, text: relayBundleText });
                              relay.setDraft(relayBundleText);
                            }
                          }}
                        />
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">
                          {RELAY_COPY.referenceBar.invalid}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 移动端底部轻量浮动横幅（ADR-0060）：点击切换到交付物视图 */}
                  {!isCompareMode && hasArtifacts && mobileActiveTab === 'chat' && (
                    <div className="relative z-10 flex-none px-4 pt-1 sm:px-5 lg:hidden">
                      <button
                        type="button"
                        data-testid="mobile-artifact-floating-banner"
                        onClick={() => setMobileActiveTab('artifacts')}
                        className="w-full min-h-[44px] flex items-center justify-between px-4 py-2.5 rounded-2xl border border-blue-200/80 bg-blue-50/90 text-blue-700 dark:border-blue-800/40 dark:bg-blue-950/60 dark:text-blue-300 shadow-sm transition-transform active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span>已生成交付物，点击切换查看</span>
                        </div>
                        <span className="rounded-full bg-blue-200/80 dark:bg-blue-800/60 px-2 py-0.5 text-xs font-semibold">
                          {validArtifacts.length}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* 输入坞：与主卡片同层背景；底部留白兼顾安全区与桌面拇指区 */}
                  <div className="relative z-10 flex-none px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:px-5 sm:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
                    <ChatInput
                      onSend={handleSend}
                      isLoading={isLoading}
                      // 草稿按会话隔离（2026-10-15 评审 H5）：切换会话时各自暂存/还原
                      draftKey={activeConversationId}
                      externalDraft={relayDraft}
                      onExternalDraftConsumed={() => setRelayDraft(null)}
                      externalAttachmentUrl={relayAttachmentUrl}
                      externalAttachmentSourceId={relayAttachmentSourceId}
                      onExternalAttachmentConsumed={() => {
                        setRelayAttachmentUrl(null);
                        setRelayAttachmentSourceId(null);
                      }}
                    />
                  </div>

                  {/* 接力来源快照预览（只读） */}
                  <ReferenceSourcePreview
                    open={relayPreviewOpen}
                    onOpenChange={setRelayPreviewOpen}
                    item={relay.bundle?.items[0] ?? null}
                  />
                </>
              )}
            </div>
          </div>

          {/* 桌面端 Artifacts 工作台：单聊模式、展开且有产物时常驻双栏（ADR-0015） */}
          {!isCompareMode && isWorkspaceOpen && hasArtifacts && (
            <ArtifactWorkspaceDock onPrefillInput={prefillInputDraft} />
          )}
        </div>

        {/* 移动端单视图 Artifacts 交付物模式（ADR-0060） */}
        {!isCompareMode && hasArtifacts && mobileActiveTab === 'artifacts' && (
          <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-slate-900 lg:hidden pt-[var(--app-mobile-chrome-top)] pb-[calc(var(--app-mobile-chrome-bottom)+env(safe-area-inset-bottom,0px))] overflow-y-auto overflow-x-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm sticky top-0 z-10">
              <button
                type="button"
                data-testid="mobile-artifact-back-button"
                onClick={() => setMobileActiveTab('chat')}
                className="min-h-[44px] min-w-[44px] flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回对话</span>
              </button>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                交付物 ({validArtifacts.length})
              </div>
              <div className="min-w-[44px]" />
            </div>
            <div className="flex-1 p-3">
              <ArtifactWorkspace
                isMobile={true}
                onPrefillInput={(draft) => {
                  prefillInputDraft(draft);
                  setMobileActiveTab('chat');
                }}
              />
            </div>
          </div>
        )}

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
            <div className="max-h-[78vh] overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
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
            <div className="max-h-[78vh] overflow-y-auto custom-scrollbar px-4 py-4">
              {renderModelOptions(() => setShowMobileModelDrawer(false))}
            </div>
          </DialogContent>
        </Dialog>

        {/* 知识库文档全文预览与切片定位高亮抽屉 (ADR-0025 / KB-CHAT-CITE) */}
        <DocumentPreviewDrawer
          open={citationPreviewState.isOpen}
          onOpenChange={(open) =>
            setCitationPreviewState((prev) => ({ ...prev, isOpen: open }))
          }
          knowledgeBaseId={citationPreviewState.knowledgeBaseId || ''}
          documentId={citationPreviewState.documentId || ''}
          documentName={citationPreviewState.documentName}
          documentVersion={citationPreviewState.documentVersion}
          focusedAnchor={citationPreviewState.focusedAnchor}
          allMatchedAnchors={citationPreviewState.allMatchedAnchors}
          onSelectAnchor={(targetAnchor) => {
            setCitationPreviewState((prev) => ({
              ...prev,
              focusedAnchor: {
                chunkIndex: targetAnchor.chunkIndex,
                headingPath: targetAnchor.headingPath,
                pageNumber: targetAnchor.pageNumber,
              },
            }));
          }}
          modal={false}
          fallbackSnippet={citationPreviewState.fallbackSnippet}
        />
      </AppLayout>
    </AuthGuard>
  );
}
