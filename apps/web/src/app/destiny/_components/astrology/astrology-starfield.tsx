'use client';

/**
 * astrology-starfield.tsx —— 星座寰宇天象仪与星空背景
 *
 * 视觉构成：
 * 1. 晨曦星云 / 午夜深空底色：浅色模式下融合柔和紫蓝与恒星金光，告别惨白；深色模式为午夜深空压角；
 * 2. 浑天仪同心天球经纬网（Armillary Celestial Grid）：精密天体力学观测仪的圆环与极向刻度线；
 * 3. 固定种子的双层星野（mulberry32 伪随机）：远层微星 + 近层光晕亮星 + 深色偶发流星；
 * 4. 完全适配系统的无障碍减弱动态偏好（motion-reduce）。
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/** mulberry32 伪随机：保证星点布局每次渲染一致 */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function AstrologyStarfield({ seed = 20260806 }: { seed?: number }) {
  /** 远层：密而小、暗，铺深空纵深 */
  const farStars = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: 110 }, (_, i) => ({
      key: i,
      left: rand() * 100,
      top: rand() * 100,
      size: 0.6 + rand() * 1.2,
      opacity: 0.16 + rand() * 0.4,
      twinkle: rand() < 0.2,
      delay: rand() * 9,
      duration: 7 + rand() * 6,
    }));
  }, [seed]);

  /** 近层：少而亮、带光晕，是「前景星」 */
  const nearStars = useMemo(() => {
    const rand = mulberry32(seed ^ 0x9e3779b9);
    return Array.from({ length: 14 }, (_, i) => ({
      key: i,
      left: rand() * 100,
      top: rand() * 100,
      size: 1.8 + rand() * 1.6,
      opacity: 0.5 + rand() * 0.4,
      delay: rand() * 8,
      duration: 6 + rand() * 5,
    }));
  }, [seed]);

  /** 流星：两条不同轨迹（起点/延迟错开），只在深色主题可见 */
  const meteors = useMemo(() => {
    const rand = mulberry32(seed ^ 0x51f15e);
    return Array.from({ length: 2 }, (_, i) => ({
      key: i,
      left: 18 + rand() * 55,
      top: 4 + rand() * 26,
      duration: 10 + rand() * 5,
      delay: 3 + rand() * 9,
    }));
  }, [seed]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* ═══ 1. 环境底色层 ═══ */}
      {/* 浅色主题：晨曦星云弥散（避免苍白空旷，在右侧天象区与左上方注入柔和暖金与淡紫） */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_78%_45%,rgba(99,102,241,0.08),rgba(168,85,247,0.04)_50%,transparent_75%)] dark:hidden" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,212,145,0.06),transparent_40%)] dark:hidden" />

      {/* 深色主题：午夜深空压角 */}
      <div className="absolute inset-0 hidden dark:block dark:bg-[radial-gradient(115%_85%_at_50%_0%,#111638_0%,#0A0E22_48%,#05070F_100%)]" />

      {/* ═══ 2. 浑天仪天球同心经纬网（Armillary Celestial Grid） ═══ */}
      {/* 居中偏右对齐星盘区域，极轻透明度，营造古典与现代交融的天文台视效 */}
      <svg
        className="absolute -right-20 top-1/2 h-[720px] w-[720px] -translate-y-1/2 opacity-[0.45] dark:opacity-[0.22] sm:right-[-4%] sm:h-[840px] sm:w-[840px] xl:right-[3%]"
        viewBox="0 0 800 800"
        fill="none"
      >
        <circle
          cx="400"
          cy="400"
          r="380"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 8"
          className="text-indigo-400/35 dark:text-indigo-300/30"
        />
        <circle
          cx="400"
          cy="400"
          r="300"
          stroke="currentColor"
          strokeWidth="0.8"
          className="text-indigo-300/25 dark:text-indigo-200/20"
        />
        <circle
          cx="400"
          cy="400"
          r="220"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 6"
          className="text-indigo-400/30 dark:text-indigo-300/25"
        />
        <circle
          cx="400"
          cy="400"
          r="140"
          stroke="currentColor"
          strokeWidth="0.8"
          className="text-indigo-300/20 dark:text-indigo-200/15"
        />
        {/* 经纬十字与黄道斜切微线 */}
        <line
          x1="400"
          y1="20"
          x2="400"
          y2="780"
          stroke="currentColor"
          strokeWidth="0.6"
          strokeDasharray="6 6"
          className="text-indigo-300/20 dark:text-indigo-200/15"
        />
        <line
          x1="20"
          y1="400"
          x2="780"
          y2="400"
          stroke="currentColor"
          strokeWidth="0.6"
          strokeDasharray="6 6"
          className="text-indigo-300/20 dark:text-indigo-200/15"
        />
        <line
          x1="130"
          y1="130"
          x2="670"
          y2="670"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-indigo-300/15 dark:text-indigo-200/10"
        />
        <line
          x1="130"
          y1="670"
          x2="670"
          y2="130"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-indigo-300/15 dark:text-indigo-200/10"
        />
      </svg>

      {/* ═══ 3. 双层星野粒子 ═══ */}
      {farStars.map((s) => (
        <span
          key={s.key}
          className={cn(
            'absolute rounded-full bg-slate-400/40 dark:bg-white',
            s.twinkle && 'animate-pulse motion-reduce:animate-none'
          )}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}

      {nearStars.map((s) => (
        <span
          key={`near-${s.key}`}
          className="absolute animate-pulse rounded-full bg-indigo-300/60 motion-reduce:animate-none dark:bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            boxShadow: '0 0 10px 2px rgba(129,140,248,0.45)',
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}

      {/* ═══ 4. 偶发流星（仅深色主题下可见） ═══ */}
      {meteors.map((m) => (
        <span
          key={`meteor-${m.key}`}
          className="absolute hidden h-px w-[120px] -rotate-[38deg] rounded-full dark:block motion-reduce:hidden"
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(196,181,253,0.35) 60%, transparent)',
            animation: `acw-meteor ${m.duration}s linear ${m.delay}s infinite`,
            opacity: 0,
          }}
        />
      ))}
      <style>{`@keyframes acw-meteor { 0% { transform: translateX(0) rotate(-38deg); opacity: 0; } 3% { opacity: 0.9; } 9% { transform: translateX(-190px) rotate(-38deg); opacity: 0; } 100% { transform: translateX(-190px) rotate(-38deg); opacity: 0; } }`}</style>
    </div>
  );
}
