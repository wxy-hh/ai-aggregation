'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Image as ImageIcon,
  LayoutGrid,
  Pause,
  Download,
  Maximize2,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GenerationStatus } from './use-video-generation';

interface PreviewCanvasProps {
  videoUrl: string | null;
  coverUrl?: string | null;
  isGenerating: boolean;
  progress: number;
  status: GenerationStatus;
  onReset?: () => void;
}

export function PreviewCanvas({
  videoUrl,
  coverUrl,
  isGenerating,
  progress,
  status,
  onReset,
}: PreviewCanvasProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  // 视频加载后自动播放
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.play().catch(() => {
        // 自动播放被阻止，静默处理
      });
    }
  }, [videoUrl]);

  // 下载视频
  const handleDownload = async () => {
    if (!videoUrl) return;
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载失败:', error);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative">
      {/* 主容器 */}
      <div
        className={cn(
          'group relative h-full w-full overflow-hidden rounded-[32px] border border-white/60 lg:aspect-video',
          'bg-gradient-to-b from-white/70 via-white/50 to-white/30 shadow-[0_24px_48px_rgba(76,95,154,0.12),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-2xl',
          'dark:border-white/10 dark:from-slate-900/70 dark:via-slate-900/50 dark:to-slate-900/30 dark:shadow-[0_24px_48px_rgba(0,0,0,0.35)]'
        )}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500" />
        {/* 空状态占位 */}
        <AnimatePresence>
          {status === 'idle' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center sm:p-12"
            >
              <div className="pointer-events-none absolute top-1/2 h-[280px] w-[min(88vw,520px)] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(93,124,250,0.12),transparent_72%)] blur-[80px]" />

              {/* 播放按钮 */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative z-10 mb-8 flex h-24 w-24 cursor-pointer items-center justify-center rounded-full border border-white/40 bg-gradient-to-br from-blue-600 via-indigo-500 to-cyan-500 text-white shadow-[0_16px_32px_rgba(93,124,250,0.28)] sm:mb-10 sm:h-28 sm:w-28"
              >
                <Play className="ml-1.5 h-9 w-9 fill-current sm:h-10 sm:w-10" />
              </motion.div>

              <h3 className="relative z-10 mb-3 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                准备开始创作吗？
              </h3>
              <p className="relative z-10 mb-10 max-w-lg text-base leading-relaxed text-slate-500 dark:text-slate-400 sm:mb-12 sm:text-lg">
                在左侧输入提示词，或上传参考图，开始生成你的第一段 AI 视频。
              </p>

              <div className="relative z-10 flex gap-4">
                <Button
                  variant="outline"
                  className="h-12 gap-3 rounded-2xl border-white/70 bg-white/60 px-6 font-bold text-slate-600 shadow-sm backdrop-blur-md transition-all hover:bg-white/80 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 sm:h-14 sm:px-8"
                >
                  <ImageIcon className="w-5 h-5" />
                  上传参考图
                </Button>
                {/* <Button
                  variant="outline"
                  className="h-14 px-8 rounded-2xl gap-3 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 font-bold transition-all"
                >
                  <LayoutGrid className="w-5 h-5" />
                  浏览模板
                </Button> */}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 生成中状态 */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/75 backdrop-blur-2xl dark:bg-slate-950/75"
            >
              {/* 进度圆环 */}
              <div className="relative w-56 h-56 flex items-center justify-center">
                {/* 外圈装饰 */}
                <div className="absolute inset-0 rounded-full border-2 border-slate-100 dark:border-slate-800" />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-t-2 border-blue-500"
                />

                {/* 主进度圆 */}
                <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                  <circle
                    cx="100"
                    cy="100"
                    r="85"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  <motion.circle
                    cx="100"
                    cy="100"
                    r="85"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 85}
                    animate={{ strokeDashoffset: 2 * Math.PI * 85 * (1 - progress / 100) }}
                    className="text-blue-500"
                    transition={{ duration: 0.5 }}
                  />
                </svg>

                {/* 百分比显示 */}
                <div className="absolute flex flex-col items-center">
                  <span className="text-5xl font-bold font-mono tracking-tighter text-slate-900 dark:text-white">
                    {Math.floor(progress)}%
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">
                    Computing Frames
                  </span>
                </div>
              </div>

              <p className="mt-10 text-slate-500 dark:text-slate-400 font-medium tracking-tight animate-pulse">
                正在渲染您的创意世界...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 错误状态 */}
        <AnimatePresence>
          {status === 'error' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/75 backdrop-blur-2xl dark:bg-slate-950/75"
            >
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-6">
                <span className="text-4xl">😵</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">生成失败</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">请检查输入并重试</p>
              {onReset && (
                <Button onClick={onReset} variant="outline" className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  重新开始
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 视频播放器 */}
        <AnimatePresence>
          {videoUrl && status === 'success' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-20"
            >
              <video
                ref={videoRef}
                src={videoUrl}
                poster={coverUrl || undefined}
                className="w-full h-full object-contain bg-black"
                loop
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              {/* 悬停控制层 */}
              <div
                className={cn(
                  'absolute inset-0 transition-opacity bg-gradient-to-t from-black/50 via-transparent to-black/20 flex flex-col justify-between p-8',
                  isHovering ? 'opacity-100' : 'opacity-0'
                )}
              >
                {/* 顶部工具栏 */}
                <div className="flex justify-end gap-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white hover:bg-white/20 rounded-full"
                    onClick={handleDownload}
                  >
                    <Download className="w-5 h-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white hover:bg-white/20 rounded-full"
                  >
                    <Maximize2 className="w-5 h-5" />
                  </Button>
                </div>

                {/* 中央播放按钮 */}
                <div className="flex items-center justify-center">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={togglePlay}
                    className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white flex items-center justify-center"
                  >
                    {isPlaying ? (
                      <Pause className="w-8 h-8" />
                    ) : (
                      <Play className="w-8 h-8 ml-1.5 fill-current" />
                    )}
                  </motion.button>
                </div>

                {/* 底部留白 */}
                <div className="h-10" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
