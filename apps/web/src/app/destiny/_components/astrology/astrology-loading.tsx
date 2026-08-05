'use client';

/**
 * 星座寰宇 · 真实四阶段加载页
 *
 * 把不可见的专业步骤变成可理解的进度。前三段主语为「系统」，第四段才出现 AI。
 * 进度只随真实完成事件推进（不设虚假固定百分比）；无宫位分支第三阶段文案不同。
 * 遵循「减少动态」偏好：reduced-motion 下退化为静态进度点。
 */

import React from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { MapPin, Sparkles, CircleDashed, BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '../layout/glass-card';
import { AstrologyChartCanvas } from './astrology-chart-canvas';
import type { ChartFacts } from './astrology-types';

export type LoadingStage = 1 | 2 | 3 | 4;

const STAGE_META: Array<{
  stage: LoadingStage;
  /** 含宫位文案 */
  textWithHouses: string;
  /** 无宫位文案 */
  textNoHouses: string;
  icon: React.ComponentType<{ className?: string }>;
  isAI: boolean;
}> = [
  { stage: 1, textWithHouses: '系统正在校准出生地与当地时区', textNoHouses: '系统正在校准出生地与当地时区', icon: MapPin, isAI: false },
  { stage: 2, textWithHouses: '系统正在定位行星与月亮', textNoHouses: '系统正在定位行星与月亮', icon: Sparkles, isAI: false },
  { stage: 3, textWithHouses: '系统正在绘制十二宫与关键相位', textNoHouses: '系统正在整理行星位置与关键相位', icon: CircleDashed, isAI: false },
  { stage: 4, textWithHouses: 'AI 正在基于星盘事实整理宇宙重点', textNoHouses: 'AI 正在基于星盘事实整理宇宙重点', icon: BrainCircuit, isAI: true },
];

type AstrologyLoadingProps = {
  stage: LoadingStage;
  hasHouses: boolean;
  /** 已完成真值（用于先渲染星盘骨架） */
  chartFacts: ChartFacts | null;
  /** 超时：解读仍在整理 */
  interpretingTooLong?: boolean;
  onRetryInterpretation?: () => void;
  className?: string;
};

/** 阶段→星盘绘制进度映射（渐进绘制）。 */
function stageToProgress(stage: LoadingStage): number {
  switch (stage) {
    case 1: return 0.25;
    case 2: return 0.55;
    case 3: return 0.85;
    case 4: return 1;
  }
}

export function AstrologyLoading({
  stage,
  hasHouses,
  chartFacts,
  interpretingTooLong = false,
  onRetryInterpretation,
  className,
}: AstrologyLoadingProps) {
  const reduceMotion = useReducedMotion();

  return (
    <GlassCard variant="hero" className={cn('relative flex flex-col items-center p-6 sm:p-10', className)}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/20" />

      {/* 中央星盘（渐进绘制） */}
      <div className="relative my-4">
        <AstrologyChartCanvas
          chartFacts={chartFacts}
          hasHouses={hasHouses}
          progress={stageToProgress(stage)}
          size={280}
        />
        {/* 中央呼吸光点 */}
        {!reduceMotion && (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400"
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ boxShadow: '0 0 20px rgba(99,102,241,0.6)' }}
          />
        )}
      </div>

      {/* 无宫位范围徽章 */}
      {!hasHouses && (
        <div className="mb-3 inline-flex items-center rounded-full border border-violet-500/25 bg-violet-500/8 px-3 py-1 dark:border-violet-400/25 dark:bg-violet-500/10">
          <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-300">无宫位行星盘</span>
        </div>
      )}

      {/* 四阶段进度清单 */}
      <div className="w-full max-w-sm space-y-3" role="status" aria-live="polite">
        {STAGE_META.map((meta) => {
          const Icon = meta.icon;
          const done = stage > meta.stage;
          const active = stage === meta.stage;
          const text = hasHouses ? meta.textWithHouses : meta.textNoHouses;
          return (
            <div key={meta.stage} className="flex items-center gap-3">
              {/* 状态点 */}
              <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                {done ? (
                  <motion.div
                    initial={reduceMotion ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    className="h-2.5 w-2.5 rounded-full bg-emerald-500"
                  />
                ) : active ? (
                  reduceMotion ? (
                    <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  ) : (
                    <motion.div
                      className="h-2.5 w-2.5 rounded-full bg-blue-500"
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                      style={{ boxShadow: '0 0 8px rgba(59,130,246,0.5)' }}
                    />
                  )
                ) : (
                  <div className="h-2.5 w-2.5 rounded-full border border-slate-300 dark:border-white/20" />
                )}
              </div>
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  done ? 'text-emerald-500' : active ? 'text-blue-500 dark:text-indigo-400' : 'text-slate-300 dark:text-slate-600'
                )}
              />
              <span
                className={cn(
                  'text-sm transition-colors',
                  done
                    ? 'text-slate-500 dark:text-slate-400'
                    : active
                      ? 'font-semibold text-slate-800 dark:text-slate-100'
                      : 'text-slate-400 dark:text-slate-500'
                )}
              >
                {text}
              </span>
            </div>
          );
        })}
      </div>

      {/* 超时提示 */}
      <AnimatePresence>
        {interpretingTooLong && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 dark:border-amber-400/25 dark:bg-amber-500/10"
          >
            <p className="text-xs text-amber-700 dark:text-amber-300">
              解读仍在整理，可继续等待或稍后从历史查看
            </p>
            {onRetryInterpretation && (
              <button
                type="button"
                onClick={onRetryInterpretation}
                className="min-h-11 rounded-full border border-amber-500/40 px-4 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-500/10 dark:text-amber-300"
              >
                仅重新整理解读
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
