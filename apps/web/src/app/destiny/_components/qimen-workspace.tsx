'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { QimenInputForm } from './qimen-input-form';
import { QimenAnalysisResult } from './qimen-analysis-result';
import { createDefaultQimenFormData, mapFormToQimenRequest } from './qimen-mappers';
import type {
  QimenAnalyzeResult,
  QimenFormData,
  QimenLockedSections,
  QimenSectionKey,
  QimenStreamEvent,
  QimenStreamStatus,
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
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<QimenErrorKind | null>(null);
  const [resultData, setResultData] = useState<QimenAnalyzeResult | null>(null);
  const [lockedSections, setLockedSections] = useState<QimenLockedSections>({});
  const [streamStatus, setStreamStatus] = useState<QimenStreamStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    };
  }, []);

  const onChange = <K extends keyof QimenFormData>(key: K, next: QimenFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: next }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const mergeLockedSectionsIntoResult = (
    result: QimenAnalyzeResult,
    sections: QimenLockedSections
  ): QimenAnalyzeResult => ({
    ...result,
    overallAssessment: sections.overallAssessment ?? result.overallAssessment,
    riskAlerts: sections.riskAlerts ?? result.riskAlerts,
    actionSuggestions: sections.actionSuggestions ?? result.actionSuggestions,
    timingWindows: sections.timingWindows ?? result.timingWindows,
    chartSummary: sections.chartSummary ?? result.chartSummary,
  });

  const setLockedSection = (
    target: QimenLockedSections,
    sectionKey: QimenSectionKey,
    payload: QimenLockedSections[QimenSectionKey]
  ) => {
    (
      target as Record<QimenSectionKey, QimenLockedSections[QimenSectionKey]>
    )[sectionKey] = payload;
  };

  const parseStreamBlock = (
    block: string,
    onEvent: (event: QimenStreamEvent) => void
  ) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n')
      .trim();

    if (!data) return;
    onEvent(JSON.parse(data) as QimenStreamEvent);
  };

  const consumeQimenStream = async (
    response: Response,
    onEvent: (event: QimenStreamEvent) => void
  ) => {
    if (!response.body) {
      throw new Error('响应体为空');
    }

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

        if (block) {
          parseStreamBlock(block, onEvent);
        }

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
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorKind('validation');
      setError('参数错误：请先完善表单信息后再开始分析');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBlockingLoading(true);
    setStreaming(true);
    setError(null);
    setErrorKind(null);
    setStep('result');
    setResultData(null);
    setLockedSections({});
    setStreamStatus('queued');

    let currentErrorKind: QimenErrorKind = 'unknown';

    try {
      const response = await fetch('/api/destiny/qimen/analyze', {
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

      const receivedSections: QimenLockedSections = {};
      let sawComplete = false;

      await consumeQimenStream(response, (event) => {
        if (event.type === 'status') {
          setStreamStatus(event.status);
          return;
        }

        if (event.type === 'section-final') {
          if (receivedSections[event.sectionKey]) return;

          setLockedSection(receivedSections, event.sectionKey, event.payload);
          setLockedSections((prev) =>
            prev[event.sectionKey] ? prev : { ...prev, [event.sectionKey]: event.payload }
          );
          setBlockingLoading(false);
          return;
        }

        if (event.type === 'complete') {
          sawComplete = true;
          setResultData(mergeLockedSectionsIntoResult(event.result, receivedSections));
          setLockedSections((prev) => ({ ...receivedSections, ...prev }));
          setBlockingLoading(false);
          setStreaming(false);
          setStreamStatus(null);
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

      setErrorKind(currentErrorKind);
      const rawMessage = nextError instanceof Error ? nextError.message : undefined;
      setError(toDisplayError(currentErrorKind, rawMessage));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setBlockingLoading(false);
      setStreaming(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setFormData(createDefaultQimenFormData());
    setFieldErrors({});
    setError(null);
    setErrorKind(null);
    setResultData(null);
    setLockedSections({});
    setStreamStatus(null);
    setBlockingLoading(false);
    setStreaming(false);
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
                disabled={blockingLoading || streaming}
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
                submitting={blockingLoading || streaming}
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
                result={resultData}
                sections={lockedSections}
                loading={false}
                streaming={streaming}
                streamStatus={streamStatus}
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
