'use client';

/**
 * astrology-ritual.tsx —— 加载仪式（等待室）+ 共享元素转场 + 结果首屏挂载（设计文档 §6.4/§6.5，05/06 工单）
 *
 * 结构决策（为什么加载与结果住在同一组件树）：
 * 转场时加载页星盘要「连续放大、位移并落定为首屏星盘轮」。本组件同时承载 ritual / result
 * 两个相位，星盘轮以 layoutId 在同一棵树内做布局动画——无卸载、无跳帧的共享元素转场
 * （减少动态时退化为交叉淡入）。结果相位由 AstrologyResultView 承载（06：护照/主轴/三卡/交互轮），
 * wheelSlot 插槽传入。
 *
 * 诚实性约束（12 工单起改「等待室」语义）：
 * - 真值（chartFacts）由异步接缝在仪式窗内送达（mock 600–900ms）：提交即进本组件，四阶段
 *   按最小仪式窗（3.2s，在 2.5–4s 区间）播放；转场条件是「仪式窗已走满 **且** 真值已就位」，
 *   两者都满足才 markResultReady 进结果页。
 * - 仪式窗走满而真值未就位（真实计算域慢时）：停在第四阶段文案，并如实加一行「最后校准中…」，
 *   真值一到立即转场；不用假进度与假完成糊弄。
 * - 第四阶段代表「宇宙重点已整理完成」（本地基于星盘事实整理，无 AI 请求）。
 * - 失败时呈现安静恢复卡：资料已保留 + 失败类型 + 重新计算 / 返回修改资料，不再自动转场。
 * - 无宫位盘第三阶段文案固定为「系统正在整理行星位置与关键相位」，不播放十二宫动画再隐藏。
 * - 跳过按钮语义为「跳过动画」：真值已就位才可直达（未就位时无结果可看，置灰并给出 aria 说明）。
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Pencil, RotateCcw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import {
  chartFactsErrorKind,
  isLatestChartFactsRequest,
  startChartFactsRequest,
} from '@/lib/astrology/chart-request';
import { saveAstrologyHistoryRecord } from '@/lib/astrology/history';
import type { PlanetBody } from '@/lib/astrology/chart-facts';
import { DestinyPageScaffold } from '../layout/destiny-page-scaffold';
import { AstrologyChartWheel } from './astrology-chart-wheel';
import { AstrologyCtaButton } from './astrology-cta-button';
import { AstrologyWheelSceneSwitch } from './astrology-wheel-scene-switch';
import { AstrologyResultView } from './astrology-result-view';
import { AstrologyStarfield } from './astrology-starfield';
import { APPROXIMATE_SLOTS, mapFormToAstroProfile } from './astrology-mappers';
import { resetAstrologyScroll } from './astrology-scroll';
import type { AstrologyFormData } from '../astrology-types';

/* ---------- 仪式节奏（最小仪式窗 3.2s，落在 2.5–4s 区间） ---------- */

const STAGE_2_AT = 800; // 行星依序点亮
const STAGE_3_AT = 1800; // 宫位线与相位生长（无宫位：整理相位）
const STAGE_4_AT = 2700; // 几何静止，宇宙重点已整理完成
const WINDOW_END_AT = 3200; // 最小仪式窗走满 → 真值若已就位即转场（未就位则进等待室）

type RitualStage = 1 | 2 | 3 | 4;

/* ---------- 四段真实进度清单：主语统一为「系统」 ---------- */

