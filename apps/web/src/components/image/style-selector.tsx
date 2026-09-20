'use client';

import { cn } from '@/lib/utils';
import { Camera, Sparkles, Film } from 'lucide-react';
import { AGNES_STYLES } from '@/lib/constants/image-generation';

const STYLE_THEMES: Record<string, {
  icon: React.ReactNode;
  color: string;
  gradient: string;
  activeGradient: string;
  borderColor: string;
  shadowColor: string;
}> = {
  photographic: {
    icon: <Camera className="w-5 h-5" />,
    color: 'text-emerald-500',
    gradient:
      'from-emerald-50/50 to-emerald-100/50 dark:from-emerald-900/10 dark:to-emerald-900/30',
    activeGradient:
      'from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/60',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    shadowColor: 'shadow-emerald-500/10',
  },
  anime: {
    icon: <Sparkles className="w-5 h-5" />,
    color: 'text-pink-500',
    gradient: 'from-pink-50/50 to-pink-100/50 dark:from-pink-900/10 dark:to-pink-900/30',
    activeGradient: 'from-pink-100 to-pink-200 dark:from-pink-900/40 dark:to-pink-800/60',
    borderColor: 'border-pink-200 dark:border-pink-800',
    shadowColor: 'shadow-pink-500/10',
  },
  cinematic: {
    icon: <Film className="w-5 h-5" />,
    color: 'text-indigo-500',
    gradient: 'from-indigo-50/50 to-indigo-100/50 dark:from-indigo-900/10 dark:to-indigo-900/30',
    activeGradient: 'from-indigo-100 to-indigo-200 dark:from-indigo-900/40 dark:to-indigo-800/60',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
    shadowColor: 'shadow-indigo-500/10',
  },
};

export interface StyleSelectorProps {
  selected: string;
  onStyleChange: (style: string) => void;
}

export function StyleSelector({ selected, onStyleChange }: StyleSelectorProps) {
  const styleList = AGNES_STYLES.map((s) => ({
    id: s.id,
    name: s.name,
    ...(STYLE_THEMES[s.id] ?? STYLE_THEMES.photographic),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
          风格预设
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {styleList.map((style) => (
          <button
            key={style.id}
            onClick={() => onStyleChange(style.id)}
            className={cn(
              'relative p-2.5 rounded-xl transition-all duration-300 cursor-pointer group flex flex-col items-center gap-2',
              'border backdrop-blur-sm backdrop-saturate-150 bg-gradient-to-br',
              selected === style.id
                ? `${style.activeGradient} ${style.borderColor} shadow-lg ${style.shadowColor} scale-[1.02] ring-1 ring-inset ring-white/20`
                : `${style.gradient} border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5`
            )}
          >
            {/* 图标容器 */}
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-sm',
                'bg-white dark:bg-slate-800',
                selected === style.id
                  ? 'scale-110 shadow-md ring-2 ring-white/50'
                  : 'group-hover:scale-110'
              )}
            >
              <div className={cn('transition-colors duration-300', style.color)}>{style.icon}</div>
            </div>

            {/* 文字标签 */}
            <span
              className={cn(
                'text-[10px] font-bold transition-colors',
                selected === style.id
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              {style.name}
            </span>

            {/* 选中指示光点 */}
            {selected === style.id && (
              <div
                className={cn(
                  'absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full shadow-sm animate-pulse',
                  style.color.replace('text-', 'bg-')
                )}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
