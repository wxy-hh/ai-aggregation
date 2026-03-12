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
import { useHistoryStore } from '@/stores/history-store';
import { createVoiceHistoryItem } from '@/lib/utils/history-helpers';

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
  // 统一历史记录
  const addUnifiedHistoryItem = useHistoryStore((state) => state.addItem);

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

    // 🔧 优先使用保存的 segments 数据
    if (restoredHistoryItem.segments && restoredHistoryItem.segments.length > 0) {
      // 直接使用保存的 segments
      console.log('[UploadAudio] Restoring from saved segments');
      // segments 会在渲染时使用，这里不需要额外处理
    } else if (restoredHistoryItem.translationText) {
      // 降级方案：解析翻译结果
      console.log('[UploadAudio] Restoring from text (legacy format)');
      const transcriptionSentences = (restoredHistoryItem.transcriptionText || '')
        .split(/[。！？]/)
        .filter((s) => s.trim());

      const translationSentences = restoredHistoryItem.translationText
        .split(/\.\s+/)
        .filter((s) => s.trim());

      setTranslationResults(translationSentences);
    } else {
      setTranslationResults(null);
    }

    // 🔧 音频 URL 处理：优先使用 audioBlob
    if (restoredHistoryItem.audioBlob) {
      // 从 Blob 创建 URL
      const blobUrl = URL.createObjectURL(restoredHistoryItem.audioBlob);
      setAudioUrl(blobUrl);
      console.log('[UploadAudio] Audio restored from blob');
    } else if (restoredHistoryItem.audioUrl) {
      // 如果历史记录中保存了音频URL（未来可能支持）
      setAudioUrl(restoredHistoryItem.audioUrl);
      console.log('[UploadAudio] Audio restored from URL');
    } else {
      // 音频文件不可用，设置为特殊标记
      setAudioUrl('unavailable');
      console.log('[UploadAudio] Audio not available for this history item');
    }

    // 通知父组件恢复完成
    onHistoryRestored?.();

    console.log('[UploadAudio] History item restored successfully');

    // 清理函数：当组件卸载或切换到其他历史记录时，释放 Blob URL
    return () => {
      if (restoredHistoryItem.audioBlob && audioUrl && audioUrl !== 'unavailable') {
        URL.revokeObjectURL(audioUrl);
        console.log('[UploadAudio] Blob URL revoked');
      }
    };
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

          // 立即保存到统一历史记录系统（转录完成时）
          // 🔧 修复：使用函数参数 file 而不是状态变量 selectedFile（避免闭包陷阱）
          if (file && transcriptionText) {
            // 获取音频时长（优先使用 audio 元素的 duration）
            const duration = audio.duration || 0;
            const durationStr =
              duration > 0
                ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
                : '00:00';

            const unifiedHistoryItem = {
              id: historyId, // 使用相同的 ID，不添加前缀，便于同步删除
              ...createVoiceHistoryItem(
                file.name,
                file.size,
                durationStr,
                transcriptionText,
                'SenseVoice'
              ),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            addUnifiedHistoryItem(unifiedHistoryItem);
            console.log('✓ 已保存到统一历史记录:', unifiedHistoryItem.id);
          } else {
            console.warn(
              '⚠ 无法保存到统一历史记录: file=',
              !!file,
              ', transcriptionText=',
              !!transcriptionText
            );
          }
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

              // 🔧 创建完整的 segments 数据用于保存
              const segmentsToSave = createSegments(
                transcriptionText,
                translatedSentences as string[],
                audioDuration
              );

              await updateProcessingStatus(historyId, 'completed', {
                translationText: translationText || undefined,
                segments: segmentsToSave, // 保存完整的 segments
                errorMessage,
              });
              console.log('✓ 历史记录已更新（翻译完成，包含 segments）');
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

    // 🔧 优先使用历史记录中保存的 segments
    let segments;
    if (restoredHistoryItem?.segments && restoredHistoryItem.segments.length > 0) {
      // 使用保存的 segments
      segments = restoredHistoryItem.segments;
      console.log('[UploadAudio] Using saved segments:', segments.length);
    } else {
      // 使用真实的转录文本和翻译文本创建显示片段
      segments = createSegments(
        displayText,
        transcriptionResult ? translationResults || undefined : undefined, // 只有转录完成才显示翻译
        audioDuration // 传入真实音频时长
      );
      console.log('[UploadAudio] Created segments from text:', segments.length);
    }

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
    <div className="flex-1 h-full flex flex-col relative overflow-hidden">
      {/* Ambient Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar flex flex-col items-center justify-center min-h-[500px]">
        <div className="max-w-2xl w-full mx-auto relative z-10 animate-in fade-in zoom-in-95 duration-500">
          {/* Main Upload Card */}
          <div
            className={cn(
              'relative bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl rounded-[2rem] p-10 border transition-all duration-300 group',
              isDragging
                ? 'border-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.1)] scale-[1.02]'
                : 'border-white/60 dark:border-slate-700/60 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.05)] hover:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.08)]'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center text-center">
              {/* Animated Upload Icon */}
              <div className="relative w-20 h-20 mb-8 group-hover:scale-110 transition-transform duration-300 ease-out">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-2xl opacity-20 blur-xl group-hover:opacity-30 transition-opacity" />
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-3xl border border-white/50 dark:border-white/10 flex items-center justify-center shadow-inner">
                  <svg
                    className={cn(
                      'w-10 h-10 text-blue-600 dark:text-blue-400 transition-transform duration-500',
                      isDragging ? 'scale-125 -translate-y-1' : 'translate-y-0'
                    )}
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
              </div>

              {/* Title & Desc */}
              <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                {isDragging ? '释放以上传文件' : '点击或拖拽音频文件至此'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
                支持 MP3, WAV, AAC 等常见格式
                <br />
                <span className="text-xs opacity-70">单文件最大支持 50MB，自动识别语言</span>
              </p>

              {/* Action Button */}
              <div className="relative group/btn">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-25 group-hover/btn:opacity-50 transition duration-200" />
                <Button
                  onClick={handleSelectFile}
                  className="relative bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-10 py-6 h-auto rounded-xl font-semibold shadow-lg transition-all duration-200 active:scale-95 text-base"
                >
                  选择音频文件
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.aac,audio/mpeg,audio/wav,audio/aac"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Selected File Card - Premium Style */}
          {selectedFile && (
            <div className="mt-8 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl p-5 border border-white/50 dark:border-slate-700/50 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-5">
                {/* File Icon */}
                <div className="relative w-14 h-14 flex-shrink-0">
                  <div className="absolute inset-0 bg-blue-500/20 rounded-xl blur-sm" />
                  <div className="relative w-full h-full bg-gradient-to-br from-blue-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-900/30">
                    <svg
                      className="w-7 h-7 text-blue-600 dark:text-blue-400"
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

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white truncate mb-1">
                    {selectedFile.name}
                  </h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>

                    {/* Status Indicators */}
                    <div className="flex items-center gap-2">
                      {uploadMutation.isPending && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                            {retryProgress
                              ? `转录中 (重试 ${retryProgress.attempt})`
                              : '正在转录...'}
                          </span>
                        </div>
                      )}
                      {isTranslating && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20">
                          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" />
                          <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                            翻译中...
                          </span>
                        </div>
                      )}
                      {uploadMutation.isSuccess && !isTranslating && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20">
                          <svg
                            className="w-3 h-3 text-green-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span className="text-xs font-medium text-green-600 dark:text-green-400">
                            处理完成
                          </span>
                        </div>
                      )}
                      {uploadMutation.isError && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20">
                          <svg
                            className="w-3 h-3 text-red-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                          <span className="text-xs font-medium text-red-600 dark:text-red-400">
                            失败
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {uploadMutation.isPending && (
                    <div className="mt-3 w-full bg-slate-100 dark:bg-slate-700/50 rounded-full h-1 overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full animate-[loading_1.5s_ease-in-out_infinite] w-full origin-left" />
                    </div>
                  )}
                </div>

                {/* Delete Action */}
                <button
                  onClick={handleRemoveFile}
                  className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-200"
                  title="移除文件"
                  disabled={uploadMutation.isPending}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Result Preview (Optional/Duplicate of TransriptionResult but simple) */}
          {transcriptionResult && !showResult && (
            <div className="mt-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl p-6 border border-white/50 dark:border-slate-700/50 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  转录成功
                </h3>
                <button className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
                  查看完整结果 &rarr;
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                {transcriptionResult}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
