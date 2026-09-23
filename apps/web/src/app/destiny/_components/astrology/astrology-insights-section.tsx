'use client';

/**
 * astrology-insights-section.tsx —— 结果页洞察轨段落（星盘档案校准状态 + 分享海报入口 + 星语问答入口）
 *
 * 承接首屏右侧 4 栏洞察轨全部内容：
 * 1. 移动端折叠壳 MobileCollapse（私有下沉，移动端收为一行摘要，sm 起常显）
 * 2. 星盘档案校准状态卡（含 statusOpen 下沉折叠态与重新测算入口）
 * 3. 分享星语海报卡（脱敏海报预览弹层入口，主轴缺失时折叠壳同步跳过渲染）
 * 4. 星语问答卡（桌面内联面板 / 移动端底部抽屉，撑满本轨剩余高度）
 */

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  MessageCircleQuestion,
  Orbit,
  RotateCcw,
  Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AstrologyChartFacts, PlanetBody } from '@/lib/astrology/chart-facts';
import type { ModuleId, ModuleReading } from '@/lib/astrology/interpretation';
import { AstrologyQaEntry } from './astrology-qa';
import { AstrologyShareEntry, isAstrologyShareAvailable } from './astrology-share-entry';
import { RailCardSkeleton } from './astrology-skeletons';
import type { AstrologyFormData } from '../astrology-types';

/* ---------- 移动端折叠 ---------- */

/**
 * 移动端折叠壳（洞察轨密度）：屏幕小于 sm 时默认收为一行摘要（标题 + 折叠箭头，触摸热区 44px），
 * sm 起摘要行隐藏、内容常显——桌面端保持现状展开，只有移动端默认折叠。
 * hidden：内容自身会整块隐藏时（如主轴缺失的分享入口），摘要行必须同步跳过渲染，
 * 否则移动端点开是一个空壳。
 * className / bodyClassName：给外壳与内容层补桌面端布局类（如星语问答卡在洞察轨里撑满剩余高度）。
 */
function MobileCollapse({
  title,
  hint,
  icon: Icon,
  hidden = false,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  hidden?: boolean;
  /** 外壳附加类（桌面端撑满时使用） */
  className?: string;
  /** 内容层附加类（与外壳同为伸缩容器，内容卡才能占满剩余高度） */
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-left transition-colors hover:border-indigo-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:border-white/10 dark:bg-[#0D1226] sm:hidden"
      >
        <Icon className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300" strokeWidth={1.9} />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-bold',
            open ? 'text-day-muted dark:text-night-faint' : 'text-slate-900 dark:text-white'
          )}
        >
          {open ? '收起' : title}
        </span>
        {!open && hint && (
          <span className="shrink-0 text-[11px] font-medium text-day-muted dark:text-night-faint">
            {hint}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-day-muted transition-transform duration-200 dark:text-night-faint',
            open && 'rotate-180'
          )}
          strokeWidth={2.2}
        />
      </button>
      <div className={cn(open ? 'mt-2.5 sm:mt-0' : 'hidden sm:block', bodyClassName)}>
        {children}
      </div>
    </div>
  );
}

export type AstrologyInsightsSectionProps = {
  chartFacts: AstrologyChartFacts;
  formData: AstrologyFormData;
  headlineReading: { text: string } | null;
  fullHeadline: string;
  interpretationUnavailable: boolean;
  modulesArrived: boolean;
  modules: ModuleReading[];
  onRecalculate: () => void;
  onLocateBody: (body: PlanetBody | null) => void;
  onLocateModule: (id: ModuleId) => void;
};

