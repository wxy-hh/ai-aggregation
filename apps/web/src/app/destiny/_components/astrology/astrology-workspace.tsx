'use client';

/**
 * 星座寰宇 —— 占星工作区
 *
 * 编排完整闭环：模块入口 → 两步表单 → 真实四阶段加载 → 结果总览/深度/问答/分享。
 * 接入 astrology-workspace-store 与 /api/destiny/astrology/report SSE 流。
 * 保持「所有工作区始终挂载、CSS 显隐切换」的 destiny 壳层模式。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, RotateCcw, Share2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/api/client';
import { DestinyModelSwitcher } from '@/components/destiny/model-switcher';
import { useAstrologyWorkspaceStore } from '@/stores/astrology-workspace-store';
import type { DestinyModuleKey } from '@/app/destiny/_components/layout/left-nav';
import { GlassCard } from '../layout/glass-card';
import { destinySecondaryBtnClass } from '../layout/destiny-result-header';
import { AstrologyInputForm } from './astrology-input-form';
import { AstrologyLoading, type LoadingStage } from './astrology-loading';
import { AstrologyChartCanvas } from './astrology-chart-canvas';
import { AstrologyResultOverview } from './astrology-result-overview';
import { AstrologyChartWheel } from './astrology-chart-wheel';
import { AstrologyAspectsPanel } from './astrology-aspects-panel';
import { AstrologyQaPanel } from './astrology-qa-panel';
import { AstrologyShareCard } from './astrology-share-card';
import type { AstrologyReport, ChartFacts, ModuleReading, TransitGuidance, BigThree } from './astrology-types';

type AstrologyWorkspaceProps = {
  isActive: boolean;
  onModuleChange?: (key: DestinyModuleKey) => void;
  onLoadingChange?: (loading: boolean) => void;
};

type DepthTab = 'overview' | 'wheel' | 'aspects';

export function AstrologyWorkspace({ isActive, onLoadingChange }: AstrologyWorkspaceProps) {
  const reduceMotion = useReducedMotion();
  const step = useAstrologyWorkspaceStore((s) => s.step);
  const formData = useAstrologyWorkspaceStore((s) => s.formData);
  const blockingLoading = useAstrologyWorkspaceStore((s) => s.blockingLoading);
  const chartFacts = useAstrologyWorkspaceStore((s) => s.chartFacts);
  const report = useAstrologyWorkspaceStore((s) => s.report);
  const toRequest = useAstrologyWorkspaceStore((s) => s.toRequest);
  const setResult = useAstrologyWorkspaceStore((s) => s.setResult);
  const markResultReady = useAstrologyWorkspaceStore((s) => s.markResultReady);
  const backToForm = useAstrologyWorkspaceStore((s) => s.backToForm);
  const setBlockingLoading = useAstrologyWorkspaceStore((s) => s.setBlockingLoading);
  const setStreaming = useAstrologyWorkspaceStore((s) => s.setStreaming);

  const [loadingStage, setLoadingStage] = useState<LoadingStage>(1);
  const [hasResult, setHasResult] = useState(false);
  const [depthTab, setDepthTab] = useState<DepthTab>('overview');
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  /** 提交排盘：驱动真实四阶段 + SSE 流式解读。 */
  const handleSubmit = useCallback(async () => {
    setBlockingLoading(true);
    setHasResult(false);
    setLoadingStage(1);

    let facts: ChartFacts | null = null;
    let finalReport: AstrologyReport | null = null;
    let modules: ModuleReading[] = [];
    let transits: TransitGuidance[] = [];
    let headline = '';
    let bigThree: BigThree | null = null;

    try {
      // 阶段 1-2：校准 + 定位（真值计算在服务端 chart-facts 一并返回，这里渐进呈现）
      setLoadingStage(1);
      // 携带登录令牌请求（与其他命理模块一致，401 自动刷新重试）
      const res = await authFetch('/api/destiny/astrology/report', {
        method: 'POST',
        body: JSON.stringify(toRequest()),
      });
      if (!res.ok || !res.body) {
        throw new Error('星盘绘制未完成，请稍后重试');
      }

      setLoadingStage(2);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.replace(/^data:\s*/, '').trim();
          if (!line) continue;
          let event: { type: string; [k: string]: unknown };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === 'chart-facts') {
            facts = event.chartFacts as ChartFacts;
            setLoadingStage(3);
          } else if (event.type === 'bigThree') {
            bigThree = event.bigThree as BigThree;
          } else if (event.type === 'headline') {
            headline = event.headline as string;
            setLoadingStage(4);
          } else if (event.type === 'modules') {
            modules = event.modules as ModuleReading[];
          } else if (event.type === 'transits') {
            transits = event.transits as TransitGuidance[];
          } else if (event.type === 'complete') {
            finalReport = event.report as AstrologyReport;
          } else if (event.type === 'error') {
            throw new Error(String(event.error ?? '解读整理失败'));
          }
        }
      }

      if (facts) {
        const reportData: AstrologyReport =
          finalReport ?? {
            title: `星座寰宇 · ${formData.name || '匿名'}的本命星盘`,
            coreTone: headline,
            summary: headline,
            readings: modules,
            transits,
            disclaimer: '本命盘位置基于出生时空计算；内容用于自我探索与娱乐参考。',
          };
        setResult({
          chartFacts: facts,
          report: reportData,
          stabilityInfo: {
            confidence: formData.timePrecision === 'minute' ? 'high' : formData.timePrecision === 'approximate' ? 'medium' : 'low',
            timeRangeStable: formData.timePrecision === 'minute',
            housesSensitive: formData.timePrecision !== 'minute',
            suggestions: formData.timePrecision !== 'minute' ? ['补充出生时间可解锁上升、十二宫与事业坐标'] : [],
          },
        });
        markResultReady();
        setHasResult(true);
      }
    } catch (error) {
      useAstrologyWorkspaceStore.getState().setError(error instanceof Error ? error.message : '星盘绘制未完成，出生资料已保留', 'unknown');
    } finally {
      setBlockingLoading(false);
      setStreaming(false);
    }
  }, [formData.name, formData.timePrecision, markResultReady, setBlockingLoading, setResult, setStreaming, toRequest]);

  const recalc = () => {
    backToForm();
    setHasResult(false);
    setDepthTab('overview');
  };

  return (
    <div className={cn('h-full w-full', !isActive && 'hidden')}>
      <div className="mx-auto h-full w-full max-w-4xl overflow-y-auto px-3 pb-24 pt-4 custom-scrollbar sm:px-6 sm:pt-6">
        <AnimatePresence mode="wait">
          {/* 结果页 */}
          {step === 'result' && hasResult && chartFacts && report ? (
            <motion.div
              key="result"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4 sm:space-y-6"
            >
              {/* 操作行：问星语 / 分享 / 重新测算（内容区操作，非固定底栏） */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => setShareOpen((v) => !v)} className={destinySecondaryBtnClass}>
                  <Share2 className="mr-1.5 h-4 w-4" />
                  分享
                </button>
                <button type="button" onClick={recalc} className={destinySecondaryBtnClass}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  重新测算
                </button>
              </div>

              <AstrologyResultOverview chartFacts={chartFacts} report={report} />

              {/* P0 深度标签：星盘轮 · 关键相位 */}
              <div className="rounded-[24px] border border-white/60 bg-white/92 p-4 sm:p-6 dark:border-white/10 dark:bg-slate-900/92">
                <div className="mb-4 flex gap-2 border-b border-slate-200/60 pb-3 dark:border-white/10">
                  {(
                    [
                      { key: 'overview', label: '本命总览' },
                      { key: 'wheel', label: '星盘轮' },
                      { key: 'aspects', label: '关键相位' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setDepthTab(tab.key)}
                      aria-pressed={depthTab === tab.key}
                      className={cn(
                        'min-h-11 rounded-full px-4 text-sm font-semibold transition-all',
                        depthTab === tab.key
                          ? 'bg-blue-500/10 text-blue-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {depthTab === 'overview' && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    结果总览已在上方呈现；切换到「星盘轮」或「关键相位」深入探索盘面依据。
                  </p>
                )}
                {depthTab === 'wheel' && <AstrologyChartWheel chartFacts={chartFacts} />}
                {depthTab === 'aspects' && <AstrologyAspectsPanel aspects={chartFacts.aspects} />}
              </div>

              {/* 星语问答 */}
              <AstrologyQaPanel chartFacts={chartFacts} />

              {/* 脱敏分享 */}
              <AnimatePresence>
                {shareOpen && (
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <GlassCard variant="solid" className="p-4 sm:p-6">
                      <AstrologyShareCard chartFacts={chartFacts} report={report} />
                    </GlassCard>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : blockingLoading ? (
            /* 加载页 */
            <motion.div key="loading" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
              <AstrologyLoading stage={loadingStage} hasHouses={formData.timePrecision !== 'unknown'} chartFacts={chartFacts} />
            </motion.div>
          ) : (
            /* 入口 + 表单 */
            <motion.div
              key="form"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* 模块入口（首次进入/重新测算时展示） */}
              {step === 'form' && (
                <GlassCard variant="hero" className="relative overflow-hidden p-6 sm:p-10">
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/20" />
                  <div className="relative grid items-center gap-6 sm:grid-cols-2">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/8 px-3 py-1 text-[11px] font-semibold text-indigo-600 dark:border-indigo-400/25 dark:bg-indigo-500/10 dark:text-indigo-300">
                          <Star className="h-3.5 w-3.5" />
                          本命星盘 · 关系与星运
                        </div>
                        {/* 移动端：模型切换与徽章同行右侧；桌面端由页面右上悬浮入口承接 */}
                        <DestinyModelSwitcher size="compact" className="shrink-0 xl:hidden" />
                      </div>
                      <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        星座寰宇
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                        以出生时空绘制你的本命星盘。星体位置为计算结果，解读由 AI 生成；用于自我探索与娱乐参考。
                      </p>
                    </div>
                    <div className="flex justify-center">
                      <AstrologyChartCanvas chartFacts={null} hasHouses={false} size={200} />
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* 两步表单 */}
              <AstrologyInputForm onSubmit={handleSubmit} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
