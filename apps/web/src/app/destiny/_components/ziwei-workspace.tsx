'use client';

import React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/api/client';
import { useDestinyWorkspaceStore, type ZiweiErrorKind } from '@/stores/destiny-workspace-store';
import { BaziInputForm } from './bazi-input-form';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { mapFormToBaziRequest } from './bazi-mappers';
import type { BaziFormData } from './bazi-types';
import type {
  DestinyReport,
  DestinyStreamStatus,
  PartialDestinyReport,
  ZiweiLockedSections,
  ZiweiSectionKey,
  ZiweiStreamEvent,
} from './types';
import { useIsMobile } from '@/hooks/use-is-mobile';

type ZiweiWorkspaceProps = {
  isActive: boolean;
  onLoadingChange?: (loading: boolean) => void;
};

type PanelTab = 'overview' | 'timeline' | 'relations';

type PalaceViewModel = {
  key: string;
  label: string;
  branch: string;
  stars: string[];
  dominant: string;
  summary: string;
  suggestions: string[];
};

type TimelineItemViewModel = {
  year: string | number;
  title: string;
  summary: string;
  detail: {
    opportunities: string[];
    risks: string[];
    actions: string[];
  };
};

type RelationSection = {
  summary: string;
  opportunities: string[];
  risks: string[];
  actions: string[];
};

const tabOptions: Array<{ key: PanelTab; label: string }> = [
  { key: 'overview', label: '命理总论' },
  { key: 'timeline', label: '大限流年' },
  { key: 'relations', label: '六亲缘分' },
];

const palaceLabels = [
  '父母宫',
  '福德宫',
  '田宅宫',
  '官禄宫',
  '命宫',
  '兄弟宫',
  '奴仆宫',
  '夫妻宫',
  '迁移宫',
  '子女宫',
  '财帛宫',
  '疾厄宫',
];

const palaceGridAreas = [
  'col-start-1 row-start-1',
  'col-start-2 row-start-1',
  'col-start-3 row-start-1',
  'col-start-4 row-start-1',
  'col-start-1 row-start-2',
  'col-start-1 row-start-3',
  'col-start-4 row-start-2',
  'col-start-4 row-start-3',
  'col-start-1 row-start-4',
  'col-start-2 row-start-4',
  'col-start-3 row-start-4',
  'col-start-4 row-start-4',
];

const palaceToneClasses = [
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#D7C07B]/35 bg-[#FFF9EA]/88',
  'border-[#B8C4D6]/35 bg-[#F3F7FF]/88',
  'border-[#E3A59D]/35 bg-[#FFF2F0]/88',
  'border-[#A7B57B]/35 bg-[#F7FAEE]/88',
  'border-[#D7C07B]/30 bg-[#FFF8E6]/85',
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#C6B6E8]/35 bg-[#F4F0FF]/88',
  'border-[#B8C4D6]/35 bg-[#F3F7FF]/88',
  'border-[#A7B57B]/30 bg-[#F7FAEE]/85',
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#C0C9D8]/35 bg-[#F5F7FB]/88',
];

const palaceLabelToneClasses = [
  'text-[#5E769E]',
  'text-[#A7862B]',
  'text-[#657A96]',
  'text-[#B45A4C]',
  'text-[#6A7F3F]',
  'text-[#A7862B]',
  'text-[#5E769E]',
  'text-[#6956A7]',
  'text-[#5A7391]',
  'text-[#6A7F3F]',
  'text-[#5E769E]',
  'text-[#607089]',
];

