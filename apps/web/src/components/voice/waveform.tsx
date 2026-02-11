'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function WaveformVisualizer({ level }: { level?: number }) {
  const [bars, setBars] = useState<number[]>([]);

  useEffect(() => {
    // 生成初始静态条柱
    const initialBars = Array.from({ length: 40 }, () => Math.random() * 0.5 + 0.2);
    setBars(initialBars);

    // 模拟动画循环
    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map(() => {
          const base = Math.max(0.2, Math.min(1.0, Math.random() * 0.8 + 0.1));
          const l = typeof level === 'number' ? Math.max(0, Math.min(1, level)) : null;
          if (l === null) return base;
          return Math.max(0.15, Math.min(1.0, base * (0.55 + l * 1.25)));
        })
      );
    }, 100);

    return () => clearInterval(interval);
  }, [level]);

  return (
    <div className="w-full h-32 flex items-center justify-center gap-1">
      {bars.map((height, i) => (
        <div
          key={i}
          className={cn(
            'w-1.5 rounded-full transition-all duration-100 ease-in-out',
            i % 2 === 0 ? 'bg-blue-500' : 'bg-indigo-400 dark:bg-indigo-500'
          )}
          style={{
            height: `${height * 100}%`,
            opacity: Math.max(0.5, height),
          }}
        />
      ))}
    </div>
  );
}
