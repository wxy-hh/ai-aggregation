'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore, type BaziErrorKind } from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { createDestinyHistoryItem } from '@/lib/utils/history-helpers';
import { generateUUID } from '@/lib/utils/uuid';
import { cn } from '@/lib/utils';
import { BaziInputForm } from './bazi-input-form';
import { DestinyShell } from './layout/destiny-shell';
import { DestinyModelSwitcher } from '@/components/destiny/model-switcher';
import { DestinyPageScaffold } from './layout/destiny-page-scaffold';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { mapFormToBaziRequest } from './bazi-mappers';
// 跨模态接力：命盘生成后经 externalDraft 预填顾问（绝不复用 queuedQuestion，REQ §4.6.4）
import { useRelayReceive } from '@/components/relay/use-relay-receive';
import type { BaziFormData } from './bazi-types';
import type {
  BaziLockedSections,
  BaziSectionKey,
  BaziStreamEvent,
  DestinyReport,
  PartialDestinyReport,
} from './types';
import type { DestinyModuleKey } from './layout/left-nav';

type BaziWorkspaceProps = {
  isActive: boolean;
  activeModule: DestinyModuleKey;
  onModuleChange?: (key: DestinyModuleKey) => void;
  onLoadingChange?: (loading: boolean) => void;
};

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

function classifyResponseError(status: number): BaziErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429 || status >= 500) return 'model';
  return 'unknown';
}

function toDisplayError(kind: BaziErrorKind, fallback?: string): string {
  if (fallback?.trim()) return fallback;

  switch (kind) {
    case 'validation':
      return '参数错误：请检查姓名、出生日期、时间及地点后重试。';
    case 'timeout':
      return '超时错误：模型推演时间过长，请稍后重试。';
    case 'model':
      return '模型错误：分析服务暂不可用，请稍后重试。';
    default:
      return '系统异常：八字分析失败，请稍后重试。';
  }
}

