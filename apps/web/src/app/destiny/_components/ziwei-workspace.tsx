'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BaziInputForm } from './bazi-input-form';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { createDefaultBaziFormData, mapFormToBaziRequest } from './bazi-mappers';
import type { BaziFormData } from './bazi-types';
import type { DestinyReport, DestinyReportResponse } from './types';

type Step = 'form' | 'result';
type ZiweiErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';

type ZiweiWorkspaceProps = {
  onRecalculate: () => void;
  onLoadingChange?: (loading: boolean) => void;
};

type PanelTab = 'overview' | 'timeline' | 'relations';

type PalaceViewModel = {
  key: string;
  label: string;
  branch: string;
  stars: string[];
  dominant: string;
  summary: string;
  suggestions: string[];
};

type TimelineItemViewModel = {
  year: string | number;
  title: string;
  summary: string;
  detail: {
    opportunities: string[];
    risks: string[];
    actions: string[];
  };
};

const tabOptions: Array<{ key: PanelTab; label: string }> = [
  { key: 'overview', label: '命理总论' },
  { key: 'timeline', label: '大限流年' },
  { key: 'relations', label: '六亲缘分' },
];

const palaceLabels = [
  '父母宫',
  '福德宫',
  '田宅宫',
  '官禄宫',
  '命宫',
  '兄弟宫',
  '奴仆宫',
  '夫妻宫',
  '迁移宫',
  '子女宫',
  '财帛宫',
  '疾厄宫',
];

const palaceGridAreas = [
  'col-start-1 row-start-1',
  'col-start-2 row-start-1',
  'col-start-3 row-start-1',
  'col-start-4 row-start-1',
  'col-start-1 row-start-2',
  'col-start-1 row-start-3',
  'col-start-4 row-start-2',
  'col-start-4 row-start-3',
  'col-start-1 row-start-4',
  'col-start-2 row-start-4',
  'col-start-3 row-start-4',
  'col-start-4 row-start-4',
];

const palaceToneClasses = [
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#D7C07B]/35 bg-[#FFF9EA]/88',
  'border-[#B8C4D6]/35 bg-[#F3F7FF]/88',
  'border-[#E3A59D]/35 bg-[#FFF2F0]/88',
  'border-[#A7B57B]/35 bg-[#F7FAEE]/88',
  'border-[#D7C07B]/30 bg-[#FFF8E6]/85',
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#C6B6E8]/35 bg-[#F4F0FF]/88',
  'border-[#B8C4D6]/35 bg-[#F3F7FF]/88',
  'border-[#A7B57B]/30 bg-[#F7FAEE]/85',
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#C0C9D8]/35 bg-[#F5F7FB]/88',
];

const palaceLabelToneClasses = [
  'text-[#5E769E]',
  'text-[#A7862B]',
  'text-[#657A96]',
  'text-[#B45A4C]',
  'text-[#6A7F3F]',
  'text-[#A7862B]',
  'text-[#5E769E]',
  'text-[#6956A7]',
  'text-[#5A7391]',
  'text-[#6A7F3F]',
  'text-[#5E769E]',
  'text-[#607089]',
];

const starThemeMap: Array<{ names: string[]; className: string }> = [
  { names: ['紫微'], className: 'text-[#5A4BEA]' },
  { names: ['天府'], className: 'text-[#2D7D58]' },
  { names: ['武曲'], className: 'text-[#2F5FAE]' },
  { names: ['太阳'], className: 'text-[#C77A1A]' },
  { names: ['太阴'], className: 'text-[#6B5CA5]' },
  { names: ['天机'], className: 'text-[#1F8A84]' },
  { names: ['天同'], className: 'text-[#329D7C]' },
  { names: ['廉贞'], className: 'text-[#B04A6B]' },
  { names: ['贪狼'], className: 'text-[#8B5E1A]' },
  { names: ['巨门'], className: 'text-[#4E5E7A]' },
  { names: ['天相'], className: 'text-[#3A6AA6]' },
  { names: ['天梁'], className: 'text-[#6D8A2E]' },
  { names: ['七杀'], className: 'text-[#A23A3A]' },
  { names: ['破军'], className: 'text-[#7E4AA1]' },
];

const moduleCardToneClasses = [
  'border-[#CFE0FF] bg-[#F7FAFF] shadow-[0_8px_24px_-18px_rgba(57,79,230,0.35)]',
  'border-[#D6E5F7] bg-[#F7FBFF] shadow-[0_8px_24px_-18px_rgba(37,99,235,0.28)]',
  'border-[#DDD9FF] bg-[#F9F7FF] shadow-[0_8px_24px_-18px_rgba(109,40,217,0.26)]',
];

