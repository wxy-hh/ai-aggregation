'use client';

/**
 * astrology-wheel-scene-switch.tsx —— 星渊 WebGL 场景的探测/加载/降级开关
 *
 * 三级降级链（任一环节不满足即回退 SVG 星盘轮，体验不劣化）：
 * 1. SSR/首帧水合前：渲染 SVG 兜底（无闪烁、无可访问性空洞）
 * 2. WebGL 上下文探测失败（低端机/省电模式/驱动黑名单）：永久回退 SVG
 * 3. three.js 代码块网络加载中：继续渲染 SVG；chunk 到位后场景在 SVG 之上淡入，
 *    **首帧画出并淡入结束才撤下 SVG**（此前撤会露出空窗，即「星盘要等一两秒才画出来」）
 *
 * useWheelSceneAvailable 供外层布局联动（如结果页关闭 CSS 视差避免与相机视差叠加）；
 * preloadWheelScene 供上游相位（加载仪式）预热 chunk，把下载解析挪出结果页首屏。
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
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

/**
 * 预热 three.js chunk（幂等）：仪式相位（真值在途的那几秒）先拉起来，
 * 结果页挂载时场景代码已就位，省掉首屏那 1-2 秒的下载与解析。
 */
let preloadStarted = false;
export function preloadWheelScene(): void {
  if (preloadStarted || typeof window === 'undefined') return;
  preloadStarted = true;
  void import('./astrology-wheel-scene').catch(() => {
    // 预热失败不改变任何行为：结果页挂载时会再拉一次，失败就继续用 SVG 兜底
    preloadStarted = false;
  });
}

export function AstrologyWheelSceneSwitch({
  facts,
  selectedBody,
  onSelectBody,
  fallback,
  className,
  planetOverrides,
  isActive = true,
}: {
  facts: AstrologyChartFacts;
  selectedBody?: PlanetBody | null;
  onSelectBody?: (body: PlanetBody | null) => void;
  /** SVG 星盘轮兜底节点（加载中、场景首帧画出前与不可用时渲染） */
  fallback: React.ReactNode;
  className?: string;
  /** 行星黄经覆盖（表单预览太阳滑动用，与 SVG 轮同语义） */
  planetOverrides?: Partial<Record<PlanetBody, number>>;
  /** 工作区激活态（默认 true）：false 时星渊场景进入暂停，不随后台帧循环空转 */
  isActive?: boolean;
}) {
  const ok = useWheelSceneAvailable();
  /** chunk 已到：可以挂载场景（此时仍在 SVG 兜底之上淡入） */
  const [sceneReady, setSceneReady] = useState(false);
  /** 场景首帧已画出且淡入结束：交接完成，才撤下 SVG 兜底 */
  const [scenePainted, setScenePainted] = useState(false);

  // 探测通过后预热 chunk（与 SVG 兜底并行，消除接管空窗）
  useEffect(() => {
    if (ok === true) {
      import('./astrology-wheel-scene').then(() => setSceneReady(true)).catch(() => setSceneReady(false));
    }
  }, [ok]);

  if (ok !== true || !sceneReady) return <>{fallback}</>;
  return (
    /* 交接期两套渲染并存：SVG 兜底留在下层，场景首帧画出前不撤——
       否则 chunks 到位但 WebGL 首帧还没画完，盘面会先消失一两秒 */
    <div className={cn('relative aspect-square w-full', className)}>
      {!scenePainted && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {fallback}
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
  );
}
