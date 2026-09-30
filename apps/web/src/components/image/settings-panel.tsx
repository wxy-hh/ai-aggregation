'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AGNES_SIZE_OPTIONS, AGNES_QUALITIES } from '@/lib/constants/image-generation';
import { Settings2, Dice5, Sparkles } from 'lucide-react';

export interface SettingsPanelProps {
  ratio: string;
  seed: string;
  quality?: string;
  onRatioChange: (ratio: string) => void;
  onSeedChange: (seed: string) => void;
  onQualityChange?: (quality: string) => void;
}

export function SettingsPanel({
  ratio,
  seed,
  quality = 'standard',
  onRatioChange,
  onSeedChange,
  onQualityChange,
}: SettingsPanelProps) {
  return (
    <div className="space-y-6">
      {/* 参数设置头部 */}
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-5 h-5 text-indigo-500" />
        <h3 className="font-bold text-slate-800 dark:text-white">参数配置</h3>
      </div>

      {/* 尺寸 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">画面尺寸</span>
          <span className="text-slate-900 dark:text-white font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            {AGNES_SIZE_OPTIONS.find((r) => r.id === ratio)?.label || ratio}
          </span>
        </div>
        <div className="relative grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
          {AGNES_SIZE_OPTIONS.slice(0, 4).map((item) => {
            const isActive = ratio === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onRatioChange(item.id)}
                className={cn(
                  'relative z-10 h-8 text-xs font-bold rounded-lg select-none transition-colors duration-fast ease-out-expo active:scale-[0.96] flex items-center justify-center',
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-extrabold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeImageRatioIndicator"
                    className="absolute inset-0 -z-10 rounded-lg bg-white shadow-sm dark:bg-slate-700"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 画质选择 */}
      <div className="space-y-3">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">画质</span>
        <div className="relative grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
          {AGNES_QUALITIES.map((q) => {
            const isActive = quality === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onQualityChange?.(q.id)}
                className={cn(
                  'relative z-10 h-8 text-xs font-bold rounded-lg select-none transition-colors duration-fast ease-out-expo active:scale-[0.96] flex items-center justify-center',
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeImageQualityIndicator"
                    className="absolute inset-0 -z-10 rounded-lg bg-white shadow-sm dark:bg-slate-700"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                {q.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 种子输入 */}
      <div className="space-y-3">
        <label className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center justify-between">
          <span>随机种子 (Seed)</span>
        </label>
        <div className="relative group">
          <Input
            type="text"
            value={seed}
            onChange={(e) => onSeedChange(e.target.value)}
            placeholder="留空为随机 (-1)"
            className="w-full h-9 pl-3 pr-8 py-2 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm backdrop-saturate-150 border-slate-200 dark:border-slate-700 text-xs font-mono focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 transition-[border-color,background-color] duration-fast ease-out-expo group-hover:bg-white/80 dark:group-hover:bg-slate-800/80"
          />
          <button
            type="button"
            onClick={() => onSeedChange(String(Math.floor(Math.random() * 1000000000)))}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-500 hover:rotate-45 active:scale-90 select-none transition-[color,background-color,transform] duration-fast ease-out-expo cursor-pointer bg-transparent hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md"
            title="生成随机种子"
            aria-label="生成随机种子"
          >
            <Dice5 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 模型说明 */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/40">
        <Sparkles className="w-3.5 h-3.5 mt-0.5 text-indigo-400 shrink-0" />
        <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
          当前使用 Agnes Image 2.1 Flash 模型，生成速度快、质量稳定。
        </p>
      </div>
    </div>
  );
}
