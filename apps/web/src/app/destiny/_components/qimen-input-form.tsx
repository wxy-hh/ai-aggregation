'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { searchCities, getPopularCities } from '@repo/shared';
import type {
  QimenAnalysisFocus,
  QimenChartMethod,
  QimenFormData,
  QimenOutputLength,
  QimenOutputStyle,
  QimenQuestionCategory,
} from './qimen-types';
import { toLocalDateTimeInputValue } from './qimen-mappers';

type QimenInputFormProps = {
  value: QimenFormData;
  submitting: boolean;
  error: string | null;
  fieldErrors: Partial<Record<keyof QimenFormData, string>>;
  onChange: <K extends keyof QimenFormData>(key: K, next: QimenFormData[K]) => void;
  onSubmit: () => void;
  onReset: () => void;
};

const categoryOptions: Array<{ value: QimenQuestionCategory; label: string }> = [
  { value: 'career', label: '事业发展' },
  { value: 'wealth', label: '财务与投资' },
  { value: 'love', label: '感情关系' },
  { value: 'health', label: '健康状态' },
  { value: 'decision', label: '重要决策' },
  { value: 'study', label: '学业进修' },
  { value: 'other', label: '其他问题' },
];

const chartMethodOptions: Array<{ value: QimenChartMethod; label: string }> = [
  { value: 'time', label: '时家奇门（推荐）' },
  { value: 'daily', label: '日家奇门' },
];

const focusOptions: Array<{ value: QimenAnalysisFocus; label: string }> = [
  { value: 'short_term', label: '短期决策（1-3个月）' },
  { value: 'long_term', label: '长期趋势（半年以上）' },
  { value: 'risk_control', label: '风险规避优先' },
];

const outputStyleOptions: Array<{ value: QimenOutputStyle; label: string }> = [
  { value: 'professional', label: '专业术语风格' },
  { value: 'plain', label: '通俗易懂风格' },
];

const outputLengthOptions: Array<{ value: QimenOutputLength; label: string }> = [
  { value: 'brief', label: '简版（快速结论）' },
  { value: 'detailed', label: '详版（完整建议）' },
];

// ---- 客户端时辰预演工具函数 ----

const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const SHI_CHEN_NAMES = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];

/** 日干序号（0=甲，基于公历 1900-01-01 = 甲戌日） */
function getDayStemIndex(date: Date): number {
  const ref = Date.UTC(1900, 0, 1);
  const days = Math.floor((date.getTime() - ref) / 86_400_000);
  return ((days % 10) + 10) % 10;
}

/** 时支序号（0=子时 23:00-00:59） */
function getHourBranchIndex(hour: number): number {
  return Math.floor(((hour + 1) % 24) / 2);
}

/** 五鼠遁：日干序号 + 时支序号 → 时干序号 */
function getShiGanIndex(dayStemIdx: number, hourBranchIdx: number): number {
  return (dayStemIdx * 2 + hourBranchIdx) % 10;
}

/** 完整时柱（如 丁巳） */
function getShiZhu(date: Date): string {
  const dayIdx = getDayStemIndex(date);
  const hourIdx = getHourBranchIndex(date.getHours());
  const ganIdx = getShiGanIndex(dayIdx, hourIdx);
  return HEAVENLY_STEMS[ganIdx] + EARTHLY_BRANCHES[hourIdx];
}

/** 时辰名称 */
function getShiChen(hour: number): string {
  return SHI_CHEN_NAMES[getHourBranchIndex(hour)];
}

/** 均时差（分钟，范围约 -16 ~ +16） */
function calcEquationOfTime(dayOfYear: number): number {
  const B = (360 * (dayOfYear - 81)) / 365;
  const rad = (B * Math.PI) / 180;
  return 9.87 * Math.sin(2 * rad) - 7.53 * Math.cos(rad) - 1.5 * Math.sin(rad);
}

/** 真太阳时修正（分钟） */
function calcSolarOffset(longitude: number, date: Date): number {
  const lonOffset = (longitude - 120) * 4; // 经度时差，分钟
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const eot = calcEquationOfTime(dayOfYear);
  return lonOffset + eot;
}

