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
        className="w-full h-full lg:aspect-video bg-white dark:bg-[#111218] rounded-[40px] border border-slate-200 dark:border-slate-800/50 shadow-[0_24px_48px_rgba(0,0,0,0.04)] dark:shadow-none overflow-hidden relative group"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* 空状态占位 */}
        <AnimatePresence>
          {status === 'idle' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center p-12 text-center"
            >
              {/* 播放按钮 */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/30 text-white mb-10 cursor-pointer"
              >
                <Play className="w-10 h-10 ml-1.5 fill-current" />
              </motion.div>

              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                准备开始创作吗？
              </h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-lg mb-12 text-lg leading-relaxed">
                在左侧输入提示词，或拖入参考图像开始生成您的第一段 AI 视频。
              </p>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  className="h-14 px-8 rounded-2xl gap-3 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 font-bold transition-all"
                >
                  <ImageIcon className="w-5 h-5" />
                  上传参考图
                </Button>
                <Button
                  variant="outline"
                  className="h-14 px-8 rounded-2xl gap-3 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 font-bold transition-all"
                >
                  <LayoutGrid className="w-5 h-5" />
                  浏览模板
                </Button>
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
              className="absolute inset-0 z-30 bg-white/90 dark:bg-[#111218]/90 backdrop-blur-xl flex flex-col items-center justify-center"
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
              className="absolute inset-0 z-30 bg-white/90 dark:bg-[#111218]/90 backdrop-blur-xl flex flex-col items-center justify-center"
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
