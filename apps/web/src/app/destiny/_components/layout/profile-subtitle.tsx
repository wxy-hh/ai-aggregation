'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const SUBTITLE_CLASS =
  'text-sm leading-relaxed text-slate-600 dark:text-slate-300';

/** 顶栏命例摘要：过长时单行截断，点击展开完整信息 */
export function ProfileSubtitle({ text, className }: { text: string; className?: string }) {
  const compact = text.length > 56;

  if (!compact) {
    return <div className={cn(SUBTITLE_CLASS, className)}>{text}</div>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'block w-full min-h-9 text-left',
            SUBTITLE_CLASS,
            'line-clamp-1 rounded-lg px-0.5 -mx-0.5',
            'hover:text-slate-800 dark:hover:text-slate-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
            className
          )}
        >
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(100vw-2rem,22rem)] p-3">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">完整命例</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{text}</p>
      </PopoverContent>
    </Popover>
  );
}