/** 格式化时间 */
function formatTimeHM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDateTimePreview(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${formatTimeHM(date)}`;
}


const panelClass =
  'relative rounded-[24px] backdrop-blur-[24px] px-4 py-4 sm:px-6 sm:py-6 overflow-hidden';

const labelClass = 'text-[13px] font-semibold text-[#475569]/90 dark:text-slate-300';
const inputClass =
  'bg-white/60 dark:bg-slate-800/60 border-white/50 dark:border-white/10 rounded-[14px] text-slate-700 dark:text-slate-100 shadow-[0_2px_8px_rgba(93,124,250,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/25 dark:focus-visible:ring-indigo-500/25 focus-visible:border-[#9BAEFF]/60 dark:focus-visible:border-indigo-500/60 focus-visible:bg-white/80 dark:focus-visible:bg-slate-800/80 transition-all duration-200 dark:placeholder:text-slate-400';

export function QimenInputForm({
  value,
  submitting,
  error,
  fieldErrors,
  onChange,
  onSubmit,
  onReset,
}: QimenInputFormProps) {
  const [copied, setCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);
  const descriptionLength = value.description.trim().length;

  // 城市搜索
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState(value.location.name);
  const cityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cityPopoverOpen && value.location.name !== cityQuery) {
      setCityQuery(value.location.name);
    }
  }, [value.location.name]);

  const cityResults = useMemo(() => {
    const q = cityQuery.trim();
    if (!q) return getPopularCities().slice(0, 8);
    return searchCities(q, 20);
  }, [cityQuery]);

  const hasExactLocation = value.location.lat != null && value.location.lon != null;

  const templateText = `测算人：小王
测何事：目前有一份稳定的工作，犹豫要不要跳槽，想测这份工作发展前景、薪资、稳定度、是否适合长期做。
现在情况：还未决定，正在纠结。
最想知道：①这份工作能不能长久稳定？②发展前景好不好，是否利于我？③薪资待遇和现在相比怎么样？`;

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(templateText);
      setCopied(true);

      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }

      copyResetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetTimerRef.current = null;
      }, 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-[24px] bg-white/78 p-4 backdrop-blur-[24px] sm:rounded-[28px] sm:p-6 md:rounded-[32px] md:p-8 dark:border dark:border-white/10 dark:bg-slate-900/70 supports-[backdrop-filter]:bg-white/72 dark:supports-[backdrop-filter]:bg-slate-900/65"
      style={{
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.4) inset, 0 8px 20px rgba(76,95,154,0.10)',
      }}
    >
      {/* 顶部边框高光 */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold tracking-tight text-[#0F172A] dark:text-slate-100 sm:text-[22px]">
            起局信息输入
          </h2>
          <p className="mt-1 text-xs text-slate-600/80 dark:text-slate-300/80 sm:text-sm">
            已自动填入当前时间，请补充地点与问题描述后开始演化
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#D5DAEB]/80 bg-[#F3F6FF] px-2.5 py-0.5 text-[10px] font-bold text-[#4969E9] sm:px-3 sm:text-xs dark:border-white/10 dark:bg-[#1E2A55] dark:text-[#9BADFF]">
          1/2
        </span>
      </div>

      <div className="relative mt-4 grid grid-cols-1 items-stretch gap-3 sm:mt-6 sm:gap-5 xl:grid-cols-2">
        <section
          className={cn(
            panelClass,
            'border border-[#D5DAEB]/70 bg-white/75 dark:border-white/10 dark:bg-slate-900/55'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">基础时空信息</h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="qimen-datetime" className={labelClass}>
                    起局时间
                  </Label>
                  <Input
                    id="qimen-datetime"
                    type="datetime-local"
                    value={value.datetime}
                    onChange={(event) => onChange('datetime', event.target.value)}
                    className={inputClass}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0 rounded-full border-white/60 bg-white/40 backdrop-blur-sm text-xs font-semibold text-[#445ECC] hover:bg-white/60 transition-all dark:border-white/10 dark:bg-slate-800/50 dark:text-indigo-400 dark:hover:bg-slate-800/70"
                  onClick={() => onChange('datetime', toLocalDateTimeInputValue(new Date()))}
                  disabled={submitting}
                >
                  当前时间
                </Button>
              </div>
              {fieldErrors.datetime ? (
                <p className="text-xs text-rose-600">{fieldErrors.datetime}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  时间决定局数与四柱，是盘局的根基
                </p>
              )}
            </div>

            {/* 时辰预演 */}
            {value.datetime && (
              <div className="rounded-2xl border border-[#D5DAEB]/70 bg-[#F3F6FF]/80 px-4 py-3 dark:border-white/10 dark:bg-[#1E2A55]/50">
                <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-1">
                  {(() => {
                    const dt = new Date(value.datetime);
                    const shiChen = getShiChen(dt.getHours());
                    const shiZhu = getShiZhu(dt);

                    if (hasExactLocation) {
                      const offsetMin = calcSolarOffset(value.location.lon!, dt);
                      const corrected = new Date(dt.getTime() + offsetMin * 60_000);
                      const correctedShiChen = getShiChen(corrected.getHours());
                      const correctedShiZhu = getShiZhu(corrected);
                      const crossBoundary = shiChen !== correctedShiChen;

                      return (
                        <>
                          <div>
                            <span className="text-xs text-[#64748B] dark:text-slate-400">北京时间</span>
                            <div className="font-bold text-slate-800 dark:text-slate-100">
                              {formatDateTimePreview(dt)}{' '}
                              <span className="text-[#3C58D8] dark:text-[#9BADFF]">{shiChen}</span>
                            </div>
                          </div>
                          <div className="hidden text-[#94A3B8] dark:text-slate-500 text-lg sm:block">→</div>
                          <div>
                            <span className="text-xs text-[#64748B] dark:text-slate-400">
                              真太阳时（{value.location.name.slice(0, 6)}）
                            </span>
                            <div
                              className={cn(
                                'font-bold',
                                crossBoundary ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'
                              )}
                            >
                              {formatDateTimePreview(corrected)}{' '}
                              <span
                                className={
                                  crossBoundary ? 'text-amber-600 dark:text-amber-400' : 'text-[#3C58D8] dark:text-[#9BADFF]'
                                }
                              >
                                {correctedShiChen}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-xs text-[#64748B] dark:text-slate-400">时柱</span>
                            <div className={cn('font-bold', crossBoundary ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100')}>
                              {crossBoundary ? shiZhu + ' → ' + correctedShiZhu : correctedShiZhu}
                            </div>
                          </div>
                          {crossBoundary && (
                            <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/40 rounded-full px-2 py-0.5">
                              ⚠ 时辰跨越！
                            </div>
                          )}
                          {offsetMin !== 0 && (
                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              经度 {(value.location.lon!).toFixed(1)}°E 修正 {offsetMin > 0 ? '+' : ''}{offsetMin.toFixed(0)} 分钟
                            </div>
                          )}
                        </>
                      );
                    }

                    return (
                      <>
                        <div>
                          <span className="text-xs text-[#64748B] dark:text-slate-400">起局时间</span>
                          <div className="font-bold text-slate-800 dark:text-slate-100">
                            {formatDateTimePreview(dt)}{' '}
                            <span className="text-[#3C58D8] dark:text-[#9BADFF]">{shiChen}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-indigo-400 dark:text-indigo-300">时柱</span>
                          <div className="font-bold text-slate-800 dark:text-slate-100">{shiZhu}</div>
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          选择城市以校准真太阳时
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className={labelClass}>地点</Label>
              <Popover open={cityPopoverOpen} onOpenChange={setCityPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={cityPopoverOpen}
                    className={cn(
                      'w-full justify-between h-10 font-normal text-sm',
                      inputClass,
                      !value.location.name && 'text-slate-400 dark:text-slate-500'
                    )}
                    disabled={submitting}
                  >
                    {value.location.name || '搜索城市'}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                  <div className="p-2">
                    <Input
                      ref={cityInputRef}
                      value={cityQuery}
                      onChange={(e) => {
                        setCityQuery(e.target.value);
                        if (hasExactLocation) {
                          onChange('location', { name: e.target.value, lat: null, lon: null });
                        }
                      }}
                      placeholder="输入城市或地区名称..."
                      className="mb-2"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto">
                      {cityResults.length > 0 ? (
                        cityResults.map((city, idx) => {
                          const isSelected =
                            hasExactLocation &&
                            value.location.lat === city.lat &&
                            value.location.lon === city.lon;
                          return (
                            <button
                              key={`${city.id}-${city.fullName}-${idx}`}
                              type="button"
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-2 min-h-[44px]',
                                isSelected
                                  ? 'bg-[#5D7CFA]/10 text-[#3C58D8] dark:bg-indigo-500/15 dark:text-indigo-300 font-medium'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                              )}
                              onClick={() => {
                                onChange('location', {
                                  name: city.fullName,
                                  lat: city.lat,
                                  lon: city.lon,
                                });
                                setCityQuery(city.fullName);
                                setCityPopoverOpen(false);
                              }}
                            >
                              {isSelected && <Check className="h-4 w-4 shrink-0 text-[#5D7CFA] dark:text-indigo-400" />}
                              <span className={cn(!isSelected && 'ml-6')}>{city.fullName}</span>
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                          未找到匹配的城市
                        </p>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {fieldErrors.location ? (
                <p className="text-xs text-rose-600">{fieldErrors.location}</p>
              ) : hasExactLocation ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  坐标 {value.location.lat?.toFixed(2)}, {value.location.lon?.toFixed(2)}
                  （用于真太阳时校准）
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  搜索并选择具体城市，用于真太阳时校准
                </p>
              )}
            </div>
          </div>
        </section>

        <section
          className={cn(
            panelClass,
            'border border-[#D5DAEB]/70 bg-white/75 dark:border-white/10 dark:bg-slate-900/55'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">问题信息</h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label className={labelClass}>问题类别</Label>
              <Select
                value={value.category}
                onValueChange={(next) => onChange('category', next as QimenQuestionCategory)}
              >
                <SelectTrigger className={cn(inputClass, 'h-10')}>
                  <SelectValue placeholder="选择问题类别" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="qimen-description" className={labelClass}>
                  问题描述
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-full border-white/60 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm px-3 text-[11px] font-semibold text-[#445ECC] dark:text-indigo-400 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:border-white/80 dark:hover:border-white/20 transition-all duration-200 shadow-[0_2px_8px_rgba(93,124,250,0.08)]"
                  onClick={handleCopyTemplate}
                  disabled={submitting}
                >
                  {copied ? '已复制模板' : '复制模板'}
                </Button>
              </div>
              <Textarea
                id="qimen-description"
                value={value.description}
                onChange={(event) => onChange('description', event.target.value)}
                placeholder="请尽量描述背景、目标和当前困惑（10-300字）"
                className={cn(inputClass, 'min-h-[170px] resize-y')}
                maxLength={300}
              />
              <div className="flex items-center justify-between">
                {fieldErrors.description ? (
                  <p className="text-xs text-rose-600">{fieldErrors.description}</p>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    建议写清时间范围与决策目标
                  </span>
                )}
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {descriptionLength}/300
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          className={cn(
            panelClass,
            'border border-[#D5DAEB]/70 bg-white/75 dark:border-white/10 dark:bg-slate-900/55'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">排盘参数</h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label className={labelClass}>起局方式</Label>
              <Select
                value={value.chartMethod}
                onValueChange={(next) => onChange('chartMethod', next as QimenChartMethod)}
              >
                <SelectTrigger className={cn(inputClass, 'h-10')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {chartMethodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>分析侧重</Label>
              <Select
                value={value.focus}
                onValueChange={(next) => onChange('focus', next as QimenAnalysisFocus)}
              >
                <SelectTrigger className={cn(inputClass, 'h-10')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {focusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section
          className={cn(
            panelClass,
            'border border-[#D5DAEB]/70 bg-white/75 dark:border-white/10 dark:bg-slate-900/55'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">输出偏好</h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label className={labelClass}>语言风格</Label>
              <Select
                value={value.outputStyle}
                onValueChange={(next) => onChange('outputStyle', next as QimenOutputStyle)}
              >
                <SelectTrigger className={cn(inputClass, 'h-10')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {outputStyleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>结果长度</Label>
              <Select
                value={value.outputLength}
                onValueChange={(next) => onChange('outputLength', next as QimenOutputLength)}
              >
                <SelectTrigger className={cn(inputClass, 'h-10')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {outputLengthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </div>

      {error && (
        <div className="mt-5 rounded-[20px] border border-rose-200/50 bg-gradient-to-br from-rose-50/60 via-rose-50/40 to-transparent backdrop-blur-sm px-4 py-3 text-sm text-rose-700 shadow-[0_4px_16px_rgba(244,63,94,0.08)] dark:border-rose-500/25 dark:from-rose-950/30 dark:via-rose-950/15 dark:to-transparent dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          className="min-h-11 w-full rounded-full bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] px-6 text-sm font-bold text-white shadow-[0_10px_24px_rgba(93,124,250,0.32)] transition-all duration-200 hover:brightness-[1.03] sm:w-auto"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? '演化分析中...' : '开始演化分析'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-full border-[#D5DAEB] bg-white/72 px-6 text-sm font-semibold text-slate-700 hover:bg-white/90 sm:w-auto dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
          onClick={onReset}
          disabled={submitting}
        >
          重置表单
        </Button>
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
        您的个人信息仅用于 AI 命理推算，我们不会向第三方泄露
      </p>
    </div>
  );
}
