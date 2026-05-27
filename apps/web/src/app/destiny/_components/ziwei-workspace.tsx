'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Heart, HeartPulse, HelpCircle, Sparkles, Wallet } from 'lucide-react';
import { PersonalityIcon } from './icons/personality-icon';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { authHeaders } from '@/lib/api/client';
import { useDestinyWorkspaceStore, type ZiweiErrorKind } from '@/stores/destiny-workspace-store';
import { BaziInputForm } from './bazi-input-form';
import { DestinyPageScaffold } from './layout/destiny-page-scaffold';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { ZiweiChartHeader } from './ziwei-chart-header';
import { ZiweiPalaceGrid } from './ziwei-palace-grid';
import { GlossaryTooltip } from './ziwei-glossary';
import { mapFormToBaziRequest } from './bazi-mappers';
import type { BaziFormData } from './bazi-types';
import type {
  DestinyModule,
  DestinyReport,
  DestinyStreamStatus,
  PartialDestinyReport,
  ZiweiChartData,
  ZiweiLockedSections,
  ZiweiPalaceAnalysis,
  ZiweiSectionKey,
  ZiweiStreamEvent,
} from './types';

// ─── 类型 ───

/** AI 返回的宫位标签 → iztro 宫位名映射 */
const AI_TO_IZTRO_PALACE: Record<string, string> = {
  父母宫: '父母',
  福德宫: '福德',
  田宅宫: '田宅',
  官禄宫: '官禄',
  命宫: '命宫',
  兄弟宫: '兄弟',
  奴仆宫: '仆役',
  夫妻宫: '夫妻',
  迁移宫: '迁移',
  子女宫: '子女',
  财帛宫: '财帛',
  疾厄宫: '疾厄',
};

function normalizePalaceLabel(label: string): string {
  return AI_TO_IZTRO_PALACE[label] ?? label;
}

type ZiweiWorkspaceProps = {
  isActive: boolean;
  onLoadingChange?: (loading: boolean) => void;
};

type PanelTab = 'overview' | 'timeline' | 'relations' | 'glossary';

const TAB_OPTIONS: Array<{ key: PanelTab; label: string }> = [
  { key: 'overview', label: '命理总论' },
  { key: 'timeline', label: '大限流年' },
  { key: 'relations', label: '六亲缘分' },
  { key: 'glossary', label: '星曜百科' },
];

// ─── 表单校验 ───

function validateForm(formData: BaziFormData): Partial<Record<keyof BaziFormData, string>> {
  const errors: Partial<Record<keyof BaziFormData, string>> = {};
  if (!formData.name.trim()) errors.name = '请填写姓名';
  if (!formData.location.name.trim()) errors.location = '请填写出生地点';
  return errors;
}

// ─── 错误处理 ───

function classifyResponseError(status: number): ZiweiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429 || status >= 500) return 'model';
  return 'unknown';
}

function displayError(kind: ZiweiErrorKind, fallback?: string): string {
  if (fallback?.trim()) return fallback;
  switch (kind) {
    case 'validation':
      return '参数错误：请检查姓名、出生日期、时间及地点后重试。';
    case 'timeout':
      return '超时错误：模型推演时间过长，请稍后重试。';
    case 'model':
      return '模型错误：紫微斗数分析服务暂不可用，请稍后重试。';
    default:
      return '系统异常：紫微斗数分析失败，请稍后重试。';
  }
}

// ─── 流式解析 ───

function parseStreamBlock(block: string): ZiweiStreamEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .join('\n')
    .trim();
  if (!data) return null;
  return JSON.parse(data) as ZiweiStreamEvent;
}

async function consumeStream(response: Response, onEvent: (event: ZiweiStreamEvent) => void) {
  if (!response.body) throw new Error('响应体为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const block = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      const event = block ? parseStreamBlock(block) : null;
      if (event) onEvent(event);
      idx = buffer.indexOf('\n\n');
    }
  }

  const tail = `${buffer}${decoder.decode()}`.trim();
  const event = tail ? parseStreamBlock(tail) : null;
  if (event) onEvent(event);
}

// ─── 主组件 ───

