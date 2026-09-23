'use client';

/**
 * astrology-form-step1.tsx —— 两步表单 · 第一步「基本资料」（设计文档 §6.3）
 *
 * 昵称（可选）/ 阳历出生日期（必填，年月日三选）/ 关注主题（可空单选四胶囊）/
 * 隐私提示一行 / 太阳星座预览条（日期合法时浮出，蓝紫系，只展示确定事实）。
 * 本组件为受控组件：数据与错误都在工作区 store，这里只负责呈现与转发修改。
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, Compass, Lock, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { approximateSunSign, ZODIAC_DATE_RANGE } from '@/lib/astrology/solar-longitude';
import { isValidBirthDate } from './astrology-mappers';
import { ZODIAC_CN } from './astrology-chart-wheel';
import { ZodiacSignGlyph } from './astrology-glyphs';
import { ASTROLOGY_CTA_GRADIENT_CLASS } from './astrology-cta-button';
import type { AstrologyFormData, AstrologyTopic } from '../astrology-types';

/* ---------- 本地组件 ---------- */

/** 字段标签：小图标 + 文案 + 可选标记，语义化 label 关联输入框 */
function FieldLabel({
  icon: Icon,
  children,
  htmlFor,
  optional,
}: {
  icon: typeof User;
  children: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"
    >
      <Icon className="h-4 w-4 text-indigo-500 dark:text-indigo-300" strokeWidth={1.9} />
      <span>{children}</span>
      {optional && <span className="text-xs font-normal text-day-muted dark:text-night-faint">（可选）</span>}
    </label>
  );
}

