'use client';

/**
 * 模型概览轨道 — 展示某一轮所有已选模型的状态卡
 *
 * 桌面横向排列；移动端横向滚动、焦点模型优先可见。
 * 依据 focusSlots 标记聚焦卡（左/右列），未聚焦卡提供替换操作。
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { ComparisonTurn } from '@/types/comparison';
import { ModelStatusCard } from './model-status-card';

interface ModelOverviewRailProps {
  turn: ComparisonTurn;
  onReplace: (slot: 'left' | 'right', modelKey: string) => void;
}

export const ModelOverviewRail = memo(function ModelOverviewRail({
  turn,
  onReplace,
}: ModelOverviewRailProps) {
  const runs = Object.values(turn.runs);
  const { left, right } = turn.focusSlots;

  return (
    <div
      className={cn(
        'flex gap-3 overflow-x-auto pt-3 pb-1 custom-scrollbar',
        'snap-x snap-mandatory'
      )}
      role="list"
      aria-label="模型概览轨道"
    >
      {runs.map((run) => {
        const isFocused = run.modelKey === left || run.modelKey === right;
        const focusedSlot = run.modelKey === left ? 'left' : run.modelKey === right ? 'right' : undefined;
        return (
          <div key={run.modelKey} role="listitem" className="snap-start">
            <ModelStatusCard
              run={run}
              isFocused={isFocused}
              focusedSlot={focusedSlot}
              onReplace={isFocused ? undefined : onReplace}
            />
          </div>
        );
      })}
    </div>
  );
});
