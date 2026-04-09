'use client';

import { useEffect, useRef, useState } from 'react';

type LoadingIntensity = 'low' | 'medium' | 'high';
type LoadingVariant = 'inline' | 'immersive';

interface QimenLoadingAnimationProps {
  variant?: LoadingVariant;
  message?: string;
  subMessage?: string;
  intensity?: LoadingIntensity;
  showProgressHint?: boolean;
}

const NINE_STARS = ['天蓬', '天任', '天冲', '天辅', '天英', '天芮', '天柱', '天心', '天禽'] as const;
const EIGHT_DOORS = ['休', '生', '伤', '杜', '景', '死', '惊', '开'] as const;
const EIGHT_GODS = ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'] as const;

const PROGRESS_TEXTS = ['校准时空坐标', '构建九宫层', '演化门星神关系', '生成策略路径'];

function clampDpr(value: number) {
  return Math.min(2, Math.max(1, value));
}

function getIntensityScale(intensity: LoadingIntensity) {
  if (intensity === 'low') return 0.86;
  if (intensity === 'high') return 1.16;
  return 1;
}

function pulseOpacity(t: number, phase: number) {
  const wave = (Math.sin(((t + phase) / 3) * Math.PI * 2) + 1) / 2;
  return 0.6 + wave * 0.4;
}

function zenithFactor(angle: number, arc = 0.22) {
  const topAngle = -Math.PI / 2;
  const d = Math.abs(angle - topAngle);
  const wrapped = Math.min(d, Math.abs(d - Math.PI * 2), Math.abs(d + Math.PI * 2));
  if (wrapped >= arc) return 0;
  return 1 - wrapped / arc;
}

function drawYinYang(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, alpha: number) {
  ctx.save();
  ctx.translate(cx, cy);

  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
  ctx.arc(0, radius / 2, radius / 2, Math.PI / 2, -Math.PI / 2, true);
  ctx.arc(0, -radius / 2, radius / 2, Math.PI / 2, -Math.PI / 2);
  ctx.fillStyle = `rgba(68, 91, 138, ${0.24 * alpha})`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, radius, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.arc(0, -radius / 2, radius / 2, -Math.PI / 2, Math.PI / 2, true);
  ctx.arc(0, radius / 2, radius / 2, -Math.PI / 2, Math.PI / 2);
  ctx.fillStyle = `rgba(192, 208, 239, ${0.2 * alpha})`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, -radius / 2, radius * 0.11, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(223, 232, 251, ${0.36 * alpha})`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, radius / 2, radius * 0.11, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(93, 120, 176, ${0.4 * alpha})`;
  ctx.fill();

  ctx.restore();
}

