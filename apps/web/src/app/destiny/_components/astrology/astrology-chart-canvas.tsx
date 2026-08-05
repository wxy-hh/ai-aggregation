'use client';

/**
 * 星座寰宇 · 星盘画布（共用渲染器）
 *
 * 精密、克制的本命星盘：细线十二分割、带色行星节点、淡紫/月光青相位线、
 * 低密度星尘。含宫位时渲染十二宫分割，无宫位时渲染平滑星座环。
 * 遵循「减少动态」偏好：reduced-motion 下直接呈现静态最终态。
 */

import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ChartFacts, PlanetPlacement, AspectFact } from './astrology-types';
import { cn } from '@/lib/utils';

const SIGN_GLYPH_COLOR: Record<string, string> = {
  aries: '#f43f5e', taurus: '#10b981', gemini: '#f59e0b', cancer: '#6366f1',
  leo: '#f59e0b', virgo: '#10b981', libra: '#ec4899', scorpio: '#8b5cf6',
  sagittarius: '#f43f5e', capricorn: '#64748b', aquarius: '#06b6d4', pisces: '#8b5cf6',
};

const PLANET_COLOR: Record<string, string> = {
  sun: '#f59e0b', moon: '#a5b4fc', mercury: '#06b6d4', venus: '#ec4899', mars: '#f43f5e',
  jupiter: '#8b5cf6', saturn: '#64748b', uranus: '#22d3ee', neptune: '#818cf8', pluto: '#a78bfa',
};

const ASPECT_COLOR: Record<string, string> = {
  conjunction: '#6366f1', opposition: '#f43f5e', square: '#f59e0b', trine: '#10b981', sextile: '#06b6d4',
};

type AstrologyChartCanvasProps = {
  chartFacts: ChartFacts | null;
  /** 是否含宫位（决定渲染十二宫分割还是无宫位行星环） */
  hasHouses: boolean;
  /** 高亮选中的星体 */
  selectedBody?: string | null;
  onSelectBody?: (body: string) => void;
  /** 绘制进度 0-1（加载页渐进绘制用），1 为完整 */
  progress?: number;
  /** 尺寸（边长，px） */
  size?: number;
  className?: string;
};

/** 极坐标转直角坐标（占星 0° 白羊在左，顺时针）。 */
function polar(cx: number, cy: number, r: number, longitude: number): { x: number; y: number } {
  // 占星盘：上升在左（180° 方向），黄经逆时针增长。这里用标准数学角（0° 在右，逆时针），
  // 将黄经映射为「从左（白羊0°）开始逆时针」。
  const angle = ((180 - longitude) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
}

export function AstrologyChartCanvas({
  chartFacts,
  hasHouses,
  selectedBody = null,
  onSelectBody,
  progress = 1,
  size = 320,
  className,
}: AstrologyChartCanvasProps) {
  const reduceMotion = useReducedMotion();
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 8; // 外圈半径
  const rSign = R * 0.86; // 星座环半径
  const rHouse = R * 0.66; // 宫位环半径
  const rPlanet = R * 0.5; // 行星点半径

  // 低密度星尘（确定性伪随机，避免 Math.random  hydration 抖动）
  const stardust = useMemo(() => {
    const pts: Array<{ x: number; y: number; r: number; o: number }> = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const rr = rand() * R * 0.98;
      pts.push({
        x: cx + rr * Math.cos(a),
        y: cy + rr * Math.sin(a),
        r: 0.4 + rand() * 0.9,
        o: 0.08 + rand() * 0.22,
      });
    }
    return pts;
  }, [cx, cy, R]);

  const planets = chartFacts?.planets ?? [];
  const aspects = chartFacts?.aspects ?? [];
  const houses = hasHouses ? chartFacts?.houses ?? [] : [];

  // 行星位置索引（用于相位连线）
  const planetPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const p of planets) {
      map.set(p.body, polar(cx, cy, rPlanet, p.longitude));
    }
    return map;
  }, [planets, cx, cy, rPlanet]);

  const drawProgress = reduceMotion ? 1 : progress;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="本命星盘"
      className={cn('select-none', className)}
    >
      <defs>
        <radialGradient id="astroGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.12" />
          <stop offset="70%" stopColor="#8b5cf6" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 背景微光 */}
      <circle cx={cx} cy={cy} r={R} fill="url(#astroGlow)" />

      {/* 星尘 */}
      <g aria-hidden>
        {stardust.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#818cf8" opacity={p.o * drawProgress} />
        ))}
      </g>

      {/* 外圈 */}
      <motion.circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke="#6366f1"
        strokeOpacity="0.5"
        strokeWidth="1"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: drawProgress }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      />
      {/* 星座环 */}
      <motion.circle
        cx={cx}
        cy={cy}
        r={rSign}
        fill="none"
        stroke="#8b5cf6"
        strokeOpacity="0.28"
        strokeWidth="1"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: drawProgress }}
        transition={{ duration: 0.6, delay: 0.1 }}
      />

      {/* 十二分割（仅含宫位） */}
      {hasHouses &&
        houses.map((h, i) => {
          const p1 = polar(cx, cy, rHouse, h.cuspLongitude);
          const p2 = polar(cx, cy, rSign, h.cuspLongitude);
          return (
            <motion.line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#6366f1"
              strokeOpacity="0.4"
              strokeWidth="1"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: drawProgress }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.03 }}
            />
          );
        })}

      {/* 相位连线 */}
      <g>
        {aspects.map((a, i) => {
          const p1 = planetPos.get(a.planetA);
          const p2 = planetPos.get(a.planetB);
          if (!p1 || !p2) return null;
          const isActive =
            selectedBody && (a.planetA === selectedBody || a.planetB === selectedBody);
          return (
            <motion.line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={ASPECT_COLOR[a.type] ?? '#8b5cf6'}
              strokeWidth={isActive ? 1.6 : 1}
              strokeOpacity={selectedBody ? (isActive ? 0.8 : 0.12) : 0.32}
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: drawProgress }}
              transition={{ duration: 0.35, delay: 0.4 + i * 0.04 }}
            />
          );
        })}
      </g>

      {/* 行星节点 */}
      {planets.map((p, i) => {
        const pos = planetPos.get(p.body);
        if (!pos) return null;
        const dim = selectedBody && selectedBody !== p.body;
        const isSelected = selectedBody === p.body;
        return (
          <motion.g
            key={p.body}
            initial={reduceMotion ? false : { opacity: 0, scale: 0 }}
            animate={{ opacity: dim ? 0.55 : 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
            style={{ cursor: onSelectBody ? 'pointer' : 'default' }}
            onClick={() => onSelectBody?.(p.body)}
          >
            {/* 选中同心光圈 */}
            {isSelected && (
              <motion.circle
                cx={pos.x}
                cy={pos.y}
                r={10}
                fill="none"
                stroke={PLANET_COLOR[p.body] ?? '#6366f1'}
                strokeOpacity="0.6"
                initial={reduceMotion ? false : { r: 6, opacity: 0.9 }}
                animate={{ r: 16, opacity: 0 }}
                transition={{ duration: 0.6 }}
              />
            )}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isSelected ? 5.5 : 4.5}
              fill={PLANET_COLOR[p.body] ?? '#6366f1'}
              stroke="#fff"
              strokeWidth="1.2"
              opacity={dim ? 0.55 : 1}
            />
            <text
              x={pos.x}
              y={pos.y - 9}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              className="fill-slate-600 dark:fill-slate-300"
              opacity={dim ? 0.5 : 0.9}
            >
              {p.label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
