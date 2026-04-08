'use client';

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

const panelClass =
  'rounded-[24px] border border-white/70 bg-white/45 backdrop-blur-xl px-5 py-5 shadow-[0_10px_35px_rgba(74,99,171,0.08),inset_1px_1px_0_rgba(255,255,255,0.8)]';

const labelClass = 'text-[13px] font-semibold text-slate-700';
const inputClass =
  'bg-white/65 border-white/60 rounded-xl shadow-[inset_2px_2px_5px_rgba(160,175,205,0.18),inset_-2px_-2px_6px_rgba(255,255,255,0.9)] focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/35';

export function QimenInputForm({
  value,
  submitting,
  error,
  fieldErrors,
  onChange,
  onSubmit,
  onReset,
}: QimenInputFormProps) {
  const descriptionLength = value.description.trim().length;

  return (
    <div className="rounded-[30px] border border-white/70 bg-white/50 p-5 md:p-7 backdrop-blur-2xl shadow-[0_20px_60px_rgba(73,86,130,0.15)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-black tracking-tight text-[#1A245B]">信息输入表单</h2>
          <p className="mt-1.5 text-sm text-slate-600">已自动填入当前时间，按实际问题补充地点与目标即可。</p>
        </div>
        <span className="rounded-full border border-white/80 bg-white/65 px-3 py-1 text-xs font-bold text-[#4B63D9] shadow-sm">
          Step 1 / 2
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch">
        <section className={panelClass}>
          <h3 className="text-sm font-bold text-slate-800">基础时空信息</h3>
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
              {fieldErrors.datetime && <p className="text-xs text-rose-600">{fieldErrors.datetime}</p>}
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
                <p className="text-xs text-slate-500">地点用于辅助判断环境变量与行动半径</p>
              )}
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <h3 className="text-sm font-bold text-slate-800">问题信息</h3>
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
              <Label htmlFor="qimen-description" className={labelClass}>
                问题描述
              </Label>
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
                  <span className="text-xs text-slate-500">建议写清时间范围与决策目标</span>
                )}
                <span className="text-xs font-medium text-slate-400">{descriptionLength}/300</span>
              </div>
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <h3 className="text-sm font-bold text-slate-800">排盘参数</h3>
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
              <Select value={value.focus} onValueChange={(next) => onChange('focus', next as QimenAnalysisFocus)}>
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

        <section className={panelClass}>
          <h3 className="text-sm font-bold text-slate-800">输出偏好</h3>
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
        <div className="mt-5 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 backdrop-blur-sm">
          {error}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="rounded-full bg-gradient-to-r from-[#3C5CFF] to-[#2B49E5] px-5 text-white shadow-[0_8px_25px_rgba(58,86,255,0.35)] hover:brightness-110"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? '演化分析中...' : '开始演化分析'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-white/80 bg-white/55 text-slate-700 hover:bg-white/80"
          onClick={onReset}
          disabled={submitting}
        >
          重置表单
        </Button>
      </div>
    </div>
  );
}