function getStarColorClass(star: string | undefined): string {
  if (!star) return 'text-slate-800';
  for (const item of starThemeMap) {
    if (item.names.some((name) => star.includes(name))) {
      return item.className;
    }
  }
  return 'text-slate-800';
}

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

function classifyResponseError(status: number): ZiweiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429 || status >= 500) return 'model';
  return 'unknown';
}

function toDisplayError(kind: ZiweiErrorKind, fallback?: string): string {
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

export function ZiweiWorkspace({ onRecalculate, onLoadingChange }: ZiweiWorkspaceProps) {
  const [step, setStep] = useState<Step>('form');
  const [formData, setFormData] = useState<BaziFormData>(() => createDefaultBaziFormData());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof BaziFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DestinyReport | null>(null);
  const [tab, setTab] = useState<PanelTab>('overview');
  const [activePalaceLabel, setActivePalaceLabel] = useState<string>('命宫');

  const pageTitle = useMemo(
    () => (step === 'form' ? '紫微斗数排盘 · 信息输入' : 'AI 紫微斗数 · 星盘全景视图'),
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
      setError('参数错误：请先完善表单信息后再开始分析');
      return;
    }

    setSubmitting(true);
    setError(null);

    let currentErrorKind: ZiweiErrorKind = 'unknown';

    try {
      const response = await fetch('/api/destiny/ziwei-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapFormToBaziRequest(formData)),
      });

      const json = (await response.json()) as DestinyReportResponse | { error?: string };

      if (!response.ok || !('report' in json)) {
        currentErrorKind = classifyResponseError(response.status);
        throw new Error(toDisplayError(currentErrorKind, 'error' in json ? json.error : undefined));
      }

      setReport(json.report);
      setStep('result');
    } catch (nextError) {
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
      <div className="h-full w-full xl:pl-[320px]">
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
          <ZiweiResultView
            report={report}
            tab={tab}
            activePalaceLabel={activePalaceLabel}
            onTabChange={setTab}
            onPalaceLabelChange={setActivePalaceLabel}
            onRecalculate={handleRecalculate}
          />
        )}
      </div>

      {/* Loading 动画 */}
      <StarDecodeOverlay open={submitting} />
    </div>
  );
}

// 紫微结果展示组件
type ZiweiResultViewProps = {
  report: DestinyReport | null;
  tab: PanelTab;
  activePalaceLabel: string;
  onTabChange: (tab: PanelTab) => void;
  onPalaceLabelChange: (label: string) => void;
  onRecalculate: () => void;
};

