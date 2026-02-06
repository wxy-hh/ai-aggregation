'use client';

import { AppLayout } from '@/components/layout/app-layout';
import { WaveformVisualizer } from '@/components/voice/waveform';
import { TranscriptList, type TranscriptSegment } from '@/components/voice/transcript-list';
import { RecordingLibrary } from '@/components/voice/recording-library';
import { UploadAudio } from '@/components/voice/upload-audio';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { AudioHistoryItem } from '@/types/audio-history';
import { useHistoryStore } from '@/stores/history-store';
import { VoiceHistoryItem } from '@/types/history';

const mockSegments: TranscriptSegment[] = [
  {
    id: '1',
    timestamp: '00:01',
    speaker: 'Speaker A',
    role: 'Speaker A',
    text: '大家早上好，欢迎参加今天的 AI 产品周会。我们今天要讨论的主要议题是关于下一代语音交互模型的优化方案。',
  },
  {
    id: '2',
    timestamp: '00:15',
    speaker: 'Speaker B (Product Mgr)',
    role: 'Speaker B',
    text: '谢谢。关于目前的模型，我们收到的用户反馈主要集中在噪音环境下的识别准确率。特别是在咖啡厅或者地铁这种背景噪音比较复杂的场景。',
  },
  {
    id: '3',
    timestamp: '00:32',
    speaker: 'Speaker A',
    role: 'Speaker A',
    text: '确实，这也是我们技术团队最近攻克的重点。我们采用了新的降噪算法，也就是 "DeepClear" 技术...',
    active: true,
  },
];

type VoiceMode = 'realtime' | 'upload';

