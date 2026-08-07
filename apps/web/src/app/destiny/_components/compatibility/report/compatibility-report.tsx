'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  destinySecondaryBtnClass,
} from '../../layout/destiny-result-header';
import {
  RELATION_LABEL,
  RELATION_OPTIONS,
  SCORE_BAND_COPY,
} from '../constants';
import { computeRelationFeelScore, calibrateScore } from '../score';
import type { CompatibilityReport, RelationType } from '../types';
import { CompatibilityShareEntry } from '../share/compatibility-share-entry';
import { reportBarClass } from './shared';
import { RelationViewLoading } from './relation-view-loading';
import { RomanceView } from './romance-view';
import { MarriageView } from './marriage-view';
import { FriendshipView } from './friendship-view';
import { PartnershipView } from './partnership-view';

type Props = {
  report: CompatibilityReport;
  activeRelation: RelationType;
  loadingView?: boolean;
  /** 视角切换请求失败时的错误文案 */
  error?: string | null;
  onBack: () => void;
  onOpenMyBazi: () => void;
  onRelationChange: (next: RelationType) => void;
  onToggleAction: (actionId: string) => void;
  onRefill: () => void;
};

/** 关系类型 → 摘要条徽章色 */
const RELATION_BADGE: Record<RelationType, string> = {
  romance:
    'border-rose-200/50 bg-rose-500/10 text-rose-500 dark:border-rose-400/20 dark:bg-rose-400/15 dark:text-rose-300',
  marriage:
    'border-indigo-200/50 bg-indigo-500/10 text-indigo-600 dark:border-indigo-400/20 dark:bg-indigo-400/15 dark:text-indigo-300',
  friendship:
    'border-emerald-200/50 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/15 dark:text-emerald-300',
  partnership:
    'border-violet-200/50 bg-violet-500/10 text-violet-600 dark:border-violet-400/20 dark:bg-violet-400/15 dark:text-violet-300',
};

/**
 * 合盘结果壳层：
 * - 顶栏 / 资料摘要 / 关系 Tabs 四视角共用
 * - 未缓存视角：点击即切换并请求（viewOnly），展示主题化 loading，无二次确认；与首开一样计费
 * - 内容区按 activeRelation 切换到差异化版式（恋爱/婚姻/朋友/合作）
 */
