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

const panelClass = 'relative rounded-[24px] backdrop-blur-[24px] px-6 py-6 overflow-hidden';

const labelClass = 'text-[13px] font-semibold text-[#475569]/90 dark:text-slate-300';
const inputClass =
  'bg-white/60 dark:bg-slate-800/60 border-white/50 dark:border-white/10 rounded-[12px] text-slate-700 dark:text-slate-100 shadow-[0_2px_8px_rgba(93,124,250,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/25 dark:focus-visible:ring-indigo-500/25 focus-visible:border-[#9BAEFF]/60 dark:focus-visible:border-indigo-500/60 focus-visible:bg-white/80 dark:focus-visible:bg-slate-800/80 transition-all duration-200 dark:placeholder:text-slate-400';

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
    <div
      className="relative rounded-[24px] sm:rounded-[28px] md:rounded-[32px] p-4 sm:p-6 md:p-8 backdrop-blur-[32px] overflow-hidden bg-white/25 dark:bg-slate-900/40"
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

      {/* 侧边框 - 仅上半部分 */}
      <div
        className="absolute inset-y-0 left-0 w-px"
        style={{
          background:
            'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.15) 60%, transparent 100%)',
        }}
      />
      <div
        className="absolute inset-y-0 right-0 w-px"
        style={{
          background:
            'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.15) 60%, transparent 100%)',
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-[22px] font-heading font-black tracking-tight text-[#0F172A] dark:text-slate-100">
            生辰信息输入
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600/80 dark:text-slate-300/80">
            请准确填写出生信息，AI 将生成完整命理解读
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/60 bg-white/40 backdrop-blur-sm px-2.5 py-0.5 text-[10px] sm:text-xs font-bold text-[#4969E9] shadow-[0_2px_8px_rgba(75,99,217,0.15)] dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-200">
          1/2
        </span>
      </div>

      <div className="relative mt-4 sm:mt-6 grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-5 items-stretch">
        {/* 基本信息 */}
        <section
          className={cn(
            panelClass,
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10',
            'px-4 py-4 sm:px-6 sm:py-6'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#5D7CFA] dark:text-indigo-400" />
            基本信息
          </h3>
          <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="bazi-name" className={cn(labelClass, 'text-xs sm:text-[13px]')}>
                姓名
              </Label>
              <Input
                id="bazi-name"
                value={value.name}
                onChange={(e) => onChange('name', e.target.value)}
                placeholder="请输入您的姓名"
                className={cn(inputClass, 'h-9 sm:h-10')}
                disabled={submitting}
              />
              {fieldErrors.name && <p className="text-xs text-rose-600">{fieldErrors.name}</p>}
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label className={cn(labelClass, 'text-xs sm:text-[13px]')}>
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1 text-[#5D7CFA]" />
                性别
              </Label>
              <Tabs
                value={value.gender}
                onValueChange={(next) => onChange('gender', next as 'male' | 'female')}
              >
                <TabsList className="grid grid-cols-2 h-9 sm:h-10 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-white/10 p-1 shadow-sm">
                  <TabsTrigger
                    value="male"
                    disabled={submitting}
                    className={cn(
                      'rounded-lg font-bold transition-all text-xs sm:text-sm',
                      'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100',
                      'data-[state=active]:text-[#5D7CFA] dark:data-[state=active]:text-indigo-400',
                      'data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm'
                    )}
                  >
                    乾（男）
                  </TabsTrigger>
                  <TabsTrigger
                    value="female"
                    disabled={submitting}
                    className={cn(
                      'rounded-lg font-bold transition-all text-xs sm:text-sm',
                      'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100',
                      'data-[state=active]:text-[#5D7CFA] dark:data-[state=active]:text-indigo-400',
                      'data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm'
                    )}
                  >
                    坤（女）
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </section>

        {/* 出生日期 */}
        <section
          className={cn(
            panelClass,
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10',
            'px-4 py-4 sm:px-6 sm:py-6'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#5D7CFA] dark:text-indigo-400" />
            出生日期
          </h3>
          <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
            {/* 农历/阳历选择 */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label className={cn(labelClass, 'text-xs sm:text-[13px]')}>历法</Label>
              <Tabs
                value={value.calendarType}
                onValueChange={(next) => onChange('calendarType', next as 'lunar' | 'solar')}
              >
                <TabsList className="grid grid-cols-2 h-9 sm:h-10 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-white/10 p-1 shadow-sm">
                  <TabsTrigger
                    value="lunar"
                    disabled={submitting}
                    className={cn(
                      'rounded-lg font-bold transition-all text-xs sm:text-sm',
                      'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100',
                      'data-[state=active]:text-[#5D7CFA] dark:data-[state=active]:text-indigo-400',
                      'data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm'
                    )}
                  >
                    农历
                  </TabsTrigger>
                  <TabsTrigger
                    value="solar"
                    disabled={submitting}
                    className={cn(
                      'rounded-lg font-bold transition-all text-xs sm:text-sm',
                      'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100',
                      'data-[state=active]:text-[#5D7CFA] dark:data-[state=active]:text-indigo-400',
                      'data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm'
                    )}
                  >
                    阳历
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className={cn(labelClass, 'text-xs sm:text-[13px]')}>年</Label>
                <Select
                  value={String(value.birthDate.year)}
                  onValueChange={(next) =>
                    onChange('birthDate', { ...value.birthDate, year: Number(next) })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={cn(inputClass, 'h-9 sm:h-10')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}年
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label className={cn(labelClass, 'text-xs sm:text-[13px]')}>月</Label>
                <Select
                  value={String(value.birthDate.month)}
                  onValueChange={(next) => handleMonthChange(Number(next))}
                  disabled={submitting}
                >
                  <SelectTrigger className={cn(inputClass, 'h-9 sm:h-10')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((month) => (
                      <SelectItem key={month} value={String(month)}>
                        {month}月
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label className={cn(labelClass, 'text-xs sm:text-[13px]')}>日</Label>
                <Select
                  value={String(value.birthDate.day)}
                  onValueChange={(next) =>
                    onChange('birthDate', { ...value.birthDate, day: Number(next) })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={cn(inputClass, 'h-9 sm:h-10')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dayOptions.map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {day}日
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 闰月开关 */}
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
                  className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none"
                >
                  闰月（{leapMonth}月）
                </Label>
              </div>
            )}
          </div>
        </section>

        {/* 出生时间 */}
        <section
          className={cn(
            panelClass,
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10',
            'px-4 py-4 sm:px-6 sm:py-6'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#5D7CFA] dark:text-indigo-400" />
            出生时间
          </h3>
          <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className={cn(labelClass, 'text-xs sm:text-[13px]')}>时</Label>
                <Select
                  value={value.birthTime.hour}
                  onValueChange={(next) =>
                    onChange('birthTime', { ...value.birthTime, hour: next })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={cn(inputClass, 'h-9 sm:h-10')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hourOptions.map((hour) => (
                      <SelectItem key={hour} value={hour}>
                        {hour}时
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label className={cn(labelClass, 'text-xs sm:text-[13px]')}>分</Label>
                <Select
                  value={value.birthTime.minute}
                  onValueChange={(next) =>
                    onChange('birthTime', { ...value.birthTime, minute: next })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={cn(inputClass, 'h-9 sm:h-10')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {minuteOptions.map((minute) => (
                      <SelectItem key={minute} value={minute}>
                        {minute}分
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              出生时间用于精准排盘，请尽量准确填写
            </p>
          </div>
        </section>

        {/* 出生地点 */}
        <section
          className={cn(
            panelClass,
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10',
            'px-4 py-4 sm:px-6 sm:py-6'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#5D7CFA] dark:text-indigo-400" />
            出生地点
          </h3>
          <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label className={cn(labelClass, 'text-xs sm:text-[13px]')}>城市或地区</Label>
              <Popover open={cityPopoverOpen} onOpenChange={setCityPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={cityPopoverOpen}
                    className={cn(
                      'w-full justify-between h-9 sm:h-10 font-normal text-xs sm:text-sm',
                      inputClass,
                      !value.location.name && 'text-slate-400 dark:text-slate-500'
                    )}
                    disabled={submitting}
                  >
                    {hasExactLocation ? value.location.name : value.location.name || '搜索城市'}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))] p-0"
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
                        // 输入变化时清除已选坐标
                        if (hasExactLocation) {
                          onChange('location', { name: e.target.value, lat: null, lon: null });
                        }
                      }}
                      placeholder="输入城市或地区名称..."
                      className="mb-2"
                      autoFocus
                    />
                    <div className="max-h-48 sm:max-h-56 overflow-y-auto">
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
                                  ? 'bg-[#5D7CFA]/10 text-[#3C58D8] font-medium'
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
                              {isSelected && <Check className="h-4 w-4 shrink-0 text-[#5D7CFA]" />}
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
                <p className="text-xs text-rose-600">{fieldErrors.location}</p>
              ) : (
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
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
        <div className="mt-4 sm:mt-5 rounded-[16px] sm:rounded-[20px] border border-rose-200/50 dark:border-rose-800/50 bg-gradient-to-br from-rose-50/60 dark:from-rose-950/60 via-rose-50/40 dark:via-rose-950/40 to-transparent backdrop-blur-sm px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-rose-700 dark:text-rose-300 shadow-[0_4px_16px_rgba(244,63,94,0.08)]">
          {error}
        </div>
      )}

      <div className="mt-5 sm:mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <Button
          type="button"
          className="rounded-full bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(93,124,250,0.32)] hover:shadow-[0_14px_30px_rgba(93,124,250,0.36)] hover:brightness-[1.03] active:scale-[0.98] transition-all duration-200 min-h-[44px]"
          onClick={onSubmit}
          disabled={submitting || !canSubmit}
        >
          {submitting ? '测算中...' : '开始测算'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-white/60 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm text-[#475569] dark:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:border-white/80 dark:hover:border-white/20 transition-all duration-200 shadow-[0_2px_8px_rgba(93,124,250,0.08)] min-h-[44px] text-sm"
          onClick={onReset}
          disabled={submitting}
        >
          重置表单
        </Button>
      </div>

      <p className="mt-3 sm:mt-4 text-center text-[11px] sm:text-xs text-slate-500/70 dark:text-slate-400/70">
        您的个人信息仅用于 AI 命理推算，我们不会向第三方泄露
      </p>
    </div>
  );
}
