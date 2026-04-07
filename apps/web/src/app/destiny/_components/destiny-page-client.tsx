'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OnboardingModal, type OnboardingInput } from './onboarding/onboarding-modal';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { DestinyShell } from './layout/destiny-shell';
import type { DestinyReport, DestinyReportResponse } from './types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ZiweiWorkspace } from './ziwei-workspace';
import { LeftNav, type DestinyModuleKey } from './layout/left-nav';

type Stage = 'onboarding' | 'decoding' | 'report' | 'error';
type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

function ComingSoonWorkspace({
  title,
  subtitle,
  activeModule,
  onModuleChange,
}: {
  title: string;
  subtitle: string;
  activeModule: DestinyModuleKey;
  onModuleChange: (key: DestinyModuleKey) => void;
}) {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-6 top-6 bottom-6 hidden xl:flex w-[280px] z-20">
        <div className="h-full w-full rounded-3xl border border-white/70 bg-white/55 backdrop-blur-xl p-4 shadow-sm">
          <LeftNav activeModule={activeModule} onModuleChange={onModuleChange} />
        </div>
      </div>

      <div className="h-full w-full overflow-y-auto p-6 xl:pl-[320px]">
        <div className="rounded-3xl border border-white/70 bg-white/70 backdrop-blur-xl p-10">
          <div className="text-2xl font-bold text-slate-900">{title}</div>
          <p className="mt-3 text-sm text-slate-600">{subtitle}</p>
          <p className="mt-6 text-xs text-slate-500">该模块正在打磨中，当前可完整体验「八字格局精批」与「紫微斗数排盘」。</p>
        </div>
      </div>
    </div>
  );
}

