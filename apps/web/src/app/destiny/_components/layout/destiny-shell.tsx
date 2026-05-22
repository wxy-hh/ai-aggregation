'use client';

import React from 'react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from './glass-card';
import type {
  BaziLockedSections,
  DestinyReport,
  DestinyStreamStatus,
  PartialDestinyReport,
} from '../types';
import type { DestinyModuleKey } from './left-nav';
import { ReportRightRail } from '../reports/report-right-rail';
import { ChartCenterPanel } from '../visualization/chart-center-panel';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PanelRightOpen } from 'lucide-react';

const primaryCtaClass = cn(
  'inline-flex min-h-11 items-center justify-center px-5 rounded-full text-sm font-bold transition-all duration-200',
  'bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white shadow-[0_10px_24px_rgba(93,124,250,0.32)]',
  'hover:brightness-[1.03] hover:shadow-[0_14px_30px_rgba(93,124,250,0.36)] active:scale-[0.98]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/30 focus-visible:ring-offset-2'
);

export function DestinyShell({
  report,
  partialReport,
  streaming = false,
  streamStatus = null,
  streamError = null,
  lockedSections,
  activeModule = 'bazi',
  title = 'AI 命理大师',
  subtitleTag = '专业分析视图',
  onModuleChange,
  onRecalculate,
}: {
  report: DestinyReport | null;
  partialReport?: PartialDestinyReport | null;
  streaming?: boolean;
  streamStatus?: DestinyStreamStatus | null;
  streamError?: string | null;
  lockedSections?: BaziLockedSections;
  activeModule?: DestinyModuleKey;
  title?: string;
  subtitleTag?: string;
  onModuleChange?: (key: DestinyModuleKey) => void;
  onRecalculate?: () => void;
}) {
  const displayReport = report ?? partialReport ?? null;
  const subtitle = useMemo(() => {
    if (!displayReport?.profile) return '深度学习驱动的东方易理智能解析系统';
    const { name, genderLabel, birthText, locationText } = displayReport.profile;
    const locationClean = locationText?.replace(/\(.*?\)/g, '').trim() || '';
    return `${name} · ${genderLabel} · ${birthText} · ${locationClean}`;
  }, [displayReport]);
  const [isReportDrawerOpen, setIsReportDrawerOpen] = useState(false);

  return (
    <div className="relative h-full min-h-0 w-full">
      <div className="flex h-full min-h-0 w-full gap-4 p-4 lg:gap-6 lg:p-6">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-full min-h-0 flex-col gap-6">
            <header className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">
                    {title}
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-[#F3F6FF] px-3 py-1 text-xs font-bold text-[#4E67E6] dark:bg-[#1E2A55] dark:text-[#9BADFF]">
                    {subtitleTag}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm text-slate-600 dark:text-slate-300">
                  {subtitle}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsReportDrawerOpen(true)}
                  className="min-h-11 rounded-full border-[#D5DAEB] bg-white/72 px-4 text-slate-700 hover:bg-white/90 lg:hidden dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  <PanelRightOpen className="mr-2 h-4 w-4" />
                  深度报告
                </Button>
                <button type="button" onClick={onRecalculate} className={primaryCtaClass}>
                  重新排盘
                </button>
              </div>
            </header>

            {displayReport ? (
              <ChartCenterPanel
                report={displayReport}
                streaming={streaming}
                className="min-h-0 flex-1 overflow-y-auto pr-1"
              />
            ) : (
              <GlassCard className="flex min-h-0 flex-1 items-center justify-center p-8">
                <div className="text-center">
                  <div className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">
                    等待开始测算
                  </div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                    请先填写生辰信息，AI 将基于真实模型生成完整命理解读。
                  </p>
                </div>
              </GlassCard>
            )}
          </div>
        </section>

        <aside className="hidden min-h-0 w-[380px] shrink-0 lg:flex">
          <GlassCard className="h-full w-full p-4">
            {displayReport ? (
              <ReportRightRail
                report={displayReport}
                streaming={streaming}
                lockedSections={lockedSections}
                streamStatus={streamStatus}
                streamError={streamError}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-300">
                完成测算后可查看深度报告
              </div>
            )}
          </GlassCard>
        </aside>
      </div>

      <Dialog open={isReportDrawerOpen} onOpenChange={setIsReportDrawerOpen}>
        <DialogContent
          className={cn(
            'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0',
            'rounded-t-[32px] rounded-b-none border border-[#E2E8F0] bg-[#F8FAFC] p-0 pb-[env(safe-area-inset-bottom)]',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'dark:border-white/10 dark:bg-[#111218]'
          )}
        >
          <div className="border-b border-[#E2E8F0] px-5 py-4 dark:border-white/10">
            <DialogTitle className="text-left font-heading text-base font-semibold text-slate-900 dark:text-white">
              深度报告
            </DialogTitle>
            <DialogDescription className="mt-1 text-left text-sm text-slate-500 dark:text-slate-400">
              查看测算报告、流年趋势和 AI 追问
            </DialogDescription>
          </div>
          <div className="max-h-[78vh] overflow-y-auto px-4 py-4">
            <GlassCard variant="compact" className="w-full p-4">
              {displayReport ? (
                <ReportRightRail
                  report={displayReport}
                  streaming={streaming}
                  lockedSections={lockedSections}
                  streamStatus={streamStatus}
                  streamError={streamError}
                />
              ) : (
                <div className="flex min-h-48 items-center justify-center text-sm text-slate-500 dark:text-slate-300">
                  完成测算后可查看深度报告
                </div>
              )}
            </GlassCard>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
