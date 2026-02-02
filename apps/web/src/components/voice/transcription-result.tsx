'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ViewMode = 'original' | 'translation' | 'bilingual';

interface TranscriptSegment {
  id: string;
  timestamp: string;
  speaker: string;
  speakerLabel: 'Speaker A' | 'Speaker B' | 'Speaker C';
  originalText: string;
  translatedText: string;
  startTime: number; // 秒
  endTime: number; // 秒
}

interface TranscriptionResultProps {
  fileName: string;
  language: string;
  targetLanguage: string;
  segments: TranscriptSegment[];
  audioUrl?: string;
  isTranslating?: boolean;
  isProcessing?: boolean; // 新增：是否正在处理（转录中）
  onReupload?: () => void; // 重新上传回调
}

export function TranscriptionResult({
  fileName,
  language,
  targetLanguage,
  segments,
  audioUrl,
  isTranslating = false,
  isProcessing = false,
  onReupload,
}: TranscriptionResultProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('bilingual');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [userClickedSegment, setUserClickedSegment] = useState(false); // 标记用户是否点击了片段
  const audioRef = useRef<HTMLAudioElement>(null);

  // 音频播放控制
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      // 只有在用户没有手动点击时，才自动更新 activeSegmentId
      if (!userClickedSegment) {
        // 找到当前播放的片段
        const currentSegment = segments.find(
          (seg) => audio.currentTime >= seg.startTime && audio.currentTime <= seg.endTime
        );
        setActiveSegmentId(currentSegment?.id || null);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setUserClickedSegment(false); // 播放结束后重置
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [segments, userClickedSegment]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyTranslation = () => {
    const text = segments.map((seg) => seg.translatedText).join('\n\n');
    navigator.clipboard.writeText(text);
    alert('译文已复制到剪贴板');
  };

  const handleExport = () => {
    // TODO: 实现导出功能
    alert('导出功能开发中');
  };

  const handleSendToChat = () => {
    // TODO: 实现发送到对话功能
    alert('发送到对话功能开发中');
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="flex-none px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center justify-between">
          {/* File Info */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">{fileName}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </svg>
                  原语言: {language}
                </span>
                <span className="text-xs text-slate-400">→</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                    />
                  </svg>
                  目标语言: {targetLanguage}
                </span>
                {isTranslating ? (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs font-semibold rounded-full animate-pulse flex items-center gap-1">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    翻译中...
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-semibold rounded-full">
                    已完成
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* 重新上传按钮 */}
            {onReupload && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  console.log('重新上传按钮被点击');
                  console.log('事件对象:', e);
                  console.log('onReupload 函数:', onReupload);
                  onReupload();
                }}
                className="gap-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                重新上传
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyTranslation}
              className="gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              复制译文
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              导出
            </Button>
            <Button
              size="sm"
              onClick={handleSendToChat}
              className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              发送到对话
            </Button>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-2 mt-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-2">
            显示模式:
          </span>
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('original')}
              className={cn(
                'px-4 py-1.5 text-xs font-medium rounded-md transition-all',
                viewMode === 'original'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              仅原文
            </button>
            <button
              onClick={() => setViewMode('translation')}
              className={cn(
                'px-4 py-1.5 text-xs font-medium rounded-md transition-all',
                viewMode === 'translation'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              仅译文
            </button>
            <button
              onClick={() => setViewMode('bilingual')}
              className={cn(
                'px-4 py-1.5 text-xs font-medium rounded-md transition-all',
                viewMode === 'bilingual'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              双语对照
            </button>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 pb-32 custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          {viewMode === 'bilingual' ? (
            // 双栏对照模式 - 使用 grid 自动对齐高度
            <div className="space-y-4">
              {/* 标题行 */}
              <div className="grid grid-cols-2 gap-6 sticky top-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 py-2 z-10">
                {/* 左栏标题 - 原文 */}
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </svg>
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    原文 (Chinese)
                  </h2>
                </div>

                {/* 右栏标题 - 译文 */}
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                    />
                  </svg>
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    译文 (English)
                  </h2>
                </div>
              </div>

              {/* 内容行 - 每行包含原文和译文，自动对齐高度 */}
              {segments.map((segment) => (
                <div
                  key={segment.id}
                  className="grid grid-cols-2 gap-6 items-start"
                  onClick={(e) => {
                    // 阻止父元素的点击事件
                    e.stopPropagation();
                  }}
                >
                  {/* 左栏 - 原文 */}
                  <SegmentBlock
                    segment={segment}
                    isActive={activeSegmentId === segment.id}
                    showTranslation={false}
                    onSeek={handleSeek}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSegmentId(segment.id);
                      setUserClickedSegment(true); // 标记用户点击
                      handleSeek(segment.startTime);

                      // 3秒后恢复自动更新
                      setTimeout(() => {
                        setUserClickedSegment(false);
                      }, 3000);
                    }}
                  />

                  {/* 右栏 - 译文 */}
                  <SegmentBlock
                    segment={segment}
                    isActive={activeSegmentId === segment.id}
                    showTranslation={true}
                    onSeek={handleSeek}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSegmentId(segment.id);
                      setUserClickedSegment(true); // 标记用户点击
                      handleSeek(segment.startTime);

                      // 3秒后恢复自动更新
                      setTimeout(() => {
                        setUserClickedSegment(false);
                      }, 3000);
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            // 单栏模式
            <div className="max-w-4xl mx-auto space-y-4">
              {segments.map((segment) => (
                <SegmentBlock
                  key={segment.id}
                  segment={segment}
                  isActive={activeSegmentId === segment.id}
                  showTranslation={viewMode === 'translation'}
                  onSeek={handleSeek}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Audio Player */}
      {audioUrl && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-6 z-30">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl p-4">
            <div className="flex items-center gap-4">
              {/* Play Button */}
              <button
                onClick={togglePlay}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-500/30 transition-all"
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-white ml-0.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Progress Bar */}
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <span className="font-mono">{formatTime(currentTime)}</span>
                  <span className="font-mono">{formatTime(duration)}</span>
                </div>
                <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden cursor-pointer group">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                  <div
                    className="absolute inset-y-0 right-0 bg-slate-300 dark:bg-slate-600 opacity-0 group-hover:opacity-50 transition-opacity"
                    style={{ width: `${100 - (currentTime / duration) * 100}%` }}
                  />
                </div>
              </div>

              {/* Speed Control */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">1.0x</span>
                <button className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
                  <svg
                    className="w-4 h-4 text-slate-600 dark:text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828 2.828"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Audio Element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} />}

      {/* Loading 遮罩 - 重新上传时显示 */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4">
            {/* Loading 动画 */}
            <div className="flex flex-col items-center">
              {/* 旋转的音频图标 */}
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 animate-pulse" />
                <div className="absolute inset-2 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-bounce"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                </div>
              </div>

              {/* 标题 */}
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                正在处理音频
              </h3>

              {/* 描述 */}
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
                正在转录和翻译您的音频文件，请稍候...
              </p>

              {/* 进度指示器 */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-[loading_2s_ease-in-out_infinite]" />
              </div>

              {/* 提示文字 */}
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
                这可能需要几分钟时间
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 片段块组件
function SegmentBlock({
  segment,
  isActive,
  showTranslation,
  onSeek,
  onClick,
}: {
  segment: TranscriptSegment;
  isActive: boolean;
  showTranslation: boolean;
  onSeek: (time: number) => void;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const [copied, setCopied] = useState(false);

  const speakerColors = {
    'Speaker A': 'from-blue-500 to-blue-600',
    'Speaker B': 'from-purple-500 to-purple-600',
    'Speaker C': 'from-orange-500 to-orange-600',
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止触发段落点击

    const textToCopy = showTranslation ? segment.translatedText : segment.originalText;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);

      // 2秒后恢复
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  return (
    <div
      className={cn(
        'group relative p-4 rounded-xl border transition-all duration-300 cursor-pointer h-full',
        isActive
          ? 'bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-300 dark:border-blue-700 shadow-lg shadow-blue-500/10 ring-2 ring-blue-400/20'
          : 'bg-white/60 dark:bg-slate-800/60 border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md'
      )}
      onClick={onClick || (() => onSeek(segment.startTime))}
    >
      {/* Active Indicator */}
      {isActive && (
        <div className="absolute left-0 top-4 bottom-4 w-1 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-r-full" />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm',
            speakerColors[segment.speakerLabel]
          )}
        >
          <span className="text-xs font-bold text-white">{segment.speakerLabel.split(' ')[1]}</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {segment.speaker}
            </span>
            <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
              {segment.timestamp}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <p
        className={cn(
          'text-sm leading-relaxed transition-all',
          isActive
            ? 'text-slate-900 dark:text-white font-medium'
            : 'text-slate-700 dark:text-slate-300'
        )}
      >
        {showTranslation &&
        (segment.translatedText === 'translating' ||
          segment.translatedText === 'Translation in progress...') ? (
          // Loading 效果
          <span className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="animate-pulse">Translating...</span>
          </span>
        ) : showTranslation ? (
          segment.translatedText
        ) : (
          segment.originalText
        )}
      </p>

      {/* Hover Actions */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className={cn(
            'w-8 h-8 rounded-md shadow-sm flex items-center justify-center transition-all',
            copied
              ? 'bg-green-500 text-white'
              : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400'
          )}
          title={copied ? '已复制' : '复制'}
        >
          {copied ? (
            // 复制成功图标（对勾）
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            // 复制图标
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
