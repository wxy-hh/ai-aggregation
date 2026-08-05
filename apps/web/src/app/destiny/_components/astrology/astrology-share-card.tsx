'use client';

/**
 * 星座寰宇 · 脱敏分享卡
 *
 * 只含昵称或匿名、可计算的核心要素、一句主轴与生成日期；
 * 出生日期、精确时间、地点、度数默认不分享。未知/约时不稳定时不显示上升。
 * 分享前可选「显示昵称/匿名」「显示大三要素/仅显示一句主轴」。
 */

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Share2, Download, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAstrologyWorkspaceStore } from '@/stores/astrology-workspace-store';
import { AstrologyChartCanvas } from './astrology-chart-canvas';
import type { ChartFacts, AstrologyReport } from './astrology-types';

type AstrologyShareCardProps = {
  chartFacts: ChartFacts;
  report: AstrologyReport;
  className?: string;
};

export function AstrologyShareCard({ chartFacts, report, className }: AstrologyShareCardProps) {
  const reduceMotion = useReducedMotion();
  const formData = useAstrologyWorkspaceStore((s) => s.formData);
  const hasHouses = chartFacts.houses.length > 0;

  const [showName, setShowName] = useState(true);
  const [showBigThree, setShowBigThree] = useState(true);

  const displayName = showName ? formData.name || '匿名' : '匿名';
  // 未知/约时不稳定时不显示上升（无宫位时大三要素自动只显示已确定项）
  const bigThreeItems = [
    { label: '太阳', sign: chartFacts.bigThree.sun.label },
    { label: '月亮', sign: chartFacts.bigThree.moon.label },
    ...(hasHouses ? [{ label: '上升', sign: chartFacts.bigThree.ascendant.label }] : []),
  ];
  const generatedDate = new Date(chartFacts.calculatedAt).toLocaleDateString('zh-CN');

  return (
    <div className={className}>
      {/* 分享设置（实体白面板） */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/95 p-3 dark:border-white/10 dark:bg-slate-900/92">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">分享设置</span>
        <button
          type="button"
          onClick={() => setShowName((v) => !v)}
          aria-pressed={showName}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200/70 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800/50"
        >
          {showName ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {showName ? '显示昵称' : '匿名'}
        </button>
        <button
          type="button"
          onClick={() => setShowBigThree((v) => !v)}
          aria-pressed={showBigThree}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200/70 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800/50"
        >
          {showBigThree ? '显示核心要素' : '仅一句主轴'}
        </button>
        <span className="ml-auto text-[10px] text-slate-400">出生日期、时间、地点与度数不会公开</span>
      </div>

      {/* 分享卡本体 */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-[28px] border border-white/40 bg-gradient-to-br from-blue-600/90 via-indigo-600/90 to-violet-700/90 p-6 text-white shadow-[0_20px_40px_-15px_rgba(99,102,241,0.4)] sm:p-8"
      >
        {/* 背景星尘 */}
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <AstrologyChartCanvas chartFacts={chartFacts} hasHouses={false} size={400} className="absolute -right-16 -top-16 opacity-30" />
        </div>
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />

        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
            <Share2 className="h-3.5 w-3.5" />
            星座寰宇 · 本命星盘
          </div>

          <div className="mt-4 text-xl font-bold sm:text-2xl">{displayName}</div>

          {report.coreTone && (
            <p className="mt-3 max-w-md text-base font-medium leading-relaxed text-white/95 sm:text-lg">
              {report.coreTone}
            </p>
          )}

          {showBigThree && bigThreeItems.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {bigThreeItems.map((item) => (
                <span
                  key={item.label}
                  className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm"
                >
                  {item.label} · {item.sign}
                </span>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between text-[11px] text-white/60">
            <span>生成于 {generatedDate}</span>
            <span>内容用于自我探索与娱乐参考</span>
          </div>
        </div>
      </motion.div>

      {/* 保存操作 */}
      <button
        type="button"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-[0_4px_10px_-2px_rgba(59,130,246,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
        onClick={() => {
          /* 保存为图片：P0 由系统截图/长按保存；禁止导出原始出生资料/真值 */
        }}
      >
        <Download className="h-4 w-4" />
        保存分享卡
      </button>
      <p className="mt-2 text-[10px] text-slate-400">分享卡已脱敏；不提供原始出生资料、星盘真值或完整报告导出。</p>
    </div>
  );
}
