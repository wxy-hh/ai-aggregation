'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BaziInputForm } from './bazi-input-form';
import { DestinyShell } from './layout/destiny-shell';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { createDefaultBaziFormData, mapFormToBaziRequest } from './bazi-mappers';
import type { BaziFormData } from './bazi-types';
import type {
  BaziLockedSections,
  BaziSectionKey,
  BaziStreamEvent,
  DestinyReport,
  DestinyStreamStatus,
  PartialDestinyReport,
} from './types';
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
  const [blockingLoading, setBlockingLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<BaziErrorKind | null>(null);
  const [report, setReport] = useState<DestinyReport | null>(null);
  const [lockedSections, setLockedSections] = useState<BaziLockedSections>({});
  const [streamStatus, setStreamStatus] = useState<DestinyStreamStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pageTitle = useMemo(
    () => (step === 'form' ? '八字格局精批 · 信息输入' : '八字格局精批 · AI 分析结果'),
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

  const onChange = <K extends keyof BaziFormData>(key: K, next: BaziFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: next }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
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
    if (sections.profileOverview) partial.profile = sections.profileOverview;
    if (sections.pillars) partial.pillars = sections.pillars;
    if (sections.elementsAndTenGods) {
      partial.elements = sections.elementsAndTenGods.elements;
      partial.tenGods = sections.elementsAndTenGods.tenGods;
    }
    if (sections.modulesOverview) partial.modules = sections.modulesOverview;
    if (sections.timeline) partial.timeline = sections.timeline;
    return partial;
  };

  const mergeLockedSectionsIntoReport = (
    nextReport: DestinyReport,
    sections: BaziLockedSections
  ): DestinyReport => ({
    ...nextReport,
    profile: sections.profileOverview ?? nextReport.profile,
    pillars: sections.pillars ?? nextReport.pillars,
    elements: sections.elementsAndTenGods?.elements ?? nextReport.elements,
    tenGods: sections.elementsAndTenGods?.tenGods ?? nextReport.tenGods,
    modules: sections.modulesOverview ?? nextReport.modules,
    timeline: sections.timeline ?? nextReport.timeline,
  });

  const parseStreamBlock = (
    block: string,
    onEvent: (event: BaziStreamEvent) => void
  ) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n')
      .trim();

    if (!data) return;
    onEvent(JSON.parse(data) as BaziStreamEvent);
  };

  const consumeStream = async (
    response: Response,
    onEvent: (event: BaziStreamEvent) => void
  ) => {
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
    setLockedSections({});
    setReport(null);
    setStreamStatus('queued');

    let currentErrorKind: BaziErrorKind = 'unknown';

    try {
      const response = await fetch('/api/destiny/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapFormToBaziRequest(formData)),
        signal: controller.signal,
      });

      if (!response.ok) {
        currentErrorKind = classifyResponseError(response.status);
        setErrorKind(currentErrorKind);
        throw new Error(toDisplayError(currentErrorKind, await readErrorMessage(response)));
      }

      const receivedSections: BaziLockedSections = {};
      let sawComplete = false;

      await consumeStream(response, (event) => {
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
          setStep('result');
          setBlockingLoading(false);
          return;
        }

        if (event.type === 'complete') {
          sawComplete = true;
          setReport(mergeLockedSectionsIntoReport(event.report, receivedSections));
          setLockedSections((prev) => ({ ...receivedSections, ...prev }));
          setStep('result');
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
    setFormData(createDefaultBaziFormData());
    setFieldErrors({});
    setError(null);
    setErrorKind(null);
    setReport(null);
    setLockedSections({});
    setBlockingLoading(false);
    setStreaming(false);
    setStreamStatus(null);
    setStep('form');
  };

  const handleRecalculate = () => {
    setStep('form');
    setReport(null);
    setError(null);
    setLockedSections({});
    onRecalculate();
  };

  const partialReport = useMemo(() => buildPartialReport(lockedSections), [lockedSections]);

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
          <DestinyShell
            report={report}
            partialReport={partialReport}
            streaming={streaming}
            streamStatus={streamStatus}
            lockedSections={lockedSections}
            activeModule={activeModule}
            title="AI 命理大师"
            subtitleTag="八字格局精批"
            onModuleChange={onModuleChange}
            onRecalculate={handleRecalculate}
          />
        )}
      </div>

      {/* Loading 动画 */}
      <StarDecodeOverlay open={blockingLoading} />
    </div>
  );
}
