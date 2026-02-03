'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUploadVoice } from '@/hooks/use-voice-transcriptions';
import { TranscriptionResult } from './transcription-result';
import { translateText } from '@/lib/api/translation';
import { useHistoryActions, useHistoryInitialized } from '@/stores/audio-history-store';
import { AudioHistoryItem } from '@/types/audio-history';
import { withRetry, formatErrorMessage, RetryProgressTracker } from '@/lib/api/error-handler';

interface UploadAudioProps {
  onFileSelect?: (file: File) => void;
  onTranscriptionComplete?: (transcription: string) => void;
  onStateChange?: (state: {
    hasUploadedFile: boolean;
    isProcessing: boolean;
    showResult: boolean;
  }) => void; // 新增：状态变化回调
  // 历史记录恢复相关
  restoredHistoryItem?: AudioHistoryItem | null;
  onHistoryRestored?: () => void;
}

/**
 * 创建转录片段数据
 * 根据音频总时长和文本长度智能分配时间戳
 */
const createSegments = (
  transcriptionText: string,
  translationTexts?: string[], // 改为数组，每个元素对应一个句子的翻译
  audioDuration?: number // 音频总时长（秒）
) => {
  // 将转录文本分成段落（按中文句号、感叹号、问号分割）
  const sentences = transcriptionText.split(/[。！？]/).filter((text) => text.trim().length > 0);

  // 如果文本太短，直接返回一个片段
  if (sentences.length === 0) {
    return [
      {
        id: '1',
        timestamp: '00:00:00',
        speaker: 'Speaker A',
        speakerLabel: 'Speaker A' as 'Speaker A' | 'Speaker B' | 'Speaker C',
        originalText: transcriptionText,
        translatedText: translationTexts?.[0] || 'Translation in progress...',
        startTime: 0,
        endTime: audioDuration || 10,
      },
    ];
  }

  // 检查句子数量是否匹配
  if (translationTexts && translationTexts.length !== sentences.length) {
    console.warn('⚠ 中英文句子数量不匹配:');
    console.warn(`  中文: ${sentences.length} 句`);
    console.warn(`  英文: ${translationTexts.length} 句`);
  }

  // 🔧 核心修复：根据文本长度智能分配时间
  const charCounts = sentences.map((s) => s.length);
  const totalChars = charCounts.reduce((sum, count) => sum + count, 0);

  // 如果没有音频时长，估算（平均每个字0.5秒）
  const estimatedDuration = audioDuration || totalChars * 0.5;

  let currentTime = 0;

  // 为每个句子创建片段
  return sentences.map((sentence, index) => {
    // 根据字符数比例分配时间（长句子分配更多时间）
    const charRatio = charCounts[index] / totalChars;
    const duration = estimatedDuration * charRatio;

    const startTime = currentTime;
    const endTime = currentTime + duration;
    currentTime = endTime;

    // 格式化时间戳
    const minutes = Math.floor(startTime / 60);
    const seconds = Math.floor(startTime % 60);

    // 获取对应的翻译
    let translatedText: string;
    if (!translationTexts) {
      translatedText = 'Translation in progress...';
    } else if (translationTexts[index] === null) {
      // null 表示正在翻译中
      translatedText = 'translating'; // 特殊标记，用于显示 loading
    } else if (translationTexts[index]) {
      translatedText = translationTexts[index];
    } else {
      translatedText = '(Translation not available)';
    }

    return {
      id: String(index + 1),
      timestamp: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:00`,
      speaker: index % 3 === 0 ? 'Speaker A' : index % 3 === 1 ? 'Speaker B' : 'Speaker C',
      speakerLabel: (index % 3 === 0
        ? 'Speaker A'
        : index % 3 === 1
          ? 'Speaker B'
          : 'Speaker C') as 'Speaker A' | 'Speaker B' | 'Speaker C',
      originalText: sentence.trim() + '。',
      translatedText,
      startTime,
      endTime,
    };
  });
};

export function UploadAudio({
  onFileSelect,
  onTranscriptionComplete,
  onStateChange,
  restoredHistoryItem,
  onHistoryRestored,
}: UploadAudioProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
  const [translationResults, setTranslationResults] = useState<string[] | null>(null); // 改为数组
  const [isTranslating, setIsTranslating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | undefined>(undefined);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null); // 保存历史记录 ID
  const [retryProgress, setRetryProgress] = useState<{
    attempt: number;
    maxAttempts: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useUploadVoice();

  // 获取历史记录 store 的 actions - 使用 selector hook 避免无限循环
  const { createItem, updateItem, updateProcessingStatus, initializeService } = useHistoryActions();
  const isInitialized = useHistoryInitialized();

  // 初始化历史记录服务
  useEffect(() => {
    if (!isInitialized) {
      initializeService().catch((error) => {
        console.error('[UploadAudio] Failed to initialize history service:', error);
        // 不影响主要功能，只记录错误
      });
    }
  }, [isInitialized, initializeService]);

  // 🔧 处理历史记录恢复
  useEffect(() => {
    if (!restoredHistoryItem) return;

    console.log('[UploadAudio] Restoring history item:', restoredHistoryItem);

    // 创建占位符文件对象（用于显示文件信息）
    const placeholderFile = new File([''], restoredHistoryItem.fileName, {
      type: restoredHistoryItem.fileMimeType,
    });

    // 设置文件大小（通过 Object.defineProperty）
    Object.defineProperty(placeholderFile, 'size', {
      value: restoredHistoryItem.fileSize,
      writable: false,
    });

    // 恢复状态
    setSelectedFile(placeholderFile);
    setTranscriptionResult(restoredHistoryItem.transcriptionText || null);
    setAudioDuration(restoredHistoryItem.duration);
    setCurrentHistoryId(restoredHistoryItem.id);
    setShowResult(true);

    // 解析翻译结果
    if (restoredHistoryItem.translationText) {
      // 假设翻译文本是按句子分隔的（与转录文本对应）
      const transcriptionSentences = (restoredHistoryItem.transcriptionText || '')
        .split(/[。！？]/)
        .filter((s) => s.trim());

      // 简单处理：将翻译文本按句号分割
      const translationSentences = restoredHistoryItem.translationText
        .split(/\.\s+/)
        .filter((s) => s.trim());

      setTranslationResults(translationSentences);
    } else {
      setTranslationResults(null);
    }

    // 音频 URL 处理：历史记录中没有保存音频文件
    // 但我们可以尝试从原始文件路径恢复（如果有的话）
    // 或者显示一个占位符，提示用户音频不可用
    if (restoredHistoryItem.audioUrl) {
      // 如果历史记录中保存了音频URL（未来可能支持）
      setAudioUrl(restoredHistoryItem.audioUrl);
    } else {
      // 音频文件不可用，设置为特殊标记
      setAudioUrl('unavailable');
    }

    // 通知父组件恢复完成
    onHistoryRestored?.();

    console.log('[UploadAudio] History item restored successfully');
  }, [restoredHistoryItem, onHistoryRestored]);

  // 🔧 监听状态变化，通知父组件
  useEffect(() => {
    if (onStateChange) {
      const hasUploadedFile = selectedFile !== null;
      const isProcessing = uploadMutation.isPending || isTranslating;

      onStateChange({
        hasUploadedFile,
        isProcessing,
        showResult,
      });

      console.log('📊 上传状态变化:', {
        hasUploadedFile,
        isProcessing,
        showResult,
      });
    }
  }, [selectedFile, uploadMutation.isPending, isTranslating, showResult, onStateChange]);

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

    // 验证文件大小（最大 50MB）
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('文件大小不能超过 50MB');
      return;
    }

    // 🔧 重要修改：如果已经在结果界面，保持 showResult 为 true
    // 这样重新上传时不会返回上传界面，而是在结果界面显示 loading
    const wasShowingResult = showResult;

    setSelectedFile(file);
    setTranscriptionResult(null);
    setTranslationResults(null);
    setAudioDuration(undefined);
    setCurrentHistoryId(null); // 重置历史记录 ID
    // 不修改 showResult，保持当前状态
    onFileSelect?.(file);

    // 创建音频 URL 用于播放器
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    // 🔧 获取音频时长
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration;
      console.log('✓ 音频时长:', duration.toFixed(2), '秒');
      setAudioDuration(duration);
    });

    console.log('开始上传文件:', file.name);

    // 🔧 创建历史记录（在开始转录前）
    let historyId: string | null = null;
    try {
      if (isInitialized) {
        const historyItem = await createItem(file);
        historyId = historyItem.id;
        setCurrentHistoryId(historyId);
        console.log('✓ 历史记录已创建:', historyId);
      }
    } catch (error) {
      console.error('[UploadAudio] Failed to create history record:', error);
      // 不影响主要转录流程，继续执行
    }

    // 开始上传并转录
    try {
      // 使用 withRetry 包装转录请求
      const result = await withRetry(() => uploadMutation.mutateAsync({ file }), {
        maxRetries: 3,
        initialDelay: 1000,
        onRetry: (attempt, error) => {
          console.log(`转录重试 ${attempt}/3:`, error.message);
          setRetryProgress({ attempt, maxAttempts: 3 });
        },
      });

      setRetryProgress(null); // 清除重试进度
      console.log('转录结果:', result);

      const transcriptionText = result.transcription || '';

      // 🔍 添加详细调试日志
      console.log('=== 转录结果详情 ===');
      console.log('文本长度:', transcriptionText.length, '字符');
      console.log(
        '句子数量:',
        transcriptionText.split(/[。！？]/).filter((s) => s.trim()).length,
        '句'
      );
      console.log('音频时长:', audioDuration?.toFixed(2) || '未知', '秒');
      console.log('完整文本:', transcriptionText);
      console.log('==================');

      setTranscriptionResult(transcriptionText);
      onTranscriptionComplete?.(transcriptionText);

      // 转录成功后立即显示结果界面
      console.log('设置 showResult 为 true');
      setShowResult(true);

      // 🔧 更新历史记录 - 转录完成
      if (historyId && isInitialized) {
        try {
          await updateProcessingStatus(historyId, 'translating', {
            transcriptionText,
          });
          console.log('✓ 历史记录已更新（转录完成）');
        } catch (error) {
          console.error('[UploadAudio] Failed to update history after transcription:', error);
          // 不影响主要流程
        }
      }

      // 自动开始翻译流程 - 按句子分别翻译，渐进式显示
      if (transcriptionText.trim().length > 0) {
        console.log('→ 开始翻译...');
        setIsTranslating(true);

        try {
          // 按标点分割成句子
          const sentences = transcriptionText
            .split(/[。！？]/)
            .filter((text) => text.trim().length > 0);

          console.log(`  共 ${sentences.length} 句需要翻译`);

          // 初始化翻译结果数组（全部设为 null，表示未翻译）
          const translatedSentences: (string | null)[] = new Array(sentences.length).fill(null);
          setTranslationResults(translatedSentences as string[]); // 立即显示，显示 loading

          // 逐句翻译，每翻译完一句就更新显示
          let translationErrors = 0;
          for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim();
            console.log(`  翻译第 ${i + 1}/${sentences.length} 句...`);

            try {
              // 使用 withRetry 包装翻译请求
              const result = await withRetry(
                () =>
                  translateText({
                    text: sentence,
                    sourceLanguage: 'Chinese',
                    targetLanguage: 'English',
                  }),
                {
                  maxRetries: 3,
                  initialDelay: 500,
                  onRetry: (attempt, error) => {
                    console.log(`  翻译第 ${i + 1} 句重试 ${attempt}/3:`, error.message);
                  },
                }
              );

              // 更新当前句子的翻译
              translatedSentences[i] = result.translatedText.trim();

              // 立即更新状态，触发重新渲染
              setTranslationResults([...translatedSentences] as string[]);

              console.log(`  ✓ 第 ${i + 1} 句翻译完成`);
            } catch (error) {
              console.error(`  第 ${i + 1} 句翻译失败:`, error);
              translatedSentences[i] = '(Translation failed)';
              translationErrors++;
              setTranslationResults([...translatedSentences] as string[]);
            }
          }

          console.log('✓ 全部翻译完成，共', sentences.length, '句');

          // 🔧 更新历史记录 - 翻译完成
          if (historyId && isInitialized) {
            try {
              const translationText = translatedSentences
                .map((t, i) => (t && t !== '(Translation failed)' ? t : ''))
                .filter((t) => t)
                .join(' ');

              // 如果有翻译错误，记录在 errorMessage 中
              const errorMessage =
                translationErrors > 0
                  ? `部分翻译失败 (${translationErrors}/${sentences.length})`
                  : undefined;

              await updateProcessingStatus(historyId, 'completed', {
                translationText: translationText || undefined,
                errorMessage,
              });
              console.log('✓ 历史记录已更新（翻译完成）');
            } catch (error) {
              console.error('[UploadAudio] Failed to update history after translation:', error);
              // 不影响主要流程
            }
          }

          // 如果所有翻译都失败，显示提示
          if (translationErrors === sentences.length) {
            alert('翻译失败，但转录结果已保存');
          } else if (translationErrors > 0) {
            alert(`部分翻译失败 (${translationErrors}/${sentences.length})，转录结果已保存`);
          }
        } catch (translationError) {
          console.error('翻译错误:', translationError);

          // 🔧 翻译失败时更新历史记录状态
          if (historyId && isInitialized) {
            try {
              await updateProcessingStatus(historyId, 'completed', {
                errorMessage: '翻译失败',
              });
            } catch (error) {
              console.error(
                '[UploadAudio] Failed to update history after translation error:',
                error
              );
            }
          }

          // 翻译失败不影响转录结果的显示
          alert('翻译失败，但转录结果已保存');
        } finally {
          setIsTranslating(false);
        }
      } else {
        // 没有翻译内容，直接标记为完成
        if (historyId && isInitialized) {
          try {
            await updateProcessingStatus(historyId, 'completed');
            console.log('✓ 历史记录已更新（无翻译内容）');
          } catch (error) {
            console.error('[UploadAudio] Failed to update history status:', error);
          }
        }
      }
    } catch (error) {
      console.error('上传错误:', error);
      setRetryProgress(null); // 清除重试进度

      // 🔧 转录失败时更新历史记录状态
      if (historyId && isInitialized) {
        try {
          const errorMessage = error instanceof Error ? error.message : '转录失败';
          await updateProcessingStatus(historyId, 'error', {
            errorMessage,
          });
          console.log('✓ 历史记录已更新（转录失败）');
        } catch (updateError) {
          console.error('[UploadAudio] Failed to update history after error:', updateError);
        }
      }

      // 使用格式化的错误消息
      const errorMessage = formatErrorMessage(error, '转录');
      alert(errorMessage);
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

  // 重新上传：直接触发文件选择器
  const handleReupload = () => {
    console.log('=== handleReupload 调试信息 ===');
    console.log('1. handleReupload 被调用');
    console.log('2. fileInputRef:', fileInputRef);
    console.log('3. fileInputRef.current:', fileInputRef.current);
    console.log('4. showResult:', showResult);
    console.log('5. selectedFile:', selectedFile?.name);

    // 使用 setTimeout 确保 DOM 已经渲染
    setTimeout(() => {
      console.log('6. [延迟检查] fileInputRef.current:', fileInputRef.current);

      if (fileInputRef.current) {
        console.log('✓ 文件选择器存在，准备触发点击');
        fileInputRef.current.click();
        console.log('✓ 文件选择器已触发');
      } else {
        console.error('✗ fileInputRef.current 仍然为 null');
        console.error('请检查：');
        console.error('  - 文件输入框是否已渲染到 DOM');
        console.error('  - ref 是否正确绑定');
        console.error('  - 是否有其他组件覆盖了 ref');
      }
    }, 0);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setTranscriptionResult(null);
    setTranslationResults(null);
    setIsTranslating(false);
    setShowResult(false);
    setAudioDuration(undefined);
    setCurrentHistoryId(null); // 重置历史记录 ID
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 如果需要显示结果界面，渲染 TranscriptionResult 组件
  if (showResult && selectedFile) {
    console.log('渲染 TranscriptionResult 组件');
    console.log('翻译状态:', isTranslating ? '翻译中...' : '已完成');
    console.log('转录结果:', transcriptionResult ? '有内容' : '无内容（处理中）');

    // 🔧 如果正在处理且没有转录结果，显示占位内容
    const displayText = transcriptionResult || '正在处理音频，请稍候...';
    const isProcessingNewFile = uploadMutation.isPending || (!transcriptionResult && showResult);

    // 使用真实的转录文本和翻译文本创建显示片段
    const segments = createSegments(
      displayText,
      transcriptionResult ? translationResults || undefined : undefined, // 只有转录完成才显示翻译
      audioDuration // 传入真实音频时长
    );

    return (
      <div className="flex-1 flex flex-col h-full">
        <TranscriptionResult
          fileName={selectedFile.name}
          language="中文"
          targetLanguage="English"
          segments={segments}
          audioUrl={audioUrl ?? undefined}
          isTranslating={isTranslating}
          isProcessing={isProcessingNewFile} // 传递处理状态（包括重新上传）
          onReupload={handleReupload} // 使用新的重新上传函数
        />

        {/* 隐藏的文件输入框 - 必须保留以支持重新上传 */}
        <input
          ref={(el) => {
            fileInputRef.current = el;
            console.log('文件输入框 ref 回调被调用:', el);
          }}
          type="file"
          accept=".mp3,.wav,.aac,audio/mpeg,audio/wav,audio/aac"
          onChange={handleFileInputChange}
          className="hidden"
          data-testid="reupload-file-input"
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

            {/* 开发环境测试按钮 - 直接显示结果界面 */}
            {process.env.NODE_ENV === 'development' && (
              <Button
                onClick={() => {
                  // 创建测试文件用于开发调试
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

        {/* 已选文件显示 */}
        {selectedFile && (
          <div className="mt-6 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-4">
              {/* 文件图标 */}
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
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        {retryProgress
                          ? `转录中... (重试 ${retryProgress.attempt}/${retryProgress.maxAttempts})`
                          : '转录中...'}
                      </span>
                    </>
                  )}
                  {isTranslating && (
                    <>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-purple-600 dark:text-purple-400">
                        翻译中...
                      </span>
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

        {/* 转录结果显示 */}
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