export function BaziWorkspace({
  isActive,
  activeModule,
  onModuleChange,
  onLoadingChange,
}: BaziWorkspaceProps) {
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
    setWorkspaceState,
    resetWorkspace,
    restoreWorkspace,
    markResultReady,
    provider,
  } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      ...state.bazi,
      setWorkspaceState: state.setWorkspaceState,
      resetWorkspace: state.resetWorkspace,
      restoreWorkspace: state.restoreWorkspace,
      markResultReady: state.markResultReady,
      provider: state.provider,
    }))
  );
  const abortRef = useRef<AbortController | null>(null);
  const currentHistoryIdRef = useRef<string | null>(null);

  // 接力：八字目标接收。命盘生成后把引用文本经 externalDraft 预填到 AI 顾问输入框。
  const relay = useRelayReceive('destiny');
  const relayText = relay.bundle?.items[0]?.snapshotText ?? '';
  const relayDraft = useMemo(() => {
    if (step !== 'result' || !report || !relayText) return null;
    return { id: relay.bundle!.id, text: relayText };
  }, [step, report, relayText, relay.bundle]);
  // 预填被顾问接收：仅记录，不完成接力（REQ §4.6.4-5：发送成功才完成接力）
  const handleRelayDraftHandled = useMemo(
    () => () => {
      // 顾问已接收预填：此处不清引用，接力完成时机推迟到「顾问发送成功」（onRelayDraftSent）
    },
    [relay.bundle?.id]
  );
  // 顾问发送预填内容成功：完成一次接力（清活动引用与草稿）
  const handleRelayDraftSent = useMemo(
    () => () => {
      relay.commitExecution();
    },
    [relay.bundle?.id]
  );

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  useEffect(() => {
    if (isActive) {
      restoreWorkspace('bazi');
    }
  }, [isActive, restoreWorkspace]);

  const isBaziHistoryInitialized = useHistoryStore((state) => state.isInitialized);

  // 从历史记录恢复
  useEffect(() => {
    if (!isActive || !isBaziHistoryInitialized) return;
    const params = new URLSearchParams(window.location.search);
    const historyId = params.get('historyId');
    if (!historyId) return;
    const historyItem = useHistoryStore.getState().getItemById(historyId);
    if (historyItem?.type !== 'destiny' || historyItem.subType !== 'bazi') return;
    // 兼容旧格式（reportData 直接是 mergedReport）和新格式（{ report, lockedSections }）
    const reportData = historyItem.reportData as Record<string, unknown> | null;
    const isNewFormat = reportData != null && 'report' in reportData && 'lockedSections' in reportData;
    setWorkspaceState('bazi', {
      step: 'result',
      lastView: 'result',
      hasResult: true,
      blockingLoading: false,
      streaming: false,
      error: null,
      errorKind: null,
      report: (isNewFormat ? (reportData as Record<string, unknown>).report : reportData) as never,
      lockedSections: (isNewFormat ? (reportData as Record<string, unknown>).lockedSections : {}) as BaziLockedSections,
      streamStatus: null,
      formData: (historyItem.formData as BaziFormData) || formData,
      fieldErrors: {},
    });
    // 恢复完成后清理 URL 中的 historyId，避免刷新或切换 tab 时重复触发
    const url = new URL(window.location.href);
    url.searchParams.delete('historyId');
    window.history.replaceState({}, '', url.toString());
    // formData 仅用作后备值，历史记录恢复以 item.formData 为准，无需作为依赖
    // setWorkspaceState 为 Zustand 稳定引用，无需声明为依赖
  }, [isActive, isBaziHistoryInitialized]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const onChange = <K extends keyof BaziFormData>(key: K, next: BaziFormData[K]) => {
    setWorkspaceState('bazi', (current) => ({
      formData: { ...current.formData, [key]: next },
      fieldErrors: { ...current.fieldErrors, [key]: undefined },
    }));
  };

  const setLockedSection = (
    target: BaziLockedSections,
    sectionKey: BaziSectionKey,
    payload: BaziLockedSections[BaziSectionKey]
  ) => {
    (target as Record<BaziSectionKey, BaziLockedSections[BaziSectionKey]>)[sectionKey] = payload;
  };

  const buildPartialReport = (sections: BaziLockedSections): PartialDestinyReport => {
    const partial: PartialDestinyReport = {};
    if (sections.baziBasis) {
      partial.baziBasis = {
        ...sections.baziBasis,
        decadeFortuneInsights:
          sections.decadeFortuneInsights ?? sections.baziBasis.decadeFortuneInsights,
      };
    }
    if (sections.profileOverview) partial.profile = sections.profileOverview;
    if (sections.coreDestinyTone) partial.coreTone = sections.coreDestinyTone;
    if (sections.pillars) partial.pillars = sections.pillars;
    if (sections.elementsAndTenGods) {
      partial.elements = sections.elementsAndTenGods.elements;
      partial.tenGods = sections.elementsAndTenGods.tenGods;
      partial.balanceInsight = sections.elementsAndTenGods.balanceInsight;
      partial.patternHighlights = sections.elementsAndTenGods.patternHighlights;
      partial.lifeDimensions = sections.elementsAndTenGods.lifeDimensions;
      partial.lifeDimensionHighlights = sections.elementsAndTenGods.lifeDimensionHighlights;
      partial.tenGodDomains = sections.elementsAndTenGods.tenGodDomains;
    }
    const partialModules: Partial<DestinyReport['modules']> = {};
    if (sections.modulePersonality) partialModules.personality = sections.modulePersonality;
    if (sections.moduleCareer) partialModules.career = sections.moduleCareer;
    if (sections.moduleLove) partialModules.love = sections.moduleLove;
    if (sections.moduleWealth) partialModules.wealth = sections.moduleWealth;
    if (sections.moduleHealth) partialModules.health = sections.moduleHealth;
    if (Object.keys(partialModules).length > 0) partial.modules = partialModules;
    if (sections.timeline) partial.timeline = sections.timeline;
    return partial;
  };

  const mergeLockedSectionsIntoReport = (
    nextReport: DestinyReport,
    sections: BaziLockedSections
  ): DestinyReport => ({
    ...nextReport,
    baziBasis: sections.baziBasis
      ? {
          ...sections.baziBasis,
          decadeFortuneInsights:
            sections.decadeFortuneInsights ?? sections.baziBasis.decadeFortuneInsights,
        }
      : nextReport.baziBasis,
    profile: sections.profileOverview ?? nextReport.profile,
    coreTone: sections.coreDestinyTone ?? nextReport.coreTone,
    pillars: sections.pillars ?? nextReport.pillars,
    elements: sections.elementsAndTenGods?.elements ?? nextReport.elements,
    tenGods: sections.elementsAndTenGods?.tenGods ?? nextReport.tenGods,
    balanceInsight: sections.elementsAndTenGods?.balanceInsight ?? nextReport.balanceInsight,
    patternHighlights:
      sections.elementsAndTenGods?.patternHighlights ?? nextReport.patternHighlights,
    lifeDimensions: sections.elementsAndTenGods?.lifeDimensions ?? nextReport.lifeDimensions,
    lifeDimensionHighlights:
      sections.elementsAndTenGods?.lifeDimensionHighlights ?? nextReport.lifeDimensionHighlights,
    tenGodDomains: sections.elementsAndTenGods?.tenGodDomains ?? nextReport.tenGodDomains,
    modules: {
      personality: sections.modulePersonality ?? nextReport.modules.personality,
      career: sections.moduleCareer ?? nextReport.modules.career,
      love: sections.moduleLove ?? nextReport.modules.love,
      wealth: sections.moduleWealth ?? nextReport.modules.wealth,
      health: sections.moduleHealth ?? nextReport.modules.health,
    },
    timeline: sections.timeline ?? nextReport.timeline,
  });

  const hasAnyDisplayableSection = (sections: BaziLockedSections) =>
    Object.keys(sections).length > 0;

  const parseStreamBlock = (block: string, onEvent: (event: BaziStreamEvent) => void) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n')
      .trim();

    if (!data) return;
    onEvent(JSON.parse(data) as BaziStreamEvent);
  };

  const consumeStream = async (response: Response, onEvent: (event: BaziStreamEvent) => void) => {
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
        if (block) parseStreamBlock(block, onEvent);
        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    const tail = `${buffer}${decoder.decode()}`.trim();
    if (tail) {
      parseStreamBlock(tail, onEvent);
    }
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
    setWorkspaceState('bazi', { fieldErrors: errors });
    if (Object.keys(errors).length > 0) {
      setWorkspaceState('bazi', {
        errorKind: 'validation',
        error: '参数错误：请先完善表单信息后再开始分析',
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    currentHistoryIdRef.current = generateUUID();

    setWorkspaceState('bazi', {
      step: 'form',
      lastView: 'form',
      hasResult: false,
      blockingLoading: true,
      streaming: true,
      error: null,
      errorKind: null,
      lockedSections: {},
      report: null,
      streamStatus: 'queued',
    });

    let currentErrorKind: BaziErrorKind = 'unknown';

    try {
      const response = await authFetch('/api/destiny/report', {
        method: 'POST',
        body: JSON.stringify({ ...mapFormToBaziRequest(formData), provider }),
        signal: controller.signal,
      });

      if (!response.ok) {
        currentErrorKind = classifyResponseError(response.status);
        setWorkspaceState('bazi', { errorKind: currentErrorKind });
        throw new Error(toDisplayError(currentErrorKind, await readErrorMessage(response)));
      }

      const receivedSections: BaziLockedSections = {};
      let sawComplete = false;

      await consumeStream(response, (event) => {
        if (event.type === 'status') {
          setWorkspaceState('bazi', { streamStatus: event.status });
          return;
        }

        if (event.type === 'section-final') {
          if (receivedSections[event.sectionKey]) return;
          setLockedSection(receivedSections, event.sectionKey, event.payload);
          setWorkspaceState('bazi', (current) => ({
            lockedSections: current.lockedSections[event.sectionKey]
              ? current.lockedSections
              : { ...current.lockedSections, [event.sectionKey]: event.payload },
            blockingLoading: hasAnyDisplayableSection({
              ...receivedSections,
              ...current.lockedSections,
            })
              ? false
              : current.blockingLoading,
          }));
          if (hasAnyDisplayableSection(receivedSections)) {
            markResultReady('bazi');
          }
          return;
        }

        if (event.type === 'complete') {
          sawComplete = true;
          const mergedReport = mergeLockedSectionsIntoReport(event.report, receivedSections);
          setWorkspaceState('bazi', (current) => ({
            report: mergedReport,
            lockedSections: { ...receivedSections, ...current.lockedSections },
            blockingLoading: false,
            streaming: false,
            streamStatus: null,
          }));
          markResultReady('bazi');

          // 保存到历史记录（包含 lockedSections 以便恢复时重建完整状态）
          const currentState = useDestinyWorkspaceStore.getState().bazi;
          const enhancedReportData = {
            report: mergedReport,
            lockedSections: currentState.lockedSections,
          };
          const previewText =
            mergedReport.coreTone?.headline ||
            mergedReport.coreTone?.description ||
            '八字格局精批';
          const historyItem = createDestinyHistoryItem(
            'bazi',
            formData as unknown as Record<string, unknown>,
            enhancedReportData as unknown as Record<string, unknown>,
            'doubao-seed-2-0',
            {
              id: currentHistoryIdRef.current || undefined,
              title: `${formData.name}的八字命理报告`,
              preview: previewText.slice(0, 150),
              coreTone: mergedReport.coreTone?.tag || '八字命理',
              // 接力派生：有活动引用时记录来源（REQ-013）；完成接力时机在顾问发送成功（§4.6.4-5）
              derivation: relay.prepareExecution(),
            }
          );
          useHistoryStore.getState().addItem(historyItem);
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
      setWorkspaceState('bazi', {
        errorKind: currentErrorKind,
        error: toDisplayError(currentErrorKind, rawMessage),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setWorkspaceState('bazi', {
        blockingLoading: false,
        streaming: false,
      });
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    resetWorkspace('bazi');
  };

  const handleRecalculate = () => {
    abortRef.current?.abort();
    resetWorkspace('bazi');
  };

  const partialReport = useMemo(() => buildPartialReport(lockedSections), [lockedSections]);

  const stepTransitionClass =
    'transition-all duration-300 motion-reduce:transition-opacity motion-reduce:duration-150';
  const stepTransitionStyle = {
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  } as const;

  return (
    <DestinyPageScaffold withNavOffset tone="blue">
      <div className="relative h-full min-h-0 w-full overflow-hidden">
        <div className="relative flex h-full min-h-0 flex-col p-4 sm:p-6">
          {step === 'form' && (
            <header className="flex shrink-0 flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                    八字格局精批
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                    信息输入
                  </span>
                </div>
                {/* 移动端：模型切换与标题同行右上；桌面端由页面右上悬浮入口承接 */}
                <DestinyModelSwitcher size="compact" className="shrink-0 xl:hidden" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                填写生辰时空信息，AI 将基于真实模型生成完整命理解读
              </p>
            </header>
          )}

          <div className="relative mt-4 min-h-0 flex-1 sm:mt-6">
            {/* 表单步 */}
            <div
              className={cn(
                'absolute inset-0 min-h-0 overflow-y-auto pr-1 custom-scrollbar',
                stepTransitionClass,
                step === 'form'
                  ? 'pointer-events-auto z-10 opacity-100 translate-y-0'
                  : 'pointer-events-none z-0 opacity-0 translate-y-2 motion-reduce:translate-y-0'
              )}
              style={stepTransitionStyle}
              aria-hidden={step !== 'form'}
            >
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

            {/* 结果步 */}
            <div
              className={cn(
                'absolute inset-0 h-full min-h-0 w-full',
                stepTransitionClass,
                step === 'result'
                  ? 'pointer-events-auto z-10 opacity-100 translate-y-0'
                  : 'pointer-events-none z-0 opacity-0 translate-y-2 motion-reduce:translate-y-0'
              )}
              style={stepTransitionStyle}
              aria-hidden={step !== 'result'}
            >
              <DestinyShell
                report={report}
                partialReport={partialReport}
                streaming={streaming}
                streamStatus={streamStatus}
                streamError={error}
                lockedSections={lockedSections}
                activeModule={activeModule}
                title="AI 命理大师"
                subtitleTag="八字格局精批"
                onModuleChange={onModuleChange}
                onRecalculate={handleRecalculate}
                relayDraft={relayDraft}
                onRelayDraftHandled={handleRelayDraftHandled}
                onRelayDraftSent={handleRelayDraftSent}
              />
            </div>
          </div>
        </div>
      </div>

      <StarDecodeOverlay open={blockingLoading} />
    </DestinyPageScaffold>
  );
}
