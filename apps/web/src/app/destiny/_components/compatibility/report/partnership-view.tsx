'use client';

import React from 'react';
import {
  Briefcase,
  MessageCircle,
  Shield,
  Sparkles,
} from 'lucide-react';
import { GlassCard } from '../../layout/glass-card';
import { RELATION_HERO_TITLE } from '../constants';
import {
  AttractionsList,
  FrictionsList,
  NeedsColumn,
  PrimaryActionBanner,
  RelationDuoScoreVisual,
  RelationHero,
  RelationViewProps,
  RhythmTimeline,
  DEFAULT_DIMENSION_TONE,
  DIMENSION_ICONS,
  DIMENSION_TONES,
  buildScoreHintText,
  dimensionTileBaseClass,
  reportCardClass,
  reportHeroRowClass,
} from './shared';
import { cn } from '@/lib/utils';

/** 合作仪表盘优先维度 */
const MATRIX_ORDER = [
  'alignment',
  'decision',
  'execution',
  'feedback',
  'risk',
  'credit',
] as const;

/**
 * 合作视角：专业决策 + 风险共识
 * - 首屏 ornate 双人主视觉（石墨蓝 × 紫折线，决策路径感）
 * - 六维矩阵 / 仪表盘语感
 * - 强调决策权、执行、风险边界
 */
