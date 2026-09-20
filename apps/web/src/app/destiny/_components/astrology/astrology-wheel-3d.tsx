'use client';

/**
 * astrology-wheel-3d.tsx —— 星盘轮 3D 浑天仪舞台包装
 *
 * 多层变换与空间深度合成：
 * - 浑天仪差速光轨：外层天球赤道虚线环顺时针 44s 超慢自转（位于盘面前方 Z:14px）；
 *                  次层黄道逆向刻度环逆时针 60s 回旋（位于盘面后方 Z:-12px）；
 * - 外层舞台：慢速悬浮公转（CSS keyframes acw-wheel-float，14s 一个呼吸，微幅倾斜）；
 * - 内层视差：鼠标在轮面上移动时，spring 弹性倾斜，形成真 3D 纵深错位（Parallax Depth Separation）；
 * - 地面引力透镜投影：位于盘面下方 Z:-80px，随倾角微幅错位，强化悬浮立体感；
 * - 完全适配无障碍减弱动态偏好（motion-reduce）。
 */

import { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

export function AstrologyWheel3D({
  children,
  className,
  /** 慢速悬浮公转（默认开；仪式页保持盘面稳定可关） */
  idle = true,
  /** 指针视差倾斜（默认开；纯展示场景可关） */
  parallax = true,
}: {
  children: React.ReactNode;
  className?: string;
  idle?: boolean;
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
          idle && !reduceMotion && 'acw-wheel-float'
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
              idle && !reduceMotion && 'animate-acw-spin-slowest-reverse'
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
              idle && !reduceMotion && 'animate-acw-spin-slower'
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