function ZiweiResultView({
  report,
  tab,
  activePalaceLabel,
  onTabChange,
  onPalaceLabelChange,
  onRecalculate,
}: ZiweiResultViewProps) {
  const palaceData = useMemo<PalaceViewModel[]>(() => {
    if (!report?.ziweiPalaces?.length) return [];

    const byLabel = new Map(report.ziweiPalaces.map((item) => [item.label, item]));
    return palaceLabels
      .map((label, index) => {
        const fallback = report.ziweiPalaces?.[index];
        const palace = byLabel.get(label) ?? fallback;
        if (!palace) return null;
        return {
          key: palace.key ?? `palace-${index + 1}`,
          label,
          branch: palace.branch ?? '',
          stars: palace.stars?.slice(0, 3) ?? [],
          dominant: palace.dominant ?? palace.stars?.[0] ?? '',
          summary: palace.summary ?? '',
          suggestions: palace.suggestions?.slice(0, 4) ?? [],
        };
      })
      .filter((item): item is PalaceViewModel => item != null);
  }, [report]);

  const timeline: TimelineItemViewModel[] = report?.timeline ?? [];
  const activePalace = palaceData.find((item) => item.label === activePalaceLabel) ?? palaceData[0];

  const overviewOpportunities = activePalace?.suggestions?.slice(0, 3) ?? [];
  const overviewRisks = [
    `留意${activePalace?.label ?? '当前宫位'}主题下的情绪波动与冲动决策。`,
    '避免在同一周期内同时推进过多关键事项。',
  ];
  const overviewActions = [
    `围绕${activePalace?.label ?? '当前宫位'}设定本月一到两项核心目标。`,
    '每周复盘一次进度并修正执行节奏。',
  ];

  const relationOpportunities = report?.modules.love.bullets.slice(0, 3) ?? [];
  const relationRisks = report?.modules.health.bullets.slice(0, 3) ?? [];
  const relationActions = report?.modules.personality.bullets.slice(0, 3) ?? [];

  return (
    <div className="h-full w-full overflow-y-auto p-6">
      <div className="flex flex-col gap-6">
        <header className="flex justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
              AI 紫微斗数{' '}
              <span className="text-base text-[#394FE6] dark:text-indigo-400 font-medium">
                星盘全景视图
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              基于十四主星与宫位逻辑的深度人生轨迹预测
            </p>
          </div>
          <Button
            type="button"
            onClick={onRecalculate}
            className="rounded-full bg-[#394FE6] text-white hover:brightness-110"
          >
            重新排盘
          </Button>
        </header>

        {!report && (
          <div className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-8 shadow-sm">
            <div className="text-lg font-bold text-slate-800 dark:text-white">暂无紫微排盘数据</div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              点击"重新排盘"可基于当前信息发起紫微斗数分析。
            </p>
          </div>
        )}

        {report && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
              <div className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 p-5 backdrop-blur-xl shadow-lg">
                <div className="grid grid-cols-4 grid-rows-4 gap-3 aspect-square">
                  {palaceData.map((palace, index) => {
                    const isActive = palace.label === activePalaceLabel;
                    const toneClass = palaceToneClasses[index % palaceToneClasses.length];
                    const labelToneClass =
                      palaceLabelToneClasses[index % palaceLabelToneClasses.length];
                    const dominantColorClass = getStarColorClass(
                      palace.dominant || palace.stars[0]
                    );
                    return (
                      <button
                        key={palace.key}
                        type="button"
                        onClick={() => onPalaceLabelChange(palace.label)}
                        className={[
                          palaceGridAreas[index],
                          'rounded-2xl p-3.5 flex flex-col justify-between text-left transition border shadow-[0_6px_18px_-14px_rgba(30,41,59,0.45),inset_0_1px_0_rgba(255,255,255,0.75)]',
                          toneClass,
                          isActive
                            ? 'ring-2 ring-[#4A63EE]/35 border-[#4A63EE]/45 shadow-[0_10px_26px_-14px_rgba(59,91,246,0.46),inset_0_1px_0_rgba(255,255,255,0.84)]'
                            : 'hover:border-[#5D74EA]/35 hover:shadow-[0_12px_30px_-18px_rgba(59,91,246,0.35),inset_0_1px_0_rgba(255,255,255,0.84)]',
                        ].join(' ')}
                      >
                        <div>
                          <div className={`text-[11px] font-extrabold ${labelToneClass}`}>
                            {palace.label}
                          </div>
                          <div
                            className={`mt-1 text-xl font-black tracking-tight ${dominantColorClass}`}
                          >
                            {palace.dominant || palace.stars[0] || '主星'}
                          </div>
                          {palace.stars.length > 1 && (
                            <div className="mt-1 text-[11px] text-slate-500">
                              {palace.stars.slice(1).join(' · ')}
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400">{palace.branch}</span>
                        </div>
                      </button>
                    );
                  })}

                  <div className="col-start-2 col-span-2 row-start-2 row-span-2 rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl p-4 flex flex-col items-center justify-center text-center shadow-lg">
                    <div className="text-[42px] leading-none font-black text-slate-900 dark:text-white">
                      {report.ziweiCenter?.chartTitle ?? report.profile.name}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                      {report.profile.lunarText || report.profile.birthText}
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-4 py-2">
                        <div className="text-xs font-bold text-blue-600 dark:text-blue-400">
                          命主
                        </div>
                        <div className="text-2xl font-black text-blue-900 dark:text-blue-100 mt-0.5">
                          {report.ziweiCenter?.mingZhu ?? '紫微'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-2">
                        <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                          身主
                        </div>
                        <div className="text-2xl font-black text-amber-900 dark:text-amber-100 mt-0.5">
                          {report.ziweiCenter?.shenZhu ?? '天相'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[report.modules.personality, report.modules.career, report.modules.wealth].map(
                  (module, index) => {
                    const toneClass = moduleCardToneClasses[index % moduleCardToneClasses.length];
                    return (
                      <div
                        key={module.title}
                        className="rounded-2xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-5 transition-shadow hover:shadow-lg"
                      >
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {module.title}
                        </div>
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {module.summary}
                        </p>
                        <ul className="mt-3 space-y-1.5">
                          {module.bullets.slice(0, 3).map((item, i) => (
                            <li
                              key={`${module.title}-${i}`}
                              className="text-xs text-slate-500 dark:text-slate-400 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            <div className="col-span-12 xl:col-span-4">
              <section className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl overflow-hidden h-full min-h-[760px] flex flex-col">
                <div className="grid grid-cols-3 gap-1 p-2 bg-slate-50/50 dark:bg-slate-900/40">
                  {tabOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => onTabChange(option.key)}
                      className={[
                        'rounded-xl text-xs font-bold py-2.5 transition',
                        tab === option.key
                          ? 'bg-white dark:bg-slate-800 text-[#394FE6] dark:text-blue-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="p-5 space-y-3 flex-1 min-h-[520px] overflow-y-auto custom-scrollbar">
                  {tab === 'overview' && (
                    <>
                      <div className="text-xs font-bold text-[#394FE6] dark:text-indigo-400">
                        当前宫位 · {activePalace?.label ?? '命宫'}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        AI 紫微格局深度解析
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {activePalace?.summary || report.modules.personality.summary}
                      </p>

                      <details
                        open
                        className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          机会建议
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {overviewOpportunities.map((item, i) => (
                            <li
                              key={`ov-op-${i}`}
                              className="text-xs text-emerald-700 dark:text-emerald-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <details
                        open
                        className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-rose-700 dark:text-rose-400">
                          风险预警
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {overviewRisks.map((item, i) => (
                            <li
                              key={`ov-risk-${i}`}
                              className="text-xs text-rose-700 dark:text-rose-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <details
                        open
                        className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-blue-700 dark:text-blue-400">
                          行动清单
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {overviewActions.map((item, i) => (
                            <li
                              key={`ov-action-${i}`}
                              className="text-xs text-blue-700 dark:text-blue-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </>
                  )}

                  {tab === 'timeline' && (
                    <div className="space-y-3">
                      {timeline.map((item) => (
                        <details
                          key={item.year}
                          open
                          className="rounded-xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-800/60 backdrop-blur-sm p-3"
                        >
                          <summary className="cursor-pointer">
                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              {item.year}
                            </div>
                            <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                              {item.title}
                            </div>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                              {item.summary}
                            </p>
                          </summary>
                          <div className="mt-3 grid grid-cols-1 gap-2">
                            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 p-2">
                              <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                机会
                              </div>
                              <ul className="mt-1 space-y-1">
                                {item.detail.opportunities.map((x, i) => (
                                  <li
                                    key={`t-op-${item.year}-${i}`}
                                    className="text-xs text-emerald-700 dark:text-emerald-300 list-disc ml-4"
                                  >
                                    {x}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="rounded-lg bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 p-2">
                              <div className="text-[11px] font-bold text-rose-700 dark:text-rose-400">
                                风险
                              </div>
                              <ul className="mt-1 space-y-1">
                                {item.detail.risks.map((x, i) => (
                                  <li
                                    key={`t-risk-${item.year}-${i}`}
                                    className="text-xs text-rose-700 dark:text-rose-300 list-disc ml-4"
                                  >
                                    {x}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-2">
                              <div className="text-[11px] font-bold text-blue-700 dark:text-blue-400">
                                行动
                              </div>
                              <ul className="mt-1 space-y-1">
                                {item.detail.actions.map((x, i) => (
                                  <li
                                    key={`t-action-${item.year}-${i}`}
                                    className="text-xs text-blue-700 dark:text-blue-300 list-disc ml-4"
                                  >
                                    {x}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}

                  {tab === 'relations' && (
                    <>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        六亲关系建议
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {report.modules.love.summary}
                      </p>

                      <details
                        open
                        className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          机会建议
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {relationOpportunities.map((item, i) => (
                            <li
                              key={`rel-op-${i}`}
                              className="text-xs text-emerald-700 dark:text-emerald-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <details
                        open
                        className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-rose-700 dark:text-rose-400">
                          风险预警
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {relationRisks.map((item, i) => (
                            <li
                              key={`rel-risk-${i}`}
                              className="text-xs text-rose-700 dark:text-rose-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <details
                        open
                        className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3"
                      >
                        <summary className="cursor-pointer text-xs font-bold text-blue-700 dark:text-blue-400">
                          行动清单
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {relationActions.map((item, i) => (
                            <li
                              key={`rel-action-${i}`}
                              className="text-xs text-blue-700 dark:text-blue-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <details className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950 p-3">
                        <summary className="cursor-pointer text-xs font-bold text-violet-700 dark:text-violet-400">
                          宫位联动建议 · {activePalace?.label ?? '命宫'}
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {(activePalace?.suggestions ?? []).map((item, i) => (
                            <li
                              key={`palace-link-${i}`}
                              className="text-xs text-violet-700 dark:text-violet-300 list-disc ml-4"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
