'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════
//  夜幕星宫 · 深空背景组件
//  - 确定性伪随机星点(固定种子,SSR/CSR 渲染一致)
//  - 星云光斑 + 星点闪烁,全部走 CSS 动画,尊重 reduced-motion
// ═══════════════════════════════════════════════════════════════

/** mulberry32 确定性伪随机生成器(固定种子保证两端一致) */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Star = {
  left: number; // 百分比
  top: number; // 百分比
  size: number; // px
  delay: number; // s
  duration: number; // s
  bright: boolean; // 是否亮星(带十字光晕)
};

function makeStars(count: number, seed: number): Star[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 100,
    size: rand() < 0.85 ? 1 : 1.5 + rand(),
    delay: rand() * 6,
    duration: 3 + rand() * 5,
    bright: rand() > 0.93,
  }));
}

// 模块级预生成:避免每次渲染抖动
const STARS_PAGE = makeStars(110, 20260722);
const STARS_PANEL = makeStars(46, 19491001);

function StarField({ stars }: { stars: Star[] }) {
  return (
    <>
      {stars.map((s, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-[#D8D4FF]"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            boxShadow: s.bright
              ? '0 0 6px 1px rgba(196,181,253,0.8), 0 0 14px 2px rgba(167,139,250,0.35)'
              : '0 0 3px rgba(216,212,255,0.5)',
            animation: `ziwei-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </>
  );
}

type NightSkyProps = {
  /** page=整页密度 / panel=面板内密度 */
  density?: 'page' | 'panel';
  className?: string;
  /** 是否渲染星云光斑(默认开) */
  nebula?: boolean;
};

/** 深空星幕:星点闪烁 + 紫微色星云呼吸,absolute 铺满足级容器 */
export function NightSky({ density = 'page', className, nebula = true }: NightSkyProps) {
  const stars = density === 'page' ? STARS_PAGE : STARS_PANEL;
  const breatheStyle = useMemo(
    () => ({ animation: 'ziwei-breathe 14s ease-in-out infinite' }) as const,
    []
  );

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {nebula && (
        <>
          {/* 紫微星云(左上) */}
          <div
            className="absolute -left-32 -top-32 h-96 w-96 rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle, rgba(139,92,246,0.22) 0%, rgba(99,60,200,0.08) 45%, transparent 70%)',
              ...breatheStyle,
            }}
          />
          {/* 鎏金星云(右下,延迟反向相位) */}
          <div
            className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle, rgba(231,200,115,0.10) 0%, rgba(180,140,60,0.05) 45%, transparent 70%)',
              animation: 'ziwei-breathe 18s ease-in-out 4s infinite',
            }}
          />
          {/* 靛蓝深空星云(中部偏右) */}
          <div
            className="absolute right-1/4 top-1/3 h-80 w-80 rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle, rgba(76,99,210,0.14) 0%, rgba(50,60,140,0.06) 50%, transparent 75%)',
              animation: 'ziwei-breathe 22s ease-in-out 8s infinite',
            }}
          />
        </>
      )}
      <StarField stars={stars} />
    </div>
  );
}

/** 夜幕画布底色(深空墨蓝渐变,带一丝紫调) */
export const nightCanvasClass =
  'bg-[radial-gradient(120%_90%_at_50%_0%,#10152E_0%,#0A0E20_45%,#06081A_100%)]';