const starThemeMap: Array<{ names: string[]; className: string }> = [
  { names: ['紫微'], className: 'text-[#5A4BEA]' },
  { names: ['天府'], className: 'text-[#2D7D58]' },
  { names: ['武曲'], className: 'text-[#2F5FAE]' },
  { names: ['太阳'], className: 'text-[#C77A1A]' },
  { names: ['太阴'], className: 'text-[#6B5CA5]' },
  { names: ['天机'], className: 'text-[#1F8A84]' },
  { names: ['天同'], className: 'text-[#329D7C]' },
  { names: ['廉贞'], className: 'text-[#B04A6B]' },
  { names: ['贪狼'], className: 'text-[#8B5E1A]' },
  { names: ['巨门'], className: 'text-[#4E5E7A]' },
  { names: ['天相'], className: 'text-[#3A6AA6]' },
  { names: ['天梁'], className: 'text-[#6D8A2E]' },
  { names: ['七杀'], className: 'text-[#A23A3A]' },
  { names: ['破军'], className: 'text-[#7E4AA1]' },
];

const moduleCardToneClasses = [
  'border-[#CFE0FF] bg-[#F7FAFF] shadow-[0_8px_24px_-18px_rgba(57,79,230,0.35)]',
  'border-[#D6E5F7] bg-[#F7FBFF] shadow-[0_8px_24px_-18px_rgba(37,99,235,0.28)]',
  'border-[#DDD9FF] bg-[#F9F7FF] shadow-[0_8px_24px_-18px_rgba(109,40,217,0.26)]',
];

function getStarColorClass(star: string | undefined): string {
  if (!star) return 'text-slate-800';
  for (const item of starThemeMap) {
    if (item.names.some((name) => star.includes(name))) {
      return item.className;
    }
  }
  return 'text-slate-800';
}

function validateForm(formData: BaziFormData): Partial<Record<keyof BaziFormData, string>> {
  const errors: Partial<Record<keyof BaziFormData, string>> = {};

  if (!formData.name.trim()) {
    errors.name = '请填写姓名';
  }
  if (!formData.location.name.trim()) {
    errors.location = '请填写出生地点';
  }

  return errors;
}

function classifyResponseError(status: number): ZiweiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429 || status >= 500) return 'model';
  return 'unknown';
}

function toDisplayError(kind: ZiweiErrorKind, fallback?: string): string {
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
    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);
      const event = block ? parseStreamBlock(block) : null;
      if (event) onEvent(event);
      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  const tail = `${buffer}${decoder.decode()}`.trim();
  const event = tail ? parseStreamBlock(tail) : null;
  if (event) onEvent(event);
}

function buildPartialReport(sections: ZiweiLockedSections): PartialDestinyReport {
  const partial: PartialDestinyReport = {};

  if (sections.profileOverview) partial.profile = sections.profileOverview;
  if (sections.overviewModules) partial.modules = sections.overviewModules;
  if (sections.timeline) partial.timeline = sections.timeline;
  if (sections.ziweiCenter) partial.ziweiCenter = sections.ziweiCenter;
  if (sections.ziweiPalaces) partial.ziweiPalaces = sections.ziweiPalaces;

  return partial;
}

function mergeLockedSectionsIntoReport(
  nextReport: DestinyReport,
  sections: ZiweiLockedSections
): DestinyReport {
  return {
    ...nextReport,
    profile: sections.profileOverview ?? nextReport.profile,
    modules: {
      ...nextReport.modules,
      ...sections.overviewModules,
    },
    timeline: sections.timeline ?? nextReport.timeline,
    ziweiCenter: sections.ziweiCenter ?? nextReport.ziweiCenter,
    ziweiPalaces: sections.ziweiPalaces ?? nextReport.ziweiPalaces,
  };
}

function buildRelationSection(
  sections: ZiweiLockedSections,
  report: DestinyReport | null
): RelationSection {
  if (sections.relations) return sections.relations;

  return {
    summary: report?.modules.love.summary ?? '',
    opportunities: report?.modules.love.bullets.slice(0, 3) ?? [],
    risks: report?.modules.health.bullets.slice(0, 3) ?? [],
    actions: report?.modules.personality.bullets.slice(0, 3) ?? [],
  };
}

function setLockedSection(
  target: ZiweiLockedSections,
  sectionKey: ZiweiSectionKey,
  payload: ZiweiLockedSections[ZiweiSectionKey]
) {
  (target as Record<ZiweiSectionKey, ZiweiLockedSections[ZiweiSectionKey]>)[sectionKey] = payload;
}

