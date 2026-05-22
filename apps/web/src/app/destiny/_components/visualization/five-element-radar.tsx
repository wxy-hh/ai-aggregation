'use client';

import React from 'react';
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { DestinyLifeDimension, LifeDimensionKey } from '../types';

const dimensionOrder: LifeDimensionKey[] = ['career', 'wealth', 'health', 'love', 'wisdom'];
const startAngle = -90;
const angleStep = 72;
const viewBoxSize = 260;
const center = viewBoxSize / 2;
const maxRadius = 88;
const labelRadius = 112;
/** 雷达图最小可视半径比例，避免数值整体偏低时缩成一团 */
const MIN_RADIUS_RATIO = 0.28;
const MAX_RADIUS_RATIO = 0.92;
const gridLevels = [0.33, 0.66, 1] as const;

type RadarVertex = {
  key: LifeDimensionKey;
  label: string;
  value: number;
  displayRatio: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
};

/**
 * 将原始分值映射为雷达图半径比例。
 * 五维雷达重在「相对强弱」，当绝对值整体偏低时做 min-max 拉伸，避免图形缩在中心。
 */
export function scaleValuesForRadarDisplay(values: number[]): number[] {
  const clamped = values.map((value) => Math.max(0, Math.min(100, value)));

  if (clamped.every((value) => value <= 0)) {
    return clamped.map(() => MIN_RADIUS_RATIO);
  }

  const max = Math.max(...clamped);
  const min = Math.min(...clamped);
  const span = max - min;

  // 绝对值已足够大时：保留真实比例，但为每项设下限，避免某一维过低时看不见
  if (max >= 45) {
    return clamped.map((value) =>
      Math.max(MIN_RADIUS_RATIO, Math.min(MAX_RADIUS_RATIO, value / 100))
    );
  }

  // 整体偏低：按数据集内相对位置拉伸到可视区间
  if (span < 1) {
    const mid = (MIN_RADIUS_RATIO + MAX_RADIUS_RATIO) / 2;
    return clamped.map(() => mid);
  }

  return clamped.map((value) => {
    const t = (value - min) / span;
    return MIN_RADIUS_RATIO + t * (MAX_RADIUS_RATIO - MIN_RADIUS_RATIO);
  });
}

export function FiveElementRadar({
  data,
  className,
  showScores = false,
}: {
  data: DestinyLifeDimension[];
  className?: string;
  /** 是否在顶点旁展示能量指数 */
  showScores?: boolean;
}) {
  const vertices = useMemo(() => {
    const source = new Map(data.map((item) => [item.key, item]));
    if (dimensionOrder.some((key) => !source.has(key))) return [];

    const displayRatios = scaleValuesForRadarDisplay(
      dimensionOrder.map((key) => source.get(key)!.value)
    );

    return dimensionOrder.map((key, index) => {
      const item = source.get(key)!;
      const angle = ((startAngle + index * angleStep) * Math.PI) / 180;
      const ratio = displayRatios[index] ?? MIN_RADIUS_RATIO;
      const x = center + Math.cos(angle) * maxRadius * ratio;
      const y = center + Math.sin(angle) * maxRadius * ratio;
      const labelX = center + Math.cos(angle) * labelRadius;
      const labelY = center + Math.sin(angle) * labelRadius;

      return {
        key,
        label: item.label,
        value: item.value,
        displayRatio: ratio,
        x,
        y,
        labelX,
        labelY,
      };
    });
  }, [data]);

  if (vertices.length !== 5) return null;

  const dataPolygon = vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' ');

  return (
    <div className={cn('relative mx-auto h-[288px] w-full max-w-[320px]', className)}>
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="absolute inset-0 h-full w-full"
        aria-label="人生五维摘要雷达图"
        role="img"
      >
        {gridLevels.map((level) => (
          <polygon
            key={level}
            points={buildPolygonPoints(maxRadius * level)}
            fill="none"
            stroke="rgba(226,232,240,0.95)"
            strokeWidth={level === 1 ? 1.5 : 1}
          />
        ))}
        {dimensionOrder.map((_, index) => {
          const angle = ((startAngle + index * angleStep) * Math.PI) / 180;
          const x2 = center + Math.cos(angle) * maxRadius;
          const y2 = center + Math.sin(angle) * maxRadius;
          return (
            <line
              key={`axis-${index}`}
              x1={center}
              y1={center}
              x2={x2}
              y2={y2}
              stroke="rgba(226,232,240,0.85)"
              strokeWidth="1"
            />
          );
        })}
        <polygon
          points={dataPolygon}
          fill="rgba(93,124,250,0.18)"
          stroke="#5D7CFA"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {vertices.map((vertex) => (
          <circle
            key={`dot-${vertex.key}`}
            cx={vertex.x}
            cy={vertex.y}
            r="4"
            fill="#5D7CFA"
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {vertices.map((vertex) => (
        <span
          key={vertex.key}
          className={cn(
            'absolute flex flex-col items-center gap-0.5 text-center',
            labelTransformClass(vertex.key)
          )}
          style={labelPositionStyle(vertex.labelX, vertex.labelY)}
          title={`${vertex.label}能量指数 ${vertex.value}（相对活跃度，非好坏评判）`}
        >
          <span className="text-[11px] font-bold text-slate-500 sm:text-xs">{vertex.label}</span>
          {showScores ? (
            <span className="rounded-full bg-[#F3F6FF] px-1.5 py-0.5 text-[10px] font-bold text-[#3C58D8] dark:bg-[#1E2A55] dark:text-[#9BADFF]">
              {vertex.value}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function buildPolygonPoints(radius: number) {
  return dimensionOrder
    .map((_, index) => {
      const angle = ((startAngle + index * angleStep) * Math.PI) / 180;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;
      return `${x},${y}`;
    })
    .join(' ');
}

function labelPositionStyle(x: number, y: number): CSSProperties {
  return {
    left: `${(x / viewBoxSize) * 100}%`,
    top: `${(y / viewBoxSize) * 100}%`,
  };
}

function labelTransformClass(key: LifeDimensionKey) {
  switch (key) {
    case 'career':
      return '-translate-x-1/2 -translate-y-full';
    case 'wealth':
      return 'translate-x-1 -translate-y-1/2';
    case 'health':
      return 'translate-x-1';
    case 'love':
      return '-translate-x-full';
    case 'wisdom':
      return '-translate-x-full -translate-y-1/2';
  }
}
