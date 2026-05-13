'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type {
  QimenAnalysisFocus,
  QimenChartMethod,
  QimenFormData,
  QimenOutputLength,
  QimenOutputStyle,
  QimenQuestionCategory,
} from './qimen-types';

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

const panelClass = 'relative rounded-[28px] backdrop-blur-[24px] px-6 py-6 overflow-hidden';

const labelClass = 'text-[13px] font-semibold text-[#425394]/90 dark:text-slate-300';
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
      className="relative rounded-[32px] p-6 md:p-8 backdrop-blur-[32px] overflow-hidden bg-white/25 dark:bg-slate-900/40"
      style={{
        boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 24px 64px rgba(73,86,130,0.08)',
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

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-black tracking-tight text-[#1A245B] dark:text-slate-100">
            信息输入表单
          </h2>
          <p className="mt-1.5 text-sm text-slate-600/80 dark:text-slate-300/80">
            已自动填入当前时间，按实际问题补充地点与目标即可。
          </p>
        </div>
        <span className="rounded-full border border-white/60 bg-white/40 backdrop-blur-sm px-3 py-1 text-xs font-bold text-[#4B63D9] shadow-[0_2px_8px_rgba(75,99,217,0.15)] dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-200">
          Step 1 / 2
        </span>
      </div>

      <div className="relative mt-6 grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch">
        <section
          className={cn(
            panelClass,
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">基础时空信息</h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
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
              {fieldErrors.datetime && (
                <p className="text-xs text-rose-600">{fieldErrors.datetime}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="qimen-location" className={labelClass}>
                地点
              </Label>
              <Input
                id="qimen-location"
                value={value.location}
                onChange={(event) => onChange('location', event.target.value)}
                placeholder="例如：上海市浦东新区"
                className={inputClass}
              />
              {fieldErrors.location ? (
                <p className="text-xs text-rose-600">{fieldErrors.location}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  地点用于辅助判断环境变量与行动半径
                </p>
              )}
            </div>
          </div>
        </section>

        <section
          className={cn(
            panelClass,
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10'
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
                  className="h-7 rounded-full border-white/60 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm px-3 text-[11px] font-semibold text-[#445ECC] dark:text-indigo-400 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:border-white/80 dark:hover:border-white/20 transition-all duration-200 shadow-[0_2px_8px_rgba(93,124,250,0.08)]"
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
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10'
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
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10'
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
        <div className="mt-5 rounded-[20px] border border-rose-200/50 bg-gradient-to-br from-rose-50/60 via-rose-50/40 to-transparent backdrop-blur-sm px-4 py-3 text-sm text-rose-700 shadow-[0_4px_16px_rgba(244,63,94,0.08)]">
          {error}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="rounded-full bg-gradient-to-r from-[#5D7CFA] via-[#6F87FF] to-[#8190FF] px-6 py-2.5 text-white shadow-[0_8px_24px_rgba(93,124,250,0.28),0_1px_0_rgba(255,255,255,0.2)_inset] hover:shadow-[0_12px_32px_rgba(93,124,250,0.35)] hover:brightness-105 transition-all duration-300"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? '演化分析中...' : '开始演化分析'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-white/60 bg-white/40 backdrop-blur-sm text-[#4B5D9F] hover:bg-white/60 hover:border-white/80 transition-all duration-200 shadow-[0_2px_8px_rgba(93,124,250,0.08)]"
          onClick={onReset}
          disabled={submitting}
        >
          重置表单
        </Button>
      </div>
    </div>
  );
}
