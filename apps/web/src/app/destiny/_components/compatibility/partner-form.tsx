'use client';

import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Heart, Info, Shield, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RELATION_OPTIONS } from './constants';
import type { PartnerProfileForm, RelationType } from './types';

type PartnerFormProps = {
  selfSummary: { name: string; birthText: string; locationText?: string };
  value: PartnerProfileForm;
  relationType: RelationType;
  submitting?: boolean;
  error?: string | null;
  onRelationChange: (next: RelationType) => void;
  onChange: (patch: Partial<PartnerProfileForm>) => void;
  onBack: () => void;
  onSubmit: () => void;
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];
const YEARS = Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 10 - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** 与八字输入表单对齐的外壳 / 分区 / 控件样式 */
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
  'h-11 w-full rounded-xl border border-slate-200/50 bg-white/80 px-3 text-sm text-slate-700 outline-none',
  'shadow-[0_1px_2px_0_rgba(0,0,0,0.03),0_1px_1px_0_rgba(0,0,0,0.02)]',
  'transition-all duration-200',
  'focus:border-blue-500/50 focus:bg-white/95 focus:ring-2 focus:ring-blue-500/10',
  'dark:border-slate-800/50 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-400'
);

const segmentListClass = cn(
  'grid h-11 grid-cols-2 rounded-xl border border-slate-200/50 bg-white/40 p-1',
  'shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] backdrop-blur-md',
  'dark:border-white/10 dark:bg-slate-900/40'
);

const primaryBtnClass = cn(
  'relative inline-flex min-h-11 items-center justify-center overflow-hidden rounded-full px-6 text-sm font-semibold text-white',
  'bg-gradient-to-r from-blue-600 to-indigo-600',
  'shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  'transition-all duration-200',
  'hover:scale-[1.02] hover:shadow-[0_12px_20px_-8px_rgba(59,130,246,0.25)]',
  'active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
  'disabled:pointer-events-none disabled:opacity-40'
);

const secondaryBtnClass = cn(
  'relative inline-flex min-h-11 items-center justify-center overflow-hidden rounded-full border border-slate-200/50 px-6 text-sm font-semibold',
  'bg-white/40 text-slate-700 backdrop-blur-xl',
  'shadow-[0_1px_2px_0_rgba(0,0,0,0.03),0_1px_1px_0_rgba(0,0,0,0.02)]',
  'transition-all duration-200',
  'hover:scale-[1.02] hover:bg-white/60 hover:shadow-[0_0_15px_rgba(59,130,246,0.15)]',
  'active:scale-[0.98]',
  'dark:border-slate-800/50 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/60',
  'disabled:pointer-events-none disabled:opacity-40'
);

const sectionTitleClass =
  'flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-200';

const iconAccentClass = 'h-4 w-4 text-blue-500 dark:text-blue-400';

