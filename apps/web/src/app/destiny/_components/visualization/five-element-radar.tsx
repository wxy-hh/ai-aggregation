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
const outerRadius = 82;
const innerRadius = 58;
const labelRadius = 112;

type RadarVertex = {
  key: LifeDimensionKey;
  label: string;
  value: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
};

export function FiveElementRadar({
  data,
  className,
}: {
  data: DestinyLifeDimension[];
  className?: string;
}) {
  const vertices = useMemo(() => {
    const source = new Map(data.map((item) => [item.key, item]));
    if (dimensionOrder.some((key) => !source.has(key))) return [];

    return dimensionOrder.map((key, index) => {
      const item = source.get(key)!;
      const angle = ((startAngle + index * angleStep) * Math.PI) / 180;
      const normalized = Math.max(0, Math.min(100, item.value)) / 100;
      const x = center + Math.cos(angle) * outerRadius * normalized;
      const y = center + Math.sin(angle) * outerRadius * normalized;
      const labelX = center + Math.cos(angle) * labelRadius;
      const labelY = center + Math.sin(angle) * labelRadius;

      return {
        key,
        label: item.label,
        value: item.value,
        x,
        y,
        labelX,
        labelY,
      };
    });
  }, [data]);

  if (vertices.length !== 5) return null;

  const outerPolygon = buildPolygonPoints(outerRadius);
  const innerPolygon = buildPolygonPoints(innerRadius);
  const dataPolygon = vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' ');

  return (
    <div className={cn('relative mx-auto h-[288px] w-full max-w-[320px]', className)}>
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="absolute inset-0 h-full w-full"
        aria-label="人生五维摘要雷达图"
      >
        <polygon
          points={outerPolygon}
          fill="none"
          stroke="rgba(226,232,240,0.9)"
          strokeWidth="1.5"
        />
        <polygon
          points={innerPolygon}
          fill="none"
          stroke="rgba(226,232,240,0.9)"
          strokeWidth="1.5"
        />
        <polygon
          points={dataPolygon}
          fill="rgba(63,93,255,0.14)"
          stroke="#3F5DFF"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>

      {vertices.map((vertex) => (
        <span
          key={vertex.key}
          className={cn(
            'absolute text-[11px] font-extrabold text-slate-500 sm:text-xs',
            labelTransformClass(vertex.key)
          )}
          style={labelPositionStyle(vertex.labelX, vertex.labelY)}
        >
          {vertex.label}
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
