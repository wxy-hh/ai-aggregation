'use client';

import React, { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore, type QimenErrorKind } from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { createDestinyHistoryItem } from '@/lib/utils/history-helpers';
import { generateUUID } from '@/lib/utils/uuid';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DestinyPageScaffold } from './layout/destiny-page-scaffold';
import { QimenInputForm } from './qimen-input-form';
import { QimenAnalysisResult } from './qimen-analysis-result';
import { mapFormToQimenRequest } from './qimen-mappers';
// 跨模态接力：奇门预填所问之事（REQ-011；绝不写入出生资料，奇门无出生资料）
import { useRelayReceive } from '@/components/relay/use-relay-receive';
import type {
  QimenBaseSectionResponse,
  QimenAnalysisStartResponse,
  QimenAsyncSectionKey,
  QimenFormData,
  QimenSectionResponse,
  QimenSectionStatus,
} from './qimen-types';

type QimenWorkspaceProps = {
  isActive: boolean;
  onLoadingChange?: (loading: boolean) => void;
};

function validateForm(formData: QimenFormData): Partial<Record<keyof QimenFormData, string>> {
  const errors: Partial<Record<keyof QimenFormData, string>> = {};

  if (!formData.datetime.trim()) {
    errors.datetime = '请填写起局时间';
  }
  if (!formData.location.name.trim()) {
    errors.location = '请选择地点';
  }

  const desc = formData.description.trim();
  if (!desc) {
    errors.description = '请填写问题描述';
  } else if (desc.length < 10) {
    errors.description = '问题描述至少 10 个字';
  }

  return errors;
}

function classifyResponseError(status: number): QimenErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429 || status >= 500) return 'model';
  return 'unknown';
}

function toDisplayError(kind: QimenErrorKind, fallback?: string): string {
  if (fallback?.trim()) return fallback;

  switch (kind) {
    case 'validation':
      return '参数错误：请检查起局时间、地点及问题描述后重试。';
    case 'timeout':
      return '超时错误：模型推演时间过长，请稍后重试。';
    case 'model':
      return '模型错误：分析服务暂不可用，请稍后重试。';
    default:
      return '系统异常：奇门遁甲分析失败，请稍后重试。';
  }
}

