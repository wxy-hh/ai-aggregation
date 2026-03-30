'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OnboardingModal, type OnboardingInput } from './onboarding/onboarding-modal';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { DestinyShell } from './layout/destiny-shell';
import type { DestinyReport, DestinyReportResponse } from './types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Stage = 'onboarding' | 'decoding' | 'report' | 'error';
type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export function DestinyPageClient() {
  const [stage, setStage] = useState<Stage>('onboarding');
  const [input, setInput] = useState<OnboardingInput | null>(null);
  const [report, setReport] = useState<DestinyReport | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const runAnalysis = useCallback(async (nextInput: OnboardingInput) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setInput(nextInput);
    setAnalysisStatus('loading');
    setAnalysisError(null);
    setStage('decoding');

    try {
      const response = await fetch('/api/destiny/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextInput),
      });
      const json = (await response.json()) as DestinyReportResponse | { error?: string };

      if (!response.ok || !('report' in json)) {
        throw new Error(('error' in json && json.error) || '测算失败，请稍后重试');
      }

      if (requestId !== requestIdRef.current) return;
      setReport(json.report);
      setAnalysisStatus('success');
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setAnalysisStatus('error');
      setAnalysisError(error instanceof Error ? error.message : '测算失败，请稍后重试');
    }
  }, []);

  useEffect(() => {
    if (stage !== 'decoding') return;
    if (analysisStatus === 'success') {
      setStage('report');
      return;
    }
    if (analysisStatus === 'error') {
      setStage('error');
    }
  }, [analysisStatus, stage]);

  return (
    <div className="relative flex-1 h-full overflow-hidden">
      <DestinyShell
        report={report}
        onRecalculate={() => {
          setStage('onboarding');
        }}
      />

      <OnboardingModal
        open={stage === 'onboarding'}
        defaultValue={input ?? undefined}
        canCancel={Boolean(report)}
        onCancelAction={() => {
          setStage('report');
        }}
        onStartAction={(next) => {
          void runAnalysis(next);
        }}
      />

      <StarDecodeOverlay open={stage === 'decoding'} />

      {stage === 'error' && (
        <div
          className={cn(
            'absolute inset-0 z-40 flex items-center justify-center',
            'bg-slate-900/15 backdrop-blur-[2px]'
          )}
        >
          <div className="rounded-3xl border border-white/70 bg-white/90 p-8 shadow-xl w-[min(560px,92vw)]">
            <div className="text-xl font-black text-slate-900">测算失败</div>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              {analysisError ?? '模型调用失败，请检查网络或稍后重试。'}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button
                type="button"
                className="rounded-full bg-[#2F6BFF] text-white hover:brightness-110"
                onClick={() => {
                  if (!input) {
                    setStage('onboarding');
                    return;
                  }
                  void runAnalysis(input);
                }}
              >
                重试测算
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setStage('onboarding')}
              >
                修改信息
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
