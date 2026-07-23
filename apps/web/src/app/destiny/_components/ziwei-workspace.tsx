'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Heart, HeartPulse, HelpCircle, Sparkles, Wallet } from 'lucide-react';
import { PersonalityIcon } from './icons/personality-icon';
import { useShallow } from 'zustand/react/shallow';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore, type ZiweiErrorKind } from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useZiweiThemeStore } from '@/stores/ziwei-theme-store';
import { resolveZiweiTheme } from '@/lib/utils/ziwei-theme';
import { createDestinyHistoryItem } from '@/lib/utils/history-helpers';
// 跨模态接力：紫微目标接收。紫微无 AI 顾问，承接语义为「生成命盘即完成接力」（REQ §4.6.4 紫微裁剪）
import { useRelayReceive } from '@/components/relay/use-relay-receive';
import { generateUUID } from '@/lib/utils/uuid';
import { cn } from '@/lib/utils';
import { BaziInputForm } from './bazi-input-form';
import { DestinyPageScaffold } from './layout/destiny-page-scaffold';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { NightSky } from './ziwei-night-sky';
import { ZiweiChartHeader } from './ziwei-chart-header';
import { ZiweiPalaceGrid } from './ziwei-palace-grid';
import { ZiweiThemeToggle } from './ziwei-theme-toggle';
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

// ───「白昼 × 夜幕」视觉 token ───
// 结果页支持双主题（见 styles/ziwei-theme.css）：夜幕=鎏金 × 紫微紫深空；白昼=亮玻璃+紫金点缀
// (表单步保持明亮玻璃体系,与八字/奇门一致;结果步默认跟随系统,可手动切换沉浸夜幕)

/** 大面板壳(解析面板/占位卡)，双主题语义类见 ziwei-theme.css */
const panelClass = 'zw-panel';

/** 表单步沿用明亮玻璃(输入阶段是白昼) */
const daylightPanelClass = cn(
  'relative overflow-hidden rounded-3xl border border-slate-200/50',
  'bg-white/85 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)]',
  'dark:border-white/10 dark:bg-slate-900/85 lg:dark:bg-slate-900/90'
);

/** 模块卡(五大模块)，双主题语义类(内边距沿用原 p-5) */
const moduleCardClass = 'zw-card p-5';

/** 鎏金主按钮，双主题语义类 */
const goldBtnClass = 'zw-gold-btn';

/** 详情折叠面板，双主题语义类 */
const detailPanelClass = 'zw-detail';

/** 折叠面板 summary:双主题焦点环 + 移动端 44px 热区 */
const summaryClass = cn(
  'cursor-pointer rounded-lg py-3 sm:py-1.5 text-xs font-bold',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--zw-violet-a60)]'
);

/** 流式状态 → 中文文案(服务端枚举为英文,不可直接渲染) */
const STREAM_STATUS_TEXT: Record<DestinyStreamStatus, string> = {
  queued: '排队等待中',
  charting: '排布星盘中',
  analyzing: 'AI 深度解读中',
  finalizing: '生成定稿中',
};

const stepTransitionClass =
  'transition-all duration-300 motion-reduce:transition-opacity motion-reduce:duration-150';
