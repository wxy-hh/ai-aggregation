'use client';

import { useMemo } from 'react';
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
import { cn } from '@/lib/utils';
import { Calendar, Clock, MapPin, User, Users } from 'lucide-react';
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

const panelClass = 'relative rounded-[28px] backdrop-blur-[24px] px-6 py-6 overflow-hidden';

const labelClass = 'text-[13px] font-semibold text-[#425394]/90 dark:text-slate-300';
const inputClass =
  'bg-white/60 dark:bg-slate-800/60 border-white/50 dark:border-white/10 rounded-[14px] text-slate-700 dark:text-slate-100 shadow-[0_2px_8px_rgba(93,124,250,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/25 dark:focus-visible:ring-indigo-500/25 focus-visible:border-[#9BAEFF]/60 dark:focus-visible:border-indigo-500/60 focus-visible:bg-white/80 dark:focus-visible:bg-slate-800/80 transition-all duration-200 dark:placeholder:text-slate-400';

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

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-black tracking-tight text-[#1A245B] dark:text-slate-100">
            生辰信息输入
          </h2>
          <p className="mt-1.5 text-sm text-slate-600/80 dark:text-slate-300/80">
            请准确填写您的出生信息，AI 将基于真实模型生成完整命理解读。
          </p>
        </div>
        <span className="rounded-full border border-white/60 bg-white/40 backdrop-blur-sm px-3 py-1 text-xs font-bold text-[#4B63D9] shadow-[0_2px_8px_rgba(75,99,217,0.15)] dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-200">
          Step 1 / 2
        </span>
      </div>

      <div className="relative mt-6 grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch">
        {/* 基本信息 */}
        <section
          className={cn(
            panelClass,
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <User className="w-4 h-4 text-[#5D7CFA] dark:text-indigo-400" />
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
              {fieldErrors.name && <p className="text-xs text-rose-600">{fieldErrors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>
                <Users className="w-4 h-4 inline mr-1 text-[#5D7CFA]" />
                性别
              </Label>
              <Tabs
                value={value.gender}
                onValueChange={(next) => onChange('gender', next as 'male' | 'female')}
              >
                <TabsList className="grid grid-cols-2 h-10 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-white/10 p-1 shadow-sm">
                  <TabsTrigger
                    value="male"
                    disabled={submitting}
                    className={cn(
                      'rounded-lg font-bold transition-all',
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
                      'rounded-lg font-bold transition-all',
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
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#5D7CFA] dark:text-indigo-400" />
            出生日期
          </h3>
          <div className="mt-4 space-y-4">
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
                  <SelectTrigger className={cn(inputClass, 'h-10')}>
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

              <div className="space-y-2">
                <Label className={labelClass}>月</Label>
                <Select
                  value={String(value.birthDate.month)}
                  onValueChange={(next) =>
                    onChange('birthDate', { ...value.birthDate, month: Number(next) })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={cn(inputClass, 'h-10')}>
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

              <div className="space-y-2">
                <Label className={labelClass}>日</Label>
                <Select
                  value={String(value.birthDate.day)}
                  onValueChange={(next) =>
                    onChange('birthDate', { ...value.birthDate, day: Number(next) })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={cn(inputClass, 'h-10')}>
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
          </div>
        </section>

        {/* 出生时间 */}
        <section
          className={cn(
            panelClass,
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#5D7CFA] dark:text-indigo-400" />
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
                  <SelectTrigger className={cn(inputClass, 'h-10')}>
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

              <div className="space-y-2">
                <Label className={labelClass}>分</Label>
                <Select
                  value={value.birthTime.minute}
                  onValueChange={(next) =>
                    onChange('birthTime', { ...value.birthTime, minute: next })
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className={cn(inputClass, 'h-10')}>
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              出生时间用于精准排盘，请尽量准确填写
            </p>
          </div>
        </section>

        {/* 出生地点 */}
        <section
          className={cn(
            panelClass,
            'bg-white/35 dark:bg-slate-800/40 border border-white/40 dark:border-white/10'
          )}
          style={{
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(93,124,250,0.08)',
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#5D7CFA] dark:text-indigo-400" />
            出生地点
          </h3>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bazi-location" className={labelClass}>
                城市或地区
              </Label>
              <Input
                id="bazi-location"
                value={value.location.name}
                onChange={(e) =>
                  onChange('location', { name: e.target.value, lat: null, lon: null })
                }
                placeholder="例如：北京市朝阳区"
                className={inputClass}
                disabled={submitting}
              />
              {fieldErrors.location ? (
                <p className="text-xs text-rose-600">{fieldErrors.location}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  出生地点用于真太阳时校准，影响排盘准确度
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {error && (
        <div className="mt-5 rounded-[20px] border border-rose-200/50 dark:border-rose-800/50 bg-gradient-to-br from-rose-50/60 dark:from-rose-950/60 via-rose-50/40 dark:via-rose-950/40 to-transparent backdrop-blur-sm px-4 py-3 text-sm text-rose-700 dark:text-rose-300 shadow-[0_4px_16px_rgba(244,63,94,0.08)]">
          {error}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="rounded-full bg-gradient-to-r from-[#5D7CFA] via-[#6F87FF] to-[#8190FF] px-6 py-2.5 text-white shadow-[0_8px_24px_rgba(93,124,250,0.28),0_1px_0_rgba(255,255,255,0.2)_inset] hover:shadow-[0_12px_32px_rgba(93,124,250,0.35)] hover:brightness-105 transition-all duration-300"
          onClick={onSubmit}
          disabled={submitting || !canSubmit}
        >
          {submitting ? '测算中...' : '开始测算'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-white/60 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm text-[#4B5D9F] dark:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:border-white/80 dark:hover:border-white/20 transition-all duration-200 shadow-[0_2px_8px_rgba(93,124,250,0.08)]"
          onClick={onReset}
          disabled={submitting}
        >
          重置表单
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-slate-500/70 dark:text-slate-400/70">
        您的个人信息仅用于 AI 命理推算，我们不会向第三方泄露
      </p>
    </div>
  );
}
