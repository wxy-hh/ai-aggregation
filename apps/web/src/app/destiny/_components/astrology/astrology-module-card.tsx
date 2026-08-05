'use client';

/**
 * 星座寰宇 · 生活模块卡
 *
 * 五个生活模块（我是谁/关系/事业/优势/本周行动）的通用卡片。
 * 默认正文克制，可展开「盘面依据」定位到对应星体/宫位/相位事实。
 * 高对比实体底，标题 + 短标签 + 一段结论。
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type AstrologyModuleCardProps = {
  title: string;
  icon?: React.ReactNode;
  summary: string;
  tags?: string[];
  /** 展开后的盘面依据（已确认事实列表） */
  basis?: string[];
  /** 默认是否展开（移动端首屏默认展开前三张） */
  defaultOpen?: boolean;
  accentClass?: string;
  className?: string;
};

export function AstrologyModuleCard({
  title,
  icon,
  summary,
  tags = [],
  basis = [],
  defaultOpen = false,
  accentClass = 'text-indigo-500 dark:text-indigo-400',
  className,
}: AstrologyModuleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5',
        'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)] transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08)]',
        'dark:border-white/10 dark:bg-slate-900/92',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/60', accentClass)}>{icon}</span>}
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        </div>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{summary}</p>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-200/70 bg-slate-50/70 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {basis.length > 0 && (
        <div className="mt-3 border-t border-slate-200/60 pt-2.5 dark:border-white/10">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-h-11 w-full items-center justify-between text-left"
          >
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">展开依据</span>
            <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
          </button>
          <AnimatePresence>
            {open && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-1.5 overflow-hidden pb-1"
              >
                {basis.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                    {item}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
