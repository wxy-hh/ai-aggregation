'use client';
/* 生成页面的提示词:
底部固定的“工具底座” (Utility Dock)：

在侧边栏的最下方，我们将“设置”、“主题切换”和“个人中心”聚合在一起。
由于宽度变窄：不再采用横向的“文字 + 开关”模式，而是设计一个极简的圆形磨砂玻璃图标按钮（太阳/月亮图标）。
这样设计即便侧边栏收缩，图标依然能完美适配，不会出现文字截断或乱码。
交互反馈 (Micro-interactions)：

悬停状态：当鼠标悬停在这个图标上时，它会散发出淡淡的科技蓝（Technology Blue）外发光，并弹出一个小巧的玻璃气泡提示（Tooltip），显示“切换至深色模式”。
无缝切换：点击后，全站色彩通过 css mix-blend-mode 进行平滑过渡，而无需重新加载。
高级感细节：

将该按钮设计为“悬浮式（Floating）”感，略微脱离底部的侧边栏底色，使用更强的 backdrop-blur，使其在视觉上既属于导航栏，又是一个独立的功能触点。
 */
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores';
import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  FileText,
  PenTool,
  Zap,
  Mic,
  MessageSquare,
  Image as ImageIcon,
  ArrowRight,
  Lightbulb,
  Plus,
  Compass,
} from 'lucide-react';
import {
  RecentCreationsSection,
  RecentFilesSidebarList,
} from '@/components/home/recent-creations-section';

export function HomeContent() {
  const router = useRouter();
  const setInput = useChatStore((state) => state.setInput);
  const [searchQuery, setSearchQuery] = useState('');

  // 每日灵感提示词
  const dailyInspirations = [
    '帮我生成一份周报大纲，包含本周工作总结和下周计划',
    '请帮我编写一个 React 组件的最佳实践模板',
    '生成一份产品需求文档的模板',
    '帮我总结最新的 AI 技术发展趋势',
    '设计一个用户调研问卷的框架',
  ];
  const [currentInspiration, setCurrentInspiration] = useState(dailyInspirations[0]);

  // 每日更换灵感提示
  useEffect(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
    );
    setCurrentInspiration(dailyInspirations[dayOfYear % dailyInspirations.length]);
  }, []);

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
   * 跳转到命理测算页面
   */
  const handleDestiny = useCallback(() => {
    router.push('/destiny');
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

  return (
    <div className="flex h-full w-full flex-col lg:flex-row bg-[#F3F5FA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-y-auto lg:overflow-hidden font-sans">
      {/* 
        二级侧边栏（发现） 
        基于 "Image 1" 描述：左侧侧边栏包含 "发现"、搜索、工具等。
      */}
      <aside className="w-full lg:w-[280px] h-auto lg:h-full flex flex-col p-4 lg:p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-b lg:border-b-0 lg:border-r border-slate-200/50 dark:border-slate-800/50 z-10 flex-shrink-0">
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
        <div className="mb-4">
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
              icon={Compass}
              label="命理测算"
              badge="八字排盘"
              badgeColor="text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20"
              color="text-indigo-600"
              onClick={handleDestiny}
            />
          </div>
        </div>

        {/* 推荐指令 */}
        <div>
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
        <div className="max-h-[320px] lg:max-h-none lg:flex-1 overflow-y-auto no-scrollbar -mx-2 px-2">
          <div className="flex items-center justify-between mb-4 mt-1">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              最近文件
            </h3>
            <ArrowRight
              className="w-3 h-3 text-slate-400 cursor-pointer hover:text-blue-500 transition-colors"
              onClick={handleViewHistory}
            />
          </div>
          <div className="space-y-3">
            <RecentFilesSidebarList />
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
      <main className="flex-1 h-auto lg:h-full overflow-y-auto custom-scrollbar relative">
        {/* 背景元素 */}
        <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-blue-100/50 to-transparent dark:from-blue-900/10 dark:to-transparent -z-10 pointer-events-none"></div>
        <div className="absolute top-20 right-20 w-96 h-96 bg-purple-200/30 dark:bg-purple-900/20 rounded-full blur-3xl -z-10 animate-pulse pointer-events-none"></div>
        <div
          className="absolute top-40 left-40 w-72 h-72 bg-blue-200/30 dark:bg-blue-900/20 rounded-full blur-3xl -z-10 animate-pulse pointer-events-none"
          style={{ animationDelay: '2s' }}
        ></div>

        <div className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {/* 具有高级深色混合效果的主视觉区域卡片 */}
          <div className="bg-gradient-to-b from-white/60 via-white/20 to-transparent dark:from-slate-900/60 dark:via-slate-900/20 dark:to-transparent backdrop-blur-2xl rounded-[28px] lg:rounded-[48px] p-6 sm:p-8 lg:p-12 pb-0 shadow-[0_20px_60px_-10px_rgba(59,130,246,0.1)] dark:shadow-none mb-10 lg:mb-16 relative overflow-hidden group/hero">
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

              <h1 className="text-3xl sm:text-4xl lg:text-6xl font-black mb-4 lg:mb-6 tracking-tight text-slate-900 dark:text-white leading-tight">
                开启您的 AI{' '}
                <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                  创作宇宙
                </span>
              </h1>

              <p className="text-sm sm:text-base lg:text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                集成尖端对话模型、高精度语音识别与艺术级图像生成，
                <br />
                为专业创作者打造的沉浸式智能工作空间。
              </p>
            </div>

            {/* 主要功能卡片 */}
            <div
              data-testid="home-feature-grid"
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-8 mb-12 lg:mb-20"
            >
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

          <RecentCreationsSection className="mb-2" />
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
      className="flex items-center justify-between p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
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
