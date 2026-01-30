'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUploadVoice } from '@/hooks/use-voice-transcriptions';
import { TranscriptionResult } from './transcription-result';

interface UploadAudioProps {
  onFileSelect?: (file: File) => void;
  onTranscriptionComplete?: (transcription: string) => void;
}

// 模拟的转录片段数据（实际应该从 API 返回）
// TODO: 后续需要从 API 返回真实的分段数据和翻译
const createMockSegments = (transcriptionText: string) => {
  // 将转录文本分成段落（简单按句号分割）
  const sentences = transcriptionText.split(/[。！？]/).filter((text) => text.trim().length > 0);

  // 如果文本太短，直接返回一个片段
  if (sentences.length === 0) {
    return [
      {
        id: '1',
        timestamp: '00:00:00',
        speaker: 'Speaker A',
        speakerLabel: 'Speaker A' as const,
        originalText: transcriptionText,
        translatedText: 'Translation in progress... (翻译功能开发中)',
        startTime: 0,
        endTime: 10,
      },
    ];
  }

  // 创建多个片段（显示所有片段，不限制数量）
  return sentences.map((sentence, index) => {
    const minutes = Math.floor((index * 5) / 60);
    const seconds = (index * 5) % 60;

    return {
      id: String(index + 1),
      timestamp: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:00`,
      speaker: index % 3 === 0 ? 'Speaker A' : index % 3 === 1 ? 'Speaker B' : 'Speaker C',
      speakerLabel: (index % 3 === 0
        ? 'Speaker A'
        : index % 3 === 1
          ? 'Speaker B'
          : 'Speaker C') as const,
      originalText: sentence.trim() + '。',
      translatedText: 'Translation in progress... (翻译功能开发中)',
      startTime: index * 5,
      endTime: (index + 1) * 5,
    };
  });
};

export function UploadAudio({ onFileSelect, onTranscriptionComplete }: UploadAudioProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useUploadVoice();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = async (file: File) => {
    // 验证文件类型
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/mp3'];
    const validExtensions = ['.mp3', '.wav', '.aac'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      alert('请上传 MP3、WAV 或 AAC 格式的音频文件');
      return;
    }

    // 验证文件大小 (最大 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('文件大小不能超过 50MB');
      return;
    }

    setSelectedFile(file);
    setTranscriptionResult(null);
    setShowResult(false);
    onFileSelect?.(file);

    // 创建音频 URL 用于播放
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    console.log('开始上传文件:', file.name);

    // 上传并转录
    try {
      const result = await uploadMutation.mutateAsync({ file });
      console.log('转录结果:', result);

      const transcriptionText = result.transcription || '';
      setTranscriptionResult(transcriptionText);
      onTranscriptionComplete?.(transcriptionText);

      // 转录成功后显示结果界面
      // 即使转录结果为空也显示界面（使用 mock 数据演示）
      console.log('设置 showResult 为 true');
      setShowResult(true);
    } catch (error) {
      console.error('Upload error:', error);

      // 显示详细的错误信息
      let errorMessage = '上传失败，请重试';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = String((error as any).message);
      }

      alert(
        `转录失败\n\n错误信息：${errorMessage}\n\n请检查：\n1. 文件格式是否正确（MP3/WAV/AAC）\n2. 文件大小是否超过 50MB\n3. API Key 是否配置正确\n4. 网络连接是否正常`
      );
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setTranscriptionResult(null);
    setShowResult(false);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 如果显示结果界面，渲染 TranscriptionResult 组件
  if (showResult && selectedFile) {
    console.log('渲染 TranscriptionResult 组件');

    // 使用真实的转录文本创建片段
    const segments = createMockSegments(transcriptionResult || '转录结果为空');

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <TranscriptionResult
          fileName={selectedFile.name}
          language="中文"
          targetLanguage="English"
          segments={segments}
          audioUrl={audioUrl || undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        {/* Upload Area */}
        <div
          className={cn(
            'relative bg-white dark:bg-slate-900 rounded-2xl p-8 border-2 border-dashed transition-all duration-200',
            isDragging
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
              : 'border-slate-200 dark:border-slate-700'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center py-12">
            {/* Upload Icon */}
            <div className="w-16 h-16 mb-6 rounded-2xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg
                className="w-8 h-8 text-white"
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
            </div>

            {/* Title */}
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              点击或拖拽本地 MP3/WAV 文件至此
            </h3>

            {/* Subtitle */}
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              支持格式: MP3, WAV, AAC (最大 50MB)
            </p>

            {/* Select Button */}
            <Button
              onClick={handleSelectFile}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg font-semibold shadow-lg shadow-blue-600/20 transition-all duration-200 hover:shadow-xl hover:shadow-blue-600/30"
            >
              选择文件
            </Button>

            {/* 测试按钮 - 直接显示结果界面 */}
            {process.env.NODE_ENV === 'development' && (
              <Button
                onClick={() => {
                  // 创建一个假文件用于测试
                  const testFile = new File(['test'], 'test-audio.mp3', { type: 'audio/mpeg' });
                  setSelectedFile(testFile);
                  setAudioUrl('/assets/voice/人保律师-2510291614.mp3');
                  setShowResult(true);
                }}
                variant="outline"
                className="mt-4"
              >
                测试：直接显示结果界面
              </Button>
            )}

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.aac,audio/mpeg,audio/wav,audio/aac"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </div>

        {/* Selected File Display */}
        {selectedFile && (
          <div className="mt-6 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-4">
              {/* File Icon */}
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6 text-blue-600 dark:text-blue-400"
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

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {selectedFile.name}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                  {uploadMutation.isPending && (
                    <>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-blue-600 dark:text-blue-400">转录中...</span>
                    </>
                  )}
                  {uploadMutation.isSuccess && (
                    <>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-green-600 dark:text-green-400">完成</span>
                    </>
                  )}
                  {uploadMutation.isError && (
                    <>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-red-600 dark:text-red-400">失败</span>
                    </>
                  )}
                </div>

                {/* Progress Bar */}
                {uploadMutation.isPending && (
                  <div className="mt-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full animate-pulse w-full" />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRemoveFile}
                  className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="删除"
                  disabled={uploadMutation.isPending}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transcription Result */}
        {transcriptionResult && (
          <div className="mt-6 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">转录结果</h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(transcriptionResult);
                  alert('已复制到剪贴板');
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                复制文本
              </button>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {transcriptionResult}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
