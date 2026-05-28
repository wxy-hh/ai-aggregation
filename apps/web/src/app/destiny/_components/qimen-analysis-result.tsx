'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CircleDot, Clock3, HelpCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type {
  QimenAnalysisBaseResult,
  QimenAsyncSectionKey,
  QimenAsyncSections,
  QimenBaseStatus,
  QimenBoardCell,
  QimenSectionStatus,
} from './qimen-types';

type QimenAnalysisResultProps = {
  analysisId: string | null;
  baseResult: QimenAnalysisBaseResult | null;
  baseStatus: QimenBaseStatus;
  baseError: string | null;
  sections: QimenAsyncSections;
  sectionStatuses: Record<QimenAsyncSectionKey, QimenSectionStatus>;
  sectionErrors: Partial<Record<QimenAsyncSectionKey, string>>;
  error: string | null;
  onBackToForm: () => void;
  onRetry: () => void;
};

const palaceOrder = [
  '巽四宫',
  '离九宫',
  '坤二宫',
  '震三宫',
  '中五宫',
  '兑七宫',
  '艮八宫',
  '坎一宫',
  '乾六宫',
];

// ---- 宫位解读生成器（动态，基于实际排盘数据） ----

const STAR_MEANINGS: Record<string, string> = {
  天蓬: '天蓬星属水，主冒险、突破、暗中行动。宜开拓新方向，忌冲动冒进。',
  天任: '天任星属土，主稳健、积累、厚积薄发。宜脚踏实地推进，忌急于求成。',
  天冲: '天冲星属木，主冲动、变动、快速行动。宜果断出击，忌犹豫反复。',
  天辅: '天辅星属木，主文化、教育、贵人扶持。宜学习提升、借助外力，忌闭门造车。',
  天英: '天英星属火，主名声、曝光、创意表达。宜展示自己、扩大影响，忌情绪化。',
  天芮: '天芮星属土，主问题、隐患、学习成长。宜发现短板、积累经验，忌忽视风险。',
  天柱: '天柱星属金，主是非、口舌、破坏重建。宜据理力争，忌激化矛盾。',
  天心: '天心星属金，主策划、谋略、制度规则。宜周密计划、规范流程，忌草率。',
  天禽: '天禽星属土，居中统摄全局，主贵人、稳固、缓冲。宜居中调度，忌偏激。',
};

const DOOR_MEANINGS: Record<string, string> = {
  休门: '休门属水，吉门。主休息、蓄势、暗中准备。宜养精蓄锐，等待时机。',
  生门: '生门属土，吉门。主生长、收益、财富机会。宜投资、开拓财源。',
  伤门: '伤门属木，凶门。主伤害、竞争、冲突损耗。宜主动出击但需防损失。',
  杜门: '杜门属木，中平。主闭塞、隐蔽、技术钻研。宜深耕细作，不宜高调宣扬。',
  景门: '景门属火，中平。主名声、曝光、文书计划。宜展示推广，忌空谈不落地。',
  死门: '死门属土，凶门。主终结、停滞、不可逆。宜止损出局，不宜开始新事。',
  惊门: '惊门属金，凶门。主惊恐、口舌、意外变故。宜谨慎言行，做好风控。',
  开门: '开门属金，吉门。主开创、机遇、公开推进。宜签约、谈判、开启新计划。',
};

const GOD_MEANINGS: Record<string, string> = {
  值符: '值符为八神之首，主权威、领导、正面主导力。此宫位是全局核心，力量最强。',
  螣蛇: '螣蛇主虚诈、反复、缠绕不定。此宫位的事可能有变数，需反复确认。',
  太阴: '太阴主暗中运作、谋划、保密。此宫位的事宜低调进行，不宜公开。',
  六合: '六合主合作、婚姻、中介撮合。此宫位利合作协商、借助第三方。',
  白虎: '白虎主凶险、压力、强势力量。此宫位有阻力或强敌，需硬实力应对。',
  玄武: '玄武主暗昧、欺骗、不透明。此宫位可能有隐藏信息，需深入调查。',
  九地: '九地主缓慢、稳固、长久。此宫位的事进展慢但根基扎实，宜长期布局。',
  九天: '九天主上升、远行、高远目标。此宫位利向上发展、扩大格局。',
};