export function QimenWorkspace({ isActive, onLoadingChange }: QimenWorkspaceProps) {
  const {
    step,
    formData,
    fieldErrors,
    blockingLoading,
    error,
    analysisId,
    baseResult,
    baseStatus,
    baseError,
    sections,
    sectionStatuses,
    sectionErrors,
    setWorkspaceState,
    resetWorkspace,
    restoreWorkspace,
    provider,
  } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      ...state.qimen,
      setWorkspaceState: state.setWorkspaceState,
      resetWorkspace: state.resetWorkspace,
      restoreWorkspace: state.restoreWorkspace,
      provider: state.provider,
    }))
  );
  const abortRef = useRef<AbortController | null>(null);
  const sectionTimeoutsRef = useRef<number[]>([]);
  const runIdRef = useRef(0);

  // 接力：奇门目标接收。所问之事（description）可预填，绝不自动起局（点起局才完成）。
  const relay = useRelayReceive('destiny');
  const relayText = relay.bundle?.items[0]?.snapshotText ?? '';
  useEffect(() => {
    if (!relay.initialized || !relay.bundle) return;
    if (!relayText) return;
    // 仅在 description 为空且用户未编辑过草稿时预填，避免覆盖用户输入
    if (!formData.description.trim() && !relay.draft) {
      onChange('description', relayText);
      relay.setDraft(relayText);
    }
     
  }, [relay.initialized, relay.bundle?.id]);

  // 当前分析的 history ID（在 submit 时生成，save 时复用，保证 id 稳定）
  const currentHistoryIdRef = useRef<string | null>(null);
  // 记录本 mount 周期内成功创建的 analysisId，防止因 store 状态残留触发保存
  const submittedAnalysisIdRef = useRef<string | null>(null);

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  useEffect(() => {
    if (isActive) {
      restoreWorkspace('qimen');
    }
  }, [isActive, restoreWorkspace]);

  // 当所有分析区块完成后保存历史记录
  const historySavedRef = useRef(false);
  useEffect(() => {
    // 非活跃 tab 不保存，防止所有 workspace 同时挂载时非活跃 tab 也触发保存
    if (!isActive) return;
    // 恢复历史时不保存（URL 中仍有 historyId 参数，或已由恢复流程标记）
    if (historySavedRef.current) return;
    // 额外防护：检查 URL 是否还有 historyId（防止 Zustand 同步更新时序问题）
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('historyId')) return;
    }
    // 核心防护：仅保存在本 mount 周期内发起的分析，防止因 workspace store 状态残留触发重复保存
    if (!submittedAnalysisIdRef.current || submittedAnalysisIdRef.current !== analysisId) return;
    if (!baseResult || !analysisId) return;
    const statusValues = Object.values(sectionStatuses) as QimenSectionStatus[];
    if (statusValues.length < 3) return;
    const allSettled = statusValues.every(
      (s) => s === 'completed' || s === 'failed'
    );
    if (!allSettled) return;

    historySavedRef.current = true;
    const description = formData.description || '奇门遁甲推演';
    const previewText = description.length > 150 ? description.slice(0, 150) : description;

    // 接力两阶段（REQ-016）：起局成功写历史前只读派生元数据（不清引用），成功才 commit
    const derivation = relay.prepareExecution();

    // 打包所有结果数据
    const reportData = {
      baseResult,
      sections,
      analysisId,
      formData,
    };

    const historyItem = createDestinyHistoryItem(
      'qimen',
      { ...formData } as unknown as Record<string, unknown>,
      reportData as unknown as Record<string, unknown>,
      'doubao-seed-2-0',
      {
        id: currentHistoryIdRef.current || undefined,
        title: `奇门遁甲推演 · ${baseResult.chartTitle || '盘局分析'}`,
        preview: previewText,
        coreTone: baseResult.chartTitle || '奇门遁甲',
        derivation,
      }
    );
    useHistoryStore.getState().addItem(historyItem);
    // 起局成功才完成接力：清活动引用与草稿（REQ-016/§4.6.5「起局成功后完成接力」）
    relay.commitExecution();
  }, [isActive, baseResult, analysisId, sectionStatuses, sections, formData]);

  // 从历史记录恢复
  useEffect(() => {
    if (!isActive) return;
    const params = new URLSearchParams(window.location.search);
    const historyId = params.get('historyId');
    if (!historyId) return;
    const historyItem = useHistoryStore.getState().getItemById(historyId);
    if (historyItem?.type !== 'destiny' || historyItem.subType !== 'qimen') return;
    const savedData = historyItem.reportData as Record<string, unknown> | null;
    if (!savedData) return;
    const savedBaseResult = savedData.baseResult;
    const savedSections = (savedData.sections as Record<string, unknown>) || {};
    const savedAnalysisId = savedData.analysisId as string;
    const savedFormData = (savedData.formData as QimenFormData) || formData;

    setWorkspaceState('qimen', {
      step: 'result',
      lastView: 'result',
      hasResult: true,
      blockingLoading: false,
      error: null,
      errorKind: null,
      analysisId: savedAnalysisId || null,
      baseResult: savedBaseResult as never,
      baseStatus: 'completed',
      baseError: null,
      sections: savedSections as never,
      sectionErrors: {},
      sectionStatuses: {
        strategyOverview: Object.prototype.hasOwnProperty.call(savedSections, 'strategyOverview')
          ? 'completed'
          : 'idle',
        timingWindows: Object.prototype.hasOwnProperty.call(savedSections, 'timingWindows')
          ? 'completed'
          : 'idle',
        chartSummary: Object.prototype.hasOwnProperty.call(savedSections, 'chartSummary')
          ? 'completed'
          : 'idle',
      },
      formData: savedFormData,
      fieldErrors: {},
    });
    // 防止恢复后 sectionStatuses 观察者再次触发保存
    historySavedRef.current = true;
    // 恢复完成后清理 URL 中的 historyId，避免刷新或切换 tab 时重复触发
    const url = new URL(window.location.href);
    url.searchParams.delete('historyId');
    window.history.replaceState({}, '', url.toString());
    // formData 仅用作后备值，恢复以 savedData.formData 为准
    // setWorkspaceState 为 Zustand 稳定引用
  }, [isActive]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearSectionTimeouts();
    };
  }, []);

  const onChange = <K extends keyof QimenFormData>(key: K, next: QimenFormData[K]) => {
    setWorkspaceState('qimen', (current) => ({
      formData: { ...current.formData, [key]: next },
      fieldErrors: { ...current.fieldErrors, [key]: undefined },
    }));
  };

  const clearSectionTimeouts = () => {
    sectionTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    sectionTimeoutsRef.current = [];
  };

  const getResultReadyPatch = (nextStatuses: Record<QimenAsyncSectionKey, QimenSectionStatus>) => {
    const allSettled = Object.values(nextStatuses).every(
      (status) => status === 'completed' || status === 'failed'
    );

    if (!allSettled) {
      return {};
    }

    return {
      blockingLoading: false,
      hasResult: true,
      step: 'result' as const,
      lastView: 'result' as const,
    };
  };

  const readErrorMessage = async (response: Response) => {
    try {
      const json = (await response.json()) as { error?: string };
      return json.error;
    } catch {
      return undefined;
    }
  };

  const scheduleSectionRetry = (
    sectionKey: QimenAsyncSectionKey,
    nextAnalysisId: string,
    runId: number
  ) => {
    const timeoutId = window.setTimeout(() => {
      void requestSection(sectionKey, nextAnalysisId, runId);
    }, 1500);

    sectionTimeoutsRef.current.push(timeoutId);
  };

  const scheduleBaseRetry = (nextAnalysisId: string, runId: number) => {
    const timeoutId = window.setTimeout(() => {
      void requestBaseResult(nextAnalysisId, runId);
    }, 1500);

    sectionTimeoutsRef.current.push(timeoutId);
  };

  const requestBaseResult = async (nextAnalysisId: string, runId: number) => {
    if (runIdRef.current !== runId) return;

    setWorkspaceState('qimen', {
      baseStatus: 'loading',
      baseError: null,
    });

    try {
      const response = await fetch(
        `/api/destiny/qimen/analyze/sections/baseResult?analysisId=${encodeURIComponent(nextAnalysisId)}`,
        {
          signal: abortRef.current?.signal,
        }
      );

      const json = (await response.json()) as QimenBaseSectionResponse;
      if (runIdRef.current !== runId) return;

      if (response.status === 202 || json.status === 'pending') {
        scheduleBaseRetry(nextAnalysisId, runId);
        return;
      }

      if (json.success && json.data) {
        setWorkspaceState('qimen', {
          baseResult: json.data,
          baseStatus: 'completed',
          sectionStatuses: {
            strategyOverview: 'loading',
            timingWindows: 'loading',
            chartSummary: 'loading',
          },
        });
        const sectionKeys: QimenAsyncSectionKey[] = [
          'strategyOverview',
          'timingWindows',
          'chartSummary',
        ];
        void Promise.all(
          sectionKeys.map((sectionKey) => requestSection(sectionKey, nextAnalysisId, runId))
        );
        return;
      }

      if (json.status === 'failed') {
        setWorkspaceState('qimen', {
          baseStatus: 'failed',
          baseError: json.error ?? '基础盘面生成失败',
          errorKind: 'timeout',
          error: json.error ?? '基础盘面生成失败',
          blockingLoading: false,
        });
        return;
      }

      setWorkspaceState('qimen', {
        baseStatus: 'failed',
        baseError: json.error ?? '基础盘面请求失败',
        errorKind: 'unknown',
        error: json.error ?? '基础盘面请求失败',
        blockingLoading: false,
      });
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') {
        return;
      }

      if (runIdRef.current !== runId) return;

      const message = nextError instanceof Error ? nextError.message : '基础盘面请求失败';
      setWorkspaceState('qimen', {
        baseStatus: 'failed',
        baseError: message,
        errorKind: 'unknown',
        error: message,
        blockingLoading: false,
      });
    }
  };

  const requestSection = async (
    sectionKey: QimenAsyncSectionKey,
    nextAnalysisId: string,
    runId: number
  ) => {
    if (runIdRef.current !== runId) return;

    setWorkspaceState('qimen', (current) => ({
      sectionStatuses:
        current.sectionStatuses[sectionKey] === 'completed'
          ? current.sectionStatuses
          : { ...current.sectionStatuses, [sectionKey]: 'loading' },
      sectionErrors: { ...current.sectionErrors, [sectionKey]: undefined },
    }));

    try {
      const response = await fetch(
        `/api/destiny/qimen/analyze/sections/${sectionKey}?analysisId=${encodeURIComponent(nextAnalysisId)}`,
        {
          signal: abortRef.current?.signal,
        }
      );

      const json = (await response.json()) as QimenSectionResponse<typeof sectionKey>;
      if (runIdRef.current !== runId) return;

      if (response.status === 202 || json.status === 'pending') {
        setWorkspaceState('qimen', (current) => ({
          sectionStatuses:
            current.sectionStatuses[sectionKey] === 'completed'
              ? current.sectionStatuses
              : { ...current.sectionStatuses, [sectionKey]: 'loading' },
        }));
        scheduleSectionRetry(sectionKey, nextAnalysisId, runId);
        return;
      }

      if (json.success && json.data) {
        setWorkspaceState('qimen', (current) => {
          const nextStatuses = { ...current.sectionStatuses, [sectionKey]: 'completed' as const };
          return {
            sections: { ...current.sections, [sectionKey]: json.data },
            sectionStatuses: nextStatuses,
            ...getResultReadyPatch(nextStatuses),
          };
        });
        return;
      }

      if (json.status === 'failed') {
        setWorkspaceState('qimen', (current) => {
          const nextStatuses = { ...current.sectionStatuses, [sectionKey]: 'failed' as const };
          return {
            sectionStatuses: nextStatuses,
            sectionErrors: { ...current.sectionErrors, [sectionKey]: json.error ?? '区块生成失败' },
            ...getResultReadyPatch(nextStatuses),
          };
        });
        return;
      }

      setWorkspaceState('qimen', (current) => {
        const nextStatuses = { ...current.sectionStatuses, [sectionKey]: 'failed' as const };
        return {
          sectionStatuses: nextStatuses,
          sectionErrors: { ...current.sectionErrors, [sectionKey]: json.error ?? '区块请求失败' },
          ...getResultReadyPatch(nextStatuses),
        };
      });
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') {
        return;
      }

      if (runIdRef.current !== runId) return;

      setWorkspaceState('qimen', (current) => {
        const nextStatuses = { ...current.sectionStatuses, [sectionKey]: 'failed' as const };
        return {
          sectionStatuses: nextStatuses,
          sectionErrors: {
            ...current.sectionErrors,
            [sectionKey]: nextError instanceof Error ? nextError.message : '区块请求失败',
          },
          ...getResultReadyPatch(nextStatuses),
        };
      });
    }
  };

  const submit = async () => {
    const errors = validateForm(formData);
    setWorkspaceState('qimen', { fieldErrors: errors });
    if (Object.keys(errors).length > 0) {
      setWorkspaceState('qimen', {
        errorKind: 'validation',
        error: '参数错误：请先完善表单信息后再开始分析',
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    clearSectionTimeouts();
    runIdRef.current += 1;
    const runId = runIdRef.current;
    historySavedRef.current = false;
    // 提前生成稳定的历史记录 ID，整个分析流程共用此 ID
    currentHistoryIdRef.current = generateUUID();
    submittedAnalysisIdRef.current = null;

    setWorkspaceState('qimen', {
      step: 'form',
      lastView: 'form',
      hasResult: false,
      blockingLoading: true,
      error: null,
      errorKind: null,
      analysisId: null,
      baseResult: null,
      baseStatus: 'loading',
      baseError: null,
      sections: {},
      sectionErrors: {},
      sectionStatuses: {
        strategyOverview: 'idle',
        timingWindows: 'idle',
        chartSummary: 'idle',
      },
    });

    let currentErrorKind: QimenErrorKind = 'unknown';

    try {
      const response = await authFetch('/api/destiny/qimen/analyze/start', {
        method: 'POST',
        body: JSON.stringify({ ...mapFormToQimenRequest(formData), provider }),
        signal: controller.signal,
      });

      if (!response.ok) {
        currentErrorKind = classifyResponseError(response.status);
        setWorkspaceState('qimen', { errorKind: currentErrorKind });
        throw new Error(toDisplayError(currentErrorKind, await readErrorMessage(response)));
      }

      const json = (await response.json()) as QimenAnalysisStartResponse;
      if (!json.success || !json.analysisId) {
        throw new Error(json.error || '分析任务创建失败，请稍后重试。');
      }

      setWorkspaceState('qimen', { analysisId: json.analysisId });
      submittedAnalysisIdRef.current = json.analysisId;
      void requestBaseResult(json.analysisId, runId);
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') {
        return;
      }

      const rawMessage = nextError instanceof Error ? nextError.message : undefined;
      setWorkspaceState('qimen', {
        errorKind: currentErrorKind,
        error: toDisplayError(currentErrorKind, rawMessage),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    clearSectionTimeouts();
    runIdRef.current += 1;
    historySavedRef.current = false;
    currentHistoryIdRef.current = null;
    submittedAnalysisIdRef.current = null;
    resetWorkspace('qimen');
  };

  const stepTransitionClass =
    'transition-all duration-300 motion-reduce:transition-opacity motion-reduce:duration-150';
  const stepTransitionStyle = {
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  } as const;

  return (
    <DestinyPageScaffold withNavOffset tone="indigo">
      <div className="relative h-full min-h-0 w-full overflow-hidden">
        <div className="relative flex h-full min-h-0 flex-col p-4 sm:p-6">
          {step === 'form' && (
            <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                    奇门遁甲演化
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
                    信息输入
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  填写起局时空与问题描述，系统基于时家奇门进行演化分析
                </p>
              </div>
            </header>
          )}

          <div className="relative mt-4 min-h-0 flex-1 sm:mt-6">
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
              <QimenInputForm
                value={formData}
                submitting={blockingLoading}
                error={error}
                fieldErrors={fieldErrors}
                onChange={onChange}
                onSubmit={() => {
                  void submit();
                }}
                onReset={reset}
              />
            </div>

            <div
              className={cn(
                'absolute inset-0 min-h-0 overflow-y-auto pr-1 custom-scrollbar',
                stepTransitionClass,
                step === 'result'
                  ? 'pointer-events-auto z-10 opacity-100 translate-y-0'
                  : 'pointer-events-none z-0 opacity-0 translate-y-2 motion-reduce:translate-y-0'
              )}
              style={stepTransitionStyle}
              aria-hidden={step !== 'result'}
            >
              <QimenAnalysisResult
                analysisId={analysisId}
                baseResult={baseResult}
                baseStatus={baseStatus}
                baseError={baseError}
                sections={sections}
                sectionStatuses={sectionStatuses}
                sectionErrors={sectionErrors}
                error={error}
                onBackToForm={() =>
                  setWorkspaceState('qimen', {
                    step: 'form',
                    lastView: 'form',
                  })
                }
                onRetry={() => {
                  void submit();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </DestinyPageScaffold>
  );
}
