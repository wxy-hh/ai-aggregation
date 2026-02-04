'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useConversationsStore, useAudioHistoryStore, useChatStore } from '@/stores';
import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  FileText,
  PenTool,
  Bookmark,
  Zap,
  Clock,
  Mic,
  MessageSquare,
  Image as ImageIcon,
  ArrowRight,
  Plus,
  Lightbulb,
  File,
  Sparkles,
} from 'lucide-react';

/**
 * 最近创作项目类型定义
 */
interface RecentCreation {
  id: string;
  title: string;
  time: string;
  type: 'image' | 'doc' | 'audio';
  status: 'completed' | 'processing';
  // 图片类型的预览 URL
  previewUrl?: string;
}

/**
 * 格式化相对时间显示
 * @param timestamp 时间戳（毫秒）
 * @returns 格式化后的相对时间字符串
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return `${Math.floor(days / 30)}个月前`;
}

export function HomeContent() {
  const router = useRouter();

  // ==================== Stores ====================
  // 会话历史
  const conversations = useConversationsStore((state) => state.conversations);
  const createConversation = useConversationsStore((state) => state.createConversation);

  // 音频历史
  const audioHistoryItems = useAudioHistoryStore((state) => state.items);
  const isAudioHistoryInitialized = useAudioHistoryStore((state) => state.isInitialized);
  const initAudioHistory = useAudioHistoryStore((state) => state.initializeService);

  // 聊天 store（用于预设消息）
  const setInput = useChatStore((state) => state.setInput);

  // ==================== 状态 ====================
  const [searchQuery, setSearchQuery] = useState('');
  const [recentCreations, setRecentCreations] = useState<RecentCreation[]>([]);

  // 每日灵感提示词
  const dailyInspirations = [
    '帮我生成一份周报大纲，包含本周工作总结和下周计划',
    '请帮我编写一个 React 组件的最佳实践模板',
    '生成一份产品需求文档的模板',
    '帮我总结最新的 AI 技术发展趋势',
    '设计一个用户调研问卷的框架',
  ];
  const [currentInspiration, setCurrentInspiration] = useState(dailyInspirations[0]);

  // ==================== 初始化 ====================
  useEffect(() => {
    // 初始化音频历史服务
    if (!isAudioHistoryInitialized) {
      initAudioHistory();
    }
  }, [isAudioHistoryInitialized, initAudioHistory]);

  // 每日更换灵感提示
  useEffect(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
    );
    setCurrentInspiration(dailyInspirations[dayOfYear % dailyInspirations.length]);
  }, []);

  // 合并最近创作数据
  useEffect(() => {
    const creations: RecentCreation[] = [];

    // 从对话历史中获取最近的文档类型创作
    conversations.slice(0, 3).forEach((conv) => {
      if (conv.messages.length > 0) {
        creations.push({
          id: conv.id,
          title: conv.title || '新对话',
          time: formatRelativeTime(conv.updatedAt),
          type: 'doc',
          status: 'completed',
        });
      }
    });

    // 从音频历史中获取最近的音频创作
    audioHistoryItems.slice(0, 2).forEach((item) => {
      creations.push({
        id: item.id,
        title: item.fileName?.replace(/\.[^/.]+$/, '') || '语音转写',
        time: formatRelativeTime(
          item.createdAt instanceof Date ? item.createdAt.getTime() : Date.now()
        ),
        type: 'audio',
        status: item.processingStatus === 'completed' ? 'completed' : 'processing',
      });
    });

    // 按时间排序并取前 3 个
    setRecentCreations(creations.slice(0, 3));
  }, [conversations, audioHistoryItems]);

  // ==================== 事件处理 ====================

  /**
   * 跳转到语音识别页面（会议纪要）
   */
  const handleMeetingNotes = useCallback(() => {
    router.push('/voice');
  }, [router]);

  /**
   * 跳转到聊天页面并预设文案润色提示
   */
  const handleCopyPolish = useCallback(() => {
    router.push('/chat?new=true');
    // 使用 setTimeout 确保页面加载后再设置输入
    setTimeout(() => {
      setInput('请帮我润色以下文案，使其更加专业和流畅：\n\n');
    }, 100);
  }, [router, setInput]);

  /**
   * 跳转到历史记录页面
   */
  const handleViewHistory = useCallback(() => {
    router.push('/history');
  }, [router]);

  /**
   * 推荐指令：将录音总结为文档
   */
  const handleVoiceToDoc = useCallback(() => {
    router.push('/voice');
  }, [router]);

  /**
   * 推荐指令：优化提示词并绘图
   */
  const handlePromptToImage = useCallback(() => {
    router.push('/image');
  }, [router]);

  /**
   * 每日灵感点击：跳转到聊天并发送预设提示
   */
  const handleDailyInspiration = useCallback(() => {
    router.push('/chat?new=true');
    setTimeout(() => {
      setInput(currentInspiration);
    }, 100);
  }, [router, setInput, currentInspiration]);

  /**
   * 最近文件点击处理
   */
  const handleRecentFileClick = useCallback(
    (type: 'image' | 'audio' | 'doc') => {
      switch (type) {
        case 'image':
          router.push('/image');
          break;
        case 'audio':
          router.push('/voice');
          break;
        case 'doc':
          router.push('/chat');
          break;
      }
    },
    [router]
  );

  /**
   * 最近创作卡片点击处理
   */
  const handleCreationClick = useCallback(
    (creation: RecentCreation) => {
      switch (creation.type) {
        case 'image':
          router.push('/image');
          break;
        case 'audio':
          router.push('/voice');
          break;
        case 'doc':
          // 跳转到对应的对话
          router.push(`/chat`);
          break;
      }
    },
    [router]
  );

  /**
   * 新建项目
   */
  const handleNewProject = useCallback(() => {
    // 创建新对话
    createConversation();
    router.push('/chat?new=true');
  }, [createConversation, router]);

  return (
    <div className="flex h-full w-full bg-[#F3F5FA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      {/* 
        二级侧边栏（发现） 
        基于 "Image 1" 描述：左侧侧边栏包含 "发现"、搜索、工具等。
      */}
      <aside className="w-[280px] h-full flex flex-col p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-800/50 z-10 flex-shrink-0">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">发现</h2>

        {/* 搜索 */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索功能、文档或指令..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-800 border-none rounded-xl py-3 pl-10 pr-4 text-sm text-slate-600 dark:text-slate-300 placeholder:text-slate-400 shadow-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          />
        </div>

        {/* 常用工具 */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-wider">
            常用工具
          </h3>
          <div className="space-y-1">
            <ToolItem
              icon={FileText}
              label="会议纪要"
              badge="关联语音"
              badgeColor="text-blue-500 bg-blue-50 dark:bg-blue-900/20"
              color="text-blue-600"
              onClick={handleMeetingNotes}
            />
            <ToolItem
              icon={PenTool}
              label="文案润色"
              color="text-purple-600"
              onClick={handleCopyPolish}
            />
            <ToolItem
              icon={Bookmark}
              label="收藏夹"
              color="text-amber-500"
              onClick={handleViewHistory}
            />
          </div>
        </div>

        {/* 推荐指令 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              推荐指令
            </h3>
            <Zap className="w-3 h-3 text-yellow-500 fill-current" />
          </div>

          <div className="space-y-3">
            <CommandCard
              icon={Mic}
              iconColor="text-purple-500"
              iconBg="bg-purple-100 dark:bg-purple-900/30"
              actionIcon={MessageSquare}
              actionColor="text-blue-500"
              actionBg="bg-blue-100 dark:bg-blue-900/30"
              label="将录音总结为文档"
              onClick={handleVoiceToDoc}
            />
            <CommandCard
              icon={MessageSquare}
              iconColor="text-blue-500"
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              actionIcon={ImageIcon}
              actionColor="text-pink-500"
              actionBg="bg-pink-100 dark:bg-pink-900/30"
              label="优化提示词并绘图"
              onClick={handlePromptToImage}
            />
          </div>
        </div>

        {/* 最近文件 */}
        <div className="flex-1 overflow-y-auto no-scrollbar -mx-2 px-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              最近文件
            </h3>
            <ArrowRight
              className="w-3 h-3 text-slate-400 cursor-pointer hover:text-blue-500 transition-colors"
              onClick={handleViewHistory}
            />
          </div>
          <div className="space-y-3">
            <FileItem
              name="未来城市概念设计.png"
              type="image"
              onClick={() => handleRecentFileClick('image')}
            />
            <FileItem
              name="Q3 业务复盘录音.mp3"
              type="audio"
              onClick={() => handleRecentFileClick('audio')}
            />
            <FileItem
              name="产品发布营销文案.doc"
              type="doc"
              onClick={() => handleRecentFileClick('doc')}
            />
          </div>
        </div>

        {/* 每日灵感 */}
        <div
          className="mt-4 p-4 bg-gradient-to-br from-white to-blue-50 dark:from-slate-800 dark:to-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md transition-shadow"
          onClick={handleDailyInspiration}
        >
          <div className="flex items-start gap-3 relative z-10">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-500">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-sm mb-1">每日灵感</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                {currentInspiration.slice(0, 30)}...
              </p>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-blue-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500"></div>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 h-full overflow-y-auto custom-scrollbar relative">
        {/* 背景元素 */}
        <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-blue-100/50 to-transparent dark:from-blue-900/10 dark:to-transparent -z-10 pointer-events-none"></div>
        <div className="absolute top-20 right-20 w-96 h-96 bg-purple-200/30 dark:bg-purple-900/20 rounded-full blur-3xl -z-10 animate-pulse pointer-events-none"></div>
        <div
          className="absolute top-40 left-40 w-72 h-72 bg-blue-200/30 dark:bg-blue-900/20 rounded-full blur-3xl -z-10 animate-pulse pointer-events-none"
          style={{ animationDelay: '2s' }}
        ></div>

        <div className="max-w-[1400px] mx-auto px-8 py-10">
          {/* 具有高级深色混合效果的主视觉区域卡片 */}
          <div className="bg-gradient-to-b from-white/60 via-white/20 to-transparent dark:from-slate-900/60 dark:via-slate-900/20 dark:to-transparent backdrop-blur-2xl rounded-[48px] p-12 pb-0 shadow-[0_20px_60px_-10px_rgba(59,130,246,0.1)] dark:shadow-none mb-16 relative overflow-hidden group/hero">
            {/* 渐变边框遮罩 - 创建“融合边缘”效果 */}
            <div className="absolute inset-0 rounded-[48px] border border-white/60 dark:border-white/10 [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)] pointer-events-none"></div>

            {/* 顶部光波/高光 */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50"></div>

            {/* 细腻的内部高光 */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent dark:from-white/5 pointer-events-none"></div>

            {/* 头部 */}
            <div className="text-center mb-16 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-xs font-bold tracking-wider mb-6">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                AI PRODUCTIVITY SUITE
              </div>

              <h1 className="text-6xl font-black mb-6 tracking-tight text-slate-900 dark:text-white leading-tight">
                开启您的 AI{' '}
                <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                  创作宇宙
                </span>
              </h1>

              <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                集成尖端对话模型、高精度语音识别与艺术级图像生成，
                <br />
                为专业创作者打造的沉浸式智能工作空间。
              </p>
            </div>

            {/* 主要功能卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
              <FeatureCard
                href="/chat?new=true"
                title="智能对话"
                description="深度逻辑推理，支持多轮复杂指令理解与代码生成。"
                icon={MessageSquare}
                color="text-blue-600"
                gradient="from-blue-500/20 to-cyan-500/20"
                buttonText="新建对话"
                buttonIcon={Plus}
              />
              <FeatureCard
                href="/voice"
                title="语音转写"
                description="毫秒级低延迟，自动识别说话人并生成智能纪要。"
                icon={Mic}
                color="text-purple-600"
                gradient="from-purple-500/20 to-pink-500/20"
                buttonText="开始会议纪要"
                buttonIcon={ArrowRight}
              />
              <FeatureCard
                href="/image"
                title="灵感绘图"
                description="超写实艺术渲染，将文字提示瞬间转化为视觉杰作。"
                icon={ImageIcon}
                color="text-pink-600"
                gradient="from-pink-500/20 to-rose-500/20"
                buttonText="开始创作"
                buttonIcon={PenTool}
              />
            </div>
          </div>

          {/* 最近创作头部 */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              最近创作
            </h2>
            <Button
              variant="ghost"
              className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              asChild
            >
              <Link href="/history" className="flex items-center gap-1">
                查看全部 <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* 最近创作网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* 使用动态数据，如果没有则显示示例 */}
            {recentCreations.length > 0 ? (
              recentCreations.map((creation) => (
                <CreationCard
                  key={creation.id}
                  title={creation.title}
                  time={creation.time}
                  type={creation.type}
                  gradient={
                    creation.type === 'image'
                      ? 'from-slate-800 to-black'
                      : 'bg-white dark:bg-slate-800'
                  }
                  status={creation.status}
                  onClick={() => handleCreationClick(creation)}
                />
              ))
            ) : (
              <>
                <CreationCard
                  title="未来城市概念"
                  time="2小时前"
                  type="image"
                  gradient="from-slate-800 to-black"
                  status="completed"
                  onClick={() => router.push('/image')}
                />
                <CreationCard
                  title="产品营销文案"
                  time="5小时前"
                  type="doc"
                  gradient="bg-white dark:bg-slate-800"
                  status="completed"
                  onClick={() => router.push('/chat')}
                />
                <CreationCard
                  title="Q3 业务复盘"
                  time="昨天"
                  type="audio"
                  gradient="bg-white dark:bg-slate-800"
                  status="processing"
                  onClick={() => router.push('/voice')}
                />
              </>
            )}

            {/* 新建项目卡片 */}
            <div
              className="h-40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col items-center justify-center cursor-pointer group"
              onClick={handleNewProject}
            >
              <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform text-slate-400 group-hover:text-blue-500">
                <Plus className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-500 group-hover:text-blue-600 dark:text-slate-400 dark:group-hover:text-blue-400 transition-colors">
                新建项目
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// 子组件

interface ToolItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string;
  badgeColor?: string;
  color?: string;
  onClick?: () => void;
}

function ToolItem({ icon: Icon, label, badge, badgeColor, color, onClick }: ToolItemProps) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg bg-slate-50 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors ${color}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      </div>
      {badge && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

interface CommandCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  actionIcon: React.ComponentType<{ className?: string }>;
  actionColor: string;
  actionBg: string;
  label: string;
  onClick?: () => void;
}

function CommandCard({
  icon: Icon,
  iconColor,
  iconBg,
  actionIcon: ActionIcon,
  actionColor,
  actionBg,
  label,
  onClick,
}: CommandCardProps) {
  return (
    <div
      className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:shadow-md transition-shadow cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center ${iconBg} ${iconColor}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="w-1 h-3 border-l border-dashed border-slate-300 dark:border-slate-600"></div>
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center ${actionBg} ${actionColor}`}
        >
          <ActionIcon className="w-3.5 h-3.5" />
        </div>
      </div>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-1">
        {label}
      </span>
    </div>
  );
}

interface FileItemProps {
  name: string;
  type: 'image' | 'doc' | 'audio';
  onClick?: () => void;
}

function FileItem({ name, type, onClick }: FileItemProps) {
  let Icon = File;
  let color = 'text-slate-500';
  if (type === 'image') {
    Icon = ImageIcon;
    color = 'text-purple-500';
  }
  if (type === 'audio') {
    Icon = Mic;
    color = 'text-pink-500';
  }
  if (type === 'doc') {
    Icon = FileText;
    color = 'text-blue-500';
  }

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm text-slate-600 dark:text-slate-400 truncate">{name}</span>
    </div>
  );
}

function FeatureCard({
  href,
  title,
  description,
  icon: Icon,
  color,
  gradient,
  buttonText,
  buttonIcon: ButtonIcon,
}: any) {
  return (
    <div className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-[32px] p-8 shadow-xl hover:shadow-2xl transition-all duration-300 group border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700">
      {/* 渐变背景光圈 */}
      <div
        className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${gradient} blur-3xl rounded-full translate-x-12 -translate-y-12 opacity-50 group-hover:opacity-100 transition-opacity duration-500`}
      ></div>

      <div
        className={`w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300 ${color}`}
      >
        <Icon className="w-7 h-7" />
      </div>

      <h3 className="text-2xl font-bold mb-3">{title}</h3>
      <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-8 min-h-[48px]">
        {description}
      </p>

      <Link href={href}>
        <div
          className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${color}`}
        >
          {buttonText}
          <ButtonIcon className="w-4 h-4" />
        </div>
      </Link>
    </div>
  );
}

interface CreationCardProps {
  title: string;
  time: string;
  type: 'image' | 'doc' | 'audio';
  gradient: string;
  status: 'completed' | 'processing';
  onClick?: () => void;
}

function CreationCard({ title, time, type, gradient, status, onClick }: CreationCardProps) {
  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow border border-slate-100 dark:border-slate-800 cursor-pointer group"
      onClick={onClick}
    >
      <div
        className={`aspect-[4/3] rounded-xl mb-4 overflow-hidden relative ${type === 'image' ? '' : 'bg-slate-50 dark:bg-slate-800 flex items-center justify-center'}`}
      >
        {type === 'image' ? (
          <div
            className={`absolute inset-0 bg-gradient-to-br ${gradient} group-hover:scale-105 transition-transform duration-500`}
          >
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center opacity-80 mix-blend-overlay"></div>
          </div>
        ) : (
          <div className="text-slate-300 group-hover:text-blue-500 transition-colors">
            {type === 'doc' ? <FileText className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
          </div>
        )}

        {/* 状态指示点 */}
        <div
          className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full border border-white dark:border-slate-900 ${status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
        ></div>
      </div>

      <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1">{title}</h4>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div
          className={`w-1.5 h-1.5 rounded-full ${type === 'image' ? 'bg-purple-500' : type === 'doc' ? 'bg-blue-500' : 'bg-pink-500'}`}
        ></div>
        {time}
      </div>
    </div>
  );
}
