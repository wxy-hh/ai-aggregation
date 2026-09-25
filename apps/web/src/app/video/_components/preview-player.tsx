'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Download, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface PreviewPlayerProps {
  videoUrl: string | null;
  isGenerating: boolean;
  progress: number; // 进度百分比 (0-100)
  status: 'idle' | 'generating' | 'success' | 'error';
}

export function PreviewPlayer({ videoUrl, isGenerating, progress, status }: PreviewPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
    if (videoUrl) {
      window.open(videoUrl, '_blank');
    }
  };

  // 当新视频加载时自动开启播放状态
  useEffect(() => {
    if (videoUrl) setIsPlaying(true);
  }, [videoUrl]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* 主展示区域 */}
      <div className="flex-1 relative overflow-hidden rounded-2xl bg-black border border-white/10 shadow-2xl group">
        {/* 生成进度与渲染状态遮罩 */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
            >
              {/* 中央能量汇聚环 */}
              <div className="relative w-64 h-64 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-[spin_8s_linear_infinite]" />
                <div className="absolute inset-4 rounded-full border border-purple-500/20 animate-[spin_12s_linear_infinite_reverse]" />

                {/* 核心光晕脉冲 */}
                <div className="absolute w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />

                {/* 实时百分比翻动 */}
                <div className="flex flex-col items-center z-10">
                  <motion.span
                    key={Math.floor(progress)}
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-blue-200 to-blue-600 font-mono"
                  >
                    {Math.floor(progress)}%
                  </motion.span>
                  <span className="text-blue-400/50 text-sm tracking-widest mt-2">
                    画面渲染中
                  </span>
                </div>
              </div>

              {/* 背景流光扫描 */}
              <div className="absolute inset-0 -z-10 opacity-30 pointer-events-none">
                <div className="w-full h-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-100%] animate-[shine_2s_infinite]" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 视频容器与空状态 */}
        <div className="relative w-full h-full flex items-center justify-center">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain pointer-events-none" // 自定义控制条驱动
              loop
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          ) : (
            !isGenerating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="text-center"
              >
                <div className="relative group/btn cursor-pointer select-none" onClick={() => {}}>
                  <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-md select-none transition-[transform,background-color,border-color,box-shadow] duration-fast ease-out-expo group-hover/btn:scale-105 active:scale-95 group-hover/btn:bg-white/10 group-hover/btn:border-blue-500/30 group-hover/btn:shadow-[0_0_40px_rgba(59,130,246,0.3)]">
                    <Play className="w-10 h-10 text-white/70 ml-1 group-hover/btn:text-white" />
                  </div>
                  <div className="absolute inset-0 rounded-full border border-white/5 scale-125 opacity-0 group-hover/btn:opacity-100 group-hover/btn:scale-150 transition-[opacity,transform] duration-normal ease-out" />
                </div>
                <p className="mt-8 text-lg text-gray-400 font-light tracking-wide select-none">
                  准备开始创作吗？
                </p>
              </motion.div>
            )
          )}
        </div>

        {/* 悬停控制浮层 */}
        {videoUrl && (
          <div className="absolute inset-0 z-20 flex flex-col justify-between p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-fast ease-out-expo bg-gradient-to-t from-black/60 via-transparent to-transparent">
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleDownload}
                className="text-white hover:bg-white/20 select-none transition-transform duration-fast ease-out-expo active:scale-90"
                aria-label="下载视频"
              >
                <Download className="w-5 h-5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-white hover:bg-white/20 select-none transition-transform duration-fast ease-out-expo active:scale-90"
                aria-label="全屏播放"
              >
                <Maximize2 className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* 帧序列预览条 */}
              <div className="h-12 flex items-center gap-1 overflow-hidden mask-linear-fade">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-16 h-10 rounded bg-white/10 border border-white/5 select-none transition-[border-color,box-shadow,transform] duration-fast ease-out-expo active:scale-95 cursor-pointer overflow-hidden transform-gpu origin-bottom"
                  >
                    {/* 帧缩略图占位 */}
                    <div className="w-full h-full bg-gray-600/20" />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  size="icon"
                  className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-white select-none transition-[background-color,transform] duration-fast ease-out-expo active:scale-90"
                  onClick={togglePlay}
                  aria-label={isPlaying ? '暂停' : '播放'}
                >
                  {isPlaying ? (
                    <span className="w-3 h-3 bg-white rounded-sm" />
                  ) : (
                    <Play className="w-5 h-5 ml-1 fill-current" />
                  )}
                </Button>

                <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden cursor-pointer">
                  <div className="h-full bg-blue-500 w-1/3 relative">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)] transform scale-0 group-hover:scale-100 transition-transform duration-fast ease-out-expo" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
