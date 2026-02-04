'use client';

import { cn } from '@/lib/utils';
import { Box, Camera, Sparkles, Mountain, Zap, Palette } from 'lucide-react';

const styles = [
  {
    id: '3d-render',
    name: '3D 渲染',
    icon: <Box className="w-5 h-5" />,
    color: 'text-blue-500',
    gradient: 'from-blue-50/50 to-blue-100/50 dark:from-blue-900/10 dark:to-blue-900/30',
    activeGradient: 'from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/60',
    borderColor: 'border-blue-200 dark:border-blue-800',
    shadowColor: 'shadow-blue-500/10',
  },
  {
    id: 'realistic',
    name: '超写实',
    icon: <Camera className="w-5 h-5" />,
    color: 'text-emerald-500',
    gradient:
      'from-emerald-50/50 to-emerald-100/50 dark:from-emerald-900/10 dark:to-emerald-900/30',
    activeGradient:
      'from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/60',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    shadowColor: 'shadow-emerald-500/10',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    icon: <Zap className="w-5 h-5" />,
    color: 'text-purple-500',
    gradient: 'from-purple-50/50 to-purple-100/50 dark:from-purple-900/10 dark:to-purple-900/30',
    activeGradient: 'from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/60',
    borderColor: 'border-purple-200 dark:border-purple-800',
    shadowColor: 'shadow-purple-500/10',
  },
  {
    id: 'oil-painting',
    name: '油画',
    icon: <Palette className="w-5 h-5" />,
    color: 'text-orange-500',
    gradient: 'from-orange-50/50 to-orange-100/50 dark:from-orange-900/10 dark:to-orange-900/30',
    activeGradient: 'from-orange-100 to-orange-200 dark:from-orange-900/40 dark:to-orange-800/60',
    borderColor: 'border-orange-200 dark:border-orange-800',
    shadowColor: 'shadow-orange-500/10',
  },
  {
    id: 'anime',
    name: '动漫',
    icon: <Sparkles className="w-5 h-5" />,
    color: 'text-pink-500',
    gradient: 'from-pink-50/50 to-pink-100/50 dark:from-pink-900/10 dark:to-pink-900/30',
    activeGradient: 'from-pink-100 to-pink-200 dark:from-pink-900/40 dark:to-pink-800/60',
    borderColor: 'border-pink-200 dark:border-pink-800',
    shadowColor: 'shadow-pink-500/10',
  },
  {
    id: 'landscape',
    name: '风景',
    icon: <Mountain className="w-5 h-5" />,
    color: 'text-cyan-500',
    gradient: 'from-cyan-50/50 to-cyan-100/50 dark:from-cyan-900/10 dark:to-cyan-900/30',
    activeGradient: 'from-cyan-100 to-cyan-200 dark:from-cyan-900/40 dark:to-cyan-800/60',
    borderColor: 'border-cyan-200 dark:border-cyan-800',
    shadowColor: 'shadow-cyan-500/10',
  },
];

export interface StyleSelectorProps {
  selected: string;
  onStyleChange: (style: string) => void;
}

export function StyleSelector({ selected, onStyleChange }: StyleSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
          风格预设
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {styles.map((style) => (
          <button
            key={style.id}
            onClick={() => onStyleChange(style.id)}
            className={cn(
              'relative p-2.5 rounded-xl transition-all duration-300 cursor-pointer group flex flex-col items-center gap-2',
              'border backdrop-blur-sm bg-gradient-to-br',
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
