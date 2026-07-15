'use client';

/**
 * RelayAction — 统一「接力」动作按钮（REQ-002）
 *
 * 显式入口（非右键/长按唯一入口）：中文「接力」文字 + 图标，44×44 热区。
 * 禁用态给出中文原因（生成中/空/无可用目标）。
 */

import { forwardRef } from 'react';
import { Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RELAY_COPY } from '@/lib/relay/copy';

export interface RelayActionProps {
  /** 是否禁用 */
  disabled?: boolean;
  /** 禁用原因（生成中/空/无可用目标；用于 title 与无障碍） */
  disabledReason?: string;
  /** 仅图标（true）或图标+文字（false，默认） */
  iconOnly?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export const RelayAction = forwardRef<HTMLButtonElement, RelayActionProps>(
  function RelayAction({ disabled, disabledReason, iconOnly, onClick, className }, ref) {
    const label = RELAY_COPY.action;
    const reason = disabled ? disabledReason : undefined;
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={onClick}
        title={reason ?? label}
        aria-label={reason ? `${label}（${reason}）` : label}
        aria-disabled={disabled}
        className={cn(
          'inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-xs',
          'text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700',
          'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
          className,
        )}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {!iconOnly && <span>{label}</span>}
      </button>
    );
  },
);
