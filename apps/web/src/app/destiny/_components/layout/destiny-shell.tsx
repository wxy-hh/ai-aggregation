'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from './glass-card';
import type { DestinyReport } from '../reports/mock';
import { LeftNav } from './left-nav';
import { ReportRightRail } from '../reports/report-right-rail';
import { ChartCenterPanel } from '../visualization/chart-center-panel';

export function DestinyShell({ report }: { report: DestinyReport }) {
  const subtitle = useMemo(() => {
    if (!report?.profile) return '深度学习驱动的东方易理智能解析系统';
    const { name, genderLabel, birthText, locationText } = report.profile;
    return `${name} · ${genderLabel} · ${birthText} · ${locationText}`;
  }, [report]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 背景：珍珠白 + 网格 + 柔和渐变 */}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden
        style={{
          backgroundColor: '#F6F8FF',
          // 主题底图（网格/雾化/光晕）+ 轻量叠加蓝/紫雾层
          backgroundImage:
            "url('/主题色.png')," +
            "radial-gradient(980px 520px at 78% 20%, rgba(47,107,255,0.22) 0%, rgba(47,107,255,0.10) 35%, rgba(47,107,255,0.0) 65%)," +
            "radial-gradient(900px 540px at 82% 88%, rgba(147,51,234,0.18) 0%, rgba(147,51,234,0.08) 38%, rgba(147,51,234,0.0) 62%)," +
            "linear-gradient(to right, rgba(15,23,42,0.012) 1px, transparent 1px)," +
            "linear-gradient(to bottom, rgba(15,23,42,0.012) 1px, transparent 1px)",
          backgroundRepeat: 'no-repeat, no-repeat, no-repeat, repeat, repeat',
          backgroundSize: 'cover, cover, cover, 80px 80px, 80px 80px',
          backgroundPosition: 'center, center, center, center, center',
        }}
      />

      <div className="flex h-full w-full gap-6 p-6">
        {/* 左侧：导航与历史 */}
        <aside className="hidden xl:flex w-[280px] shrink-0">
          <GlassCard className="h-full w-full p-4">
            <LeftNav />
          </GlassCard>
        </aside>

        {/* 中间：排盘主视图 */}
        <section className="flex-1 min-w-0">
          <div className="flex flex-col gap-6 h-full">
            <header className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                    AI 命理大师
                  </h1>
                  <span className="text-sm font-semibold text-slate-500">专业分析视图</span>
                </div>
                <p className="mt-2 text-sm text-slate-600 truncate">{subtitle}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    'h-10 px-4 rounded-full text-sm font-bold',
                    'bg-[#2F6BFF] text-white shadow-lg shadow-blue-500/25',
                    'hover:brightness-110 active:brightness-95 transition'
                  )}
                >
                  重新排盘
                </button>
              </div>
            </header>

            <ChartCenterPanel report={report} className="flex-1 min-h-0" />
          </div>
        </section>

        {/* 右侧：报告与时间轴 + AI */}
        <aside className="hidden lg:flex w-[380px] shrink-0">
          <GlassCard className="h-full w-full p-4">
            <ReportRightRail report={report} />
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}

