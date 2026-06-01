'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { PartialDestinyReport } from '../types';
import { CoreToneCard } from './core-tone-card';
import { PillarsCard } from './pillars-card';
import { BaziBasisCard } from './bazi-basis-card';
import { DataOverviewCard } from './data-overview-card';
import { DecadeFortuneCard } from './decade-fortune-card';
import { PersonalityDashboardCard } from './personality-dashboard-card';
import { LifeSummaryCard } from './life-summary-card';
import { SectionReveal, SectionBlockSkeleton } from './section-reveal';
import { BAZI_SECTION_IDS } from './chart-section-nav';

export function ChartCenterPanel({
  report,
  streaming = false,
  className,
}: {
  report: PartialDestinyReport;
  streaming?: boolean;
  className?: string;
}) {
  const profile = report.profile;
  const coreTone = report.coreTone;
  const baziBasis = report.baziBasis;
  const pillars = report.pillars ?? [];
  const balanceInsight = report.balanceInsight;
  const patternHighlights = report.patternHighlights ?? [];
  const lifeDimensions = report.lifeDimensions ?? [];
  const lifeDimensionHighlights = report.lifeDimensionHighlights;
  const tenGodDomains = report.tenGodDomains ?? [];
  const personalityModule = report.modules?.personality;

  const hasCoreTone = Boolean(coreTone?.headline?.trim());
  const hasPillars = pillars.length > 0 && pillars.every((p) => 'stem' in p && p.stem);
  const hasTenGodDomains =
    tenGodDomains.length === 5 && tenGodDomains.every((item) => Boolean(item.description?.trim()));
  const hasLifeSummary =
    (lifeDimensions.length > 0 && lifeDimensions.some((d) => d.value > 0)) ||
    Boolean(
      lifeDimensionHighlights?.strength?.trim() || lifeDimensionHighlights?.caution?.trim()
    ) ||
    Boolean(personalityModule?.summary?.trim());

  return (
    <div className={cn('flex min-h-0 flex-col gap-4 sm:gap-6', className)}>
      <div id={BAZI_SECTION_IDS.tone} className="scroll-mt-3">
        <SectionReveal
          ready={hasCoreTone || Boolean(profile)}
          streaming={streaming}
          delayIndex={0}
          skeleton={<SectionBlockSkeleton lines={4} />}
        >
          <CoreToneCard coreTone={coreTone} />
        </SectionReveal>
      </div>

      <div id={BAZI_SECTION_IDS.pillars} className="scroll-mt-3">
        <SectionReveal
          ready={hasPillars || Boolean(profile)}
          streaming={streaming}
          delayIndex={1}
          skeleton={<SectionBlockSkeleton lines={3} />}
        >
          <PillarsCard
            pillars={pillars}
            balanceInsight={balanceInsight}
            patternHighlights={patternHighlights}
            baziBasis={baziBasis}
          />
        </SectionReveal>
      </div>

      <div id={BAZI_SECTION_IDS.basis} className="scroll-mt-3">
        <SectionReveal
          ready={Boolean(baziBasis)}
          streaming={streaming}
          delayIndex={2}
          skeleton={<SectionBlockSkeleton lines={2} />}
        >
          {baziBasis ? <BaziBasisCard baziBasis={baziBasis} /> : null}
        </SectionReveal>
      </div>

      <div id={BAZI_SECTION_IDS.elements} className="scroll-mt-3">
        <SectionReveal
          ready={Boolean(baziBasis)}
          streaming={streaming}
          delayIndex={3}
          skeleton={<SectionBlockSkeleton lines={3} />}
        >
          {baziBasis ? <DataOverviewCard baziBasis={baziBasis} /> : null}
        </SectionReveal>
      </div>

      <div id={BAZI_SECTION_IDS.decade} className="scroll-mt-3">
        <SectionReveal
          ready={Boolean(baziBasis)}
          streaming={streaming}
          delayIndex={4}
          skeleton={<SectionBlockSkeleton lines={4} />}
        >
          {baziBasis ? <DecadeFortuneCard baziBasis={baziBasis} /> : null}
        </SectionReveal>
      </div>

      <div id={BAZI_SECTION_IDS.personality} className="scroll-mt-3">
        <SectionReveal
          ready={hasTenGodDomains || !streaming}
          streaming={streaming && !hasTenGodDomains}
          delayIndex={5}
          skeleton={<SectionBlockSkeleton lines={5} />}
          testId="ten-god-domains-section"
        >
          <PersonalityDashboardCard tenGodDomains={tenGodDomains} />
        </SectionReveal>
      </div>

      <div id={BAZI_SECTION_IDS.life} className="scroll-mt-3">
        <SectionReveal
          ready={hasLifeSummary || !streaming}
          streaming={streaming && !hasLifeSummary}
          delayIndex={6}
          skeleton={<SectionBlockSkeleton lines={4} />}
        >
          <LifeSummaryCard
            lifeDimensions={lifeDimensions}
            lifeDimensionHighlights={lifeDimensionHighlights}
            baziBasis={baziBasis}
            hasTenGodSection={hasTenGodDomains}
          />
        </SectionReveal>
      </div>

      <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-center text-[11px] sm:text-xs leading-5 text-slate-400 dark:text-slate-500">
        【娱乐声明】本内容基于中国传统民俗文化进行娱乐化解读，仅供休闲参考，
        不构成任何人生决策建议。命运掌握在自己手中，积极努力才是幸福生活的根本。
      </div>
    </div>
  );
}
