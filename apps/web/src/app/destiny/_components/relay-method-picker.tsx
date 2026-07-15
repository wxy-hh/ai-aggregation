'use client';

/**
 * RelayMethodPicker — 命理「待解读引用」术数选择（REQ-011）
 *
 * 三术数平级展示：无推荐、无预选、无自动路由。
 * - ready：可进入对应术数
 * - needs_input：提示缺少必要输入（仍可进入，进入后由表单补齐）
 * - unsupported：不展示
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { RELAY_COPY } from '@/lib/relay/copy';
import {
  getDestinyCapabilities,
  computeDestinyReadiness,
} from '@/lib/relay/destiny-capabilities';
import type { RelayContentType } from '@repo/shared';

export interface RelayMethodPickerProps {
  sourceType: RelayContentType;
  /** 各术数必要输入就绪上下文（由调用方按当前工作区状态给出） */
  readinessCtx: {
    hasBirthProfile?: boolean;
    hasQuestion?: boolean;
    hasCastTime?: boolean;
  };
  onPick: (methodId: 'bazi' | 'ziwei' | 'qimen') => void;
  className?: string;
}

export function RelayMethodPicker({
  sourceType,
  readinessCtx,
  onPick,
  className,
}: RelayMethodPickerProps) {
  const entries = useMemo(() => {
    return getDestinyCapabilities()
      .map((cap) => ({ cap, readiness: computeDestinyReadiness(cap, { sourceType, ...readinessCtx }) }))
      .filter((e) => e.readiness !== 'unsupported');
  }, [sourceType, readinessCtx]);

  if (entries.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="text-xs font-medium text-slate-400 dark:text-slate-500">
        {RELAY_COPY.destiny.pickMethod}
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map(({ cap, readiness }) => (
          <button
            key={cap.id}
            type="button"
            onClick={() => onPick(cap.id as 'bazi' | 'ziwei' | 'qimen')}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors',
              readiness === 'ready'
                ? 'border-[#5D7CFA]/40 bg-[#5D7CFA]/10 text-[#3C58D8] hover:bg-[#5D7CFA]/15 dark:border-[#7D8CFF]/30 dark:bg-[#5D7CFA]/15 dark:text-[#9BADFF]'
                : 'border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800'
            )}
          >
            {cap.label}
            {readiness === 'needs_input' && (
              <span className="text-[10px] font-normal text-amber-600 dark:text-amber-400">
                需补资料
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
