import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useChatStore, type Attachment } from '@/stores/chat-store';
import { Image, FileText, X, Loader2, AlertCircle, FileWarning } from 'lucide-react';
import { toast } from 'sonner';

// 文件上传常量
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_TIMEOUT = 20000; // 20s

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 从 store 获取附件状态
  const { provider, attachment, setAttachment } = useChatStore();

  // 是否显示附件功能（仅豆包支持）
  const showAttachment = provider === 'doubao';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 如果正在使用输入法（如中文拼音输入），不触发发送
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleSend = () => {
    // 有附件时允许空文本，否则需要文本内容
    if ((!input.trim() && !attachment) || isLoading) return;

    // 附件必须在 ready 状态
    if (attachment && attachment.status !== 'ready') return;

    onSend(input);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  // 图片上传处理
  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      // 立即关闭 popover，无论是否成功
      setIsPopoverOpen(false);

      if (!file) return;

      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        toast.custom(
          (t) => (
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.12)' }}
            >
              {/* 背景层 */}
              <div
                className="absolute inset-0 backdrop-blur-xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(219, 234, 254, 0.6) 0%, rgba(191, 219, 254, 0.55) 50%, rgba(147, 197, 253, 0.6) 100%)',
                }}
              />
              {/* 内边框 */}
              <div className="absolute inset-0 rounded-2xl border border-white/60" />

              {/* 光效 */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%)',
                }}
              />
              <div
                className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
                }}
              />

              {/* 内容 */}
              <div className="relative p-4 flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm">
                    <Image className="h-6 w-6 text-blue-600" strokeWidth={2} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-700 mb-1 tracking-tight">
                    请选择图片文件
                  </h3>
                  <p className="text-sm text-slate-500">支持 JPG、PNG、GIF、WebP 格式</p>
                </div>
                <button
                  onClick={() => toast.dismiss(t)}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-white/30 hover:bg-white/50 transition-colors border border-white/40"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </div>
          ),
          { duration: 3000, position: 'top-center' }
        );
        e.target.value = '';
        return;
      }

      // 验证文件大小
      if (file.size > MAX_IMAGE_SIZE) {
        const currentSize = (file.size / (1024 * 1024)).toFixed(1);
        toast.custom(
          (t) => (
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.12)' }}
            >
              {/* 背景层 */}
              <div
                className="absolute inset-0 backdrop-blur-xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(219, 234, 254, 0.6) 0%, rgba(191, 219, 254, 0.55) 50%, rgba(147, 197, 253, 0.6) 100%)',
                }}
              />
              {/* 内边框 */}
              <div className="absolute inset-0 rounded-2xl border border-white/60" />

              {/* 光效 */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%)',
                }}
              />
              <div
                className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
                }}
              />

              {/* 内容 */}
              <div className="relative p-4 flex items-start gap-4 pb-5">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm">
                    <Image className="h-6 w-6 text-blue-600" strokeWidth={2} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-700 mb-1 tracking-tight">
                    图片大小超出限制
                  </h3>
                  <div className="space-y-1">
                    <p className="text-sm text-slate-500">
                      当前图片: <span className="font-medium text-slate-700">{currentSize} MB</span>
                    </p>
                    <p className="text-sm text-slate-500">
                      限制大小: <span className="font-medium text-slate-700">10 MB</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toast.dismiss(t)}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-white/30 hover:bg-white/50 transition-colors border border-white/40"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              {/* 进度条 */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/40">
                <div
                  className="h-full bg-blue-400/70 rounded-full"
                  style={{ width: `${Math.min((parseFloat(currentSize) / 10) * 100, 100)}%` }}
                />
              </div>
            </div>
          ),
          { duration: 4000, position: 'top-center' }
        );
        e.target.value = '';
        return;
      }

      // 创建临时附件对象
      const tempAttachment: Attachment = {
        id: `img-${Date.now()}`,
        type: 'image',
        name: file.name,
        size: file.size,
        status: 'uploading',
      };
      setAttachment(tempAttachment);

      try {
        // 转换为 base64
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          setAttachment({
            ...tempAttachment,
            imageUrl: base64,
            status: 'ready',
          });
        };
        reader.onerror = () => {
          setAttachment({
            ...tempAttachment,
            status: 'error',
            error: '图片读取失败',
          });
        };
        reader.readAsDataURL(file);
      } catch (error) {
        setAttachment({
          ...tempAttachment,
          status: 'error',
          error: error instanceof Error ? error.message : '未知错误',
        });
      }

      // 清空 input
      e.target.value = '';
    },
    [setAttachment]
  );

  // 文件上传处理
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      // 立即关闭 popover，无论是否成功
      setIsPopoverOpen(false);

      if (!file) return;

      // 验证文件类型 - 只支持 PDF
      const allowedTypes = ['application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.custom(
          (t) => (
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.12)' }}
            >
              {/* 背景层 */}
              <div
                className="absolute inset-0 backdrop-blur-xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(219, 234, 254, 0.6) 0%, rgba(191, 219, 254, 0.55) 50%, rgba(147, 197, 253, 0.6) 100%)',
                }}
              />
              {/* 内边框 */}
              <div className="absolute inset-0 rounded-2xl border border-white/60" />

              {/* 光效 */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%)',
                }}
              />
              <div
                className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
                }}
              />

              {/* 内容 */}
              <div className="relative p-4 flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm">
                    <AlertCircle className="h-6 w-6 text-blue-600" strokeWidth={2} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-700 mb-1 tracking-tight">
                    不支持的文件格式
                  </h3>
                  <p className="text-sm text-slate-500">
                    请选择 <span className="font-medium text-slate-700">PDF</span> 格式的文档
                  </p>
                </div>
                <button
                  onClick={() => toast.dismiss(t)}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-white/30 hover:bg-white/50 transition-colors border border-white/40"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </div>
          ),
          {
            duration: 4000,
            position: 'top-center',
          }
        );

        e.target.value = '';
        return;
      }

      // 验证文件大小
      if (file.size > MAX_FILE_SIZE) {
        const currentSize = (file.size / (1024 * 1024)).toFixed(1);

        // 自定义磨玻璃渐变主题 toast
        toast.custom(
          (t) => (
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.12)' }}
            >
              {/* 背景层 */}
              <div
                className="absolute inset-0 backdrop-blur-xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(219, 234, 254, 0.6) 0%, rgba(191, 219, 254, 0.55) 50%, rgba(147, 197, 253, 0.6) 100%)',
                }}
              />
              {/* 内边框 */}
              <div className="absolute inset-0 rounded-2xl border border-white/60" />

              {/* 光效 */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%)',
                }}
              />
              <div
                className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
                }}
              />

              {/* 内容 */}
              <div className="relative p-4 flex items-start gap-4 pb-5">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm">
                    <FileWarning className="h-6 w-6 text-blue-600" strokeWidth={2} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-700 mb-1 tracking-tight">
                    文件大小超出限制
                  </h3>
                  <div className="space-y-1">
                    <p className="text-sm text-slate-500">
                      当前文件: <span className="font-medium text-slate-700">{currentSize} MB</span>
                    </p>
                    <p className="text-sm text-slate-500">
                      限制大小: <span className="font-medium text-slate-700">5 MB</span>
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">请压缩文件或选择较小的文档</p>
                </div>

                <button
                  onClick={() => toast.dismiss(t)}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-white/30 hover:bg-white/50 transition-colors border border-white/40"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              {/* 进度条 - 基于 5MB 限制计算 */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/40">
                <div
                  className="h-full bg-blue-400/70 rounded-full"
                  style={{ width: `${Math.min((parseFloat(currentSize) / 5) * 100, 100)}%` }}
                />
              </div>
            </div>
          ),
          {
            duration: 5000,
            position: 'top-center',
          }
        );

        // 清空 input
        e.target.value = '';
        return;
      }

      // 创建临时附件对象
      const tempAttachment: Attachment = {
        id: `file-${Date.now()}`,
        type: 'file',
        name: file.name,
        size: file.size,
        status: 'uploading',
      };
      setAttachment(tempAttachment);

      try {
        // 上传到服务器
        const formData = new FormData();
        formData.append('file', file);

        // 创建 AbortController 用于超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

        const response = await fetch('/api/files', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || '上传失败');
        }

        setAttachment({
          ...tempAttachment,
          fileId: result.fileId,
          status: 'ready',
        });
      } catch (error) {
        let displayError = '上传失败';

        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            displayError = '上传超时，请检查网络连接或稍后重试';
          } else if (
            error.message.includes('processing') ||
            error.message.includes('timeout') ||
            error.message.includes('超时')
          ) {
            displayError = '文件处理中，请稍后重试。大文件需要更长的处理时间。';
          } else if (
            error.message.includes('InvalidParameter') ||
            error.message.includes('file type')
          ) {
            displayError = '文件格式不支持，请上传 PDF 文档。';
          } else {
            displayError = error.message;
          }
        }

        setAttachment({
          ...tempAttachment,
          status: 'error',
          error: displayError,
        });
      }

      // 清空 input
      e.target.value = '';
    },
    [setAttachment]
  );

  // 删除附件（同时删除远程云端文件）
  const handleRemoveAttachment = useCallback(async () => {
    // 如果有 fileId，先删除远程文件
    if (attachment?.fileId) {
      try {
        console.log('[ChatInput] 删除远程文件:', attachment.fileId);
        const response = await fetch(`/api/files?fileId=${encodeURIComponent(attachment.fileId)}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          console.log('[ChatInput] 远程文件删除成功');
        } else {
          console.warn('[ChatInput] 远程文件删除失败:', response.status);
        }
      } catch (error) {
        // 远程删除失败不影响本地清理
        console.error('[ChatInput] 删除远程文件出错:', error);
      }
    }

    // 清除本地附件状态
    setAttachment(null);
  }, [attachment, setAttachment]);

  // 格式化文件大小
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-2 transition-colors">
        {/* 附件预览区域 */}
        {attachment && (
          <div className="px-3 pt-2 pb-1">
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
              {attachment.status === 'uploading' ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              ) : attachment.type === 'image' ? (
                <div className="w-10 h-10 rounded overflow-hidden bg-slate-200 dark:bg-slate-600">
                  {attachment.imageUrl && (
                    <img
                      src={attachment.imageUrl}
                      alt={attachment.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ) : (
                <FileText className="w-5 h-5 text-blue-500" />
              )}
              <div className="flex flex-col">
                <span className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[150px]">
                  {attachment.name}
                </span>
                {attachment.size && (
                  <span className="text-xs text-slate-400">{formatFileSize(attachment.size)}</span>
                )}
              </div>
              {(attachment.status === 'ready' || attachment.status === 'error') && (
                <button
                  onClick={handleRemoveAttachment}
                  className="ml-2 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  title="删除附件"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              )}
              {attachment.status === 'error' && (
                <span
                  className="text-xs text-red-500 ml-2 max-w-[120px] truncate"
                  title={attachment.error}
                >
                  {attachment.error || '上传失败'}
                </span>
              )}
            </div>
          </div>
        )}

        <Textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={attachment ? '添加消息（可选）...' : '输入消息...'}
          className="w-full px-4 py-3 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none outline-none resize-none min-h-[24px] max-h-[200px] text-slate-900 dark:text-white placeholder:text-slate-400 shadow-none text-base"
          disabled={isLoading}
        />
        <div className="flex justify-between items-center px-2 pb-1 mt-2">
          <div className="flex items-center gap-1 text-slate-400">
            {/* 附件按钮 - 仅豆包显示 */}
            {showAttachment ? (
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <Image className="w-4 h-4 text-green-500" />
                      <span>上传图片</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span>上传文件</span>
                    </button>
                    <div className="px-3 pt-2 text-xs text-slate-400 border-t border-slate-200 dark:border-slate-600 mt-1">
                      <p>支持 PDF 文件，大小 ≤ 5MB</p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-slate-300 dark:text-slate-600 cursor-not-allowed rounded-lg"
                disabled
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
              </Button>
            )}

            {/* 隐藏的文件输入 */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </Button>
            <Button
              onClick={handleSend}
              disabled={
                (!input.trim() && !attachment) || isLoading || attachment?.status === 'uploading'
              }
              className="h-9 w-9 p-0 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition-colors shadow-sm"
              size="icon"
            >
              {isLoading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              )}
            </Button>
          </div>
        </div>
      </div>
      <div className="text-center mt-3 text-xs text-slate-400">
        AI 生成的内容可能不准确，请核实重要信息。
      </div>
    </div>
  );
}
