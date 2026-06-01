'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar, Check, ChevronsUpDown, Clock, MapPin, User, Users } from 'lucide-react';
import { searchCities, getPopularCities, getLunarLeapMonth } from '@repo/shared';
import type { BaziFormData } from './bazi-types';

type BaziInputFormProps = {
  value: BaziFormData;
  submitting: boolean;
  error: string | null;
  fieldErrors: Partial<Record<keyof BaziFormData, string>>;
  onChange: <K extends keyof BaziFormData>(key: K, next: BaziFormData[K]) => void;
  onSubmit: () => void;
  onReset: () => void;
};

// 生成年份选项（最近 100 年）
const yearOptions = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);
const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const minuteOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const shellClass = cn(
  'relative overflow-hidden rounded-[32px] border border-white/60 p-4 sm:p-6 md:p-8',
  'bg-gradient-to-b from-white/72 via-white/42 to-white/16',
  'shadow-[0_20px_40px_-15px_rgba(59,130,246,0.14),0_8px_20px_-10px_rgba(0,0,0,0.05)]',
  'backdrop-blur-xl lg:backdrop-blur-2xl',
  'dark:border-white/10 dark:from-slate-900/72 dark:via-slate-900/38 dark:to-slate-900/12'
);

const panelClass = cn(
  'relative overflow-hidden rounded-3xl border border-white/55 px-4 py-4 sm:px-6 sm:py-6',
  'bg-white/70 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.05)] backdrop-blur-lg',
  'dark:border-white/10 dark:bg-slate-900/65'
);

const labelClass = 'text-xs font-semibold text-slate-500 dark:text-slate-400';

const inputClass = cn(
  'h-11 rounded-xl border-slate-200/50 bg-white/80 text-sm text-slate-700',
  'shadow-[0_1px_2px_0_rgba(0,0,0,0.03),0_1px_1px_0_rgba(0,0,0,0.02)]',
  'transition-all duration-200',
  'focus-visible:border-blue-500/50 focus-visible:bg-white/95 focus-visible:ring-2 focus-visible:ring-blue-500/10',
  'dark:border-slate-800/50 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-400',
  'dark:focus-visible:border-blue-500/50 dark:focus-visible:bg-slate-950/90'
);

const segmentListClass = cn(
  'grid h-11 grid-cols-2 rounded-xl border border-slate-200/50 bg-white/40 p-1',
  'shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] backdrop-blur-md',
  'dark:border-white/10 dark:bg-slate-900/40'
);

const segmentTriggerClass = cn(
  'rounded-lg text-sm font-semibold transition-all duration-200',
  'text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100',
  'data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm',
  'data-[state=active]:ring-1 data-[state=active]:ring-blue-500/20',
  'dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-400'
);

const popoverContentClass = cn(
  'border border-slate-200/50 bg-white/95 p-0 backdrop-blur-2xl',
  'shadow-[0_20px_40px_-15px_rgba(59,130,246,0.12),0_8px_20px_-10px_rgba(0,0,0,0.05)]',
  'dark:border-white/10 dark:bg-slate-900/95'
);

const selectContentClass = cn(
  'border border-slate-200/50 bg-white/95 backdrop-blur-2xl',
  'shadow-[0_20px_40px_-15px_rgba(59,130,246,0.12),0_8px_20px_-10px_rgba(0,0,0,0.05)]',
  'dark:border-white/10 dark:bg-slate-900/95'
);

const primaryBtnClass = cn(
  'relative min-h-11 overflow-hidden rounded-full px-6 text-sm font-semibold text-white',
  'bg-gradient-to-r from-blue-600 to-indigo-600',
  'shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  'transition-all duration-200',
  'hover:scale-[1.02] hover:shadow-[0_12px_20px_-8px_rgba(59,130,246,0.25)]',
  'active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
  'disabled:opacity-40 disabled:pointer-events-none'
);

const secondaryBtnClass = cn(
  'relative min-h-11 overflow-hidden rounded-full border border-slate-200/50 px-6 text-sm font-semibold',
  'bg-white/40 text-slate-700 backdrop-blur-xl',
  'shadow-[0_1px_2px_0_rgba(0,0,0,0.03),0_1px_1px_0_rgba(0,0,0,0.02)]',
  'transition-all duration-200',
  'hover:scale-[1.02] hover:bg-white/60 hover:shadow-[0_0_15px_rgba(59,130,246,0.15)]',
  'active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
  'dark:border-slate-800/50 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/60 dark:focus-visible:ring-offset-slate-950',
  'disabled:opacity-40 disabled:pointer-events-none'
);

