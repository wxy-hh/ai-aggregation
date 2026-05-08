'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import {
  useDestinyWorkspaceStore,
  type QimenErrorKind,
} from '@/stores/destiny-workspace-store';
import { QimenInputForm } from './qimen-input-form';
import { QimenAnalysisResult } from './qimen-analysis-result';
import { mapFormToQimenRequest } from './qimen-mappers';
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
  if (!formData.location.trim()) {
    errors.location = '请填写地点';
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
    markResultReady,
  } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      ...state.qimen,
      setWorkspaceState: state.setWorkspaceState,
      resetWorkspace: state.resetWorkspace,
      restoreWorkspace: state.restoreWorkspace,
      markResultReady: state.markResultReady,
    }))
  );
  const abortRef = useRef<AbortController | null>(null);
  const sectionTimeoutsRef = useRef<number[]>([]);
  const runIdRef = useRef(0);

  const pageTitle = useMemo(
    () => (step === 'form' ? '奇门遁甲演化 · 信息输入' : '奇门遁甲演化 · AI 分析结果'),
    [step]
  );

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  useEffect(() => {
    if (isActive) {
      restoreWorkspace('qimen');
    }
  }, [isActive, restoreWorkspace]);

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

  const revealResultIfReady = (nextStatuses: Record<QimenAsyncSectionKey, QimenSectionStatus>) => {
    const allSettled = Object.values(nextStatuses).every(
      (status) => status === 'completed' || status === 'failed'
    );

    if (!allSettled) return;

    setWorkspaceState('qimen', {
      blockingLoading: false,
    });
    markResultReady('qimen');
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
        setWorkspaceState('qimen', (current) => ({
          sections: sectionKey in current.sections ? current.sections : { ...current.sections, [sectionKey]: json.data },
        }));
        setWorkspaceState('qimen', (current) => {
          const nextStatuses = { ...current.sectionStatuses, [sectionKey]: 'completed' as const };
          revealResultIfReady(nextStatuses);
          return { sectionStatuses: nextStatuses };
        });
        return;
      }

      if (json.status === 'failed') {
        setWorkspaceState('qimen', (current) => {
          const nextStatuses = { ...current.sectionStatuses, [sectionKey]: 'failed' as const };
          revealResultIfReady(nextStatuses);
          return { sectionStatuses: nextStatuses };
        });
        setWorkspaceState('qimen', (current) => ({
          sectionErrors: { ...current.sectionErrors, [sectionKey]: json.error ?? '区块生成失败' },
        }));
        return;
      }

      setWorkspaceState('qimen', (current) => {
        const nextStatuses = { ...current.sectionStatuses, [sectionKey]: 'failed' as const };
        revealResultIfReady(nextStatuses);
        return { sectionStatuses: nextStatuses };
      });
      setWorkspaceState('qimen', (current) => ({
        sectionErrors: { ...current.sectionErrors, [sectionKey]: json.error ?? '区块请求失败' },
      }));
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') {
        return;
      }

      if (runIdRef.current !== runId) return;

      setWorkspaceState('qimen', (current) => {
        const nextStatuses = { ...current.sectionStatuses, [sectionKey]: 'failed' as const };
        revealResultIfReady(nextStatuses);
        return { sectionStatuses: nextStatuses };
      });
      setWorkspaceState('qimen', (current) => ({
        sectionErrors: {
          ...current.sectionErrors,
          [sectionKey]: nextError instanceof Error ? nextError.message : '区块请求失败',
        },
      }));
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
      const response = await fetch('/api/destiny/qimen/analyze/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapFormToQimenRequest(formData)),
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
    resetWorkspace('qimen');
  };

  return (
    <div className="relative h-auto min-h-full w-full overflow-x-hidden overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100 via-white to-blue-50 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 lg:h-full lg:overflow-hidden">
      <div className="h-full w-full xl:pl-[304px]">
        <div className="flex h-full flex-col p-6">
          <header className="hidden md:flex shrink-0 justify-between items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                {pageTitle}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                同页分步流程：先录入问题，再查看 AI 推演结果
              </p>
            </div>

            {step === 'result' && (
              <Button
                type="button"
                className="rounded-full bg-[#2F6BFF] text-white hover:brightness-110"
                disabled={blockingLoading}
                onClick={() => {
                  void submit();
                }}
              >
                重新排盘
              </Button>
            )}
          </header>

          <div className="mt-0 md:mt-6 min-h-0 flex-1 overflow-y-auto rounded-[30px]">
            {step === 'form' ? (
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
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
