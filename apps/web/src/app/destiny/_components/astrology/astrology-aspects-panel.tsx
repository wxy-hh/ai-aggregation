'use client';

/**
 * 星座寰宇 · 关键相位面板（P0 深度探索）
 *
 * 把 3–5 条最有解释力的相位设计成「星体之间的关系卡」：两枚行星节点、一条相位线、
 * 能量关系、生活表现与练习建议。用克制的蓝/紫/玫瑰识别，不赋予好坏命运色彩。
 */

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AspectFact, PlanetBody } from './astrology-types';

const ASPECT_META: Record<string, { label: string; color: string; energy: string }> = {
  conjunction: { label: '合相', color: '#6366f1', energy: '两种能量融合、互相强化' },
  opposition: { label: '对冲', color: '#f43f5e', energy: '两极拉扯、需要整合' },
  square: { label: '刑相', color: '#f59e0b', energy: '内在摩擦、驱动成长' },
  trine: { label: '拱相', color: '#10b981', energy: '自然顺畅、天赋所在' },
  sextile: { label: '六合', color: '#06b6d4', energy: '温和助力、可主动把握' },
};

const PLANET_LABEL: Record<string, string> = {
  sun: '太阳', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星',
  jupiter: '木星', saturn: '土星', uranus: '天王星', neptune: '海王星', pluto: '冥王星',
};

type AstrologyAspectsPanelProps = {
  aspects: AspectFact[];
  /** 默认展示条数（可展开完整列表） */
  initialCount?: number;
  className?: string;
};

export function AstrologyAspectsPanel({ aspects, initialCount = 4, className }: AstrologyAspectsPanelProps) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  // 优先展示 orb 最小（最强）的相位
  const sorted = [...aspects].sort((a, b) => a.orb - b.orb);
  const visible = expanded ? sorted : sorted.slice(0, initialCount);

  if (aspects.length === 0) return null;

  return (
    <section className={className}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        关键相位
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((aspect, i) => {
          const meta = ASPECT_META[aspect.type] ?? ASPECT_META.conjunction;
          return (
            <motion.div
              key={`${aspect.planetA}-${aspect.planetB}-${aspect.type}`}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900/92"
            >
              {/* 两星体 + 相位线 */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    {PLANET_LABEL[aspect.planetA]?.slice(0, 1) ?? '?'}
                  </span>
                  <span className="mt-1 text-[10px] text-slate-500">{PLANET_LABEL[aspect.planetA]}</span>
                </div>
                <div className="relative flex-1">
                  <motion.div
                    className="h-px w-full"
                    style={{ backgroundColor: meta.color }}
                    initial={reduceMotion ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.35, delay: 0.1 + i * 0.05 }}
                  />
                  <span
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    {PLANET_LABEL[aspect.planetB]?.slice(0, 1) ?? '?'}
                  </span>
                  <span className="mt-1 text-[10px] text-slate-500">{PLANET_LABEL[aspect.planetB]}</span>
                </div>
              </div>

              {/* 能量关系 / 生活表现 / 练习建议 */}
              <div className="mt-3 space-y-1.5 text-[11px] leading-relaxed">
                <p className="text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">能量关系：</span>
                  {meta.energy}
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">生活表现：</span>
                  {PLANET_LABEL[aspect.planetA]}与{PLANET_LABEL[aspect.planetB]}的互动，可能在相关领域表现为{meta.energy.split('、')[1] ?? '持续的拉扯与整合'}。
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">练习建议：</span>
                  留意这对能量出现的场景，尝试用具体行动把它表达出来。
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {aspects.length > initialCount && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/60 px-4 text-xs font-semibold text-slate-600 transition-all hover:bg-white dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300"
        >
          {expanded ? '收起' : `展开完整列表（共 ${aspects.length} 条）`}
          <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')} />
        </button>
      )}
    </section>
  );
}