const sectionTitleClass =
  'flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-200';

const iconAccentClass = 'h-4 w-4 text-blue-500 dark:text-blue-400';

export function BaziInputForm({
  value,
  submitting,
  error,
  fieldErrors,
  onChange,
  onSubmit,
  onReset,
}: BaziInputFormProps) {
  const nameLength = value.name.trim().length;
  const locationLength = value.location.name.trim().length;

  const canSubmit = useMemo(() => {
    return nameLength > 0 && locationLength > 0;
  }, [nameLength, locationLength]);

  // 城市搜索：Popover 开关 + 搜索结果
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState(value.location.name);
  const cityInputRef = useRef<HTMLInputElement>(null);

  // 父组件重置表单后，同步清空城市搜索输入
  // Popover 打开时不覆盖（用户正在自由输入）
  useEffect(() => {
    if (!cityPopoverOpen && value.location.name !== cityQuery) {
      setCityQuery(value.location.name);
    }
    // 仅在外部 value 变化时同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.location.name]);

  const cityResults = useMemo(() => {
    const q = cityQuery.trim();
    if (!q) {
      // 空输入显示热门城市
      return getPopularCities().slice(0, 8);
    }
    return searchCities(q, 20);
  }, [cityQuery]);

  const hasExactLocation = value.location.lat != null && value.location.lon != null;

  // 农历闰月检测
  const leapMonth = useMemo(() => {
    if (value.calendarType !== 'lunar') return 0;
    return getLunarLeapMonth(value.birthDate.year);
  }, [value.calendarType, value.birthDate.year]);

  // 切换年份时重置闰月状态
  const handleMonthChange = useCallback(
    (next: number) => {
      // 如果选中了闰月但该月不是当前年份的闰月，取消闰月
      const newLeap = leapMonth > 0 && next === leapMonth ? value.birthDate.isLeapMonth : false;
      onChange('birthDate', { ...value.birthDate, month: next, isLeapMonth: newLeap });
    },
    [leapMonth, onChange, value.birthDate]
  );

  return (
    <div className={shellClass}>
      {/* 顶部边框高光 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/20"
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
            生辰信息输入
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            请准确填写出生信息，AI 将生成完整命理解读
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400">
          1/2
        </span>
      </div>

      <div className="relative mt-6 grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
        {/* 基本信息 */}
        <section className={panelClass}>
          <h3 className={sectionTitleClass}>
            <User className={iconAccentClass} />
            基本信息
          </h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bazi-name" className={labelClass}>
                姓名
              </Label>
              <Input
                id="bazi-name"
                value={value.name}
                onChange={(e) => onChange('name', e.target.value)}
                placeholder="请输入您的姓名"
                className={inputClass}
                disabled={submitting}
              />
              {fieldErrors.name && <p className="text-xs text-rose-500">{fieldErrors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>
                <Users className="mr-1 inline h-4 w-4 text-blue-500" />
                性别
              </Label>
              <Tabs
                value={value.gender}
                onValueChange={(next) => onChange('gender', next as 'male' | 'female')}
              >
                <TabsList className={segmentListClass}>
                  <TabsTrigger value="male" disabled={submitting} className={segmentTriggerClass}>
                    乾（男）
                  </TabsTrigger>
                  <TabsTrigger value="female" disabled={submitting} className={segmentTriggerClass}>
                    坤（女）
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </section>

        {/* 出生日期 */}
        <section className={panelClass}>
          <h3 className={sectionTitleClass}>
            <Calendar className={iconAccentClass} />
            出生日期
          </h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label className={labelClass}>历法</Label>
              <Tabs
                value={value.calendarType}
                onValueChange={(next) => onChange('calendarType', next as 'lunar' | 'solar')}
              >
                <TabsList className={segmentListClass}>
                  <TabsTrigger value="lunar" disabled={submitting} className={segmentTriggerClass}>
                    农历
                  </TabsTrigger>
                  <TabsTrigger value="solar" disabled={submitting} className={segmentTriggerClass}>
                    阳历
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className={labelClass}>年</Label>
                <Select
                  value={String(value.birthDate.year)}
                  onValueChange={(next) =>
                    onChange('birthDate', { ...value.birthDate, year: Number(next) })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}年
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className={labelClass}>月</Label>
                <Select
                  value={String(value.birthDate.month)}
                  onValueChange={(next) => handleMonthChange(Number(next))}
                  disabled={submitting}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    {monthOptions.map((month) => (
                      <SelectItem key={month} value={String(month)}>
                        {month}月
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className={labelClass}>日</Label>
                <Select
                  value={String(value.birthDate.day)}
                  onValueChange={(next) =>
                    onChange('birthDate', { ...value.birthDate, day: Number(next) })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    {dayOptions.map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {day}日
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {value.calendarType === 'lunar' && leapMonth > 0 && (
              <div className="flex items-center gap-3 pt-1">
                <Switch
                  id="leap-month"
                  checked={value.birthDate.isLeapMonth ?? false}
                  onCheckedChange={(checked) =>
                    onChange('birthDate', {
                      ...value.birthDate,
                      month: checked ? leapMonth : value.birthDate.month,
                      isLeapMonth: checked,
                    })
                  }
                  disabled={submitting}
                />
                <Label
                  htmlFor="leap-month"
                  className="cursor-pointer select-none text-sm font-medium text-slate-600 dark:text-slate-300"
                >
                  闰月（{leapMonth}月）
                </Label>
              </div>
            )}
          </div>
        </section>

        {/* 出生时间 */}
        <section className={panelClass}>
          <h3 className={sectionTitleClass}>
            <Clock className={iconAccentClass} />
            出生时间
          </h3>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className={labelClass}>时</Label>
                <Select
                  value={value.birthTime.hour}
                  onValueChange={(next) =>
                    onChange('birthTime', { ...value.birthTime, hour: next })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    {hourOptions.map((hour) => (
                      <SelectItem key={hour} value={hour}>
                        {hour}时
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className={labelClass}>分</Label>
                <Select
                  value={value.birthTime.minute}
                  onValueChange={(next) =>
                    onChange('birthTime', { ...value.birthTime, minute: next })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    {minuteOptions.map((minute) => (
                      <SelectItem key={minute} value={minute}>
                        {minute}分
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              出生时间用于精准排盘，请尽量准确填写
            </p>
          </div>
        </section>

        {/* 出生地点 */}
        <section className={panelClass}>
          <h3 className={sectionTitleClass}>
            <MapPin className={iconAccentClass} />
            出生地点
          </h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label className={labelClass}>城市或地区</Label>
              <Popover open={cityPopoverOpen} onOpenChange={setCityPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={cityPopoverOpen}
                    className={cn(
                      'h-11 w-full justify-between font-normal',
                      inputClass,
                      !value.location.name && 'text-slate-400 dark:text-slate-500'
                    )}
                    disabled={submitting}
                  >
                    {hasExactLocation ? value.location.name : value.location.name || '搜索城市'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className={cn(
                    popoverContentClass,
                    'w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))]'
                  )}
                  align="start"
                  side="bottom"
                  sideOffset={4}
                >
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
                      className={cn(inputClass, 'mb-2')}
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto sm:max-h-56">
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
                                'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200',
                                isSelected
                                  ? 'bg-blue-500/10 font-medium text-blue-600 dark:text-blue-400'
                                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/50'
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
                              {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-500" />}
                              <span className={cn(!isSelected && 'ml-6')}>{city.fullName}</span>
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-3 py-6 text-center text-sm text-slate-400">
                          未找到匹配的城市
                        </p>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {fieldErrors.location ? (
                <p className="text-xs text-rose-500">{fieldErrors.location}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {hasExactLocation
                    ? `坐标 ${value.location.lat?.toFixed(2)}, ${value.location.lon?.toFixed(2)}`
                    : '输入城市名称搜索，用于真太阳时校准'}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)] dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button type="button" className={primaryBtnClass} onClick={onSubmit} disabled={submitting || !canSubmit}>
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" aria-hidden />
          {submitting ? '测算中...' : '开始测算'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={secondaryBtnClass}
          onClick={onReset}
          disabled={submitting}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20 dark:bg-white/10" aria-hidden />
          重置表单
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
        您的个人信息仅用于 AI 命理推算，我们不会向第三方泄露
      </p>
    </div>
  );
}
