'use client';

import { useShallow } from 'zustand/react/shallow';
import { useDestinyWorkspaceStore, type DestinyProvider } from '@/stores/destiny-workspace-store';
import { cn } from '@/lib/utils';

const PROVIDER_OPTIONS: Array<{ value: DestinyProvider; label: string }> = [
  { value: 'doubao', label: '豆包' },
  { value: 'deepseek', label: 'DeepSeek' },
];

type DestinyModelSwitcherProps = {
  className?: string;
  /**
   * compact：标题行内嵌（移动端），缩小热区但仍 ≥ 44 高；
   * default：独立入口（桌面悬浮）
   */
  size?: 'default' | 'compact';
};

/**
 * 三页（八字 / 紫微 / 奇门）共享的模型切换入口。
 * 读写在 destiny-workspace-store 中持久化的全局 provider（默认 doubao）。
 * 移动端优先：单选项热区 ≥44×44，分段控制器便于单手触达。
 */
export function DestinyModelSwitcher({
  className,
  size = 'default',
}: DestinyModelSwitcherProps) {
  const { provider, setProvider } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      provider: state.provider,
      setProvider: state.setProvider,
    }))
  );

  const compact = size === 'compact';

  return (
    <div
      role="radiogroup"
      aria-label="选择测算模型"
      className={cn(
        'inline-flex items-center rounded-full border border-slate-200/60 bg-white/50 backdrop-blur-xl',
        'dark:border-slate-800/60 dark:bg-slate-900/50',
        compact ? 'p-0.5 text-xs' : 'p-1 text-sm',
        className
      )}
    >
      {PROVIDER_OPTIONS.map((option) => {
        const active = provider === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setProvider(option.value)}
            className={cn(
              'rounded-full font-semibold transition-all',
              compact
                ? 'min-h-11 min-w-[4.5rem] px-2.5'
                : 'min-h-11 min-w-[88px] px-4',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