export function DestinyPageClient() {
  const [activeModule, setActiveModule] = useState<DestinyModuleKey>('ziwei');
  const isZiweiModule = activeModule === 'ziwei';
  const [stage, setStage] = useState<Stage>('onboarding');
  const [input, setInput] = useState<OnboardingInput | null>(null);
  const [report, setReport] = useState<DestinyReport | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [ziweiReport, setZiweiReport] = useState<DestinyReport | null>(null);
  const [ziweiStatus, setZiweiStatus] = useState<AnalysisStatus>('idle');
  const [ziweiError, setZiweiError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const ziweiRequestIdRef = useRef(0);
  const scrollByModuleRef = useRef<Partial<Record<DestinyModuleKey, number>>>({});
  const lastActiveModuleRef = useRef<DestinyModuleKey>(activeModule);

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

  const runZiweiAnalysis = useCallback(async (nextInput: OnboardingInput) => {
    const requestId = ziweiRequestIdRef.current + 1;
    ziweiRequestIdRef.current = requestId;
    setInput(nextInput);
    setZiweiStatus('loading');
    setZiweiError(null);
    setStage('decoding');

    try {
      const response = await fetch('/api/destiny/ziwei-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextInput),
      });
      const json = (await response.json()) as DestinyReportResponse | { error?: string };

      if (!response.ok || !('report' in json)) {
        throw new Error(('error' in json && json.error) || '紫微斗数测算失败，请稍后重试');
      }

      if (requestId !== ziweiRequestIdRef.current) return;
      setZiweiReport(json.report);
      setZiweiStatus('success');
    } catch (error) {
      if (requestId !== ziweiRequestIdRef.current) return;
      setZiweiStatus('error');
      setZiweiError(error instanceof Error ? error.message : '紫微斗数测算失败，请稍后重试');
    }
  }, []);

  useEffect(() => {
    if (stage !== 'decoding') return;

    if (activeModule === 'ziwei') {
      if (ziweiStatus === 'success') {
        setStage('report');
        return;
      }
      if (ziweiStatus === 'error') {
        setStage('error');
      }
      return;
    }

    if (analysisStatus === 'success') {
      setStage('report');
      return;
    }
    if (analysisStatus === 'error') {
      setStage('error');
    }
  }, [activeModule, analysisStatus, stage, ziweiStatus]);

  useEffect(() => {
    if (!isZiweiModule) return;
    if (!input) return;
    if (ziweiStatus === 'loading' || ziweiStatus === 'success') return;
    void runZiweiAnalysis(input);
  }, [input, isZiweiModule, runZiweiAnalysis, ziweiStatus]);

  useEffect(() => {
    if (isZiweiModule) {
      setAnalysisError(null);
      return;
    }
    setZiweiError(null);
  }, [isZiweiModule]);

  useEffect(() => {
    if (activeModule !== 'bazi') return;

    if (!input) {
      setStage('onboarding');
      return;
    }

    if (analysisStatus === 'loading') return;

    if (analysisStatus === 'success' && report) {
      setStage('report');
      return;
    }

    void runAnalysis(input);
  }, [activeModule, analysisStatus, input, report, runAnalysis]);

  useEffect(() => {
    const onScroll = () => {
      scrollByModuleRef.current[activeModule] = window.scrollY;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeModule]);

  useEffect(() => {
    const prev = lastActiveModuleRef.current;
    if (prev === activeModule) return;

    scrollByModuleRef.current[prev] = window.scrollY;

    const nextY = scrollByModuleRef.current[activeModule] ?? 0;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: nextY, behavior: 'auto' });
    });

    lastActiveModuleRef.current = activeModule;
  }, [activeModule]);

  return (
    <div className="relative flex-1 h-full overflow-hidden">
      <div
        className={cn(
          'absolute inset-0 transition-all duration-[120ms] ease-out will-change-transform will-change-opacity',
          activeModule === 'bazi'
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        )}
      >
        <DestinyShell
          report={report}
          activeModule={activeModule}
          title="AI 命理大师"
          subtitleTag="专业分析视图"
          onModuleChange={setActiveModule}
          onRecalculate={() => {
            setStage('onboarding');
          }}
        />
      </div>

      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-[120ms]',
          activeModule === 'ziwei'
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        )}
      >
        <div className="relative h-full w-full">
          <div className="absolute left-6 top-6 bottom-6 hidden xl:flex w-[280px] z-20">
            <div className="h-full w-full rounded-3xl border border-white/70 bg-white/55 backdrop-blur-xl p-4 shadow-sm">
              <LeftNav activeModule={activeModule} onModuleChange={setActiveModule} />
            </div>
          </div>

          <div className="h-full w-full">
            <ZiweiWorkspace
              report={ziweiReport}
              loading={ziweiStatus === 'loading'}
              error={ziweiError}
              onRecalculate={() => setStage('onboarding')}
              onRetry={() => {
                if (!input) {
                  setStage('onboarding');
                  return;
                }
                void runZiweiAnalysis(input);
              }}
            />
          </div>
        </div>
      </div>

      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-[120ms]',
          activeModule === 'qimen'
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        )}
      >
        <ComingSoonWorkspace
          title="奇门遁甲演化"
          subtitle="正在建设奇门九宫推演与时空策略分析视图，后续将支持局势推演、行动窗口与风险规避建议。"
          activeModule={activeModule}
          onModuleChange={setActiveModule}
        />
      </div>

      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-[120ms]',
          activeModule === 'flower'
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        )}
      >
        <ComingSoonWorkspace
          title="桃花易数预测"
          subtitle="正在建设梅花易数快速起卦与关系走势预测模块，后续将支持事件驱动推断与多情境建议。"
          activeModule={activeModule}
          onModuleChange={setActiveModule}
        />
      </div>

      <OnboardingModal
        open={stage === 'onboarding'}
        defaultValue={input ?? undefined}
        canCancel={Boolean(isZiweiModule ? ziweiReport : report)}
        onCancelAction={() => {
          const hasAnyReport = Boolean(isZiweiModule ? ziweiReport : report);
          if (!hasAnyReport) {
            return;
          }
          setStage('report');
        }}
        onStartAction={(next) => {
          if (activeModule === 'ziwei') {
            void runZiweiAnalysis(next);
            return;
          }
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
            <div className="text-xl font-black text-slate-900">
              {isZiweiModule ? '紫微斗数测算失败' : '测算失败'}
            </div>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              {isZiweiModule
                ? (ziweiError ?? '紫微斗数模型调用失败，请检查网络或稍后重试。')
                : (analysisError ?? '模型调用失败，请检查网络或稍后重试。')}
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
                  if (activeModule === 'ziwei') {
                    void runZiweiAnalysis(input);
                    return;
                  }
                  void runAnalysis(input);
                }}
              >
                {isZiweiModule ? '重试紫微测算' : '重试测算'}
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