export function ZiweiWorkspace({ isActive, onLoadingChange }: ZiweiWorkspaceProps) {
  const {
    step,
    formData,
    fieldErrors,
    blockingLoading,
    streaming,
    error,
    report,
    chartData,
    lockedSections,
    streamStatus,
    tab,
    activePalaceLabel,
    setWorkspaceState,
    resetWorkspace,
    restoreWorkspace,
    markResultReady,
  } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      ...state.ziwei,
      setWorkspaceState: state.setWorkspaceState,
      resetWorkspace: state.resetWorkspace,
      restoreWorkspace: state.restoreWorkspace,
      markResultReady: state.markResultReady,
    }))
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  useEffect(() => {
    if (isActive) restoreWorkspace('ziwei');
  }, [isActive, restoreWorkspace]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const onChange = <K extends keyof BaziFormData>(key: K, next: BaziFormData[K]) => {
    setWorkspaceState('ziwei', (current) => ({
      formData: { ...current.formData, [key]: next },
      fieldErrors: { ...current.fieldErrors, [key]: undefined },
    }));
  };

  const submit = async () => {
    const errors = validateForm(formData);
    setWorkspaceState('ziwei', { fieldErrors: errors });
    if (Object.keys(errors).length > 0) {
      setWorkspaceState('ziwei', {
        errorKind: 'validation',
        error: '参数错误：请先完善表单信息后再开始分析',
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setWorkspaceState('ziwei', {
      step: 'form',
      lastView: 'form',
      hasResult: false,
      blockingLoading: true,
      streaming: true,
      error: null,
      errorKind: null,
      report: null,
      chartData: null,
      lockedSections: {},
      streamStatus: 'queued',
      tab: 'overview',
      activePalaceLabel: '命宫',
    });

    let currentErrorKind: ZiweiErrorKind = 'unknown';

    try {
      const response = await fetch('/api/destiny/ziwei-report', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(mapFormToBaziRequest(formData)),
        signal: controller.signal,
      });

      if (!response.ok) {
        currentErrorKind = classifyResponseError(response.status);
        const errText = await response
          .json()
          .then((j) => j?.error)
          .catch(() => undefined);
        throw new Error(displayError(currentErrorKind, errText));
      }

      const receivedSections: ZiweiLockedSections = {};
      let sawComplete = false;

      await consumeStream(response, (event) => {
        if (event.type === 'status') {
          setWorkspaceState('ziwei', { streamStatus: event.status });
          return;
        }

        if (event.type === 'section-final') {
          if (receivedSections[event.sectionKey]) return;

          const key = event.sectionKey as keyof ZiweiLockedSections;
          let payload = event.payload;

          // 将 AI 返回的宫位标签（如"父母宫"）归一化为 iztro 名称（如"父母"）
          if (event.sectionKey === 'palaceAnalysis' && Array.isArray(event.payload)) {
            payload = (event.payload as ZiweiPalaceAnalysis[]).map((item) => ({
              ...item,
              label: normalizePalaceLabel(item.label),
            }));
          }

          (receivedSections as Record<string, unknown>)[event.sectionKey] = payload;

          setWorkspaceState('ziwei', (current) => ({
            lockedSections: current.lockedSections[event.sectionKey]
              ? current.lockedSections
              : { ...current.lockedSections, [event.sectionKey]: payload },
            chartData:
              event.sectionKey === 'chartData'
                ? (event.payload as ZiweiChartData)
                : current.chartData,
            blockingLoading: false,
            activePalaceLabel:
              event.sectionKey === 'palaceAnalysis' &&
              Array.isArray(payload) &&
              (payload as ZiweiPalaceAnalysis[])[0]?.label
                ? (payload as ZiweiPalaceAnalysis[])[0].label
                : current.activePalaceLabel,
          }));
          markResultReady('ziwei');
          return;
        }

        if (event.type === 'complete') {
          sawComplete = true;
          setWorkspaceState('ziwei', (current) => ({
            report: event.report,
            streaming: false,
            streamStatus: null,
          }));
          markResultReady('ziwei');
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.error);
        }
      });

      if (!sawComplete) {
        setWorkspaceState('ziwei', {
          blockingLoading: false,
          streaming: false,
          streamStatus: null,
        });
      }
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'AbortError') return;
      const rawMessage = nextError instanceof Error ? nextError.message : undefined;
      setWorkspaceState('ziwei', {
        errorKind: currentErrorKind,
        error: displayError(currentErrorKind, rawMessage),
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setWorkspaceState('ziwei', { blockingLoading: false, streaming: false });
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    resetWorkspace('ziwei');
  };

  const handleRecalculate = () => {
    abortRef.current?.abort();
    resetWorkspace('ziwei');
  };

  return (
    <DestinyPageScaffold withNavOffset>
      <div className="relative h-full min-h-0 w-full bg-[#F3F5FA] dark:bg-[#111218]">
        {step === 'form' ? (
          <div className="absolute inset-0 flex h-full min-h-0 flex-col p-3 sm:p-5 lg:p-6">
            <div className="min-h-0 flex-1 overflow-y-auto">
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
              {/* 紫微斗数特有提示 */}
              <div className="mt-6 rounded-2xl border border-amber-200/60 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-800/40 p-4">
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  性别至关重要，男女大运走向完全相反。出生时间精确到分钟最佳，若只知道大致时辰，结果仅供参考。建议提供出生地点（精确到市），用于校正真太阳时。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 h-full min-h-0 w-full">
            <ZiweiResultView
              report={report}
              chartData={chartData}
              streaming={streaming}
              streamStatus={streamStatus}
              lockedSections={lockedSections}
              tab={tab}
              activePalaceLabel={activePalaceLabel}
              formData={formData}
              onTabChange={(t) => setWorkspaceState('ziwei', { tab: t })}
              onPalaceLabelChange={(label) =>
                setWorkspaceState('ziwei', { activePalaceLabel: label })
              }
              onRecalculate={handleRecalculate}
            />
          </div>
        )}
      </div>

      <StarDecodeOverlay open={blockingLoading} />
    </DestinyPageScaffold>
  );
}

// ─── 结果视图 ───

type ResultViewProps = {
  report: DestinyReport | null;
  chartData: ZiweiChartData | null;
  streaming: boolean;
  streamStatus: DestinyStreamStatus | null;
  lockedSections: ZiweiLockedSections;
  tab: PanelTab;
  activePalaceLabel: string;
  formData: BaziFormData;
  onTabChange: (tab: PanelTab) => void;
  onPalaceLabelChange: (label: string) => void;
  onRecalculate: () => void;
};

function ZiweiResultView({
  report,
  chartData,
  streaming,
  streamStatus,
  lockedSections,
  tab,
  activePalaceLabel,
  formData,
  onTabChange,
  onPalaceLabelChange,
  onRecalculate,
}: ResultViewProps) {
  const palaceAnalyses = useMemo<ZiweiPalaceAnalysis[]>(() => {
    return lockedSections.palaceAnalysis ?? [];
  }, [lockedSections.palaceAnalysis]);

  const timeline = useMemo(() => lockedSections.timeline ?? [], [lockedSections.timeline]);
  const relations = useMemo(() => lockedSections.relations, [lockedSections.relations]);

  // 合并 overviewModules（personality/career/wealth）与 love/health 为完整的 5 模块数据
  const allModules = useMemo(() => {
    const ov = lockedSections.overviewModules;
    const base = {
      personality: ov?.personality,
      career: ov?.career,
      wealth: ov?.wealth,
      love: lockedSections.love,
      health: lockedSections.health,
    };
    // complete 事件后 report.modules 可作为兜底
    if (report?.modules) {
      return {
        personality: base.personality ?? report.modules.personality,
        career: base.career ?? report.modules.career,
        wealth: base.wealth ?? report.modules.wealth,
        love: base.love ?? report.modules.love,
        health: base.health ?? report.modules.health,
      };
    }
    return base;
  }, [lockedSections.overviewModules, lockedSections.love, lockedSections.health, report]);

  const activeAnalysis = palaceAnalyses.find((p) => p.label === activePalaceLabel);
  const hasData = !!chartData;

  const progressText =
    streaming && chartData
      ? `AI 正在解读星盘${streamStatus ? ` · ${streamStatus}` : ''}`
      : chartData
        ? '基于精确星盘数据的 AI 深度人生轨迹分析'
        : '正在计算紫微斗数星盘...';

  return (
    <div className="h-full w-full overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:gap-6">
        {/* 页面标题 */}
        <header className="relative overflow-hidden rounded-[32px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-900/70 p-6 sm:p-8 shadow-[0_20px_40px_rgba(15,23,42,0.08)] flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold leading-tight text-[#0F172A] dark:text-white">
              <GlossaryTooltip term="紫微" chartData={chartData ?? undefined}>
                AI 紫微斗数
              </GlossaryTooltip>{' '}
              <span className="block text-base font-medium text-[#3C58D8] dark:text-[#9BADFF] sm:inline">
                星盘全景视图
              </span>
            </h1>
            <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1">{progressText}</p>
          </div>
          <Button
            type="button"
            onClick={onRecalculate}
            className="self-start inline-flex min-h-10 sm:min-h-11 items-center justify-center rounded-xl px-5 sm:px-6 text-xs sm:text-sm font-semibold bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white shadow-[0_10px_24px_rgba(93,124,250,0.32)] hover:brightness-[1.05] hover:shadow-[0_14px_30px_rgba(93,124,250,0.36)] active:scale-[0.98] transition-all duration-200 sm:self-auto"
          >
            重新排盘
          </Button>
        </header>

        {/* 无数据提示 */}
        {!hasData && (
          <div className="rounded-[32px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-900/70 backdrop-blur-xl p-8 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <div className="text-lg font-bold text-[#0F172A] dark:text-white">正在计算紫微星盘</div>
            <p className="mt-2 text-sm text-[#64748B] dark:text-slate-400">
              本地排盘引擎正在计算您的精准星盘数据，请稍候...
            </p>
          </div>
        )}

        {chartData && (
          <>
            {/* 命盘头部 */}
            <ZiweiChartHeader chart={chartData} name={formData.name} gender={formData.gender} />

            {/* 主体：星盘 + 右侧面板 */}
            <div className="grid grid-cols-12 gap-4 sm:gap-6">
              {/* 左侧：星盘网格 + 模块卡片 */}
              <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
                {/* 星盘网格 */}
                <ZiweiPalaceGrid
                  chart={chartData}
                  activePalaceLabel={activePalaceLabel}
                  onPalaceSelect={onPalaceLabelChange}
                  birthYear={formData.birthDate.year}
                />

                {/* 五大模块卡片 */}
                <ModuleCards
                  modules={allModules}
                  palaceAnalyses={palaceAnalyses}
                  activePalaceLabel={activePalaceLabel}
                  streaming={streaming}
                />
              </div>

              {/* 右侧面板 */}
              <div className="col-span-12 xl:col-span-4">
                <RightPanel
                  tab={tab}
                  activePalaceLabel={activePalaceLabel}
                  activeAnalysis={activeAnalysis}
                  chartData={chartData}
                  timeline={timeline}
                  relations={relations}
                  streaming={streaming}
                  onTabChange={onTabChange}
                />
              </div>
            </div>

            {/* 免责声明 */}
            <Disclaimer />
          </>
        )}
      </div>
    </div>
  );
}

// ─── 五大模块卡片 ───

const MODULE_DEFAULTS = [
  { key: 'personality', label: '性格特质', Icon: PersonalityIcon, color: '#d97706' },
  { key: 'career', label: '事业发展', Icon: Briefcase, color: '#2563eb' },
  { key: 'wealth', label: '财运运势', Icon: Wallet, color: '#059669' },
  { key: 'love', label: '感情婚姻', Icon: Heart, color: '#e11d48' },
  { key: 'health', label: '健康运势', Icon: HeartPulse, color: '#64748b' },
] as const;

/** 解析 bullet 文本，提取标签和内容 */
function parseBullet(text: string): { label: string; content: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^([^：:，.]+)[：:，.]\s*(.+)$/);
  if (match) {
    return { label: match[1], content: match[2] };
  }
  return { label: '', content: trimmed };
}

/** 统一渲染优势和建议（兼容新格式 advantages/suggestions 和旧格式 bullets） */
function renderAdvantagesAndSuggestions(data: DestinyModule) {
  // 新格式优先：各取 1 条，与设计图一致
  if (data.advantages?.length || data.suggestions?.length) {
    return (
      <div className="mt-3 space-y-1.5">
        {data.advantages?.slice(0, 1).map((text, i) => (
          <p key={`adv-${i}`} className="text-[13px] text-[#475569] dark:text-slate-300 leading-relaxed">
            <span className="font-bold text-[#1e3a8a] dark:text-blue-300">优势：</span>
            {text}
          </p>
        ))}
        {data.suggestions?.slice(0, 1).map((text, i) => (
          <p key={`sug-${i}`} className="text-[13px] text-[#475569] dark:text-slate-300 leading-relaxed">
            <span className="font-bold text-[#1e3a8a] dark:text-blue-300">建议：</span>
            {text}
          </p>
        ))}
      </div>
    );
  }

  // 兼容旧格式 bullets：尝试解析已有前缀，否则自动分配
  if (data.bullets && data.bullets.length > 0) {
    const items = data.bullets.slice(0, 2); // 最多取 2 条（1 优势 + 1 建议）
    const parsed = items.map(parseBullet);

    // 如果 bullets 已经包含"优势/建议"前缀，直接渲染
    const hasLabels = parsed.some((p) => p.label);
    if (hasLabels) {
      return (
        <div className="mt-3 space-y-1.5">
          {parsed.slice(0, 2).map((p, i) => (
            <p key={i} className="text-[13px] text-[#475569] dark:text-slate-300 leading-relaxed">
              {p.label ? (
                <>
                  <span className="font-bold text-[#1e3a8a] dark:text-blue-300">{p.label}：</span>
                  {p.content}
                </>
              ) : (
                p.content
              )}
            </p>
          ))}
        </div>
      );
    }

    // 没有前缀：第 1 条标记为优势，第 2 条标记为建议
    const advantages = items.slice(0, 1);
    const suggestions = items.slice(1, 2);

    return (
      <div className="mt-3 space-y-1.5">
        {advantages.map((text, i) => (
          <p key={`adv-${i}`} className="text-[13px] text-[#475569] dark:text-slate-300 leading-relaxed">
            <span className="font-bold text-[#1e3a8a] dark:text-blue-300">优势：</span>
            {text}
          </p>
        ))}
        {suggestions.map((text, i) => (
          <p key={`sug-${i}`} className="text-[13px] text-[#475569] dark:text-slate-300 leading-relaxed">
            <span className="font-bold text-[#1e3a8a] dark:text-blue-300">建议：</span>
            {text}
          </p>
        ))}
      </div>
    );
  }

  return null;
}

function ModuleCards({
  modules,
  streaming,
}: {
  modules: Partial<Record<string, DestinyModule>> | undefined;
  palaceAnalyses: ZiweiPalaceAnalysis[];
  activePalaceLabel: string;
  streaming: boolean;
}) {
  const moduleList = MODULE_DEFAULTS.map((def) => {
    const data = modules?.[def.key];
    return { ...def, data };
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {moduleList.map((item) => (
        <div
          key={item.key}
          className="relative overflow-hidden rounded-[20px] bg-[#F8F7FB] dark:bg-slate-800/40 border border-[#E8E6F0]/60 dark:border-white/5 p-5 transition-all duration-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
        >
          {item.data ? (
            <>
              {/* 图标 + 标题 */}
              <div className="flex items-center gap-2 mb-3">
                <item.Icon
                  className="h-5 w-5"
                  style={{ color: item.color }}
                  strokeWidth={2}
                />
                <span
                  className="text-sm font-bold"
                  style={{ color: item.color }}
                >
                  {item.label}
                </span>
              </div>

              {/* 宫位描述（深蓝色副标题）——仅当 title 不等于模块名时显示，避免重复 */}
              {item.data.title && item.data.title !== item.label && (
                <div className="text-[13px] font-bold text-[#1e3a8a] dark:text-blue-300 mb-2">
                  {item.data.title}
                </div>
              )}

              {/* 核心描述（一句话概括） */}
              <p className="text-[13px] text-[#475569] dark:text-slate-300 leading-relaxed">
                {item.data.summary}
              </p>

              {/* 优势 / 建议 分行展示（各最多 1 条，与设计图一致） */}
              {renderAdvantagesAndSuggestions(item.data)}
            </>
          ) : (
            <ModuleSkeleton label={item.label} color={item.color} />
          )}
        </div>
      ))}
    </div>
  );
}

function ModuleSkeleton({ label, color }: { label: string; color: string }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <span className="h-5 w-5 rounded animate-pulse bg-slate-200/60" style={{ backgroundColor: `${color}20` }} />
        <div className="h-4 w-16 animate-pulse rounded bg-slate-200/60" />
      </div>
      <div className="h-4 w-24 animate-pulse rounded bg-slate-200/50 mb-2" />
      <div className="h-3 w-full animate-pulse rounded bg-slate-200/50" />
      <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-200/50" />
    </>
  );
}

// ─── 右侧面板 ───

type RightPanelProps = {
  tab: PanelTab;
  activePalaceLabel: string;
  activeAnalysis: ZiweiPalaceAnalysis | undefined;
  chartData: ZiweiChartData;
  timeline: unknown[];
  relations: unknown;
  streaming: boolean;
  onTabChange: (tab: PanelTab) => void;
};

function RightPanel({
  tab,
  activePalaceLabel,
  activeAnalysis,
  chartData,
  timeline,
  relations,
  streaming,
  onTabChange,
}: RightPanelProps) {
  return (
    <section className="rounded-[32px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-900/70 backdrop-blur-xl overflow-hidden h-full min-h-[760px] flex flex-col shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
      {/* 标签页导航 */}
      <div className="grid grid-cols-4 gap-1 p-2 bg-[#F8FAFC] dark:bg-slate-900/40">
        {TAB_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onTabChange(option.key)}
            className={[
              'rounded-xl text-xs font-semibold py-2.5 transition-all duration-200',
              tab === option.key
                ? 'bg-white dark:bg-slate-800 text-[#3C58D8] dark:text-blue-400 shadow-sm'
                : 'text-[#94A3B8] dark:text-slate-400 hover:text-[#64748B] dark:hover:text-slate-200',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 标签页内容 */}
      <div className="p-5 space-y-3 flex-1 min-h-[520px] overflow-y-auto custom-scrollbar">
        {tab === 'overview' && (
          <OverviewTab
            activeAnalysis={activeAnalysis}
            activePalaceLabel={activePalaceLabel}
            chartData={chartData}
          />
        )}
        {tab === 'timeline' && <TimelineTab timeline={timeline} streaming={streaming} />}
        {tab === 'relations' && <RelationsTab relations={relations} />}
        {tab === 'glossary' && <GlossaryTab chartData={chartData} />}
      </div>
    </section>
  );
}

// ─── 命理总论标签页（结构化 6 层折叠面板） ───

function OverviewTab({
  activeAnalysis,
  activePalaceLabel,
  chartData,
}: {
  activeAnalysis: ZiweiPalaceAnalysis | undefined;
  activePalaceLabel: string;
  chartData: ZiweiChartData;
}) {
  const summary = activeAnalysis?.summary;
  const suggestions = activeAnalysis?.suggestions ?? [];

  // 从命盘数据中获取当前宫位信息
  const palace = chartData.palaces.find((p) => p.name === activePalaceLabel);
  const mainStars =
    palace?.majorStars.filter(
      (s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma'
    ) ?? [];
  const softStars =
    palace?.majorStars.filter((s) => s.type === 'soft' || s.type === 'helper') ?? [];
  const toughStars = palace?.majorStars.filter((s) => s.type === 'tough') ?? [];
  const minorSoft =
    palace?.minorStars.filter((s) => s.type === 'soft' || s.type === 'helper') ?? [];
  const minorTough = palace?.minorStars.filter((s) => s.type === 'tough') ?? [];

  // 三方四正
  const tripartite = getTripartite(activePalaceLabel);

  // 四化
  const sihuaItems: Array<{ label: string; star: string; palaceName: string | null }> = [
    {
      label: '化禄',
      star: chartData.sihua.lu,
      palaceName: findSihuaPalace(chartData.sihua.lu, chartData.palaces),
    },
    {
      label: '化权',
      star: chartData.sihua.quan,
      palaceName: findSihuaPalace(chartData.sihua.quan, chartData.palaces),
    },
    {
      label: '化科',
      star: chartData.sihua.ke,
      palaceName: findSihuaPalace(chartData.sihua.ke, chartData.palaces),
    },
    {
      label: '化忌',
      star: chartData.sihua.ji,
      palaceName: findSihuaPalace(chartData.sihua.ji, chartData.palaces),
    },
  ];

  return (
    <div className="space-y-3">
      {/* 头部信息 */}
      <div className="text-xs font-semibold text-[#3C58D8] dark:text-[#9BADFF] tracking-wide">
        当前宫位 · {activePalaceLabel}
      </div>
      <div className="text-base font-bold text-[#0F172A] dark:text-white">AI 紫微格局深度解析</div>

      {/* 1. 宫位概述 */}
      <details
        open
        className="rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-800/40 p-4 border-l-4 border-l-emerald-400 overflow-hidden"
      >
        <summary className="cursor-pointer text-xs font-bold text-emerald-600 dark:text-emerald-400">
          宫位概述
        </summary>
        <p className="mt-2 text-sm text-[#64748B] dark:text-slate-300 leading-relaxed">
          {summary || 'AI 正在分析当前宫位的星曜组合与格局，请稍候...'}
        </p>
      </details>

      {/* 2. 主星格局 */}
      <details className="rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-800/40 p-4 border-l-4 border-l-[#4969E9] overflow-hidden">
        <summary className="cursor-pointer text-xs font-bold text-[#4969E9] dark:text-[#9BADFF]">
          主星格局
        </summary>
        <div className="mt-2 space-y-1.5">
          {mainStars.length > 0 ? (
            mainStars.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-sm">
                <span className="font-bold text-[#0F172A] dark:text-white">{s.name}</span>
                {s.brightness && (
                  <span className="text-xs font-bold text-slate-500">[{s.brightness}]</span>
                )}
                <span className="text-xs text-[#94A3B8]">{getStarTypeLabel(s.type)}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-[#94A3B8]">本宫无主星，借对宫星曜为用</p>
          )}
        </div>
      </details>

      {/* 3. 辅煞影响 */}
      <details className="rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-800/40 p-4 border-l-4 border-l-blue-400 overflow-hidden">
        <summary className="cursor-pointer text-xs font-bold text-blue-600 dark:text-blue-400">
          辅煞影响
        </summary>
        <div className="mt-2 space-y-2">
          {(softStars.length > 0 || minorSoft.length > 0) && (
            <div>
              <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mb-1">
                吉星 / 辅星
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...softStars, ...minorSoft].map((s) => (
                  <span
                    key={s.name}
                    className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800/30"
                  >
                    {s.name}
                    {s.brightness && (
                      <span className="text-[9px] opacity-60 ml-0.5">[{s.brightness}]</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(toughStars.length > 0 || minorTough.length > 0) && (
            <div>
              <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 mb-1">
                煞星 / 忌星
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...toughStars, ...minorTough].map((s) => (
                  <span
                    key={s.name}
                    className="text-xs px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-800/30"
                  >
                    {s.name}
                    {s.brightness && (
                      <span className="text-[9px] opacity-60 ml-0.5">[{s.brightness}]</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {softStars.length === 0 &&
            minorSoft.length === 0 &&
            toughStars.length === 0 &&
            minorTough.length === 0 && <p className="text-xs text-[#94A3B8]">暂无辅煞星曜影响</p>}
        </div>
      </details>

      {/* 4. 四化分析 */}
      <details className="rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-800/40 p-4 border-l-4 border-l-violet-400 overflow-hidden">
        <summary className="cursor-pointer text-xs font-bold text-violet-600 dark:text-violet-400">
          四化分析
        </summary>
        <div className="mt-2 space-y-1.5">
          {sihuaItems.map((item) => {
            const isInCurrentPalace = item.palaceName === activePalaceLabel;
            return (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                <span className="font-bold text-[#0F172A] dark:text-white min-w-[3em]">
                  {item.label}
                </span>
                <span className="text-[#64748B]">{item.star || '—'}</span>
                {item.palaceName && (
                  <span
                    className={isInCurrentPalace ? 'text-violet-600 font-bold' : 'text-[#94A3B8]'}
                  >
                    （{item.palaceName}）
                  </span>
                )}
                {isInCurrentPalace && (
                  <span className="text-[9px] px-1.5 py-px rounded bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-bold">
                    入本宫
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </details>

      {/* 5. 三方四正联动 */}
      <details className="rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-800/40 p-4 border-l-4 border-l-amber-400 overflow-hidden">
        <summary className="cursor-pointer text-xs font-bold text-amber-600 dark:text-amber-400">
          三方四正联动
        </summary>
        <div className="mt-2 text-sm text-[#64748B] dark:text-slate-300">
          {tripartite ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#0F172A] dark:text-white min-w-[3em]">
                  对宫
                </span>
                <span className="text-[#94A3B8]">{tripartite.opposite}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#0F172A] dark:text-white min-w-[3em]">
                  三合
                </span>
                <span className="text-[#94A3B8]">
                  {tripartite.tri[0]} · {tripartite.tri[1]}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#94A3B8]">暂无三方四正数据</p>
          )}
        </div>
      </details>

      {/* 6. 行动建议 */}
      {suggestions.length > 0 && (
        <details
          open
          className="rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-800/40 p-4 border-l-4 border-l-emerald-400 overflow-hidden"
        >
          <summary className="cursor-pointer text-xs font-bold text-emerald-600 dark:text-emerald-400">
            行动建议
          </summary>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-[#64748B] dark:text-slate-300"
              >
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** 三方四正关系表 */
const TRIPARTITE_MAP: Record<string, { opposite: string; tri: [string, string] }> = {
  命宫: { opposite: '迁移', tri: ['财帛', '官禄'] },
  兄弟: { opposite: '仆役', tri: ['疾厄', '田宅'] },
  夫妻: { opposite: '官禄', tri: ['福德', '迁移'] },
  子女: { opposite: '田宅', tri: ['仆役', '父母'] },
  财帛: { opposite: '福德', tri: ['命宫', '官禄'] },
  疾厄: { opposite: '父母', tri: ['兄弟', '田宅'] },
  迁移: { opposite: '命宫', tri: ['夫妻', '福德'] },
  仆役: { opposite: '兄弟', tri: ['子女', '父母'] },
  官禄: { opposite: '夫妻', tri: ['命宫', '财帛'] },
  田宅: { opposite: '子女', tri: ['兄弟', '疾厄'] },
  福德: { opposite: '财帛', tri: ['夫妻', '迁移'] },
  父母: { opposite: '疾厄', tri: ['仆役', '子女'] },
};

function getTripartite(name: string): { opposite: string; tri: [string, string] } | null {
  return TRIPARTITE_MAP[name] ?? null;
}

function findSihuaPalace(sihuaStar: string, palaces: ZiweiChartData['palaces']): string | null {
  if (!sihuaStar) return null;
  for (const p of palaces) {
    if (p.majorStars.some((s) => s.name === sihuaStar)) return p.name;
    if (p.minorStars.some((s) => s.name === sihuaStar)) return p.name;
  }
  return null;
}

function getStarTypeLabel(type: string): string {
  const map: Record<string, string> = {
    major: '主星',
    soft: '吉星',
    tough: '煞星',
    adjective: '杂耀',
    tianma: '动星',
    lucun: '财星',
    flower: '桃花',
    helper: '辅星',
  };
  return map[type] ?? type;
}

// ─── 大限流年标签页 ───

function TimelineTab({ timeline, streaming }: { timeline: unknown[]; streaming: boolean }) {
  const items = timeline as Array<{
    year?: number;
    title?: string;
    summary?: string;
    detail?: { opportunities?: string[]; risks?: string[]; actions?: string[] };
  }>;

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[16px] border border-[#F1F5F9] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
          >
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200/70" />
            <div className="mt-2 h-4 w-28 animate-pulse rounded bg-slate-200/70" />
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-200/70" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <details
          key={item.year ?? idx}
          open
          className="rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-800/40 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)]"
        >
          <summary className="cursor-pointer">
            <div className="text-xs text-[#94A3B8]">{item.year}年</div>
            <div className="text-sm font-bold text-[#0F172A] dark:text-white mt-1">
              {item.title}
            </div>
            <p className="mt-1 text-xs text-[#64748B] dark:text-slate-300">{item.summary}</p>
          </summary>
          {item.detail && (
            <div className="mt-3 space-y-2">
              <DetailBox type="opportunities" title="机会" items={item.detail.opportunities} />
              <DetailBox type="risks" title="风险" items={item.detail.risks} />
              <DetailBox type="actions" title="行动" items={item.detail.actions} />
            </div>
          )}
        </details>
      ))}
    </div>
  );
}

function DetailBox({
  type,
  title,
  items,
}: {
  type: 'opportunities' | 'risks' | 'actions';
  title: string;
  items?: string[];
}) {
  const colors = {
    opportunities:
      'border-l-4 border-l-emerald-400 bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    risks:
      'border-l-4 border-l-rose-400 bg-rose-50/50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
    actions:
      'border-l-4 border-l-blue-400 bg-blue-50/50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  };
  const dotColors = {
    opportunities: 'bg-emerald-400',
    risks: 'bg-rose-400',
    actions: 'bg-blue-400',
  };

  return (
    <div className={`rounded-[12px] border border-[#F1F5F9] p-3 ${colors[type]}`}>
      <div className="text-[11px] font-bold">{title}</div>
      <ul className="mt-1 space-y-1">
        {(items ?? []).map((x, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 h-1 w-1 flex-shrink-0 rounded-full ${dotColors[type]}`} />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 六亲缘分标签页 ───

function RelationsTab({ relations }: { relations: unknown }) {
  const data = relations as
    | { summary?: string; opportunities?: string[]; risks?: string[]; actions?: string[] }
    | undefined;

  return (
    <>
      <div className="text-base font-bold text-[#0F172A] dark:text-white">六亲关系建议</div>
      <p className="text-sm text-[#64748B] dark:text-slate-300 leading-relaxed">
        {data?.summary || 'AI 正在分析您的六亲缘分，请稍候...'}
      </p>

      <DetailSection
        type="opportunities"
        title="关系机遇"
        items={data?.opportunities}
        fallback="六亲关系分析定稿后将在此显示。"
      />
      <DetailSection
        type="risks"
        title="注意事项"
        items={data?.risks}
        fallback="关系风险分析定稿后将在此显示。"
      />
      <DetailSection
        type="actions"
        title="相处建议"
        items={data?.actions}
        fallback="行动建议定稿后将在此显示。"
      />
    </>
  );
}

function DetailSection({
  type,
  title,
  items,
  fallback,
}: {
  type: 'opportunities' | 'risks' | 'actions';
  title: string;
  items?: string[];
  fallback: string;
}) {
  const leftBarColors = {
    opportunities: 'border-l-emerald-400',
    risks: 'border-l-rose-400',
    actions: 'border-l-blue-400',
  };
  const labelColors = {
    opportunities: 'text-emerald-600 dark:text-emerald-400',
    risks: 'text-rose-600 dark:text-rose-400',
    actions: 'text-blue-600 dark:text-blue-400',
  };
  const dotColors = {
    opportunities: 'bg-emerald-400',
    risks: 'bg-rose-400',
    actions: 'bg-blue-400',
  };

  return (
    <details
      open
      className={`rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-800/40 p-4 border-l-4 ${leftBarColors[type]}`}
    >
      <summary className={`cursor-pointer text-xs font-bold ${labelColors[type]}`}>{title}</summary>
      <ul className="mt-2 space-y-1.5">
        {(items?.length ? items : [fallback]).map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-[#64748B] dark:text-slate-300">
            <span className={`mt-1 h-1 w-1 flex-shrink-0 rounded-full ${dotColors[type]}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── 星曜百科标签页 ───

// ─── 宫位影响映射（小白友好描述） ───

const PALACE_INFLUENCE: Record<string, string> = {
  '命宫': '影响你的核心性格',
  '官禄': '影响你的事业发展',
  '财帛': '影响你的财运理财',
  '夫妻': '影响你的感情婚姻',
  '疾厄': '影响你的健康状况',
  '迁移': '影响你的外出运势',
  '仆役': '影响你的人际关系',
  '交友': '影响你的人际关系',
  '兄弟': '影响你的兄弟姐妹',
  '子女': '影响你的子女运势',
  '田宅': '影响你的家庭房产',
  '福德': '影响你的精神福气',
  '父母': '影响你的父母长辈',
};

// ─── 星曜类型标签映射 ───

const typeLabel: Record<string, string> = {
  major: '主星',
  soft: '吉星',
  tough: '煞星',
  adjective: '杂耀',
  tianma: '动星',
  lucun: '财星',
  flower: '桃花',
  helper: '辅星',
};

// ─── 庙旺落陷颜色映射 ───

function getBrightnessColorClass(brightness: string): string {
  switch (brightness) {
    case '庙':
      return 'text-emerald-500';
    case '旺':
      return 'text-emerald-600';
    case '得':
      return 'text-blue-500';
    case '利':
      return 'text-indigo-500';
    case '平':
      return 'text-slate-500';
    case '闲':
      return 'text-amber-500';
    case '陷':
      return 'text-red-500';
    case '不':
      return 'text-red-600';
    default:
      return 'text-slate-500';
  }
}

// ─── 单颗星曜条目 ───

function StarItem({
  star,
  isSelected,
  onSelect,
  chartData,
}: {
  star: { name: string; type: string; brightness: string; palaceName: string };
  isSelected: boolean;
  onSelect: () => void;
  chartData: ZiweiChartData;
}) {
  const brightnessColor = getBrightnessColorClass(star.brightness);
  const influence = PALACE_INFLUENCE[star.palaceName] ?? `位于${star.palaceName}宫`;

  return (
    <button
      onClick={onSelect}
      className={[
        'w-full text-left rounded-[12px] border p-3 transition-all duration-200 bg-white dark:bg-slate-800/40',
        isSelected
          ? 'border-l-[3px] border-l-[#3b82f6] bg-[#eff6ff] dark:bg-blue-950/20 border-[#E2E8F0] dark:border-white/10 shadow-[0_2px_8px_rgba(59,130,246,0.08)]'
          : 'border-[#F1F5F9] dark:border-white/5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 hover:-translate-y-px',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <GlossaryTooltip term={star.name} side="right" chartData={chartData}>
          <span className="text-sm font-bold text-[#0F172A] dark:text-white cursor-help border-b border-dotted border-[#4969E9]/30">
            {star.name}
          </span>
        </GlossaryTooltip>
        <span className="text-[10px] text-[#64748B] dark:text-slate-500 bg-slate-100/80 dark:bg-slate-700/50 rounded-md px-1.5 py-px">
          {typeLabel[star.type] ?? star.type}
        </span>
        {star.brightness && (
          <span className="text-[10px] text-[#94A3B8] dark:text-slate-500">
            亮度：<span className={`font-bold ${brightnessColor}`}>{star.brightness}</span>
          </span>
        )}
      </div>
      {/* 小白友好：宫位 + 影响描述 */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[10px] px-1.5 py-px rounded bg-[#eff6ff] text-[#3b82f6] font-medium">
          {star.palaceName}宫
        </span>
        <span className="text-[10px] text-[#94A3B8]">{influence}</span>
      </div>
    </button>
  );
}

// ─── 星曜百科标签页 ───

// ─── 星曜入门帮助弹窗 ───

function StarIntroDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-[20px] bg-white dark:bg-slate-900 border border-[#F1F5F9] dark:border-white/10">
        <DialogTitle className="text-base font-bold text-[#0F172A] dark:text-white">
          星曜入门指南
        </DialogTitle>
        <DialogDescription className="sr-only">紫微斗数星曜基础知识介绍</DialogDescription>

        <div className="space-y-5 mt-2 text-sm text-[#64748B] dark:text-slate-300">
          {/* 什么是星曜 */}
          <section>
            <h4 className="text-sm font-bold text-[#0F172A] dark:text-white mb-1.5">什么是星曜？</h4>
            <p className="leading-relaxed">
              星曜就像你命盘里的「性格演员」，每颗星都有自己独特的脾气和本领。
              它们分布在你人生的不同领域（事业、感情、健康等），决定了你在这些方面的天生倾向。
            </p>
          </section>

          {/* 十四主星分类 */}
          <section>
            <h4 className="text-sm font-bold text-[#0F172A] dark:text-white mb-2">十四主星的四大类型</h4>
            <div className="space-y-2">
              <div className="rounded-lg bg-amber-50/60 dark:bg-amber-950/20 p-2.5">
                <div className="text-xs font-bold text-amber-700 dark:text-amber-400">领导型</div>
                <p className="text-xs mt-0.5">紫微、天府、武曲、天相 — 天生有管理和统筹能力</p>
              </div>
              <div className="rounded-lg bg-rose-50/60 dark:bg-rose-950/20 p-2.5">
                <div className="text-xs font-bold text-rose-700 dark:text-rose-400">开创型</div>
                <p className="text-xs mt-0.5">七杀、破军、廉贞、贪狼 — 敢闯敢拼，善于开创新局面</p>
              </div>
              <div className="rounded-lg bg-blue-50/60 dark:bg-blue-950/20 p-2.5">
                <div className="text-xs font-bold text-blue-700 dark:text-blue-400">支援型</div>
                <p className="text-xs mt-0.5">太阳、巨门、天机 — 善于沟通、分析和技术支持</p>
              </div>
              <div className="rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 p-2.5">
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">合作型</div>
                <p className="text-xs mt-0.5">天同、太阴、天梁 — 温和细腻，善于协调和照顾他人</p>
              </div>
            </div>
          </section>

          {/* 庙旺落陷白话解释 */}
          <section>
            <h4 className="text-sm font-bold text-[#0F172A] dark:text-white mb-1.5">亮度是什么意思？</h4>
            <p className="text-xs leading-relaxed mb-2">亮度代表一颗星在你命盘中的「发挥状态」，就像演员是否演对了角色：</p>
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span><strong className="text-emerald-600">庙/旺</strong>：能量很强，这颗星的优点会非常明显</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                <span><strong className="text-blue-600">得/利</strong>：能量不错，特点会正常表现出来</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                <span><strong className="text-slate-600">平/闲</strong>：能量一般，特点比较温和</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span><strong className="text-red-500">陷/不</strong>：能量较弱，容易表现出负面特点</span>
              </li>
            </ul>
          </section>

          {/* 宫位白话解释 */}
          <section>
            <h4 className="text-sm font-bold text-[#0F172A] dark:text-white mb-1.5">十二宫是什么？</h4>
            <p className="text-xs leading-relaxed">
              十二宫位就像人生的十二个房间，每个房间负责一个方面的事情。
              比如「财帛宫」管赚钱理财，「夫妻宫」管感情婚姻，「官禄宫」管事业发展。
              一颗星落在哪个宫，就代表它主要影响你人生的哪个方面。
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 小白入门引导卡片 ───

function StarGuideCard({ onOpenHelp }: { onOpenHelp: () => void }) {
  return (
    <div className="rounded-[12px] bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] dark:from-slate-800/40 dark:to-slate-800/20 border border-[#E2E8F0] dark:border-white/5 p-4 mb-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg bg-[#4969E9]/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-[#4969E9]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[#0F172A] dark:text-white">小白一分钟看懂星曜</div>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1 leading-relaxed">
            星曜就像你命盘里的「性格演员」，每颗星都有自己独特的脾气和本领。
            它们分布在你人生的不同领域（事业、感情、健康等），决定了你在这些方面的天生倾向。
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={onOpenHelp}
              className="text-xs font-medium text-[#4969E9] hover:text-[#3b82f6] transition-colors flex items-center gap-1"
            >
              <HelpCircle className="h-3 w-3" />
              了解更多
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 星曜百科标签页 ───

function GlossaryTab({ chartData }: { chartData: ZiweiChartData }) {
  const [search, setSearch] = React.useState('');
  const [selectedStar, setSelectedStar] = React.useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = React.useState(false);
  const [showIntro, setShowIntro] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // 收集所有星曜并去重，同时记录所在宫位
  const allStars = useMemo(() => {
    const seen = new Set<string>();
    const starToPalace = new Map<string, string>();
    const stars: Array<{ name: string; type: string; brightness: string; palaceName: string }> = [];
    for (const palace of chartData.palaces) {
      for (const s of palace.majorStars) {
        starToPalace.set(s.name, palace.name);
        if (!seen.has(s.name)) {
          seen.add(s.name);
          stars.push({ ...s, palaceName: palace.name });
        }
      }
      for (const s of palace.minorStars) {
        starToPalace.set(s.name, palace.name);
        if (!seen.has(s.name)) {
          seen.add(s.name);
          stars.push({ ...s, palaceName: palace.name });
        }
      }
    }
    return stars;
  }, [chartData]);

  // 按类型分组
  const groups = useMemo(() => {
    const map: Record<string, typeof allStars> = {
      major: [],
      soft_helper: [],
      tough: [],
      misc: [],
    };
    for (const star of allStars) {
      const key =
        star.type === 'major'
          ? 'major'
          : star.type === 'soft' || star.type === 'helper'
            ? 'soft_helper'
            : star.type === 'tough'
              ? 'tough'
              : 'misc';
      map[key].push(star);
    }
    return [
      { key: 'major' as const, label: '十四主星', icon: '●', color: 'text-violet-500' },
      { key: 'soft_helper' as const, label: '吉星辅曜', icon: '●', color: 'text-emerald-500' },
      { key: 'tough' as const, label: '煞星忌曜', icon: '●', color: 'text-rose-500' },
      { key: 'misc' as const, label: '杂曜动星', icon: '●', color: 'text-amber-500' },
    ].map((g) => ({ ...g, items: map[g.key] }));
  }, [allStars]);

  // 搜索过滤
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (s) => s.name.includes(q) || (typeLabel[s.type] ?? s.type).includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, search]);

  // 监听滚动显示返回顶部
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setShowBackToTop(el.scrollTop > 300);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalCount = allStars.length;

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto pr-1 -mr-1">
      {/* 标题与搜索 */}
      <div className="sticky top-0 z-10 dark:bg-slate-900/60">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-base font-bold text-[#0F172A] dark:text-white">命盘星曜详解</div>
            <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
              点击星曜查看详细解释，也可点击命盘中的星曜名称快速跳转
            </p>
          </div>
          <span className="text-xs text-[#94A3B8] dark:text-slate-500 mb-0.5">
            共{totalCount}颗星曜
          </span>
        </div>

        {/* 小白入门引导 */}
        <StarGuideCard onOpenHelp={() => setShowIntro(true)} />

        {/* 搜索框 */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索星曜名称，如：紫微、贪狼"
            className="w-full rounded-[12px] border border-[#E2E8F0] dark:border-white/10 bg-white dark:bg-slate-800/60 px-3 py-2.5 pl-9 text-sm text-[#0F172A] dark:text-white placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4969E9]/20 focus:border-[#4969E9]/40 transition-all"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
      </div>

      {/* 分组列表 */}
      <div className="space-y-5 mt-2">
        {filteredGroups.map((group) => (
          <div key={group.key}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className={`text-xs ${group.color}`}>{group.icon}</span>
              <span className="text-sm font-bold text-[#1e293b] dark:text-slate-200">
                {group.label}
              </span>
              <span className="text-[10px] text-[#94A3B8] dark:text-slate-500">
                （共{group.items.length}颗）
              </span>
            </div>

            {group.items.length === 0 ? (
              <div className="text-center py-4 text-xs text-[#94A3B8] dark:text-slate-500">
                本分组暂无星曜
              </div>
            ) : (
              <div className="space-y-2">
                {group.items.map((star) => (
                  <StarItem
                    key={star.name}
                    star={star}
                    isSelected={selectedStar === star.name}
                    onSelect={() =>
                      setSelectedStar((prev) => (prev === star.name ? null : star.name))
                    }
                    chartData={chartData}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-sm text-[#94A3B8] dark:text-slate-500">
            未找到匹配的星曜
          </div>
        )}
      </div>

      {/* 返回顶部按钮 */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 h-10 w-10 rounded-full bg-[#4969E9] text-white shadow-lg shadow-[#4969E9]/20 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          aria-label="返回顶部"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      )}

      {/* 星曜入门帮助弹窗 */}
      <StarIntroDialog open={showIntro} onOpenChange={setShowIntro} />
    </div>
  );
}

// ─── 免责声明 ───

function Disclaimer() {
  return (
    <div className="mt-8 rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm p-5 text-center">
      <p className="text-xs text-[#94A3B8] dark:text-slate-500 leading-relaxed max-w-2xl mx-auto">
        本网站基于传统紫微斗数理论与 AI
        大模型生成内容，仅供娱乐消遣之用。命运掌握在自己手中，人生的成败取决于个人的选择和努力。请理性看待，切勿迷信。本网站不提供医疗、法律、投资等专业领域的决策建议。
      </p>
    </div>
  );
}
