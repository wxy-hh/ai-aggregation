'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/api/client';
import { useDestinyWorkspaceStore, type ZiweiErrorKind } from '@/stores/destiny-workspace-store';
import { BaziInputForm } from './bazi-input-form';
import { DestinyPageScaffold } from './layout/destiny-page-scaffold';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { ZiweiChartHeader } from './ziwei-chart-header';
import { ZiweiPalaceGrid } from './ziwei-palace-grid';
import { GlossaryTooltip } from './ziwei-glossary';
import { mapFormToBaziRequest } from './bazi-mappers';
import type { BaziFormData } from './bazi-types';
import type {
  DestinyModule,
  DestinyReport,
  DestinyStreamStatus,
  PartialDestinyReport,
  ZiweiChartData,
  ZiweiLockedSections,
  ZiweiPalaceAnalysis,
  ZiweiSectionKey,
  ZiweiStreamEvent,
} from './types';

// ─── 类型 ───

/** AI 返回的宫位标签 → iztro 宫位名映射 */
const AI_TO_IZTRO_PALACE: Record<string, string> = {
  '父母宫': '父母', '福德宫': '福德', '田宅宫': '田宅', '官禄宫': '官禄',
  '命宫': '命宫', '兄弟宫': '兄弟', '奴仆宫': '仆役', '夫妻宫': '夫妻',
  '迁移宫': '迁移', '子女宫': '子女', '财帛宫': '财帛', '疾厄宫': '疾厄',
};

function normalizePalaceLabel(label: string): string {
  return AI_TO_IZTRO_PALACE[label] ?? label;
}

type ZiweiWorkspaceProps = {
  isActive: boolean;
  onLoadingChange?: (loading: boolean) => void;
};

type PanelTab = 'overview' | 'timeline' | 'relations' | 'glossary';

const TAB_OPTIONS: Array<{ key: PanelTab; label: string }> = [
  { key: 'overview', label: '命理总论' },
  { key: 'timeline', label: '大限流年' },
  { key: 'relations', label: '六亲缘分' },
  { key: 'glossary', label: '星曜百科' },
];

// ─── 表单校验 ───

function validateForm(formData: BaziFormData): Partial<Record<keyof BaziFormData, string>> {
  const errors: Partial<Record<keyof BaziFormData, string>> = {};
  if (!formData.name.trim()) errors.name = '请填写姓名';
  if (!formData.location.name.trim()) errors.location = '请填写出生地点';
  return errors;
}

// ─── 错误处理 ───

function classifyResponseError(status: number): ZiweiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429 || status >= 500) return 'model';
  return 'unknown';
}

function displayError(kind: ZiweiErrorKind, fallback?: string): string {
  if (fallback?.trim()) return fallback;
  switch (kind) {
    case 'validation':
      return '参数错误：请检查姓名、出生日期、时间及地点后重试。';
    case 'timeout':
      return '超时错误：模型推演时间过长，请稍后重试。';
    case 'model':
      return '模型错误：紫微斗数分析服务暂不可用，请稍后重试。';
    default:
      return '系统异常：紫微斗数分析失败，请稍后重试。';
  }
}

// ─── 流式解析 ───

function parseStreamBlock(block: string): ZiweiStreamEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .join('\n')
    .trim();
  if (!data) return null;
  return JSON.parse(data) as ZiweiStreamEvent;
}

async function consumeStream(response: Response, onEvent: (event: ZiweiStreamEvent) => void) {
  if (!response.body) throw new Error('响应体为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const block = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      const event = block ? parseStreamBlock(block) : null;
      if (event) onEvent(event);
      idx = buffer.indexOf('\n\n');
    }
  }

  const tail = `${buffer}${decoder.decode()}`.trim();
  const event = tail ? parseStreamBlock(tail) : null;
  if (event) onEvent(event);
}

// ─── 主组件 ───

