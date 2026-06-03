'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Zap,
  BrainCircuit,
  Crown,
  Image as ImageIcon,
  ChevronDown,
  Upload,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { VideoConfig } from './use-video-generation';

interface ConfigPanelProps {
  prompt: string;
  setPrompt: (value: string) => void;
  config: VideoConfig;
  setConfig: (config: VideoConfig) => void;
  referenceImage: string | null;
  setReferenceImage: (url: string | null) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  loadingStep: string;
  showGenerateButton?: boolean;
}

// 模型配置 - 根据智谱 API 支持
const MODELS = [
  {
    id: 'cogvideox-flash' as const,
    name: 'CogVideoX-Flash',
    icon: Zap,
    description: '免费快速',
    credits: 0,
  },
  // {
  //   id: 'cogvideox-2' as const,
  //   name: 'CogVideoX-2',
  //   icon: Crown,
  //   description: '高质量',
  //   credits: 35,
  // },
];

// 画面比例配置
const RATIOS: {
  id: VideoConfig['aspectRatio'];
  label: string;
  icon: (active: boolean) => React.ReactNode;
}[] = [
  {
    id: '16:9',
    label: '16:9',
    icon: (active: boolean) => (
      <div
        className={cn(
          'w-7 h-4 border-2 rounded-[3px] transition-colors',
          active ? 'border-blue-500 bg-blue-500/10' : 'border-slate-300 dark:border-slate-600'
        )}
      />
    ),
  },
  {
    id: '9:16',
    label: '9:16',
    icon: (active: boolean) => (
      <div
        className={cn(
          'w-4 h-7 border-2 rounded-[3px] transition-colors',
          active ? 'border-blue-500 bg-blue-500/10' : 'border-slate-300 dark:border-slate-600'
        )}
      />
    ),
  },
  {
    id: '1:1',
    label: '1:1',
    icon: (active: boolean) => (
      <div
        className={cn(
          'w-5 h-5 border-2 rounded-[3px] transition-colors',
          active ? 'border-blue-500 bg-blue-500/10' : 'border-slate-300 dark:border-slate-600'
        )}
      />
    ),
  },
];

// 时长选项
const DURATIONS: VideoConfig['duration'][] = [5, 10];

// 分辨率选项
const RESOLUTIONS: VideoConfig['resolution'][] = ['720p', '1080p'];

