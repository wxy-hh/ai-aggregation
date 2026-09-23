'use client';

/**
 * astrology-ritual.tsx —— 加载仪式（等待室）+ 共享元素转场 + 结果首屏挂载（设计文档 §6.4/§6.5，05/06 工单）
 *
 * 结构决策（为什么加载与结果住在同一组件树）：
 * 转场时加载页星盘要「连续放大、位移并落定为首屏星盘轮」。本组件同时承载 ritual / result
 * 两个相位，星盘轮以 layoutId 在同一棵树内做布局动画——无卸载、无跳帧的共享元素转场
 * （减少动态时退化为交叉淡入）。结果相位由 AstrologyResultView 承载（06：护照/主轴/三卡/交互轮），
 * 星盘轮由深模块自主承载并经 AstrologyWheelTransition 共享元素转场。
 *
 * 诚实性约束（02 工单起由真实报告流事件驱动；03 工单按设计文档 §6.4 调整转场口径）：
 * - 真值（chart-facts 帧）由报告流在仪式窗内送达：提交即进本组件，四段视觉节奏照常播放，
 *   但第四段（解读层）只在真值到达后才揭幕——真值未到时进度停在第三段「进行中」，
 *   不亮第四段、也不宣称算完（chart-facts 是前三段唯一的完成证据）；
 * - 转场条件是「仪式窗已走满 **且** 真值已就位」：真值锁定即离开加载页进入结果页，**不等待 AI 全文**
 *   （设计文档 §6.4：结果页先渲染星盘轮与骨架，主轴与各模块文案流式浮现；加载页第四阶段仅代表
 *   「解读请求已发出」）。解读到达 / 降级 / 超时都在结果页由分区事件与诚实失败卡承接；
 * - 仪式窗走满而真值未到（真实计算域慢时）：停在第三阶段，并如实加一行「最后校准中…」，
 *   真值一到立即推进。
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
import { useSettingsStore } from '@/stores/settings-store';
import { useAstrologyNightThemeStore } from '@/stores/astrology-night-theme-store';
import { resolveAstrologyNightTheme } from '@/lib/utils/astrology-night-theme';
import { astrologySession } from '@/lib/astrology/chart-request';
import type { PlanetBody } from '@/lib/astrology/chart-facts';
import { ZODIAC_ORDER } from '@/lib/astrology/zh-names';
import { DestinyPageScaffold } from '../layout/destiny-page-scaffold';
import { AstrologyChartWheel } from './astrology-chart-wheel';
import { ZodiacSignGlyph } from './astrology-glyphs';
import { AstrologyCtaButton } from './astrology-cta-button';
import { preloadWheelScene } from './astrology-wheel';
import { AstrologyWheelTransition } from './astrology-wheel-transition';
import { AstrologyResultView } from './astrology-result-view';
import { AstrologyStarfield } from './astrology-starfield';
import { AstrologyNightNebula } from './astrology-night-nebula';
import { resetAstrologyScroll } from './astrology-scroll';
import type { AstrologyFormData } from '../astrology-types';
import { birthSummary } from '@/lib/astrology/presentation';

/* ---------- 仪式节奏（最小仪式窗 3.2s，落在 2.5–4s 区间） ---------- */

const STAGE_2_AT = 800; // 行星依序点亮
const STAGE_3_AT = 1800; // 宫位线与相位生长（无宫位：整理相位）
const STAGE_4_AT = 2700; // 几何静止，宇宙重点已整理完成
const WINDOW_END_AT = 3200; // 最小仪式窗走满 → 真值若已就位即转场（未就位则进等待室）

type RitualStage = 1 | 2 | 3 | 4;

/* ---------- 四段真实进度清单：前三段主语「系统」，第四段为解读层（AI 整理） ---------- */

function stageCopy(
  withHouses: boolean,
  interpretationUnavailable: boolean
): Array<{ doing: string; done: string }> {
  return [
    { doing: '系统正在校准出生地与当地时区', done: '系统已校准出生地与当地时区' },
    { doing: '系统正在定位行星与月亮', done: '系统已定位行星与月亮' },
    {
      doing: withHouses ? '系统正在绘制十二宫与关键相位' : '系统正在整理行星位置与关键相位',
      done: withHouses ? '系统已绘制十二宫与关键相位' : '系统已整理行星位置与关键相位',
    },
    {
      doing: 'AI 正在基于星盘事实整理宇宙重点',
      // 解读降级（本票 LLM 未接入 / 额度不足）时如实收尾，不写「已整理完成」
      done: interpretationUnavailable ? '宇宙重点整理暂不可用' : '宇宙重点已整理完成',
    },
  ];
}