function buildPalaceInterpretation(cell: QimenBoardCell): string {
  const parts: string[] = [];

  // 基本属性
  if (cell.palace === '中五宫') {
    parts.push(
      '中五宫为九宫中枢，传统上寄于坤二宫。此宫位不单独作为行动方向，但统摄全局能量平衡。'
    );
  } else {
    // 九星解读
    const starInfo = STAR_MEANINGS[cell.star];
    if (starInfo) parts.push(`【${cell.star}】${starInfo}`);

    // 八门解读
    const doorInfo = DOOR_MEANINGS[cell.door];
    if (doorInfo) parts.push(`【${cell.door}】${doorInfo}`);

    // 八神解读
    const godInfo = GOD_MEANINGS[cell.god];
    if (godInfo) parts.push(`【${cell.god}】${godInfo}`);

    // 格局解读（天盘干+地盘干）
    if (cell.pattern) {
      const [tian, di] = cell.pattern.split('+');
      if (tian === di) {
        parts.push(`【格局】天盘与地盘同为${tian}，称为”伏吟”，主事情进展缓慢、反复，宜稳不宜快。`);
      } else if (tian && di && tian !== di) {
        parts.push(
          `【格局】天盘${tian}加地盘${di}，天地盘不同主有变动、外部因素介入。天盘代表外在表现，地盘代表内在根基。`
        );
      }
    }

    // 特殊标记解读
    const markers = palaceMarkerList(cell);
    if (markers.length > 0) {
      const markerNotes: string[] = [];
      if (cell.isValueSymbol)
        markerNotes.push('这是值符落宫，全局核心宫位，当前时空的主导力量在此，对事情走向影响最大');
      if (cell.isValueDoor)
        markerNotes.push('这是值使落宫，事态发展的关键通道，事情将沿此方向推进');
      if (cell.isVoid)
        markerNotes.push('此宫旬空，能量减半，相关的事情虚而不实，需等待出空（约10天后）才能推进');
      if (cell.isHorse)
        markerNotes.push('此宫有驿马，主奔波、变动、出行，相关事情容易发生快速变化');
      if (markerNotes.length > 0) parts.push(`【特别标记】${markerNotes.join('；')}`);
    }
  }

  return parts.join('\n\n') || '结合全局盘面与具体问题综合分析。';
}

function getCellStyle(cell: QimenBoardCell) {
  if (cell.palace === '中五宫') {
    return 'bg-gradient-to-b from-slate-50/70 to-slate-100/60 border border-dashed border-slate-300 text-slate-400 dark:from-slate-800/40 dark:to-slate-800/60 dark:border-slate-600 dark:text-slate-500';
  }
  if (cell.isValueSymbol || cell.isValueDoor) {
    return 'bg-gradient-to-b from-amber-50/80 to-white border border-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,.22)] dark:from-amber-950/30 dark:to-slate-900/60 dark:border-amber-600/30';
  }
  if (cell.isVoid) {
    return 'bg-gradient-to-b from-rose-50/70 to-white border border-rose-200/90 dark:from-rose-950/30 dark:to-slate-900/60 dark:border-rose-700/30';
  }
  if (cell.isHorse) {
    return 'bg-gradient-to-b from-sky-50/70 to-white border border-sky-200/90 dark:from-sky-950/30 dark:to-slate-900/60 dark:border-sky-700/30';
  }
  return 'bg-gradient-to-b from-white to-slate-50/70 border border-slate-200/90 dark:from-slate-900/60 dark:to-slate-800/50 dark:border-slate-700/40';
}

function getDoorColor(door: string) {
  if (door.includes('开') || door.includes('生') || door.includes('休'))
    return 'text-emerald-700 dark:text-emerald-400';
  if (door.includes('惊') || door.includes('死') || door.includes('伤'))
    return 'text-rose-700 dark:text-rose-400';
  return 'text-indigo-700 dark:text-indigo-400';
}

function getStarColor(star: string) {
  if (star.includes('英') || star.includes('冲')) return 'text-[#1E2B6D] dark:text-slate-300';
  if (star.includes('芮')) return 'text-[#5A355A] dark:text-slate-400';
  return 'text-[#222D66] dark:text-slate-300';
}

function palaceMarkerList(cell: QimenBoardCell) {
  return [
    cell.isValueSymbol ? '值符落宫' : null,
    cell.isValueDoor ? '值使落宫' : null,
    cell.isVoid ? '旬空宫位' : null,
    cell.isHorse ? '驿马宫位' : null,
  ].filter(Boolean) as string[];
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-700/50', className)}
    />
  );
}

