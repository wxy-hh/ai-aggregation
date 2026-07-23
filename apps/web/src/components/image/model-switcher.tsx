'use client';

import { cn } from '@/lib/utils';
import { IMAGE_MODELS, ImageModel } from '@/lib/constants/image-generation';
import { Sparkles, Zap } from 'lucide-react';

export interface ModelSwitcherProps {
  model: ImageModel;
  onModelChange: (model: ImageModel) => void;
}

const modelIcons: Record<ImageModel, React.ReactNode> = {
  kolors: <Sparkles className="w-3.5 h-3.5" />,
  agnes: <Zap className="w-3.5 h-3.5" />,
};

export function ModelSwitcher({ model, onModelChange }: ModelSwitcherProps) {
  return (
    <div className="flex items-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm p-0.5 border border-slate-200/50 dark:border-slate-700/50">
      {IMAGE_MODELS.map((m) => (
        <button
          key={m.id}
          onClick={() => onModelChange(m.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all duration-300',
            model === m.id
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          {modelIcons[m.id]}
          {m.label}
        </button>
      ))}
    </div>
  );
}
