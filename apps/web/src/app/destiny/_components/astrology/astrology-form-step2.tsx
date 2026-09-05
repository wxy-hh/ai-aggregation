'use client';

/**
 * astrology-form-step2.tsx —— 两步表单 · 第二步「时间校准台」（设计文档 §6.3）
 *
 * 三档时间精度分段控件（准确到分钟 / 大约时段 / 完全未知，滑动胶囊指示）：
 * - 准确到分钟：时、分选择器 + 小型可视化钟面即时反馈（未选时只画空盘，不默认任何推测时刻）
 * - 大约时段：三小时粒度八段胶囊 + 钟面半透明时间弧带（缓慢呼吸 ≥8s）+ 琥珀色正面徽章
 * - 完全未知：无宫位说明卡（无宫位行星环圆盘 + 双列「可看到 / 可解锁」，解锁视角不置灰）
 * 下方为全球城市搜索（必须精确选中）与时区可读确认条、资料影响可展开说明。
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, CheckCircle2, ChevronDown, Clock3, Info, MapPin, SunMedium } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeChartFacts, SAMPLE_PROFILE_UNKNOWN } from '@/lib/astrology/mock-chart-facts';
import { searchCities, type AstroCity } from '@/lib/astrology/cities';
import type { TimePrecision } from '@/lib/astrology/chart-facts';
import { APPROXIMATE_SLOTS, formatUtcOffset, utcOffsetMinutesFor } from './astrology-mappers';
import { AstrologyChartWheel } from './astrology-chart-wheel';
import { AstrologyFieldError, type AstrologyFormStepProps } from './astrology-form-step1';

/* ---------- 小型可视化钟面（辅助指示，不占主要视觉区） ---------- */

const CLOCK_C = 60;
const CLOCK_R_TICK_OUT = 54;

/** 钟面极坐标：0° 指向 12 点，顺时针增长 */
function clockPolar(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CLOCK_C + r * Math.sin(rad), CLOCK_C - r * Math.cos(rad)];
}

function MiniClock({
  hour,
  minute,
  slot,
}: {
  /** 准确档：已选时刻（未选为 null，只画空盘） */
  hour: number | null;
  minute: number | null;
  /** 大约档：时段弧带（如 '13:00-16:00'），未选为 null */
  slot: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => i * 6), []);

  /** 时段弧带几何：三小时 = 表盘 90° */
  const arc = useMemo(() => {
    if (!slot) return null;
    const [start, end] = slot.split('-');
    const startH = Number(start.split(':')[0]);
    const endH = end === '24:00' ? 24 : Number(end.split(':')[0]);
    if (!Number.isFinite(startH) || !Number.isFinite(endH)) return null;
    const r = 36;
    const [x1, y1] = clockPolar(startH * 30, r);
    const [x2, y2] = clockPolar(endH * 30, r);
    const largeArc = endH * 30 - startH * 30 > 180 ? 1 : 0;
    return { d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, start: [x1, y1] as const, end: [x2, y2] as const };
  }, [slot]);

  const hasHands = hour !== null && minute !== null;
  const hourDeg = hasHands ? ((hour % 12) + minute / 60) * 30 : 0;
  const minuteDeg = hasHands ? minute * 6 : 0;
  const [hx, hy] = clockPolar(hourDeg, 24);
  const [mx, my] = clockPolar(minuteDeg, 36);

  return (
    <svg
      viewBox="0 0 120 120"
      className="h-24 w-24 shrink-0 sm:h-28 sm:w-28"
      role="img"
      aria-label={hasHands ? `已选时刻 ${hour}:${String(minute).padStart(2, '0')}` : '出生时刻钟面预览'}
    >
      {/* 表盘底：浅色仪表感，深色星空校准仪 */}
      <circle
        cx={CLOCK_C}
        cy={CLOCK_C}
        r={57}
        className="fill-white/70 stroke-slate-200/90 dark:fill-[#0B1026]/80 dark:stroke-indigo-300/20"
        strokeWidth={1.2}
      />
      {/* 60 刻度（整点加粗） */}
      {ticks.map((deg) => {
        const major = deg % 30 === 0;
        const [x1, y1] = clockPolar(deg, major ? 45 : 49);
        const [x2, y2] = clockPolar(deg, CLOCK_R_TICK_OUT);
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth={major ? 1.6 : 0.8}
            strokeLinecap="round"
            className={major ? 'stroke-slate-500/70 dark:stroke-indigo-200/50' : 'stroke-slate-300 dark:stroke-indigo-200/20'}
          />
        );
      })}

      {/* 大约时段弧带：两端边界点 + 缓慢呼吸（周期 ≥8s，尊重减少动态） */}
      {arc && (
        <g>
          <motion.path
            d={arc.d}
            fill="none"
            strokeWidth={9}
            strokeLinecap="round"
            className="stroke-indigo-400/45 dark:stroke-indigo-300/40"
            initial={false}
            animate={reduceMotion ? { opacity: 0.6 } : { opacity: [0.4, 0.75, 0.4] }}
            transition={reduceMotion ? { duration: 0.01 } : { duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <circle cx={arc.start[0]} cy={arc.start[1]} r={3.2} className="fill-indigo-500 dark:fill-indigo-300" />
          <circle cx={arc.end[0]} cy={arc.end[1]} r={3.2} className="fill-indigo-500 dark:fill-indigo-300" />
        </g>
      )}

      {/* 指针（仅准确档已选时分；深色下发光） */}
      {hasHands && (
        <g className="dark:[filter:drop-shadow(0_0_5px_rgba(129,140,248,0.85))]">
          <line x1={CLOCK_C} y1={CLOCK_C} x2={hx} y2={hy} strokeWidth={3.4} strokeLinecap="round" className="stroke-indigo-600 dark:stroke-indigo-300" />
          <line x1={CLOCK_C} y1={CLOCK_C} x2={mx} y2={my} strokeWidth={2.2} strokeLinecap="round" className="stroke-violet-500 dark:stroke-violet-300" />
        </g>
      )}
      <circle cx={CLOCK_C} cy={CLOCK_C} r={hasHands ? 3 : 2} className={hasHands ? 'fill-indigo-600 dark:fill-indigo-300' : 'fill-slate-300 dark:fill-indigo-200/30'} />
    </svg>
  );
}

