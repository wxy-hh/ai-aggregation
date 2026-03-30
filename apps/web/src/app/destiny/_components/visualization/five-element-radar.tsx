'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { FiveElementKey } from '../reports/mock';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

type ElementPoint = { key: FiveElementKey; label: string; value: number };

const morandi: Record<FiveElementKey, string> = {
  metal: '#D7B56D', // 琥珀金
  wood: '#8FBFA8', // 嫩绿
  water: '#7A8AA6', // 灰蓝
  fire: '#D68C8C', // 柔赤
  earth: '#B7A88F', // 暖土
};

export function FiveElementRadar({ data }: { data: ElementPoint[] }) {
  const option = useMemo(() => {
    const max = Math.max(40, ...data.map((d) => d.value));
    const indicators = data.map((d) => ({ name: d.label, max }));
    const values = data.map((d) => d.value);

    return {
      animation: true,
      radar: {
        indicator: indicators,
        radius: '62%',
        splitNumber: 4,
        axisName: {
          color: '#334155',
          fontWeight: 800,
          fontSize: 12,
        },
        axisLine: {
          lineStyle: { color: 'rgba(148,163,184,0.35)' },
        },
        splitLine: {
          lineStyle: { color: 'rgba(148,163,184,0.22)' },
        },
        splitArea: {
          areaStyle: {
            color: ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.10)'],
          },
        },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255,255,255,0.65)',
        borderColor: 'rgba(255,255,255,0.35)',
        textStyle: { color: '#0f172a' },
      },
      series: [
        {
          type: 'radar',
          symbol: 'circle',
          symbolSize: 6,
          data: [
            {
              value: values,
              name: '五行能量',
              lineStyle: { width: 3, color: '#2F6BFF' },
              areaStyle: { color: 'rgba(47,107,255,0.18)' },
              itemStyle: { color: '#2F6BFF' },
            },
          ],
        },
      ],
      graphic: data.map((d, idx) => ({
        type: 'circle',
        z: 0,
        shape: { r: 0 },
        style: { fill: morandi[d.key], opacity: 0.0 },
        left: 'center',
        top: 'center',
      })),
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: 240, width: '100%' }} />;
}

