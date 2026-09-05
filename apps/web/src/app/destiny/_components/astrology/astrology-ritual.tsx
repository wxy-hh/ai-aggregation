'use client';

/**
 * astrology-ritual.tsx —— 加载仪式 + 共享元素转场 + 结果首屏挂载（设计文档 §6.4/§6.5，05/06 工单）
 *
 * 结构决策（为什么加载与结果住在同一组件树）：
 * 真值锁定即转场，加载页星盘要「连续放大、位移并落定为首屏星盘轮」。
 * 本组件同时承载 ritual / result 两个相位，星盘轮以 layoutId 在同一棵树内做
 * 布局动画——无卸载、无跳帧的共享元素转场（减少动态时退化为交叉淡入）。
 * 结果相位由 AstrologyResultView 承载（06：护照/主轴/三卡/交互轮），wheelSlot 插槽传入。
 *
 * 诚实性约束：
 * - 真值（chartFacts）在进入本组件前已锁定；四阶段只是把已完成的计算过程
 *   按最小仪式窗（3.2s，在 2.5–4s 区间）揭示出来，无虚假百分比。
 * - 第四阶段仅代表「解读请求已发出」，不等待 AI 全文。
 * - 失败时呈现安静恢复卡：资料已保留 + 失败类型 + 重新计算 / 返回修改资料。
 * - 无宫位盘第三阶段文案固定为「系统正在整理行星位置与关键相位」，不播放十二宫动画再隐藏。
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Pencil, RotateCcw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { computeChartFacts } from '@/lib/astrology/mock-chart-facts';
import { saveAstrologyHistoryRecord } from '@/lib/astrology/history';
import type { PlanetBody } from '@/lib/astrology/chart-facts';
import { DestinyPageScaffold } from '../layout/destiny-page-scaffold';
import { AstrologyChartWheel } from './astrology-chart-wheel';
import { AstrologyResultView } from './astrology-result-view';
import { AstrologyStarfield } from './astrology-starfield';
import { APPROXIMATE_SLOTS, mapFormToAstroProfile } from './astrology-mappers';
import type { AstrologyFormData } from '../astrology-types';

/* ---------- 仪式节奏（最小仪式窗 3.2s，落在 2.5–4s 区间） ---------- */

const STAGE_2_AT = 800; // 行星依序点亮
const STAGE_3_AT = 1800; // 宫位线与相位生长（无宫位：整理相位）
const STAGE_4_AT = 2700; // 几何静止，解读请求已发出
const WINDOW_END_AT = 3200; // 仪式窗结束 → 转场

type RitualStage = 1 | 2 | 3 | 4;

/* ---------- 四段真实进度清单：前三段主语「系统」，第四段「AI」 ---------- */

function stageCopy(withHouses: boolean): Array<{ doing: string; done: string }> {
  return [
    { doing: '系统正在校准出生地与当地时区', done: '系统已校准出生地与当地时区' },
    { doing: '系统正在定位行星与月亮', done: '系统已定位行星与月亮' },
    {
      doing: withHouses ? '系统正在绘制十二宫与关键相位' : '系统正在整理行星位置与关键相位',
      done: withHouses ? '系统已绘制十二宫与关键相位' : '系统已整理行星位置与关键相位',
    },
    { doing: 'AI 正在基于星盘事实整理宇宙重点', done: 'AI 解读请求已发出' },
  ];
}

/** 顶部出生资料摘要行（真实表单数据） */
function summaryLine(formData: AstrologyFormData): string {
  const name = formData.name.trim() || '本次星盘';
  const d = formData.birthDate;
  const date = d ? `${d.year} 年 ${d.month} 月 ${d.day} 日` : '';
  let time = '时间未知';
  if (formData.timePrecision === 'accurate' && formData.birthTime.hour !== '' && formData.birthTime.minute !== '') {
    time = `${formData.birthTime.hour.padStart(2, '0')}:${formData.birthTime.minute.padStart(2, '0')}`;
  } else if (formData.timePrecision === 'approximate' && formData.approximateSlot) {
    const slot = APPROXIMATE_SLOTS.find((s) => s.value === formData.approximateSlot);
    time = `约 ${slot?.label ?? formData.approximateSlot}`;
  }
  return [name, date, time, formData.location.name].filter(Boolean).join(' · ');
}