/* ---------- 时间精度分段控件 ---------- */

const PRECISIONS: Array<{ value: TimePrecision; label: string }> = [
  { value: 'accurate', label: '准确到分钟' },
  { value: 'approximate', label: '大约时段' },
  { value: 'unknown', label: '完全未知' },
];

/* ---------- 第二步表单 ---------- */

export function AstrologyFormStep2({ formData, fieldErrors, disabled, onPatch }: AstrologyFormStepProps) {
  const reduceMotion = useReducedMotion();
  const [impactOpen, setImpactOpen] = useState(false);

  /* 城市搜索本地态：输入文字留在本地，只有精确选中才写入 store */
  const [cityQuery, setCityQuery] = useState(formData.location.name);
  const [cityOpen, setCityOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const cityResults = useMemo(() => searchCities(cityQuery), [cityQuery]);
  const citySelected =
    formData.location.name !== '' && formData.location.lat !== null && formData.location.timezone !== null;

  /** 键盘导航支持（上下方向键游标、回车选择、Esc 关闭） */
  const handleCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!cityOpen || cityResults.length === 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCityOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % cityResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + cityResults.length) % cityResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const targetIndex = highlightedIndex >= 0 ? highlightedIndex : 0;
      if (cityResults[targetIndex]) {
        selectCity(cityResults[targetIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCityOpen(false);
      setHighlightedIndex(-1);
    }
  };

  /** 时区确认条：「{城市} · {IANA 时区} · {YYYY 年当地时间} UTC±n」（历史夏令时由浏览器 tzdb 换算） */
  const timezoneConfirm = useMemo(() => {
    if (!citySelected || !formData.location.timezone) return null;
    const tz = formData.location.timezone;
    const d = formData.birthDate;
    const at = d ? new Date(Date.UTC(d.year, d.month - 1, d.day, 4)) : new Date();
    const offset = formatUtcOffset(utcOffsetMinutesFor(tz, at));
    return d
      ? `${formData.location.name} · ${tz} · ${d.year} 年当地时间 ${offset}`
      : `${formData.location.name} · ${tz} · ${offset}`;
  }, [citySelected, formData.location.name, formData.location.timezone, formData.birthDate]);

  const selectCity = (city: AstroCity) => {
    setCityQuery(city.name);
    setCityOpen(false);
    setHighlightedIndex(-1);
    onPatch({ location: { name: city.name, lat: city.lat, lon: city.lon, timezone: city.timezone } });
  };

  const patchTime = (key: 'hour' | 'minute', value: string) => {
    onPatch({ birthTime: { ...formData.birthTime, [key]: value } });
  };

  const hourSelected = formData.birthTime.hour !== '';
  const minuteSelected = formData.birthTime.minute !== '';

  /** 完全未知档的无宫位示例圆盘（真正看得清的视觉锚点，非装饰） */
  const unknownFacts = useMemo(
    () => (formData.timePrecision === 'unknown' ? computeChartFacts(SAMPLE_PROFILE_UNKNOWN) : null),
    [formData.timePrecision]
  );

  const tierBodyTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.18, ease: [0.32, 0.72, 0, 1] as const };

  return (
    <div className="flex flex-col gap-6">
      {/* 时间精度三档（固定三档，无第四档） */}
      <div>
        <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Clock3 className="h-4 w-4 text-indigo-500 dark:text-indigo-300" strokeWidth={1.9} />
          你知道自己的出生时间吗
        </span>
        <div
          className="grid grid-cols-3 rounded-2xl border border-slate-200/90 bg-white/60 p-1 dark:border-white/[0.12] dark:bg-white/5"
          role="radiogroup"
          aria-label="出生时间精度"
        >
          {PRECISIONS.map((p) => {
            const active = formData.timePrecision === p.value;
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onPatch({ timePrecision: p.value })}
                className={cn(
                  'relative flex h-11 items-center justify-center rounded-xl text-[13px] font-medium sm:text-sm',
                  'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  active ? 'text-white' : 'text-slate-500 hover:text-indigo-600 dark:text-night-muted dark:hover:text-indigo-200'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="astrology-precision-pill"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#4969E9] to-[#7C5CF6] shadow-[0_6px_16px_-4px_rgba(73,105,233,0.5)]"
                    transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 320, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 档位内容：切换时轻量淡入 */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={formData.timePrecision}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={tierBodyTransition}
        >
          {formData.timePrecision === 'accurate' && (
            <div>
              <div className="flex items-center gap-4">
                <div className="grid flex-1 grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-night-muted">时</label>
                    <select
                      value={formData.birthTime.hour}
                      disabled={disabled}
                      onChange={(e) => patchTime('hour', e.target.value)}
                      aria-label="出生小时"
                      className={cn(
                        'h-12 w-full appearance-none rounded-xl border bg-white/70 px-4 text-[15px] text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors duration-300 focus:outline-none focus:ring-2 dark:bg-white/5 dark:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60',
                        fieldErrors.birthTime
                          ? 'border-rose-400/80 focus:border-rose-400 focus:ring-rose-400/20 dark:border-rose-400/60'
                          : 'border-slate-200/90 focus:border-indigo-400 focus:ring-indigo-400/25 dark:border-white/[0.12] dark:focus:border-indigo-300/60 dark:focus:ring-indigo-300/20',
                        formData.birthTime.hour === '' && 'text-slate-400 dark:text-night-faint'
                      )}
                    >
                      <option value="" disabled>
                        时
                      </option>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={String(h)}>
                          {h} 时
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-night-muted">分</label>
                    <select
                      value={formData.birthTime.minute}
                      disabled={disabled}
                      onChange={(e) => patchTime('minute', e.target.value)}
                      aria-label="出生分钟"
                      className={cn(
                        'h-12 w-full appearance-none rounded-xl border bg-white/70 px-4 text-[15px] text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors duration-300 focus:outline-none focus:ring-2 dark:bg-white/5 dark:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60',
                        fieldErrors.birthTime
                          ? 'border-rose-400/80 focus:border-rose-400 focus:ring-rose-400/20 dark:border-rose-400/60'
                          : 'border-slate-200/90 focus:border-indigo-400 focus:ring-indigo-400/25 dark:border-white/[0.12] dark:focus:border-indigo-300/60 dark:focus:ring-indigo-300/20',
                        formData.birthTime.minute === '' && 'text-slate-400 dark:text-night-faint'
                      )}
                    >
                      <option value="" disabled>
                        分
                      </option>
                      {Array.from({ length: 60 }, (_, m) => (
                        <option key={m} value={String(m)}>
                          {String(m).padStart(2, '0')} 分
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* 小型可视化钟面：即时反馈，未选时只画空盘 */}
                <MiniClock
                  hour={hourSelected && minuteSelected ? Number(formData.birthTime.hour) : null}
                  minute={hourSelected && minuteSelected ? Number(formData.birthTime.minute) : null}
                  slot={null}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400 dark:text-night-faint">
                不默认当前时刻或任何推测值，以你填写的为准
              </p>
              <AstrologyFieldError message={fieldErrors.birthTime} />
            </div>
          )}

          {formData.timePrecision === 'approximate' && (
            <div>
              <div className="flex items-start gap-4">
                <div className="grid flex-1 grid-cols-2 gap-2.5" role="radiogroup" aria-label="大约时段">
                  {APPROXIMATE_SLOTS.map((s) => {
                    const selected = formData.approximateSlot === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => onPatch({ approximateSlot: s.value })}
                        className={cn(
                          'flex flex-col items-center justify-center rounded-xl border py-2 px-1.5 text-sm font-medium tabular-nums',
                          'transition-all duration-200 active:scale-[0.97]',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40',
                          'disabled:cursor-not-allowed disabled:opacity-60',
                          selected
                            ? 'border-transparent bg-gradient-to-r from-[#4969E9] to-[#7C5CF6] text-white shadow-[0_8px_20px_-6px_rgba(73,105,233,0.5)] ring-2 ring-indigo-400/30'
                            : 'border-slate-200/90 bg-white/60 text-slate-600 hover:border-indigo-300/70 hover:text-indigo-600 dark:border-white/[0.12] dark:bg-white/5 dark:text-slate-300 dark:hover:border-indigo-300/40 dark:hover:text-indigo-200',
                          !selected && fieldErrors.approximateSlot && 'border-rose-300/70 dark:border-rose-400/40'
                        )}
                      >
                        <span className="font-semibold">{s.label}</span>
                        <span className={cn('text-[11px] font-normal leading-tight mt-0.5', selected ? 'text-white/80' : 'text-slate-400 dark:text-night-faint')}>
                          {s.rangeHint}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* 时段弧带钟面 */}
                <MiniClock hour={null} minute={null} slot={formData.approximateSlot || null} />
              </div>
              <AstrologyFieldError message={fieldErrors.approximateSlot} />
              {/* 琥珀色正面徽章：正面表述，不用红色警告、不用百分比 */}
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3.5 py-2.5 text-xs leading-relaxed text-amber-700 dark:border-amber-300/25 dark:bg-amber-400/10 dark:text-amber-200">
                <SunMedium className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                大约时段也可以生成星盘：仅展示经稳定性校验的结论，不稳定内容将明确隐藏。
              </p>
            </div>
          )}

          {formData.timePrecision === 'unknown' && unknownFacts && (
            <div className="rounded-2xl border border-indigo-200/90 bg-white/80 p-4 shadow-sm backdrop-blur-md dark:border-indigo-300/20 dark:bg-[#0B1026]/90 dark:shadow-[0_8px_24px_-6px_rgba(2,6,23,0.6)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* 无宫位行星环圆盘：约 40% 卡宽，真正看得清的视觉锚点 */}
                <div className="mx-auto w-32 shrink-0 sm:w-[38%] sm:max-w-40">
                  <AstrologyChartWheel facts={unknownFacts} />
                </div>
                <div className="grid flex-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">本次可看到</p>
                    <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-500 dark:text-night-muted">
                      <li>· 太阳、月亮与行星星座</li>
                      <li>· 主要相位关系</li>
                    </ul>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">
                      <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />
                      补充出生时间后可解锁
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-500 dark:text-night-muted">
                      <li>· 上升与天顶</li>
                      <li>· 十二宫位</li>
                      <li>· 更精细的相位结论</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 出生城市：必须精确选中（保存经纬度与 IANA 时区） */}
      <div>
        <label
          htmlFor="astrology-city-input"
          className="mb-2 flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          <MapPin className="h-4 w-4 text-indigo-500 dark:text-indigo-300" strokeWidth={1.9} />
          <span>出生城市</span>
        </label>
        <div className="relative">
          <input
            id="astrology-city-input"
            type="text"
            role="combobox"
            aria-expanded={cityOpen && cityResults.length > 0 && !citySelected}
            aria-autocomplete="list"
            aria-controls="astrology-city-listbox"
            aria-activedescendant={highlightedIndex >= 0 ? `city-opt-${highlightedIndex}` : undefined}
            value={cityQuery}
            disabled={disabled}
            autoComplete="off"
            placeholder="搜索城市中文名或拼音，从候选中选择"
            onKeyDown={handleCityKeyDown}
            onChange={(e) => {
              setCityQuery(e.target.value);
              setCityOpen(true);
              setHighlightedIndex(0);
              // 重新编辑即作废已选城市，模糊文本不允许提交
              if (citySelected) {
                onPatch({ location: { name: '', lat: null, lon: null, timezone: null } });
              }
            }}
            onFocus={() => {
              if (cityQuery.trim()) {
                setCityOpen(true);
                setHighlightedIndex(0);
              }
            }}
            onBlur={() => setCityOpen(false)}
            className={cn(
              'h-12 w-full rounded-xl border bg-white/70 px-4 text-[15px] text-slate-800 backdrop-blur-sm',
              'shadow-[0_1px_3px_rgba(15,23,42,0.05)] placeholder:text-slate-400',
              'transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-0',
              'dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-night-faint',
              'disabled:cursor-not-allowed disabled:opacity-60',
              fieldErrors.location
                ? 'border-rose-400/80 focus:border-rose-400 focus:ring-rose-400/25 dark:border-rose-400/60 dark:focus:ring-rose-400/20'
                : citySelected
                  ? 'border-indigo-400/80 focus:border-indigo-400 focus:ring-indigo-400/25 dark:border-indigo-300/60'
                  : 'border-slate-200/90 hover:border-slate-300 focus:border-indigo-400 focus:ring-indigo-400/25 dark:border-white/[0.12] dark:hover:border-white/20 dark:focus:border-indigo-300/60 dark:focus:ring-indigo-300/20'
            )}
          />
          {/* 候选列表（onMouseDown 阻止 blur 先关列表） */}
          {cityOpen && cityQuery.trim() !== '' && !citySelected && (
            <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-[#0D1226]/95">
              {cityResults.length > 0 ? (
                <ul
                  id="astrology-city-listbox"
                  role="listbox"
                  aria-label="城市候选列表"
                  className="max-h-56 overflow-y-auto py-1.5 custom-scrollbar"
                >
                  {cityResults.map((c, idx) => {
                    const isHighlighted = highlightedIndex === idx;
                    return (
                      <li key={c.name} role="none">
                        <button
                          id={`city-opt-${idx}`}
                          type="button"
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectCity(c);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors',
                            isHighlighted
                              ? 'bg-indigo-50/90 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-200'
                              : 'text-slate-700 hover:bg-indigo-50/60 dark:text-slate-200 dark:hover:bg-indigo-400/10'
                          )}
                        >
                          <span className="text-sm font-medium">{c.name}</span>
                          <span className="text-xs text-slate-400 dark:text-night-faint">{c.timezone}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-3 text-xs text-slate-400 dark:text-night-faint">
                  未找到该城市，请换中文名或拼音试试
                </p>
              )}
            </div>
          )}
        </div>
        <AstrologyFieldError message={fieldErrors.location} />

        {/* 时区可读确认条 */}
        <AnimatePresence initial={false}>
          {citySelected && timezoneConfirm && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden text-xs font-medium text-indigo-600 dark:text-indigo-300"
            >
              <span className="flex items-center gap-1.5 pt-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {timezoneConfirm}
              </span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* 资料影响说明：可展开，先讲可得、后讲边界 */}
      <div className="rounded-2xl border border-slate-200/70 bg-white/50 dark:border-white/10 dark:bg-white/[0.03]">
        <button
          type="button"
          onClick={() => setImpactOpen((v) => !v)}
          aria-expanded={impactOpen}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-200"
        >
          <span className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-300" strokeWidth={1.9} />
            这些资料会如何影响星盘
          </span>
          <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', impactOpen && 'rotate-180')} strokeWidth={1.9} />
        </button>
        <AnimatePresence initial={false}>
          {impactOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <ul className="space-y-1.5 px-4 pb-3.5 text-xs leading-relaxed text-slate-500 dark:text-night-muted">
                <li>· 即使不知道出生时间：太阳、月亮与行星星座依然准确，主要相位也会列出。</li>
                <li>· 补充出生时间后可解锁：上升、天顶与十二宫位，以及更精细的相位结论。</li>
                <li>· 大约时段会经过稳定性校验，不稳定的内容将明确隐藏，不会编造。</li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
