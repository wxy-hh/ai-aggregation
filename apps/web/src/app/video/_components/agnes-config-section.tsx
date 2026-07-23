'use client';

import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { readFilesAsDataUrls } from '@/lib/utils/image-url';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  AgnesConfig,
  AgnesMode,
  AGNES_MODES,
  AGNES_SIZE_PRESETS,
  AGNES_DURATION_PRESETS,
} from '@/lib/constants/video-generation';
import { Image as ImageIcon, Upload, X, Dice5 } from 'lucide-react';

interface AgnesConfigSectionProps {
  config: AgnesConfig;
  setConfig: (config: AgnesConfig) => void;
  disabled?: boolean;
}

export function AgnesConfigSection({ config, setConfig, disabled = false }: AgnesConfigSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsReferenceImage = config.mode === 'image2video' || config.mode === 'multi-image' || config.mode === 'keyframes';
  const supportsMultipleImages = config.mode === 'multi-image' || config.mode === 'keyframes';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const urls = await readFilesAsDataUrls(files, 8 - config.referenceImages.length);
    setConfig({ ...config, referenceImages: [...config.referenceImages, ...urls] });
  };

  const removeImage = (index: number) => {
    const next = [...config.referenceImages];
    next.splice(index, 1);
    setConfig({ ...config, referenceImages: next });
  };

  const setMode = (mode: AgnesMode) => {
    setConfig({ ...config, mode, referenceImages: [] });
  };

  const setSize = (id: string) => {
    const preset = AGNES_SIZE_PRESETS.find((p) => p.id === id);
    if (preset) {
      setConfig({ ...config, width: preset.width, height: preset.height });
    }
  };

  const setDuration = (id: AgnesConfig['durationPreset']) => {
    setConfig({ ...config, durationPreset: id });
  };

  const currentSizeId = AGNES_SIZE_PRESETS.find(
    (p) => p.width === config.width && p.height === config.height
  )?.id || AGNES_SIZE_PRESETS[0].id;

  return (
    <div className="space-y-7">
      {/* 模式选择 */}
      <section className="space-y-3">
        <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          生成模式
        </label>
        <div className="grid grid-cols-2 gap-2">
          {AGNES_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              disabled={disabled}
              className={cn(
                'rounded-xl border-2 px-2 py-2.5 text-xs font-bold transition-all',
                config.mode === m.id
                  ? 'border-blue-500/60 bg-white/70 text-blue-600 shadow-sm backdrop-blur-md dark:bg-blue-500/15 dark:text-blue-400'
                  : 'border-white/50 bg-white/40 text-slate-500 hover:border-blue-200/60 hover:text-slate-700 dark:border-white/10 dark:bg-slate-900/30 dark:text-slate-400 dark:hover:text-slate-300',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      {/* 参考图 */}
      <AnimatePresence>
        {needsReferenceImage && (
          <motion.section
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                <ImageIcon className="h-4 w-4" />
                {config.mode === 'image2video' ? '参考图' : '参考图片'}
              </label>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-indigo-500/70 dark:bg-indigo-900/20">
                {config.mode === 'image2video' ? '图生视频' : config.mode === 'multi-image' ? '多图视频' : '关键帧'}
              </span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              multiple={supportsMultipleImages}
              className="hidden"
              disabled={disabled}
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {config.referenceImages.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="relative aspect-square overflow-hidden rounded-2xl border border-blue-400/50 bg-white/40 dark:border-blue-500/30 dark:bg-slate-900/30"
                >
                  <img src={url} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeImage(index)}
                    disabled={disabled}
                    className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {(!supportsMultipleImages || config.referenceImages.length < 8) && (
                <button
                  type="button"
                  onClick={() => !disabled && fileInputRef.current?.click()}
                  disabled={disabled}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-all',
                    'border-white/60 bg-white/40 text-slate-400 hover:border-blue-400/60 dark:border-white/10 dark:bg-slate-900/30 dark:hover:border-blue-500/40',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{config.referenceImages.length > 0 ? '继续添加' : '点击上传'}</span>
                </button>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* 尺寸预设 */}
      <section className="space-y-3">
        <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          画面尺寸
        </label>
        <div className="grid grid-cols-3 gap-2">
          {AGNES_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSize(preset.id)}
              disabled={disabled}
              className={cn(
                'rounded-xl border-2 px-1 py-2.5 text-xs font-bold transition-all',
                currentSizeId === preset.id
                  ? 'border-blue-500/60 bg-white/70 text-blue-600 shadow-sm backdrop-blur-md dark:bg-blue-500/15 dark:text-blue-400'
                  : 'border-white/50 bg-white/40 text-slate-500 hover:border-blue-200/60 hover:text-slate-700 dark:border-white/10 dark:bg-slate-900/30 dark:text-slate-400 dark:hover:text-slate-300',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          {config.width} × {config.height}
        </p>
      </section>

      {/* 时长预设 */}
      <section className="space-y-3">
        <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          视频时长
        </label>
        <div className="grid grid-cols-4 gap-2">
          {AGNES_DURATION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setDuration(preset.id)}
              disabled={disabled}
              className={cn(
                'rounded-xl border-2 px-1 py-2.5 text-xs font-bold transition-all',
                config.durationPreset === preset.id
                  ? 'border-blue-500/60 bg-white/70 text-blue-600 shadow-sm backdrop-blur-md dark:bg-blue-500/15 dark:text-blue-400'
                  : 'border-white/50 bg-white/40 text-slate-500 hover:border-blue-200/60 hover:text-slate-700 dark:border-white/10 dark:bg-slate-900/30 dark:text-slate-400 dark:hover:text-slate-300',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          {agnesDurationPresetById(config.durationPreset).numFrames} 帧 / {config.frameRate} FPS
        </p>
      </section>

      {/* 推理步数 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">推理步数</span>
          <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            {config.numInferenceSteps}
          </span>
        </div>
        <Slider
          value={[config.numInferenceSteps]}
          min={1}
          max={50}
          step={1}
          disabled={disabled}
          onValueChange={(vals) => setConfig({ ...config, numInferenceSteps: vals[0] })}
        />
      </section>

      {/* 负向提示词 */}
      <section className="space-y-3">
        <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          负向提示词
        </label>
        <Input
          value={config.negativePrompt}
          onChange={(e) => setConfig({ ...config, negativePrompt: e.target.value })}
          disabled={disabled}
          placeholder="描述需要避免出现的画面内容"
          className="h-10 rounded-xl border-white/60 bg-white/60 px-4 text-xs backdrop-blur-xl placeholder:text-slate-400 focus-visible:border-blue-500/50 focus-visible:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900/50"
        />
      </section>

      {/* 种子 */}
      <section className="space-y-3">
        <label className="flex items-center justify-between text-sm font-semibold text-slate-500 dark:text-slate-400">
          <span>随机种子</span>
        </label>
        <div className="relative">
          <Input
            type="text"
            inputMode="numeric"
            value={config.seed}
            onChange={(e) => setConfig({ ...config, seed: e.target.value.replace(/\D/g, '') })}
            disabled={disabled}
            placeholder="留空为随机"
            className="h-10 rounded-xl border-white/60 bg-white/60 pr-10 pl-4 font-mono text-xs backdrop-blur-xl placeholder:text-slate-400 focus-visible:border-blue-500/50 focus-visible:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900/50"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setConfig({ ...config, seed: String(Math.floor(Math.random() * 1_000_000_000)) })}
            disabled={disabled}
            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-400 hover:text-blue-500"
          >
            <Dice5 className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}

function agnesDurationPresetById(id: AgnesConfig['durationPreset']) {
  return AGNES_DURATION_PRESETS.find((p) => p.id === id) || AGNES_DURATION_PRESETS[1];
}