/** 字段错误：柔和玫瑰红一行说明，动画进出，不打断表单骨架；id 供输入控件 aria-describedby 关联 */
export function AstrologyFieldError({ id, message }: { id?: string; message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          id={id}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden text-xs leading-relaxed text-rose-500 dark:text-rose-300"
          role="alert"
        >
          <span className="block pt-1.5">{message}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** 输入壳样式：错误时玫瑰红边框，修正后经平滑过渡回到平台焦点 */
const inputShell = (hasError: boolean) =>
  cn(
    'h-12 w-full rounded-xl border bg-white/70 px-4 text-[15px] text-slate-800 backdrop-blur-sm backdrop-saturate-150',
    'shadow-[0_1px_3px_rgba(15,23,42,0.05)] placeholder:text-day-muted',
    'transition-all duration-300',
    'focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-0',
    'dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-night-faint',
    'disabled:cursor-not-allowed disabled:opacity-60',
    hasError
      ? 'border-rose-400/80 focus:border-rose-400 focus:ring-rose-400/25 dark:border-rose-400/60 dark:focus:ring-rose-400/20'
      : 'border-slate-200/90 hover:border-slate-300 focus:border-indigo-400 focus:ring-indigo-400/25 dark:border-white/[0.12] dark:hover:border-white/20 dark:focus:border-indigo-300/60 dark:focus:ring-indigo-300/25'
  );

/** 带自定义下拉箭头的原生选择器（移动端弹系统滚轮，热区 48px） */
function SelectField({
  id,
  value,
  placeholder,
  options,
  disabled,
  hasError,
  describedBy,
  onChange,
  ariaLabel,
}: {
  id?: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  hasError?: boolean;
  /** 错误文案元素 id：仅在出错时由调用方传入，避免指向不存在的引用 */
  describedBy?: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        aria-invalid={Boolean(hasError)}
        aria-describedby={describedBy}
        className={cn(inputShell(Boolean(hasError)), 'appearance-none pr-9', value === '' && 'text-day-muted dark:text-night-faint')}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-day-muted dark:text-night-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6.5 L8 10.5 L12 6.5" />
      </svg>
    </div>
  );
}

/** 关注主题四胶囊（可空单选，用于排序报告而非改变盘面） */
const TOPICS: Array<{ value: AstrologyTopic; label: string }> = [
  { value: 'self', label: '认识自己' },
  { value: 'love', label: '感情关系' },
  { value: 'career', label: '事业方向' },
  { value: 'recent', label: '近期状态' },
];

/* ---------- 第一步表单 ---------- */

/** 日期三选共用同一行错误说明：稳定 id 供三个选择器以 aria-describedby 关联 */
const BIRTH_DATE_ERROR_ID = 'astrology-birth-date-error';

export type AstrologyFormStepProps = {
  formData: AstrologyFormData;
  fieldErrors: Partial<Record<keyof AstrologyFormData, string>>;
  /** 测算期间禁用会改变计算事实的字段（保留已填信息） */
  disabled: boolean;
  onPatch: (patch: Partial<AstrologyFormData>) => void;
};

export function AstrologyFormStep1({ formData, fieldErrors, disabled, onPatch }: AstrologyFormStepProps) {
  const reduceMotion = useReducedMotion();
  const birthDateError = fieldErrors.birthDate;
  /** 步骤根节点：校验失败时在步骤内部找第一个出错的控件聚焦（键盘/读屏用户不必自己找） */
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * 提交校验失败后聚焦第一个出错的控件（本步只有出生日期）。
   * 依赖 fieldErrors 的对象身份：每次校验失败 store 都会换一个新对象，
   * 因此「连续两次点继续」同样会把焦点带回来；校验通过时下发空对象，effect 不命中分支。
   */
  useEffect(() => {
    if (fieldErrors.birthDate) {
      rootRef.current?.querySelector<HTMLSelectElement>('#astrology-birth-year')?.focus();
    }
  }, [fieldErrors]);

  /** 日期部分选择本地态：三项齐全才写入 store（保证 birthDate 要么完整要么 null） */
  const [partial, setPartial] = useState<{ year: number | ''; month: number | ''; day: number | '' }>(() => ({
    year: formData.birthDate?.year ?? '',
    month: formData.birthDate?.month ?? '',
    day: formData.birthDate?.day ?? '',
  }));

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const dim =
    partial.year !== '' && partial.month !== '' ? new Date(partial.year, partial.month, 0).getDate() : 31;
  const days = Array.from({ length: dim }, (_, i) => i + 1);

  const updateDatePart = (part: 'year' | 'month' | 'day', raw: string) => {
    const next = { ...partial, [part]: raw === '' ? '' : Number(raw) };
    // 年/月变化后日超出当月天数时收敛（如 2 月 29 日 → 平年 28 日）
    if (next.year !== '' && next.month !== '' && next.day !== '') {
      const cap = new Date(next.year, next.month, 0).getDate();
      if (next.day > cap) next.day = cap;
    }
    setPartial(next);
    onPatch({
      birthDate:
        next.year !== '' && next.month !== '' && next.day !== ''
          ? { year: next.year, month: next.month, day: next.day }
          : null,
    });
  };

  const dateReady = isValidBirthDate(formData.birthDate);
  const sunSign = dateReady ? approximateSunSign(formData.birthDate!) : null;

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      {/* 昵称（可选） */}
      <div>
        <FieldLabel icon={User} htmlFor="astrology-name-input" optional>
          怎么称呼你
        </FieldLabel>
        <input
          id="astrology-name-input"
          type="text"
          value={formData.name}
          disabled={disabled}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="例如：小宇"
          maxLength={20}
          autoComplete="off"
          className={inputShell(false)}
        />
      </div>

      {/* 阳历出生日期（必填） */}
      <div>
        <FieldLabel icon={CalendarDays} htmlFor="astrology-birth-year">
          阳历出生日期
        </FieldLabel>
        <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-2.5">
          <SelectField
            id="astrology-birth-year"
            value={partial.year === '' ? '' : String(partial.year)}
            placeholder="年"
            ariaLabel="出生年份"
            disabled={disabled}
            hasError={Boolean(birthDateError)}
            describedBy={birthDateError ? BIRTH_DATE_ERROR_ID : undefined}
            options={years.map((y) => ({ value: String(y), label: `${y} 年` }))}
            onChange={(v) => updateDatePart('year', v)}
          />
          <SelectField
            id="astrology-birth-month"
            value={partial.month === '' ? '' : String(partial.month)}
            placeholder="月"
            ariaLabel="出生月份"
            disabled={disabled}
            hasError={Boolean(birthDateError)}
            describedBy={birthDateError ? BIRTH_DATE_ERROR_ID : undefined}
            options={months.map((m) => ({ value: String(m), label: `${m} 月` }))}
            onChange={(v) => updateDatePart('month', v)}
          />
          <SelectField
            id="astrology-birth-day"
            value={partial.day === '' ? '' : String(partial.day)}
            placeholder="日"
            ariaLabel="出生日"
            disabled={disabled}
            hasError={Boolean(birthDateError)}
            describedBy={birthDateError ? BIRTH_DATE_ERROR_ID : undefined}
            options={days.map((d) => ({ value: String(d), label: `${d} 日` }))}
            onChange={(v) => updateDatePart('day', v)}
          />
        </div>
        <p className="mt-2 text-xs text-day-muted dark:text-night-faint">现代占星以阳历生日计算</p>
        <AstrologyFieldError id={BIRTH_DATE_ERROR_ID} message={birthDateError} />

        {/* 太阳星座预览条：日期合法时从卡片边缘克制浮出（深空微晶质感，只展示确定事实） */}
        <AnimatePresence initial={false}>
          {dateReady && sunSign && (
            <motion.div
              key={sunSign}
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={reduceMotion ? { duration: 0.01 } : { duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-center gap-3.5 rounded-2xl border border-indigo-200/90 bg-white/80 p-3.5 shadow-[0_8px_20px_-6px_rgba(73,105,233,0.12)] backdrop-blur-md backdrop-saturate-150 dark:border-indigo-300/20 dark:bg-[#0B1026]/[0.88] dark:shadow-[0_8px_24px_-6px_rgba(2,6,23,0.6)]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-100/90 bg-indigo-50/80 text-indigo-600 shadow-sm dark:border-indigo-300/20 dark:bg-white/5 dark:text-indigo-300">
                  <ZodiacSignGlyph sign={sunSign} className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {/* 口径自述：预览条只按出生日期测算太阳星座，与结果页（含时间精度的完整盘）不同源 */}
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      太阳星座（按日期测算）· {ZODIAC_CN[sunSign]}
                    </span>
                    <span className="rounded-full border border-indigo-200/70 bg-indigo-50/90 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
                      黄道经度已锁定
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-night-muted">
                    {ZODIAC_DATE_RANGE[sunSign]} · 其余星体与十二宫位将在下一步时空校准后揭示
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 关注主题（可空单选） */}
      <div>
        <FieldLabel icon={Compass} optional>
          你最想看懂哪一部分
        </FieldLabel>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label="关注主题">
          {TOPICS.map((t) => {
            const selected = formData.topic === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onPatch({ topic: selected ? null : t.value })}
                className={cn(
                  'flex h-11 items-center justify-center rounded-full border text-sm font-medium',
                  'transition-all duration-200 active:scale-[0.97]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  selected
                    ? cn(
                        'border-transparent text-white shadow-[0_8px_20px_-6px_rgba(73,105,233,0.5)] ring-2 ring-indigo-400/30',
                        ASTROLOGY_CTA_GRADIENT_CLASS
                      )
                    : 'border-slate-200/90 bg-white/60 text-slate-600 hover:border-indigo-300/70 hover:text-indigo-600 dark:border-white/[0.12] dark:bg-white/5 dark:text-slate-300 dark:hover:border-indigo-300/40 dark:hover:text-indigo-200'
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-day-muted dark:text-night-faint">用于调整报告的阅读顺序，不改变盘面</p>
      </div>

      {/* 隐私提示 */}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-day-muted dark:text-night-faint">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        出生资料仅用于本次星盘计算与统一历史记录中的该条结果，可在历史记录删除。
      </p>
    </div>
  );
}
