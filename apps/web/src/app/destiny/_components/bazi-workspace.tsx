'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BaziInputForm } from './bazi-input-form';
import { DestinyShell } from './layout/destiny-shell';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { createDefaultBaziFormData, mapFormToBaziRequest } from './bazi-mappers';
import type { BaziFormData } from './bazi-types';
import type { DestinyReport, DestinyReportResponse } from './types';
import type { DestinyModuleKey } from './layout/left-nav';

type Step = 'form' | 'result';
type BaziErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';

type BaziWorkspaceProps = {
  activeModule: DestinyModuleKey;
  onModuleChange?: (key: DestinyModuleKey) => void;
  onRecalculate: () => void;
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
  activeModule,
  onModuleChange,
  onRecalculate,
  onLoadingChange,
}: BaziWorkspaceProps) {
  const [step, setStep] = useState<Step>('form');
  const [formData, setFormData] = useState<BaziFormData>(() => createDefaultBaziFormData());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof BaziFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<BaziErrorKind | null>(null);
  const [report, setReport] = useState<DestinyReport | null>(null);

  const pageTitle = useMemo(
    () => (step === 'form' ? '八字格局精批 · 信息输入' : '八字格局精批 · AI 分析结果'),
    [step]
  );

  useEffect(() => {
    onLoadingChange?.(submitting);
  }, [onLoadingChange, submitting]);

  const onChange = <K extends keyof BaziFormData>(key: K, next: BaziFormData[K]) => {
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

    let currentErrorKind: BaziErrorKind = 'unknown';

    try {
      const response = await fetch('/api/destiny/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapFormToBaziRequest(formData)),
      });

      const json = (await response.json()) as DestinyReportResponse | { error?: string };

      if (!response.ok || !('report' in json)) {
        currentErrorKind = classifyResponseError(response.status);
        setErrorKind(currentErrorKind);
        throw new Error(toDisplayError(currentErrorKind, 'error' in json ? json.error : undefined));
      }

      setReport(json.report);
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
    setFormData(createDefaultBaziFormData());
    setFieldErrors({});
    setError(null);
  };

  const handleRecalculate = () => {
    setStep('form');
    setReport(null);
    setError(null);
    onRecalculate();
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100 via-white to-blue-50 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950">
      <div className="h-full w-full xl:pl-[304px]">
        {step === 'form' ? (
          <div className="flex h-full flex-col p-6">
            <header className="shrink-0 flex justify-between items-center gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {pageTitle}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  同页分步流程：先录入生辰信息，再查看 AI 推演结果
                </p>
              </div>
            </header>

            <div className="mt-6 min-h-0 flex-1 overflow-y-auto rounded-[30px]">
              <BaziInputForm
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
            </div>
          </div>
        ) : (
          <DestinyShell
            report={report}
            activeModule={activeModule}
            title="AI 命理大师"
            subtitleTag="八字格局精批"
            onModuleChange={onModuleChange}
            onRecalculate={handleRecalculate}
          />
        )}
      </div>

      {/* Loading 动画 */}
      <StarDecodeOverlay open={submitting} />
    </div>
  );
}
