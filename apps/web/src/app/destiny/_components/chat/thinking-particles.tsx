'use client';

import { useEffect, useMemo, useRef } from 'react';

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

export function ThinkingParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const dimensions = { width: 0, height: 0, centerX: 0, centerY: 0 };

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dimensions.width = width;
      dimensions.height = height;
      dimensions.centerX = width / 2;
      dimensions.centerY = height / 2;
    };

    resize();
    window.addEventListener('resize', resize);

    // 创建粒子（数量减少，适配小气泡）
    const particles: Particle[] = Array.from({ length: 35 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 40 + Math.random() * 80;
      return {
        x: dimensions.centerX + Math.cos(angle) * radius,
        y: dimensions.centerY + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        alpha: 0.2 + Math.random() * 0.5,
        r: 0.6 + Math.random() * 1.2,
      };
    });

    const drawFrame = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      // 背景柔光
      const bg = ctx.createRadialGradient(
        dimensions.centerX,
        dimensions.centerY,
        5,
        dimensions.centerX,
        dimensions.centerY,
        80
      );
      bg.addColorStop(0, 'rgba(47,107,255,0.08)');
      bg.addColorStop(0.5, 'rgba(99,102,241,0.05)');
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // 粒子汇聚
      for (const p of particles) {
        const dx = dimensions.centerX - p.x;
        const dy = dimensions.centerY - p.y;
        const dist = Math.max(8, Math.hypot(dx, dy));
        const ax = (dx / dist) * 0.25;
        const ay = (dy / dist) * 0.25;
        p.vx = (p.vx + ax) * 0.9;
        p.vy = (p.vy + ay) * 0.9;
        p.x += p.vx;
        p.y += p.vy;

        ctx.beginPath();
        ctx.fillStyle = `rgba(99,102,241,${p.alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        // 粒子靠近中心后回收
        if (dist < 10) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 40 + Math.random() * 80;
          p.x = dimensions.centerX + Math.cos(angle) * radius;
          p.y = dimensions.centerY + Math.sin(angle) * radius;
          p.vx = 0;
          p.vy = 0;
        }
      }
    };

    if (reducedMotion) {
      // 降级：显示静态点
      drawFrame();
      return () => {
        window.removeEventListener('resize', resize);
      };
    }

    const loop = () => {
      drawFrame();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion]);

  return (
    <div className="relative w-full h-[72px]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-xs font-bold text-slate-400/80">思考中...</div>
      </div>
    </div>
  );
}
