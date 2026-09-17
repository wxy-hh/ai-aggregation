'use client';

/**
 * astrology-wheel-scene-switch.tsx —— 星渊 WebGL 场景的探测/加载/降级开关
 *
 * 三级降级链（任一环节不满足即回退 SVG 星盘轮，体验不劣化）：
 * 1. SSR/首帧水合前：渲染 SVG 兜底（无闪烁、无可访问性空洞）
 * 2. WebGL 上下文探测失败（低端机/省电模式/驱动黑名单）：永久回退 SVG
 * 3. three.js 代码块网络加载中：继续渲染 SVG，场景就绪后原地接管并淡入
 *
 * useWheelSceneAvailable 供外层布局联动（如结果页关闭 CSS 视差避免与相机视差叠加）。
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { AstrologyChartFacts, PlanetBody } from '@/lib/astrology/chart-facts';

/** 探测结果模块级缓存：一次探测全局复用，避免反复创建 canvas */
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

/** WebGL 场景可用性：null = 未探测（SSR/首帧），true/false = 探测结论 */
export function useWheelSceneAvailable(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(webGLCached);
  useEffect(() => {
    setOk(detectWebGL());
  }, []);
  return ok;
}

/** 场景代码按需分包：仅在结果页首次用到时才拉取 three.js chunk */
const LazyWheelScene = dynamic(() => import('./astrology-wheel-scene').then((m) => m.AstrologyWheelScene), {
  ssr: false,
});

export function AstrologyWheelSceneSwitch({
  facts,
  selectedBody,
  onSelectBody,
  fallback,
  className,
  planetOverrides,
}: {
  facts: AstrologyChartFacts;
  selectedBody?: PlanetBody | null;
  onSelectBody?: (body: PlanetBody | null) => void;
  /** SVG 星盘轮兜底节点（加载中与不可用时渲染） */
  fallback: React.ReactNode;
  className?: string;
  /** 行星黄经覆盖（表单预览太阳滑动用，与 SVG 轮同语义） */
  planetOverrides?: Partial<Record<PlanetBody, number>>;
}) {
  const ok = useWheelSceneAvailable();
  const [sceneReady, setSceneReady] = useState(false);

  // 探测通过后预热 chunk（与 SVG 兜底并行，消除接管空窗）
  useEffect(() => {
    if (ok === true) {
      import('./astrology-wheel-scene').then(() => setSceneReady(true)).catch(() => setSceneReady(false));
    }
  }, [ok]);

  if (ok !== true || !sceneReady) return <>{fallback}</>;
  return (
    <LazyWheelScene
      facts={facts}
      selectedBody={selectedBody ?? null}
      onSelectBody={onSelectBody}
      className={className}
      planetOverrides={planetOverrides}
    />
  );
}
