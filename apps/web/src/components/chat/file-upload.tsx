'use client';

import { useCallback, useState, useRef } from 'react';
import { Upload, X, File, Image, Code, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/stores/chat-store';

interface FileUploadProps {
  onFilesSelected: (attachments: Attachment[]) => void;
  attachments: Attachment[];
  onRemoveAttachment: (id: string) => void;
  disabled?: boolean;
  maxFiles?: number;
}

// 文件类型图标映射
const getFileIcon = (type: string, mimeType: string) => {
  if (type === 'image') return Image;
  if (type === 'code') return Code;
  if (mimeType.includes('pdf')) return FileText;
  return File;
};

// 文件大小格式化
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// 根据MIME类型判断文件类别
const getFileCategory = (mimeType: string): 'image' | 'document' | 'code' => {
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('json') ||
    mimeType.includes('html') ||
    mimeType.includes('css') ||
    mimeType.includes('python') ||
    mimeType.includes('text/plain') ||
    mimeType.includes('markdown')
  ) {
    return 'code';
  }
  return 'document';
};

export function FileUpload({
  onFilesSelected,
  attachments,
  onRemoveAttachment,
  disabled = false,
  maxFiles = 10,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件上传
  const uploadFiles = useCallback(
    async (files: FileList) => {
      if (disabled || isUploading) return;

      const fileArray = Array.from(files);

      // 检查文件数量限制
      if (attachments.length + fileArray.length > maxFiles) {
        alert(`最多只能上传 ${maxFiles} 个文件`);
        return;
      }

      setIsUploading(true);
      const newAttachments: Attachment[] = [];

      try {
        for (const file of fileArray) {
          // 创建临时附件对象
          const tempAttachment: Attachment = {
            id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            size: file.size,
            type: getFileCategory(file.type),
            mimeType: file.type,
            uploadProgress: 0,
            uploadStatus: 'uploading',
          };

          // 为图片创建预览URL
          if (file.type.startsWith('image/')) {
            tempAttachment.url = URL.createObjectURL(file);
          }

          newAttachments.push(tempAttachment);
        }

        // 立即更新UI显示上传中的文件
        onFilesSelected(newAttachments);

        // 逐个上传文件
        for (let i = 0; i < fileArray.length; i++) {
          const file = fileArray[i];
          const attachment = newAttachments[i];

          try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/chat/upload', {
              method: 'POST',
              body: formData,
            });

            const result = await response.json();

            if (result.success && result.file) {
              // 更新附件信息
              attachment.fileId = result.file.fileId;
              attachment.uploadStatus = 'success';
              attachment.uploadProgress = 100;
            } else {
              // 上传失败
              attachment.uploadStatus = 'error';
              attachment.errorMessage = result.error || '上传失败';
            }
          } catch (error) {
            console.error('文件上传错误:', error);
            attachment.uploadStatus = 'error';
            attachment.errorMessage = error instanceof Error ? error.message : '上传失败';
          }

          // 更新进度
          attachment.uploadProgress = 100;
          onFilesSelected([...newAttachments]); // 触发重新渲染
        }
      } finally {
        setIsUploading(false);
      }
    },
    [attachments.length, disabled, isUploading, maxFiles, onFilesSelected]
  );

  // 拖拽处理
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        uploadFiles(files);
      }
    },
    [disabled, uploadFiles]
  );

  // 点击上传
  const handleFileSelect = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        uploadFiles(files);
      }
      // 清空input值，允许重复选择同一文件
      e.target.value = '';
    },
    [uploadFiles]
  );

  return (
    <div className="space-y-3">
      {/* 文件上传区域 */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl p-4 transition-all duration-200',
          isDragOver
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
            : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.js,.ts,.json,.html,.css,.py,.md"
          disabled={disabled}
        />

        <div
          className="flex flex-col items-center justify-center text-center cursor-pointer"
          onClick={handleFileSelect}
        >
          <Upload className={cn('w-8 h-8 mb-2', isDragOver ? 'text-blue-500' : 'text-slate-400')} />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {isDragOver ? '释放文件以上传' : '点击或拖拽文件到此处'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            支持图片、文档、代码文件，单个文件最大 5MB
          </p>
        </div>
      </div>

      {/* 附件列表 */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const IconComponent = getFileIcon(attachment.type, attachment.mimeType);

            return (
              <div
                key={attachment.id}
                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                {/* 文件图标或图片预览 */}
                <div className="flex-shrink-0">
                  {attachment.type === 'image' && attachment.url ? (
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      className="w-10 h-10 object-cover rounded-md"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-md flex items-center justify-center">
                      <IconComponent className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                </div>

                {/* 文件信息 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {attachment.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500">
                      {formatFileSize(attachment.size)}
                    </span>

                    {/* 上传状态 */}
                    {attachment.uploadStatus === 'uploading' && (
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-blue-600">上传中...</span>
                      </div>
                    )}

                    {attachment.uploadStatus === 'success' && (
                      <span className="text-xs text-green-600">✓ 上传成功</span>
                    )}

                    {attachment.uploadStatus === 'error' && (
                      <div className="flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-red-500" />
                        <span className="text-xs text-red-600">
                          {attachment.errorMessage || '上传失败'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 删除按钮 */}
                <button
                  onClick={() => onRemoveAttachment(attachment.id)}
                  className="flex-shrink-0 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                  disabled={disabled}
                >
                  <X className="w-4 h-4 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