export function ZiweiWorkspace({ isActive, onLoadingChange }: ZiweiWorkspaceProps) {
  const {
    step,
    formData,
    fieldErrors,
    blockingLoading,
    streaming,
    error,
    report,
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

  const pageTitle = useMemo(
    () => (step === 'form' ? '紫微斗数排盘 · 信息输入' : 'AI 紫微斗数 · 星盘全景视图'),
    [step]
  );

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  useEffect(() => {
    if (isActive) {
      restoreWorkspace('ziwei');
    }
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

  const readErrorMessage = async (response: Response) => {
    try {
      const json = (await response.json()) as { error?: string };
      return json.error;
    } catch {
      return undefined;
    }
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
        throw new Error(toDisplayError(currentErrorKind, await readErrorMessage(response)));
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
          setLockedSection(receivedSections, event.sectionKey, event.payload);
          setWorkspaceState('ziwei', (current) => ({
            lockedSections: current.lockedSections[event.sectionKey]
              ? current.lockedSections
              : { ...current.lockedSections, [event.sectionKey]: event.payload },
            blockingLoading: false,
            activePalaceLabel:
              event.sectionKey === 'ziweiPalaces' && event.payload[0]?.label
                ? event.payload[0].label
                : current.activePalaceLabel,
          }));
          markResultReady('ziwei');
          if (event.sectionKey === 'ziweiPalaces' && event.payload[0]?.label) {
            setWorkspaceState('ziwei', { activePalaceLabel: event.payload[0].label });
          }
          return;
        }

        if (event.type === 'complete') {
          sawComplete = true;
          setWorkspaceState('ziwei', (current) => ({
            report: mergeLockedSectionsIntoReport(event.report, receivedSections),
            lockedSections: { ...receivedSections, ...current.lockedSections },
            blockingLoading: false,
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
        throw new Error('分析连接已中断，请稍后重试。');
      }
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') {
        return;
      }
      const rawMessage = nextError instanceof Error ? nextError.message : undefined;
      setWorkspaceState('ziwei', {
        errorKind: currentErrorKind,
        error: toDisplayError(currentErrorKind, rawMessage),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setWorkspaceState('ziwei', {
        blockingLoading: false,
        streaming: false,
      });
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

  const partialReport = useMemo(() => buildPartialReport(lockedSections), [lockedSections]);
  const relationSection = useMemo(
    () => buildRelationSection(lockedSections, report),
    [lockedSections, report]
  );

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/40 via-slate-50 to-indigo-50/30 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950">
      <div className="h-full min-h-0 w-full xl:pl-[304px]">
        {step === 'form' ? (
          <div className="flex h-full min-h-0 flex-col p-6">
            <header className="hidden md:flex shrink-0 justify-between items-center gap-4">
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {pageTitle}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  同页分步流程:先录入生辰信息,再查看 AI 推演结果
                </p>
              </div>
            </header>

            <div className="mt-0 md:mt-6 min-h-0 flex-1 overflow-y-auto rounded-[32px]">
              <BaziInputForm
                value={formData}
                submitting={blockingLoading || streaming}
                error={error}
                fieldErrors={fieldErrors}
                onChange={onChange}
                onSubmit={() => {
                  void submit();
                }}
                onReset={reset}
              />
            </div>
          </div>
        ) : (
          <ZiweiResultView
            report={report ?? partialReport}
            relationSection={relationSection}
            streaming={streaming}
            streamStatus={streamStatus}
            lockedSections={lockedSections}
            tab={tab}
            activePalaceLabel={activePalaceLabel}
            onTabChange={(nextTab) => setWorkspaceState('ziwei', { tab: nextTab })}
            onPalaceLabelChange={(label) =>
              setWorkspaceState('ziwei', { activePalaceLabel: label })
            }
            onRecalculate={handleRecalculate}
          />
        )}
      </div>

      {/* Loading 动画 */}
      <StarDecodeOverlay open={blockingLoading} />
    </div>
  );
}

type ZiweiResultViewProps = {
  report: PartialDestinyReport | null;
  relationSection: RelationSection;
  streaming: boolean;
  streamStatus: DestinyStreamStatus | null;
  lockedSections: ZiweiLockedSections;
  tab: PanelTab;
  activePalaceLabel: string;
  onTabChange: (tab: PanelTab) => void;
  onPalaceLabelChange: (label: string) => void;
  onRecalculate: () => void;
};

function ZiweiResultView({
  report,
  relationSection,
  streaming,
  streamStatus,
  lockedSections,
  tab,
  activePalaceLabel,
  onTabChange,
  onPalaceLabelChange,
  onRecalculate,
}: ZiweiResultViewProps) {
  const isMobile = useIsMobile();
  const palaceData = useMemo<PalaceViewModel[]>(() => {
    if (!report?.ziweiPalaces?.length) return [];

    const byLabel = new Map(report.ziweiPalaces.map((item) => [item.label, item]));
    return palaceLabels
      .map((label, index) => {
        const fallback = report.ziweiPalaces?.[index];
        const palace = byLabel.get(label) ?? fallback;
        if (!palace) return null;
        return {
          key: palace.key ?? `palace-${index + 1}`,
          label,
          branch: palace.branch ?? '',
          stars: palace.stars?.slice(0, 3) ?? [],
          dominant: palace.dominant ?? palace.stars?.[0] ?? '',
          summary: palace.summary ?? '',
          suggestions: palace.suggestions?.slice(0, 4) ?? [],
        };
      })
      .filter((item): item is PalaceViewModel => item != null);
  }, [report]);

  const timeline: TimelineItemViewModel[] = report?.timeline ?? [];
  const activePalace = palaceData.find((item) => item.label === activePalaceLabel) ?? palaceData[0];

  const overviewOpportunities = activePalace?.suggestions?.slice(0, 3) ?? [];
  const overviewRisks = [
    `留意${activePalace?.label ?? '当前宫位'}主题下的情绪波动与冲动决策。`,
    '避免在同一周期内同时推进过多关键事项。',
  ];
  const overviewActions = [
    `围绕${activePalace?.label ?? '当前宫位'}设定本月一到两项核心目标。`,
    '每周复盘一次进度并修正执行节奏。',
  ];

  const relationOpportunities = relationSection.opportunities;
  const relationRisks = relationSection.risks;
  const relationActions = relationSection.actions;
  const progressText =
    streaming && Object.keys(lockedSections).length > 0
      ? `紫微分析正在分区定稿${streamStatus ? ` · ${streamStatus}` : ''}`
      : '基于十四主星与宫位逻辑的深度人生轨迹预测';

  return (
    <div className="h-full w-full overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:gap-6">
        {/* 页面标题 - 使用设计系统字体 */}
        <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight text-slate-900 dark:text-white">
              AI 紫微斗数{' '}
              <span className="block text-base font-medium text-[#5D7CFA] dark:text-[#9BADFF] sm:inline">
                星盘全景视图
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{progressText}</p>
          </div>
          <Button
            type="button"
            onClick={onRecalculate}
            className="self-start rounded-[12px] bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white hover:brightness-110 transition-all duration-200 shadow-[0_8px_20px_rgba(93,124,250,0.32)] hover:shadow-[0_14px_30px_rgba(93,124,250,0.36)] sm:self-auto"
            style={{ transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          >
            重新排盘
          </Button>
        </header>

        {!report && (
          <div className="rounded-[24px] border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 backdrop-blur-[24px] p-8 shadow-[0_8px_20px_rgba(76,95,154,0.10)] dark:shadow-[0_14px_32px_rgba(0,0,0,0.28)]">
            <div className="text-lg font-bold text-slate-800 dark:text-white">暂无紫微排盘数据</div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              点击"重新排盘"可基于当前信息发起紫微斗数分析。
            </p>
          </div>
        )}

        {report && (
          <div className="grid grid-cols-12 gap-4 sm:gap-6">
            <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
              <div className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 p-4 sm:p-5 backdrop-blur-xl shadow-lg">
                <div className="grid grid-cols-2 auto-rows-[minmax(132px,auto)] gap-3 sm:grid-cols-4 sm:grid-rows-4 sm:auto-rows-auto sm:aspect-square">
                  {palaceData.length > 0
                    ? palaceData.map((palace, index) => {
                        const isActive = palace.label === activePalaceLabel;
                        const toneClass = palaceToneClasses[index % palaceToneClasses.length];
                        const labelToneClass =
                          palaceLabelToneClasses[index % palaceLabelToneClasses.length];
                        const dominantColorClass = getStarColorClass(
                          palace.dominant || palace.stars[0]
                        );
                        return (
                          <button
                            key={palace.key}
                            type="button"
                            onClick={() => onPalaceLabelChange(palace.label)}
                            className={[
                              !isMobile && palaceGridAreas[index],
                              'min-h-[132px] rounded-2xl p-3 flex flex-col justify-between text-left transition border shadow-[0_6px_18px_-14px_rgba(30,41,59,0.45),inset_0_1px_0_rgba(255,255,255,0.75)] sm:min-h-0 sm:p-3.5',
                              toneClass,
                              isActive
                                ? 'ring-2 ring-[#4A63EE]/35 border-[#4A63EE]/45 shadow-[0_10px_26px_-14px_rgba(59,91,246,0.46),inset_0_1px_0_rgba(255,255,255,0.84)]'
                                : 'hover:border-[#5D74EA]/35 hover:shadow-[0_12px_30px_-18px_rgba(59,91,246,0.35),inset_0_1px_0_rgba(255,255,255,0.84)]',
                            ].join(' ')}
                          >
                            <div>
                              <div className={`text-xs font-extrabold ${labelToneClass}`}>
                                {palace.label}
                              </div>
                              <div
                                className={`mt-2 text-[2rem] leading-none font-black tracking-tight break-words sm:mt-1 sm:text-xl ${dominantColorClass}`}
                              >
                                {palace.dominant || palace.stars[0] || '主星'}
                              </div>
                              {palace.stars.length > 1 && (
                                <div className="mt-2 text-xs leading-5 text-slate-500 break-words sm:mt-1 sm:text-[11px] sm:leading-normal">
                                  {palace.stars.slice(1).join(' · ')}
                                </div>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-400 sm:text-[11px]">
                                {palace.branch}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    : Array.from({ length: 12 }).map((_, index) => (
                        <div
                          key={`palace-skeleton-${index}`}
                          className={[
                            !isMobile && palaceGridAreas[index],
                            'min-h-[132px] rounded-2xl border border-slate-200/60 bg-white/88 p-3 shadow-sm sm:min-h-0 sm:p-3.5',
                          ].join(' ')}
                        >
                          <div className="h-3 w-14 animate-pulse rounded bg-slate-200/70" />
                          <div className="mt-3 h-6 w-20 animate-pulse rounded bg-slate-200/70" />
                          <div className="mt-2 h-3 w-16 animate-pulse rounded bg-slate-200/70" />
                        </div>
                      ))}

                  <div className="order-first col-span-2 rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl p-4 flex flex-col items-center justify-center text-center shadow-lg sm:order-none sm:col-start-2 sm:col-span-2 sm:row-start-2 sm:row-span-2">
                    <div className="text-[2.25rem] leading-tight font-black text-slate-900 break-words dark:text-white sm:text-[42px] sm:leading-none">
                      {report.ziweiCenter?.chartTitle ?? report.profile?.name ?? '紫微排盘生成中'}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {report.profile?.lunarText ||
                        report.profile?.birthText ||
                        '正在整理命盘基础信息'}
                    </div>
                    <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:items-center">
                      <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-3 py-2 sm:px-4">
                        <div className="text-xs font-bold text-blue-600 dark:text-blue-400">
                          命主
                        </div>
                        <div className="mt-1 text-xl font-black text-blue-900 break-words dark:text-blue-100 sm:text-2xl sm:mt-0.5">
                          {report.ziweiCenter?.mingZhu ?? '待定稿'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2 sm:px-4">
                        <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                          身主
                        </div>
                        <div className="mt-1 text-xl font-black text-amber-900 break-words dark:text-amber-100 sm:text-2xl sm:mt-0.5">
                          {report.ziweiCenter?.shenZhu ?? '待定稿'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[report.modules?.personality, report.modules?.career, report.modules?.wealth].map(
                  (module, index) => {
                    const toneClass = moduleCardToneClasses[index % moduleCardToneClasses.length];
                    return (
                      <div
                        key={module?.title ?? `module-skeleton-${index}`}
                        className={`rounded-2xl border p-5 transition-shadow hover:shadow-lg ${toneClass}`}
                      >
                        {module ? (
                          <>
                            <div className="text-sm font-bold text-slate-900 dark:text-white">
                              {module.title}
                            </div>
                            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {module.summary}
                            </p>
                            <ul className="mt-3 space-y-1.5">
                              {module.bullets.slice(0, 3).map((item, i) => (
                                <li
                                  key={`${module.title}-${i}`}
                                  className="text-xs text-slate-500 dark:text-slate-400 list-disc ml-4"
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          <>
                            <div className="h-4 w-24 animate-pulse rounded bg-slate-200/70" />
                            <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-200/70" />
                            <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-200/70" />
                            <div className="mt-3 space-y-2">
                              <div className="h-3 w-full animate-pulse rounded bg-slate-200/70" />
                              <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200/70" />
                              <div className="h-3 w-3/5 animate-pulse rounded bg-slate-200/70" />
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            <div className="col-span-12 xl:col-span-4">
              <section className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl overflow-hidden h-full min-h-[760px] flex flex-col">
                <div className="grid grid-cols-3 gap-1 p-2 bg-slate-50/50 dark:bg-slate-900/40">
                  {tabOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => onTabChange(option.key)}
                      className={[
                        'rounded-xl text-xs font-bold py-2.5 transition',
                        tab === option.key
                          ? 'bg-white dark:bg-slate-800 text-[#394FE6] dark:text-blue-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="p-5 space-y-3 flex-1 min-h-[520px] overflow-y-auto custom-scrollbar">
                  {tab === 'overview' && (
                    <>
                      <div className="text-xs font-bold text-[#5D7CFA] dark:text-[#9BADFF]">
                        当前宫位 · {activePalace?.label ?? '命宫'}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        AI 紫微格局深度解析
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {activePalace?.summary ||
                          report.modules?.personality?.summary ||
                          '对应宫位区块定稿后将在此显示稳定结论。'}
                      </p>

                      <details
                        open
                        className="rounded-[12px] border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          机会建议
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {overviewOpportunities.length > 0 ? (
                            overviewOpportunities.map((item, i) => (
                              <li
                                key={`ov-op-${i}`}
                                className="text-xs text-emerald-700 dark:text-emerald-300 list-disc ml-4"
                              >
                                {item}
                              </li>
                            ))
                          ) : (
                            <li className="text-xs text-emerald-700 dark:text-emerald-300 list-disc ml-4">
                              宫位建议定稿后将在此显示。
                            </li>
                          )}
                        </ul>
                      </details>

                      <details
                        open
                        className="rounded-[12px] border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-rose-700 dark:text-rose-400">
                          风险预警
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {overviewRisks.map((item, i) => (
                            <li
                              key={`ov-risk-${i}`}
                              className="text-xs text-rose-700 dark:text-rose-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <details
                        open
                        className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-blue-700 dark:text-blue-400">
                          行动清单
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {overviewActions.map((item, i) => (
                            <li
                              key={`ov-action-${i}`}
                              className="text-xs text-blue-700 dark:text-blue-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </>
                  )}

                  {tab === 'timeline' && (
                    <div className="space-y-3">
                      {timeline.length > 0
                        ? timeline.map((item) => (
                            <details
                              key={item.year}
                              open
                              className="rounded-xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-800/60 backdrop-blur-sm p-3"
                            >
                              <summary className="cursor-pointer">
                                <div className="text-xs text-slate-400 dark:text-slate-500">
                                  {item.year}
                                </div>
                                <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                                  {item.title}
                                </div>
                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                  {item.summary}
                                </p>
                              </summary>
                              <div className="mt-3 grid grid-cols-1 gap-2">
                                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 p-2">
                                  <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                    机会
                                  </div>
                                  <ul className="mt-1 space-y-1">
                                    {item.detail.opportunities.map((x, i) => (
                                      <li
                                        key={`t-op-${item.year}-${i}`}
                                        className="text-xs text-emerald-700 dark:text-emerald-300 list-disc ml-4"
                                      >
                                        {x}
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div className="rounded-lg bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 p-2">
                                  <div className="text-[11px] font-bold text-rose-700 dark:text-rose-400">
                                    风险
                                  </div>
                                  <ul className="mt-1 space-y-1">
                                    {item.detail.risks.map((x, i) => (
                                      <li
                                        key={`t-risk-${item.year}-${i}`}
                                        className="text-xs text-rose-700 dark:text-rose-300 list-disc ml-4"
                                      >
                                        {x}
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-2">
                                  <div className="text-[11px] font-bold text-blue-700 dark:text-blue-400">
                                    行动
                                  </div>
                                  <ul className="mt-1 space-y-1">
                                    {item.detail.actions.map((x, i) => (
                                      <li
                                        key={`t-action-${item.year}-${i}`}
                                        className="text-xs text-blue-700 dark:text-blue-300 list-disc ml-4"
                                      >
                                        {x}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </details>
                          ))
                        : Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={`timeline-skeleton-${index}`}
                              className="rounded-xl border border-slate-200/60 bg-white/90 p-3"
                            >
                              <div className="h-3 w-16 animate-pulse rounded bg-slate-200/70" />
                              <div className="mt-2 h-4 w-28 animate-pulse rounded bg-slate-200/70" />
                              <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-200/70" />
                            </div>
                          ))}
                    </div>
                  )}

                  {tab === 'relations' && (
                    <>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        六亲关系建议
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {relationSection.summary || '关系分区定稿后将在此显示。'}
                      </p>

                      <details
                        open
                        className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          机会建议
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {(relationOpportunities.length > 0
                            ? relationOpportunities
                            : ['关系区块定稿后将在此显示机会建议。']
                          ).map((item, i) => (
                            <li
                              key={`rel-op-${i}`}
                              className="text-xs text-emerald-700 dark:text-emerald-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <details
                        open
                        className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-rose-700 dark:text-rose-400">
                          风险预警
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {(relationRisks.length > 0
                            ? relationRisks
                            : ['关系区块定稿后将在此显示风险提醒。']
                          ).map((item, i) => (
                            <li
                              key={`rel-risk-${i}`}
                              className="text-xs text-rose-700 dark:text-rose-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <details
                        open
                        className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-blue-700 dark:text-blue-400">
                          行动清单
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {(relationActions.length > 0
                            ? relationActions
                            : ['关系区块定稿后将在此显示行动建议。']
                          ).map((item, i) => (
                            <li
                              key={`rel-action-${i}`}
                              className="text-xs text-blue-700 dark:text-blue-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <details className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950 p-3">
                        <summary className="cursor-pointer text-xs font-bold text-violet-700 dark:text-violet-400">
                          宫位联动建议 · {activePalace?.label ?? '命宫'}
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {(activePalace?.suggestions?.length
                            ? activePalace.suggestions
                            : ['宫位结构定稿后将在此显示联动建议。']
                          ).map((item, i) => (
                            <li
                              key={`palace-link-${i}`}
                              className="text-xs text-violet-700 dark:text-violet-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
