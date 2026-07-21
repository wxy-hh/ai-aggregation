'use client';

import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import timelineIcon from '@/assets/image/timeline.svg';
import { cn } from '@/lib/utils';
import type { BaziLockedSections, DestinyStreamStatus, PartialDestinyReport } from '../types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Briefcase, Heart, Sparkles, Stethoscope, Wallet } from 'lucide-react';
// 跨模态接力：报告稳定段落作为来源（REQ-012）
import { RelayAction } from '@/components/relay/relay-action';
import { RelayMenu } from '@/components/relay/relay-menu';
import { useRelayLauncher } from '@/components/relay/use-relay-launcher';
import { RELAY_COPY } from '@/lib/relay/copy';
import type { RelayReferenceItem } from '@repo/shared';

type TabKey = 'career' | 'love' | 'wealth' | 'health';

const TAB_LABEL: Record<TabKey, string> = {
  career: '事业',
  love: '感情',
  wealth: '财运',
  health: '健康',
};

export function ReportRightRail({
  report,
  streaming = false,
  lockedSections,
  streamStatus,
  streamError,
  onOpenCopilot,
}: {
  report: PartialDestinyReport;
  streaming?: boolean;
  lockedSections?: BaziLockedSections;
  streamStatus?: DestinyStreamStatus | null;
  streamError?: string | null;
  onOpenCopilot?: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('career');
  /** 默认收起，避免首屏在矮容器里撑出无效滚动 */
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  /** 整栏统一滚动容器：模块解读与流年时间轴共享，卡片高度随内容自适应 */
  const railScrollRef = useRef<HTMLDivElement>(null);
  const yearItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const shouldScrollYearRef = useRef(false);

  const scrollExpandedYearIntoView = useCallback((year: number) => {
    const container = railScrollRef.current;
    const item = yearItemRefs.current.get(year);
    if (!container || !item) return;

    const padding = 12;
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    if (itemRect.top < containerRect.top + padding) {
      container.scrollBy({
        top: itemRect.top - containerRect.top - padding,
        behavior: 'smooth',
      });
      return;
    }

    if (itemRect.bottom > containerRect.bottom - padding) {
      container.scrollBy({
        top: itemRect.bottom - containerRect.bottom + padding,
        behavior: 'smooth',
      });
    }
  }, []);

  const handleYearToggle = useCallback((year: number, isCurrentlyExpanded: boolean) => {
    if (isCurrentlyExpanded) {
      shouldScrollYearRef.current = false;
      setExpandedYear(null);
      return;
    }
    shouldScrollYearRef.current = true;
    setExpandedYear(year);
  }, []);

  useEffect(() => {
    if (expandedYear == null || !shouldScrollYearRef.current) return;
    shouldScrollYearRef.current = false;
    // 等展开内容完成布局后再滚动，避免仍停留在上一年的滚动位置
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollExpandedYearIntoView(expandedYear));
    });
    return () => cancelAnimationFrame(frame);
  }, [expandedYear, scrollExpandedYearIntoView]);

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

  // 接力来源：仅稳定段落（非流式/无错误/有内容）可接力，快照当前段落全文
  const sectionText = useMemo(() => {
    if (!module) return '';
    const parts = [
      module.summary?.trim() ?? '',
      ...(module.advantages ?? []).map((b) => `优势：${b}`),
      ...(module.suggestions ?? []).map((b) => `建议：${b}`),
      ...(module.bullets ?? []),
    ].filter(Boolean);
    return parts.join('\n');
  }, [module]);
  const canRelaySection = !streaming && !streamError && sectionText.length > 0;
  const sectionRelay = useRelayLauncher({
    sourceType: 'destiny_report_section',
    disabledReason: canRelaySection
      ? undefined
      : streaming
        ? RELAY_COPY.disabled.generating
        : RELAY_COPY.disabled.empty,
    buildItem: () => {
      if (!canRelaySection) return null;
      const partial: Omit<RelayReferenceItem, 'id' | 'createdAt'> = {
        sourceModule: 'destiny',
        sourceType: 'destiny_report_section',
        sourceId: `destiny-report-section:${tab}`,
        sourceTitle: `命理报告 · ${TAB_LABEL[tab]}段落`,
        sourceModel: report.profile ? '命理报告' : undefined,
        snapshotText: sectionText,
      };
      return partial;
    },
  });

  const hasModuleSummary = Boolean(module?.summary?.trim());
  const hasModuleBullets = Boolean(
    module?.bullets?.length || module?.advantages?.length || module?.suggestions?.length
  );

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

  /** 侧栏分区：浅底 + 圆角，不用边框（外层 GlassCard 已提供轮廓） */
  const sectionShellClass = cn('rounded-2xl bg-slate-100/50 p-2.5 sm:p-3', 'dark:bg-slate-800/35');

  /** 长文阅读区：实体底、无边框 */
  const readSurfaceClass = cn(
    'mt-3 rounded-xl bg-white/92 px-2 py-0.5 sm:mt-3.5 sm:px-4 sm:py-0.5',
    'dark:bg-slate-950/65'
  );

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 overflow-hidden">
      {/* 顶部：标题 + AI 追问（固定，不随内容滚动） */}
      <div className="flex items-start gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">
              深度报告
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenCopilot?.()}
              disabled={!onOpenCopilot}
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
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500 dark:bg-amber-400" />
            ) : null}
            <span className="truncate">{statusLabel}</span>
          </div>
        </div>
      </div>

      {/* 统一滚动区：模块解读与流年时间轴共享一个滚动上下文，卡片随内容自适应高度，
          避免模块区内嵌滚动遮挡文字、流年区短内容时留大片空白 */}
      <div
        ref={railScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 custom-scrollbar"
      >
        <div className="flex flex-col gap-4">
          {/* 模块 Tab + 解读：高度随内容自适应，不再限高内滚 */}
          <div className={cn('flex shrink-0 flex-col', sectionShellClass)}>
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList className="grid h-9 grid-cols-4 rounded-xl bg-slate-200/45 p-1 sm:h-11 dark:bg-slate-800/55">
                {(Object.entries(tabMeta) as [TabKey, (typeof tabMeta)[TabKey]][]).map(
                  ([key, meta]) => (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className={cn(
                        'inline-flex min-h-7 sm:min-h-9 items-center justify-center gap-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all',
                        'data-[state=active]:bg-white data-[state=active]:text-[#3C58D8] data-[state=active]:shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
                        'dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-[#9BADFF]',
                        'data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700'
                      )}
                    >
                      <meta.Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                      <span>{meta.label}</span>
                    </TabsTrigger>
                  )
                )}
              </TabsList>
            </Tabs>

            {/* 当前段落接力入口：显式按钮 + 内容区右键/长按复用同一菜单 */}
            <div className="mt-2 flex shrink-0 items-center justify-between gap-2 px-1">
              <span className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                {RELAY_COPY.destiny.pendingReference}·{moduleLabel}
              </span>
              <RelayAction
                ref={sectionRelay.triggerRef}
                disabled={sectionRelay.disabled}
                disabledReason={sectionRelay.disabledReason}
                onClick={sectionRelay.openAtTrigger}
              />
            </div>

            {/* 阅读区不再内嵌滚动，由整栏统一滚动承载 */}
            <div onContextMenu={sectionRelay.onContextMenu} {...sectionRelay.longPressProps}>
              <div className={readSurfaceClass}>
                {hasModuleSummary ? (
                  <div className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {module?.summary}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div className="h-4 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
                  </div>
                )}
                {(tab === 'wealth' || tab === 'health') && module && (
                  <div className="mt-3 rounded-lg bg-amber-50/70 px-2.5 py-2 text-[11px] font-semibold text-amber-800/90 sm:text-xs dark:bg-amber-950/25 dark:text-amber-300/90">
                    仅供参考，不构成{tab === 'wealth' ? '投资' : '医疗'}建议
                  </div>
                )}

                <div className="mt-3 border-t border-slate-200/55 pt-3 sm:mt-4 sm:pt-4 dark:border-white/10">
                  <div className="text-[11px] font-bold text-[#3C58D8] sm:text-xs dark:text-[#9BADFF]">
                    AI 核心建议
                  </div>
                  {hasModuleBullets ? (
                    <ul className="mt-2 space-y-2 text-xs sm:text-sm text-slate-700">
                      {/* 新格式：优先显示 advantages + suggestions */}
                      {module?.advantages?.length || module?.suggestions?.length ? (
                        <>
                          {module?.advantages?.slice(0, 1).map((b) => (
                            <li key={`adv-${b}`} className="flex gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                              <span className="leading-relaxed">
                                <span className="font-bold">优势：</span>
                                {b}
                              </span>
                            </li>
                          ))}
                          {module?.suggestions?.slice(0, 1).map((b) => (
                            <li key={`sug-${b}`} className="flex gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5D7CFA]/70" />
                              <span className="leading-relaxed">
                                <span className="font-bold">建议：</span>
                                {b}
                              </span>
                            </li>
                          ))}
                        </>
                      ) : (
                        /* 兼容旧格式 bullets */
                        (module?.bullets ?? []).map((b) => (
                          <li key={b} className="flex gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5D7CFA]/70" />
                            <span className="leading-relaxed">{b}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="h-4 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
                      <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
                      <div className="h-4 w-4/6 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 流年时间轴（垂直时间线，高度随内容自适应） */}
          <div className={cn('flex flex-col', sectionShellClass)}>
            <div className="mb-3 sm:mb-4 flex items-center gap-2">
              <AssetToneIcon className="h-4 w-4 text-[#5D7CFA]" src={timelineIcon} />
              <div className="font-heading text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                流年运势走向
              </div>
            </div>

            <div>
              {timeline.length > 0 ? (
                <div className="relative pl-5 sm:pl-6">
                  {/* 垂直线 */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700 rounded-full" />

                  {timeline.map((t, idx) => {
                    const isExpanded = t.year === expandedYear;
                    const isFirst = idx === 0;

                    return (
                      <div
                        key={t.year}
                        ref={(node) => {
                          if (node) yearItemRefs.current.set(t.year, node);
                          else yearItemRefs.current.delete(t.year);
                        }}
                        className="relative scroll-mt-2 pb-4 sm:pb-5 last:pb-0"
                      >
                        {/* 时间线圆点 */}
                        <div
                          className={cn(
                            'absolute -left-[17px] sm:-left-[21px] top-1 h-3 w-3 sm:h-[14px] sm:w-[14px] rounded-full border-2 z-10 transition-all',
                            isFirst
                              ? 'border-[#5D7CFA] bg-[#5D7CFA] dark:border-[#7D8CFF] dark:bg-[#7D8CFF] shadow-[0_0_0_4px_rgba(93,124,250,0.15)] dark:shadow-[0_0_0_4px_rgba(125,140,255,0.20)]'
                              : isExpanded
                                ? 'border-[#5D7CFA] bg-white dark:border-[#7D8CFF] dark:bg-slate-800'
                                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                          )}
                        />

                        {/* 年份标题（可点击展开） */}
                        <button
                          type="button"
                          onClick={() => handleYearToggle(t.year, isExpanded)}
                          className={cn(
                            'w-full min-h-11 rounded-lg text-left transition',
                            'hover:bg-white/50 dark:hover:bg-slate-800/40',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/30'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {isFirst && (
                              <span className="rounded-full bg-[#F3F6FF] px-2 py-0.5 text-[10px] font-bold text-[#3C58D8] dark:bg-[#1E2A55] dark:text-[#9BADFF]">
                                今年
                              </span>
                            )}
                            <span
                              className={cn(
                                'text-xs sm:text-sm font-extrabold',
                                isFirst ? 'text-[#3C58D8] dark:text-[#9BADFF]' : 'text-slate-600'
                              )}
                            >
                              {t.year} · {t.title}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 line-clamp-2">
                            {t.summary}
                          </p>
                        </button>

                        {/* 展开的详细内容 */}
                        {isExpanded && (
                          <div className="ml-0 mt-2 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200 sm:mt-3 sm:space-y-3">
                            <div className="rounded-lg border-l-2 border-l-emerald-400/45 bg-emerald-50/45 py-2 pl-2.5 pr-2 sm:py-2.5 sm:pl-3 dark:bg-emerald-950/18">
                              <div className="text-[11px] font-extrabold text-emerald-700 sm:text-xs dark:text-emerald-300">
                                机会
                              </div>
                              <ul className="mt-1.5 sm:mt-2 space-y-1">
                                {t.detail.opportunities.map((item) => (
                                  <li
                                    key={item}
                                    className="flex gap-2 text-[11px] sm:text-xs text-slate-600"
                                  >
                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                                    <span className="leading-relaxed">{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="rounded-lg border-l-2 border-l-amber-400/45 bg-amber-50/45 py-2 pl-2.5 pr-2 sm:py-2.5 sm:pl-3 dark:bg-amber-950/18">
                              <div className="text-[11px] font-extrabold text-amber-700 sm:text-xs dark:text-amber-300">
                                风险
                              </div>
                              <ul className="mt-1.5 sm:mt-2 space-y-1">
                                {t.detail.risks.map((item) => (
                                  <li
                                    key={item}
                                    className="flex gap-2 text-[11px] sm:text-xs text-slate-600"
                                  >
                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                                    <span className="leading-relaxed">{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="rounded-lg border-l-2 border-l-blue-400/45 bg-blue-50/45 py-2 pl-2.5 pr-2 sm:py-2.5 sm:pl-3 dark:bg-blue-950/18">
                              <div className="text-[11px] font-extrabold text-blue-700 sm:text-xs dark:text-blue-300">
                                行动建议
                              </div>
                              <ul className="mt-1.5 sm:mt-2 space-y-1">
                                {t.detail.actions.map((item) => (
                                  <li
                                    key={item}
                                    className="flex gap-2 text-[11px] sm:text-xs text-slate-600"
                                  >
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
                      className="rounded-xl bg-white/55 px-4 py-4 dark:bg-slate-800/40"
                    >
                      <div className="h-3 w-20 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
                      <div className="mt-2 h-4 w-40 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
                      <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 接力菜单（报告段落来源） */}
      <RelayMenu
        open={sectionRelay.menuOpen}
        onOpenChange={sectionRelay.setMenuOpen}
        targets={sectionRelay.targets}
        onSelect={sectionRelay.onSelect}
        anchorPoint={sectionRelay.anchorPoint}
        triggerRef={sectionRelay.triggerRef}
      />
    </div>
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