export function PartnershipView({
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
    scoreBand === 'high' ? RELATION_HERO_TITLE.partnership : band.title;
  const hintText = buildScoreHintText(
    `${band.hint}（命盘底分 ${baseScore}）`,
    facts.scoreHints
  );

  const ordered = [...view.dimensions].sort((a, b) => {
    const ai = MATRIX_ORDER.indexOf(a.key as (typeof MATRIX_ORDER)[number]);
    const bi = MATRIX_ORDER.indexOf(b.key as (typeof MATRIX_ORDER)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const topRisk = view.frictions[0];
  const topStrength = view.attractions[0];

  return (
    <div className="grid grid-cols-12 gap-4 sm:gap-5">
      {/* 首屏：hero + KPI 侧栏等高 */}
      <div className={reportHeroRowClass}>
        <RelationHero
          variant="ornate"
          toneClass={cn(
            'border-slate-200/60 bg-gradient-to-br from-white/75 via-slate-50/50 to-violet-50/30',
            'shadow-[0_20px_40px_-15px_rgba(51,65,85,0.14),0_8px_20px_-10px_rgba(139,92,246,0.1)]',
            'supports-[backdrop-filter]:from-white/60 supports-[backdrop-filter]:via-slate-50/40',
            'dark:border-slate-500/20 dark:from-slate-900/85 dark:via-slate-900/70 dark:to-violet-950/25',
            'hover:border-slate-300/70 hover:shadow-[0_24px_48px_-18px_rgba(51,65,85,0.2),0_10px_24px_-12px_rgba(139,92,246,0.12)]',
            'dark:hover:border-slate-400/30'
          )}
          eyebrow={
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-slate-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 backdrop-blur-sm dark:border-slate-400/20 dark:bg-slate-400/15 dark:text-slate-300">
              <Briefcase className="h-3 w-3" />
              协作决策台
            </div>
          }
          title={title}
          oneLiner={view.oneLiner}
          hintText={hintText}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          visual={
            <RelationDuoScoreVisual
              theme="partnership"
              score={scoreShown}
              selfLabel="我"
              partnerLabel={partnerLabel.slice(0, 2)}
              scoreLabel="协作指数"
              baseScore={baseScore}
            />
          }
        />

        <div className="col-span-12 grid h-full grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          <GlassCard
            variant="standard"
            className={cn(
              reportCardClass,
              'flex h-full flex-col border-violet-100/60 dark:border-violet-400/10'
            )}
          >
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-violet-500">
              <Sparkles className="h-3.5 w-3.5" />
              互补战力
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {topStrength?.title ?? '优势待补充'}
            </div>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {topStrength?.detail ?? '生成后将展示最突出的互补点。'}
            </p>
          </GlassCard>
          <GlassCard
            variant="standard"
            className={cn(
              reportCardClass,
              'flex h-full flex-col border-orange-100/60 dark:border-orange-400/10'
            )}
          >
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-orange-500">
              <Shield className="h-3.5 w-3.5" />
              首要风险边界
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {topRisk?.trigger ?? '风险待补充'}
            </div>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {topRisk?.action || topRisk?.reaction || '生成后将展示优先协商点。'}
            </p>
          </GlassCard>
        </div>
      </div>

      {/* 六维矩阵仪表盘 */}
      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12')}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            协作能力矩阵
          </h3>
          <span className="text-[11px] text-slate-400">
            目标 · 决策 · 执行 · 反馈 · 风险 · 信用
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {ordered.map((d) => {
            const Icon = DIMENSION_ICONS[d.key] ?? Sparkles;
            const tone = DIMENSION_TONES[d.key] ?? DEFAULT_DIMENSION_TONE;
            return (
              <div
                key={d.key}
                className={cn(
                  dimensionTileBaseClass,
                  tone.tile,
                  // 有 note 时左对齐便于阅读说明；无 note 保持仪表盘居中
                  d.note ? 'flex flex-col text-left' : 'flex flex-col items-center text-center'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl',
                    tone.iconWrap,
                    d.note && 'self-start'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div
                  className={cn(
                    'mt-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300',
                    d.note && 'w-full'
                  )}
                >
                  {d.label}
                </div>
                <div
                  className={cn(
                    'mt-1 text-2xl font-black tabular-nums',
                    tone.score
                  )}
                >
                  {d.value}
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/55 dark:bg-slate-700/70">
                  <div
                    className={cn(
                      'h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out',
                      tone.bar
                    )}
                    style={{
                      width: `${Math.min(100, Math.max(0, d.value))}%`,
                    }}
                  />
                </div>
                {d.note ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {d.note}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* 分工 + 节奏 */}
      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-5')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          谁更适合负责什么
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <NeedsColumn
            title="我"
            tone="violet"
            items={view.needs.self.map((n) => ({
              title: n.text,
              detail: n.why,
            }))}
          />
          <NeedsColumn
            title="TA"
            tone="indigo"
            items={view.needs.partner.map((n) => ({
              title: n.text,
              detail: n.why,
            }))}
          />
        </div>
      </GlassCard>

      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-7')}
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/12 text-violet-600">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            协作推进节奏
          </h3>
        </div>
        <RhythmTimeline rhythm={view.rhythm} layout="horizontal" />
      </GlassCard>

      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-6')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          互补战力
        </h3>
        <AttractionsList
          attractions={view.attractions}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          iconWrapClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
        />
      </GlassCard>

      <GlassCard
        variant="standard"
        className={cn(reportCardClass, 'col-span-12 lg:col-span-6')}
      >
        <h3 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100">
          协作摩擦点
        </h3>
        <FrictionsList
          frictions={view.frictions}
          whyOpen={whyOpen}
          onToggleWhy={onToggleWhy}
          iconAClass="bg-slate-500/10 text-slate-600 dark:text-slate-300"
          iconBClass="bg-orange-500/10 text-orange-500"
        />
      </GlassCard>

      <PrimaryActionBanner
        title="本周可推进的协作动作"
        action={primaryAction}
        onToggleAction={onToggleAction}
        disclaimers={view.disclaimers}
        doneClass="bg-gradient-to-br from-slate-600 to-violet-600 text-white shadow-[0_8px_16px_-6px_rgba(100,116,139,0.55)]"
        idleClass="border-2 border-violet-500/40 bg-violet-50/80 text-violet-600 backdrop-blur-sm hover:scale-105 dark:border-violet-400/40 dark:bg-violet-500/10 dark:text-violet-300"
        ctaClass="text-violet-600 dark:text-violet-300"
      />
    </div>
  );
}
