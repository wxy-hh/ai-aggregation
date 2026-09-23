'use client';

/**
 * astrology-wheel.tsx —— 星座模块星盘渲染的唯一深模块入口
 *
 * 职责与架构收敛：
 * 1. 深度自洽：WebGL 探测、按需分包、三级降级、交接时序、3D 浑天仪舞台与视差互斥全部内收；
 * 2. 状态订阅：激活态（isActive）由本模块直接订阅 destiny-workspace-store，消除五层穿透链；
 * 3. 兜底归一：内部统一使用权威兜底阴影，消除旧有多处漂移值；
 * 4. 纯 SVG 模式（scene=false）：专供入口首页等轻量场景，视差恒开且完全不拉取 WebGL chunk。
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import type { AstrologyChartFacts, PlanetBody } from '@/lib/astrology/chart-facts';
import { AstrologyChartWheel } from './astrology-chart-wheel';

/* ---------- 裁定 4：归一化兜底阴影（权威值） ---------- */
const CANONICAL_WHEEL_SHADOW =
  'relative drop-shadow-[0_18px_42px_rgba(67,56,202,0.16)] dark:drop-shadow-[0_18px_48px_rgba(2,6,23,0.6)]';

/* ---------- 1. WebGL 探测（模块级单例缓存） ---------- */

let webGLCached: boolean | null = null;

function detectWebGL(): boolean {
  if (webGLCached !== null) return webGLCached;
  try {
    const canvas = document.createElement('canvas');
    webGLCached = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    webGLCached = false;
  }
  return webGLCached;
}

/** 仅在单元测试环境下重置探测缓存 */
export function __resetWebGLCacheForTest(): void {
  webGLCached = null;
}

/** WebGL 场景可用性：null = 未探测（SSR/首帧），true/false = 探测结论 */
function useWheelSceneAvailable(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(webGLCached);
  useEffect(() => {
    setOk(detectWebGL());
  }, []);
  return ok;
}

/* ---------- 2. 场景按需分包与预热 ---------- */

const LazyWheelScene = dynamic(
  () => import('./astrology-wheel-scene').then((m) => m.AstrologyWheelScene),
  { ssr: false }
);

/**
 * 预热 three.js 代码块（幂等）：在真值计算在途时提前触发下载与解析，消除首屏等待
 */
let preloadStarted = false;
export function preloadWheelScene(): void {
  if (preloadStarted || typeof window === 'undefined') return;
  preloadStarted = true;
  void import('./astrology-wheel-scene').catch(() => {
    preloadStarted = false;
  });
}

/* ---------- 3. 3D 浑天仪舞台（内收原 AstrologyWheel3D） ---------- */

function AstrologyWheelStage({
  children,
  className,
  parallax = true,
}: {
  children: React.ReactNode;
  className?: string;
  parallax?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  // 倾斜幅度优雅且清晰可辨（±8°/±9°）：立体悬浮感更强，且平滑无眩晕
  const rx = useSpring(useTransform(py, [0, 1], [8, -8]), { stiffness: 120, damping: 20 });
  const ry = useSpring(useTransform(px, [0, 1], [-9, 9]), { stiffness: 120, damping: 20 });
  const parallaxOn = parallax && !reduceMotion;

  return (
    <div
      ref={ref}
      className={cn('relative [perspective:1200px]', className)}
      onPointerMove={
        parallaxOn
          ? (e) => {
              if (e.pointerType !== 'mouse' || !ref.current) return;
              const r = ref.current.getBoundingClientRect();
              px.set((e.clientX - r.left) / r.width);
              py.set((e.clientY - r.top) / r.height);
            }
          : undefined
      }
      onPointerLeave={
        parallaxOn
          ? () => {
              px.set(0.5);
              py.set(0.5);
            }
          : undefined
      }
    >
      {/* ═══ 地面引力透镜投影：悬浮天象仪的深度锚点（Z:-80px；night-wheel-glow 供夜幕观星金辉覆盖） ═══ */}
      <div
        aria-hidden
        className="night-wheel-glow pointer-events-none absolute inset-x-[8%] bottom-[-4%] h-[16%] rounded-[100%] bg-[radial-gradient(ellipse,rgba(79,70,229,0.28),transparent_72%)] blur-2xl dark:bg-[radial-gradient(ellipse,rgba(3,7,24,0.85),transparent_75%)]"
        style={{ transform: 'translateZ(-80px)' }}
      />

      <div
        className={cn(
          'h-full w-full [transform-style:preserve-3d]',
          !reduceMotion && 'acw-wheel-float'
        )}
      >
        <motion.div
          className="relative h-full w-full [transform-style:preserve-3d]"
          style={parallaxOn ? { rotateX: rx, rotateY: ry } : undefined}
        >
          {/* ═══ 浑天仪外壳层级（精简为 3 层，消除多余装饰） ═══ */}

          {/* 第 1 层：磨砂表圈（降低白色对比度，避免与深色盘面硬切） */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-[5.5%] rounded-full border border-white/50 bg-gradient-to-br from-white/50 via-indigo-50/20 to-amber-100/15 p-1.5 shadow-[0_16px_48px_-12px_rgba(30,41,82,0.18),inset_0_1px_6px_rgba(255,255,255,0.7),inset_0_-3px_10px_rgba(30,41,82,0.10)] backdrop-blur-md backdrop-saturate-150 dark:border-white/[0.12] dark:from-white/[0.06] dark:via-indigo-950/20 dark:to-amber-900/[0.06] dark:shadow-[0_20px_60px_-16px_rgba(0,0,0,0.7),inset_0_1px_3px_rgba(255,255,255,0.12)]"
            style={{ transform: 'translateZ(-16px)' }}
          >
            {/* 表圈内缘微导轨 */}
            <div className="h-full w-full rounded-full border border-amber-300/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]" />
          </div>

          {/* 第 2 层：黄道逆向差速环（Z:-10px，保持仪器运转感） */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute -inset-[3%] rounded-full border border-dashed border-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.22)]',
              !reduceMotion && 'animate-acw-spin-slowest-reverse'
            )}
            style={{ transform: 'translateZ(-10px)' }}
          >
            {/* 4 个极坐标定位微星芒点 */}
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
          </div>

          {/* 第 3 层：内壁阴影（盘面内凹纵深感，保持不变） */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_12px_32px_rgba(0,0,0,0.85),inset_0_0_20px_rgba(3,7,24,0.95)]"
            style={{ transform: 'translateZ(-4px)' }}
          />

          {/* ═══ 核心星盘轮主体（Z:0） ═══ */}
          {children}

          {/* ═══ 浑天仪前层天球赤道差速刻度环（Z:18px，顺时针平稳旋转，真实悬浮于盘面上方） ═══ */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute -inset-[8%] rounded-full border border-dashed border-white/40 shadow-[0_0_30px_rgba(255,255,255,0.25)]',
              !reduceMotion && 'animate-acw-spin-slower'
            )}
            style={{ transform: 'translateZ(18px)' }}
          >
            {/* 差速光度计微珠，随赤道环慢速行进，展现天体仪器的精密运转 */}
            <span className="absolute top-[10%] left-[16%] h-2.5 w-2.5 rounded-full bg-amber-200 shadow-[0_0_12px_rgba(253,230,138,1)]" />
            <span className="absolute bottom-[14%] right-[20%] h-2.5 w-2.5 rounded-full bg-sky-200 shadow-[0_0_12px_rgba(186,230,253,1)]" />
            <span className="absolute top-[80%] left-[22%] h-1.5 w-1.5 rounded-full bg-rose-200 shadow-[0_0_8px_rgba(254,205,211,1)]" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ---------- 4. WebGL 场景管线（探测、按需拉取与无缝交接） ---------- */

