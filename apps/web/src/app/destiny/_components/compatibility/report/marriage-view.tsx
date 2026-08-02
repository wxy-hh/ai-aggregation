'use client';

import React from 'react';
import {
  Briefcase,
  Home,
  Shield,
  Sparkles,
  Wallet,
} from 'lucide-react';
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

/** 婚姻看板优先展示的维度 key（分工 / 财务 / 边界） */
const BOARD_KEYS = new Set(['chores', 'finance', 'boundary']);

const BOARD_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  chores: Briefcase,
  finance: Wallet,
  boundary: Shield,
};

/**
 * 婚姻视角：稳定经营 + 共同生活
 * - 首屏 ornate 双人主视觉（靛蓝 × 暖金稳弧，托底感）
 * - 分工/财务/边界用看板卡片置顶
 * - 节奏时间线强调中长期规划，与 hero 等高对齐
 */
export function MarriageView({
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
    scoreBand === 'high' ? RELATION_HERO_TITLE.marriage : band.title;
  const hintText = buildScoreHintText(
    `${band.hint}（命盘底分 ${baseScore}）`,
    facts.scoreHints
  );

  const boardDims = view.dimensions.filter((d) => BOARD_KEYS.has(d.key));
  const otherDims = view.dimensions.filter((d) => !BOARD_KEYS.has(d.key));
  const otherOrAll = otherDims.length > 0 ? otherDims : view.dimensions;
  const hasOtherDimensionNotes = otherOrAll.some((d) => Boolean(d.note));

  return (
    <div className="grid grid-cols-12 gap-4 sm:gap-5">
      {/* 首屏：左右等高对齐 */}
      <div className={reportHeroRowClass}>
        <RelationHero
          variant="ornate"
          toneClass={cn(
            'border-indigo-200/55 bg-gradient-to-br from-white/75 via-indigo-50/40 to-amber-50/25',
            'shadow-[0_20px_40px_-15px_rgba(79,70,229,0.16),0_8px_20px_-10px_rgba(245,158,11,0.08)]',
            'supports-[backdrop-filter]:from-white/60 supports-[backdrop-filter]:via-indigo-50/30',
            'dark:border-indigo-400/15 dark:from-slate-900/80 dark:via-indigo-950/35 dark:to-amber-950/15',
            'hover:border-indigo-200/70 hover:shadow-[0_24px_48px_-18px_rgba(79,70,229,0.22)]',
            'dark:hover:border-indigo-400/25'
          )}
          eyebrow={
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-indigo-200/50 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600 backdrop-blur-sm dark:border-indigo-400/20 dark:bg-indigo-400/15 dark:text-indigo-300">
              <Home className="h-3 w-3" />
              共同生活经营
            </div>
          }
          title={title}
          oneLiner={view.oneLiner}
          hintText={hintText}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          visual={
            <RelationDuoScoreVisual
              theme="marriage"
              score={scoreShown}
              selfLabel="我"
              partnerLabel={partnerLabel.slice(0, 2)}
              scoreLabel="经营稳度"
              baseScore={baseScore}
            />
          }
        />

        <GlassCard variant="standard" className={reportSideCardClass}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              中长期生活节奏
            </h3>
            <span className="text-[10px] font-medium text-indigo-400">共同经营</span>
          </div>
          <div className="min-h-0 flex-1">
            <RhythmTimeline rhythm={view.rhythm} layout="horizontal" />
          </div>
        </GlassCard>
      </div>

      {/* 看板：日常分工 / 财务 / 边界 */}
      <section className="col-span-12">
        <div className="mb-3 flex items-center gap-2 px-0.5">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            生活经营看板
          </h3>
          <span className="text-[11px] text-slate-400">分工 · 财务 · 边界</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(boardDims.length > 0 ? boardDims : view.dimensions.slice(0, 3)).map(
            (d) => {
              const Icon = BOARD_ICON[d.key] ?? Sparkles;
              return (
                <GlassCard
                  key={d.key}
                  variant="standard"
                  className={cn(
                    reportCardClass,
                    'border-indigo-100/60 dark:border-indigo-400/10'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {d.label}
                        </div>
                        <div className="text-[11px] text-slate-400">经营重点</div>
                      </div>
                    </div>
                    <span className="text-xl font-black tabular-nums text-indigo-600 dark:text-indigo-300">
                      {d.value}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100/70 dark:bg-indigo-950/50">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-amber-400 transition-[width] duration-500 ease-out"
                      style={{
                        width: `${Math.min(100, Math.max(0, d.value))}%`,
                      }}
                    />
                  </div>
                  {d.note ? (
                    <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {d.note}
                    </p>
                  ) : (
                    <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
                      把这项放进日常规则，比临时协商更稳。
                    </p>
                  )}
                </GlassCard>
              );
            }
          )}
        </div>
      </section>

      {/* 其余维度 + 双向需求 */}
      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-7')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          婚姻协作图谱
        </h3>
        <DimensionGrid
          dimensions={otherOrAll}
          columnsClass="grid-cols-2 sm:grid-cols-3"
          showNote={hasOtherDimensionNotes}
        />
      </GlassCard>

      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-5')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          你们怎样把日子过顺
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <NeedsColumn
            title="我"
            tone="indigo"
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

      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-6')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          互补与托底
        </h3>
        <AttractionsList
          attractions={view.attractions}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          iconWrapClass="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
        />
      </GlassCard>

      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-6')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          容易卡住的日常
        </h3>
        <FrictionsList
          frictions={view.frictions}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          iconAClass="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
          iconBClass="bg-amber-500/10 text-amber-600"
        />
      </GlassCard>

      <PrimaryActionBanner
        title="本周可落地的一件家事"
        action={primaryAction}
        onToggleAction={onToggleAction}
        disclaimers={view.disclaimers}
        doneClass="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-[0_8px_16px_-6px_rgba(79,70,229,0.55)]"
        idleClass="border-2 border-indigo-500/40 bg-indigo-50/80 text-indigo-600 backdrop-blur-sm hover:scale-105 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-300"
        ctaClass="text-indigo-600 dark:text-indigo-300"
      />
    </div>
  );
}