export function ZiweiWorkspace({ isActive, onLoadingChange }: ZiweiWorkspaceProps) {
  const {
    step,
    formData,
    fieldErrors,
    blockingLoading,
    streaming,
    error,
    report,
    chartData,
    lockedSections,
    streamStatus,
    tab,
    activePalaceLabel,
    setWorkspaceState,
    resetWorkspace,
    restoreWorkspace,
    markResultReady,
  } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      ...state.ziwei,
      setWorkspaceState: state.setWorkspaceState,
      resetWorkspace: state.resetWorkspace,
      restoreWorkspace: state.restoreWorkspace,
      markResultReady: state.markResultReady,
    }))
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  useEffect(() => {
    if (isActive) restoreWorkspace('ziwei');
  }, [isActive, restoreWorkspace]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const onChange = <K extends keyof BaziFormData>(key: K, next: BaziFormData[K]) => {
    setWorkspaceState('ziwei', (current) => ({
      formData: { ...current.formData, [key]: next },
      fieldErrors: { ...current.fieldErrors, [key]: undefined },
    }));
  };

  const submit = async () => {
    const errors = validateForm(formData);
    setWorkspaceState('ziwei', { fieldErrors: errors });
    if (Object.keys(errors).length > 0) {
      setWorkspaceState('ziwei', {
        errorKind: 'validation',
        error: '参数错误：请先完善表单信息后再开始分析',
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setWorkspaceState('ziwei', {
      step: 'form',
      lastView: 'form',
      hasResult: false,
      blockingLoading: true,
      streaming: true,
      error: null,
      errorKind: null,
      report: null,
      chartData: null,
      lockedSections: {},
      streamStatus: 'queued',
      tab: 'overview',
      activePalaceLabel: '命宫',
    });

    let currentErrorKind: ZiweiErrorKind = 'unknown';

    try {
      const response = await fetch('/api/destiny/ziwei-report', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(mapFormToBaziRequest(formData)),
        signal: controller.signal,
      });

      if (!response.ok) {
        currentErrorKind = classifyResponseError(response.status);
        const errText = await response.json().then((j) => j?.error).catch(() => undefined);
        throw new Error(displayError(currentErrorKind, errText));
      }

      const receivedSections: ZiweiLockedSections = {};
      let sawComplete = false;

      await consumeStream(response, (event) => {
        if (event.type === 'status') {
          setWorkspaceState('ziwei', { streamStatus: event.status });
          return;
        }

        if (event.type === 'section-final') {
          if (receivedSections[event.sectionKey]) return;

          const key = event.sectionKey as keyof ZiweiLockedSections;
          let payload = event.payload;

          // 将 AI 返回的宫位标签（如"父母宫"）归一化为 iztro 名称（如"父母"）
          if (event.sectionKey === 'palaceAnalysis' && Array.isArray(event.payload)) {
            payload = (event.payload as ZiweiPalaceAnalysis[]).map((item) => ({
              ...item,
              label: normalizePalaceLabel(item.label),
            }));
          }

          (receivedSections as Record<string, unknown>)[event.sectionKey] = payload;

          setWorkspaceState('ziwei', (current) => ({
            lockedSections: current.lockedSections[event.sectionKey]
              ? current.lockedSections
              : { ...current.lockedSections, [event.sectionKey]: payload },
            chartData:
              event.sectionKey === 'chartData'
                ? (event.payload as ZiweiChartData)
                : current.chartData,
            blockingLoading: false,
            activePalaceLabel:
              event.sectionKey === 'palaceAnalysis' &&
              Array.isArray(payload) &&
              (payload as ZiweiPalaceAnalysis[])[0]?.label
                ? (payload as ZiweiPalaceAnalysis[])[0].label
                : current.activePalaceLabel,
          }));
          markResultReady('ziwei');
          return;
        }

        if (event.type === 'complete') {
          sawComplete = true;
          setWorkspaceState('ziwei', (current) => ({
            report: event.report,
            streaming: false,
            streamStatus: null,
          }));
          markResultReady('ziwei');
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.error);
        }
      });

      if (!sawComplete) {
        setWorkspaceState('ziwei', {
          blockingLoading: false,
          streaming: false,
          streamStatus: null,
        });
      }
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') return;
      const rawMessage = nextError instanceof Error ? nextError.message : undefined;
      setWorkspaceState('ziwei', {
        errorKind: currentErrorKind,
        error: displayError(currentErrorKind, rawMessage),
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setWorkspaceState('ziwei', { blockingLoading: false, streaming: false });
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    resetWorkspace('ziwei');
  };

  const handleRecalculate = () => {
    abortRef.current?.abort();
    resetWorkspace('ziwei');
  };

  return (
    <DestinyPageScaffold withNavOffset>
      <div className="relative h-full min-h-0 w-full bg-[#F1F5F9] dark:bg-[#111218]">
        {step === 'form' ? (
          <div className="absolute inset-0 flex h-full min-h-0 flex-col p-3 sm:p-5 lg:p-6">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <BaziInputForm
                value={formData}
                submitting={blockingLoading || streaming}
                error={error}
                fieldErrors={fieldErrors}
                onChange={onChange}
                onSubmit={() => { void submit(); }}
                onReset={reset}
              />
              {/* 紫微斗数特有提示 */}
              <div className="mt-6 rounded-2xl border border-amber-200/60 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-800/40 p-4">
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  性别至关重要，男女大运走向完全相反。出生时间精确到分钟最佳，若只知道大致时辰，结果仅供参考。建议提供出生地点（精确到市），用于校正真太阳时。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 h-full min-h-0 w-full">
            <ZiweiResultView
              report={report}
              chartData={chartData}
              streaming={streaming}
              streamStatus={streamStatus}
              lockedSections={lockedSections}
              tab={tab}
              activePalaceLabel={activePalaceLabel}
              formData={formData}
              onTabChange={(t) => setWorkspaceState('ziwei', { tab: t })}
              onPalaceLabelChange={(label) => setWorkspaceState('ziwei', { activePalaceLabel: label })}
              onRecalculate={handleRecalculate}
            />
          </div>
        )}
      </div>

      <StarDecodeOverlay open={blockingLoading} />
    </DestinyPageScaffold>
  );
}

// ─── 结果视图 ───

type ResultViewProps = {
  report: DestinyReport | null;
  chartData: ZiweiChartData | null;
  streaming: boolean;
  streamStatus: DestinyStreamStatus | null;
  lockedSections: ZiweiLockedSections;
  tab: PanelTab;
  activePalaceLabel: string;
  formData: BaziFormData;
  onTabChange: (tab: PanelTab) => void;
  onPalaceLabelChange: (label: string) => void;
  onRecalculate: () => void;
};

function ZiweiResultView({
  report,
  chartData,
  streaming,
  streamStatus,
  lockedSections,
  tab,
  activePalaceLabel,
  formData,
  onTabChange,
  onPalaceLabelChange,
  onRecalculate,
}: ResultViewProps) {
  const palaceAnalyses = useMemo<ZiweiPalaceAnalysis[]>(() => {
    return lockedSections.palaceAnalysis ?? [];
  }, [lockedSections.palaceAnalysis]);

  const timeline = useMemo(() => lockedSections.timeline ?? [], [lockedSections.timeline]);
  const relations = useMemo(() => lockedSections.relations, [lockedSections.relations]);

  // 合并 overviewModules（personality/career/wealth）与 love/health 为完整的 5 模块数据
  const allModules = useMemo(() => {
    const ov = lockedSections.overviewModules;
    const base = {
      personality: ov?.personality,
      career: ov?.career,
      wealth: ov?.wealth,
      love: lockedSections.love,
      health: lockedSections.health,
    };
    // complete 事件后 report.modules 可作为兜底
    if (report?.modules) {
      return {
        personality: base.personality ?? report.modules.personality,
        career: base.career ?? report.modules.career,
        wealth: base.wealth ?? report.modules.wealth,
        love: base.love ?? report.modules.love,
        health: base.health ?? report.modules.health,
      };
    }
    return base;
  }, [lockedSections.overviewModules, lockedSections.love, lockedSections.health, report]);

  const activeAnalysis = palaceAnalyses.find((p) => p.label === activePalaceLabel);
  const hasData = !!chartData;

  const progressText =
    streaming && chartData
      ? `AI 正在解读星盘${streamStatus ? ` · ${streamStatus}` : ''}`
      : chartData
        ? '基于精确星盘数据的 AI 深度人生轨迹分析'
        : '正在计算紫微斗数星盘...';

  return (
    <div className="h-full w-full overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:gap-6">
        {/* 页面标题 */}
        <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold leading-tight text-slate-900 dark:text-white">
              <GlossaryTooltip term="紫微">AI 紫微斗数</GlossaryTooltip>{' '}
              <span className="block text-base font-medium text-[#3C58D8] dark:text-[#9BADFF] sm:inline">
                星盘全景视图
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{progressText}</p>
          </div>
          <Button
            type="button"
            onClick={onRecalculate}
            className="self-start inline-flex min-h-10 sm:min-h-11 items-center justify-center rounded-full px-4 sm:px-5 text-xs sm:text-sm font-bold bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white shadow-[0_10px_24px_rgba(93,124,250,0.32)] hover:brightness-[1.03] hover:shadow-[0_14px_30px_rgba(93,124,250,0.36)] active:scale-[0.98] transition-all duration-200 sm:self-auto"
          >
            重新排盘
          </Button>
        </header>

        {/* 无数据提示 */}
        {!hasData && (
          <div className="rounded-[24px] border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 backdrop-blur-[24px] p-8 shadow-[0_8px_20px_rgba(76,95,154,0.10)]">
            <div className="text-lg font-bold text-slate-800 dark:text-white">正在计算紫微星盘</div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              本地排盘引擎正在计算您的精准星盘数据，请稍候...
            </p>
          </div>
        )}

        {chartData && (
          <>
            {/* 命盘头部 */}
            <ZiweiChartHeader
              chart={chartData}
              name={formData.name}
              gender={formData.gender}
            />

            {/* 主体：星盘 + 右侧面板 */}
            <div className="grid grid-cols-12 gap-4 sm:gap-6">
              {/* 左侧：星盘网格 + 模块卡片 */}
              <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
                {/* 星盘网格 */}
                <ZiweiPalaceGrid
                  chart={chartData}
                  activePalaceLabel={activePalaceLabel}
                  onPalaceSelect={onPalaceLabelChange}
                />

                {/* 五大模块卡片 */}
                <ModuleCards
                  modules={allModules}
                  palaceAnalyses={palaceAnalyses}
                  activePalaceLabel={activePalaceLabel}
                  streaming={streaming}
                />
              </div>

              {/* 右侧面板 */}
              <div className="col-span-12 xl:col-span-4">
                <RightPanel
                  tab={tab}
                  activePalaceLabel={activePalaceLabel}
                  activeAnalysis={activeAnalysis}
                  chartData={chartData}
                  timeline={timeline}
                  relations={relations}
                  streaming={streaming}
                  onTabChange={onTabChange}
                />
              </div>
            </div>

            {/* 免责声明 */}
            <Disclaimer />
          </>
        )}
      </div>
    </div>
  );
}

// ─── 五大模块卡片 ───

const MODULE_TONES = [
  'border-[#CFE0FF] bg-[#F7FAFF] shadow-[0_8px_24px_-18px_rgba(57,79,230,0.35)]',
  'border-[#D6E5F7] bg-[#F7FBFF] shadow-[0_8px_24px_-18px_rgba(37,99,235,0.28)]',
  'border-[#DDD9FF] bg-[#F9F7FF] shadow-[0_8px_24px_-18px_rgba(109,40,217,0.26)]',
  'border-[#FFD9DF] bg-[#FFF7F9] shadow-[0_8px_24px_-18px_rgba(217,40,97,0.22)]',
  'border-[#D9F0DF] bg-[#F7FCF9] shadow-[0_8px_24px_-18px_rgba(40,167,97,0.22)]',
];

const MODULE_DEFAULTS = [
  { key: 'personality', label: '性格特质', emoji: '🎯' },
  { key: 'career', label: '事业发展', emoji: '💼' },
  { key: 'wealth', label: '财运运势', emoji: '💰' },
  { key: 'love', label: '感情婚姻', emoji: '💕' },
  { key: 'health', label: '健康运势', emoji: '🏥' },
] as const;

function ModuleCards({
  modules,
  streaming,
}: {
  modules: Partial<Record<string, DestinyModule>> | undefined;
  palaceAnalyses: ZiweiPalaceAnalysis[];
  activePalaceLabel: string;
  streaming: boolean;
}) {
  const moduleList = MODULE_DEFAULTS.map((def, index) => {
    const data = modules?.[def.key];
    return { ...def, tone: MODULE_TONES[index % MODULE_TONES.length], data };
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {moduleList.map((item) => (
        <div
          key={item.key}
          className={`rounded-2xl border p-5 transition-shadow hover:shadow-lg ${item.tone}`}
        >
          {item.data ? (
            <>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {item.data.title}
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {item.data.summary}
              </p>
              {item.data.bullets.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {item.data.bullets.slice(0, 3).map((b, i) => (
                    <li key={i} className="text-xs text-slate-500 dark:text-slate-400 list-disc ml-4">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <ModuleSkeleton label={item.label} />
          )}
        </div>
      ))}
    </div>
  );
}

function ModuleSkeleton({ label }: { label: string }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 animate-pulse rounded bg-slate-200/70" />
      </div>
      <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-200/70" />
      <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-200/70" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-slate-200/70" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200/70" />
      </div>
    </>
  );
}

// ─── 右侧面板 ───

type RightPanelProps = {
  tab: PanelTab;
  activePalaceLabel: string;
  activeAnalysis: ZiweiPalaceAnalysis | undefined;
  chartData: ZiweiChartData;
  timeline: unknown[];
  relations: unknown;
  streaming: boolean;
  onTabChange: (tab: PanelTab) => void;
};

function RightPanel({
  tab,
  activePalaceLabel,
  activeAnalysis,
  chartData,
  timeline,
  relations,
  streaming,
  onTabChange,
}: RightPanelProps) {
  return (
    <section className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl overflow-hidden h-full min-h-[760px] flex flex-col">
      {/* 标签页导航 */}
      <div className="grid grid-cols-4 gap-1 p-2 bg-slate-50/50 dark:bg-slate-900/40">
        {TAB_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onTabChange(option.key)}
            className={[
              'rounded-xl text-xs font-bold py-2.5 transition',
              tab === option.key
                ? 'bg-white dark:bg-slate-800 text-[#3C58D8] dark:text-blue-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 标签页内容 */}
      <div className="p-5 space-y-3 flex-1 min-h-[520px] overflow-y-auto custom-scrollbar">
        {tab === 'overview' && (
          <OverviewTab activeAnalysis={activeAnalysis} activePalaceLabel={activePalaceLabel} />
        )}
        {tab === 'timeline' && <TimelineTab timeline={timeline} streaming={streaming} />}
        {tab === 'relations' && <RelationsTab relations={relations} />}
        {tab === 'glossary' && <GlossaryTab chartData={chartData} />}
      </div>
    </section>
  );
}

// ─── 命理总论标签页 ───

function OverviewTab({
  activeAnalysis,
  activePalaceLabel,
}: {
  activeAnalysis: ZiweiPalaceAnalysis | undefined;
  activePalaceLabel: string;
}) {
  const summary = activeAnalysis?.summary;
  const suggestions = activeAnalysis?.suggestions ?? [];

  return (
    <>
      <div className="text-xs font-bold text-[#3C58D8] dark:text-[#9BADFF]">
        当前宫位 · {activePalaceLabel}
      </div>
      <div className="text-sm font-bold text-slate-900 dark:text-white">
        AI 紫微格局深度解析
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        {summary || 'AI 正在分析当前宫位的星曜组合与格局，请稍候...'}
      </p>

      {suggestions.length > 0 && (
        <details
          open
          className="rounded-[12px] border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-3"
        >
          <summary className="cursor-pointer text-xs font-bold text-emerald-700 dark:text-emerald-400">
            行动建议
          </summary>
          <ul className="mt-2 space-y-1">
            {suggestions.map((item, i) => (
              <li key={i} className="text-xs text-emerald-700 dark:text-emerald-300 list-disc ml-4">
                {item}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details
        open
        className="rounded-[12px] border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3"
      >
        <summary className="cursor-pointer text-xs font-bold text-blue-700 dark:text-blue-400">
          关于星盘解读
        </summary>
        <p className="mt-2 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          点击左侧星盘的任意宫位，可以查看该宫位的 AI 详细解读。星盘数据由本地算法精确计算，解读内容由 AI 基于紫微斗数理论生成，仅供参考。您可以点击任意星曜名称查看专业解释。
        </p>
      </details>
    </>
  );
}

// ─── 大限流年标签页 ───

function TimelineTab({ timeline, streaming }: { timeline: unknown[]; streaming: boolean }) {
  const items = timeline as Array<{
    year?: number;
    title?: string;
    summary?: string;
    detail?: { opportunities?: string[]; risks?: string[]; actions?: string[] };
  }>;

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200/70" />
            <div className="mt-2 h-4 w-28 animate-pulse rounded bg-slate-200/70" />
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-200/70" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <details key={item.year ?? idx} open className="rounded-xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-800/60 backdrop-blur-sm p-3">
          <summary className="cursor-pointer">
            <div className="text-xs text-slate-400">{item.year}年</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
              {item.title}
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{item.summary}</p>
          </summary>
          {item.detail && (
            <div className="mt-3 space-y-2">
              <DetailBox type="opportunities" title="机会" items={item.detail.opportunities} />
              <DetailBox type="risks" title="风险" items={item.detail.risks} />
              <DetailBox type="actions" title="行动" items={item.detail.actions} />
            </div>
          )}
        </details>
      ))}
    </div>
  );
}

function DetailBox({
  type,
  title,
  items,
}: {
  type: 'opportunities' | 'risks' | 'actions';
  title: string;
  items?: string[];
}) {
  const colors = {
    opportunities: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    risks: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
    actions: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  };

  return (
    <div className={`rounded-lg border p-2 ${colors[type]}`}>
      <div className="text-[11px] font-bold">{title}</div>
      <ul className="mt-1 space-y-1">
        {(items ?? []).map((x, i) => (
          <li key={i} className="text-xs list-disc ml-4">{x}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── 六亲缘分标签页 ───

function RelationsTab({ relations }: { relations: unknown }) {
  const data = relations as { summary?: string; opportunities?: string[]; risks?: string[]; actions?: string[] } | undefined;

  return (
    <>
      <div className="text-sm font-bold text-slate-900 dark:text-white">六亲关系建议</div>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        {data?.summary || 'AI 正在分析您的六亲缘分，请稍候...'}
      </p>

      <DetailSection
        type="opportunities"
        title="关系机遇"
        items={data?.opportunities}
        fallback="六亲关系分析定稿后将在此显示。"
      />
      <DetailSection
        type="risks"
        title="注意事项"
        items={data?.risks}
        fallback="关系风险分析定稿后将在此显示。"
      />
      <DetailSection
        type="actions"
        title="相处建议"
        items={data?.actions}
        fallback="行动建议定稿后将在此显示。"
      />
    </>
  );
}

function DetailSection({
  type,
  title,
  items,
  fallback,
}: {
  type: 'opportunities' | 'risks' | 'actions';
  title: string;
  items?: string[];
  fallback: string;
}) {
  const colors = {
    opportunities:
      'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950',
    risks: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950',
    actions: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950',
  };
  const labelColors = {
    opportunities: 'text-emerald-700 dark:text-emerald-400',
    risks: 'text-rose-700 dark:text-rose-400',
    actions: 'text-blue-700 dark:text-blue-400',
  };
  const textColors = {
    opportunities: 'text-emerald-700 dark:text-emerald-300',
    risks: 'text-rose-700 dark:text-rose-300',
    actions: 'text-blue-700 dark:text-blue-300',
  };

  return (
    <details open className={`rounded-xl border p-3 ${colors[type]}`}>
      <summary className={`cursor-pointer text-xs font-bold ${labelColors[type]}`}>
        {title}
      </summary>
      <ul className="mt-2 space-y-1">
        {(items?.length ? items : [fallback]).map((item, i) => (
          <li key={i} className={`text-xs list-disc ml-4 ${textColors[type]}`}>
            {item}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── 星曜百科标签页 ───

function GlossaryTab({ chartData }: { chartData: ZiweiChartData }) {
  const allStars = useMemo(() => {
    const seen = new Set<string>();
    const stars: Array<{ name: string; type: string; brightness: string }> = [];
    for (const palace of chartData.palaces) {
      for (const s of palace.majorStars) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          stars.push(s);
        }
      }
      for (const s of palace.minorStars) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          stars.push(s);
        }
      }
    }
    return stars;
  }, [chartData]);

  const typeLabel: Record<string, string> = {
    major: '主星',
    soft: '吉星',
    tough: '煞星',
    adjective: '杂耀',
    tianma: '动星',
    lucun: '财星',
    flower: '桃花',
    helper: '辅星',
  };

  return (
    <>
      <div className="text-sm font-bold text-slate-900 dark:text-white">您命盘中的星曜</div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        点击任意星曜查看详细解释（亦可点击星盘中的星曜名查看）
      </p>
      <div className="space-y-2 mt-2">
        {allStars.map((star) => (
          <div
            key={star.name}
            className="rounded-xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-800/60 p-2.5"
          >
            <div className="flex items-center gap-2">
              <GlossaryTooltip term={star.name}>
                <span className="text-sm font-bold text-slate-800 dark:text-white cursor-help border-b border-dotted border-[#4969E9]/30">
                  {star.name}
                </span>
              </GlossaryTooltip>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 rounded-md px-1.5 py-px">
                {typeLabel[star.type] ?? star.type}
              </span>
              {star.brightness && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  亮度：{star.brightness}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── 免责声明 ───

function Disclaimer() {
  return (
    <div className="mt-8 rounded-2xl border border-slate-200/40 bg-white/60 dark:bg-slate-900/40 dark:border-white/5 p-5 text-center">
      <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-2xl mx-auto">
        本网站基于传统紫微斗数理论与 AI 大模型生成内容，仅供娱乐消遣之用。命运掌握在自己手中，人生的成败取决于个人的选择和努力。请理性看待，切勿迷信。本网站不提供医疗、法律、投资等专业领域的决策建议。
      </p>
    </div>
  );
}