function statusLabel(
  baseStatus: QimenBaseStatus,
  sectionStatuses: Record<QimenAsyncSectionKey, QimenSectionStatus>
) {
  if (baseStatus === 'loading') {
    return '正在生成基础盘面，通常需要 10-30 秒';
  }

  if (baseStatus === 'failed') {
    return '基础盘面生成失败，可稍后重试';
  }

  const statuses = Object.values(sectionStatuses);

  if (statuses.every((status) => status === 'completed')) {
    return '各区块结果已全部定稿';
  }

  if (statuses.some((status) => status === 'loading')) {
    return '正在并行整理各区块最终结果';
  }

  if (statuses.some((status) => status === 'failed')) {
    return '部分区块生成失败，可稍后重试';
  }

  return '基础盘面已就绪，分块结果待返回';
}

/** 标题含义解释 — 帮助新手理解"小滿 上元 陽遁5局"的含义 */
function ChartTitleExplanation({
  chartTitle,
  meta,
}: {
  chartTitle: string;
  meta: { dun: string; ju: string };
}) {
  // 标题格式固定为 "${节气} ${三元} ${阴阳}遁${局数}局"，参考 qimen-chart.ts
  const parts = chartTitle.split(' ');
  const jieQi = parts[0] || '';
  const yuan = parts[1] || '';
  const isYang = meta.dun === '陽遁';

  return (
    <div className="space-y-2.5 text-sm">
      <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100">标题含义</h5>
      <ul className="space-y-2">
        <li className="flex gap-2">
          <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold leading-snug text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            节气
          </span>
          <div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{jieQi}</span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              24节气之一，决定当前时空属于阳遁还是阴遁
            </p>
          </div>
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold leading-snug text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            三元
          </span>
          <div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{yuan}</span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              每个节气分上元、中元、下元，各管 5 天，决定用第几局
            </p>
          </div>
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold leading-snug text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
            局数
          </span>
          <div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {meta.dun}
              {meta.ju}
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isYang
                ? '冬至到夏至为阳遁（阳气上升），顺布六仪，共 9 局'
                : '夏至到冬至为阴遁（阴气下沉），逆布六仪，共 9 局'}
            </p>
          </div>
        </li>
      </ul>
      <div className="border-t border-slate-100 pt-2 dark:border-slate-700">
        <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          标题说明在<strong className="text-slate-600 dark:text-slate-400">哪个时间窗口</strong>用
          <strong className="text-slate-600 dark:text-slate-400">哪种能量格局</strong>来推演。
        </p>
      </div>
    </div>
  );
}

