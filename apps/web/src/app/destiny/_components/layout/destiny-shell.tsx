'use client';

import React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from './glass-card';
import {
  DestinyResultHeader,
  destinySecondaryBtnClass,
} from './destiny-result-header';
import type {
  BaziLockedSections,
  DestinyReport,
  DestinyStreamStatus,
  PartialDestinyReport,
} from '../types';
import type { DestinyModuleKey } from './left-nav';
import { AICoPilotDrawer } from '../chat/ai-copilot-drawer';
import {
  buildDecadeFortuneAskQuestion,
  type DestinyCopilotLaunch,
} from '../chat/destiny-copilot-types';
import { ReportRightRail } from '../reports/report-right-rail';
import { ChartCenterPanel } from '../visualization/chart-center-panel';
import { ChartSectionNav } from '../visualization/chart-section-nav';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PanelRightOpen } from 'lucide-react';
import { ProfileSubtitle } from './profile-subtitle';

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
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotLaunch, setCopilotLaunch] = useState<DestinyCopilotLaunch>({});

  const copilotReport = report;
  const canOpenCopilot = Boolean(
    copilotReport?.profile &&
      copilotReport.pillars?.length &&
      copilotReport.elements?.length &&
      copilotReport.timeline?.length
  );

  const openCopilot = useCallback((launch: DestinyCopilotLaunch = {}) => {
    setCopilotLaunch(launch);
    setCopilotOpen(true);
  }, []);

  const handleOpenCopilotGeneral = useCallback(() => {
    openCopilot({ focus: null });
  }, [openCopilot]);

  const handleAskDecadeFortune = useCallback(
    (decade: { name: string; startAge: number; endAge: number }) => {
      openCopilot({
        focus: {
          decadeName: decade.name,
          label: `${decade.name}大运 · ${decade.startAge}-${decade.endAge}岁`,
        },
        queuedQuestion: {
          id: Date.now(),
          text: buildDecadeFortuneAskQuestion(decade),
        },
      });
    },
    [openCopilot]
  );

  return (
    <div className="relative h-full min-h-0 w-full">
      <div className="flex h-full min-h-0 w-full gap-3 sm:gap-4 p-3 sm:p-4 lg:gap-6 lg:p-6">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-full min-h-0 flex-col gap-4 sm:gap-6">
            <DestinyResultHeader
              title={title}
              moduleBadge={subtitleTag}
              tone="blue"
              subtitle={<ProfileSubtitle text={subtitle} />}
              onRecalculate={onRecalculate}
              leadingActions={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsReportDrawerOpen(true)}
                  className={cn(destinySecondaryBtnClass, 'lg:hidden')}
                >
                  <PanelRightOpen className="mr-2 h-4 w-4" />
                  深度报告
                </Button>
              }
            />

            {displayReport ? (
              <>
                <ChartSectionNav
                  report={displayReport}
                  className={cn(
                    'shrink-0 border-b border-slate-200/60 pb-3',
                    'dark:border-white/10'
                  )}
                />
                <ChartCenterPanel
                  report={displayReport}
                  streaming={streaming}
                  onAskDecadeFortune={handleAskDecadeFortune}
                  className="min-h-0 flex-1 overflow-y-auto pr-1 pt-1"
                />
              </>
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
                onOpenCopilot={handleOpenCopilotGeneral}
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
            'rounded-t-[24px] sm:rounded-t-[32px] rounded-b-none border border-white/60 p-0 pb-[env(safe-area-inset-bottom)]',
            'bg-white/80 backdrop-blur-2xl',
            'shadow-[0_30px_60px_-20px_rgba(15,23,42,0.25),0_10px_30px_-15px_rgba(59,130,246,0.15),inset_0_1px_0_0_rgba(255,255,255,0.1)]',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'dark:border-white/10 dark:bg-slate-900/85'
          )}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30 dark:bg-white/10" aria-hidden />
          <div className="border-b border-slate-200/50 px-4 py-4 sm:px-6 dark:border-white/10">
            <DialogTitle className="text-left font-heading text-base font-semibold text-slate-900 dark:text-white">
              深度报告
            </DialogTitle>
            <DialogDescription className="mt-2 text-left text-sm text-slate-500 dark:text-slate-400">
              查看测算报告、流年趋势和 AI 追问
            </DialogDescription>
          </div>
          <div className="max-h-[78vh] overflow-y-auto px-3 sm:px-4 py-3 sm:py-4">
            <GlassCard variant="compact" className="w-full p-3 sm:p-4">
              {displayReport ? (
                <ReportRightRail
                  report={displayReport}
                  streaming={streaming}
                  lockedSections={lockedSections}
                  streamStatus={streamStatus}
                  streamError={streamError}
                  onOpenCopilot={handleOpenCopilotGeneral}
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

      {canOpenCopilot && copilotReport ? (
        <AICoPilotDrawer
          open={copilotOpen}
          onOpenChange={(nextOpen) => {
            setCopilotOpen(nextOpen);
            if (!nextOpen) setCopilotLaunch({});
          }}
          report={copilotReport}
          focusDecade={copilotLaunch.focus ?? null}
          queuedQuestion={copilotLaunch.queuedQuestion ?? null}
          onQueuedQuestionHandled={() => {
            setCopilotLaunch((current) => ({ ...current, queuedQuestion: null }));
          }}
        />
      ) : null}
    </div>
  );
}
