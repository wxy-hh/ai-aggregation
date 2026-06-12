'use client';

import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ASPECT_RATIOS, PARAM_CONSTRAINTS, AGNES_SIZE_OPTIONS, AGNES_QUALITIES, ImageModel } from '@/lib/constants/image-generation';
import { Settings2, Dice5 } from 'lucide-react';

export interface SettingsPanelProps {
  model?: ImageModel;
  ratio: string;
  steps: number;
  cfg: number;
  seed: string;
  batchSize: number;
  quality?: string;
  onRatioChange: (ratio: string) => void;
  onStepsChange: (steps: number) => void;
  onCfgChange: (cfg: number) => void;
  onSeedChange: (seed: string) => void;
  onBatchSizeChange: (size: number) => void;
  onQualityChange?: (quality: string) => void;
}

export function SettingsPanel({
  model = 'kolors',
  ratio,
  steps,
  cfg,
  seed,
  batchSize,
  quality = 'standard',
  onRatioChange,
  onStepsChange,
  onCfgChange,
  onSeedChange,
  onBatchSizeChange,
  onQualityChange,
}: SettingsPanelProps) {
  // 根据模型选择尺寸列表
  const ratioOptions = model === 'agnes' ? AGNES_SIZE_OPTIONS : ASPECT_RATIOS;

  return (
    <div className="space-y-6">
      {/* 参数设置头部 */}
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-5 h-5 text-indigo-500" />
        <h3 className="font-bold text-slate-800 dark:text-white">参数配置</h3>
      </div>

      {/* 宽高比 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">画面比例</span>
          <span className="text-slate-900 dark:text-white font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            {ratioOptions.find((r) => r.id === ratio)?.label || ratio}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ratioOptions.slice(0, 4).map((item) => (
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
        {ratioOptions.length > 4 && (
          <div className="grid grid-cols-4 gap-2">
            {ratioOptions.slice(4).map((item) => (
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
        )}
      </div>

      {/* 仅 Kolors: Steps */}
      {model === 'kolors' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">生成质量 (Steps)</span>
            <span className="text-blue-600 dark:text-blue-400 font-mono font-bold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-[10px]">
              {steps}
            </span>
          </div>
          <div className="px-1">
            <Slider
              value={[steps]}
              max={PARAM_CONSTRAINTS.steps.max}
              min={PARAM_CONSTRAINTS.steps.min}
              step={PARAM_CONSTRAINTS.steps.step}
              onValueChange={(vals) => onStepsChange(vals[0])}
              className="py-2"
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 px-1 font-mono">
            <span>Speed ({PARAM_CONSTRAINTS.steps.min})</span>
            <span>Quality ({PARAM_CONSTRAINTS.steps.max})</span>
          </div>
        </div>
      )}

      {/* 仅 Agnes: Quality 选择 */}
      {model === 'agnes' && (
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
      )}

      {/* 批量生成 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">生成数量</span>
        </div>
        <div className="grid grid-cols-4 gap-2 bg-slate-100/50 dark:bg-slate-900/50 p-1 rounded-xl backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
          {[1, 2, 3, 4].map((size) => (
            <Button
              key={size}
              onClick={() => onBatchSizeChange(size)}
              variant={batchSize === size ? 'default' : 'ghost'}
              className={cn(
                'text-xs h-7 font-bold transition-all duration-300 rounded-lg',
                batchSize === size
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5 dark:ring-white/5'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
              )}
            >
              {size}
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
            className="w-full h-9 pl-3 pr-8 py-2 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border-slate-200 dark:border-slate-700 text-xs font-mono focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 transition-all group-hover:bg-white/80 dark:group-hover:bg-slate-800/80"
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
    </div>
  );
}
