import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload } from './file-upload';
import { Paperclip } from 'lucide-react';
import type { Attachment } from '@/stores/chat-store';

interface ChatInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  isLoading?: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    // 检查是否有上传中的文件
    const hasUploadingFiles = attachments.some((att) => att.uploadStatus === 'uploading');
    if (hasUploadingFiles) {
      alert('请等待文件上传完成');
      return;
    }

    // 检查是否有上传失败的文件
    const hasFailedFiles = attachments.some((att) => att.uploadStatus === 'error');
    if (hasFailedFiles) {
      alert('请移除上传失败的文件或重新上传');
      return;
    }

    onSend(input, attachments.length > 0 ? attachments : undefined);
    setInput('');
    setAttachments([]);
    setShowFileUpload(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  // 处理文件选择
  const handleFilesSelected = (newAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  // 移除附件
  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((att) => att.id === id);
      // 清理图片预览URL
      if (attachment?.url) {
        URL.revokeObjectURL(attachment.url);
      }
      return prev.filter((att) => att.id !== id);
    });
  };

  // 切换文件上传面板
  const toggleFileUpload = () => {
    setShowFileUpload(!showFileUpload);
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* 文件上传面板 */}
      {showFileUpload && (
        <div className="mb-4">
          <FileUpload
            onFilesSelected={handleFilesSelected}
            attachments={attachments}
            onRemoveAttachment={handleRemoveAttachment}
            disabled={isLoading}
          />
        </div>
      )}

      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-2 transition-colors">
        <Textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="输入消息..."
          className="w-full px-4 py-3 bg-transparent border-0 focus-visible:ring-0 resize-none min-h-[24px] max-h-[200px] text-slate-900 dark:text-white placeholder:text-slate-400 shadow-none text-base"
          disabled={isLoading}
        />
        <div className="flex justify-between items-center px-2 pb-1 mt-2">
          <div className="flex items-center gap-1 text-slate-400">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFileUpload}
              className={`h-9 w-9 transition-colors rounded-lg ${
                showFileUpload || attachments.length > 0
                  ? 'text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Paperclip className="w-5 h-5" />
            </Button>
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
          </div>
          <div className="flex items-center gap-2">
            {/* 附件数量指示器 */}
            {attachments.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-950 rounded-md">
                <Paperclip className="w-3 h-3 text-blue-600" />
                <span className="text-xs text-blue-600 font-medium">{attachments.length}</span>
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={(!input.trim() && attachments.length === 0) || isLoading}
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
                  ></path>
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
