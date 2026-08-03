'use client';

import React from 'react';
import { Heart, Sparkles } from 'lucide-react';
import { GlassCard } from '../../layout/glass-card';
import { RELATION_HERO_TITLE } from '../constants';
import {
  AttractionsList,
  DimensionGrid,
  FrictionsList,
  NeedsColumn,
  PrimaryActionBanner,
  RelationDuoScoreVisual,
  RelationHero,
  RelationViewProps,
  RhythmTimeline,
  buildScoreHintText,
  reportCardClass,
  reportHeroRowClass,
  reportSideCardClass,
} from './shared';
import { cn } from '@/lib/utils';

/**
 * 恋爱视角：温度感 + 暧昧张力
 * - 首屏 ornate 大图（我—分数环—TA，玫粉 × 暖金流线）
 * - 节奏用横向"心跳式"卡片，弱化严肃打分感
 * - 强调靠近方式与情感表达
 */
export function RomanceView({
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
    scoreBand === 'high' ? RELATION_HERO_TITLE.romance : band.title;
  const hintText = buildScoreHintText(
    `${band.hint}（命盘底分 ${baseScore}）`,
    facts.scoreHints
  );
  const hasDimensionNotes = view.dimensions.some((d) => Boolean(d.note));

  return (
    <div className="grid grid-cols-12 gap-4 sm:gap-5">
      {/* 首屏：左右等高对齐 */}
      <div className={reportHeroRowClass}>
        <RelationHero
          variant="ornate"
          toneClass={cn(
            'border-rose-200/55 bg-gradient-to-br from-white/75 via-rose-50/45 to-amber-50/30',
            'shadow-[0_20px_40px_-15px_rgba(244,63,94,0.16),0_8px_20px_-10px_rgba(245,158,11,0.08)]',
            'supports-[backdrop-filter]:from-white/60 supports-[backdrop-filter]:via-rose-50/35',
            'dark:border-rose-400/15 dark:from-slate-900/80 dark:via-rose-950/35 dark:to-amber-950/20',
            'hover:border-rose-200/70 hover:shadow-[0_24px_48px_-18px_rgba(244,63,94,0.22),0_10px_24px_-12px_rgba(245,158,11,0.1)]',
            'dark:hover:border-rose-400/25'
          )}
          eyebrow={
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-rose-200/50 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-500 backdrop-blur-sm dark:border-rose-400/20 dark:bg-rose-400/15 dark:text-rose-300">
              <Heart className="h-3 w-3" />
              恋爱靠近方式
            </div>
          }
          title={title}
          oneLiner={view.oneLiner}
          hintText={hintText}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          visual={
            <RelationDuoScoreVisual
              theme="romance"
              score={scoreShown}
              selfLabel="我"
              partnerLabel={partnerLabel.slice(0, 2)}
              scoreLabel="合拍指数"
              baseScore={baseScore}
            />
          }
        />

        {/* 心跳式节奏：与 hero 等高拉伸 */}
        <GlassCard variant="standard" className={reportSideCardClass}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              靠近节奏心跳
            </h3>
            <span className="text-[10px] font-medium text-rose-400">未来一年</span>
          </div>
          <div className="min-h-0 flex-1">
            <RhythmTimeline rhythm={view.rhythm} layout="horizontal" />
          </div>
        </GlassCard>
      </div>

      {/* 情感表达六维：2 列更聚焦表达/亲密 */}
      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 xl:col-span-8')}
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/12 text-rose-500">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            恋爱默契图谱
          </h3>
        </div>
        <DimensionGrid
          dimensions={view.dimensions}
          columnsClass="grid-cols-2 sm:grid-cols-3"
          showNote={hasDimensionNotes}
        />
      </GlassCard>

      {/* 如何感到被爱：双向需求 */}
      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 xl:col-span-4')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          你们如何感到被爱
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <NeedsColumn
            title="我"
            tone="blue"
            items={view.needs.self.map((n) => ({
              title: n.text,
              detail: n.why,
            }))}
          />
          <NeedsColumn
            title="TA"
            tone="rose"
            items={view.needs.partner.map((n) => ({
              title: n.text,
              detail: n.why,
            }))}
          />
        </div>
      </GlassCard>

      {/* 吸引 + 相处提醒：恋爱语感 */}
      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-6')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          彼此吸引
        </h3>
        <AttractionsList
          attractions={view.attractions}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          iconWrapClass="bg-rose-500/10 text-rose-500"
        />
      </GlassCard>

      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-6')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          相处提醒
        </h3>
        <FrictionsList
          frictions={view.frictions}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          iconAClass="bg-amber-500/10 text-amber-600"
          iconBClass="bg-rose-500/10 text-rose-500"
        />
      </GlassCard>

      <PrimaryActionBanner
        title="今天就能靠近一点"
        action={primaryAction}
        onToggleAction={onToggleAction}
        disclaimers={view.disclaimers}
        doneClass="bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-[0_8px_16px_-6px_rgba(244,63,94,0.55)]"
        idleClass="border-2 border-rose-500/40 bg-rose-50/80 text-rose-600 backdrop-blur-sm hover:scale-105 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-300"
      />
    </div>
  );
}
