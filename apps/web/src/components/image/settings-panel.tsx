'use client';

import { cn } from '@/lib/utils';
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
        <div className="grid grid-cols-4 gap-2">
          {AGNES_SIZE_OPTIONS.slice(0, 4).map((item) => (
            <Button
              key={item.id}
              onClick={() => onRatioChange(item.id)}
              variant={ratio === item.id ? 'default' : 'outline'}
              className={cn(
                'h-9 text-xs font-bold rounded-xl transition-all',
                ratio === item.id
                  ? 'bg-blue-500 text-white shadow-md border-blue-500'
                  : 'bg-white/50 dark:bg-slate-800/50 hover:bg-white hover:border-blue-300'
              )}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Quality 选择 */}
      <div className="space-y-3">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">画质</span>
        <div className="grid grid-cols-2 gap-2">
          {AGNES_QUALITIES.map((q) => (
            <Button
              key={q.id}
              onClick={() => onQualityChange?.(q.id)}
              variant={quality === q.id ? 'default' : 'outline'}
              className={cn(
                'h-9 text-xs font-bold rounded-xl transition-all',
                quality === q.id
                  ? 'bg-indigo-500 text-white shadow-md border-indigo-500'
                  : 'bg-white/50 dark:bg-slate-800/50 hover:bg-white hover:border-indigo-300'
              )}
            >
              {q.label}
            </Button>
          ))}
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
            className="w-full h-9 pl-3 pr-8 py-2 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm backdrop-saturate-150 border-slate-200 dark:border-slate-700 text-xs font-mono focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 transition-all group-hover:bg-white/80 dark:group-hover:bg-slate-800/80"
          />
          <button
            onClick={() => onSeedChange(String(Math.floor(Math.random() * 1000000000)))}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-500 transition-colors cursor-pointer bg-transparent hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md"
            title="生成随机种子"
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
