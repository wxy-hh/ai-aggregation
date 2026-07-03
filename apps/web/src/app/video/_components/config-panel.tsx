'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { VideoConfig, isAgnesConfig, isCogVideoXConfig } from '@/lib/constants/video-generation';
import { VideoModelSwitcher } from './model-switcher';
import { CogVideoXConfigSection } from './cogvideox-config-section';
import { AgnesConfigSection } from './agnes-config-section';

interface ConfigPanelProps {
  prompt: string;
  setPrompt: (value: string) => void;
  config: VideoConfig;
  setConfig: (config: VideoConfig) => void;
  setModel: (model: 'cogvideox-flash' | 'agnes-video-v2.0') => void;
  referenceImage: string | null;
  setReferenceImage: (url: string | null) => void;
  referenceImages: string[];
  setReferenceImages: (urls: string[]) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  loadingStep: string;
  showGenerateButton?: boolean;
}

export function ConfigPanel({
  prompt,
  setPrompt,
  config,
  setConfig,
  setModel,
  referenceImage,
  setReferenceImage,
  referenceImages,
  setReferenceImages,
  onGenerate,
  isGenerating,
  loadingStep,
  showGenerateButton = true,
}: ConfigPanelProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

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
          model: config.model,
        }),
      });

      if (!response.ok) {
        throw new Error('优化失败');
      }

      const result = await response.json();
      setPrompt(result.optimizedPrompt);
    } catch (error) {
      // 如果优化失败，使用简单的后缀增强
      setPrompt(prompt + '，8K超清画质，电影级调色，流畅的镜头运动，自然光影效果');
    } finally {
      setIsOptimizing(false);
    }
  };

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
          <VideoModelSwitcher model={config.model} onModelChange={setModel} disabled={isGenerating} />
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
                'group flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 transition-all hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30',
                (isOptimizing || !prompt.trim() || isGenerating) && 'cursor-not-allowed opacity-50'
              )}
            >
              <Sparkles className={cn('h-3.5 w-3.5', isOptimizing && 'animate-spin')} />
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

        {/* 模型专属配置 */}
        <AnimatePresence mode="wait">
          {isCogVideoXConfig(config) ? (
            <motion.div
              key="cogvideox"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <CogVideoXConfigSection
                config={config}
                setConfig={setConfig}
                referenceImage={referenceImage}
                setReferenceImage={setReferenceImage}
                disabled={isGenerating}
              />
            </motion.div>
          ) : (
            <motion.div
              key="agnes"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <AgnesConfigSection config={config} setConfig={setConfig} disabled={isGenerating} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 高级设置 */}
        <section className="pt-2">
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 transition-colors hover:text-slate-900 dark:hover:text-white"
          >
            <div
              className={cn(
                'rounded-md bg-slate-100 p-1 transition-transform dark:bg-slate-800',
                isAdvancedOpen && 'rotate-180'
              )}
            >
              <ChevronDown className="h-3 w-3" />
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
                  <p className="py-2 text-center text-[10px] text-slate-400">
                    {isAgnesConfig(config)
                      ? '当前模型已暴露完整参数，更多高级能力敬请期待。'
                      : '更多高级创作参数（如种子值、CFG 强度）即将推出...'}
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
              'relative h-14 w-full overflow-hidden rounded-2xl text-base font-bold transition-all',
              'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98]',
              'disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale'
            )}
          >
            {isGenerating ? (
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>{loadingStep || '正在创作...'}</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5" />
                <span>生成视频</span>
              </div>
            )}
            {/* 光效扫过 */}
            <div className="absolute inset-x-0 top-0 h-full w-full -translate-x-full skew-x-[25deg] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-all duration-700 group-hover:translate-x-full" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