export function ConfigPanel({
  prompt,
  setPrompt,
  config,
  setConfig,
  referenceImage,
  setReferenceImage,
  onGenerate,
  isGenerating,
  loadingStep,
  showGenerateButton = true,
}: ConfigPanelProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOptimize = async () => {
    if (!prompt.trim()) return;

    setIsOptimizing(true);
    try {
      const response = await fetch('/api/video/optimize-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio: config.aspectRatio,
          duration: config.duration,
        }),
      });

      if (!response.ok) {
        throw new Error('优化失败');
      }

      const result = await response.json();
      setPrompt(result.optimizedPrompt);
    } catch (error) {
      console.error('Prompt optimization error:', error);
      // 如果优化失败，使用简单的后缀增强
      setPrompt(prompt + '，8K超清画质，电影级调色，流畅的镜头运动，自然光影效果');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 这里应该上传到云存储获取 URL，目前使用本地预览
      const reader = new FileReader();
      reader.onload = () => {
        setReferenceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearReferenceImage = () => {
    setReferenceImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const selectedModel = MODELS.find((m) => m.id === config.model) || MODELS[0];

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent transition-colors">
      {/* 滚动内容区 */}
      <div className="no-scrollbar w-full min-w-0 flex-1 space-y-7 overflow-y-auto px-5 py-6 lg:px-6">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          创作参数
        </h2>

        {/* 模型选择 */}
        <section className="space-y-3">
          <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            模型选择
          </label>
          <div className="flex gap-1.5 rounded-2xl border border-white/50 bg-white/50 p-1.5 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/40">
            {MODELS.map((model) => {
              const active = config.model === model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => setConfig({ ...config, model: model.id })}
                  disabled={isGenerating}
                  className={cn(
                    'relative flex-1 py-3.5 px-4 rounded-xl transition-all flex flex-col items-center gap-1.5 overflow-hidden',
                    active
                      ? 'border border-white/70 bg-white/90 text-blue-600 shadow-md backdrop-blur-md dark:border-slate-600 dark:bg-slate-700/90 dark:text-blue-400'
                      : 'text-slate-500 hover:bg-white/40 dark:text-slate-400 dark:hover:bg-slate-800/40',
                    isGenerating && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <model.icon className={cn('w-4 h-4', active && 'text-blue-500')} />
                    <span className="text-xs font-bold leading-none">{model.name}</span>
                  </div>
                  <span
                    className={cn('text-[10px]', active ? 'text-blue-500/70' : 'text-slate-400')}
                  >
                    {model.credits > 0 ? `${model.credits} Credits` : '免费'}
                  </span>
                  {active && <Check className="w-3 h-3 absolute right-2 top-2 text-green-500" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* 视频描述 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              视频描述
            </label>
            <button
              onClick={handleOptimize}
              disabled={isOptimizing || !prompt.trim() || isGenerating}
              className={cn(
                'group flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all',
                (isOptimizing || !prompt.trim() || isGenerating) && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Sparkles className={cn('w-3.5 h-3.5', isOptimizing && 'animate-spin')} />
              {isOptimizing ? '优化中...' : '✨ 智能优化'}
            </button>
          </div>
          {/* 外层承载边框与 focus 光晕，内层 textarea 滚动，避免滚动条压住描边 */}
          <div
            className={cn(
              'relative overflow-hidden rounded-2xl border border-white/60 bg-white/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl transition-all',
              'focus-within:border-blue-500/50 focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.12),inset_0_1px_0_0_rgba(255,255,255,0.35)]',
              'dark:border-white/10 dark:bg-slate-900/50 dark:focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.18),inset_0_1px_0_0_rgba(255,255,255,0.06)]',
              isGenerating && 'opacity-50'
            )}
          >
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder="描述你想要生成的视频画面，例如：一只金色的鲤鱼在星空中游动，鳞片闪烁着微光，背景是深蓝色的银河系..."
              className="min-h-[140px] max-h-[200px] w-full resize-none overflow-y-auto border-0 bg-transparent px-4 py-4 pr-3 text-sm leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 [scrollbar-gutter:stable]"
            />
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-slate-100/80 bg-white/85 px-2 py-0.5 text-[10px] font-mono text-slate-400 dark:border-slate-800 dark:bg-slate-950/60">
              {prompt.length}/500
            </div>
          </div>
        </section>

        {/* 参考图 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <ImageIcon className="w-4 h-4" />
              参考图
            </label>
            <span className="text-[10px] font-bold text-blue-500/70 tracking-widest uppercase px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded-full">
              图生视频
            </span>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
            disabled={isGenerating}
          />
          <div
            onClick={() => !isGenerating && !referenceImage && fileInputRef.current?.click()}
            className={cn(
              'relative h-32 overflow-hidden rounded-2xl border-2 border-dashed transition-all',
              referenceImage
                ? 'border-solid border-blue-400/50 bg-white/40 dark:border-blue-500/30 dark:bg-slate-900/30'
                : 'cursor-pointer border-white/60 bg-white/40 hover:border-blue-400/60 dark:border-white/10 dark:bg-slate-900/30 dark:hover:border-blue-500/40',
              isGenerating && 'pointer-events-none opacity-50'
            )}
          >
            {referenceImage ? (
              <>
                <img src={referenceImage} alt="参考图" className="w-full h-full object-cover" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearReferenceImage();
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400 group-hover:text-blue-500 transition-colors">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-full">
                  <Upload className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">点击上传或拖拽参考图片</span>
              </div>
            )}
          </div>
        </section>

        {/* 规格设置 */}
        <section className="space-y-5">
          <label className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            规格设置
          </label>

          {/* 画面比例 */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              画面比例
            </span>
            <div className="flex gap-2">
              {RATIOS.map((ratio) => (
                <button
                  key={ratio.id}
                  onClick={() => setConfig({ ...config, aspectRatio: ratio.id })}
                  disabled={isGenerating}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 transition-all',
                    config.aspectRatio === ratio.id
                      ? 'border-blue-500/60 bg-white/70 shadow-sm backdrop-blur-md dark:bg-blue-500/15'
                      : 'border-white/50 bg-white/40 hover:border-blue-200/60 dark:border-white/10 dark:bg-slate-900/30',
                    isGenerating && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {ratio.icon(config.aspectRatio === ratio.id)}
                  <span
                    className={cn(
                      'text-[11px] font-bold',
                      config.aspectRatio === ratio.id
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-400'
                    )}
                  >
                    {ratio.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 时长 & 分辨率 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 时长 */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                时长
              </span>
              <div className="grid grid-cols-2 rounded-xl border border-white/50 bg-white/50 p-1 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/40">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setConfig({ ...config, duration: d })}
                    disabled={isGenerating}
                    className={cn(
                      'py-2 rounded-lg text-xs font-bold transition-all',
                      config.duration === d
                        ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                      isGenerating && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {/* 分辨率 */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                分辨率
              </span>
              <div className="grid grid-cols-2 rounded-xl border border-white/50 bg-white/50 p-1 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/40">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setConfig({ ...config, resolution: r })}
                    disabled={isGenerating}
                    className={cn(
                      'py-2 rounded-lg text-xs font-bold transition-all',
                      config.resolution === r
                        ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                      isGenerating && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 高级设置 */}
        <section className="pt-2">
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <div
              className={cn(
                'p-1 rounded-md bg-slate-100 dark:bg-slate-800 transition-transform',
                isAdvancedOpen && 'rotate-180'
              )}
            >
              <ChevronDown className="w-3 h-3" />
            </div>
            高级设置
          </button>
          <AnimatePresence>
            {isAdvancedOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-2xl border border-white/50 bg-white/50 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/40">
                  <p className="text-[10px] text-slate-400 text-center py-2">
                    更多高级创作参数（如种子值、CFG 强度）即将推出...
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* 底部生成按钮 */}
      {showGenerateButton ? (
        <div className="w-full min-w-0 border-t border-white/30 bg-gradient-to-t from-white/90 via-white/70 to-transparent p-5 backdrop-blur-xl dark:border-white/5 dark:from-slate-900/90 dark:via-slate-900/70 lg:p-6">
          <Button
            onClick={onGenerate}
            disabled={isGenerating || !prompt.trim()}
            className={cn(
              'h-14 w-full rounded-2xl text-base font-bold transition-all',
              'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98]',
              'disabled:opacity-50 disabled:grayscale disabled:scale-100 disabled:cursor-not-allowed',
              'relative overflow-hidden group'
            )}
          >
            {isGenerating ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{loadingStep || '正在创作...'}</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5" />
                <span>生成视频</span>
                {selectedModel.credits > 0 && (
                  <div className="ml-2 pl-3 border-l border-white/20 flex flex-col items-start leading-none gap-0.5">
                    <span className="text-[10px] opacity-70">CREDITS</span>
                    <span className="text-xs">{selectedModel.credits}</span>
                  </div>
                )}
              </div>
            )}
            {/* 光效扫过 */}
            <div className="absolute inset-x-0 top-0 h-full w-full transition-all duration-700 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[25deg]" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