function drawRingTrack(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  stroke: string,
  width = 1
) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawPalaceMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  kind: 'door' | 'god',
  color: string,
  alpha: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = `${color}${alpha})`;
  ctx.strokeStyle = `${color}${Math.min(1, alpha + 0.2)})`;
  ctx.lineWidth = 1;

  if (kind === 'door') {
    // diamond marker: emphasizes "门" gateway semantics
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // triangle marker: emphasizes "神" directional force semantics
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.1);
    ctx.lineTo(size * 0.92, size * 0.88);
    ctx.lineTo(-size * 0.92, size * 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function QimenLoadingAnimation({
  variant = 'immersive',
  message = '奇门盘局推演中...',
  subMessage = '按八神、八门、九星分环演化，生成可追溯策略建议',
  intensity = 'medium',
  showProgressHint = true,
}: QimenLoadingAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const reducedMotionRef = useRef(false);
  const [progressIndex, setProgressIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgressIndex((prev) => (prev + 1) % PROGRESS_TEXTS.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPref = () => {
      reducedMotionRef.current = mediaQuery.matches;
    };
    updateMotionPref();
    mediaQuery.addEventListener('change', updateMotionPref);
    return () => mediaQuery.removeEventListener('change', updateMotionPref);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let previousTime = performance.now();
    let sceneTime = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = clampDpr(window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const drawBackground = (w: number, h: number, t: number, scale: number) => {
      const driftX = Math.sin(t * 0.12) * w * 0.03;
      const driftY = Math.cos(t * 0.08) * h * 0.02;

      const mistA = ctx.createRadialGradient(
        w * 0.32 + driftX,
        h * 0.34 + driftY,
        w * 0.04,
        w * 0.32 + driftX,
        h * 0.34 + driftY,
        w * 0.46
      );
      mistA.addColorStop(0, `rgba(129, 161, 218, ${0.14 * scale})`);
      mistA.addColorStop(1, 'rgba(129, 161, 218, 0)');

      const mistB = ctx.createRadialGradient(
        w * 0.7 - driftX,
        h * 0.66 - driftY,
        w * 0.04,
        w * 0.7 - driftX,
        h * 0.66 - driftY,
        w * 0.42
      );
      mistB.addColorStop(0, `rgba(156, 183, 231, ${0.12 * scale})`);
      mistB.addColorStop(1, 'rgba(156, 183, 231, 0)');

      ctx.fillStyle = mistA;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = mistB;
      ctx.fillRect(0, 0, w, h);
    };

    const drawNinePalace = (cx: number, cy: number, r: number, scale: number) => {
      const size = r * 1.24;
      const cell = size / 3;
      const left = cx - size / 2;
      const top = cy - size / 2;

      ctx.strokeStyle = `rgba(167, 190, 232, ${0.24 * scale})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(left, top, size, size);
      ctx.stroke();

      for (let i = 1; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(left + cell * i, top);
        ctx.lineTo(left + cell * i, top + size);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(left, top + cell * i);
        ctx.lineTo(left + size, top + cell * i);
        ctx.stroke();
      }
    };

    const drawCore = (cx: number, cy: number, r: number, t: number, scale: number) => {
      const corePulse = 0.92 + 0.08 * Math.sin((t / 3) * Math.PI * 2);
      const microDrift = Math.sin((t / 6) * Math.PI * 2) * r * 0.012;

      drawYinYang(ctx, cx, cy + r * 0.06, r * 0.5, scale * corePulse);

      const chars = ['奇', '门', '遁', '甲'];
      const waveStep = 0.34;
      chars.forEach((char, i) => {
        const y = cy - r * 0.58 + i * r * 0.38 + microDrift;
        const waveTime = t - i * waveStep;
        const opacity = pulseOpacity(waveTime, i * 0.14);
        const glyphScale = 0.985 + Math.sin((waveTime * 2 * Math.PI) / 3 + i * 0.22) * 0.015;
        const zenithMoment = Math.max(0, Math.sin((waveTime * 2 * Math.PI) / 3 + i * 0.3));

        const grad = ctx.createLinearGradient(cx, y - 34, cx, y + 34);
        grad.addColorStop(0, `rgba(138, 93, 28, ${0.88 * opacity})`);
        grad.addColorStop(0.55, `rgba(184, 132, 47, ${0.95 * opacity})`);
        grad.addColorStop(1, `rgba(95, 60, 17, ${0.9 * opacity})`);

        ctx.save();
        ctx.translate(cx, y);
        ctx.scale(glyphScale, glyphScale);
        ctx.translate(-cx, -y);

        const halo = ctx.createRadialGradient(cx, y, 0, cx, y, r * 0.24);
        halo.addColorStop(0, `rgba(227, 192, 113, ${0.14 * opacity * (1 + zenithMoment)})`);
        halo.addColorStop(1, 'rgba(227, 192, 113, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, y, r * 0.24, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = grad;
        ctx.font = `700 ${Math.max(38, r * 0.34)}px "STKaiti", "KaiTi", "PingFang SC", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, cx, y);

        ctx.strokeStyle = `rgba(229, 189, 103, ${(0.28 + 0.12 * zenithMoment) * opacity})`;
        ctx.lineWidth = 0.8;
        ctx.strokeText(char, cx, y);
        ctx.restore();
      });
    };

    const drawLabelRing = (
      centerX: number,
      centerY: number,
      labels: readonly string[],
      radius: number,
      angleOffset: number,
      clockwise: boolean,
      palette: {
        text: string;
        glow: string;
        track: string;
        node: string;
      },
      fontPx: number,
      t: number,
      ringType: 'star' | 'door' | 'god'
    ) => {
      drawRingTrack(ctx, centerX, centerY, radius, palette.track, 1);

      const dir = clockwise ? 1 : -1;
      labels.forEach((label, i) => {
        const angle = angleOffset * dir + (i / labels.length) * Math.PI * 2 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        const baseOpacity = pulseOpacity(t, i * 0.22 + (ringType === 'star' ? 0 : ringType === 'door' ? 0.6 : 1.2));
        const zenith = zenithFactor(angle);
        const finalOpacity = zenith > 0 ? 1 : baseOpacity;
        const glowBoost = zenith > 0 ? 2 : 1;

        const glow = ctx.createRadialGradient(x, y, 0, x, y, fontPx * (2.1 + zenith * 0.8));
        glow.addColorStop(0, `${palette.glow}${0.22 * finalOpacity * glowBoost})`);
        glow.addColorStop(1, `${palette.glow}0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, fontPx * (2.1 + zenith * 0.8), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `${palette.node}${0.18 * finalOpacity})`;
        ctx.beginPath();
        ctx.arc(x, y, fontPx * 1.18, 0, Math.PI * 2);
        ctx.fill();

        if (ringType === 'door' || ringType === 'god') {
          const markerRadiusOffset = ringType === 'door' ? fontPx * 1.78 : fontPx * 1.92;
          const markerX = x + Math.cos(angle) * markerRadiusOffset;
          const markerY = y + Math.sin(angle) * markerRadiusOffset;
          drawPalaceMarker(
            ctx,
            markerX,
            markerY,
            ringType === 'door' ? fontPx * 0.34 : fontPx * 0.3,
            ringType,
            palette.node,
            0.28 * finalOpacity
          );
        }

        ctx.fillStyle = `${palette.text}${finalOpacity})`;
        ctx.font = `600 ${fontPx}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
      });
    };

    const drawFrame = (time: number) => {
      const dt = Math.min(0.05, (time - previousTime) / 1000);
      previousTime = time;
      sceneTime += dt;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cx = width / 2;
      const cy = height / 2 - (variant === 'immersive' ? 26 : 8);
      const base = Math.min(width, height) * (variant === 'immersive' ? 0.17 : 0.15);
      const scale = getIntensityScale(intensity);

      ctx.clearRect(0, 0, width, height);

      drawBackground(width, height, sceneTime, scale);
      drawNinePalace(cx, cy + base * 0.08, base, scale);

      const starSpeed = reducedMotionRef.current ? 0.12 : 0.34;
      const doorGodSpeed = reducedMotionRef.current ? 0.09 : 0.26;

      drawLabelRing(
        cx,
        cy,
        NINE_STARS,
        base * 1.34,
        sceneTime * starSpeed,
        true,
        {
          text: 'rgba(225, 238, 255, ',
          glow: 'rgba(138, 183, 255, ',
          track: 'rgba(135, 165, 217, 0.42)',
          node: 'rgba(120, 164, 236, ',
        },
        Math.max(13, base * 0.102),
        sceneTime,
        'star'
      );

      drawLabelRing(
        cx,
        cy,
        EIGHT_DOORS,
        base * 1.9,
        sceneTime * doorGodSpeed,
        false,
        {
          text: 'rgba(220, 247, 232, ',
          glow: 'rgba(88, 203, 150, ',
          track: 'rgba(95, 172, 136, 0.38)',
          node: 'rgba(94, 196, 145, ',
        },
        Math.max(13, base * 0.1),
        sceneTime,
        'door'
      );

      drawLabelRing(
        cx,
        cy,
        EIGHT_GODS,
        base * 2.3,
        sceneTime * doorGodSpeed + Math.PI / 8,
        false,
        {
          text: 'rgba(255, 227, 199, ',
          glow: 'rgba(237, 151, 84, ',
          track: 'rgba(196, 130, 84, 0.34)',
          node: 'rgba(214, 142, 88, ',
        },
        Math.max(11, base * 0.078),
        sceneTime,
        'god'
      );

      drawCore(cx, cy, base, sceneTime, scale);

      const topY = cy - base * 2.3;
      const topGlow = ctx.createRadialGradient(cx, topY, 0, cx, topY, base * 0.5);
      topGlow.addColorStop(0, `rgba(210, 231, 255, ${0.38 * scale})`);
      topGlow.addColorStop(1, 'rgba(210, 231, 255, 0)');
      ctx.fillStyle = topGlow;
      ctx.beginPath();
      ctx.arc(cx, topY, base * 0.5, 0, Math.PI * 2);
      ctx.fill();

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        previousTime = performance.now();
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [intensity, variant]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-[linear-gradient(145deg,rgba(246,248,255,0.16)_0%,rgba(231,238,252,0.12)_45%,rgba(220,230,248,0.1)_100%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.28),0_12px_48px_rgba(68,96,138,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(153,184,234,0.14),rgba(153,184,234,0)_62%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white/22 via-white/8 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white/20 to-transparent" />

      <div ref={hostRef} className="relative flex h-full min-h-[420px] w-full items-center justify-center px-3 py-8 md:px-5">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

        <div className="pointer-events-none absolute bottom-8 z-10 flex flex-col items-center gap-2 text-center md:bottom-10">
          <p className="text-[16px] font-medium text-[#8fb1ea] md:text-[17px]">{message}</p>
          <p className="max-w-[560px] text-[13px] text-[#afbfdf] md:text-[14px]">{subMessage}</p>

          {showProgressHint ? (
            <div className="mt-1 flex items-center gap-2.5 rounded-full border border-white/22 bg-white/8 px-3 py-1.5 text-[12px] text-[#9fb7e4] backdrop-blur-sm">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#c8dcff]" />
              <span>{PROGRESS_TEXTS[progressIndex]}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
