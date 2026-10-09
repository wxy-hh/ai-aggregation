'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import {
  Search,
  PenTool,
  Zap,
  Mic,
  MessageSquare,
  Image as ImageIcon,
  ArrowRight,
  Lightbulb,
  Compass,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  RecentCreationsSection,
  RecentFilesSidebarList,
} from '@/components/home/recent-creations-section';

/**
 * 灵感快捷选胶囊：text 为灵感文案，target 决定执行载体
 * chat → 对话页自动发送；image → 绘图页自动发起生成（文本模型无法直接出图）
 */
const QUICK_TIPS = [
  { text: '帮我写一份工作总结大纲', target: 'chat' },
  { text: '用通俗易懂的语言解释什么是大模型', target: 'chat' },
  { text: '画一只在星空中穿梭的银白机械鲸鱼', target: 'image' },
] as const;

/**
 * 首页工作台主内容组件
 * 遵循 DESIGN.md 与 oil-ui 规范：
 * 1. 采用 Operate 模式（聚焦即用、轻盈通透的工作台），避免空洞的营销落地页范式；
 * 2. 具备即时 Prompt 启动舱，支持直接键入指令一键直达对话与各模型；
 * 3. 4 大核心能力紧凑看板卡，消除与侧边栏的三重冗余；
 * 4. 移动端优先：首屏即为高频操作热区，侧边栏不阻挡核心流；
 * 5. 全局单一 main 容器，修复 HTML 语义结构。
 */