export function AstrologyInsightsSection({
  chartFacts,
  formData,
  headlineReading,
  fullHeadline,
  interpretationUnavailable,
  modulesArrived,
  modules,
  onRecalculate,
  onLocateBody,
  onLocateModule,
}: AstrologyInsightsSectionProps) {
  /** 移动端校准状态卡的折叠态（<sm 默认收起，桌面端不使用该状态） */
  const [statusOpen, setStatusOpen] = useState(false);

  const withHouses = chartFacts.dataCompleteness === 'with-houses';
  const degradeReason = chartFacts.factStability.houses.reason;

  /** 分享入口可用性：与 AstrologyShareEntry 内部同一判定（主轴缺失即整卡隐藏），
   *  折叠壳据此同步跳过渲染，避免移动端留下「点开即空」的死入口 */
  const shareAvailable = useMemo(
    () => (chartFacts ? isAstrologyShareAvailable(chartFacts, fullHeadline, formData.name) : false),
    [chartFacts, fullHeadline, formData.name]
  );

  return (
    <aside
      className="order-4 min-w-0 space-y-4 xl:order-2 xl:col-span-4 xl:flex xl:flex-col"
      aria-label="洞察轨"
    >
      {/* 1. 星盘档案校准状态（合并原盘面范围与重新测算，消除重复卡片与双重紫色按钮） */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#0D1226] dark:shadow-[inset_0_1px_0_rgba(196,181,253,0.10)]">
        {/* 控制台顶缘星光（深色模式的一线辉光） */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 hidden h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent dark:block"
        />
        {/* 移动端折叠摘要行（标题 + 盘面档位 + 折叠箭头，热区 44px）；sm 起隐藏，标题回到卡内标题行 */}
        <button
          type="button"
          onClick={() => setStatusOpen((v) => !v)}
          aria-expanded={statusOpen}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:hidden"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Orbit
              className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300"
              strokeWidth={1.9}
            />
            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
              星盘校准状态
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] font-medium text-day-muted dark:text-night-faint">
              {withHouses ? '完整十二宫' : '稳定行星盘'}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-day-muted transition-transform duration-200 dark:text-night-faint',
                statusOpen && 'rotate-180'
              )}
              strokeWidth={2.2}
            />
          </span>
        </button>
        {/* 卡体：桌面端常显；移动端随摘要行展开（同一份内容，不做两套排版） */}
        <div className={cn('px-5 pb-5 sm:block sm:pt-5', !statusOpen && 'hidden')}>
          <div className="hidden items-center justify-between sm:flex">
            <div className="flex items-center gap-2">
              <Orbit
                className="h-4 w-4 text-indigo-500 dark:text-indigo-300 dark:drop-shadow-[0_0_6px_rgba(165,180,252,0.55)]"
                strokeWidth={1.9}
              />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                星盘校准状态
              </h3>
            </div>
            <span className="text-[11px] font-medium text-day-muted dark:text-night-faint">
              {withHouses ? '完整十二宫' : '稳定行星盘'}
            </span>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-night-muted">
            {withHouses
              ? '当前为含宫位完整盘：行星、十二宫、轴线与主要相位已全部精确校准。'
              : degradeReason === 'unstable-in-range'
                ? '约时已降级为无宫位行星盘：上升、天顶与宫位在所选时段内不稳定，仅呈现高稳定事实。'
                : '当前为无宫位行星盘：呈现整日内稳定的行星星座与主要相位。补充出生时间可解锁上升与十二宫。'}
          </p>
          <div className="mt-3.5 border-t border-slate-100 pt-3 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={onRecalculate}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/70 text-xs font-semibold text-slate-700 transition-all duration-150 hover:border-indigo-300/70 hover:bg-slate-100/90 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-indigo-400/30 dark:hover:bg-white/[0.08] dark:hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
              {withHouses ? '修改资料重新演算' : '补充资料或重校'}
            </button>
          </div>
        </div>
      </section>

      {/* 2. 分享星语海报（脱敏海报卡预览弹层；主轴缺失时入口与折叠壳一并隐藏。
             主轴分区未到：同档卡片骨架占位，避免洞察轨在解读到达时整体下移；解读降级：整卡隐藏
             ——分享卡的主语是主轴金句，没有解读就没有可分享的一句话，不做空入口） */}
      {interpretationUnavailable ? null : headlineReading === null ? (
        <RailCardSkeleton />
      ) : (
        <MobileCollapse
          title="分享星语海报"
          hint="脱敏海报"
          icon={Share2}
          hidden={!shareAvailable}
        >
          <AstrologyShareEntry
            facts={chartFacts}
            headline={fullHeadline}
            name={formData.name}
          />
        </MobileCollapse>
      )}

      {/* 3. 星语问答（真功能：桌面内联面板 / 移动端底部抽屉，引用可定位）
          摘要文案不计数：剩余次数由面板内徽章呈现（按账号可用额度折算，不设每报告上限），
          静态文案不会与状态失配。
          桌面端展开问答舱后撑满本轨剩余高度：面板底部与左栏要素卡底部齐平（收拢态不撑高，
          卡片保持内容高度）。折叠壳的两层都要参与伸缩，内容卡才能以 flex-1 吃到剩余高度。
          模块分区未到：问答只引用已确认的模块事实，先占位骨架（不出「无模块可引用」的假答案）；
          解读降级：整卡隐藏（模块事实不在，问答无可引用真值） */}
      {interpretationUnavailable ? null : !modulesArrived ? (
        <RailCardSkeleton />
      ) : (
        <MobileCollapse
          title="星语问答"
          hint="AI 解读问答"
          icon={MessageCircleQuestion}
          className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"
          bodyClassName="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"
        >
          <AstrologyQaEntry
            facts={chartFacts}
            modules={modules}
            onLocateBody={onLocateBody}
            onLocateModule={onLocateModule}
          />
        </MobileCollapse>
      )}
    </aside>
  );
}
