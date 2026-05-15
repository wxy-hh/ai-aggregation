'use client';

import React from 'react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  BaziLockedSections,
  DestinyStreamStatus,
  PartialDestinyReport,
} from '../types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AICoPilotDrawer } from '../chat/ai-copilot-drawer';
import { useIsMobile } from '@/hooks/use-is-mobile';

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
  const [year, setYear] = useState<number>(report.timeline?.[0]?.year ?? new Date().getFullYear());
  const [copilotOpen, setCopilotOpen] = useState(false);
  const isMobile = useIsMobile();

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

  const timeline = report.timeline ?? [];
  const statusLabel = useMemo(() => {
    if (streamError) return `生成中断：${streamError}`;
    if (!streaming) return '卡片化结构 · 可追问 · 可验证';
    if (!lockedSections?.profileOverview || !lockedSections?.pillars || !lockedSections?.elementsAndTenGods) {
      return `正在生成基础盘面${streamStatus ? ` · ${streamStatus}` : ''}`;
    }
    if (!lockedSections?.timeline) {
      return `正在生成核心解读与年度趋势${streamStatus ? ` · ${streamStatus}` : ''}`;
    }
    return `正在收尾校验${streamStatus ? ` · ${streamStatus}` : ''}`;
  }, [lockedSections, streamError, streamStatus, streaming]);

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 overflow-hidden">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-slate-900">深度报告</div>
          <div className="text-xs text-slate-500 truncate">{statusLabel}</div>
        </div>
      </div>

      {/* 模块 Tab */}
      <div className="rounded-3xl border border-white/35 bg-white/40 backdrop-blur-[32px] p-3 shadow-sm">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid grid-cols-4 bg-white/55 border border-white/50 rounded-2xl p-1 h-10">
            <TabsTrigger
              value="career"
              className={cn(
                'rounded-xl text-xs font-extrabold transition-all',
                'data-[state=active]:bg-white/90 data-[state=active]:text-[#2F6BFF]',
                'data-[state=active]:shadow-[0_2px_8px_-2px_rgba(47,107,255,0.25)]',
                'data-[state=active]:border data-[state=active]:border-[#2F6BFF]/20',
                'data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700'
              )}
            >
              事业
            </TabsTrigger>
            <TabsTrigger
              value="love"
              className={cn(
                'rounded-xl text-xs font-extrabold transition-all',
                'data-[state=active]:bg-white/90 data-[state=active]:text-[#2F6BFF]',
                'data-[state=active]:shadow-[0_2px_8px_-2px_rgba(47,107,255,0.25)]',
                'data-[state=active]:border data-[state=active]:border-[#2F6BFF]/20',
                'data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700'
              )}
            >
              感情
            </TabsTrigger>
            <TabsTrigger
              value="wealth"
              className={cn(
                'rounded-xl text-xs font-extrabold transition-all',
                'data-[state=active]:bg-white/90 data-[state=active]:text-[#2F6BFF]',
                'data-[state=active]:shadow-[0_2px_8px_-2px_rgba(47,107,255,0.25)]',
                'data-[state=active]:border data-[state=active]:border-[#2F6BFF]/20',
                'data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700'
              )}
            >
              财运
            </TabsTrigger>
            <TabsTrigger
              value="health"
              className={cn(
                'rounded-xl text-xs font-extrabold transition-all',
                'data-[state=active]:bg-white/90 data-[state=active]:text-[#2F6BFF]',
                'data-[state=active]:shadow-[0_2px_8px_-2px_rgba(47,107,255,0.25)]',
                'data-[state=active]:border data-[state=active]:border-[#2F6BFF]/20',
                'data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700'
              )}
            >
              健康
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 rounded-2xl border border-white/40 bg-white/55 p-4">
          <div className="text-sm font-extrabold text-slate-900">{moduleLabel}</div>
          <div className="mt-2 text-sm text-slate-600 leading-relaxed">
            {module?.summary ?? '对应模块分析生成中，将在区块定稿后展示。'}
          </div>
          {module && (tab === 'wealth' || tab === 'health') && (
            <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-700">
              仅供参考，不构成{tab === 'wealth' ? '投资' : '医疗'}建议
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-white/35 bg-white/45 p-4">
            <div className="text-xs font-extrabold text-[#2F6BFF]">AI 核心建议</div>
            {module?.bullets?.length ? (
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {module.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#2F6BFF]/70" />
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

      {/* 流年时间轴 */}
      <div className="shrink-0 rounded-3xl border border-white/35 bg-white/40 backdrop-blur-[32px] p-4 shadow-sm max-h-[400px] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div className="text-sm font-extrabold text-slate-900">流年运势走向</div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-xs font-bold text-slate-400">
              点击年份查看详细建议
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCopilotOpen(true)}
              className={cn(
                'h-7 rounded-full px-3 text-xs font-bold',
                'bg-white/65 border-slate-200/80 text-slate-700 hover:bg-white/80',
                'focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/25 focus-visible:ring-offset-0'
              )}
            >
              AI 追问
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1 min-h-0">
          {timeline.length > 0
            ? timeline.map((t, idx) => {
                const active = t.year === year;
                const trigger = (
                  <button
                    type="button"
                    onClick={() => setYear(t.year)}
                    className={cn(
                      'w-full rounded-2xl border px-4 py-3 text-left transition shadow-sm',
                      'bg-white/55 border-white/45 hover:bg-white/70',
                      active && 'border-[#2F6BFF]/35 bg-[#2F6BFF]/10'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'mt-1 h-2 w-2 rounded-full',
                          active ? 'bg-[#2F6BFF]' : 'bg-slate-300'
                        )}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-400">
                          {idx === 0 ? 'CURRENT YEAR' : `NEXT YEAR +${idx}`}
                        </div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">
                          {t.year} · {t.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{t.summary}</div>
                      </div>
                    </div>
                  </button>
                );

                if (isMobile) {
                  return (
                    <div key={t.year} className="space-y-3">
                      {trigger}
                      {active ? (
                        <div className="rounded-2xl border border-[#2F6BFF]/20 bg-white/82 p-3 shadow-sm">
                          <div className="text-sm font-extrabold text-slate-900">
                            {t.year} · 流年详细建议
                          </div>
                          <div className="mt-3 grid gap-3">
                            <DetailBlock title="机会" items={t.detail.opportunities} />
                            <DetailBlock title="风险" items={t.detail.risks} />
                            <DetailBlock title="行动" items={t.detail.actions} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <Popover key={t.year}>
                    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                    <PopoverContent
                      className={cn(
                        'w-[360px] rounded-2xl border border-slate-200/90 bg-white/88 backdrop-blur-[26px]',
                        'ring-1 ring-[#2F6BFF]/12',
                        'shadow-[0_28px_70px_-30px_rgba(15,23,42,0.45)]',
                        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
                      )}
                      side="left"
                    >
                      <div className="text-sm font-extrabold text-slate-900">
                        {t.year} · 流年详细建议
                      </div>
                      <div className="mt-3 grid gap-3">
                        <DetailBlock title="机会" items={t.detail.opportunities} />
                        <DetailBlock title="风险" items={t.detail.risks} />
                        <DetailBlock title="行动" items={t.detail.actions} />
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })
            : Array.from({ length: 3 }).map((_, idx) => (
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

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/75 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="text-xs font-extrabold tracking-wide text-slate-700">{title}</div>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
        {items.map((it) => (
          <li key={it} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#2F6BFF]/70" />
            <span className="leading-relaxed">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