export function QimenAnalysisResult({
  analysisId,
  baseResult,
  baseStatus,
  baseError,
  sections,
  sectionStatuses,
  sectionErrors,
  error,
  onBackToForm,
  onRetry,
}: QimenAnalysisResultProps) {
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTooltipIndex == null) return;
    const raf = requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTooltipIndex]);

  const hasPartialContent =
    Boolean(baseResult) ||
    Boolean(sections.chartSummary) ||
    Boolean(sections.strategyOverview?.overallAssessment) ||
    Boolean(sections.strategyOverview?.riskAlerts?.length) ||
    Boolean(sections.strategyOverview?.actionSuggestions?.length) ||
    Boolean(sections.timingWindows?.length);
  const progressLabel = statusLabel(baseStatus, sectionStatuses);

  if ((baseStatus === 'failed' || error) && !baseResult && !hasPartialContent) {
    return (
      <div className="rounded-[24px] border border-rose-200/70 bg-rose-50/80 p-5 backdrop-blur-[16px] sm:p-6 dark:border-rose-500/30 dark:bg-rose-950/40">
        <div className="font-heading text-lg font-bold text-rose-700 dark:text-rose-300">
          演化分析失败
        </div>
        <p className="mt-2 text-sm text-rose-600">{baseError ?? error}</p>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" className="rounded-full" onClick={onRetry}>
            重试分析
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={onBackToForm}>
            返回修改参数
          </Button>
        </div>
      </div>
    );
  }

  if (!baseResult && !hasPartialContent) {
    return (
      <div className="rounded-[24px] border border-[#D5DAEB]/70 bg-white/78 p-6 backdrop-blur-[24px] sm:p-8 dark:border-white/10 dark:bg-slate-900/70">
        <div className="font-heading text-lg font-bold text-slate-900 dark:text-slate-100">
          暂无分析结果
        </div>
        <p className="mt-2 text-sm text-slate-500">请先返回输入信息并发起一次分析。</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 rounded-full"
          onClick={onBackToForm}
        >
          返回信息输入
        </Button>
      </div>
    );
  }

  const boardCells = baseResult
    ? palaceOrder.map(
        (palace) => baseResult.board.find((item) => item.palace === palace) ?? baseResult.board[0]
      )
    : [];
  const activeCell = activeTooltipIndex != null ? boardCells[activeTooltipIndex] : null;
  const activeCellMarkers = activeCell ? palaceMarkerList(activeCell) : [];
  const meta = baseResult?.chartMeta;
  const summary = sections.chartSummary ?? null;
  const overallAssessment = sections.strategyOverview?.overallAssessment ?? null;
  const riskAlerts = sections.strategyOverview?.riskAlerts ?? [];
  const actionSuggestions = sections.strategyOverview?.actionSuggestions ?? [];
  const timingWindows = sections.timingWindows ?? [];
  const allCompleted = Object.values(sectionStatuses).every((status) => status === 'completed');
  const anySectionFailed = Object.values(sectionStatuses).some((status) => status === 'failed');
  const sectionErrorEntries = Object.entries(sectionErrors).filter(([, v]) => Boolean(v));

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="rounded-[24px] border border-[#D5DAEB]/80 bg-white/78 p-4 backdrop-blur-[24px] sm:rounded-[28px] sm:p-5 md:p-6 dark:border-white/10 dark:bg-slate-900/70 supports-[backdrop-filter]:bg-white/72 dark:supports-[backdrop-filter]:bg-slate-900/65 shadow-[0_8px_20px_rgba(76,95,154,0.10)] dark:shadow-[0_14px_32px_rgba(0,0,0,0.28)]">
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300">
            {baseError ?? error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl md:text-[28px]">
              {baseResult?.chartTitle ?? '奇门遁甲排盘生成中'}
              {meta && baseResult?.chartTitle && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500 sm:h-6 sm:w-6 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-indigo-600 dark:hover:bg-indigo-950 dark:hover:text-indigo-400"
                      aria-label="标题含义解释"
                    >
                      <HelpCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="bottom" className="w-72 sm:w-80">
                    <ChartTitleExplanation chartTitle={baseResult.chartTitle} meta={meta} />
                  </PopoverContent>
                </Popover>
              )}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
              {progressLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {meta ? (
              <span className="rounded-full border border-[#D5DAEB]/70 bg-[#F3F6FF] px-3 py-1 text-xs font-semibold text-[#3C58D8] dark:border-white/10 dark:bg-[#1E2A55] dark:text-[#9BADFF]">
                {meta.dun} · {meta.ju}
              </span>
            ) : (
              <span className="rounded-full border border-[#D5DAEB]/70 bg-white/72 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-900/60">
                盘局整理中
              </span>
            )}
            <span className="rounded-full bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] px-3 py-1 text-xs font-bold text-white shadow-[0_6px_16px_rgba(93,124,250,0.28)]">
              {allCompleted ? '2/2' : '生成中'}
            </span>
            {analysisId ? (
              <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                ID: {analysisId.slice(0, 8)}
              </span>
            ) : null}
            {anySectionFailed ? (
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                部分区块失败
              </span>
            ) : null}
            {allCompleted ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                全部分块已锁定
              </span>
            ) : null}
          </div>
        </div>

        {sectionErrorEntries.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
            {sectionErrorEntries
              .map(([key, value]) => `${key}：${value}`)
              .join('；')}
          </div>
        ) : null}

        {/* 盘局基本信息 — 小白友好版 */}
        {meta && (
          <div className="mt-5 rounded-2xl border border-[#D5DAEB]/70 bg-[#F8FAFC]/90 p-4 sm:p-5 dark:border-white/10 dark:bg-slate-900/55">
            <h4 className="mb-3 text-xs font-bold tracking-wide text-[#64748B] dark:text-slate-400">
              盘局基本信息
            </h4>
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              {/* 时间 */}
              <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-700/50 dark:bg-slate-800/40">
                <span className="mt-0.5 text-base">🕐</span>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {meta.trueSolarTime
                      ? `真太阳时 ${meta.trueSolarTime}`
                      : '北京时间（未校准真太阳时）'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {meta.trueSolarTime
                      ? '已根据所选城市经度校准为当地真太阳时'
                      : '建议选择具体城市以校准真太阳时，时辰更准确'}
                  </div>
                </div>
              </div>
              {/* 局数 + 旬首 */}
              <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-700/50 dark:bg-slate-800/40">
                <span className="mt-0.5 text-base">📊</span>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {meta.dun}
                    {meta.ju} · 旬首{meta.xunshou}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    局数=当前时空能量格局 | 旬首=当前旬的起始甲日
                  </div>
                </div>
              </div>
              {/* 日干 + 时干 */}
              <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-700/50 dark:bg-slate-800/40">
                <span className="mt-0.5 text-base">👤</span>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    <span className="text-amber-600 dark:text-amber-400 font-bold">
                      {meta.riGan}
                    </span>{' '}
                    = 你（求测人）&nbsp;&nbsp;
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                      {meta.shiGan}
                    </span>{' '}
                    = 所问之事
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    日干代表你自身的状态 | 时干代表所问事情的状态
                  </div>
                </div>
              </div>
              {/* 值符 + 值使 */}
              <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-700/50 dark:bg-slate-800/40">
                <span className="mt-0.5 text-base">⭐</span>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {meta.valueSymbol}（主导力量）· {meta.valueDoor}（发展通道）
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    值符=当前时空的主导星曜 | 值使=事态发展的关键门户
                  </div>
                </div>
              </div>
              {/* 空亡 */}
              <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-rose-50/60 px-3 py-2.5 dark:border-slate-700/50 dark:bg-rose-950/25">
                <span className="mt-0.5 text-base">○</span>
                <div>
                  <div className="font-semibold text-rose-700 dark:text-rose-400">
                    {meta.jiaziXunkong}
                  </div>
                  <div className="text-xs text-rose-500 dark:text-rose-400/80">
                    空亡宫位能量减半，事情虚而不实，需等待出空才能推进
                  </div>
                </div>
              </div>
              {/* 马星 */}
              {meta.horsePosition && (
                <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-sky-50/60 px-3 py-2.5 dark:border-slate-700/50 dark:bg-sky-950/25">
                  <span className="mt-0.5 text-base">🐎</span>
                  <div>
                    <div className="font-semibold text-sky-700 dark:text-sky-400">
                      {meta.horsePosition}
                    </div>
                    <div className="text-xs text-sky-500 dark:text-sky-400/80">
                      马星主变动、奔波、出行，该宫位能量活跃易动
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_0.95fr]">
          <div className="relative z-30 rounded-[24px] border border-white/70 bg-white/45 p-4 md:p-5 shadow-[inset_1px_1px_0_rgba(255,255,255,0.85)] dark:border-slate-700/50 dark:bg-slate-900/55 dark:shadow-none">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold tracking-wide text-[#1D2B70] dark:text-slate-200">
                洛书九宫盘
              </h3>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                {baseResult ? '👆 点击宫位查看详情' : '完整盘局完成后展示'}
              </span>
            </div>

            {baseResult ? (
              <>
                <div className="relative z-40 grid grid-cols-3 gap-2 overflow-visible sm:gap-3">
                  {boardCells.map((cell, index) => (
                    <article
                      key={`${cell.palace}-${index}`}
                      onClick={() =>
                        setActiveTooltipIndex((prev) => (prev === index ? null : index))
                      }
                      className={cn(
                        'group relative flex min-h-[110px] cursor-pointer flex-col rounded-2xl p-2 transition-transform duration-150 hover:-translate-y-0.5 sm:min-h-[140px] sm:p-3 lg:min-h-[168px]',
                        activeTooltipIndex === index && 'ring-2 ring-[#4F6FFF]/35',
                        getCellStyle(cell)
                      )}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{cell.palace}</span>
                        <span className="max-w-[32px] truncate rounded bg-white/70 px-1 py-[1px] text-[10px] font-semibold text-[#2E4FDF] sm:max-w-none dark:bg-slate-800/70 dark:text-blue-300">
                          {cell.god}
                        </span>
                      </div>

                      <div className="absolute right-1.5 top-6 rounded bg-white/70 px-1 py-[1px] text-[10px] text-slate-500 sm:right-2.5 sm:top-7 dark:bg-slate-800/70 dark:text-slate-400">
                        {cell.direction}
                      </div>

                      <div className="mt-3 text-center">
                        <div
                          className={cn(
                            'text-[24px] font-black leading-none tracking-tight sm:text-[36px] lg:text-[46px]',
                            getStarColor(cell.star)
                          )}
                        >
                          {cell.star}
                        </div>
                        <div
                          className={cn(
                            'mt-1 text-[18px] font-bold leading-none tracking-tight sm:text-[24px] lg:text-[30px]',
                            getDoorColor(cell.door)
                          )}
                        >
                          {cell.door}
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">地</span>
                          <span className="text-[16px] font-bold text-slate-600 sm:text-[20px] lg:text-[22px] dark:text-slate-300">
                            {cell.earthStem}
                          </span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-amber-500 dark:text-amber-400">天</span>
                          <span className="text-[16px] font-bold text-[#C5583A] sm:text-[20px] lg:text-[22px] dark:text-orange-400">
                            {cell.heavenStem}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1 flex flex-wrap gap-1">
                        {cell.isValueSymbol && (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            值符
                          </span>
                        )}
                        {cell.isValueDoor && (
                          <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                            值使
                          </span>
                        )}
                        {cell.isVoid && (
                          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                            空亡
                          </span>
                        )}
                        {cell.isHorse && (
                          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                            驿马
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                {activeCell && (
                  <div
                    ref={detailRef}
                    className="mb-4 mt-4 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-md dark:border-slate-600/50 dark:bg-slate-800/90"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#121F5A] dark:text-slate-200">
                        {activeCell.palace}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        洛书{activeCell.luoshu} · {activeCell.direction}
                        {activeCell.wuxing ? ` · 属${activeCell.wuxing}` : ''}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
                      <div>
                        八神：<span className="font-semibold">{activeCell.god}</span>
                      </div>
                      <div>
                        九星：<span className="font-semibold">{activeCell.star}</span>
                      </div>
                      <div>
                        八门：<span className="font-semibold">{activeCell.door}</span>
                      </div>
                      <div>
                        天盘干：
                        <span className="font-semibold text-[#C5583A] dark:text-orange-400">
                          {activeCell.heavenStem}
                        </span>
                      </div>
                      <div>
                        地盘干：
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          {activeCell.earthStem}
                        </span>
                      </div>
                      {activeCell.pattern && (
                        <div className="col-span-2">
                          格局：
                          <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                            {activeCell.pattern}
                          </span>
                        </div>
                      )}
                    </div>
                    {activeCellMarkers.length > 0 && (
                      <div className="mt-2 rounded-lg bg-indigo-50/70 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
                        {activeCellMarkers.join(' · ')}
                      </div>
                    )}
                    <div className="mt-3 space-y-2 border-t border-slate-100 dark:border-slate-700 pt-3">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        对你意味着什么
                      </div>
                      <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">
                        {buildPalaceInterpretation(activeCell)}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div
                    key={`board-skeleton-${index}`}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 p-2 sm:p-3 dark:border-slate-600/40 dark:bg-slate-800/50"
                  >
                    <SkeletonBlock className="h-3 w-12 sm:w-16" />
                    <SkeletonBlock className="mt-3 sm:mt-6 h-8 sm:h-12 w-14 sm:w-16" />
                    <SkeletonBlock className="mt-1 sm:mt-2 h-5 sm:h-8 w-10 sm:w-14" />
                    <div className="mt-3 sm:mt-6 flex justify-between">
                      <SkeletonBlock className="h-4 w-4 sm:h-6 sm:w-6" />
                      <SkeletonBlock className="h-4 w-4 sm:h-6 sm:w-6" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 图例 */}
            <details className="mt-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-600/40 dark:bg-slate-800/50">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400 select-none">
                图例与符号说明
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-600 dark:text-slate-300 md:grid-cols-2">
                <div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200">九星</div>
                  <div>天蓬 · 天任 · 天冲 · 天辅 · 天英 · 天芮 · 天柱 · 天心 · 天禽</div>
                  <div className="mt-2 font-semibold text-slate-700 dark:text-slate-200">八门</div>
                  <div>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      开/休/生（吉）
                    </span>{' '}
                    ·{' '}
                    <span className="text-rose-700 dark:text-rose-400 font-semibold">
                      惊/死/伤（凶）
                    </span>{' '}
                    · 杜/景（中）
                  </div>
                  <div className="mt-2 font-semibold text-slate-700 dark:text-slate-200">
                    宫位颜色
                  </div>
                  <div>
                    <span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300 dark:bg-amber-900/40 dark:border-amber-600/30 mr-1" />
                    值符/值使宫{' '}
                    <span className="inline-block w-3 h-3 rounded bg-rose-100 border border-rose-200 dark:bg-rose-900/40 dark:border-rose-600/30 ml-2 mr-1" />
                    空亡宫{' '}
                    <span className="inline-block w-3 h-3 rounded bg-sky-100 border border-sky-200 dark:bg-sky-900/40 dark:border-sky-600/30 ml-2 mr-1" />
                    驿马宫
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200">
                    八神（阳遁顺排）
                  </div>
                  <div>值符 → 螣蛇 → 太阴 → 六合 → 白虎 → 玄武 → 九地 → 九天</div>
                  <div className="mt-2 font-semibold text-slate-700 dark:text-slate-200">
                    天盘 / 地盘
                  </div>
                  <div>
                    <span className="text-[#C5583A] dark:text-orange-400 font-semibold">天</span> =
                    天盘天干（动态，九星携带）
                    <br />
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">地</span> =
                    地盘天干（静态，三奇六仪）
                  </div>
                  <div className="mt-2 font-semibold text-slate-700 dark:text-slate-200">
                    特殊标记
                  </div>
                  <div>⭐ 值符 · 🚪 值使 · ○ 空亡 · 🐎 驿马 · 中五宫寄坤二宫</div>
                </div>
              </div>
            </details>

            <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/90 dark:border-slate-600/40 md:grid-cols-2">
              <div className="rounded-2xl border border-white/75 bg-white/70 p-4 dark:border-slate-700/50 dark:bg-slate-800/50">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  空亡与马星
                </div>
                {meta ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">旬空</div>
                      <div className="text-base font-bold text-[#131D56] dark:text-slate-200">
                        {meta.jiaziXunkong}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">马星</div>
                      <div className="text-base font-bold text-[#131D56] dark:text-slate-200">
                        {meta.horsePosition}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <SkeletonBlock className="h-12 w-full" />
                    <SkeletonBlock className="h-12 w-full" />
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-white/75 bg-white/70 p-4 dark:border-slate-700/50 dark:bg-slate-800/50">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  值符值使
                </div>
                {meta ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-3 py-2 dark:border-indigo-500/20 dark:bg-indigo-950/25">
                      <div className="text-[11px] text-indigo-500 dark:text-indigo-400">值符</div>
                      <div className="text-base font-bold text-indigo-900 dark:text-indigo-300">
                        {meta.valueSymbol}
                      </div>
                    </div>
                    <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-3 py-2 dark:border-indigo-500/20 dark:bg-indigo-950/25">
                      <div className="text-[11px] text-indigo-500 dark:text-indigo-400">值使</div>
                      <div className="text-base font-bold text-indigo-900 dark:text-indigo-300">
                        {meta.valueDoor}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <SkeletonBlock className="h-14 w-full" />
                    <SkeletonBlock className="h-14 w-full" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="relative z-10 rounded-[24px] border border-white/75 bg-white/50 p-4 md:p-5 backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/55">
            <div className="flex items-center gap-2">
              <CircleDot className="h-5 w-5 text-[#3E5BEA] dark:text-indigo-400" />
              <h3 className="text-[20px] font-black text-[#121F5A] sm:text-[24px] lg:text-[26px] dark:text-slate-100">
                AI 战术决策分析
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              基于当前时家奇门局的风险评估与机遇研判
            </p>

            <section className="mt-4 rounded-2xl border border-white/75 bg-white/70 p-3.5 dark:border-slate-700/50 dark:bg-slate-800/50">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                综合格局评估
              </div>
              {overallAssessment ? (
                <div className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {overallAssessment}
                </div>
              ) : sectionStatuses.strategyOverview === 'failed' ? (
                <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                  该区块生成失败，请重新分析后再试。
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <SkeletonBlock className="h-4 w-full" />
                  <SkeletonBlock className="h-4 w-5/6" />
                  <SkeletonBlock className="h-4 w-4/6" />
                </div>
              )}
            </section>

            <section className="mt-4">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-500 dark:text-rose-400">
                <ShieldAlert className="h-4 w-4" />
                风险预警 (RISK ASSESSMENT)
              </div>
              {riskAlerts.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {riskAlerts.map((risk, idx) => (
                    <li
                      key={`risk-${idx}`}
                      className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-950/25 dark:text-rose-300"
                    >
                      {risk}
                    </li>
                  ))}
                </ul>
              ) : sectionStatuses.strategyOverview === 'failed' ? (
                <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                  风险预警暂未生成成功。
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-5/6" />
                </div>
              )}
            </section>

            <section className="mt-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                <Sparkles className="h-4 w-4" />
                AI 决策建议
              </div>
              {actionSuggestions.length > 0 ? (
                <ol className="mt-2 space-y-2">
                  {actionSuggestions.map((advice, idx) => (
                    <li
                      key={`advice-${idx}`}
                      className="flex gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/20 dark:bg-indigo-950/25 dark:text-indigo-300"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-200/80 text-[11px] font-bold text-indigo-800 dark:bg-indigo-700/50 dark:text-indigo-300">
                        {idx + 1}
                      </span>
                      <span>{advice}</span>
                    </li>
                  ))}
                </ol>
              ) : sectionStatuses.strategyOverview === 'failed' ? (
                <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                  行动建议暂未生成成功。
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-5/6" />
                </div>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-indigo-100 bg-white/75 p-3.5 dark:border-indigo-500/20 dark:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                  决策胜算指数
                </div>
                {typeof baseResult?.score === 'number' ? (
                  <div className="text-2xl font-black text-indigo-700 dark:text-indigo-400">
                    {baseResult?.score}%
                  </div>
                ) : (
                  <SkeletonBlock className="h-8 w-16" />
                )}
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                {typeof baseResult?.score === 'number' ? (
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-[#3F60FF] to-[#67A2FF]"
                    style={{ width: `${baseResult.score}%` }}
                  />
                ) : (
                  <div
                    className="h-2 rounded-full bg-indigo-200/70 dark:bg-indigo-700/50"
                    style={{ width: '35%' }}
                  />
                )}
              </div>
            </section>
          </aside>
        </div>

        <section className="mt-4 rounded-2xl border border-white/75 bg-white/65 p-4 dark:border-slate-700/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 text-xs font-bold text-[#5D56D6] dark:text-violet-400">
            <Clock3 className="h-4 w-4" />
            关键时间窗口
          </div>
          {timingWindows.length > 0 ? (
            <div className="mt-2 space-y-2">
              {timingWindows.map((item, index) => (
                <div
                  key={`window-${index}`}
                  className="rounded-xl border border-violet-100 bg-violet-50/55 px-3 py-2.5 dark:border-violet-500/20 dark:bg-violet-950/25"
                >
                  <div className="text-sm font-bold text-violet-800 dark:text-violet-300">
                    {item.period}
                  </div>
                  <div className="mt-1 text-sm text-violet-900/90 dark:text-violet-200/90">
                    {item.guidance}
                  </div>
                </div>
              ))}
            </div>
          ) : sectionStatuses.timingWindows === 'failed' ? (
            <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">
              关键时间窗口暂未生成成功。
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-5/6" />
            </div>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white/60 p-4 dark:border-slate-600/40 dark:bg-slate-800/50">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">盘局摘要</div>
          {summary ? (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {summary}
            </p>
          ) : sectionStatuses.chartSummary === 'failed' ? (
            <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">
              盘局摘要暂未生成成功。
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-11/12" />
              <SkeletonBlock className="h-4 w-3/4" />
            </div>
          )}
        </section>

        <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/25">
          <p className="flex items-start gap-2 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              重要声明：
              {baseResult?.disclaimer ??
                '本推演仅供传统民俗文化研究和决策参考，不构成任何职业、投资、法律等决策建议。所有决策请结合自身实际情况理性判断。'}
            </span>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={onBackToForm}>
              返回修改参数
            </Button>
            <Button
              type="button"
              className=              "rounded-full bg-[#2F6BFF] dark:bg-[#4D7FFF] text-white"
              onClick={onRetry}
            >
              重新演化分析
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