export function HomeContent() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  // 搜索关键词状态
  const [searchQuery, setSearchQuery] = useState('');
  // 即时 Prompt 输入框状态
  const [promptText, setPromptText] = useState('');

  // 每日灵感提示词库
  const dailyInspirations = useMemo(
    () => [
      '帮我生成一份周报大纲，包含本周工作总结和下周计划',
      '请帮我编写一个 React 组件的最佳实践模板',
      '生成一份产品需求文档的框架与关键业务流',
      '帮我总结当前大模型推理与多模态技术的发展趋势',
      '设计一份面向新用户的产品调研问卷提纲',
    ],
    []
  );

  const [currentInspiration, setCurrentInspiration] = useState(dailyInspirations[0]);

  // 根据当前年份天数轮换每日灵感
  useEffect(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
    );
    setCurrentInspiration(dailyInspirations[dayOfYear % dailyInspirations.length]);
  }, [dailyInspirations]);

  // 问候语计算
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }, []);

  const displayName = user?.name || user?.username || '创作者';

  // ==================== 快捷交互事件处理 ====================

  /**
   * 即时发送 Prompt 到对话页
   * 通过 URL 携带 prompt，由对话页初始化时自动发送；
   * 不再使用 setInput 预填，因为对话页「新建会话」流程会清空输入框，导致灵感丢失、变成单纯跳转
   */
  const handleSendPrompt = useCallback(
    (textToSend?: string) => {
      const finalPrompt = (textToSend || promptText).trim();
      if (!finalPrompt) return;
      router.push(`/chat?new=true&prompt=${encodeURIComponent(finalPrompt)}`);
    },
    [promptText, router]
  );

  /**
   * 键盘回车快捷发送（Enter 发送，Shift+Enter 换行）
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendPrompt();
      }
    },
    [handleSendPrompt]
  );

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
   * 每日灵感点击：携带灵感文案跳转对话页并自动发起
   */
  const handleDailyInspiration = useCallback(() => {
    router.push(`/chat?new=true&prompt=${encodeURIComponent(currentInspiration)}`);
  }, [router, currentInspiration]);

  /**
   * 快捷胶囊点击：按意图路由目标
   * 绘图类灵感去绘图页并自动发起生成（文本模型无法直接出图），其余进对话自动发送
   */
  const handleQuickTip = useCallback(
    (tip: (typeof QUICK_TIPS)[number]) => {
      if (tip.target === 'image') {
        router.push(`/image?prompt=${encodeURIComponent(tip.text)}`);
        return;
      }
      handleSendPrompt(tip.text);
    },
    [router, handleSendPrompt]
  );

  /**
   * 搜索框回车：若有输入则带着关键词去历史记录页筛选，否则去对话页
   */
  const handleSearchSubmit = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const query = searchQuery.trim();
        if (query) {
          router.push(`/history?q=${encodeURIComponent(query)}`);
        }
      }
    },
    [searchQuery, router]
  );

  return (
    <div className="flex h-full w-full flex-col lg:flex-row home-aurora-base text-slate-900 dark:text-slate-100 overflow-y-auto custom-scrollbar lg:overflow-hidden font-sans">
      {/* 
        二级侧边栏（发现与快捷检索）
        在桌面端常驻左侧；在移动端置于主内容下方作为次级探索区，确保移动端首屏直达核心工作区
      */}
      <aside className="order-2 lg:order-1 w-full lg:w-[280px] h-auto lg:h-full flex flex-col p-4 lg:p-6 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border-t lg:border-t-0 lg:border-r border-slate-200/60 dark:border-white/10 shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center justify-between mb-4 lg:mb-6">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Search className="w-4 h-4 text-primary" />
            快速探索
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
            聚合工作台
          </span>
        </div>

        {/* 快速搜索框 */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索历史、会话或指令..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchSubmit}
            className="w-full bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 rounded-xl py-2.5 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all duration-fast"
          />
        </div>

        {/* 推荐指令 */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5 mb-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              快捷流水线
            </h3>
            <Zap className="w-3 h-3 text-amber-500 fill-current" />
          </div>

          <div className="space-y-2">
            <CommandCard
              icon={Mic}
              iconColor="text-purple-600 dark:text-purple-400"
              iconBg="bg-purple-100 dark:bg-purple-950/40"
              actionIcon={MessageSquare}
              actionColor="text-blue-600 dark:text-blue-400"
              actionBg="bg-blue-100 dark:bg-blue-950/40"
              label="语音会议自动总结为文档"
              onClick={handleVoiceToDoc}
            />
            <CommandCard
              icon={MessageSquare}
              iconColor="text-blue-600 dark:text-blue-400"
              iconBg="bg-blue-100 dark:bg-blue-950/40"
              actionIcon={ImageIcon}
              actionColor="text-pink-600 dark:text-pink-400"
              actionBg="bg-pink-100 dark:bg-pink-950/40"
              label="优化 Prompt 并生成画作"
              onClick={handlePromptToImage}
            />
          </div>
        </div>

        {/* 最近文件与历史抽屉 */}
        <div className="max-h-[300px] lg:max-h-none lg:flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
          <div className="flex items-center justify-between mb-3 mt-1">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              最近创作清单
            </h3>
            <button
              type="button"
              onClick={handleViewHistory}
              className="text-xs text-slate-400 hover:text-primary transition-colors flex items-center gap-1"
              aria-label="查看完整历史"
            >
              全部
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <RecentFilesSidebarList />
        </div>

        {/* 每日灵感卡片 */}
        <div
          className="mt-4 p-3.5 bg-gradient-to-br from-white to-blue-50/70 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm relative overflow-hidden group cursor-pointer select-none transition-all duration-fast hover:shadow-md active:scale-[0.98]"
          onClick={handleDailyInspiration}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleDailyInspiration()}
          aria-label="点击使用今日灵感"
        >
          <div className="flex items-start gap-2.5 relative z-10">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 shrink-0">
              <Lightbulb className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                  今日灵感
                </span>
                <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  点击使用 →
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                {currentInspiration}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* 
        主工作区容器（使用 section 规范标签，避免与 AppLayout 形成双 main 违规）
      */}
      <section
        aria-label="核心工作区"
        className="order-1 lg:order-2 flex-1 min-h-0 lg:h-full overflow-y-auto custom-scrollbar relative"
      >
        {/* 背景柔和环境辉光（符合 DESIGN.md 极光氛围规范） */}
        <div className="absolute top-12 right-12 w-80 h-80 bg-purple-300/[0.12] dark:bg-purple-900/[0.15] rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="absolute top-36 left-24 w-72 h-72 bg-blue-300/[0.12] dark:bg-blue-900/[0.15] rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="max-w-[1360px] mx-auto px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8 space-y-6 lg:space-y-8">
          {/* 
            【即时 Prompt 启动舱】
            进入首页即可直接打字沟通，瞬间激活对话，符合生产力工具 Operate 模式
          */}
          <div className="relative rounded-2xl lg:rounded-3xl p-5 sm:p-6 lg:p-7 bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none backdrop-blur-xl transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{greeting}，{displayName}</span>
                  <Sparkles className="w-5 h-5 text-amber-500" />
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  通义千问 · 智谱 GLM · DeepSeek 多模型已就绪，随时开启创作
                </p>
              </div>

              {/* 快捷场景微标：氛围信息，窄屏隐藏避免与标题区争抢宽度（移动端首屏信息密度规范） */}
              <div className="hidden md:flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 whitespace-nowrap">
                  ● 服务就绪
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40 whitespace-nowrap">
                  超快响应
                </span>
              </div>
            </div>

            {/* 即时输入控制区 */}
            <div className="relative rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-950/60 p-2 sm:p-3 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
              <textarea
                rows={2}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="在此输入您的灵感、提问或任务需求（按 Enter 立即发起，Shift+Enter 换行）..."
                className="w-full resize-none bg-transparent text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none leading-relaxed px-1"
              />

              {/* 底部行：窄屏纵向排布（胶囊换行 + 整宽发送按钮），宽屏单行两端对齐 */}
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-800/60 mt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                {/* 快捷 Prompt 预置胶囊：按意图路由（绘图类去绘图页，其余进对话） */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 mr-1 hidden sm:inline">灵感快捷选:</span>
                  {QUICK_TIPS.map((tip) => (
                    <button
                      key={tip.text}
                      type="button"
                      onClick={() => handleQuickTip(tip)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/50 hover:border-primary/50 hover:text-primary transition-all active:scale-95"
                    >
                      {tip.text}
                    </button>
                  ))}
                </div>

                {/* 发送按钮：窄屏整宽占一行，保证拇指热区与视觉稳定 */}
                <button
                  type="button"
                  onClick={() => handleSendPrompt()}
                  disabled={!promptText.trim()}
                  className={cn(
                    'inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-sm transition-all',
                    'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95',
                    'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100'
                  )}
                >
                  <span>发起创作</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 
            【4 大核心生产力看板】
            摒弃层层嵌套与空洞文案，采用利落的网格看板
          */}
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>核心生产力空间</span>
              </h2>
              <span className="text-xs text-slate-400">选择专项工具开启深层次处理</span>
            </div>

            <div
              data-testid="home-feature-grid"
              className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
            >
              <FeatureCard
                href="/chat?new=true"
                title="智能对话"
                badge="支持多模型"
                description="深度逻辑推理、长文写作与代码实战"
                icon={MessageSquare}
                accentColor="text-blue-600"
                iconBg="bg-blue-50 dark:bg-blue-950/50"
                glowRgb="59 130 246"
                actionText="新建对话"
              />
              <FeatureCard
                href="/voice"
                title="语音转写"
                badge="高精转录"
                description="录音秒级转文字，智能纪要与分角色提炼"
                icon={Mic}
                accentColor="text-purple-600"
                iconBg="bg-purple-50 dark:bg-purple-950/50"
                glowRgb="168 85 247"
                actionText="立即录音/上传"
              />
              <FeatureCard
                href="/image"
                title="灵感绘图"
                badge="Kolors 引擎"
                description="中文语义直出，超写实渲染与风格画派"
                icon={ImageIcon}
                accentColor="text-pink-600"
                iconBg="bg-pink-50 dark:bg-pink-950/50"
                glowRgb="236 72 153"
                actionText="文生图创作"
              />
              <FeatureCard
                href="/destiny"
                title="AI 命理大师"
                badge="夜幕星宫"
                description="四柱八字、紫微斗数与奇门六壬深度演化"
                icon={Compass}
                accentColor="text-indigo-600"
                iconBg="bg-indigo-50 dark:bg-indigo-950/50"
                glowRgb="99 102 241"
                actionText="进入排盘"
              />
            </div>
          </div>

          {/* 
            【最近创作成果流水线】
          */}
          <RecentCreationsSection className="pt-2" />
        </div>
      </section>
    </div>
  );
}