export function CompatibilityReportView({
  report,
  activeRelation,
  loadingView,
  error,
  onBack,
  onOpenMyBazi,
  onRelationChange,
  onToggleAction,
  onRefill,
}: Props) {
  const view = report.views[activeRelation];
  const facts = report.chartFacts;
  // 本视角适配分：命盘底分 + 关系事实偏置 + 六维加权（确定性，随 tab 变化）
  const feel = view
    ? computeRelationFeelScore(facts, activeRelation, view.dimensions)
    : { score: facts.score, scoreBand: facts.scoreBand, dimAverage: null, bias: 0 };
  const band = SCORE_BAND_COPY[feel.scoreBand];
  const [whyOpen, setWhyOpen] = useState<string | null>(null);
  const [scoreShown, setScoreShown] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  const baseSectionRef = useRef<HTMLDivElement>(null);

  const handleRelationTabClick = (next: RelationType) => {
    if (next === activeRelation || loadingView) return;
    onRelationChange(next);
    // 未缓存视角会进入 loading：滚到内容区，避免用户以为没反应
    if (!report.views[next]) {
      window.requestAnimationFrame(() => {
        baseSectionRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    }
  };

  useEffect(() => {
    const prefersReduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) {
      setScoreShown(feel.score);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const duration = 500;
    const target = feel.score;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setScoreShown(Math.round(target * p));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [feel.score, activeRelation]);

  // 切换视角时收起"为什么"，避免 id 串台
  useEffect(() => {
    setWhyOpen(null);
  }, [activeRelation]);

  const partnerLabel = report.partnerDisplayName || 'TA';
  const focusLabel = report.focusTags?.[0];

  const handleToggleWhy = (id: string) => {
    setWhyOpen((prev) => (prev === id ? null : id));
  };

  const relationViewProps = view
    ? {
        view,
        facts,
        band,
        scoreBand: feel.scoreBand,
        scoreShown,
        baseScore: calibrateScore(facts.score),
        partnerLabel,
        whyOpen,
        onToggleWhy: handleToggleWhy,
        onToggleAction,
      }
    : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 pb-6 sm:gap-5">
          {/* 顶栏：返回 + 标题 + 操作 */}
          <header
            className={cn(
              reportBarClass,
              'flex flex-wrap items-center justify-between gap-3',
              'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px',
              'before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent',
              'relative overflow-hidden'
            )}
          >
            <div className="relative z-[1] flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-11 min-w-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-slate-500 transition-all duration-200 hover:bg-white/70 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">返回</span>
              </button>
              <span className="hidden text-sm text-slate-300 dark:text-slate-600 sm:inline">
                /
              </span>
              <h1 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100 sm:text-base">
                八字合盘
              </h1>
            </div>

            <div className="relative z-[1] flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onOpenMyBazi}
                className={cn(
                  destinySecondaryBtnClass,
                  'h-10 px-3 text-xs text-blue-600 dark:text-blue-400 sm:px-4 sm:text-sm'
                )}
              >
                <span className="sm:hidden">我的八字</span>
                <span className="hidden sm:inline">查看我的八字报告</span>
              </button>
              <CompatibilityShareEntry
                report={report}
                activeRelation={activeRelation}
                loadingView={loadingView}
              />
            </div>
          </header>

          {/* 双方资料摘要条 */}
          <div
            className={cn(
              reportBarClass,
              'flex flex-wrap items-center justify-between gap-3'
            )}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white shadow-[0_4px_12px_-2px_rgba(59,130,246,0.45)]">
                  我
                </span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  我 × {partnerLabel}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-500 text-[11px] font-bold text-white shadow-[0_4px_12px_-2px_rgba(244,63,94,0.4)]">
                  {partnerLabel.slice(0, 2)}
                </span>
              </div>

              <span
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm',
                  RELATION_BADGE[activeRelation]
                )}
              >
                {RELATION_LABEL[activeRelation]}
              </span>

              {facts.completeness.labels[0] ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 backdrop-blur-sm dark:border-amber-400/20 dark:text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
                  {facts.completeness.labels[0]}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 backdrop-blur-sm dark:border-emerald-400/20 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.55)]" />
                  双方资料完整
                </span>
              )}
            </div>

            {focusLabel ? (
              <div className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/60 bg-white/50 px-3 text-[11px] font-medium text-slate-500 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-400">
                当前关注：{focusLabel}
              </div>
            ) : null}
          </div>

          {/* 关系类型 Tabs：未缓存直接请求，无二次确认 */}
          <div
            className={cn(
              'flex gap-0 overflow-x-auto rounded-2xl border border-white/50 bg-white/45 px-1 backdrop-blur-xl',
              'supports-[backdrop-filter]:bg-white/35',
              'dark:border-white/10 dark:bg-slate-900/50 dark:supports-[backdrop-filter]:bg-slate-900/40'
            )}
            role="tablist"
            aria-busy={loadingView || undefined}
          >
            {RELATION_OPTIONS.map((opt) => {
              const active = activeRelation === opt.key;
              const ready = Boolean(report.views[opt.key]);
              const loadingThis = Boolean(loadingView && active && !ready);
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-busy={loadingThis || undefined}
                  disabled={Boolean(loadingView) && !active}
                  onClick={() => handleRelationTabClick(opt.key)}
                  className={cn(
                    'relative min-h-[44px] min-w-[4.5rem] flex-1 rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500/50',
                    active
                      ? 'bg-white/70 text-blue-600 shadow-[0_2px_8px_-2px_rgba(59,130,246,0.2)] dark:bg-slate-800/70 dark:text-blue-400'
                      : 'text-slate-400 hover:bg-white/40 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-slate-300',
                    loadingView && !active && 'cursor-not-allowed opacity-55'
                  )}
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    {opt.label}
                    {loadingThis ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin text-blue-500"
                        aria-hidden
                      />
                    ) : null}
                    {!ready && !loadingThis ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600"
                        title="尚未生成该视角"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-6 bottom-1.5 h-[2.5px] rounded-full bg-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div ref={baseSectionRef} />

          {error && !loadingView ? (
            <div
              role="alert"
              className={cn(
                'rounded-2xl border border-rose-200/60 px-4 py-3 text-sm leading-relaxed',
                'bg-rose-50/70 text-rose-700 backdrop-blur-xl',
                'dark:border-rose-400/20 dark:bg-rose-950/40 dark:text-rose-200'
              )}
            >
              {error}
            </div>
          ) : null}

          <AnimatePresence mode="wait">
            {loadingView || !view || !relationViewProps ? (
              <motion.div
                key={`loading-${activeRelation}`}
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.18,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                <RelationViewLoading
                  relation={activeRelation}
                  partnerLabel={partnerLabel}
                />
              </motion.div>
            ) : (
              <motion.div
                key={activeRelation}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.12,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                {activeRelation === 'romance' ? (
                  <RomanceView {...relationViewProps} />
                ) : null}
                {activeRelation === 'marriage' ? (
                  <MarriageView {...relationViewProps} />
                ) : null}
                {activeRelation === 'friendship' ? (
                  <FriendshipView {...relationViewProps} />
                ) : null}
                {activeRelation === 'partnership' ? (
                  <PartnershipView {...relationViewProps} />
                ) : null}

                {/* 次操作：重新填写 */}
                <div className="mt-4 flex w-full justify-center">
                  <button
                    type="button"
                    onClick={onRefill}
                    className="flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium text-slate-500 transition hover:bg-white/50 dark:hover:bg-white/5"
                  >
                    <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                    <span>重新填写资料</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