/* ---------- 失败恢复卡的细线骨架（停在天文坐标框架，不虚构行星位置） ---------- */

function RitualWireframe() {
  const reduceMotion = useReducedMotion();
  const ticks = useMemo(() => Array.from({ length: 24 }, (_, i) => i * 15), []);
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden>
        <circle
          cx={100}
          cy={100}
          r={94}
          fill="none"
          strokeWidth={1}
          className="stroke-slate-400/50 dark:stroke-white/15"
        />
        <circle
          cx={100}
          cy={100}
          r={72}
          fill="none"
          strokeWidth={0.8}
          className="stroke-slate-400/45 dark:stroke-white/[0.12]"
        />
        <circle
          cx={100}
          cy={100}
          r={46}
          fill="none"
          strokeWidth={0.7}
          className="stroke-slate-400/40 dark:stroke-white/10"
        />
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

/* ---------- 真值在途的坐标框架占位（等待室；只画仪器本体，不虚构行星位置） ---------- */

/** 与 astrology-chart-wheel 同档的盘面几何（占位与真轮同尺寸同色系，交接时外框不跳动） */
const FRAME_CX = 280;
const FRAME_CY = 280;
const FRAME_R_OUT = 276;
const FRAME_R_ZODIAC_OUT = 245;
const FRAME_R_ZODIAC_IN = 200;
const FRAME_R_GLYPH = 222.5;
const FRAME_GLYPH_SIZE = 20;

/**
 * 真值在途的「绘制中」框架：先把天象仪本体立起来——深空盘面、表圈、黄道十二宫环与度数刻度、
 * 盘心光核；行星 / 宫位 / 相位这些真值驱动的图层等真值到达后再逐层落位。
 *
 * 为什么不是一圈空心圆：提交后到真值回来之间会有几百毫秒到一两秒，等待期只画细线同心圆
 * 会让轮盘位看上去是「空白」（反馈原文）。这里把仪器本体先画满：等待期看到的是「盘面已立、
 * 正在定位行星」，真值一到即由星盘轮在同一位置接管（同几何同色系，不跳变）。
 * 全部为静态几何：不含任何虚构的行星位置、宫位或相位。
 */
function RitualFramePlaceholder() {
  const polar = (thetaDeg: number, r: number): [number, number] => {
    const rad = (thetaDeg * Math.PI) / 180;
    return [FRAME_CX + r * Math.cos(rad), FRAME_CY + r * Math.sin(rad)];
  };
  /** 黄经 → 屏幕角（与星盘轮同一约定：白羊 0° 在左，黄经沿屏幕向下增长） */
  const screenTheta = (deg: number) => 180 - deg;
  const signDegrees = Array.from({ length: 12 }, (_, i) => i * 30);
  const tickDegrees = Array.from({ length: 60 }, (_, i) => i * 6);

  return (
    <svg
      viewBox="0 0 560 560"
      className="relative h-auto w-full"
      aria-hidden
      data-testid="astrology-wheel-frame"
    >
      <defs>
        {/* 深空穹顶渐变（与星盘轮同色档） */}
        <radialGradient id="acw-ritual-frame-disc" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0F1A42" />
          <stop offset="30%" stopColor="#0C1535" />
          <stop offset="55%" stopColor="#091028" />
          <stop offset="80%" stopColor="#060A1E" />
          <stop offset="100%" stopColor="#040816" />
        </radialGradient>
        <radialGradient id="acw-ritual-frame-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#818CF8" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#6366F1" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#1E1B4B" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="acw-ritual-frame-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFBEB" stopOpacity="0.88" />
          <stop offset="22%" stopColor="#FDE68A" stopOpacity="0.6" />
          <stop offset="48%" stopColor="#F59E0B" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#4338CA" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 深空盘面 + 仪器表圈 */}
      <circle cx={FRAME_CX} cy={FRAME_CY} r={FRAME_R_OUT} fill="url(#acw-ritual-frame-disc)" />
      <circle
        cx={FRAME_CX}
        cy={FRAME_CY}
        r={FRAME_R_OUT}
        fill="none"
        strokeWidth={1.5}
        stroke="rgba(245,212,134,0.45)"
      />
      <circle
        cx={FRAME_CX}
        cy={FRAME_CY}
        r={270}
        fill="none"
        strokeWidth={0.8}
        stroke="rgba(255,255,255,0.18)"
        strokeDasharray="1 3"
      />

      {/* 盘心光核 */}
      <circle cx={FRAME_CX} cy={FRAME_CY} r={80} fill="url(#acw-ritual-frame-halo)" />
      <circle cx={FRAME_CX} cy={FRAME_CY} r={26} fill="url(#acw-ritual-frame-core)" />

      {/* 黄道环底衬与内外沿 */}
      <circle
        cx={FRAME_CX}
        cy={FRAME_CY}
        r={(FRAME_R_ZODIAC_OUT + FRAME_R_ZODIAC_IN) / 2}
        fill="none"
        strokeWidth={FRAME_R_ZODIAC_OUT - FRAME_R_ZODIAC_IN}
        stroke="rgba(8,13,34,0.72)"
      />
      <circle
        cx={FRAME_CX}
        cy={FRAME_CY}
        r={FRAME_R_ZODIAC_OUT}
        fill="none"
        strokeWidth={1.2}
        stroke="rgba(245,212,134,0.30)"
      />
      <circle
        cx={FRAME_CX}
        cy={FRAME_CY}
        r={FRAME_R_ZODIAC_IN}
        fill="none"
        strokeWidth={1}
        stroke="rgba(245,212,134,0.20)"
      />

      {/* 度数刻度（每 6°） */}
      {tickDegrees.map((deg) => {
        const [x1, y1] = polar(screenTheta(deg), FRAME_R_ZODIAC_OUT);
        const [x2, y2] = polar(screenTheta(deg), FRAME_R_ZODIAC_OUT - 7);
        return (
          <line
            key={`tick-${deg}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth={0.8}
            stroke="rgba(245,212,134,0.28)"
          />
        );
      })}

      {/* 十二宫界线 + 星座符号 */}
      {signDegrees.map((deg) => {
        const [x1, y1] = polar(screenTheta(deg), FRAME_R_ZODIAC_IN);
        const [x2, y2] = polar(screenTheta(deg), FRAME_R_ZODIAC_OUT);
        return (
          <line
            key={`boundary-${deg}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth={1}
            stroke="rgba(245,212,134,0.42)"
          />
        );
      })}
      {signDegrees.map((deg, i) => {
        const [gx, gy] = polar(screenTheta(deg + 15), FRAME_R_GLYPH);
        return (
          <g key={`glyph-${deg}`}>
            <circle cx={gx} cy={gy} r={12} fill="rgba(245,212,134,0.06)" />
            <ZodiacSignGlyph
              sign={ZODIAC_ORDER[i]}
              x={gx - FRAME_GLYPH_SIZE / 2}
              y={gy - FRAME_GLYPH_SIZE / 2}
              width={FRAME_GLYPH_SIZE}
              height={FRAME_GLYPH_SIZE}
              className="text-amber-200/75"
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- 主组件 ---------- */

export function AstrologyRitualResult() {
  const reduceMotion = useReducedMotion();
  const {
    step,
    formData,
    chartFacts,
    error,
    errorKind,
    interpretation,
    setWorkspaceState,
    markResultReady,
  } = useDestinyWorkspaceStore(
    useShallow((s) => ({
      step: s.astrology.step,
      formData: s.astrology.formData,
      chartFacts: s.astrology.chartFacts,
      error: s.astrology.error,
      errorKind: s.astrology.errorKind,
      interpretation: s.astrology.interpretation,
      setWorkspaceState: s.setWorkspaceState,
      markResultReady: s.markResultReady,
    }))
  );

  const phase = step === 'result' ? 'result' : 'ritual';

  /** 「夜幕观星」结果页主题：手动偏好优先，缺省跟随全局明暗（仅作用于结果相位与失败恢复卡，仪式相位不动） */
  const nightPref = useAstrologyNightThemeStore((s) => s.pref);
  const systemResolved = useSettingsStore((s) => s.resolvedTheme);
  const isNight = resolveAstrologyNightTheme(nightPref, systemResolved) === 'night';
  /** 时间轴节奏（视觉推进）：只决定第几段被点亮，是否算完成由真实事件说了算 */
  const [timelineStage, setTimelineStage] = useState<RitualStage>(1);
  /** 最小仪式窗是否已走满（3.2s 到点置真）；转场还要求真值与解读结论都已就位 */
  const [windowElapsed, setWindowElapsed] = useState(false);

  /** 真值是否已到手：null 表示在途（等待室期间既不是失败、也不是可展示的结果） */
  const factsReady = chartFacts !== null;
  /** 解读层是否已有结论（unavailable 或 ready）：仅用于第四段的完成态文案，不再是转场条件 */
  const interpretationSettled =
    interpretation.status === 'unavailable' || interpretation.status === 'ready';
  const interpretationUnavailable = interpretation.status === 'unavailable';
  /** 含宫位与否取自事实层；真值在途时未知，第三阶段文案先用中性的「整理行星位置与关键相位」，
   *  真值一到即按真实盘面口径纠正 */
  const withHouses = chartFacts?.dataCompleteness === 'with-houses';
  const stages = useMemo(
    () => stageCopy(Boolean(withHouses), interpretationUnavailable),
    [withHouses, interpretationUnavailable]
  );
  /**
   * 展示阶段 = 时间轴节奏 ∩ 真实事件：真值未到时不亮起第四段（解读层还没有真值可基于），
   * 第三段保持「进行中」直到 chart-facts 到达；chart-facts 一到，前三段即视为完成
   * （服务端校准时区 / 定位行星 / 绘制宫位三步在同一请求内完成，只有这一帧是它们的完成证据）。
   */
  const stage: RitualStage = factsReady
    ? timelineStage
    : (Math.min(timelineStage, 3) as RitualStage);
  /** 某一段是否已完成：第四段额外要求解读结论收口（且必须已经走到第四段，避免结论先到时抢跑） */
  const stageDone = (num: RitualStage) =>
    stage > num || (num === 4 && stage === 4 && interpretationSettled);
  /** 等待室：仪式窗已满而真值未到——如实说明在等最后一环，不假装已完成 */
  const waitingForFacts = windowElapsed && !factsReady;
  /** 阶段推进：四段节奏不变（800/1800/2700ms），第 3200ms 只标记「仪式窗已走满」，
   *  转场由下方闸门判定（避免窗口一到就带着在途真值进结果页）。
   *  减少动态：同样的真实节奏，只是盘面各层静态出现、转场退化为交叉淡入。
   *  cleanup 依赖 phase：跳过按钮把 phase 提前切到 result 时，四个定时器一并清掉。 */
  useEffect(() => {
    if (phase !== 'ritual' || error) return;
    const timers = [
      setTimeout(() => setTimelineStage(2), STAGE_2_AT),
      setTimeout(() => setTimelineStage(3), STAGE_3_AT),
      setTimeout(() => setTimelineStage(4), STAGE_4_AT),
      setTimeout(() => setWindowElapsed(true), WINDOW_END_AT),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, error]);

  /**
   * 转场闸门（等待室语义）：仪式窗走满 **且** 真值已就位即转场（设计文档 §6.4：不等待 AI 全文）。
   * - 真值先到（真实路由约百毫秒级）：按原节奏在窗满那一瞬转场，解读文案在结果页流式浮现；
   * - 仪式窗先满：停在等待室并如实说明在等真值，真值一到立即转场；
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

  /** 预热星渊场景代码块：仪式这几秒顺手把 three.js 拉下来，结果页首屏不必再等它 */
  useEffect(() => {
    preloadWheelScene();
  }, []);

  /** 失败恢复：重新计算只重走已缺失的环节——真值在则只重播仪式，不在才重新请求。
   *  step 一律回落 form：失败卡可能停在结果步，不回落则重算后 phase 仍是 result，直接跳过仪式 */
  const retry = () => {
    setTimelineStage(1);
    setWindowElapsed(false);
    if (chartFacts) {
      // 真值已在：只重播仪式（entryView 回到 loading，确保工作区把仪式树留在前台）
      setWorkspaceState('astrology', {
        step: 'form',
        entryView: 'loading',
        error: null,
        errorKind: null,
      });
      return;
    }
    // 真值仍缺：由深模块自闭环发起真值重试流与历史落盘
    void astrologySession.retryFacts(formData).catch(() => {});
  };

  /** 返回修改资料：中止在途流并回落 form，否则工作区分发仍停在结果页，按钮点了没反应 */
  const backToForm = () => {
    astrologySession.abort('返回修改资料');
    setWorkspaceState('astrology', {
      step: 'form',
      entryView: 'form',
      error: null,
      errorKind: null,
    });
  };

  /** 跳过动画：真值已就位才可直达（未就位时无结果可看，按钮置灰并给出 aria 说明）；
   *  phase 随之变 result，进度定时器由推进 effect 的 cleanup（依赖 [phase]）自动清掉，不会重复转场 */
  const skipRitual = () => {
    if (!factsReady) return;
    markResultReady('astrology');
  };

  /* ---------- 失败恢复卡（安静：无整页红色、无破碎特效） ---------- */

  /* 真值在途（chartFacts=null 且无 error）是等待室状态，不落失败卡；
     result 相位却无真值理论上不可达（markResultReady 已由转场闸门守住），仍按失败兜底，不留空白页 */
  if (error || (phase === 'result' && !factsReady)) {
    const kindText =
      errorKind === 'model'
        ? '服务繁忙'
        : errorKind === 'timeout'
          ? '请求超时'
          : errorKind === 'validation'
            ? '资料校验未通过'
            : '网络中断或计算异常';
    return (
      <DestinyPageScaffold withNavOffset tone="cosmos" night={isNight}>
        {/* 夜幕观星：局部嵌套 dark 类翻转星野与全部 dark: 样式，星云只在夜幕态叠加 */}
        <div className={cn('relative h-full min-h-0', isNight && 'dark astrology-night')}>
          <AstrologyStarfield />
          {isNight && <AstrologyNightNebula />}
          <div className="relative z-10 flex h-full min-h-0 items-center justify-center overflow-y-auto custom-scrollbar px-6">
            <div className="night-card w-full max-w-sm rounded-[28px] border border-white/60 bg-white/85 p-8 text-center shadow-[0_24px_64px_-24px_rgba(30,41,82,0.25)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#0D1226]/[0.88]">
              <RitualWireframe />
              <h2 className="mt-6 font-heading text-lg font-bold text-slate-900 dark:text-white">
                别担心，出生资料已保留
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-night-muted">
                星盘绘制未完成（{kindText}）。
                {error && error !== '' ? error : '可以重新计算，或返回检查出生资料。'}
              </p>
              <div className="mt-6 flex flex-col gap-2.5">
                <AstrologyCtaButton onClick={retry} className="h-12">
                  <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
                  重新计算
                </AstrologyCtaButton>
                <button
                  type="button"
                  onClick={backToForm}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:text-night-muted dark:hover:text-indigo-200"
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.9} />
                  返回修改资料
                </button>
              </div>
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
                {birthSummary(formData, { name: formData.name.trim() || '本次星盘' })}
              </p>

              <div className="mt-6 grid flex-1 items-center gap-8 sm:mt-8 xl:grid-cols-[0.9fr_1.1fr] xl:gap-12">
                {/* 中央星盘：移动端在上，桌面右列 */}
                <div className="order-first xl:order-last">
                  <div className="relative mx-auto w-full max-w-[min(72vw,340px)] xl:max-w-[380px]">
                    <div
                      aria-hidden
                      className="absolute inset-[8%] rounded-full bg-indigo-400/[0.12] blur-2xl dark:bg-indigo-500/[0.18]"
                    />
                    {/* 真值在途：先立同心圆坐标框架（不虚构行星位置、不塌陷宽高），真值一到即由星盘轮接管同一位置 */}
                    {factsReady && chartFacts ? (
                      <AstrologyWheelTransition className="relative mx-auto w-full">
                        <AstrologyChartWheel
                          facts={chartFacts}
                          revealStage={stage}
                          className="drop-shadow-[0_18px_42px_rgba(67,56,202,0.16)] dark:drop-shadow-[0_18px_48px_rgba(2,6,23,0.6)]"
                        />
                      </AstrologyWheelTransition>
                    ) : (
                      <RitualFramePlaceholder />
                    )}
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
                      const done = stageDone(num);
                      const current = stage === num && !done;
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
                                animate={
                                  reduceMotion
                                    ? {}
                                    : { scale: [1, 1.7, 1], opacity: [0.8, 0.2, 0.8] }
                                }
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
                  {/* 等待室：仪式窗已走满而真值未到（真实计算域慢时）——如实说明在等哪一环。
                      解读层层不在此等待：真值锁定即转场，解读文案在结果页分区涌现（设计文档 §6.4） */}
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
            className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-20 inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-xs font-medium text-day-muted transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-40 lg:bottom-6 lg:right-6 dark:text-night-faint dark:hover:text-indigo-200"
          >
            跳过动画
          </button>
        </DestinyPageScaffold>
      ) : (
        /* ---------- 结果相位（06：真实首屏——护照/主轴/三卡/交互轮；AstrologyWheelTransition 保持共享元素转场） ---------- */
        <DestinyPageScaffold withNavOffset tone="cosmos" night={isNight}>
          {/* 夜幕观星：局部嵌套 dark 类翻转星野与全部 dark: 样式，星云只在夜幕态叠加 */}
          <div className={cn('relative h-full min-h-0', isNight && 'dark astrology-night')}>
            <AstrologyStarfield />
            {isNight && <AstrologyNightNebula />}
            <div className="relative z-10 h-full min-h-0 overflow-y-auto custom-scrollbar">
              <AstrologyResultView />
            </div>
          </div>
        </DestinyPageScaffold>
      )}
    </>
  );
}
