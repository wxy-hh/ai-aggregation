'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { QimenInputForm } from './qimen-input-form';
import { QimenAnalysisResult } from './qimen-analysis-result';
import { createDefaultQimenFormData, mapFormToQimenRequest } from './qimen-mappers';
import type {
  QimenAnalysisBaseResult,
  QimenBaseSectionResponse,
  QimenBaseStatus,
  QimenAnalysisStartResponse,
  QimenAsyncSectionKey,
  QimenAsyncSections,
  QimenFormData,
  QimenSectionResponse,
  QimenSectionResponseMap,
  QimenSectionStatus,
} from './qimen-types';

type Step = 'form' | 'result';
type QimenErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';

type QimenWorkspaceProps = {
  onRecalculate: () => void;
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

export function QimenWorkspace({ onRecalculate, onLoadingChange }: QimenWorkspaceProps) {
  const [step, setStep] = useState<Step>('form');
  const [formData, setFormData] = useState<QimenFormData>(() => createDefaultQimenFormData());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof QimenFormData, string>>>({});
  const [blockingLoading, setBlockingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<QimenErrorKind | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [baseResult, setBaseResult] = useState<QimenAnalysisBaseResult | null>(null);
  const [baseStatus, setBaseStatus] = useState<QimenBaseStatus>('idle');
  const [baseError, setBaseError] = useState<string | null>(null);
  const [sections, setSections] = useState<QimenAsyncSections>({});
  const [sectionStatuses, setSectionStatuses] = useState<
    Record<QimenAsyncSectionKey, QimenSectionStatus>
  >({
    strategyOverview: 'idle',
    timingWindows: 'idle',
    chartSummary: 'idle',
  });
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<QimenAsyncSectionKey, string>>>(
    {}
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
    return () => {
      abortRef.current?.abort();
      clearSectionTimeouts();
    };
  }, []);

  const onChange = <K extends keyof QimenFormData>(key: K, next: QimenFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: next }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const clearSectionTimeouts = () => {
    sectionTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    sectionTimeoutsRef.current = [];
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

    setBaseStatus('loading');
    setBaseError(null);

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
        setBaseResult(json.data);
        setBaseStatus('completed');
        setSectionStatuses({
          strategyOverview: 'loading',
          timingWindows: 'loading',
          chartSummary: 'loading',
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
        setBaseStatus('failed');
        setBaseError(json.error ?? '基础盘面生成失败');
        setErrorKind('timeout');
        setError(json.error ?? '基础盘面生成失败');
        return;
      }

      setBaseStatus('failed');
      setBaseError(json.error ?? '基础盘面请求失败');
      setErrorKind('unknown');
      setError(json.error ?? '基础盘面请求失败');
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') {
        return;
      }

      if (runIdRef.current !== runId) return;

      const message = nextError instanceof Error ? nextError.message : '基础盘面请求失败';
      setBaseStatus('failed');
      setBaseError(message);
      setErrorKind('unknown');
      setError(message);
    }
  };

  const requestSection = async (
    sectionKey: QimenAsyncSectionKey,
    nextAnalysisId: string,
    runId: number
  ) => {
    if (runIdRef.current !== runId) return;

    setSectionStatuses((prev) =>
      prev[sectionKey] === 'completed' ? prev : { ...prev, [sectionKey]: 'loading' }
    );
    setSectionErrors((prev) => ({ ...prev, [sectionKey]: undefined }));

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
        setSectionStatuses((prev) =>
          prev[sectionKey] === 'completed' ? prev : { ...prev, [sectionKey]: 'loading' }
        );
        scheduleSectionRetry(sectionKey, nextAnalysisId, runId);
        return;
      }

      if (json.success && json.data) {
        setSections((prev) => (sectionKey in prev ? prev : { ...prev, [sectionKey]: json.data }));
        setSectionStatuses((prev) => ({ ...prev, [sectionKey]: 'completed' }));
        return;
      }

      if (json.status === 'failed') {
        setSectionStatuses((prev) => ({ ...prev, [sectionKey]: 'failed' }));
        setSectionErrors((prev) => ({ ...prev, [sectionKey]: json.error ?? '区块生成失败' }));
        return;
      }

      setSectionStatuses((prev) => ({ ...prev, [sectionKey]: 'failed' }));
      setSectionErrors((prev) => ({ ...prev, [sectionKey]: json.error ?? '区块请求失败' }));
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') {
        return;
      }

      if (runIdRef.current !== runId) return;

      setSectionStatuses((prev) => ({ ...prev, [sectionKey]: 'failed' }));
      setSectionErrors((prev) => ({
        ...prev,
        [sectionKey]: nextError instanceof Error ? nextError.message : '区块请求失败',
      }));
    }
  };

  const submit = async () => {
    const errors = validateForm(formData);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorKind('validation');
      setError('参数错误：请先完善表单信息后再开始分析');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    clearSectionTimeouts();
    runIdRef.current += 1;
    const runId = runIdRef.current;

    setBlockingLoading(true);
    setError(null);
    setErrorKind(null);
    setStep('result');
    setAnalysisId(null);
    setBaseResult(null);
    setBaseStatus('loading');
    setBaseError(null);
    setSections({});
    setSectionErrors({});
    setSectionStatuses({
      strategyOverview: 'idle',
      timingWindows: 'idle',
      chartSummary: 'idle',
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
        setErrorKind(currentErrorKind);
        throw new Error(toDisplayError(currentErrorKind, await readErrorMessage(response)));
      }

      const json = (await response.json()) as QimenAnalysisStartResponse;
      if (!json.success || !json.analysisId) {
        throw new Error(json.error || '分析任务创建失败，请稍后重试。');
      }

      setAnalysisId(json.analysisId);
      void requestBaseResult(json.analysisId, runId);
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') {
        return;
      }

      setErrorKind(currentErrorKind);
      const rawMessage = nextError instanceof Error ? nextError.message : undefined;
      setError(toDisplayError(currentErrorKind, rawMessage));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setBlockingLoading(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    clearSectionTimeouts();
    runIdRef.current += 1;
    setFormData(createDefaultQimenFormData());
    setFieldErrors({});
    setError(null);
    setErrorKind(null);
    setAnalysisId(null);
    setBaseResult(null);
    setBaseStatus('idle');
    setBaseError(null);
    setSections({});
    setSectionErrors({});
    setSectionStatuses({
      strategyOverview: 'idle',
      timingWindows: 'idle',
      chartSummary: 'idle',
    });
    setBlockingLoading(false);
    setStep('form');
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100 via-white to-blue-50 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950">
      <div className="h-full w-full xl:pl-[304px]">
        <div className="flex h-full flex-col p-6">
          <header className="shrink-0 flex justify-between items-center gap-4">
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

          <div className="mt-6 min-h-0 flex-1 overflow-y-auto rounded-[30px]">
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
                onBackToForm={() => setStep('form')}
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
