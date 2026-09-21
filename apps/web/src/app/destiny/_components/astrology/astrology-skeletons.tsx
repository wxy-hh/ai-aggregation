'use client';

/**
 * astrology-skeletons.tsx —— 星座寰宇报告流等待骨架屏组件集
 *
 * 规范：
 * - 纯占位呈现，采用夜色系呼吸动效（acw-skeleton-breathe），减少视觉跳动；
 * - 针对核心金句、大三要素、生活模块与洞察轨卡片分别预留等高槽位。
 */

import { cn } from '@/lib/utils';

/** 基础骨架块：夜色系呼吸块（浅色 slate / 深色夜面微光） */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'acw-skeleton-breathe rounded-lg bg-slate-200/60 dark:bg-white/[0.07]',
        className
      )}
    />
  );
}

/** 主轴金句骨架：预留最小高度防止解读到达时布局跳跃，两行呼吸块 */
export function HeadlineSkeleton() {
  return (
    <div aria-hidden className="min-h-[5.5rem] sm:min-h-[8rem]">
      <SkeletonBlock className="h-6 w-[85%] sm:h-10 sm:w-[78%]" />
      <SkeletonBlock className="mt-3 h-6 w-[60%] sm:mt-4 sm:h-10 sm:w-[55%]" />
    </div>
  );
}

/** 大三要素骨架：三卡位网格，对齐图标行与正文行高 */
export function BigThreeSkeleton() {
  return (
    <div aria-hidden className="mt-4 grid gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-[#0D1226]"
        >
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-8 w-8 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3.5 w-16" />
              <SkeletonBlock className="mt-1.5 h-2.5 w-10" />
            </div>
          </div>
          <SkeletonBlock className="mt-3.5 h-3 w-24" />
          <SkeletonBlock className="mt-4 h-3 w-full" />
          <SkeletonBlock className="mt-2 h-3 w-4/5" />
          <SkeletonBlock className="mt-3 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** 生活模块骨架：真实章节标题行与双列卡片骨架 */
export function LifeModulesSkeleton() {
  return (
    <section aria-label="五个生活模块" aria-busy="true">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
          生活的五个切面
        </h3>
        <span className="text-xs text-day-muted dark:text-night-faint">
          每张卡都能展开依据，回看它来自盘面的哪个位置
        </span>
      </div>
      <div aria-hidden className="mt-5 grid gap-3 xl:grid-cols-2 xl:gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-[#0D1226] sm:p-5"
          >
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-9 w-9 rounded-full" />
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-3.5 w-24" />
                <div className="mt-1.5 flex gap-1.5">
                  <SkeletonBlock className="h-4 w-12 rounded-full" />
                  <SkeletonBlock className="h-4 w-16 rounded-full" />
                </div>
              </div>
            </div>
            <SkeletonBlock className="mt-4 h-3 w-full" />
            <SkeletonBlock className="mt-2 h-3 w-11/12" />
            <SkeletonBlock className="mt-2 h-3 w-3/5" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** 洞察轨卡片骨架：海报与问答卡在途时的占位 */
export function RailCardSkeleton() {
  return (
    <div
      aria-hidden
      className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#0D1226] dark:shadow-[inset_0_1px_0_rgba(196,181,253,0.10)]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-4 w-4 rounded-full" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
        <SkeletonBlock className="h-4 w-14 rounded-full" />
      </div>
      <SkeletonBlock className="mt-3 h-3 w-full" />
      <SkeletonBlock className="mt-2 h-3 w-3/5" />
      <SkeletonBlock className="mt-3.5 h-11 w-full rounded-full" />
    </div>
  );
}
