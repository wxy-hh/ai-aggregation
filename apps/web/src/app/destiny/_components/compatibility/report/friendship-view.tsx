'use client';

import React from 'react';
import { MessageCircle, Sparkles, Users } from 'lucide-react';
import { GlassCard } from '../../layout/glass-card';
import { RELATION_HERO_TITLE } from '../constants';
import {
  DimensionGrid,
  NeedsColumn,
  PrimaryActionBanner,
  RelationDuoScoreVisual,
  RelationHero,
  RelationViewProps,
  RhythmTimeline,
  WhyNote,
  buildScoreHintText,
  reportCardClass,
  reportBarClass,
  reportHeroRowClass,
  reportSideCardClass,
} from './shared';
import { cn } from '@/lib/utils';

/**
 * 朋友视角：轻松 + 边界感
 * - 首屏 ornate 双人主视觉（青绿虚线轻连，呼应「留有余地」）
 * - 轻量社交卡片：吸引/摩擦用 chip 流而非严肃列表
 * - 节奏用横向卡片，与 hero 等高对齐
 * - 纵向分区优先，卡片按内容高度收紧
 */
export function FriendshipView({
  view,
  facts,
  band,
  scoreBand,
  scoreShown,
  baseScore,
  partnerLabel,
  whyOpen,
  onToggleWhy,
  onToggleAction,
}: RelationViewProps) {
  const primaryAction = view.weeklyActions?.[0];
  const title =
    scoreBand === 'high' ? RELATION_HERO_TITLE.friendship : band.title;
  const hintText = buildScoreHintText(
    `${band.hint}（命盘底分 ${baseScore}）`,
    facts.scoreHints
  );
  // 吸引点通常 2 条（上限 3）：按条数自适应列数，避免 3 列只填 2 格留空
  const attractionCols =
    view.attractions.length >= 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2';
  const hasDimensionNotes = view.dimensions.some((d) => Boolean(d.note));

  return (
    <div className="grid grid-cols-12 gap-4 sm:gap-5">
      {/* 首屏：左右等高对齐 */}
      <div className={reportHeroRowClass}>
        <RelationHero
          variant="ornate"
          toneClass={cn(
            'border-emerald-200/55 bg-gradient-to-br from-white/75 via-emerald-50/40 to-teal-50/25',
            'shadow-[0_20px_40px_-15px_rgba(16,185,129,0.16),0_8px_20px_-10px_rgba(20,184,166,0.08)]',
            'supports-[backdrop-filter]:from-white/60 supports-[backdrop-filter]:via-emerald-50/30',
            'dark:border-emerald-400/15 dark:from-slate-900/80 dark:via-emerald-950/30 dark:to-teal-950/15',
            'hover:border-emerald-200/70 hover:shadow-[0_24px_48px_-18px_rgba(16,185,129,0.22)]',
            'dark:hover:border-emerald-400/25'
          )}
          eyebrow={
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200/50 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 backdrop-blur-sm dark:border-emerald-400/20 dark:bg-emerald-400/15 dark:text-emerald-300">
              <Users className="h-3 w-3" />
              轻松相处 · 留有余地
            </div>
          }
          title={title}
          oneLiner={view.oneLiner}
          hintText={hintText}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          visual={
            <RelationDuoScoreVisual
              theme="friendship"
              score={scoreShown}
              selfLabel="我"
              partnerLabel={partnerLabel.slice(0, 2)}
              scoreLabel="相处舒适度"
              baseScore={baseScore}
            />
          }
        />

        <GlassCard variant="standard" className={reportSideCardClass}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/12 text-teal-600">
                <MessageCircle className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                联系与充电节奏
              </h3>
            </div>
            <span className="text-[10px] font-medium text-teal-500">未来一年</span>
          </div>
          <div className="min-h-0 flex-1">
            <RhythmTimeline rhythm={view.rhythm} layout="horizontal" />
          </div>
        </GlassCard>
      </div>

      {/* 社交 chip 流：为什么合得来 */}
      <section className="col-span-12">
        <div className="mb-3 flex items-center gap-2 px-0.5">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            为什么合得来
          </h3>
          <span className="text-[11px] text-slate-400">轻量社交卡片</span>
        </div>
        <div className={cn('grid gap-3', attractionCols)}>
          {view.attractions.map((a, i) => (
            <div
              key={i}
              className={cn(
                reportBarClass,
                'flex flex-col gap-2 border-emerald-100/60 dark:border-emerald-400/10'
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                  {i % 2 === 0 ? (
                    <Sparkles className="h-3.5 w-3.5" />
                  ) : (
                    <Users className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {a.title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {a.detail}
                  </p>
                  <WhyNote
                    id={`attr-${i}`}
                    why={a.why}
                    whyOpen={whyOpen}
                    onToggle={onToggleWhy}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 默契图谱：通栏主卡 */}
      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 xl:col-span-8')}
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            友谊默契图谱
          </h3>
        </div>
        <DimensionGrid
          dimensions={view.dimensions}
          columnsClass="grid-cols-2 sm:grid-cols-3"
          showNote={hasDimensionNotes}
        />
      </GlassCard>

      {/* 互相充电 */}
      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 xl:col-span-4')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          你们怎样互相充电
        </h3>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-1">
          <NeedsColumn
            title="我"
            tone="emerald"
            items={view.needs.self.map((n) => ({
              title: n.text,
              detail: n.why,
            }))}
          />
          <NeedsColumn
            title="TA"
            tone="blue"
            items={view.needs.partner.map((n) => ({
              title: n.text,
              detail: n.why,
            }))}
          />
        </div>
      </GlassCard>

      {/* 边界提醒：降低严肃感 */}
      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12')}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            别把友谊处成负担
          </h3>
          <span className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-300">
            边界 · 互惠
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {view.frictions.map((f, i) => (
            <div
              key={i}
              className="rounded-2xl border border-teal-100/60 bg-white/50 p-3.5 backdrop-blur-md dark:border-teal-400/10 dark:bg-slate-950/40"
            >
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {f.trigger}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {f.action || f.reaction}
              </p>
              <WhyNote
                id={`fric-${i}`}
                why={f.why}
                whyOpen={whyOpen}
                onToggle={onToggleWhy}
              />
            </div>
          ))}
        </div>
      </GlassCard>

      <PrimaryActionBanner
        title="本周轻松联系一次"
        action={primaryAction}
        onToggleAction={onToggleAction}
        disclaimers={view.disclaimers}
        doneClass="bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_8px_16px_-6px_rgba(16,185,129,0.55)]"
        idleClass="border-2 border-emerald-500/40 bg-emerald-50/80 text-emerald-600 backdrop-blur-sm hover:scale-105 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300"
      />
    </div>
  );
}
