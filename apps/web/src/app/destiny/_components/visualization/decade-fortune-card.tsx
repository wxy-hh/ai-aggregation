'use client';

import React, { useMemo, useState, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import dayunIcon from '@/assets/image/xingge.svg';
import { cn } from '@/lib/utils';
import {
  buildDecadeFortuneInsights,
  getDecadePhaseLabel,
} from '@/lib/destiny/decade-fortune-insight';
import type { PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);

export function DecadeFortuneCard({
  baziBasis,
  className,
  insightsPending = false,
  onAskDecadeFortune,
}: {
  baziBasis: NonNullable<PartialDestinyReport['baziBasis']>;
  className?: string;
  /** 流式生成中且专属大运解读尚未返回 */
  insightsPending?: boolean;
  /** 从弹层追问该步大运 */
  onAskDecadeFortune?: (decade: { name: string; startAge: number; endAge: number }) => void;
}) {
  const decadeFortunes = baziBasis.decadeFortunes;
  const childLimit = baziBasis.childLimit;
  const yearStem = baziBasis.pillars[0]?.stem ?? '';
  const isMale = baziBasis.profile.genderLabel?.includes('乾造') ?? false;
  const [showIntro, setShowIntro] = useState(false);
  const [openDecadeIndex, setOpenDecadeIndex] = useState<number | null>(null);

  const activeIndex = decadeFortunes.findIndex((d) => d.active);
  const activeDecade = activeIndex >= 0 ? decadeFortunes[activeIndex] : null;
  const currentAge = baziBasis.annualCycles[0]?.age ?? null;

  const hasAiInsights = Boolean(baziBasis.decadeFortuneInsights?.length);

  const decadeInsights = useMemo(() => {
    if (hasAiInsights) {
      return baziBasis.decadeFortuneInsights!;
    }
    return buildDecadeFortuneInsights(baziBasis);
  }, [baziBasis, hasAiInsights]);

  const activeInsight = activeIndex >= 0 ? decadeInsights[activeIndex] : null;
  const activePhase = activeDecade ? getDecadePhaseLabel(activeDecade, currentAge) : null;

  const yearYang = YANG_STEMS.has(yearStem);
  const genderText = isMale ? '男命（乾造）' : '女命（坤造）';

  const directionReason = useMemo(() => {
    if (childLimit.forward) {
      return yearYang
        ? `年干${yearStem}为阳，命主为${genderText}，符合阳男阴女顺排规则`
        : `年干${yearStem}为阴，命主为${genderText}，符合阳男阴女顺排规则`;
    }
    return yearYang
      ? `年干${yearStem}为阳，命主为${genderText}，符合阴男阳女逆排规则`
      : `年干${yearStem}为阴，命主为${genderText}，符合阴男阳女逆排规则`;
  }, [childLimit.forward, yearStem, yearYang, genderText]);

  const startAgeReason = useMemo(() => {
    const termName = childLimit.forward
      ? baziBasis.solarTerms.next.name
      : baziBasis.solarTerms.previous.name;
    const termTime = childLimit.forward
      ? baziBasis.solarTerms.next.solarTime.text
      : baziBasis.solarTerms.previous.solarTime.text;
    const direction = childLimit.forward ? '下一个' : '上一个';
    return `从出生时刻到${direction}节气「${termName}」（${termTime}）的时长为 ${childLimit.duration.years}年${childLimit.duration.months}月${childLimit.duration.days}天，折算后命主 ${childLimit.startAge} 岁起运`;
  }, [childLimit, baziBasis.solarTerms]);

  return (
    <GlassCard className={cn('p-3 sm:p-4', className)}>
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 sm:h-6 sm:w-6 shrink-0 items-center justify-center rounded-md bg-[#F3F6FF] dark:bg-[#1a2245]">
            <AssetToneIcon
              className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-[#5D7CFA] dark:text-[#9BADFF]"
              src={dayunIcon}
            />
          </div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
            十年大运
          </span>
          {activeDecade && (
            <span className="shrink-0 rounded-full bg-[#5D7CFA]/10 dark:bg-[#5D7CFA]/20 px-2 py-0.5 text-[11px] font-semibold text-[#5D7CFA] dark:text-[#9BADFF]">
              {activeDecade.name} · {activeDecade.startAge}-{activeDecade.endAge} 岁
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowIntro(!showIntro)}
          className="shrink-0 ml-2 text-[11px] sm:text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-[#5D7CFA] dark:hover:text-[#9BADFF] transition-colors"
        >
          {showIntro ? '收起说明' : '什么是大运？'}
        </button>
      </div>

      {/* 当前大运个性化解读 */}
      {activeInsight && (
        <div className="mt-3 rounded-xl border border-[#5D7CFA]/15 bg-[#5D7CFA]/[0.04] px-3 py-2.5 dark:border-[#5D7CFA]/25 dark:bg-[#5D7CFA]/10">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-extrabold text-[#5D7CFA] dark:text-[#9BADFF]">
                {activeInsight.stemTenGod}运 · {activeInsight.branchMainTenGod}藏
              </span>
              {activePhase && (
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                  当前{activePhase}
                </span>
              )}
              {hasAiInsights ? <AiExclusiveBadge /> : null}
            </div>
            {hasAiInsights && onAskDecadeFortune && activeDecade ? (
              <Button
                type="button"
                size="sm"
                aria-label="追问当前大运"
                onClick={() =>
                  onAskDecadeFortune({
                    name: activeDecade.name,
                    startAge: activeDecade.startAge,
                    endAge: activeDecade.endAge,
                  })
                }
                className={cn(
                  'shrink-0 min-h-8 h-8 gap-1 rounded-full px-2.5 text-[10px] font-bold sm:min-h-9 sm:h-9 sm:px-3 sm:text-[11px]',
                  'bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white',
                  'shadow-[0_4px_12px_rgba(93,124,250,0.24)] hover:brightness-[1.03]',
                  'focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/30'
                )}
              >
                <Sparkles className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                <span className="hidden sm:inline">追问当前大运</span>
              </Button>
            ) : null}
          </div>
          {insightsPending && !hasAiInsights ? (
            <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              正在结合你的命盘生成专属大运解读…
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] sm:text-xs font-medium leading-relaxed text-slate-700 dark:text-slate-200">
              {activeInsight.summary}
            </p>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            {activePhase === '后五年'
              ? `后五年：${activeInsight.branchPhase}`
              : `前五年：${activeInsight.stemPhase}`}
          </p>
        </div>
      )}

      {/* 展开的说明区域 */}
      {showIntro && (
        <div className="mt-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 px-3 py-3 text-[11px] sm:text-xs leading-6 text-slate-600 dark:text-slate-300">
          <p>
            <span className="font-bold text-slate-800 dark:text-slate-100">大运</span>
            ：子平术中，以月柱为起点，按"阳男阴女顺排、阴男阳女逆排"的规则推演出十年一步的运程周期。
            每步大运由一个天干和一个地支组成，天干主前五年外在表现，地支主后五年内在根基。
          </p>
          <p className="mt-2">
            <span className="font-bold text-slate-800 dark:text-slate-100">起运</span>：
            {directionReason}。{startAgeReason}
            ，此后每十年进入下一步大运。
          </p>
        </div>
      )}

      {/* 大运横向时间轴 */}
      <div className="mt-3">
        <div className="flex items-end gap-1.5 sm:gap-1">
          {decadeFortunes.map((decade, idx) => {
            const isActive = decade.active;
            const isPast = idx < activeIndex;
            const insight = decadeInsights[idx];

            return (
              <Popover
                key={decade.index}
                open={openDecadeIndex === decade.index}
                onOpenChange={(open) => setOpenDecadeIndex(open ? decade.index : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'relative flex-1 rounded-t-md transition-all duration-200',
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/30 dark:focus-visible:ring-[#5D7CFA]/50',
                      isActive
                        ? 'bg-[#5D7CFA] dark:bg-[#5D7CFA] shadow-[0_2px_8px_rgba(93,124,250,0.35)]'
                        : isPast
                          ? 'bg-slate-300/60 dark:bg-slate-600/40 hover:bg-[#5D7CFA]/30 dark:hover:bg-[#5D7CFA]/20'
                          : 'bg-slate-200 dark:bg-slate-700/50 hover:bg-[#5D7CFA]/30 dark:hover:bg-[#5D7CFA]/20'
                    )}
                    style={{ height: isActive ? 48 : isPast ? 36 : 40 }}
                    aria-label={`${decade.name} · ${decade.startAge}-${decade.endAge}岁 · ${insight?.stemTenGod ?? ''}运`}
                  />
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="center"
                  className="w-[min(320px,calc(100vw-2rem))] sm:w-72 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                      {decade.name}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {decade.sixtyCycle}
                    </span>
                    {isActive && (
                      <span className="rounded-full bg-[#5D7CFA] px-2 py-0.5 text-[10px] font-extrabold text-white">
                        当前
                      </span>
                    )}
                    {hasAiInsights ? <AiExclusiveBadge /> : null}
                  </div>

                  {insight && (
                    <div className="mt-2 space-y-2">
                      <p className="text-[11px] font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
                        <span className="text-amber-700 dark:text-amber-300">
                          {insight.stemTenGod}运 · {insight.branchMainTenGod}藏
                        </span>
                        <span className="text-slate-500 dark:text-slate-400"> · </span>
                        {insight.summary}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                        <p>
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            前五年
                          </span>
                          <br />
                          {insight.stemPhase}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            后五年
                          </span>
                          <br />
                          {insight.branchPhase}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {decade.startAge}-{decade.endAge} 岁
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span>
                      {decade.startYear}-{decade.endYear}
                    </span>
                    {isPast && <span className="text-slate-400 dark:text-slate-500">· 已过</span>}
                    {!isActive && !isPast && (
                      <span className="text-slate-400 dark:text-slate-500">· 未来</span>
                    )}
                  </div>

                  {hasAiInsights && onAskDecadeFortune ? (
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        'mt-2 h-8 min-h-8 w-full gap-1 rounded-lg px-2.5 text-[11px] font-semibold',
                        'bg-[#5D7CFA]/10 text-[#4969E9] shadow-none',
                        'ring-1 ring-inset ring-[#5D7CFA]/25',
                        'hover:bg-[#5D7CFA]/16 hover:brightness-100 dark:bg-[#5D7CFA]/18 dark:text-[#9BADFF] dark:ring-[#5D7CFA]/30 dark:hover:bg-[#5D7CFA]/26'
                      )}
                      onClick={() => {
                        setOpenDecadeIndex(null);
                        onAskDecadeFortune({
                          name: decade.name,
                          startAge: decade.startAge,
                          endAge: decade.endAge,
                        });
                      }}
                    >
                      <Sparkles className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                      追问这一步大运
                    </Button>
                  ) : null}
                </PopoverContent>
              </Popover>
            );
          })}
        </div>

        {/* 底部标签 */}
        <div className="mt-2 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
          <span>
            {yearStem}
            {YANG_STEMS.has(yearStem) ? '阳' : '阴'}年{isMale ? '男' : '女'} ·{' '}
            {childLimit.forward ? '顺排' : '逆排'} · {childLimit.startAge} 岁起运
          </span>
          <span>
            {activeIndex >= 0
              ? `第 ${activeIndex + 1}/${decadeFortunes.length} 步`
              : `${decadeFortunes.length} 步`}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

function AiExclusiveBadge({ className }: { className?: string }) {
  return (
    <span
      title="可一键追问，AI 将只围绕该步大运作答"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-[#5D7CFA]/20 bg-gradient-to-r from-[#4969E9]/12 to-[#7B8FFF]/12 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#5D7CFA] dark:border-[#9BADFF]/25 dark:from-[#4969E9]/20 dark:to-[#7B8FFF]/20 dark:text-[#9BADFF]',
        className
      )}
    >
      <Sparkles className="h-2.5 w-2.5 shrink-0" aria-hidden />
      AI 专属
    </span>
  );
}

function AssetToneIcon({ className, src }: { className?: string; src: { src: string } }) {
  const maskStyle = {
    WebkitMaskImage: `url(${src.src})`,
    maskImage: `url(${src.src})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  } satisfies CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 bg-current', className)}
      style={maskStyle}
    />
  );
}
