'use client';

import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  r: number;
};

function usePrefersReducedMotion() {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }, []);
}

export function StarDecodeOverlay({ open }: { open: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    // 使用 ref 存储动态尺寸和中心点
    const dimensions = { width: 0, height: 0, centerX: 0, centerY: 0 };

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 更新尺寸和中心点
      dimensions.width = width;
      dimensions.height = height;
      dimensions.centerX = width / 2;
      dimensions.centerY = height / 2;
    };

    resize();
    window.addEventListener('resize', resize);

    const particles: Particle[] = Array.from({ length: 220 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 260 + Math.random() * 520;
      return {
        x: dimensions.centerX + Math.cos(angle) * radius,
        y: dimensions.centerY + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        alpha: 0.15 + Math.random() * 0.55,
        r: 0.8 + Math.random() * 1.6,
      };
    });

    startedAtRef.current = performance.now();

    const drawFrame = (t: number) => {
      const elapsed = t - startedAtRef.current;
      const progress = Math.min(1, elapsed / 2600);

      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      // 背景柔光 - 使用动态中心点
      const bg = ctx.createRadialGradient(
        dimensions.centerX,
        dimensions.centerY,
        20,
        dimensions.centerX,
        dimensions.centerY,
        520
      );
      bg.addColorStop(0, 'rgba(47,107,255,0.18)');
      bg.addColorStop(0.45, 'rgba(99,102,241,0.12)');
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // 粒子汇聚（向中心吸引）- 使用动态中心点
      for (const p of particles) {
        const dx = dimensions.centerX - p.x;
        const dy = dimensions.centerY - p.y;
        const dist = Math.max(18, Math.hypot(dx, dy));
        const ax = (dx / dist) * (0.18 + progress * 0.65);
        const ay = (dy / dist) * (0.18 + progress * 0.65);
        p.vx = (p.vx + ax) * 0.92;
        p.vy = (p.vy + ay) * 0.92;
        p.x += p.vx;
        p.y += p.vy;

        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        // 粒子靠近中心后回收到外圈，保证动效持续 - 使用动态中心点
        if (dist < 22) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 260 + Math.random() * 520;
          p.x = dimensions.centerX + Math.cos(angle) * radius;
          p.y = dimensions.centerY + Math.sin(angle) * radius;
          p.vx = 0;
          p.vy = 0;
        }
      }
    };

    const loop = (t: number) => {
      drawFrame(t);
      rafRef.current = requestAnimationFrame(loop);
    };

    if (reducedMotion) {
      drawFrame(startedAtRef.current);
      return () => {
        window.removeEventListener('resize', resize);
      };
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [open, reducedMotion]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'absolute inset-0 z-50 flex items-center justify-center',
        'bg-white/14 backdrop-blur-[12px]',
        'animate-in fade-in duration-200'
      )}
      role="dialog"
      aria-label="星空解码中"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[320px] bg-white/6 backdrop-blur-[3px] xl:block" />
      <div className="pointer-events-none absolute inset-y-0 left-[300px] hidden w-20 bg-gradient-to-r from-white/8 via-white/4 to-transparent xl:block" />

      <div className="relative h-full w-full">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(116,149,214,0.14),rgba(116,149,214,0)_62%)]" />

        {/* 玻璃圆环 + 中心文案 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <div className="h-[340px] w-[340px] rounded-full border border-white/50 bg-white/14 backdrop-blur-[18px] shadow-[0_30px_80px_-30px_rgba(47,107,255,0.38)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="px-6 text-center">
                <div className="text-sm font-bold tracking-[0.18em] text-slate-600">星空解码中</div>
                <div className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
                  提取命运密码
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  AI 正在从海量星宿数据中为你建立精准映射
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -inset-6 rounded-full border border-white/28 opacity-65" />
          </div>
        </div>
      </div>
    </div>
  );
}