/* ---------- 失败恢复卡的细线骨架（停在天文坐标框架，不虚构行星位置） ---------- */

function RitualWireframe() {
  const reduceMotion = useReducedMotion();
  const ticks = useMemo(() => Array.from({ length: 24 }, (_, i) => i * 15), []);
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden>
        <circle cx={100} cy={100} r={94} fill="none" strokeWidth={1} className="stroke-slate-400/50 dark:stroke-white/15" />
        <circle cx={100} cy={100} r={72} fill="none" strokeWidth={0.8} className="stroke-slate-400/45 dark:stroke-white/[0.12]" />
        <circle cx={100} cy={100} r={46} fill="none" strokeWidth={0.7} className="stroke-slate-400/40 dark:stroke-white/10" />
        {ticks.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const major = deg % 90 === 0;
          const r1 = major ? 84 : 88;
          return (
            <line
              key={deg}
              x1={100 + r1 * Math.cos(rad)}
              y1={100 + r1 * Math.sin(rad)}
              x2={100 + 94 * Math.cos(rad)}
              y2={100 + 94 * Math.sin(rad)}
              strokeWidth={major ? 1 : 0.6}
              className="stroke-slate-400/50 dark:stroke-white/15"
            />
          );
        })}
      </svg>
      {/* 柔和玫瑰色警示星点：只呼吸一次后静止 */}
      <motion.span
        aria-hidden
        className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-400/90"
        animate={reduceMotion ? {} : { scale: [1, 1.7, 1], opacity: [0.9, 0.35, 0.9] }}
        transition={{ duration: 1.3, ease: 'easeInOut' }}
      />
    </div>
  );
}

/* ---------- 主组件 ---------- */

