'use client';

/**
 * 星座寰宇 · 宇宙护照头
 *
 * 让用户确认报告确实属于自己，并可校验输入。展示昵称、出生资料摘要、地点、
 * 时间精度标签、盘面范围标签与可展开的「盘面依据」（计算口径）。
 * 进入时有极淡的扫描光。文本区保持高对比实体底。
 */

import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown, MapPin, Clock, Fingerprint, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChartFacts, TimePrecision } from './astrology-types';

const PRECISION_LABEL: Record<TimePrecision, string> = {
  minute: '准确到分钟',
  approximate: '大约时段',
  unknown: '完全未知',
};

type AstrologyPassportHeaderProps = {
  name: string;
  timePrecision: TimePrecision;
  chartFacts: ChartFacts;
  className?: string;
};

export function AstrologyPassportHeader({
  name,
  timePrecision,
  chartFacts,
  className,
}: AstrologyPassportHeaderProps) {
  const reduceMotion = useReducedMotion();
  const [basisOpen, setBasisOpen] = useState(false);
  const hasHouses = chartFacts.houses.length > 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[24px] border border-white/60 bg-white/92 p-4 sm:p-6',
        'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)]',
        'dark:border-white/10 dark:bg-slate-900/92',
        className
      )}
    >
      {/* 极淡扫描光（进入时一次） */}
      {!reduceMotion && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-blue-400/8 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '300%' }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        />
      )}

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
            <h2 className="font-heading text-lg font-bold text-slate-900 dark:text-slate-100">
              {name || '匿名'}的本命星盘
            </h2>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {chartFacts.location.name}
            </span>
            <span>{chartFacts.birthTimestamp}</span>
          </div>
        </div>

        {/* 精度与范围标签 */}
        <div className="flex flex-col items-end gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/25 bg-blue-500/8 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:border-indigo-400/25 dark:bg-indigo-500/10 dark:text-indigo-300">
            <Clock className="h-3 w-3" />
            时间精度：{PRECISION_LABEL[timePrecision]}
          </span>
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold',
              hasHouses
                ? 'border-indigo-500/25 bg-indigo-500/8 text-indigo-700 dark:border-indigo-400/25 dark:bg-indigo-500/10 dark:text-indigo-300'
                : 'border-violet-500/25 bg-violet-500/8 text-violet-700 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-300'
            )}
          >
            盘面范围：{hasHouses ? '含宫位' : '无宫位行星盘'}
          </span>
        </div>
      </div>

      {/* 盘面依据（可展开） */}
      <div className="mt-4 border-t border-slate-200/60 pt-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => setBasisOpen((v) => !v)}
          aria-expanded={basisOpen}
          className="flex min-h-11 w-full items-center justify-between text-left"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <FileText className="h-3.5 w-3.5" />
            盘面依据
          </span>
          <ChevronDown
            className={cn('h-4 w-4 text-slate-400 transition-transform duration-200', basisOpen && 'rotate-180')}
          />
        </button>
        <AnimatePresence>
          {basisOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 pb-2 text-[11px] sm:grid-cols-2">
                <div className="flex justify-between">
                  <dt className="text-slate-400">黄道体系</dt>
                  <dd className="font-medium text-slate-600 dark:text-slate-300">回归黄道 · 地心视角</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">宫制</dt>
                  <dd className="font-medium text-slate-600 dark:text-slate-300">
                    {hasHouses ? 'Placidus' : '不适用（无宫位）'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">计算版本</dt>
                  <dd className="font-mono text-slate-600 dark:text-slate-300">{chartFacts.version}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">计算时间</dt>
                  <dd className="text-slate-600 dark:text-slate-300">
                    {new Date(chartFacts.calculatedAt).toLocaleString('zh-CN')}
                  </dd>
                </div>
              </dl>
              <p className="pb-1 text-[11px] leading-relaxed text-slate-400">
                本命盘位置基于出生时空计算；内容用于自我探索与娱乐参考。
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
