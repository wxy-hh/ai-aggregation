'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronUp,
  Clock,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface TimelineBarProps {
  videoUrl?: string | null;
}

export function TimelineBar({ videoUrl }: TimelineBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
  };

  // 查找视频元素
  useEffect(() => {
    if (videoUrl) {
      const video = document.querySelector('video') as HTMLVideoElement;
      if (video) {
        videoRef.current = video;

        const handleTimeUpdate = () => {
          setCurrentTime(video.currentTime);
          setProgress((video.currentTime / video.duration) * 100);
        };

        const handleDurationChange = () => {
          setDuration(video.duration);
        };

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('durationchange', handleDurationChange);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        // 初始化
        if (video.duration) setDuration(video.duration);

        return () => {
          video.removeEventListener('timeupdate', handleTimeUpdate);
          video.removeEventListener('durationchange', handleDurationChange);
          video.removeEventListener('play', handlePlay);
          video.removeEventListener('pause', handlePause);
        };
      }
    }
  }, [videoUrl]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleSkipBack = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 1);
    }
  };

  const handleSkipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 1);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = x / rect.width;
      videoRef.current.currentTime = percent * duration;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const hasVideo = !!videoUrl;

  return (
    <div className="w-full flex flex-col gap-4">
      {/* 主控制条 */}
      <div
        className={cn(
          'flex items-center gap-6 bg-white dark:bg-[#111218] px-6 h-16 rounded-[24px] border border-slate-200 dark:border-slate-800/50 shadow-[0_8px_24px_rgba(0,0,0,0.02)]',
          !hasVideo && 'opacity-50'
        )}
      >
        {/* 播放控制按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSkipBack}
            disabled={!hasVideo}
            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>
          <button
            onClick={handlePlayPause}
            disabled={!hasVideo}
            className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-full flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 ml-0.5 fill-current" />
            )}
          </button>
          <button
            onClick={handleSkipForward}
            disabled={!hasVideo}
            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* 当前时间 */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-bold font-mono text-slate-600 dark:text-slate-300">
            {formatTime(currentTime)}
          </span>
        </div>

        {/* 进度条 */}
        <div
          onClick={handleSeek}
          className={cn(
            'flex-1 relative h-2 bg-slate-100 dark:bg-slate-800 rounded-full group',
            hasVideo && 'cursor-pointer'
          )}
        >
          <div
            className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
          {hasVideo && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white dark:bg-slate-200 rounded-full border-2 border-blue-500 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 8px)` }}
            />
          )}
        </div>

        {/* 总时长 */}
        <span className="text-xs font-bold font-mono text-slate-400">{formatTime(duration)}</span>

        {/* 音量控制 */}
        <button
          onClick={toggleMute}
          disabled={!hasVideo}
          className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* 展开时间轴按钮 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-blue-500 transition-colors"
        >
          <span>展开</span>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
            <ChevronUp className="w-4 h-4" />
          </motion.div>
        </button>
      </div>

      {/* 展开的时间轴轨道视图 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-white/50 dark:bg-[#111218]/50 rounded-[32px] border border-slate-200/50 dark:border-slate-800/50 backdrop-blur-md">
              <div className="h-20 flex items-center gap-1 overflow-x-auto no-scrollbar">
                {hasVideo ? (
                  // 实际帧预览（占位）
                  [...Array(24)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex-shrink-0 w-20 h-14 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:scale-105 transition-transform cursor-pointer',
                        i === Math.floor((progress / 100) * 24) && 'ring-2 ring-blue-500'
                      )}
                    />
                  ))
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                    生成视频后将显示帧预览
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