const stepTransitionStyle = {
  transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

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
    provider,
  } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      ...state.ziwei,
      setWorkspaceState: state.setWorkspaceState,
      resetWorkspace: state.resetWorkspace,
      restoreWorkspace: state.restoreWorkspace,
      markResultReady: state.markResultReady,
      provider: state.provider,
    }))
  );
  const abortRef = useRef<AbortController | null>(null);
  const currentHistoryIdRef = useRef<string | null>(null);

  // 接力：紫微目标接收。紫微无 AI 顾问，承接语义为「生成命盘即完成接力」（区别于八字的顾问追问）。
  const relay = useRelayReceive('destiny');

  // 主题解析：手动偏好 > 跟随系统（暗→夜幕 / 亮→白昼），仅作用于结果步
  const ziweiThemePref = useZiweiThemeStore((s) => s.pref);
  const clearZiweiThemePref = useZiweiThemeStore((s) => s.clearPref);
  const systemResolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const ziweiTheme = resolveZiweiTheme(ziweiThemePref, systemResolvedTheme);
  const resultNight = step === 'result' && ziweiTheme === 'night';

  // 全局明暗切换时释放紫微手动锁定，重新跟随系统（暗→夜幕 / 亮→白昼）
  // 避免 localStorage 里残留的 pref=day 在切到全局暗色后仍钉死白昼
  const prevSystemThemeRef = useRef(systemResolvedTheme);
  useEffect(() => {
    if (prevSystemThemeRef.current === systemResolvedTheme) return;
    prevSystemThemeRef.current = systemResolvedTheme;
    clearZiweiThemePref();
  }, [systemResolvedTheme, clearZiweiThemePref]);

  useEffect(() => {
    onLoadingChange?.(blockingLoading);
  }, [blockingLoading, onLoadingChange]);

  // 紫微结果步:按解析主题给 <html> 挂昼/夜标记——窗口级滚动条与 --zw-* 令牌随之切换
  // (Portal 渲染的 Popover/Dialog 在 body 下,根作用域使其天然继承主题)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('ziwei-night-root', resultNight);
    root.classList.toggle('ziwei-day-root', step === 'result' && !resultNight);
    return () => root.classList.remove('ziwei-night-root', 'ziwei-day-root');
  }, [step, resultNight]);

  useEffect(() => {
    if (isActive) restoreWorkspace('ziwei');
  }, [isActive, restoreWorkspace]);

  const isHistoryInitialized = useHistoryStore((state) => state.isInitialized);

  // 从历史记录恢复
  useEffect(() => {
    if (!isActive || !isHistoryInitialized) return;
    const params = new URLSearchParams(window.location.search);
    const historyId = params.get('historyId');
    if (!historyId) return;
    const historyItem = useHistoryStore.getState().getItemById(historyId);
    if (historyItem?.type !== 'destiny' || historyItem.subType !== 'ziwei') return;
    const savedReportData = historyItem.reportData as Record<string, unknown> | null;
    const savedReport = savedReportData?.report as never;
    const savedChartData = (savedReportData?.chartData as never) || null;
    setWorkspaceState('ziwei', {
      step: 'result',
      lastView: 'result',
      hasResult: true,
      blockingLoading: false,
      streaming: false,
      error: null,
      errorKind: null,
      report: savedReport,
      chartData: savedChartData,
      lockedSections: (savedReportData?.lockedSections as ZiweiLockedSections) || {},
      streamStatus: null,
      tab: 'overview',
      activePalaceLabel: '命宫',
      formData: (historyItem.formData as BaziFormData) || formData,
      fieldErrors: {},
    });
    // 恢复完成后清理 URL 中的 historyId，避免刷新或切换 tab 时重复触发
    const url = new URL(window.location.href);
    url.searchParams.delete('historyId');
    window.history.replaceState({}, '', url.toString());
    // formData 仅用作后备值，历史记录恢复以 item.formData 为准
    // setWorkspaceState 为 Zustand 稳定引用
  }, [isActive, isHistoryInitialized]);

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
    currentHistoryIdRef.current = generateUUID();

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
      const response = await authFetch('/api/destiny/ziwei-report', {
        method: 'POST',
        body: JSON.stringify({ ...mapFormToBaziRequest(formData), provider }),
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

          // 保存到历史记录（包含 chartData 和 lockedSections 以便恢复时重建完整状态）
          const currentState = useDestinyWorkspaceStore.getState().ziwei;
          const enhancedReportData = {
            report: event.report,
            chartData: currentState.chartData,
            lockedSections: currentState.lockedSections,
          };
          const previewText =
            event.report.coreTone?.headline ||
            event.report.coreTone?.description ||
            '紫微斗数星盘分析';
          const historyItem = createDestinyHistoryItem(
            'ziwei',
            formData as unknown as Record<string, unknown>,
            enhancedReportData as unknown as Record<string, unknown>,
            'doubao-seed-2-0',
            {
              id: currentHistoryIdRef.current || undefined,
              title: `${formData.name}的紫微斗数命理报告`,
              preview: previewText.slice(0, 150),
              coreTone: event.report.coreTone?.tag || '紫微斗数',
              // 接力派生：记录来源（REQ-013）；紫微无顾问，生成命盘即完成接力
              derivation: relay.prepareExecution(),
            }
          );
          useHistoryStore.getState().addItem(historyItem);
          // 紫微承接语义：生成命盘成功即完成接力（清引用+草稿，REQ-016/§4.6.4 紫微裁剪）
          relay.commitExecution();
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
    <DestinyPageScaffold withNavOffset tone="violet" night={resultNight}>
      <div className="relative h-full min-h-0 w-full overflow-hidden">
        <div className="relative flex h-full min-h-0 flex-col p-4 sm:p-6">
          {step === 'form' && (
            <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                    紫微斗数星盘
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
                    信息输入
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  填写生辰信息，系统将排布十二宫位并生成 AI 深度解读
                </p>
              </div>
            </header>
          )}

          <div className={cn('relative min-h-0 flex-1', step === 'form' && 'mt-4 sm:mt-6')}>
            <div
              className={cn(
                'absolute inset-0 min-h-0 overflow-y-auto pr-1 custom-scrollbar',
                stepTransitionClass,
                step === 'form'
                  ? 'pointer-events-auto z-10 opacity-100 translate-y-0'
                  : 'pointer-events-none z-0 opacity-0 translate-y-2 motion-reduce:translate-y-0'
              )}
              style={stepTransitionStyle}
              aria-hidden={step !== 'form'}
            >
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
              <div
                className={cn(
                  daylightPanelClass,
                  'mt-6 border-amber-500/20 bg-amber-50/80 p-4 dark:border-amber-500/25 dark:bg-amber-950/30'
                )}
              >
                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                  性别至关重要，男女大运走向完全相反。出生时间精确到分钟最佳，若只知道大致时辰，结果仅供参考。建议提供出生地点（精确到市），用于校正真太阳时。
                </p>
              </div>
            </div>

            <div
              className={cn(
                'absolute inset-0 h-full min-h-0 w-full',
                stepTransitionClass,
                step === 'result'
                  ? 'pointer-events-auto z-10 opacity-100 translate-y-0'
                  : 'pointer-events-none z-0 opacity-0 translate-y-2 motion-reduce:translate-y-0'
              )}
              style={stepTransitionStyle}
              aria-hidden={step !== 'result'}
            >
              {/* 主题背景层:夜幕铺星点(白昼问命,夜幕观星);白昼铺暖纸渐变,
                  覆盖暗色系统下 ambient 白昼层的 dark 变体,避免白昼面板浮于黑底。
                  页面底色已由 DestinyAmbientBackground 提供,此处仅作主题补充层,不带边框/外发光 */}
              {resultNight && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                  <NightSky density="page" />
                </div>
              )}
              {step === 'result' && !resultNight && (
                <div
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(165deg,#FDFCF9_0%,#F7F5EF_50%,#F3F1EA_100%)]"
                  aria-hidden
                />
              )}
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
          </div>
        </div>
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

  const timeline = useMemo(
    () => lockedSections.timeline ?? report?.timeline ?? [],
    [lockedSections.timeline, report?.timeline]
  );
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

  // 宫位在非「命理总论」Tab 下被选中时,给总论 Tab 挂未读金点,避免联动无感知
  const [palaceUnread, setPalaceUnread] = useState(false);
  const handlePalaceSelect = (label: string) => {
    if (tab !== 'overview') setPalaceUnread(true);
    onPalaceLabelChange(label);
  };
  const handleTabChange = (next: PanelTab) => {
    if (next === 'overview') setPalaceUnread(false);
    onTabChange(next);
  };

  const progressText =
    streaming && chartData
      ? `AI 正在解读星盘${streamStatus ? ` · ${STREAM_STATUS_TEXT[streamStatus] ?? ''}` : ''}`
      : chartData
        ? '基于精确星盘数据的 AI 深度人生轨迹分析'
        : '正在计算紫微斗数星盘…';

  return (
    <div className="relative h-full w-full overflow-y-auto pr-1 custom-scrollbar ziwei-night-scrollbar">
      <div className="flex flex-col gap-4 sm:gap-6">
        {/* 结果页头(紫微专属,不复用共享 DestinyResultHeader) */}
        <header
          className={cn(
            panelClass,
            'flex shrink-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6'
          )}
        >
          <span className="zw-gold-divider" aria-hidden />
          <div className="relative z-10 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="zw-text-1 font-song text-2xl font-bold tracking-tight sm:text-3xl">
                <GlossaryTooltip term="紫微" chartData={chartData ?? undefined}>
                  AI 紫微斗数
                </GlossaryTooltip>
              </h1>
              <span className="zw-violet-badge">星盘全景视图</span>
            </div>
            <div className="zw-text-3 mt-2 flex items-center gap-2 text-sm leading-relaxed">
              {streaming && chartData && (
                <span className="zw-pulse-dot animate-pulse" />
              )}
              {progressText}
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
            <ZiweiThemeToggle />
            <button type="button" onClick={onRecalculate} className={goldBtnClass}>
              重新排盘
            </button>
          </div>
        </header>

        {!hasData && (
          <div className={cn(panelClass, 'flex flex-col items-center gap-4 p-10 text-center')}>
            {/* 星盘仪加载指示:双环对旋 + 呼吸核 */}
            <div className="relative h-16 w-16" aria-hidden>
              <div
                className="absolute inset-0 rounded-full border border-[color:var(--zw-gold-a30)]"
                style={{ animation: 'ziwei-spin-slow 8s linear infinite' }}
              />
              <div
                className="absolute inset-2 rounded-full border border-dashed border-[color:var(--zw-violet-a40)]"
                style={{ animation: 'ziwei-spin-rev 12s linear infinite' }}
              />
              <div
                className="absolute inset-0 m-auto h-2 w-2 animate-pulse rounded-full"
                style={{ background: 'var(--zw-gold)', boxShadow: '0 0 10px var(--zw-gold-glow-strong)' }}
              />
            </div>
            <div className="zw-text-1 font-song text-lg font-bold">正在排布紫微星盘</div>
            <p className="zw-text-3 text-sm">
              排盘引擎正在计算您的精准星盘数据,请稍候…
            </p>
          </div>
        )}

        {chartData && (
          <>
            {/* 命牒头部 */}
            <ZiweiChartHeader
              chart={chartData}
              name={formData.name}
              gender={formData.gender}
              onSelectPalace={handlePalaceSelect}
            />

            {/* 主体:星盘 + 右侧面板 */}
            <div className="grid grid-cols-12 gap-4 sm:gap-6">
              {/* 左侧:星盘网格 + 模块卡片 */}
              <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
                {/* 星盘网格 */}
                <ZiweiPalaceGrid
                  chart={chartData}
                  activePalaceLabel={activePalaceLabel}
                  onPalaceSelect={handlePalaceSelect}
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

              {/* 右侧面板(桌面端吸附跟随滚动) */}
              <div className="col-span-12 xl:col-span-4 xl:self-start xl:sticky xl:top-0">
                <RightPanel
                  tab={tab}
                  activePalaceLabel={activePalaceLabel}
                  activeAnalysis={activeAnalysis}
                  chartData={chartData}
                  timeline={timeline}
                  relations={relations}
                  streaming={streaming}
                  palaceUnread={palaceUnread}
                  onTabChange={handleTabChange}
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
  { key: 'personality', label: '性格特质', Icon: PersonalityIcon, accent: 'personality' },
  { key: 'career', label: '事业发展', Icon: Briefcase, accent: 'career' },
  { key: 'wealth', label: '财运运势', Icon: Wallet, accent: 'wealth' },
  { key: 'love', label: '感情婚姻', Icon: Heart, accent: 'love' },
  { key: 'health', label: '健康运势', Icon: HeartPulse, accent: 'health' },
] as const;

type ModuleAccent = (typeof MODULE_DEFAULTS)[number]['accent'];

/** 模块强调色 → 双主题令牌（夜幕高亮 / 白昼 600 深档，由 ziwei-theme.css 承载） */
const ACCENT_VAR: Record<ModuleAccent, { solid: string; a15: string; a33: string }> = {
  personality: { solid: 'var(--zw-acc-personality)', a15: 'var(--zw-acc-personality-a15)', a33: 'var(--zw-acc-personality-a33)' },
  career: { solid: 'var(--zw-acc-career)', a15: 'var(--zw-acc-career-a15)', a33: 'var(--zw-acc-career-a33)' },
  wealth: { solid: 'var(--zw-acc-wealth)', a15: 'var(--zw-acc-wealth-a15)', a33: 'var(--zw-acc-wealth-a33)' },
  love: { solid: 'var(--zw-acc-love)', a15: 'var(--zw-acc-love-a15)', a33: 'var(--zw-acc-love-a33)' },
  health: { solid: 'var(--zw-acc-health)', a15: 'var(--zw-acc-health-a15)', a33: 'var(--zw-acc-health-a33)' },
};

const MODULE_TONE_MAP: Record<
  (typeof MODULE_DEFAULTS)[number]['key'],
  { card: string; orb: string }
> = {
  personality: {
    card: 'zw-card-acc-personality',
    orb: 'from-amber-400/15 to-orange-400/10',
  },
  career: {
    card: 'zw-card-acc-career',
    orb: 'from-sky-400/15 to-cyan-400/10',
  },
  wealth: {
    card: 'zw-card-acc-wealth',
    orb: 'from-emerald-400/15 to-teal-400/10',
  },
  love: {
    card: 'zw-card-acc-love',
    orb: 'from-rose-400/15 to-pink-400/10',
  },
  health: {
    card: 'zw-card-acc-health',
    orb: 'from-teal-400/15 to-cyan-300/5',
  },
};

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
function renderAdvantagesAndSuggestions(data: DestinyModule, accentColor: string) {
  // 新格式优先：各取 1 条，与设计图一致
  if (data.advantages?.length || data.suggestions?.length) {
    return (
      <div className="mt-3 space-y-1.5">
        {data.advantages?.slice(0, 1).map((text, i) => (
          <p
            key={`adv-${i}`}
            className="zw-text-2b mt-3 text-sm leading-relaxed"
          >
            <span className="font-bold" style={{ color: accentColor }}>
              优势：
            </span>
            {text}
          </p>
        ))}
        {data.suggestions?.slice(0, 1).map((text, i) => (
          <p
            key={`sug-${i}`}
            className="zw-text-2b text-sm leading-relaxed"
          >
            <span className="font-bold" style={{ color: accentColor }}>
              建议：
            </span>
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
            <p key={i} className="zw-text-2b text-sm leading-relaxed">
              {p.label ? (
                <>
                  <span className="font-bold" style={{ color: accentColor }}>
                    {p.label}：
                  </span>
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
          <p
            key={`adv-${i}`}
            className="zw-text-2 relative z-10 mt-3 text-sm leading-relaxed"
          >
            <span className="font-bold" style={{ color: accentColor }}>
              优势：
            </span>
            {text}
          </p>
        ))}
        {suggestions.map((text, i) => (
          <p
            key={`sug-${i}`}
            className="zw-text-2 relative z-10 text-sm leading-relaxed"
          >
            <span className="font-bold" style={{ color: accentColor }}>
              建议：
            </span>
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
    return { ...def, data, tone: MODULE_TONE_MAP[def.key], accentVar: ACCENT_VAR[def.accent] };
  });

  // 平衡网格:lg 下 6 列,前三卡各占 2 列、后两卡各占 3 列,消除 3+2 缺角
  const spanClass = (index: number) =>
    index < 3 ? 'lg:col-span-2' : 'lg:col-span-3';
  const lastSpanClass = 'sm:col-span-2 lg:col-span-3';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-6">
      {moduleList.map((item, index) => (
        <div
          key={item.key}
          className={cn(
            moduleCardClass,
            item.tone.card,
            index === moduleList.length - 1 ? lastSpanClass : spanClass(index)
          )}
          style={{ animation: `ziwei-fade-up 0.5s cubic-bezier(0.2,0.8,0.2,1) ${index * 60}ms both` }}
        >
          {/* 顶部鎏金高光切线 */}
          <span className="zw-gold-divider-soft" aria-hidden />
          {/* 右上背光晕(hover 显色) */}
          <span
            className={cn(
              'pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br opacity-25 blur-3xl transition-opacity duration-200 group-hover:opacity-55',
              item.tone.orb
            )}
            aria-hidden
          />
          {item.data ? (
            <>
              {/* 图标 + 标题 */}
              <div className="mb-3 flex items-center gap-2">
                <item.Icon
                  className="h-5 w-5"
                  style={{ color: item.accentVar.solid, filter: `drop-shadow(0 0 8px ${item.accentVar.a33})` }}
                  strokeWidth={2}
                />
                <span className="relative z-10 font-song text-sm font-bold" style={{ color: item.accentVar.solid }}>
                  {item.label}
                </span>
              </div>

              {/* 宫位描述(副标题)——仅当 title 不等于模块名时显示,避免重复 */}
              {item.data.title && item.data.title !== item.label && (
                <div
                  className="relative z-10 mb-2 font-song text-sm font-bold"
                  style={{ color: item.accentVar.solid }}
                >
                  {item.data.title}
                </div>
              )}

              {/* 核心描述(一句话概括) */}
              <p className="zw-text-2 relative z-10 text-sm leading-relaxed">
                {item.data.summary}
              </p>

              {/* 优势 / 建议 分行展示(各最多 1 条,与设计图一致) */}
              {renderAdvantagesAndSuggestions(item.data, item.accentVar.solid)}
            </>
          ) : streaming ? (
            <ModuleSkeleton label={item.label} accentA15={item.accentVar.a15} />
          ) : (
            <ModuleEmpty label={item.label} accent={item.accentVar.solid} accentA15={item.accentVar.a15} />
          )}
        </div>
      ))}
    </div>
  );
}

function ModuleSkeleton({ label, accentA15 }: { label: string; accentA15: string }) {
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-5 w-5 animate-pulse rounded"
          style={{ backgroundColor: accentA15 }}
        />
        <div className="zw-skeleton h-4 w-16 animate-pulse rounded" />
      </div>
      <div className="zw-skeleton-soft mb-2 h-4 w-24 animate-pulse rounded" />
      <div className="zw-skeleton-soft h-3 w-full animate-pulse rounded" />
      <div className="zw-skeleton-soft mt-2 h-3 w-5/6 animate-pulse rounded" />
    </>
  );
}

/** 流式结束后某模块未生成(服务端降级)时的空态,避免骨架屏永转 */
function ModuleEmpty({ label, accent, accentA15 }: { label: string; accent: string; accentA15: string }) {
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex h-5 w-5 items-center justify-center rounded"
          style={{ backgroundColor: accentA15 }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        </span>
        <span className="font-song text-sm font-bold" style={{ color: accent }}>
          {label}
        </span>
      </div>
      <p className="zw-text-4 text-xs leading-relaxed">
        本次解析未生成该模块内容，可重新排盘再试
      </p>
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
  /** 宫位在其他 Tab 下被选中时,给「命理总论」挂未读金点 */
  palaceUnread: boolean;
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
  palaceUnread,
  onTabChange,
}: RightPanelProps) {
  return (
    <section
      className={cn(
        panelClass,
        'flex flex-col overflow-hidden xl:max-h-[calc(100vh-12rem)]'
      )}
    >
      <span className="zw-gold-divider" aria-hidden />

      {/* 鎏金下划线 Tab 栏(替代白底胶囊,修复 data-state 激活态失效问题) */}
      <div className="flex shrink-0 items-end border-b border-[color:var(--zw-border-subtle)] px-2" role="tablist">
        {TAB_OPTIONS.map((option) => {
          const active = tab === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(option.key)}
              className={cn(
                'relative rounded-t-lg px-3 pb-3 pt-4 font-song text-[13px] font-bold transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--zw-violet-a60)]',
                active ? 'zw-text-gold' : 'zw-text-3 zw-text-3-hover'
              )}
            >
              {option.label}
              {option.key === 'overview' && palaceUnread && (
                <span className="zw-unread-dot" aria-label="宫位解析已更新" />
              )}
              {active && <span className="zw-tab-underline" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="custom-scrollbar ziwei-night-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
        {tab === 'overview' && (
          <OverviewTab
            activeAnalysis={activeAnalysis}
            activePalaceLabel={activePalaceLabel}
            chartData={chartData}
            streaming={streaming}
          />
        )}
        {tab === 'timeline' && <TimelineTab timeline={timeline} streaming={streaming} />}
        {tab === 'relations' && <RelationsTab relations={relations} streaming={streaming} />}
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
  streaming,
}: {
  activeAnalysis: ZiweiPalaceAnalysis | undefined;
  activePalaceLabel: string;
  chartData: ZiweiChartData;
  streaming: boolean;
}) {
  const summary = activeAnalysis?.summary;
  const suggestions = activeAnalysis?.suggestions ?? [];
  // 空态文案分两种:流式进行中=稍候;流式已结束仍无=本次未生成(服务端降级)
  const summaryFallback = streaming
    ? 'AI 正在分析当前宫位的星曜组合与格局,请稍候…'
    : '本次解析未生成该宫位的总论内容,可结合星盘与下方模块卡查看解读';

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
      <div className="zw-text-gold font-song text-xs font-bold tracking-wide">
        当前宫位 · {activePalaceLabel}
      </div>
      <div className="zw-text-1 font-song text-base font-bold">
        AI 紫微格局深度解析
      </div>

      <details open className={cn(detailPanelClass, 'border-l-4 border-l-emerald-400')}>
        <summary className={cn(summaryClass, 'zw-text-pos')}>
          宫位概述
        </summary>
        <p className="zw-text-2b mt-2 text-sm leading-relaxed">
          {summary || summaryFallback}
        </p>
      </details>

      <details className={cn(detailPanelClass, 'border-l-4 border-l-sky-400')}>
        <summary className={cn(summaryClass, 'zw-text-info')}>
          主星格局
        </summary>
        <div className="mt-2 space-y-1.5">
          {mainStars.length > 0 ? (
            mainStars.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-sm">
                <span className="zw-text-1b font-song font-bold">{s.name}</span>
                {s.brightness && (
                  <span className="zw-text-3 text-xs font-bold">[{s.brightness}]</span>
                )}
                <span className="zw-text-4 text-xs">{getStarTypeLabel(s.type)}</span>
              </div>
            ))
          ) : (
            <p className="zw-text-4 text-xs">本宫无主星,借对宫星曜为用</p>
          )}
        </div>
      </details>

      <details className={cn(detailPanelClass, 'border-l-4 border-l-blue-400')}>
        <summary className={cn(summaryClass, 'zw-text-info2')}>
          辅煞影响
        </summary>
        <div className="mt-2 space-y-2">
          {(softStars.length > 0 || minorSoft.length > 0) && (
            <div>
              <div className="zw-text-info mb-1 text-[10px] font-bold">
                吉星 / 辅星
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...softStars, ...minorSoft].map((s) => (
                  <span
                    key={s.name}
                    className="zw-text-info rounded-md border border-[color:var(--zw-info-a20)] bg-[color:var(--zw-info-a10)] px-2 py-0.5 text-xs"
                  >
                    {s.name}
                    {s.brightness && (
                      <span className="ml-0.5 text-[9px] opacity-60">[{s.brightness}]</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(toughStars.length > 0 || minorTough.length > 0) && (
            <div>
              <div className="zw-text-danger mb-1 text-[10px] font-bold">
                煞星 / 忌星
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...toughStars, ...minorTough].map((s) => (
                  <span
                    key={s.name}
                    className="zw-text-danger rounded-md border border-[color:var(--zw-acc-love-a20)] bg-[color:var(--zw-acc-love-a10)] px-2 py-0.5 text-xs"
                  >
                    {s.name}
                    {s.brightness && (
                      <span className="ml-0.5 text-[9px] opacity-60">[{s.brightness}]</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {softStars.length === 0 &&
            minorSoft.length === 0 &&
            toughStars.length === 0 &&
            minorTough.length === 0 && <p className="zw-text-4 text-xs">暂无辅煞星曜影响</p>}
        </div>
      </details>

      <details className={cn(detailPanelClass, 'border-l-4 border-l-violet-400')}>
        <summary className={cn(summaryClass, 'zw-text-violet-soft')}>
          四化分析
        </summary>
        <div className="mt-2 space-y-1.5">
          {sihuaItems.map((item) => {
            const isInCurrentPalace = item.palaceName === activePalaceLabel;
            return (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                <span className="zw-text-1b min-w-[3em] font-song font-bold">
                  {item.label}
                </span>
                <span className="zw-text-2b">{item.star || '—'}</span>
                {item.palaceName && (
                  <span
                    className={isInCurrentPalace ? 'zw-text-violet-soft font-bold' : 'zw-text-3'}
                  >
                    ({item.palaceName})
                  </span>
                )}
                {isInCurrentPalace && (
                  <span className="zw-text-violet-soft rounded bg-[color:var(--zw-violet-deep-a15)] px-1.5 py-px text-[9px] font-bold">
                    入本宫
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </details>

      <details className={cn(detailPanelClass, 'border-l-4 border-l-amber-400')}>
        <summary className={cn(summaryClass, 'zw-text-warn')}>
          三方四正联动
        </summary>
        <div className="zw-text-2b mt-2 text-sm">
          {tripartite ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="zw-text-1b min-w-[3em] font-song text-xs font-bold">
                  对宫
                </span>
                <span className="zw-text-3">{tripartite.opposite}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="zw-text-1b min-w-[3em] font-song text-xs font-bold">
                  三合
                </span>
                <span className="zw-text-3">
                  {tripartite.tri[0]} · {tripartite.tri[1]}
                </span>
              </div>
            </div>
          ) : (
            <p className="zw-text-4 text-xs">暂无三方四正数据</p>
          )}
        </div>
      </details>

      {suggestions.length > 0 && (
        <details open className={cn(detailPanelClass, 'border-l-4 border-l-emerald-400')}>
          <summary className={cn(summaryClass, 'zw-text-pos')}>
            行动建议
          </summary>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((item, i) => (
              <li
                key={i}
                className="zw-text-2b flex items-start gap-2 text-xs"
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
    // 流式结束后仍无数据(服务端降级)时显示空态,不再空转骨架屏
    if (!streaming) {
      return (
        <div className={cn(detailPanelClass, 'p-4 text-center')}>
          <p className="zw-text-4 text-xs leading-relaxed">
            本次解析未生成大限流年内容，可查看命理总论与星曜百科
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={cn(detailPanelClass, 'p-4')}>
            <div className="zw-skeleton h-3 w-16 animate-pulse rounded" />
            <div className="zw-skeleton mt-2 h-4 w-28 animate-pulse rounded" />
            <div className="zw-skeleton-soft mt-2 h-3 w-full animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <details key={item.year ?? idx} open className={cn(detailPanelClass, 'p-4')}>
          <summary className={cn(summaryClass, 'py-0 sm:py-0')}>
            <div className="zw-text-3 text-xs">{item.year}年</div>
            <div className="zw-text-1 mt-1 font-song text-sm font-bold">
              {item.title}
            </div>
            <p className="zw-text-2b mt-1 text-xs">{item.summary}</p>
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
    opportunities: 'border-l-4 border-l-emerald-400 bg-[color:var(--zw-acc-wealth-a07)]',
    risks: 'border-l-4 border-l-rose-400 bg-[color:var(--zw-acc-love-a07)]',
    actions: 'border-l-4 border-l-sky-400 bg-[color:var(--zw-info-a07)]',
  };
  const titleColors = {
    opportunities: 'zw-text-pos',
    risks: 'zw-text-danger',
    actions: 'zw-text-info',
  };
  const dotColors = {
    opportunities: 'bg-emerald-400',
    risks: 'bg-rose-400',
    actions: 'bg-blue-400',
  };

  return (
    <div className={cn('rounded-xl border border-[color:var(--zw-border-subtle)] p-3', colors[type])}>
      <div className={cn('text-[11px] font-bold', titleColors[type])}>{title}</div>
      <ul className="mt-1 space-y-1">
        {(items ?? []).map((x, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 h-1 w-1 flex-shrink-0 rounded-full ${dotColors[type]}`} />
            <span className="zw-text-2">{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 六亲缘分标签页 ───

function RelationsTab({ relations, streaming }: { relations: unknown; streaming: boolean }) {
  const data = relations as
    | { summary?: string; opportunities?: string[]; risks?: string[]; actions?: string[] }
    | undefined;
  // 流式结束后仍无内容时给出明确缺省文案,避免「请稍候」空等
  const summaryFallback = streaming
    ? 'AI 正在分析您的六亲缘分,请稍候…'
    : '本次解析未生成六亲缘分内容,可查看命理总论与大限流年';

  return (
    <>
      <div className="zw-text-1 font-song text-base font-bold">六亲关系建议</div>
      <p className="zw-text-2b text-sm leading-relaxed">
        {data?.summary || summaryFallback}
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
    actions: 'border-l-sky-400',
  };
  const labelColors = {
    opportunities: 'zw-text-pos',
    risks: 'zw-text-danger',
    actions: 'zw-text-info',
  };
  const dotColors = {
    opportunities: 'bg-emerald-400',
    risks: 'bg-rose-400',
    actions: 'bg-blue-400',
  };

  return (
    <details open className={cn(detailPanelClass, 'border-l-4', leftBarColors[type])}>
      <summary className={cn(summaryClass, labelColors[type])}>
        {title}
      </summary>
      <ul className="mt-2 space-y-1.5">
        {(items?.length ? items : [fallback]).map((item, i) => (
          <li key={i} className="zw-text-2b flex items-start gap-2 text-xs">
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
  命宫: '影响你的核心性格',
  官禄: '影响你的事业发展',
  财帛: '影响你的财运理财',
  夫妻: '影响你的感情婚姻',
  疾厄: '影响你的健康状况',
  迁移: '影响你的外出运势',
  仆役: '影响你的人际关系',
  交友: '影响你的人际关系',
  兄弟: '影响你的兄弟姐妹',
  子女: '影响你的子女运势',
  田宅: '影响你的家庭房产',
  福德: '影响你的精神福气',
  父母: '影响你的父母长辈',
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

// ─── 庙旺落陷颜色映射（双主题令牌类） ───

function getBrightnessColorClass(brightness: string): string {
  switch (brightness) {
    case '庙':
      return 'zw-bri-miao';
    case '旺':
      return 'zw-bri-wang';
    case '得':
      return 'zw-bri-de';
    case '利':
      return 'zw-bri-li';
    case '平':
      return 'zw-bri-ping';
    case '闲':
      return 'zw-bri-xian';
    case '陷':
      return 'zw-bri-xian2';
    case '不':
      return 'zw-bri-bu';
    default:
      return 'zw-bri-default';
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
      className={cn('zw-star-item', isSelected && 'zw-star-item-active')}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <GlossaryTooltip term={star.name} side="right" chartData={chartData}>
          <span className="zw-text-1b cursor-help border-b border-dotted border-[color:var(--zw-gold-a30)] font-song text-sm font-bold">
            {star.name}
          </span>
        </GlossaryTooltip>
        <span className="zw-text-3 rounded-md bg-[color:var(--zw-surface-4)] px-1.5 py-px text-[10px]">
          {typeLabel[star.type] ?? star.type}
        </span>
        {star.brightness && (
          <span className="zw-text-3 text-[10px]">
            亮度：<span className={`font-bold ${brightnessColor}`}>{star.brightness}</span>
          </span>
        )}
      </div>
      {/* 小白友好：宫位 + 影响描述 */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="zw-text-violet-soft rounded bg-[color:var(--zw-violet-a10)] px-1.5 py-px text-[10px] font-medium">
          {star.palaceName}宫
        </span>
        <span className="zw-text-4 text-[10px]">{influence}</span>
      </div>
    </button>
  );
}

// ─── 星曜百科标签页 ───

// ─── 星曜入门帮助弹窗 ───

function StarIntroDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'zw-dialog max-h-[80vh] max-w-md overflow-y-auto rounded-[24px]'
        )}
      >
        <span className="zw-gold-divider-soft" aria-hidden />
        <DialogTitle className="zw-text-1 font-song text-base font-bold">
          星曜入门指南
        </DialogTitle>
        <DialogDescription className="sr-only">紫微斗数星曜基础知识介绍</DialogDescription>

        <div className="zw-text-2b mt-2 space-y-5 text-sm">
          <section>
            <h4 className="zw-text-1b mb-2 font-song text-sm font-bold">
              什么是星曜？
            </h4>
            <p className="leading-relaxed">
              星曜就像你命盘里的「性格演员」，每颗星都有自己独特的脾气和本领。
              它们分布在你人生的不同领域（事业、感情、健康等），决定了你在这些方面的天生倾向。
            </p>
          </section>

          {/* 十四主星分类 */}
          <section>
            <h4 className="zw-text-1b mb-2 font-song text-sm font-bold">
              十四主星的四大类型
            </h4>
            <div className="space-y-2">
              <div className="rounded-lg bg-[color:var(--zw-acc-personality-a08)] p-2.5">
                <div className="text-xs font-bold" style={{ color: 'var(--zw-acc-personality)' }}>领导型</div>
                <p className="mt-0.5 text-xs">紫微、天府、武曲、天相 — 天生有管理和统筹能力</p>
              </div>
              <div className="rounded-lg bg-[color:var(--zw-acc-love-a08)] p-2.5">
                <div className="zw-text-danger text-xs font-bold">开创型</div>
                <p className="mt-0.5 text-xs">七杀、破军、廉贞、贪狼 — 敢闯敢拼，善于开创新局面</p>
              </div>
              <div className="rounded-lg bg-[color:var(--zw-info-a08)] p-2.5">
                <div className="zw-text-info text-xs font-bold">支援型</div>
                <p className="mt-0.5 text-xs">太阳、巨门、天机 — 善于沟通、分析和技术支持</p>
              </div>
              <div className="rounded-lg bg-[color:var(--zw-acc-wealth-a08)] p-2.5">
                <div className="zw-text-pos text-xs font-bold">
                  合作型
                </div>
                <p className="mt-0.5 text-xs">天同、太阴、天梁 — 温和细腻，善于协调和照顾他人</p>
              </div>
            </div>
          </section>

          {/* 庙旺落陷白话解释 */}
          <section>
            <h4 className="zw-text-1b mb-2 font-song text-sm font-bold">
              亮度是什么意思？
            </h4>
            <p className="mb-2 text-xs leading-relaxed">
              亮度代表一颗星在你命盘中的「发挥状态」，就像演员是否演对了角色：
            </p>
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#34D399]" />
                <span>
                  <strong className="zw-text-pos">庙/旺</strong>
                  ：能量很强，这颗星的优点会非常明显
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#7DD3FC]" />
                <span>
                  <strong className="zw-text-info">得/利</strong>：能量不错，特点会正常表现出来
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#94A3B8]" />
                <span>
                  <strong className="zw-text-2b">平/闲</strong>：能量一般，特点比较温和
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#FB7185]" />
                <span>
                  <strong className="zw-text-danger">陷/不</strong>：能量较弱，容易表现出负面特点
                </span>
              </li>
            </ul>
          </section>

          {/* 宫位白话解释 */}
          <section>
            <h4 className="zw-text-1b mb-2 font-song text-sm font-bold">
              十二宫是什么？
            </h4>
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
    <div className="zw-guide-card mb-3 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--zw-violet-a15)]">
          <Sparkles className="zw-text-violet-soft h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="zw-text-1 font-song text-sm font-bold">
            小白一分钟看懂星曜
          </div>
          <p className="zw-text-3 mt-2 text-xs leading-relaxed">
            星曜就像你命盘里的「性格演员」，每颗星都有自己独特的脾气和本领。
            它们分布在你人生的不同领域（事业、感情、健康等），决定了你在这些方面的天生倾向。
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={onOpenHelp}
              className="zw-text-violet-soft flex items-center gap-1 text-xs font-medium transition-colors hover:text-[color:var(--zw-gold)]"
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
    <div ref={scrollRef} className="relative -mr-1 h-full overflow-y-auto pr-1">
      {/* 标题与搜索 */}
      <div className="zw-sticky-head sticky top-0 z-10 rounded-lg p-2">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <div className="zw-text-1 font-song text-base font-bold">
              命盘星曜详解
            </div>
            <p className="zw-text-3 mt-1 text-xs">
              点击星曜查看详细解释，也可点击命盘中的星曜名称跳转
            </p>
          </div>
          {/* <span className="zw-text-4 mb-0.5 text-xs">共{totalCount}颗星曜</span> */}
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
            className="zw-input"
          />
          <svg
            className="zw-text-4 absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
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
      <div className="mt-2 space-y-5">
        {filteredGroups.map((group) => (
          <div key={group.key}>
            <div className="mb-2.5 flex items-center gap-2">
              <span className={`text-xs ${group.color}`}>{group.icon}</span>
              <span className="zw-text-1b font-song text-sm font-bold">
                {group.label}
              </span>
              <span className="zw-text-4 text-[10px]">（共{group.items.length}颗）</span>
            </div>

            {group.items.length === 0 ? (
              <div className="zw-text-4 py-4 text-center text-xs">
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
          <div className="zw-text-4 py-10 text-center text-sm">
            未找到匹配的星曜
          </div>
        )}
      </div>

      {/* 返回顶部按钮(sticky 吸附于面板内部滚动区,不再 fixed 到全局) */}
      {showBackToTop && (
        <div className="sticky bottom-4 z-20 flex justify-end">
          <button
            onClick={scrollToTop}
            className="zw-fab"
            aria-label="返回顶部"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
        </div>
      )}

      {/* 星曜入门帮助弹窗 */}
      <StarIntroDialog open={showIntro} onOpenChange={setShowIntro} />
    </div>
  );
}

// ─── 免责声明 ───

function Disclaimer() {
  return (
    <div className={cn(panelClass, 'mt-8 p-5 text-center')}>
      <p className="zw-text-3 mx-auto max-w-2xl text-xs leading-relaxed">
        本网站基于传统紫微斗数理论与 AI
        大模型生成内容，仅供娱乐消遣之用。命运掌握在自己手中，人生的成败取决于个人的选择和努力。请理性看待，切勿迷信。本网站不提供医疗、法律、投资等专业领域的决策建议。
      </p>
    </div>
  );
}