export default function VoicePage() {
  const searchParams = useSearchParams();
  const historyId = searchParams.get('historyId');

  const [isRecording, setIsRecording] = useState(true);
  const [mode, setMode] = useState<VoiceMode>('realtime');
  const [restoredHistoryItem, setRestoredHistoryItem] = useState<AudioHistoryItem | null>(null);

  // 从统一历史记录 store 获取数据
  const getItemById = useHistoryStore((state) => state.getItemById);

  // 🔧 保持上传音频的状态，即使切换到实时录音模式
  // 这样切换回来时可以恢复之前的状态
  const [uploadState, setUploadState] = useState({
    hasUploadedFile: false, // 是否已上传文件
    isProcessing: false, // 是否正在处理
    showResult: false, // 是否显示结果
  });

  // 🔧 从 URL 参数加载历史记录
  useEffect(() => {
    if (historyId) {
      console.log('[VoicePage] Loading history from URL param:', historyId);
      const historyItem = getItemById(historyId);

      if (historyItem && historyItem.type === 'voice') {
        const voiceItem = historyItem as VoiceHistoryItem;
        console.log('[VoicePage] Found voice history item:', voiceItem);

        // 转换为 AudioHistoryItem 格式
        const audioHistoryItem: AudioHistoryItem = {
          id: voiceItem.id,
          fileName: voiceItem.fileName,
          fileSize: voiceItem.fileSize,
          fileMimeType: 'audio/mpeg', // 默认类型
          uploadTime: new Date(voiceItem.createdAt), // 上传时间
          duration: parseFloat(voiceItem.duration.replace(':', '.')) * 60 || 0,
          transcriptionText: voiceItem.transcription,
          translationText: undefined,
          processingStatus: 'completed',
          tags: [], // 标签
          title: voiceItem.title, // 标题
          createdAt: new Date(voiceItem.createdAt),
          updatedAt: new Date(voiceItem.updatedAt),
        };

        // 切换到上传模式并恢复历史记录
        setMode('upload');
        setRestoredHistoryItem(audioHistoryItem);
      } else {
        console.warn('[VoicePage] History item not found or not voice type:', historyId);
      }
    }
  }, [historyId, getItemById]);

  // 🔧 使用 useCallback 优化状态更新回调
  const handleUploadStateChange = useCallback(
    (state: { hasUploadedFile: boolean; isProcessing: boolean; showResult: boolean }) => {
      console.log('📊 父组件收到状态更新:', state);
      setUploadState(state);
    },
    []
  );

  // 🔧 处理历史记录点击
  const handleHistoryItemClick = useCallback((item: AudioHistoryItem) => {
    console.log('[VoicePage] History item clicked:', item);

    // 切换到上传音频模式
    setMode('upload');

    // 设置要恢复的历史记录项
    setRestoredHistoryItem(item);
  }, []);

  // 🔧 历史记录恢复完成后的回调
  const handleHistoryRestored = useCallback(() => {
    console.log('[VoicePage] History restored, clearing restored item');
    // 清除恢复状态，避免重复恢复
    setRestoredHistoryItem(null);
  }, []);

  return (
    <AppLayout>
      <div className="flex w-full h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-blue-900/10 overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full min-w-0 relative">
          {/* Header */}
          <header className="flex-none px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  语音转写
                  {mode === 'realtime' && (
                    <Badge
                      variant="secondary"
                      className="px-2 py-0.5 bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300 text-xs rounded-full font-bold border-0"
                    >
                      LIVE CAPTURE
                    </Badge>
                  )}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {mode === 'realtime'
                    ? '实时将语音转换为高精度文本，支持多语言识别。'
                    : '支持本地音频文件上传转写，自动识别语言。'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {mode === 'realtime' && (
                  <Badge
                    variant="outline"
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-sm font-medium border-red-100 dark:border-red-900/30 animate-pulse"
                  >
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    正在录音 00:04:12
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </Button>
              </div>
            </div>

            {/* Mode Tabs */}
            <Tabs value={mode} onValueChange={(value) => setMode(value as VoiceMode)}>
              <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <TabsTrigger
                  value="realtime"
                  className={cn(
                    'rounded-md text-sm font-medium transition-all',
                    mode === 'realtime'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  )}
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                  实时录音
                </TabsTrigger>
                <TabsTrigger
                  value="upload"
                  className={cn(
                    'rounded-md text-sm font-medium transition-all relative',
                    mode === 'upload'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  )}
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  上传音频
                  {/* 🔧 显示处理状态指示器 */}
                  {uploadState.isProcessing && mode !== 'upload' && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                    </span>
                  )}
                  {uploadState.showResult && !uploadState.isProcessing && mode !== 'upload' && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </header>

          {/* Content Area */}
          {/* 🔧 使用 CSS 隐藏而不是条件渲染，保持组件状态 */}
          {/* 上传音频界面 */}
          <div
            className={mode === 'upload' ? 'flex-1 flex flex-col h-full' : 'hidden'}
            style={{ display: mode === 'upload' ? 'flex' : 'none' }}
          >
            <UploadAudio
              onFileSelect={(file) => console.log('Selected file:', file)}
              onStateChange={handleUploadStateChange}
              restoredHistoryItem={restoredHistoryItem}
              onHistoryRestored={handleHistoryRestored}
            />
          </div>

          {/* 实时录音界面 */}
          <div
            className={
              mode === 'realtime'
                ? 'flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar pb-32'
                : 'hidden'
            }
            style={{ display: mode === 'realtime' ? 'block' : 'none' }}
          >
            <div className="max-w-4xl mx-auto">
              {/* Visualization Card */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 mb-8 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                    Microphone Array (Active)
                  </div>
                  <span className="font-mono text-slate-400 text-xs tracking-widest">
                    SESSION: 00:04:12.85
                  </span>
                </div>

                <WaveformVisualizer />

                {/* Decorative background blur */}
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -top-10 -left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
              </div>

              {/* Transcript List */}
              <TranscriptList segments={mockSegments} />

              {/* Loading State for next segment */}
              <div className="mt-6 flex gap-4 px-4 opacity-50">
                <div className="w-12 pt-1">
                  <div className="h-3 w-8 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div>
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3 animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Action Bar - Only show in realtime mode */}
          {mode === 'realtime' && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4">
              <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 p-2 rounded-2xl shadow-2xl flex items-center justify-between">
                {/* Record Control */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setIsRecording(!isRecording)}
                    className={
                      isRecording
                        ? 'w-10 h-10 rounded-xl bg-red-50 hover:bg-red-100 text-red-500'
                        : 'w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20'
                    }
                    variant={isRecording ? 'secondary' : 'default'}
                    size="icon"
                  >
                    {isRecording ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </Button>
                  <div className="px-3">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">状态</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-white min-w-[60px]">
                      {isRecording ? '录音中' : '已暂停'}
                    </p>
                  </div>
                </div>

                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="gap-2 text-slate-600 dark:text-slate-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    复制文本
                  </Button>
                  <Button variant="ghost" className="gap-2 text-slate-600 dark:text-slate-300">
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
                </div>

                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>

                <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 font-bold gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  发送至 AI 对话
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Recording Library - Hidden on mobile, visible on lg screens */}
        <div className="hidden lg:block h-full shadow-xl z-20">
          <RecordingLibrary onHistoryItemClick={handleHistoryItemClick} />
        </div>
      </div>
    </AppLayout>
  );
}
