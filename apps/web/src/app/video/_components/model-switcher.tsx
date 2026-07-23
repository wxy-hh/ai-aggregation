'use client';

import { cn } from '@/lib/utils';
import { VideoModel, VIDEO_MODELS, videoModelIcons } from '@/lib/constants/video-generation';

export interface VideoModelSwitcherProps {
  model: VideoModel;
  onModelChange: (model: VideoModel) => void;
  disabled?: boolean;
}

export function VideoModelSwitcher({ model, onModelChange, disabled = false }: VideoModelSwitcherProps) {
  return (
    <div className="flex items-center rounded-xl bg-slate-100/80 p-0.5 backdrop-blur-sm dark:bg-slate-800/80">
      {VIDEO_MODELS.map((m) => {
        const active = model === m.id;
        const Icon = videoModelIcons[m.icon];
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => !disabled && onModelChange(m.id)}
            disabled={disabled}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 py-2 text-xs font-bold transition-all duration-300 sm:px-3',
              active
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5 dark:bg-slate-700 dark:text-white dark:ring-white/10'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{m.name}</span>
            <span className="sm:hidden">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
