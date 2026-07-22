'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { LeftNav, type DestinyModuleKey } from './left-nav';
import { destinyG3ShellClass } from './destiny-result-header';
import {
  DESTINY_NAV_LEFT_PX,
  DESTINY_NAV_WIDTH_PX,
  useDestinyNav,
} from './destiny-nav-context';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { cn } from '@/lib/utils';

const PANEL_EASE = [0.32, 0.72, 0, 1] as const;
const HIDE_X = -(DESTINY_NAV_WIDTH_PX + DESTINY_NAV_LEFT_PX);

/** 紫微结果态的入夜面板壳(暮色三段式的中间调:浅侧栏 → 深子导航 → 深空内容) */
const nightNavShellClass = cn(
  'relative overflow-hidden rounded-[32px] border border-[#E7C873]/15',
  'bg-[#0C1128]/85 backdrop-blur-xl lg:backdrop-blur-2xl',
  'shadow-[0_20px_40px_-16px_rgba(3,6,18,0.7),0_0_40px_rgba(139,92,246,0.10)]'
);

const toggleBtnClass = cn(
  'flex h-8 w-8 items-center justify-center rounded-full',
  'border border-white/55 bg-white/80 text-slate-400 shadow-[0_4px_12px_-6px_rgba(15,23,42,0.18)]',
  'backdrop-blur-sm transition-[color,background-color,border-color,box-shadow] duration-200',
  'hover:border-white/80 hover:bg-white/95 hover:text-slate-600 hover:shadow-[0_6px_16px_-8px_rgba(15,23,42,0.22)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4969E9]/20',
  'dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-500',
  'dark:hover:border-white/15 dark:hover:bg-slate-800/95 dark:hover:text-slate-300'
);

/** 收起按钮的入夜变体 */
const toggleBtnNightClass = cn(
  'border-[#E7C873]/25 bg-[#0C1128]/90 text-[#8B87A0]',
  'hover:border-[#E7C873]/45 hover:bg-[#151B38]/95 hover:text-[#E7C873]',
  'focus-visible:ring-[#A78BFA]/40',
  'dark:border-[#E7C873]/25 dark:bg-[#0C1128]/90 dark:text-[#8B87A0]',
  'dark:hover:border-[#E7C873]/45 dark:hover:bg-[#151B38]/95 dark:hover:text-[#E7C873]'
);

export function DestinyDesktopNav({
  activeModule,
  onModuleChange,
  disabled = false,
}: {
  activeModule: DestinyModuleKey;
  onModuleChange: (key: DestinyModuleKey) => void;
  disabled?: boolean;
}) {
  const { collapsed, toggleCollapsed } = useDestinyNav();
  const reduceMotion = useReducedMotion();
  // 紫微结果态:子导航随内容一起入夜,消除明度悬崖
  const ziweiInResult = useDestinyWorkspaceStore((s) => s.ziwei.step === 'result');
  const night = activeModule === 'ziwei' && ziweiInResult;

  const panelTransition = reduceMotion
    ? { duration: 0.01 }
    : { type: 'spring' as const, damping: 34, stiffness: 400, mass: 0.82 };

  const chipTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.26, ease: PANEL_EASE };

  return (
    <>
      <motion.div
        className={cn(
          'absolute left-6 top-6 bottom-6 z-20 hidden w-[280px] xl:block',
          disabled && 'pointer-events-none opacity-50'
        )}
        initial={false}
        animate={{ x: collapsed ? HIDE_X : 0 }}
        transition={panelTransition}
      >
        <div
          className={cn(
            'relative h-full w-full p-4 transition-[background-color,border-color,box-shadow] duration-500',
            night ? nightNavShellClass : destinyG3ShellClass
          )}
        >
          {/* 入夜时的顶部鎏金切线 */}
          {night && (
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E7C873]/50 to-transparent"
              aria-hidden
            />
          )}
          <LeftNav activeModule={activeModule} onModuleChange={onModuleChange} night={night} />

          <button
            type="button"
            aria-label="收起左侧导航"
            aria-expanded
            disabled={disabled}
            onClick={toggleCollapsed}
            className={cn(toggleBtnClass, 'absolute -right-2 top-[34px] z-10', night && toggleBtnNightClass)}
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {collapsed && !disabled ? (
          <motion.div
            key="destiny-nav-expand"
            className="pointer-events-none absolute inset-y-0 left-0 z-30 hidden xl:flex items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={chipTransition}
          >
            <motion.button
              type="button"
              aria-label="展开左侧导航"
              onClick={toggleCollapsed}
              className={cn(
                'pointer-events-auto group relative ml-0 flex min-h-[112px] w-11 flex-col items-center justify-center gap-1.5',
                'rounded-r-[22px] border border-l-0',
                'py-4 pl-1 pr-1.5 backdrop-blur-xl transition-[transform,box-shadow,background-color,border-color] duration-200',
                'focus-visible:outline-none focus-visible:ring-2',
                night
                  ? 'border-[#E7C873]/20 bg-[#0C1128]/90 shadow-[8px_0_32px_-12px_rgba(3,6,18,0.7)] hover:w-12 hover:shadow-[12px_0_36px_-10px_rgba(139,92,246,0.35)] focus-visible:ring-[#A78BFA]/40'
                  : 'border-white/70 bg-white/92 shadow-[8px_0_32px_-12px_rgba(15,23,42,0.22)] hover:w-12 hover:shadow-[12px_0_36px_-10px_rgba(73,105,233,0.28)] focus-visible:ring-[#4969E9]/30 dark:border-white/10 dark:bg-slate-900/92'
              )}
              initial={{ x: -56, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -56, opacity: 0 }}
              transition={chipTransition}
            >
              <span
                className={cn(
                  'absolute inset-y-3 left-0 w-[3px] rounded-full bg-gradient-to-b',
                  night
                    ? 'from-[#A78BFA]/80 via-[#E7C873]/70 to-[#A78BFA]/40'
                    : 'from-[#4969E9]/80 via-[#7B9BFF]/70 to-[#4969E9]/40'
                )}
                aria-hidden
              />
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-xl transition-colors',
                  night
                    ? 'bg-[#A78BFA]/15 text-[#C4B5FD] group-hover:bg-[#A78BFA]/25'
                    : 'bg-[#4969E9]/10 text-[#4969E9] group-hover:bg-[#4969E9]/15 dark:bg-indigo-500/15 dark:text-indigo-300'
                )}
              >
                <Sparkles className="h-4 w-4" />
              </span>
              <ChevronRight
                className={cn(
                  'h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5',
                  night
                    ? 'text-[#8B87A0] group-hover:text-[#E7C873]'
                    : 'text-slate-500 group-hover:text-[#4969E9] dark:text-slate-400'
                )}
                strokeWidth={2.25}
              />
              <span
                className={cn(
                  'text-[10px] font-bold tracking-[0.2em] [writing-mode:vertical-rl]',
                  night
                    ? 'text-[#6E6A86] group-hover:text-[#B9B3CC]'
                    : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                )}
              >
                导航
              </span>
            </motion.button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