function AstrologyWheelWithScene({
  facts,
  className,
  selectedBody,
  onSelectBody,
  planetOverrides,
}: Omit<AstrologyWheelProps, 'scene'>) {
  const ok = useWheelSceneAvailable();
  /** 代码块已到位：可以挂载场景（此时仍在 SVG 兜底之上淡入） */
  const [sceneReady, setSceneReady] = useState(false);
  /** 场景首帧已画出且淡入结束：交接完成，才撤下 SVG 兜底 */
  const [scenePainted, setScenePainted] = useState(false);
  /** 裁定 1：直接订阅全局工作区 store 的激活态，切走时场景整帧停摆 */
  const isActive = useDestinyWorkspaceStore((s) => s.activeModule === 'astrology');

  // 探测通过后拉取场景 chunk
  useEffect(() => {
    if (ok === true) {
      import('./astrology-wheel-scene')
        .then(() => setSceneReady(true))
        .catch(() => setSceneReady(false));
    }
  }, [ok]);

  const svgWheel = (
    <AstrologyChartWheel
      facts={facts}
      planetOverrides={planetOverrides}
      selectedBody={selectedBody}
      onSelectBody={onSelectBody}
      className={CANONICAL_WHEEL_SHADOW}
    />
  );

  // 视差互斥：探测结论为 true 时关闭 DOM 视差（由场景相机视差接管），其余状态保持 DOM 视差
  const parallax = ok !== true;

  return (
    <AstrologyWheelStage className={className} parallax={parallax}>
      {ok !== true || !sceneReady ? (
        svgWheel
      ) : (
        /* 交接期两套渲染并存：SVG 兜底留在下层，场景首帧画出前不撤——消除空白空窗 */
        <div className="relative aspect-square w-full">
          {!scenePainted && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {svgWheel}
            </div>
          )}
          <LazyWheelScene
            facts={facts}
            selectedBody={selectedBody ?? null}
            onSelectBody={onSelectBody}
            className="absolute inset-0"
            planetOverrides={planetOverrides}
            isActive={isActive}
            onReady={() => setScenePainted(true)}
          />
        </div>
      )}
    </AstrologyWheelStage>
  );
}

/* ---------- 5. 主深模块对外导出 ---------- */

export type AstrologyWheelProps = {
  facts: AstrologyChartFacts;
  className?: string;
  selectedBody?: PlanetBody | null;
  onSelectBody?: (body: PlanetBody | null) => void;
  /** 行星黄经覆盖（表单预览太阳滑动用，语义与 SVG 轮一致） */
  planetOverrides?: Partial<Record<PlanetBody, number>>;
  /** false = 纯 SVG 模式（入口首页示例盘）：3D 舞台 + SVG 轮，不探测、不加载 WebGL chunk */
  scene?: boolean; // 默认 true
};

export function AstrologyWheel({
  facts,
  className,
  selectedBody,
  onSelectBody,
  planetOverrides,
  scene = true,
}: AstrologyWheelProps) {
  // 纯 SVG 模式：3D 舞台（视差恒开）+ 内联 SVG 轮，完全跳过探测与场景 chunk
  if (!scene) {
    return (
      <AstrologyWheelStage className={className} parallax={true}>
        <AstrologyChartWheel
          facts={facts}
          planetOverrides={planetOverrides}
          selectedBody={selectedBody}
          onSelectBody={onSelectBody}
          className={CANONICAL_WHEEL_SHADOW}
        />
      </AstrologyWheelStage>
    );
  }

  return (
    <AstrologyWheelWithScene
      facts={facts}
      className={className}
      selectedBody={selectedBody}
      onSelectBody={onSelectBody}
      planetOverrides={planetOverrides}
    />
  );
}