function stageCopy(withHouses: boolean): Array<{ doing: string; done: string }> {
  return [
    { doing: '系统正在校准出生地与当地时区', done: '系统已校准出生地与当地时区' },
    { doing: '系统正在定位行星与月亮', done: '系统已定位行星与月亮' },
    {
      doing: withHouses ? '系统正在绘制十二宫与关键相位' : '系统正在整理行星位置与关键相位',
      done: withHouses ? '系统已绘制十二宫与关键相位' : '系统已整理行星位置与关键相位',
    },
    { doing: '系统正在基于星盘事实整理宇宙重点', done: '宇宙重点已整理完成' },
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

/* ---------- 真值在途的坐标框架占位（等待室；与失败卡同源的同心圆几何，不虚构行星位置） ---------- */

/**
 * 真值在途的同心圆底衬：只画天文坐标框架（与 RitualWireframe 同一几何与描边档），
 * 既避免轮盘位宽高塌陷导致下方文案位移，也不在真值到达前虚构任何行星位置。
 */
function RitualFramePlaceholder() {
  return (
    <svg viewBox="0 0 200 200" className="relative h-auto w-full" aria-hidden>
      <circle cx={100} cy={100} r={94} fill="none" strokeWidth={1} className="stroke-slate-400/50 dark:stroke-white/15" />
      <circle cx={100} cy={100} r={72} fill="none" strokeWidth={0.8} className="stroke-slate-400/45 dark:stroke-white/[0.12]" />
      <circle cx={100} cy={100} r={46} fill="none" strokeWidth={0.7} className="stroke-slate-400/40 dark:stroke-white/10" />
    </svg>
  );
}

/* ---------- 主组件 ---------- */

type AstrologyRitualResultProps = {
  /** 工作区激活态（默认 true）：模块切走时结果相位的星渊场景整帧停摆，不随后台帧循环空转 */
  isActive?: boolean;
};

export function AstrologyRitualResult({ isActive = true }: AstrologyRitualResultProps) {
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
  /** 最小仪式窗是否已走满（3.2s 到点置真）；转场还要求真值已就位，两者都满足才进结果页 */
  const [windowElapsed, setWindowElapsed] = useState(false);

  /** 真值是否已到手：null 表示在途（等待室期间既不是失败、也不是可展示的结果） */
  const factsReady = chartFacts !== null;
  /** 含宫位与否取自事实层；真值在途时未知，第三阶段文案先用中性的「整理行星位置与关键相位」，
   *  真值一到（约 900ms，早于第三阶段 1800ms）即按真实盘面口径纠正 */
  const withHouses = chartFacts?.dataCompleteness === 'with-houses';
  const stages = useMemo(() => stageCopy(Boolean(withHouses)), [withHouses]);
  /** 等待室状态：仪式窗已满而真值未到——如实说明在等最后一环，不假装已完成 */
  const waitingForFacts = windowElapsed && !factsReady;

  /**
   * 仪式推进：四阶段节奏不变（800/1800/2700ms），第 3200ms 只标记「仪式窗已走满」，
   * 转场由下方闸门判定（避免窗口一到就带着在途真值进结果页）。
   * 减少动态：同样的真实节奏，只是盘面各层静态出现、转场退化为交叉淡入。
   * cleanup 依赖 phase：跳过按钮把 phase 提前切到 result 时，四个定时器一并清掉。
   */
  useEffect(() => {
    if (phase !== 'ritual' || error) return;
    const timers = [
      setTimeout(() => setStage(2), STAGE_2_AT),
      setTimeout(() => setStage(3), STAGE_3_AT),
      setTimeout(() => setStage(4), STAGE_4_AT),
      setTimeout(() => setWindowElapsed(true), WINDOW_END_AT),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, error]);

  /**
   * 转场闸门（等待室语义）：仪式窗走满 **且** 真值已就位才转场。
   * - 真值先到（mock 600–900ms，早于 3.2s 窗）：按原节奏在窗满那一瞬转场；
   * - 仪式窗先满（真实计算域慢时）：停在第四阶段 + 「最后校准中…」，真值一到立即转场；
   * - 失败：error 非空时不转场，由既有失败恢复卡接管。
   */
  useEffect(() => {
    if (phase !== 'ritual' || error || !windowElapsed || !factsReady) return;
    markResultReady('astrology');
  }, [phase, error, windowElapsed, factsReady, markResultReady]);

  /** 相位切换时复位滚动：表单页滚到底提交后残留的 scrollTop 会把仪式摘要行与结果首屏顶出视口 */
  useEffect(() => {
    resetAstrologyScroll();
  }, [phase]);

  /** 失败恢复：重新计算只重走已缺失的环节——真值在则只重播仪式，不在才重新请求。
   *  step 一律回落 form：失败卡可能停在结果步，不回落则重算后 phase 仍是 result，直接跳过仪式 */
  const retry = () => {
    setStage(1);
    setWindowElapsed(false);
    if (chartFacts) {
      // 真值已在：只重播仪式（entryView 回到 loading，确保工作区把仪式树留在前台）
      setWorkspaceState('astrology', { step: 'form', entryView: 'loading', error: null, errorKind: null });
      return;
    }
    const profile = mapFormToAstroProfile(formData);
    if (!profile) {
      setWorkspaceState('astrology', { step: 'form', entryView: 'form', error: null, errorKind: null });
      return;
    }
    // 真值仍缺：重走异步接缝（chartFacts 保持 null 表示在途，仪式等待室重新计时）
    setWorkspaceState('astrology', {
      step: 'form',
      entryView: 'loading',
      chartFacts: null,
      error: null,
      errorKind: null,
    });
    const { token, result } = startChartFactsRequest(profile);
    result
      .then((facts) => {
        // 过期响应丢弃：连续重试时先发的响应不得覆盖后发的结果
        if (!isLatestChartFactsRequest(token)) return;
        setWorkspaceState('astrology', { chartFacts: facts, error: null, errorKind: null });
        // 11 工单：重试补齐真值同样写入统一历史（同一逻辑记录覆盖更新）
        saveAstrologyHistoryRecord(formData, facts);
      })
      .catch((error: unknown) => {
        if (!isLatestChartFactsRequest(token)) return;
        setWorkspaceState('astrology', {
          step: 'form',
          entryView: 'loading',
          error: '星盘计算出现异常，请重试',
          errorKind: chartFactsErrorKind(error),
        });
      });
  };

  /** 返回修改资料：step 一并回落 form，否则工作区分发仍停在结果页，按钮点了没反应 */
  const backToForm = () =>
    setWorkspaceState('astrology', { step: 'form', entryView: 'form', error: null, errorKind: null });

  /** 跳过动画：真值已就位才可直达（未就位时无结果可看，按钮置灰并给出 aria 说明）；
   *  phase 随之变 result，进度定时器由推进 effect 的 cleanup（依赖 [phase]）自动清掉，不会重复转场 */
  const skipRitual = () => {
    if (!factsReady) return;
    markResultReady('astrology');
  };

  /** 共享星盘元素：同一 layoutId 在 ritual/result 两相位间做树内布局动画；
   *  06 起结果相位透传点选交互（selectedBody/onSelectBody），仪式相位不传即为纯展示；
   *  结果相位升级「星渊」WebGL 场景（探测/加载失败自动回退 SVG 轮，兜底节点同源复用） */
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
        {phase === 'result' && wheelProps ? (
          <AstrologyWheelSceneSwitch
            facts={chartFacts}
            selectedBody={wheelProps.selectedBody}
            onSelectBody={wheelProps.onSelectBody}
            isActive={isActive}
            fallback={
              <AstrologyChartWheel
                facts={chartFacts}
                selectedBody={wheelProps.selectedBody}
                onSelectBody={wheelProps.onSelectBody}
                className="drop-shadow-[0_18px_42px_rgba(67,56,202,0.16)] dark:drop-shadow-[0_18px_48px_rgba(2,6,23,0.6)]"
              />
            }
          />
        ) : (
          <AstrologyChartWheel
            facts={chartFacts}
            revealStage={phase === 'ritual' ? stage : undefined}
            selectedBody={wheelProps?.selectedBody ?? null}
            onSelectBody={wheelProps?.onSelectBody}
            className="drop-shadow-[0_18px_42px_rgba(67,56,202,0.16)] dark:drop-shadow-[0_18px_48px_rgba(2,6,23,0.6)]"
          />
        )}
      </motion.div>
    ) : null;

  /* ---------- 失败恢复卡（安静：无整页红色、无破碎特效） ---------- */

  /* 真值在途（chartFacts=null 且无 error）是等待室状态，不落失败卡；
     result 相位却无真值理论上不可达（markResultReady 已由转场闸门守住），仍按失败兜底，不留空白页 */
  if (error || (phase === 'result' && !factsReady)) {
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
              <AstrologyCtaButton onClick={retry} className="h-12">
                <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
                重新计算
              </AstrologyCtaButton>
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

  /* ---------- 读屏活体区（跨相位常驻） ---------- */

  /** 活体区文案：仪式期为当前阶段，等待室为「最后校准中…」，转结果相位时变为完成宣告。
   *  读屏器不播报 live region 与结果树同一次挂载的初始内容，只有同一节点的内容变化才会被读出——
   *  因此该节点必须挂在相位分支之外（两个相位共用一个），不能各写一个。 */
  const liveStatusText =
    phase === 'result'
      ? '星盘已生成，正在展示你的结果'
      : waitingForFacts
        ? '最后校准中…'
        : (stages[stage - 1]?.doing ?? '');

  /* ---------- 统一返回壳：仪式（05）与结果（06）同树，星盘轮以 layoutId 连续转场 ---------- */

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {liveStatusText}
      </p>

      {phase === 'ritual' ? (
        /* ---------- 加载仪式相位 ---------- */
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
                    {/* 真值在途：先立同心圆坐标框架（不虚构行星位置、不塌陷宽高），真值一到即由星盘轮接管同一位置 */}
                    {factsReady ? wheelSlot('relative mx-auto w-full') : <RitualFramePlaceholder />}
                  </div>
                  {/* 无宫位档：月光紫范围徽章（第三阶段起伴随，不播十二宫动画）；
                      真值在途时含宫位与否未知，徽章等真值到达再判（否则完整盘会先亮出「无宫位」徽章）；
                      relative z-10：表圈 -inset-[5.5%] 外溢会压住盘下徽章（同表单页说明文字的原因） */}
                  {factsReady && !withHouses && stage >= 2 && (
                    <motion.p
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="relative z-10 mt-3 text-center"
                    >
                      <span className="inline-block rounded-full border border-violet-300/40 bg-violet-200/20 px-3 py-1 text-[11px] font-semibold tracking-wider text-violet-600 dark:border-violet-300/25 dark:bg-violet-400/10 dark:text-violet-300">
                        无宫位行星盘
                      </span>
                    </motion.p>
                  )}
                </div>

                {/* 左列（移动端下方）：四段真实进度清单（阶段切换由上方常驻活体区宣布） */}
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
                                  : 'text-day-muted dark:text-night-faint'
                            )}
                          >
                            {done ? s.done : s.doing}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  {/* 等待室：仪式窗已走满而真值未到（真实计算域慢时）——如实说明还在等最后一环 */}
                  {waitingForFacts && (
                    <p className="mt-5 text-center text-xs font-medium leading-relaxed text-indigo-600 dark:text-indigo-300 xl:text-left">
                      最后校准中…
                    </p>
                  )}
                  <p className="mt-6 text-center text-xs leading-relaxed text-day-muted dark:text-night-faint xl:text-left">
                    进度由真实计算步骤推进，不设百分比
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 跳过动画：低调文字钮固定在右下角（移动端抬到全局底栏之上，桌面端贴视口右下）；
              只在真值已就位时可直达——未就位时无结果可看，按钮置灰并由 aria-label 说明原因；
              热区 ≥44px，减少动态下同样保留 */}
          <button
            type="button"
            onClick={skipRitual}
            disabled={!factsReady}
            aria-label={factsReady ? '跳过动画，直接查看结果' : '星盘仍在计算，稍后才能跳过动画'}
            className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-20 inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-xs font-medium text-day-muted transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 disabled:pointer-events-none disabled:opacity-40 lg:bottom-6 lg:right-6 dark:text-night-faint dark:hover:text-indigo-200"
          >
            跳过动画
          </button>
        </DestinyPageScaffold>
      ) : (
        /* ---------- 结果相位（06：真实首屏——护照/主轴/三卡/交互轮；wheelSlot 插槽保持共享元素转场） ---------- */
        <DestinyPageScaffold withNavOffset tone="cosmos">
          <AstrologyStarfield />
          <div className="relative z-10 h-full min-h-0 overflow-y-auto custom-scrollbar">
            <AstrologyResultView wheelSlot={wheelSlot} />
          </div>
        </DestinyPageScaffold>
      )}
    </>
  );
}
