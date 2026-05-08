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

export function DestinyShell({
  report,
  partialReport,
  streaming = false,
  streamStatus = null,
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
    return `${name} · ${genderLabel} · ${birthText} · ${locationText}`;
  }, [displayReport]);
  const [isReportDrawerOpen, setIsReportDrawerOpen] = useState(false);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F6F8FF] dark:bg-slate-950">
      {/* 背景：珍珠白 + 柔和渐变（移除网格线） */}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden
        style={{
          backgroundColor: '#F6F8FF',
          // 主题底图 + 轻量叠加蓝/紫雾层（移除网格线以避免明显竖线）
          backgroundImage:
            "url('/主题色.png')," +
            'radial-gradient(980px 520px at 78% 20%, rgba(47,107,255,0.22) 0%, rgba(47,107,255,0.10) 35%, rgba(47,107,255,0.0) 65%),' +
            'radial-gradient(900px 540px at 82% 88%, rgba(147,51,234,0.18) 0%, rgba(147,51,234,0.08) 38%, rgba(147,51,234,0.0) 62%)',
          backgroundRepeat: 'no-repeat, no-repeat, no-repeat',
          backgroundSize: 'cover, cover, cover',
          backgroundPosition: 'center, center, center',
        }}
      />
      <div
        className="absolute inset-0 -z-10 hidden dark:block"
        aria-hidden
        style={{
          // 暗色模式背景（移除网格线）
          backgroundImage:
            'radial-gradient(980px 520px at 78% 20%, rgba(37,99,235,0.20) 0%, rgba(37,99,235,0.08) 35%, rgba(37,99,235,0) 65%), radial-gradient(900px 540px at 82% 88%, rgba(124,58,237,0.18) 0%, rgba(124,58,237,0.08) 38%, rgba(124,58,237,0) 62%)',
          backgroundRepeat: 'no-repeat, no-repeat',
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, center',
        }}
      />

      <div className="flex h-full w-full gap-4 lg:gap-6 p-4 lg:p-6">
        {/* 中间：排盘主视图 */}
        <section className="flex-1 min-w-0">
          <div className="flex flex-col gap-6 h-full">
            <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {title}
                  </h1>
                  <span className="text-sm font-semibold text-slate-500 dark:text-slate-300">
                    {subtitleTag}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600 truncate dark:text-slate-300">
                  {subtitle}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsReportDrawerOpen(true)}
                  className="lg:hidden rounded-full"
                >
                  <PanelRightOpen className="mr-2 h-4 w-4" />
                  查看报告
                </Button>
                <button
                  type="button"
                  onClick={onRecalculate}
                  className={cn(
                    'h-10 px-5 rounded-full text-sm font-bold transition-all duration-200',
                    'bg-gradient-to-r from-[#5D7CFA] to-[#778BFF] text-white shadow-[0_10px_24px_rgba(93,124,250,0.36)]',
                    'hover:brightness-105 hover:shadow-[0_14px_30px_rgba(93,124,250,0.42)] active:scale-[0.98]'
                  )}
                >
                  重新排盘
                </button>
              </div>
            </header>

            {displayReport ? (
              <ChartCenterPanel
                report={displayReport}
                streaming={streaming}
                className="flex-1 min-h-0"
              />
            ) : (
              <GlassCard className="flex-1 min-h-0 p-8 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-xl font-black text-slate-900 dark:text-slate-100">
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

        {/* 右侧：报告与时间轴 + AI */}
        <aside className="hidden lg:flex w-[380px] shrink-0">
          <GlassCard className="h-full w-full p-4">
            {displayReport ? (
              <ReportRightRail
                report={displayReport}
                streaming={streaming}
                lockedSections={lockedSections}
                streamStatus={streamStatus}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-300">
                完成测算后可查看深度报告
              </div>
            )}
          </GlassCard>
        </aside>
      </div>

      <Dialog open={isReportDrawerOpen} onOpenChange={setIsReportDrawerOpen}>
        <DialogContent className="inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none border-0 bg-white p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom dark:bg-slate-950">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="text-left text-base font-semibold text-slate-900 dark:text-white">
              深度报告
            </DialogTitle>
            <DialogDescription className="mt-1 text-left text-sm text-slate-500 dark:text-slate-400">
              在移动端查看测算报告、流年趋势和 AI 追问入口
            </DialogDescription>
          </div>
          <div className="max-h-[78vh] overflow-y-auto px-4 py-4">
            <GlassCard className="w-full p-4">
              {displayReport ? (
                <ReportRightRail
                  report={displayReport}
                  streaming={streaming}
                  lockedSections={lockedSections}
                  streamStatus={streamStatus}
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
