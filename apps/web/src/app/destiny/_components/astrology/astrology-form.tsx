'use client';

/**
 * astrology-form.tsx —— 两步出生资料表单容器（设计文档 §6.3，04 工单）
 *
 * 职责：工作区 store 读写、两步状态机（横滑 250ms、返回保留已填内容）、
 * 右侧（移动端为上方）成品星盘预览——填完阳历日期后太阳节点滑向真实星座位置、
 * 「你将获得」价值摘要、sticky 底部操作位（预留安全区，不是第二条底部导航）。
 * 提交链路：内联校验 → mapFormToAstroProfile → computeChartFacts（唯一真值接缝）
 * → 缓存 chartFacts → markResultReady 进入结果页。
 */

import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronLeft, Grid3x3, Sparkles, SunMoon, Waypoints } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { computeChartFacts, SAMPLE_PROFILE_ACCURATE } from '@/lib/astrology/mock-chart-facts';
import { approximateSunLongitude, approximateSunSign } from '@/lib/astrology/solar-longitude';
import { saveAstrologyHistoryRecord } from '@/lib/astrology/history';
import { DestinyPageScaffold } from '../layout/destiny-page-scaffold';
import { AstrologyChartWheel, ZODIAC_CN } from './astrology-chart-wheel';
import { AstrologyWheel3D } from './astrology-wheel-3d';
import { AstrologyWheelSceneSwitch, useWheelSceneAvailable } from './astrology-wheel-scene-switch';
import { AstrologyStarfield } from './astrology-starfield';
import { AstrologyFormStep1 } from './astrology-form-step1';
import { AstrologyFormStep2 } from './astrology-form-step2';
import {
  isValidBirthDate,
  mapFormToAstroProfile,
  validateAstrologyStep1,
  validateAstrologyStep2,
} from './astrology-mappers';
import type { AstrologyFormData } from '../astrology-types';

/* ---------- 「你将获得」价值摘要（§6.3：大三要素 / 十二宫位 / 相位关系） ---------- */

const DELIVERABLES = [
  { icon: SunMoon, title: '大三要素解读', text: '太阳、月亮与上升的性格底色' },
  { icon: Grid3x3, title: '十二宫位', text: '人生各领域的位置分布' },
  { icon: Waypoints, title: '相位关系', text: '星体之间的互动模式' },
] as const;

/* ---------- 表单容器 ---------- */

