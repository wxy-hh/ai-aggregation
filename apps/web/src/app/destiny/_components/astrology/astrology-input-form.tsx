'use client';

/**
 * 星座寰宇 · 两步出生资料表单
 *
 * 第一步：身份与阳历出生日期（昵称可选、关注主题单选、太阳星座即时预览）。
 * 第二步：时间与地点（三档时间精度、条件时间输入、城市搜索、时区确认）。
 *
 * 视觉遵循 DESIGN.md：表单卡用高对比实体底（G-2），仅外层英雄容器用 G-3 玻璃；
 * 太阳星座提示像被定位的星点由 0→1 淡入；主题选择一次 200ms 微缩放回弹。
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Sparkles, Clock, MapPin, ShieldCheck, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '../layout/glass-card';
import {
  destinyPrimaryBtnClass,
  destinySecondaryBtnClass,
} from '../layout/destiny-result-header';
import { useAstrologyWorkspaceStore } from '@/stores/astrology-workspace-store';
import { AstrologyCitySearch } from './astrology-city-search';
import {
  FOCUS_THEMES,
  TIME_PRECISION_OPTIONS,
  APPROXIMATE_RANGES,
  sunSignPreview,
  validateStepOne,
  validateStepTwo,
} from './astrology-form-utils';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';
const inputClass = cn(
  'h-11 w-full rounded-xl border border-slate-200/50 bg-white/80 px-4 text-sm text-slate-800',
  'backdrop-blur-xl outline-none transition-all duration-200 placeholder:text-slate-400',
  'focus:border-blue-500/50 focus:bg-white/95 focus:ring-2 focus:ring-blue-500/10',
  'dark:border-slate-800/50 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:bg-slate-950/90'
);

export function AstrologyInputForm({ onSubmit }: { onSubmit: () => void }) {
  const formData = useAstrologyWorkspaceStore((s) => s.formData);
  const formStep = useAstrologyWorkspaceStore((s) => s.formStep);
  const fieldErrors = useAstrologyWorkspaceStore((s) => s.fieldErrors);
  const blockingLoading = useAstrologyWorkspaceStore((s) => s.blockingLoading);
  const setFormField = useAstrologyWorkspaceStore((s) => s.setFormField);
  const setFormStep = useAstrologyWorkspaceStore((s) => s.setFormStep);
  const setFieldErrors = useAstrologyWorkspaceStore((s) => s.setFieldErrors);

  const [showRangeInfo, setShowRangeInfo] = useState(false);

  const sunSign = useMemo(
    () => sunSignPreview(formData.solarDate.month, formData.solarDate.day),
    [formData.solarDate.month, formData.solarDate.day]
  );

  const goNext = () => {
    const errors = validateStepOne(formData);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setFormStep(2);
  };

  const goBack = () => setFormStep(1);

  const handleSubmit = () => {
    const errors = validateStepTwo(formData);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) onSubmit();
  };

  return (
    <GlassCard variant="hero" className="relative p-5 sm:p-8">
      {/* 顶部高光线 */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/20" />

      {/* 步骤指示 */}
      <div className="mb-6 flex items-center gap-3">
        {[1, 2].map((n) => (
          <React.Fragment key={n}>
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300',
                formStep === n
                  ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-[0_0_16px_rgba(59,130,246,0.4)]'
                  : 'border border-slate-300/60 text-slate-400 dark:border-white/15'
              )}
            >
              {n}
            </div>
            {n === 1 && (
              <div
                className={cn(
                  'h-px flex-1 transition-colors duration-500',
                  formStep === 2 ? 'bg-blue-500/60' : 'bg-slate-200 dark:bg-white/10'
                )}
              />
            )}
          </React.Fragment>
        ))}
        <span className="ml-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          {formStep === 1 ? '身份与出生日期' : '时间与地点'}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {formStep === 1 ? (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="space-y-5"
          >
            {/* 昵称 */}
            <div>
              <label htmlFor="astrology-name" className={labelClass}>
                姓名或昵称 <span className="font-normal normal-case text-slate-400">（可选）</span>
              </label>
              <input
                id="astrology-name"
                type="text"
                value={formData.name}
                disabled={blockingLoading}
                onChange={(e) => setFormField('name', e.target.value)}
                placeholder="例如：小宇"
                className={inputClass}
              />
              {fieldErrors.name && <p className="ml-1 mt-1.5 text-[11px] font-medium text-rose-500">{fieldErrors.name}</p>}
            </div>

            {/* 阳历出生日期 */}
            <div>
              <label className={labelClass}>
                阳历出生日期 <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: 'year', ph: '年', min: 1900, max: 2100 },
                    { key: 'month', ph: '月', min: 1, max: 12 },
                    { key: 'day', ph: '日', min: 1, max: 31 },
                  ] as const
                ).map(({ key, ph, min, max }) => (
                  <input
                    key={key}
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    value={formData.solarDate[key]}
                    disabled={blockingLoading}
                    aria-label={`出生${ph}`}
                    onChange={(e) =>
                      setFormField('solarDate', { ...formData.solarDate, [key]: parseInt(e.target.value, 10) || 0 })
                    }
                    placeholder={ph}
                    className={inputClass}
                  />
                ))}
              </div>
              <p className="ml-1 mt-1.5 text-[11px] text-slate-400">现代占星以阳历生日计算</p>
              {fieldErrors.solarDate && (
                <p className="ml-1 mt-1 text-[11px] font-medium text-rose-500">{fieldErrors.solarDate}</p>
              )}

              {/* 太阳星座即时预览：像被定位的星点由 0→1 淡入 */}
              <AnimatePresence>
                {sunSign && !fieldErrors.solarDate && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/8 px-3 py-1.5 dark:border-indigo-400/25 dark:bg-indigo-500/10"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-blue-500 dark:text-indigo-400" />
                    <span className="text-xs font-semibold text-blue-700 dark:text-indigo-300">
                      你的太阳星座：{sunSign.label}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 关注主题（可选单选） */}
            <div>
              <label className={labelClass}>
                关注主题 <span className="font-normal normal-case text-slate-400">（可选，用于排序报告）</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FOCUS_THEMES.map((theme) => {
                  const active = formData.focusTheme === theme.key;
                  return (
                    <motion.button
                      key={theme.key}
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => setFormField('focusTheme', theme.key)}
                      disabled={blockingLoading}
                      aria-pressed={active}
                      className={cn(
                        'flex min-h-11 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all duration-200',
                        active
                          ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_14px_rgba(59,130,246,0.15)] dark:border-indigo-400/40 dark:bg-indigo-500/15'
                          : 'border-slate-200/60 bg-white/50 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/40 dark:hover:border-white/20'
                      )}
                    >
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          active ? 'text-blue-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'
                        )}
                      >
                        {theme.label}
                      </span>
                      <span className="mt-0.5 text-[10px] leading-tight text-slate-400">{theme.description}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* 隐私提示 */}
            <div className="flex items-start gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5 dark:border-white/10 dark:bg-slate-800/30">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                出生资料仅用于本次星盘计算与统一历史记录中的该条结果，可在历史记录删除。
              </p>
            </div>

            {/* 主操作 */}
            <div className="flex justify-end pt-1">
              <button type="button" onClick={goNext} disabled={blockingLoading} className={destinyPrimaryBtnClass}>
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" aria-hidden />
                下一步
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="space-y-5"
          >
            {/* 时间精度（固定三档） */}
            <div>
              <label className={labelClass}>
                <Clock className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                时间精度
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TIME_PRECISION_OPTIONS.map((opt) => {
                  const active = formData.timePrecision === opt.value;
                  return (
                    <motion.button
                      key={opt.value}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setFormField('timePrecision', opt.value)}
                      disabled={blockingLoading}
                      aria-pressed={active}
                      className={cn(
                        'flex min-h-11 flex-col items-center rounded-xl border px-2 py-2.5 text-center transition-all duration-200',
                        active
                          ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_14px_rgba(59,130,246,0.15)] dark:border-indigo-400/40 dark:bg-indigo-500/15'
                          : 'border-slate-200/60 bg-white/50 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/40 dark:hover:border-white/20'
                      )}
                    >
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          active ? 'text-blue-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'
                        )}
                      >
                        {opt.label}
                      </span>
                      <span className="mt-0.5 text-[10px] leading-tight text-slate-400">{opt.hint}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* 条件时间输入 */}
            <AnimatePresence mode="wait">
              {formData.timePrecision === 'minute' && (
                <motion.div
                  key="minute"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <label className={labelClass}>出生时间（时:分）</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={23}
                      placeholder="时"
                      aria-label="出生小时"
                      value={formData.birthTime?.hour ?? ''}
                      disabled={blockingLoading}
                      onChange={(e) =>
                        setFormField('birthTime', {
                          hour: Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)),
                          minute: formData.birthTime?.minute ?? 0,
                        })
                      }
                      className={inputClass}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      placeholder="分"
                      aria-label="出生分钟"
                      value={formData.birthTime?.minute ?? ''}
                      disabled={blockingLoading}
                      onChange={(e) =>
                        setFormField('birthTime', {
                          hour: formData.birthTime?.hour ?? 0,
                          minute: Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                  {fieldErrors.birthTime && (
                    <p className="ml-1 mt-1.5 text-[11px] font-medium text-rose-500">{fieldErrors.birthTime}</p>
                  )}
                </motion.div>
              )}

              {formData.timePrecision === 'approximate' && (
                <motion.div
                  key="approximate"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <label className={labelClass}>大致出生时段</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {APPROXIMATE_RANGES.map((range) => {
                      const active =
                        formData.approximateRange?.localStart === range.localStart &&
                        formData.approximateRange?.localEnd === range.localEnd;
                      return (
                        <motion.button
                          key={range.label}
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() =>
                            setFormField('approximateRange', { localStart: range.localStart, localEnd: range.localEnd })
                          }
                          disabled={blockingLoading}
                          aria-pressed={active}
                          className={cn(
                            'min-h-11 rounded-xl border px-2 py-2 text-xs font-semibold transition-all duration-200',
                            active
                              ? 'border-violet-500/50 bg-violet-500/10 text-violet-700 shadow-[0_0_14px_rgba(139,92,246,0.15)] dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-300'
                              : 'border-slate-200/60 bg-white/50 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:border-white/20'
                          )}
                        >
                          {range.label}
                        </motion.button>
                      );
                    })}
                  </div>
                  {fieldErrors.approximateRange && (
                    <p className="ml-1 mt-1.5 text-[11px] font-medium text-rose-500">{fieldErrors.approximateRange}</p>
                  )}
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/8 px-2.5 py-1 dark:border-violet-400/25 dark:bg-violet-500/10">
                    <Info className="h-3 w-3 text-violet-500 dark:text-violet-400" />
                    <span className="text-[10px] font-medium text-violet-600 dark:text-violet-300">
                      约时，部分盘面范围可能不稳定
                    </span>
                  </div>
                </motion.div>
              )}

              {formData.timePrecision === 'unknown' && (
                <motion.div
                  key="unknown"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-3 dark:border-indigo-400/20 dark:bg-indigo-500/10"
                >
                  <p className="text-xs leading-relaxed text-indigo-700 dark:text-indigo-300">
                    不知道出生时间也可以继续。我们将生成无宫位本命盘：可查看太阳、月亮与行星星座及主要相位；
                    将隐藏上升、天顶、十二宫与宫位解读。
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 出生城市 */}
            <div>
              <label className={labelClass}>
                <MapPin className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                出生地点 <span className="text-rose-500">*</span>
              </label>
              <AstrologyCitySearch
                value={formData.location}
                onChange={(loc) => setFormField('location', loc)}
                error={fieldErrors.location}
                disabled={blockingLoading}
              />
              {/* 时区确认 */}
              {formData.location.lat != null && formData.location.lon != null && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="ml-1 mt-2 text-[11px] text-slate-500 dark:text-slate-400"
                >
                  {formData.location.name} · Asia/Shanghai · {formData.solarDate.year} 年当地时间
                </motion.p>
              )}
            </div>

            {/* 资料影响提示（可展开） */}
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 dark:border-white/10 dark:bg-slate-800/30">
              <button
                type="button"
                onClick={() => setShowRangeInfo((v) => !v)}
                aria-expanded={showRangeInfo}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left"
              >
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  时间对结果的影响
                </span>
                <Info className="h-3.5 w-3.5 text-slate-400" />
              </button>
              <AnimatePresence>
                {showRangeInfo && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="px-3 pb-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      时间影响上升、宫位与天顶；不知道时间时，我们不会生成这些内容。补充出生时间后可重新计算，解锁更完整的盘面。
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 操作区 */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={goBack}
                disabled={blockingLoading}
                className={destinySecondaryBtnClass}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                返回上一步
              </button>
              <div className="flex flex-col items-end gap-1">
                <button type="button" onClick={handleSubmit} disabled={blockingLoading} className={destinyPrimaryBtnClass}>
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" aria-hidden />
                  绘制我的星盘
                </button>
                {formData.timePrecision === 'unknown' && (
                  <span className="text-[10px] text-slate-400">将生成无宫位本命盘</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
