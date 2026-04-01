'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Calendar, Clock, MapPin, Search, User, Users, X } from 'lucide-react';
import type { ReactNode } from 'react';

export type OnboardingInput = {
  name: string;
  gender: 'male' | 'female';
  birthDate: { year: number; month: number; day: number };
  birthTime: { hour: string; minute: string };
  location: { name: string; lat: number | null; lon: number | null };
};

const yearOptions = Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - i);
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);
const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const minuteOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

type City = { name: string; lat: number; lon: number };
const mockCities: City[] = [
  { name: '北京', lat: 39.9, lon: 116.4 },
  { name: '上海', lat: 31.23, lon: 121.47 },
  { name: '广州', lat: 23.13, lon: 113.27 },
  { name: '深圳', lat: 22.55, lon: 114.06 },
  { name: '成都', lat: 30.57, lon: 104.06 },
  { name: '杭州', lat: 30.27, lon: 120.16 },
];

function defaultValueFrom(input?: OnboardingInput): OnboardingInput {
  const now = new Date();
  return (
    input ?? {
      name: '',
      gender: 'male',
      birthDate: { year: 1995, month: 6, day: 18 },
      birthTime: { hour: '12', minute: '30' },
      location: { name: '', lat: null, lon: null },
    }
  );
}

export function OnboardingModal({
  open,
  defaultValue,
  canCancel = false,
  onCancelAction,
  onStartAction,
}: {
  open: boolean;
  defaultValue?: OnboardingInput;
  canCancel?: boolean;
  onCancelAction?: () => void;
  onStartAction: (input: OnboardingInput) => void;
}) {
  const [value, setValue] = useState<OnboardingInput>(() => defaultValueFrom(defaultValue));
  const [cityQuery, setCityQuery] = useState('');
  const [touched, setTouched] = useState<{ name: boolean; location: boolean }>({
    name: false,
    location: false,
  });

  useEffect(() => {
    if (open) setValue(defaultValueFrom(defaultValue));
  }, [open, defaultValue]);

  const cityResults = useMemo(() => {
    const q = cityQuery.trim();
    if (!q) return mockCities.slice(0, 6);
    return mockCities.filter((c) => c.name.includes(q)).slice(0, 6);
  }, [cityQuery]);

  const nameOk = value.name.trim().length > 0;
  const locationOk = value.location.name.trim().length > 0;
  const canStart = nameOk && locationOk;

  return (
    <Dialog open={open} modal={false}>
      <DialogContent
        showClose={false}
        hideOverlay
        customOverlay={
          <div
            aria-hidden
            className="fixed bottom-0 left-[100px] right-0 top-0 z-40 bg-slate-900/20 backdrop-blur-[2px] pointer-events-none"
          />
        }
        className={cn(
          'max-w-[720px] p-0 overflow-hidden border-0 bg-transparent shadow-none',
          'sm:rounded-[36px]'
        )}
      >
        <DialogTitle className="sr-only text-black">开启您的命理探索</DialogTitle>
        <DialogDescription className="sr-only">
          收集姓名、性别、生辰与出生地信息，用于精准排盘。
        </DialogDescription>
        <div className="relative text-slate-900">
          {/* 背景磨砂容器（参考图：引导弹框.png） */}
          <div
            className={cn(
              'rounded-[36px] border border-white/80 bg-white/85 backdrop-blur-[32px]',
              'shadow-[0_35px_110px_-40px_rgba(47,107,255,0.30)]'
            )}
          >
            {/* 贴近设计图的淡蓝紫玻璃背景 */}
            <div
              className="absolute inset-0 rounded-[36px] pointer-events-none"
              aria-hidden
              style={{
                background:
                  'radial-gradient(900px 420px at 20% 15%, rgba(47,107,255,0.22), transparent 55%),' +
                  'radial-gradient(700px 380px at 85% 30%, rgba(99,102,241,0.18), transparent 60%),' +
                  'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.30))',
              }}
            />
            {canCancel && onCancelAction && (
              <div className="absolute right-6 top-6 z-10">
                <button
                  type="button"
                  onClick={onCancelAction}
                  className={cn(
                    'rounded-xl p-2 text-slate-400/90 hover:text-slate-600 hover:bg-white/45',
                    'transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/25'
                  )}
                >
                  <X className="h-5 w-5" />
                  <span className="sr-only">取消</span>
                </button>
              </div>
            )}
            <div className="px-10 pt-10 pb-8">
              <div className="text-center">
                <div className="text-[28px] leading-tight font-black tracking-tight text-black drop-shadow-[0_1px_0_rgba(255,255,255,0.65)]">
                  开启您的命理探索
                </div>
                <div className="mt-3 text-sm font-semibold text-black/85 drop-shadow-[0_1px_0_rgba(255,255,255,0.55)]">
                  请输入准确的生辰信息，以便 AI 为您精准排盘
                </div>
              </div>
              <div className="mt-6 h-px w-full bg-slate-200/35" />

              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                {/* 姓名 */}
                <div className="space-y-2">
                  <FieldLabel icon={<User className="w-4 h-4" />} label="姓名" />
                  <div className="relative">
                    <Input
                      value={value.name}
                      onChange={(e) => setValue((v) => ({ ...v, name: e.target.value }))}
                      onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                      placeholder="请输入您的姓名"
                      className={cn(
                        'h-12 rounded-full bg-white/80 border border-slate-200/40 shadow-sm',
                        'text-black placeholder:text-slate-400',
                        'focus-visible:ring-0 focus-visible:border-[#2F6BFF]/55 focus-visible:bg-white'
                      )}
                    />
                  </div>
                  {touched.name && !nameOk && (
                    <p className="text-xs font-semibold text-rose-600">请输入姓名</p>
                  )}
                </div>

                {/* 性别 */}
                <div className="space-y-2">
                  <FieldLabel icon={<Users className="w-4 h-4" />} label="性别" />
                  <Tabs
                    value={value.gender}
                    onValueChange={(next) =>
                      setValue((v) => ({ ...v, gender: next as 'male' | 'female' }))
                    }
                  >
                    <TabsList className="grid grid-cols-2 h-12 rounded-full bg-slate-50/80 border border-slate-200/50 p-1 shadow-sm">
                      <TabsTrigger
                        value="male"
                        className={cn(
                          'rounded-full font-extrabold transition-all',
                          'text-black/65 hover:text-black/80',
                          'data-[state=active]:text-[#2F6BFF]',
                          'data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20',
                          'data-[state=active]:ring-2 data-[state=active]:ring-[#2F6BFF]/55',
                          'data-[state=active]:scale-[1.02]'
                        )}
                      >
                        乾（男）
                      </TabsTrigger>
                      <TabsTrigger
                        value="female"
                        className={cn(
                          'rounded-full font-extrabold transition-all',
                          'text-black/65 hover:text-black/80',
                          'data-[state=active]:text-[#2F6BFF]',
                          'data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20',
                          'data-[state=active]:ring-2 data-[state=active]:ring-[#2F6BFF]/55',
                          'data-[state=active]:scale-[1.02]'
                        )}
                      >
                        坤（女）
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* 出生日期 */}
                <div className="space-y-2 md:col-span-2">
                  <FieldLabel icon={<Calendar className="w-4 h-4" />} label="出生日期" />
                  <div className="grid grid-cols-3 gap-4">
                    <SelectPill
                      label="年"
                      value={String(value.birthDate.year)}
                      options={yearOptions.map(String)}
                      onChange={(next) =>
                        setValue((v) => ({
                          ...v,
                          birthDate: { ...v.birthDate, year: Number(next) },
                        }))
                      }
                    />
                    <SelectPill
                      label="月"
                      value={String(value.birthDate.month)}
                      options={monthOptions.map(String)}
                      onChange={(next) =>
                        setValue((v) => ({
                          ...v,
                          birthDate: { ...v.birthDate, month: Number(next) },
                        }))
                      }
                    />
                    <SelectPill
                      label="日"
                      value={String(value.birthDate.day)}
                      options={dayOptions.map(String)}
                      onChange={(next) =>
                        setValue((v) => ({
                          ...v,
                          birthDate: { ...v.birthDate, day: Number(next) },
                        }))
                      }
                    />
                  </div>
                </div>

                {/* 出生时间 */}
                <div className="space-y-2">
                  <FieldLabel icon={<Clock className="w-4 h-4" />} label="出生时间" />
                  <div className="grid grid-cols-2 gap-4">
                    <SelectPill
                      label="时"
                      value={value.birthTime.hour}
                      options={hourOptions}
                      onChange={(next) =>
                        setValue((v) => ({ ...v, birthTime: { ...v.birthTime, hour: next } }))
                      }
                    />
                    <SelectPill
                      label="分"
                      value={value.birthTime.minute}
                      options={minuteOptions}
                      onChange={(next) =>
                        setValue((v) => ({ ...v, birthTime: { ...v.birthTime, minute: next } }))
                      }
                    />
                  </div>
                </div>

                {/* 出生地 */}
                <div className="space-y-2">
                  <FieldLabel icon={<MapPin className="w-4 h-4" />} label="出生地点" />
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={value.location.name}
                      onChange={(e) => {
                        const text = e.target.value;
                        setValue((v) => ({
                          ...v,
                          location: { name: text, lat: null, lon: null },
                        }));
                        setCityQuery(text);
                      }}
                      onBlur={() => setTouched((t) => ({ ...t, location: true }))}
                      placeholder="输入城市…"
                      className={cn(
                        'h-12 rounded-full bg-white/80 border border-slate-200/40 shadow-sm',
                        'pl-11 text-black placeholder:text-slate-400',
                        'focus-visible:ring-0 focus-visible:border-[#2F6BFF]/55 focus-visible:bg-white'
                      )}
                    />
                  </div>
                  {touched.location && !locationOk && (
                    <p className="text-xs font-semibold text-rose-600">请选择出生城市</p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-10 pb-10">
              <Button
                type="button"
                onClick={() => onStartAction(value)}
                disabled={!canStart}
                className={cn(
                  'w-full h-14 rounded-full text-base font-extrabold',
                  'bg-[#2356E8] text-white shadow-[0_18px_50px_-20px_rgba(37,99,235,0.80)]',
                  'hover:bg-[#3B82F6] hover:shadow-[0_24px_70px_-26px_rgba(59,130,246,0.95)]',
                  'active:bg-[#1D4ED8]',
                  'transform transition-colors transition-shadow transition-transform duration-200',
                  'hover:-translate-y-0.5 active:translate-y-0',
                  'disabled:opacity-60 disabled:cursor-not-allowed'
                )}
              >
                开始测算
              </Button>
              <p className="mt-4 text-center text-xs text-slate-500">
                您的个人信息仅用于 AI 命理推算，我们不会向第三方泄露
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-black text-black drop-shadow-[0_1px_0_rgba(255,255,255,0.55)]">
      <span className="text-[#2F6BFF]">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function SelectPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-12 w-full appearance-none rounded-full px-4 pr-10 text-sm font-bold',
          'bg-white/80 border border-slate-200/40 text-black shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/10 focus:border-[#2F6BFF]/50'
        )}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
            {label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </label>
  );
}