export function AstrologyForm() {
  const reduceMotion = useReducedMotion();
  /** 星渊 WebGL 场景可用性：可用时桌面预览由 3D 场景接管，并关闭 CSS 视差避免双重倾斜（同结果页口径） */
  const wheelSceneOk = useWheelSceneAvailable();
  const { formData, formStep, fieldErrors, blockingLoading, setWorkspaceState } =
    useDestinyWorkspaceStore(
      useShallow((s) => ({
        formData: s.astrology.formData,
        formStep: s.astrology.formStep,
        fieldErrors: s.astrology.fieldErrors,
        blockingLoading: s.astrology.blockingLoading,
        setWorkspaceState: s.setWorkspaceState,
      }))
    );

  /** 预览盘：冻结示例盘；日期合法后太阳节点经 planetOverrides 滑向真实星座 */
  const sampleFacts = useMemo(() => computeChartFacts(SAMPLE_PROFILE_ACCURATE), []);
  const dateReady = isValidBirthDate(formData.birthDate);
  const sunOverride = useMemo(
    () => (dateReady ? { sun: approximateSunLongitude(formData.birthDate!) } : undefined),
    [dateReady, formData.birthDate]
  );
  const sunSignName = dateReady ? ZODIAC_CN[approximateSunSign(formData.birthDate!)] : null;

  /** 修改字段时同步清除该字段的内联错误（修正后红色平滑过渡回平台蓝） */
  const patch = (p: Partial<AstrologyFormData>) => {
    setWorkspaceState('astrology', (cur) => {
      const nextErrors = { ...cur.fieldErrors };
      for (const k of Object.keys(p) as Array<keyof AstrologyFormData>) {
        delete nextErrors[k];
      }
      return { formData: { ...cur.formData, ...p }, fieldErrors: nextErrors };
    });
  };

  /** 步骤方向：决定横滑进出方向（前进右进左出，后退反之） */
  const prevStepRef = useRef(formStep);
  const direction = formStep >= prevStepRef.current ? 1 : -1;
  useEffect(() => {
    prevStepRef.current = formStep;
  }, [formStep]);

  const stepTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.25, ease: [0.32, 0.72, 0, 1] as const };

  /** 第一步「继续」：校验日期，通过才进入时间校准台 */
  const goNext = () => {
    const errors = validateAstrologyStep1(formData);
    if (Object.keys(errors).length > 0) {
      setWorkspaceState('astrology', { fieldErrors: errors });
      return;
    }
    setWorkspaceState('astrology', { formStep: 2, fieldErrors: {} });
  };

  /** 第二步「绘制我的星盘」：双步合并校验 → 真值接缝计算 → 进入加载仪式（05：真值锁定后由仪式页转场进结果页） */
  const submit = () => {
    const step1Errors = validateAstrologyStep1(formData);
    const errors = { ...step1Errors, ...validateAstrologyStep2(formData) };
    if (Object.keys(errors).length > 0) {
      setWorkspaceState('astrology', {
        fieldErrors: errors,
        formStep: Object.keys(step1Errors).length > 0 ? 1 : 2,
      });
      return;
    }
    const profile = mapFormToAstroProfile(formData);
    if (!profile) return; // 防御：校验已过理论上不可达
    try {
      const chartFacts = computeChartFacts(profile);
      // 真值先锁定再进仪式：仪式四阶段是对已完成计算的揭示，不是虚构进度
      setWorkspaceState('astrology', { chartFacts, entryView: 'loading', error: null, errorKind: null });
      // 11 工单：真值完成即写入统一历史（匿名则入会话临时记录，登录确认后迁移）
      saveAstrologyHistoryRecord(formData, chartFacts);
    } catch {
      setWorkspaceState('astrology', {
        chartFacts: null,
        entryView: 'loading',
        error: '星盘计算出现异常，请重试',
        errorKind: 'unknown',
      });
    }
  };

  const backToHome = () => setWorkspaceState('astrology', { entryView: 'home' });
  const backToStep1 = () => setWorkspaceState('astrology', { formStep: 1, fieldErrors: {} });

  return (
    <DestinyPageScaffold withNavOffset tone="cosmos">
      <AstrologyStarfield />

      <div className="relative z-10 h-full min-h-0 overflow-y-auto custom-scrollbar">
        {/* 移动端命运页根容器随内容撑高、文档级滚动：底部预留固定操作位的高度，避免表单末尾被遮住 */}
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-6 xl:pb-0">
          {/* 顶部：返回链 + 模块标注 */}
          <header className="flex items-center justify-between">
            <button
              type="button"
              onClick={formStep === 1 ? backToHome : backToStep1}
              className="-ml-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-night-muted dark:hover:text-indigo-200"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              {formStep === 1 ? '星座寰宇' : '上一步'}
            </button>
            <span className="text-xs tracking-wide text-slate-400 dark:text-night-faint">出生资料 · 两步完成</span>
          </header>

          <div className="mt-4 grid flex-1 gap-8 sm:mt-6 xl:grid-cols-[1.02fr_0.98fr] xl:gap-12">
            {/* 视觉区：移动端在上（紧凑横条），桌面右列 sticky 持续展示 */}
            <aside className="order-first xl:order-last xl:self-start xl:sticky xl:top-6">
              {/* 移动端紧凑横条：小轮 + 价值摘要（小轮加盘面底衬，深色下不消融） */}
              <div className="flex items-center gap-4 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] xl:hidden">
                <div className="w-20 shrink-0 rounded-full bg-white/85 p-1 ring-1 ring-indigo-200/60 dark:bg-white/[0.07] dark:ring-indigo-300/20">
                  <AstrologyChartWheel facts={sampleFacts} planetOverrides={sunOverride} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {sunSignName ? `太阳已滑入${sunSignName}` : '示例星盘'}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-night-muted">
                    {sunSignName ? '其余星体为示例状态' : '填完日期后太阳将滑向你的星座'}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-indigo-500 dark:text-indigo-300">
                    你将获得：大三要素解读 · 十二宫位 · 相位关系
                  </p>
                </div>
              </div>

              {/* 桌面端：悬浮大轮 + 诚实说明 + 价值摘要卡 */}
              <div className="hidden xl:block">
                <div className="relative mx-auto w-full max-w-[25rem]">
                  <div aria-hidden className="absolute inset-[6%] rounded-full bg-indigo-400/10 blur-2xl dark:bg-indigo-500/15" />
                  {/* 预览即所得：与结果页同一座「星渊」3D 星盘（纯展示，不可点选）；
                      WebGL 不可用/加载中由 SVG 轮原地兜底，太阳滑动在两套渲染间语义一致 */}
                  <AstrologyWheel3D className="relative" parallax={wheelSceneOk !== true}>
                    <AstrologyWheelSceneSwitch
                      facts={sampleFacts}
                      planetOverrides={sunOverride}
                      fallback={
                        <AstrologyChartWheel
                          facts={sampleFacts}
                          planetOverrides={sunOverride}
                          className="relative drop-shadow-[0_18px_42px_rgba(67,56,202,0.14)] dark:drop-shadow-[0_18px_48px_rgba(2,6,23,0.55)]"
                        />
                      }
                    />
                  </AstrologyWheel3D>
                </div>
                <p className="mt-3 text-center text-xs leading-relaxed text-slate-500 dark:text-night-muted">
                  {sunSignName ? (
                    <>
                      太阳已滑入<span className="font-semibold text-indigo-500 dark:text-indigo-300">{sunSignName}</span>
                      · 其余星体为示例状态
                    </>
                  ) : (
                    '示例星盘 · 填完阳历日期后，太阳将滑向你的星座'
                  )}
                </p>

                <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#0B1026]/75">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold tracking-wider text-slate-700 dark:text-slate-200">天象档案待解构清单</p>
                    <span className="rounded-full border border-indigo-200/80 bg-indigo-50/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">
                      三维命理真值
                    </span>
                  </div>
                  <ul className="mt-3.5 space-y-3">
                    {DELIVERABLES.map((d) => (
                      <li key={d.title} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-100/90 bg-white/80 text-indigo-500 shadow-sm dark:border-indigo-300/15 dark:bg-white/5 dark:text-indigo-300">
                          <d.icon className="h-4 w-4" strokeWidth={1.9} />
                        </span>
                        <span>
                          <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{d.title}</span>
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-night-muted">{d.text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>

            {/* 表单卡：高对比实体卡，像被星图照亮的档案页 */}
            <section className="h-fit rounded-[28px] border border-white/60 bg-white/80 p-6 shadow-[0_24px_64px_-24px_rgba(30,41,82,0.25)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0D1226]/85 dark:shadow-[0_24px_64px_-24px_rgba(2,6,23,0.8)] sm:p-8">
              {/* 天体星轨双轴校准轨 */}
              <div className="mb-7">
                <div className="flex items-center justify-between gap-2 pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300',
                        formStep === 1
                          ? 'bg-gradient-to-r from-[#4969E9] to-[#7C5CF6] text-white shadow-[0_0_12px_rgba(73,105,233,0.5)]'
                          : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {formStep > 1 ? '✓' : '01'}
                    </span>
                    <span
                      className={cn(
                        'text-xs font-semibold tracking-wide transition-colors duration-200',
                        formStep === 1
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-400 dark:text-night-muted'
                      )}
                    >
                      黄道历法基准
                    </span>
                  </div>

                  {/* 刻度连接轴线 */}
                  <div className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" aria-hidden>
                    <div
                      className={cn(
                        'h-full bg-gradient-to-r from-[#4969E9] to-[#7C5CF6] transition-all duration-500',
                        formStep === 1 ? 'w-1/2' : 'w-full'
                      )}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300',
                        formStep === 2
                          ? 'bg-gradient-to-r from-[#4969E9] to-[#7C5CF6] text-white shadow-[0_0_12px_rgba(73,105,233,0.5)]'
                          : 'border border-slate-200 bg-white/50 text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-night-faint'
                      )}
                    >
                      02
                    </span>
                    <span
                      className={cn(
                        'text-xs font-semibold tracking-wide transition-colors duration-200',
                        formStep === 2
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-400 dark:text-night-muted'
                      )}
                    >
                      地平经纬校准
                    </span>
                  </div>
                </div>

                <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                  {formStep === 1 ? '黄道时空定位' : '地平经纬校准'}
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-night-muted">
                  {formStep === 1 ? '确立太阳与各行星的运行基准，只需一分钟' : '校准出生时间与地点，让星盘更完整'}
                </p>
              </div>

              {/* 步骤横滑切换（返回保留已填内容：数据在 store，组件只负责呈现） */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={formStep}
                  initial={{ opacity: 0, x: 40 * direction }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 * direction }}
                  transition={stepTransition}
                >
                  {formStep === 1 ? (
                    <AstrologyFormStep1 formData={formData} fieldErrors={fieldErrors} disabled={blockingLoading} onPatch={patch} />
                  ) : (
                    <AstrologyFormStep2 formData={formData} fieldErrors={fieldErrors} disabled={blockingLoading} onPatch={patch} />
                  )}
                </motion.div>
              </AnimatePresence>
            </section>
          </div>

          {/* 主操作位：移动端 fixed 抬升避开全局底部导航（移动端命运页为文档级滚动，sticky 无效）；
              桌面端在内部滚动容器内 sticky 贴底。预留安全区，不是第二条底部导航 */}
          <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 px-5 pb-2 pt-2 sm:px-8 xl:sticky xl:inset-x-auto xl:bottom-0 xl:mt-8 xl:px-0 xl:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_-8px_32px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0B1024]/90 dark:shadow-[0_-12px_40px_-16px_rgba(2,6,23,0.8)]">
              {formStep === 2 && (
                <button
                  type="button"
                  onClick={backToStep1}
                  disabled={blockingLoading}
                  className="flex min-h-12 shrink-0 items-center justify-center rounded-full px-5 text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 disabled:opacity-50 dark:text-night-muted dark:hover:text-indigo-200"
                >
                  返回上一步
                </button>
              )}
              {/* 完全未知档：主按钮旁标注，提交仍可用（§6.3 表单即时反馈） */}
              {formStep === 2 && formData.timePrecision === 'unknown' && (
                <span className="hidden shrink-0 text-xs text-slate-400 dark:text-night-faint sm:block">
                  将生成无宫位本命盘
                </span>
              )}
              <button
                type="button"
                onClick={formStep === 1 ? goNext : submit}
                disabled={blockingLoading}
                className={cn(
                  'group relative inline-flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full px-8',
                  'bg-gradient-to-r from-[#4969E9] via-[#5B6BF0] to-[#7C5CF6]',
                  'text-base font-bold text-white',
                  'shadow-[0_12px_32px_-8px_rgba(73,105,233,0.55)]',
                  'transition-[transform,box-shadow] duration-200 hover:scale-[1.02] hover:shadow-[0_16px_40px_-8px_rgba(109,93,246,0.6)]',
                  'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4969E9]/45 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-0',
                  'disabled:pointer-events-none disabled:opacity-40'
                )}
              >
                {/* 星光扫过（纯装饰；减少动态时隐藏） */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent motion-reduce:hidden"
                  style={{ animation: 'acw-cta-shine 3.8s ease-in-out 0.6s infinite' }}
                />
                {formStep === 1 ? (
                  <>
                    继续
                    <ArrowRight className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.2} />
                  </>
                ) : (
                  <>
                    <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} />
                    绘制我的星盘
                  </>
                )}
              </button>
            </div>
            {/* 移动端未知档标注（空间不足时放到条下） */}
            {formStep === 2 && formData.timePrecision === 'unknown' && (
              <p className="mt-2 text-center text-xs text-slate-400 dark:text-night-faint sm:hidden">
                将生成无宫位本命盘
              </p>
            )}
          </div>
        </div>
      </div>
    </DestinyPageScaffold>
  );
}