export function CompatibilityPartnerForm({
  selfSummary,
  value,
  relationType,
  submitting,
  error,
  onRelationChange,
  onChange,
  onBack,
  onSubmit,
}: PartnerFormProps) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  const relationMeta = RELATION_OPTIONS.find((r) => r.key === relationType)!;

  const canSubmit = useMemo(() => {
    if (!value.consentConfirmed) return false;
    if (!value.birthDate.year || !value.birthDate.month || !value.birthDate.day) return false;
    if (!value.locationSkipped && !value.location?.name?.trim()) return false;
    return true;
  }, [value]);

  const submitHint = useMemo(() => {
    if (canSubmit || submitting) return null;
    if (!value.birthDate.year || !value.birthDate.month || !value.birthDate.day) {
      return '请先选择出生日期';
    }
    if (!value.locationSkipped && !value.location?.name?.trim()) {
      return '请填写出生地点，或点「暂不提供地点」';
    }
    if (!value.consentConfirmed) return '请勾选对方同意后再生成';
    return null;
  }, [canSubmit, submitting, value]);

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1 custom-scrollbar">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-6 sm:gap-5">
        {/* 顶栏：返回 + 进度，与八字工作区标题行气质一致 */}
        <header className="flex items-center justify-between gap-3 px-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 min-w-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-800/50"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <div className="text-center">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">八字合盘</div>
            <div className="text-[11px] text-slate-400">补充 TA 资料</div>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400">
            2/3
          </span>
        </header>

        {/* 与八字「生辰信息输入」同构的玻璃外壳 */}
        <div className={shellClass}>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/20"
            aria-hidden
          />

          {/* 标题 */}
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
                  补充 TA 的出生信息
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  信息越完整，合盘解读越贴近你们的相处节奏
                </p>
              </div>
            </div>
          </div>

          {/* 顶部关系条：我的就绪 + 关系类型 */}
          <div className={cn(panelClass, 'relative mt-4 space-y-4 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)] transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] motion-reduce:transition-none motion-reduce:hover:scale-100')}>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200/40 bg-blue-50/60 px-4 py-3 dark:border-blue-400/15 dark:bg-blue-950/25">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shadow-sm">
                  我
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {selfSummary.name}
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {selfSummary.birthText}
                    {selfSummary.locationText ? ` · ${selfSummary.locationText}` : ''}
                  </div>
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                已就绪
              </span>
            </div>

            <div>
              <h3 className={sectionTitleClass}>
                <Heart className={iconAccentClass} />
                关系类型
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {RELATION_OPTIONS.map((opt) => {
                  const active = relationType === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => onRelationChange(opt.key)}
                      className={cn(
                        'min-h-[56px] rounded-2xl border px-3 py-3 text-left transition-all duration-200',
                        active
                          ? 'border-blue-500/40 bg-white text-blue-700 shadow-sm ring-1 ring-blue-500/20 dark:bg-slate-800 dark:text-blue-300'
                          : 'border-slate-200/50 bg-white/40 text-slate-600 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)] hover:scale-[1.01] hover:border-slate-300 hover:bg-white/70 hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] motion-reduce:transition-none motion-reduce:hover:scale-100 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300'
                      )}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="mt-0.5 line-clamp-2 text-[10px] opacity-70">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 主内容：左表单 + 右说明，参考八字 2 列分区 */}
          <div className="relative mt-6 grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-8">
              {/* TA 的资料 */}
              <section className={cn(panelClass, 'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)] transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] motion-reduce:transition-none motion-reduce:hover:scale-100')}>
                <h3 className={sectionTitleClass}>
                  <UserRound className={iconAccentClass} />
                  TA 的资料
                </h3>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="称呼（可选）">
                    <input
                      value={value.displayName}
                      onChange={(e) => onChange({ displayName: e.target.value })}
                      placeholder="如：小星 / 同事 A"
                      className={inputClass}
                      disabled={submitting}
                    />
                  </Field>

                  <Field label="性别（可选）">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          ['male', '男'],
                          ['female', '女'],
                          ['unspecified', '暂不填写'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          disabled={submitting}
                          onClick={() => onChange({ gender: key })}
                          className={cn(
                            'h-11 rounded-xl border text-xs font-semibold transition-all',
                            value.gender === key
                              ? 'border-blue-500/40 bg-white text-blue-600 shadow-sm ring-1 ring-blue-500/20 dark:bg-slate-800 dark:text-blue-400'
                              : 'border-slate-200/50 bg-white/40 text-slate-600 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="历法">
                    <div className={segmentListClass}>
                      {(
                        [
                          ['solar', '公历'],
                          ['lunar', '农历'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          disabled={submitting}
                          onClick={() => onChange({ calendarType: key })}
                          className={cn(
                            'rounded-lg text-sm font-semibold transition-all duration-200',
                            value.calendarType === key
                              ? 'bg-white text-blue-600 shadow-sm ring-1 ring-blue-500/20 dark:bg-slate-800 dark:text-blue-400'
                              : 'text-slate-600 hover:text-slate-800 dark:text-slate-300'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="出生日期">
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        className={inputClass}
                        value={value.birthDate.year}
                        disabled={submitting}
                        onChange={(e) =>
                          onChange({
                            birthDate: { ...value.birthDate, year: Number(e.target.value) },
                          })
                        }
                      >
                        {YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}年
                          </option>
                        ))}
                      </select>
                      <select
                        className={inputClass}
                        value={value.birthDate.month}
                        disabled={submitting}
                        onChange={(e) =>
                          onChange({
                            birthDate: { ...value.birthDate, month: Number(e.target.value) },
                          })
                        }
                      >
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>
                            {m}月
                          </option>
                        ))}
                      </select>
                      <select
                        className={inputClass}
                        value={value.birthDate.day}
                        disabled={submitting}
                        onChange={(e) =>
                          onChange({
                            birthDate: { ...value.birthDate, day: Number(e.target.value) },
                          })
                        }
                      >
                        {DAYS.map((d) => (
                          <option key={d} value={d}>
                            {d}日
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>

                  <Field label="出生时间（推荐）">
                    {value.birthTime ? (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className={inputClass}
                          value={value.birthTime.hour}
                          disabled={submitting}
                          onChange={(e) =>
                            onChange({
                              birthTime: { ...value.birthTime!, hour: e.target.value },
                            })
                          }
                        >
                          {HOURS.map((h) => (
                            <option key={h} value={h}>
                              {h}时
                            </option>
                          ))}
                        </select>
                        <select
                          className={inputClass}
                          value={value.birthTime.minute}
                          disabled={submitting}
                          onChange={(e) =>
                            onChange({
                              birthTime: { ...value.birthTime!, minute: e.target.value },
                            })
                          }
                        >
                          {MINUTES.map((m) => (
                            <option key={m} value={m}>
                              {m}分
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-200/60 bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-200">
                        将不展示依赖时柱的细节，仍可生成基础关系解读。
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={submitting}
                      className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400"
                      onClick={() =>
                        onChange({
                          birthTime: value.birthTime ? null : { hour: '12', minute: '00' },
                        })
                      }
                    >
                      {value.birthTime ? '改为不清楚出生时间' : '我知道大概时间，手动填写'}
                    </button>
                  </Field>

                  <Field label="出生地点（推荐，城市级）">
                    <input
                      value={value.location?.name ?? ''}
                      disabled={submitting || value.locationSkipped}
                      onChange={(e) =>
                        onChange({
                          location: { name: e.target.value, lat: null, lon: null },
                          locationSkipped: false,
                        })
                      }
                      placeholder="如：杭州"
                      className={cn(inputClass, value.locationSkipped && 'opacity-50')}
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400"
                      onClick={() =>
                        onChange({
                          locationSkipped: !value.locationSkipped,
                          location: value.locationSkipped ? value.location : null,
                        })
                      }
                    >
                      {value.locationSkipped ? '改为填写地点' : '暂不提供地点'}
                    </button>
                  </Field>
                </div>

                {/* 添加你想了解的事（移至此处） */}
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setFocusOpen((v) => !v)}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400"
                  >
                    {focusOpen ? '收起关心的事' : '添加你想了解的事（可选）'}
                  </button>
                  {focusOpen && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {relationMeta.focusTags.map((tag) => {
                        const on = value.focusTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              const next = on
                                ? value.focusTags.filter((t) => t !== tag)
                                : [...value.focusTags, tag];
                              onChange({ focusTags: next });
                            }}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                              on
                                ? 'border-blue-500 bg-blue-500 text-white'
                                : 'border-slate-200/60 bg-white/80 text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300'
                            )}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 同意：并入资料卡底部，与字段同一视觉层 */}
                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200/50 bg-white/50 p-3.5 dark:border-white/10 dark:bg-slate-950/40">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={value.consentConfirmed}
                    disabled={submitting}
                    onClick={() => onChange({ consentConfirmed: !value.consentConfirmed })}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                      value.consentConfirmed
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                    )}
                  >
                    {value.consentConfirmed ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                  <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    我确认已获得对方同意，仅将资料用于本次合盘解读。
                  </span>
                </label>
              </section>
            </div>

            {/* 右侧说明，对齐八字分区卡 */}
            <aside className="space-y-4 xl:col-span-4 xl:sticky xl:top-2">
              <section className={cn(panelClass, 'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)] transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] motion-reduce:transition-none motion-reduce:hover:scale-100')}>
                <h3 className={sectionTitleClass}>
                  <Info className={iconAccentClass} />
                  本次会解读
                </h3>
                <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>· 关系底色与合拍指数（非关系判决）</li>
                  <li>· 彼此需求、吸引点与摩擦提醒</li>
                  <li>· 该关系视角下的六维图谱与本周行动</li>
                </ul>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                  出生时间缺失时，仍可生成基础关系解读，结果页会标明边界。
                </p>
              </section>

              <section className={cn(panelClass, 'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)] transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] motion-reduce:transition-none motion-reduce:hover:scale-100')}>
                <h3 className={sectionTitleClass}>
                  <Shield className={iconAccentClass} />
                  隐私说明
                </h3>
                <button
                  type="button"
                  className="mt-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200"
                  onClick={() => setShowPrivacy((v) => !v)}
                >
                  仅用于本次合盘解读，不会公开展示
                  <span className="ml-1 text-slate-400">{showPrivacy ? '收起' : '展开'}</span>
                </button>
                {showPrivacy && (
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    <li>· 分享卡默认脱敏，不含精确出生资料</li>
                    <li>· 可随时删除合盘报告与 TA 资料</li>
                    <li>· 不会用资料自动联系对方</li>
                  </ul>
                )}
              </section>
            </aside>
          </div>

          {/* 错误 / 提示：与八字表单同位置语义 */}
          {error ? (
            <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          ) : null}
          {submitHint ? (
            <div className="mt-6 rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-200">
              {submitHint}
            </div>
          ) : null}

          {/* 操作区：内嵌表单底部，与「开始测算 / 重置表单」同构 */}
          <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center xl:flex xl:items-center xl:gap-3">
              <button type="button" disabled={submitting} onClick={onBack} className={secondaryBtnClass}>
                <span
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20 dark:bg-white/10"
                  aria-hidden
                />
                返回我的八字
              </button>
              <p className="text-center text-xs text-slate-500 dark:text-slate-400 xl:text-left">
                内容仅供传统文化参考 · 资料仅用于本次合盘解读
              </p>
            </div>
            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={onSubmit}
              className={cn(primaryBtnClass, 'min-h-12 px-8 sm:min-w-[180px]')}
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" aria-hidden />
              {submitting ? '准备中…' : '生成你们的八字合盘'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}
