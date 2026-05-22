'use client';

import React from 'react';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import timelineIcon from '@/assets/image/timeline.svg';
import { cn } from '@/lib/utils';
import type { BaziLockedSections, DestinyStreamStatus, PartialDestinyReport } from '../types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Briefcase, Heart, Sparkles, Stethoscope, Wallet } from 'lucide-react';
import { AICoPilotDrawer } from '../chat/ai-copilot-drawer';

type TabKey = 'career' | 'love' | 'wealth' | 'health';

export function ReportRightRail({
  report,
  streaming = false,
  lockedSections,
  streamStatus,
  streamError,
}: {
  report: PartialDestinyReport;
  streaming?: boolean;
  lockedSections?: BaziLockedSections;
  streamStatus?: DestinyStreamStatus | null;
  streamError?: string | null;
}) {
  const [tab, setTab] = useState<TabKey>('career');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [expandedYear, setExpandedYear] = useState<number | null>(
    report.timeline?.[0]?.year ?? null
  );

  const module = useMemo(() => {
    const m = report.modules;
    if (!m) return null;
    if (tab === 'career') return m.career;
    if (tab === 'love') return m.love;
    if (tab === 'wealth') return m.wealth;
    return m.health;
  }, [report.modules, tab]);

  const moduleLabel = useMemo(() => {
    if (tab === 'career') return '事业';
    if (tab === 'love') return '感情';
    if (tab === 'wealth') return '财运';
    return '健康';
  }, [tab]);

  const hasModuleSummary = Boolean(module?.summary?.trim());
  const hasModuleBullets = Boolean(module?.bullets?.length);

  const timeline = report.timeline ?? [];

  const statusLabel = useMemo(() => {
    if (streamError) return `生成中断：${streamError}`;
    if (!streaming) return '卡片化结构 · 可追问 · 可验证';
    if (
      !lockedSections?.profileOverview ||
      !lockedSections?.coreDestinyTone ||
      !lockedSections?.pillars ||
      !lockedSections?.elementsAndTenGods
    ) {
      return `正在生成基础盘面${streamStatus ? ` · ${streamStatus}` : ''}`;
    }
    if (!lockedSections?.timeline) {
      return `正在生成核心解读与年度趋势${streamStatus ? ` · ${streamStatus}` : ''}`;
    }
    return `正在收尾校验${streamStatus ? ` · ${streamStatus}` : ''}`;
  }, [lockedSections, streamError, streamStatus, streaming]);

  const statusTone = useMemo(() => {
    if (streamError) return 'text-[#E54350]';
    if (streaming) return 'text-amber-600 dark:text-amber-400';
    return 'text-slate-500 dark:text-slate-400';
  }, [streamError, streaming]);

  const tabMeta: Record<
    TabKey,
    { label: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    career: { label: '事业', Icon: Briefcase },
    love: { label: '感情', Icon: Heart },
    wealth: { label: '财运', Icon: Wallet },
    health: { label: '健康', Icon: Stethoscope },
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 overflow-hidden">
      {/* 顶部：标题 + AI 追问 */}
      <div className="flex items-start gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">
              深度报告
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setCopilotOpen(true)}
              className={cn(
                'ml-auto min-h-9 rounded-full px-3 text-xs font-bold',
                'bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white shadow-[0_6px_16px_rgba(93,124,250,0.28)]',
                'hover:brightness-[1.03] focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/30'
              )}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              AI 追问
            </Button>
          </div>
          <div className={cn('mt-0.5 flex items-center gap-1.5 truncate text-xs', statusTone)}>
            {streaming && !streamError ? (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500" />
            ) : null}
            <span className="truncate">{statusLabel}</span>
          </div>
        </div>
      </div>

      {/* 模块 Tab */}
      <div className="shrink-0 rounded-2xl border border-[#D5DAEB]/70 bg-[#F1F5F9]/80 p-3 backdrop-blur-[16px] dark:border-white/10 dark:bg-slate-900/50">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid h-11 grid-cols-4 rounded-xl border border-[#E2E8F0]/90 bg-[#F1F5F9] p-1 dark:border-white/10 dark:bg-slate-800/80">
            {(Object.entries(tabMeta) as [TabKey, (typeof tabMeta)[TabKey]][]).map(
              ([key, meta]) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className={cn(
                    'inline-flex min-h-9 items-center justify-center gap-1 rounded-lg text-xs font-bold transition-all',
                    'data-[state=active]:bg-white data-[state=active]:text-[#4E67E6] data-[state=active]:shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
                    'dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-[#9BADFF]',
                    'data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700'
                  )}
                >
                  <meta.Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{meta.label}</span>
                </TabsTrigger>
              )
            )}
          </TabsList>
        </Tabs>

        <div className="mt-4 rounded-2xl border border-[#E2E8F0]/80 bg-white/85 p-4 dark:border-white/10 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            {(() => {
              const Icon = tabMeta[tab].Icon;
              return <Icon className="h-4 w-4 text-[#5D7CFA]" />;
            })()}
            {moduleLabel}建议
          </div>
          {hasModuleSummary ? (
            <div className="mt-2 text-sm text-slate-600 leading-relaxed">{module?.summary}</div>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="h-4 animate-pulse rounded bg-slate-200/70" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200/70" />
            </div>
          )}
          {(tab === 'wealth' || tab === 'health') && module && (
            <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-700">
              仅供参考，不构成{tab === 'wealth' ? '投资' : '医疗'}建议
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-white/35 bg-white/45 p-4">
            <div className="text-xs font-bold text-[#4E67E6] dark:text-[#9BADFF]">AI 核心建议</div>
            {hasModuleBullets ? (
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {module!.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5D7CFA]/70" />
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="h-4 animate-pulse rounded bg-slate-200/70" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200/70" />
                <div className="h-4 w-4/6 animate-pulse rounded bg-slate-200/70" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 流年时间轴（垂直时间线） */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#D5DAEB]/70 bg-white/75 p-4 backdrop-blur-[16px] dark:border-white/10 dark:bg-slate-900/55">
        <div className="flex h-full min-h-0 flex-col">
          <div className="mb-4 flex shrink-0 items-center gap-2">
            <AssetToneIcon className="h-4 w-4 text-[#5D7CFA]" src={timelineIcon} />
            <div className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">
              流年运势走向
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
            {timeline.length > 0 ? (
              <div className="relative pl-6">
                {/* 垂直线 */}
                <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200 rounded-full" />

                {timeline.map((t, idx) => {
                  const isExpanded = t.year === expandedYear;
                  const isFirst = idx === 0;

                  return (
                    <div key={t.year} className="relative pb-5 last:pb-0">
                      {/* 时间线圆点 */}
                      <div
                        className={cn(
                          'absolute -left-[21px] top-1 h-[14px] w-[14px] rounded-full border-2 z-10 transition-all',
                          isFirst
                            ? 'border-[#5D7CFA] bg-[#5D7CFA] shadow-[0_0_0_4px_rgba(93,124,250,0.15)]'
                            : isExpanded
                              ? 'border-[#5D7CFA] bg-white'
                              : 'border-slate-300 bg-white'
                        )}
                      />

                      {/* 年份标题（可点击展开） */}
                      <button
                        type="button"
                        onClick={() => setExpandedYear(isExpanded ? null : t.year)}
                        className={cn(
                          'w-full text-left transition',
                          'hover:opacity-80'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isFirst && (
                            <span className="rounded-full bg-[#F3F6FF] px-2 py-0.5 text-[10px] font-bold text-[#4E67E6] dark:bg-[#1E2A55] dark:text-[#9BADFF]">
                              今年
                            </span>
                          )}
                          <span
                            className={cn(
                              'text-sm font-extrabold',
                              isFirst ? 'text-[#4E67E6] dark:text-[#9BADFF]' : 'text-slate-600'
                            )}
                          >
                            {t.year} · {t.title}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">{t.summary}</p>
                      </button>

                      {/* 展开的详细内容 */}
                      {isExpanded && (
                        <div className="mt-3 ml-0 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-3">
                            <div className="text-xs font-extrabold text-emerald-700">机会</div>
                            <ul className="mt-2 space-y-1">
                              {t.detail.opportunities.map((item) => (
                                <li key={item} className="flex gap-2 text-xs text-slate-600">
                                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                                  <span className="leading-relaxed">{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 p-3">
                            <div className="text-xs font-extrabold text-amber-700">风险</div>
                            <ul className="mt-2 space-y-1">
                              {t.detail.risks.map((item) => (
                                <li key={item} className="flex gap-2 text-xs text-slate-600">
                                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                                  <span className="leading-relaxed">{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-2xl border border-blue-200/60 bg-blue-50/60 p-3">
                            <div className="text-xs font-extrabold text-blue-700">行动建议</div>
                            <ul className="mt-2 space-y-1">
                              {t.detail.actions.map((item) => (
                                <li key={item} className="flex gap-2 text-xs text-slate-600">
                                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                                  <span className="leading-relaxed">{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={`timeline-skeleton-${idx}`}
                    className="rounded-2xl border border-white/45 bg-white/55 px-4 py-4"
                  >
                    <div className="h-3 w-20 animate-pulse rounded bg-slate-200/70" />
                    <div className="mt-2 h-4 w-40 animate-pulse rounded bg-slate-200/70" />
                    <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-200/70" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {report.profile && report.pillars && report.elements && report.timeline ? (
        <AICoPilotDrawer
          open={copilotOpen}
          onOpenChange={setCopilotOpen}
          report={report as never}
        />
      ) : null}
    </div>
  );
}

function AssetToneIcon({
  className,
  src,
}: {
  className?: string;
  src: { src: string };
}) {
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

  return <span aria-hidden="true" className={cn('block shrink-0 bg-current', className)} style={maskStyle} />;
}
