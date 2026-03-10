'use client';

import { useState } from 'react';
import { Download, Eye, File, Image, Code, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Attachment, MessageContent } from '@/stores/chat-store';

interface MultimediaMessageProps {
  content: string | MessageContent[];
  attachments?: Attachment[];
  className?: string;
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

// 图片预览模态框
function ImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-full">
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

// 文件附件卡片
function FileAttachment({ attachment }: { attachment: Attachment }) {
  const IconComponent = getFileIcon(attachment.type, attachment.mimeType);
  const [showPreview, setShowPreview] = useState(false);

  const handleDownload = () => {
    if (attachment.url) {
      const link = document.createElement('a');
      link.href = attachment.url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 max-w-sm">
        {/* 文件图标或图片缩略图 */}
        <div className="flex-shrink-0">
          {attachment.type === 'image' && attachment.url ? (
            <div
              className="w-12 h-12 rounded-md overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setShowPreview(true)}
            >
              <img
                src={attachment.url}
                alt={attachment.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-md flex items-center justify-center">
              <IconComponent className="w-6 h-6 text-slate-500" />
            </div>
          )}
        </div>

        {/* 文件信息 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            {attachment.name}
          </p>
          <p className="text-xs text-slate-500 mt-1">{formatFileSize(attachment.size)}</p>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          {attachment.type === 'image' && attachment.url && (
            <button
              onClick={() => setShowPreview(true)}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
              title="预览"
            >
              <Eye className="w-4 h-4 text-slate-500" />
            </button>
          )}

          {attachment.url && (
            <button
              onClick={handleDownload}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
              title="下载"
            >
              <Download className="w-4 h-4 text-slate-500" />
            </button>
          )}
        </div>
      </div>

      {/* 图片预览模态框 */}
      {showPreview && attachment.type === 'image' && attachment.url && (
        <ImageModal
          src={attachment.url}
          alt={attachment.name}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}

// 内嵌图片展示
function InlineImage({ src, alt }: { src: string; alt?: string }) {
  const [showModal, setShowModal] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500">
        <Image className="w-5 h-5" />
        <span className="text-sm">图片加载失败</span>
      </div>
    );
  }

  return (
    <>
      <div className="my-3">
        <img
          src={src}
          alt={alt || '图片'}
          className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
          onClick={() => setShowModal(true)}
          onError={() => setImageError(true)}
          style={{ maxHeight: '400px' }}
        />
      </div>

      {showModal && (
        <ImageModal src={src} alt={alt || '图片'} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

export function MultimediaMessage({ content, attachments, className }: MultimediaMessageProps) {
  // 如果是字符串内容，直接返回文本
  if (typeof content === 'string') {
    return (
      <div className={className}>
        <div className="whitespace-pre-wrap">{content}</div>

        {/* 显示附件（如果有） */}
        {attachments && attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {attachments.map((attachment) => (
              <FileAttachment key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 如果是混合内容数组，按类型渲染
  return (
    <div className={className}>
      {content.map((item, index) => {
        switch (item.type) {
          case 'input_text':
            return (
              <div key={index} className="whitespace-pre-wrap">
                {item.text}
              </div>
            );

          case 'input_image':
            return item.image_url ? (
              <InlineImage key={index} src={item.image_url} alt="用户上传的图片" />
            ) : null;

          case 'input_file':
            // 文件通过附件展示，这里不重复显示
            return null;

          default:
            return null;
        }
      })}

      {/* 显示附件（如果有） */}
      {attachments && attachments.length > 0 && (
        <div className="mt-3 space-y-2">
          {attachments.map((attachment) => (
            <FileAttachment key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}
    </div>
  );
}
