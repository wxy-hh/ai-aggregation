'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import {
  Mic,
  MessageSquare,
  Image as ImageIcon,
  ArrowRight,
  Compass,
  Send,
  Sparkles,
} from 'lucide-react';
import { RecentCreationsSection } from '@/components/home/recent-creations-section';

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
 * 3. 桌面只保留一个输入框和四张工具卡，搜索放在最近创作里；
 * 4. 移动端优先：首屏即为高频操作热区，侧边栏不阻挡核心流；
 * 5. 全局单一 main 容器，修复 HTML 语义结构。
 */
export function HomeContent() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  // 即时 Prompt 输入框状态
  const [promptText, setPromptText] = useState('');

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

  return (
    <div className="flex h-full w-full flex-col home-aurora-base text-slate-900 dark:text-slate-100 overflow-y-auto custom-scrollbar font-sans">
      <section
        aria-label="核心工作区"
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative"
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
