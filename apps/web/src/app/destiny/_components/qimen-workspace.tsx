'use client';

import { useEffect, useMemo, useState } from 'react';
import { QimenInputForm } from './qimen-input-form';
import { QimenAnalysisResult } from './qimen-analysis-result';
import { QimenLoadingAnimation } from './qimen-loading-animation';
import { createDefaultQimenFormData, mapFormToQimenRequest } from './qimen-mappers';
import type { QimenAnalyzeResponse, QimenAnalyzeResult, QimenFormData } from './qimen-types';

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<QimenErrorKind | null>(null);
  const [resultData, setResultData] = useState<QimenAnalyzeResult | null>(null);

  const pageTitle = useMemo(
    () => (step === 'form' ? '奇门遁甲演化 · 信息输入' : '奇门遁甲演化 · AI 分析结果'),
    [step]
  );

  useEffect(() => {
    onLoadingChange?.(submitting);
  }, [onLoadingChange, submitting]);

  const onChange = <K extends keyof QimenFormData>(key: K, next: QimenFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: next }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async () => {
    const errors = validateForm(formData);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorKind('validation');
      setError('参数错误：请先完善表单信息后再开始分析');
      return;
    }

    setSubmitting(true);
    setError(null);
    setErrorKind(null);
    setStep('result');

    let currentErrorKind: QimenErrorKind = 'unknown';

    try {
      const response = await fetch('/api/destiny/qimen/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapFormToQimenRequest(formData)),
      });

      const json = (await response.json()) as QimenAnalyzeResponse;
      if (!response.ok || !json.success || !json.data) {
        currentErrorKind = classifyResponseError(response.status);
        setErrorKind(currentErrorKind);
        throw new Error(toDisplayError(currentErrorKind, json.error));
      }

      setResultData(json.data);
      setStep('result');
    } catch (nextError) {
      setErrorKind(currentErrorKind);
      const rawMessage = nextError instanceof Error ? nextError.message : undefined;
      setError(toDisplayError(currentErrorKind, rawMessage));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFormData(createDefaultQimenFormData());
    setFieldErrors({});
    setError(null);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        aria-hidden
        style={{
          backgroundColor: '#F8F8FC',
          backgroundImage:
            'radial-gradient(at 0% 0%, #f8f8fc 0%, transparent 50%), radial-gradient(at 100% 0%, #8cb1f1 0%, transparent 50%), radial-gradient(at 100% 100%, #c4bfea 0%, transparent 50%), radial-gradient(at 0% 100%, #ffffff 0%, transparent 50%)',
        }}
      />

      <div className="h-full w-full xl:pl-[320px]">
        <div className="flex h-full flex-col p-6">
          <header className="shrink-0 flex justify-between items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#08134D]">{pageTitle}</h1>
              <p className="text-sm text-slate-500 mt-1">
                同页分步流程：先录入问题，再查看 AI 推演结果
              </p>
            </div>
          </header>

          <div
            className={
              submitting
                ? 'mt-6 min-h-0 flex-1'
                : 'mt-6 min-h-0 flex-1 overflow-y-auto rounded-[30px]'
            }
          >
            {submitting ? (
              <div className="h-full w-full">
                <QimenLoadingAnimation />
              </div>
            ) : step === 'form' ? (
              <QimenInputForm
                value={formData}
                submitting={submitting}
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
                loading={false}
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