export function AstrologyRitualResult() {
  const reduceMotion = useReducedMotion();
  const { step, formData, chartFacts, error, errorKind, setWorkspaceState, markResultReady } =
    useDestinyWorkspaceStore(
      useShallow((s) => ({
        step: s.astrology.step,
        formData: s.astrology.formData,
        chartFacts: s.astrology.chartFacts,
        error: s.astrology.error,
        errorKind: s.astrology.errorKind,
        setWorkspaceState: s.setWorkspaceState,
        markResultReady: s.markResultReady,
      }))
    );

  const phase = step === 'result' ? 'result' : 'ritual';
  const [stage, setStage] = useState<RitualStage>(1);

  const withHouses = chartFacts?.dataCompleteness === 'with-houses';
  const stages = useMemo(() => stageCopy(Boolean(withHouses)), [withHouses]);

  /**
   * 仪式推进：chartFacts 提交时已锁定（真实完成事件），这里按最小仪式窗播放揭示；
   * 窗结束即 markResultReady 转场（第四阶段不代表等待 AI 全文）。
   * 减少动态：同样的真实节奏，只是盘面各层静态出现、转场退化为交叉淡入。
   */
  useEffect(() => {
    if (phase !== 'ritual' || error) return;
    const timers = [
      setTimeout(() => setStage(2), STAGE_2_AT),
      setTimeout(() => setStage(3), STAGE_3_AT),
      setTimeout(() => setStage(4), STAGE_4_AT),
      setTimeout(() => markResultReady('astrology'), WINDOW_END_AT),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, error, markResultReady]);

  /**
   * 相位切换时复位文档与工作区滚动：移动端 destiny 页是文档级滚动，
   * 桌面端工作区是局部容器（.custom-scrollbar）滚动。
   * 表单页滚到底部提交后 scrollTop 会残留，把仪式摘要行顶出视口；
   * 仪式 → 结果转场同理，结果首屏必须从顶部 0px 开始呈现。
   */
  useEffect(() => {
    window.scrollTo(0, 0);
    const scrollContainers = document.querySelectorAll('.custom-scrollbar');
    scrollContainers.forEach((container) => {
      container.scrollTop = 0;
    });
  }, [phase]);

  /** 失败恢复：重新计算只重走已缺失的环节——真值在则只重播仪式转场，不在才重算 */
  const retry = () => {
    setStage(1);
    if (!chartFacts) {
      const profile = mapFormToAstroProfile(formData);
      if (!profile) {
        setWorkspaceState('astrology', { entryView: 'form', error: null, errorKind: null });
        return;
      }
      try {
        const chartFacts = computeChartFacts(profile);
        setWorkspaceState('astrology', { chartFacts, error: null, errorKind: null });
        // 11 工单：重试补齐真值同样写入统一历史（同一逻辑记录覆盖更新）
        saveAstrologyHistoryRecord(formData, chartFacts);
      } catch {
        setWorkspaceState('astrology', { error: '星盘计算出现异常，请重试', errorKind: 'unknown' });
        return;
      }
      return;
    }
    setWorkspaceState('astrology', { error: null, errorKind: null });
  };

  const backToForm = () => setWorkspaceState('astrology', { entryView: 'form', error: null, errorKind: null });

  /** 共享星盘元素：同一 layoutId 在 ritual/result 两相位间做树内布局动画；
   *  06 起结果相位透传点选交互（selectedBody/onSelectBody），仪式相位不传即为纯展示 */
  const wheelSlot = (
    slotClass: string,
    wheelProps?: { selectedBody: PlanetBody | null; onSelectBody: (body: PlanetBody | null) => void }
  ) =>
    chartFacts ? (
      <motion.div
        layoutId={reduceMotion ? undefined : 'astrology-wheel'}
        transition={reduceMotion ? { duration: 0.01 } : { duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className={cn(slotClass, '[transform-style:preserve-3d]')}
      >
        <AstrologyChartWheel
          facts={chartFacts}
          revealStage={phase === 'ritual' ? stage : undefined}
          selectedBody={wheelProps?.selectedBody ?? null}
          onSelectBody={wheelProps?.onSelectBody}
          className="drop-shadow-[0_18px_42px_rgba(67,56,202,0.16)] dark:drop-shadow-[0_18px_48px_rgba(2,6,23,0.6)]"
        />
      </motion.div>
    ) : null;

  /* ---------- 失败恢复卡（安静：无整页红色、无破碎特效） ---------- */

  if (error || !chartFacts) {
    const kindText =
      errorKind === 'model' ? '服务繁忙' : errorKind === 'timeout' ? '请求超时' : errorKind === 'validation' ? '资料校验未通过' : '网络中断或计算异常';
    return (
      <DestinyPageScaffold withNavOffset tone="cosmos">
        <AstrologyStarfield />
        <div className="relative z-10 flex h-full min-h-0 items-center justify-center overflow-y-auto px-6">
          <div className="w-full max-w-sm rounded-[28px] border border-white/60 bg-white/85 p-8 text-center shadow-[0_24px_64px_-24px_rgba(30,41,82,0.25)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0D1226]/[0.88]">
            <RitualWireframe />
            <h2 className="mt-6 font-heading text-lg font-bold text-slate-900 dark:text-white">
              别担心，出生资料已保留
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-night-muted">
              星盘绘制未完成（{kindText}）。{error && error !== '' ? error : '可以重新计算，或返回检查出生资料。'}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={retry}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4969E9] to-[#7C5CF6] text-sm font-bold text-white shadow-[0_12px_32px_-8px_rgba(73,105,233,0.55)] transition-[transform,box-shadow] duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4969E9]/45"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
                重新计算
              </button>
              <button
                type="button"
                onClick={backToForm}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-night-muted dark:hover:text-indigo-200"
              >
                <Pencil className="h-4 w-4" strokeWidth={1.9} />
                返回修改资料
              </button>
            </div>
          </div>
        </div>
      </DestinyPageScaffold>
    );
  }

  /* ---------- 加载仪式相位 ---------- */

  if (phase === 'ritual') {
    return (
      <DestinyPageScaffold withNavOffset tone="cosmos">
        <AstrologyStarfield />
        <div className="relative z-10 h-full min-h-0 overflow-y-auto custom-scrollbar">
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 xl:justify-center xl:pb-10">
            {/* 顶部：出生资料摘要行 */}
            <p className="text-center text-xs font-medium tracking-wide text-slate-500 dark:text-night-muted">
              {summaryLine(formData)}
            </p>

            <div className="mt-6 grid flex-1 items-center gap-8 sm:mt-8 xl:grid-cols-[0.9fr_1.1fr] xl:gap-12">
              {/* 中央星盘：移动端在上，桌面右列 */}
              <div className="order-first xl:order-last">
                <div className="relative mx-auto w-full max-w-[min(72vw,340px)] xl:max-w-[380px]">
                  <div aria-hidden className="absolute inset-[8%] rounded-full bg-indigo-400/[0.12] blur-2xl dark:bg-indigo-500/[0.18]" />
                  {wheelSlot('relative mx-auto w-full')}
                </div>
                {/* 无宫位档：月光紫范围徽章（第三阶段起伴随，不播十二宫动画） */}
                {!withHouses && stage >= 2 && (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mt-3 text-center"
                  >
                    <span className="inline-block rounded-full border border-violet-300/40 bg-violet-200/20 px-3 py-1 text-[11px] font-semibold tracking-wider text-violet-600 dark:border-violet-300/25 dark:bg-violet-400/10 dark:text-violet-300">
                      无宫位行星盘
                    </span>
                  </motion.p>
                )}
              </div>

              {/* 左列（移动端下方）：四段真实进度清单 */}
              <div className="mx-auto w-full max-w-md xl:mx-0">
                <h1 className="text-center font-heading text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl xl:text-left">
                  正在绘制你的星盘
                </h1>
                <ol className="mt-6 space-y-4">
                  {stages.map((s, i) => {
                    const num = (i + 1) as RitualStage;
                    const done = stage > num;
                    const current = stage === num;
                    return (
                      <li key={s.doing} className="flex items-center gap-3">
                        {done ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4969E9] to-[#7C5CF6] text-white shadow-[0_4px_12px_-2px_rgba(73,105,233,0.5)]">
                            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                          </span>
                        ) : current ? (
                          <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                            <motion.span
                              aria-hidden
                              className="absolute inline-flex h-4 w-4 rounded-full bg-indigo-400/40 dark:bg-indigo-300/30"
                              animate={reduceMotion ? {} : { scale: [1, 1.7, 1], opacity: [0.8, 0.2, 0.8] }}
                              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500 dark:bg-indigo-300" />
                          </span>
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                            <span className="h-2 w-2 rounded-full border border-slate-300 dark:border-white/20" />
                          </span>
                        )}
                        <span
                          className={cn(
                            'text-sm leading-relaxed transition-colors duration-300',
                            current
                              ? 'font-semibold text-slate-900 dark:text-white'
                              : done
                                ? 'text-slate-500 dark:text-night-muted'
                                : 'text-slate-400 dark:text-night-faint'
                          )}
                        >
                          {done ? s.done : s.doing}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-6 text-center text-xs leading-relaxed text-slate-400 dark:text-night-faint xl:text-left">
                  进度由真实计算步骤推进，不设百分比
                </p>
                {/* 读屏状态宣布：阶段切换时朗读当前步骤（视觉清单逐字变化对读屏不友好，单独用活体区宣布） */}
                <p className="sr-only" role="status" aria-live="polite">
                  {stages[stage - 1]?.doing ?? ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DestinyPageScaffold>
    );
  }

  /* ---------- 结果相位（06：真实首屏——护照/主轴/三卡/交互轮；wheelSlot 插槽保持共享元素转场） ---------- */

  return (
    <DestinyPageScaffold withNavOffset tone="cosmos">
      <AstrologyStarfield />
      <div className="relative z-10 h-full min-h-0 overflow-y-auto custom-scrollbar">
        <AstrologyResultView wheelSlot={wheelSlot} />
      </div>
    </DestinyPageScaffold>
  );
}