// ==================== 子组件 ====================

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
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 p-2.5 bg-slate-50/80 dark:bg-slate-800/50 rounded-xl select-none transition-all duration-fast hover:shadow-sm hover:bg-slate-100/90 dark:hover:bg-slate-800 active:scale-[0.98] cursor-pointer border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/80 text-left"
    >
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', iconBg, iconColor)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="w-1 h-3 border-l border-dashed border-slate-300 dark:border-slate-600" />
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', actionBg, actionColor)}>
          <ActionIcon className="w-3.5 h-3.5" />
        </div>
      </div>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-1 flex-1">
        {label}
      </span>
      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
    </button>
  );
}

interface FeatureCardProps {
  href: string;
  title: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  iconBg: string;
  glowRgb: string;
  actionText: string;
}

function FeatureCard({
  href,
  title,
  badge,
  description,
  icon: Icon,
  accentColor,
  iconBg,
  glowRgb,
  actionText,
}: FeatureCardProps) {
  return (
    <Link href={href} className="block group h-full">
      <div
        style={{ '--card-glow': glowRgb } as React.CSSProperties}
        className={cn(
          'relative overflow-hidden h-full flex flex-col justify-between p-4 sm:p-5 rounded-2xl select-none',
          'bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/10 backdrop-blur-md',
          'shadow-sm transition-all duration-normal ease-out-expo',
          'hover:-translate-y-1 hover:border-slate-300 dark:hover:border-white/20',
          'hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.08),0_0_40px_-6px_rgb(var(--card-glow)/0.3)]',
          'active:scale-[0.98]'
        )}
      >
        {/* 弥散渐变氛围层（DESIGN.md 登记例外：角部光晕增亮绽放 + 表面径向微光 ≤0.08，只提亮不点亮） */}
        {/* 主光团：右上角品牌色弥散光晕，hover 时增亮绽放 */}
        <div
          aria-hidden
          className="absolute -top-14 -right-14 w-44 h-44 rounded-full blur-2xl pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity duration-normal ease-out-expo"
          style={{ background: `radial-gradient(closest-side, rgb(${glowRgb} / 0.35), transparent)` }}
        />
        {/* 次光团：左下角同色系更淡光晕，与主光团构成双色弥散层次 */}
        <div
          aria-hidden
          className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full blur-2xl pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity duration-normal ease-out-expo"
          style={{ background: `radial-gradient(closest-side, rgb(${glowRgb} / 0.2), transparent)` }}
        />
        {/* 表面径向微光：极淡的提亮层，避免点亮整块卡面 */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.06] group-hover:opacity-[0.08] transition-opacity duration-normal ease-out-expo"
          style={{ background: `radial-gradient(120% 90% at 85% 0%, rgb(${glowRgb} / 0.6), transparent 60%)` }}
        />

        {/* 卡片顶部：图标与微标 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shadow-xs transition-transform group-hover:scale-105', iconBg, accentColor)}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">
              {badge}
            </span>
          </div>

          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-1">
            {title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
            {description}
          </p>
        </div>

        {/* 卡片底栏动作 */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold">
          <span className={cn('transition-colors', accentColor)}>{actionText}</span>
          <ArrowRight className={cn('w-3.5 h-3.5 transition-transform duration-normal ease-out-expo group-hover:translate-x-1', accentColor)} />
        </div>
      </div>
    </Link>
  );
}
