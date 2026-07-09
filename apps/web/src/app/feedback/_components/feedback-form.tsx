'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { X, Loader2, ImagePlus, Trash2 } from 'lucide-react';
import { authFetch } from '@/lib/api/client';
import { validateFile, ALLOWED_MIME_TYPES } from '@repo/shared';
import { TYPE_CONFIG } from './feedback-constants';
import { toast } from 'sonner';

interface FeedbackFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface ImageEntry {
  file: File;
  previewUrl: string;
}

export function FeedbackForm({ onClose, onSuccess }: FeedbackFormProps) {
  const [type, setType] = useState('BUG');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [imageEntries, setImageEntries] = useState<ImageEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 组件卸载时清理所有 object URL
  useEffect(() => {
    return () => {
      imageEntries.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    };
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    setImageEntries((prev) => {
      if (prev.length + files.length > MAX_IMAGES) {
        toast.error(`最多只能上传 ${MAX_IMAGES} 张图片`);
        return prev;
      }

      for (const file of files) {
        const result = validateFile(file, {
          allowedMimeTypes: ALLOWED_MIME_TYPES.IMAGES,
          maxSize: MAX_FILE_SIZE,
        });
        if (!result.valid) {
          toast.error(result.error || `${file.name} 验证失败`);
          return prev;
        }
      }

      return [...prev, ...files.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }))];
    });

    // 重置 input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeImage = useCallback((index: number) => {
    setImageEntries((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    if (content.trim().length < 10) {
      setError('详细描述至少需要 10 个字符');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await authFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          type,
          title: title.trim(),
          content: content.trim(),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || '提交失败');
        setSubmitting(false);
        return;
      }

      const feedbackId = data.data.id;

      // 上传图片
      if (imageEntries.length > 0) {
        const formData = new FormData();
        imageEntries.forEach((entry) => formData.append('files', entry.file));

        try {
          const uploadRes = await authFetch(`/api/feedback/${feedbackId}/attachments`, {
            method: 'POST',
            body: formData,
          });
          const uploadData = await uploadRes.json();
          if (!uploadData.success) {
            toast.warning('反馈已提交，但图片上传失败');
          }
        } catch {
          toast.warning('反馈已提交，但图片上传失败');
        }
      }

      imageEntries.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
      toast.success('反馈提交成功');
      onSuccess();
    } catch {
      setError('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const typeOptions = Object.entries(TYPE_CONFIG).map(([key, cfg]) => ({
    ...cfg,
    value: key,
    label: key === 'BUG' ? '缺陷报告' : key === 'FEATURE' ? '功能建议' : key === 'UI' ? '界面优化' : key === 'PERFORMANCE' ? '性能问题' : '其他',
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className={cn(
        'relative w-full sm:w-[520px] max-h-[90vh] sm:max-h-[85vh] overflow-y-auto hide-scrollbar',
        'bg-white dark:bg-[#1a1f3a]',
        'rounded-t-3xl sm:rounded-3xl',
        'border border-[#E8ECF5] dark:border-[#2d3454]',
        'shadow-[0_24px_48px_-12px_rgba(0,0,0,0.18)]',
        'pb-safe'
      )}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white dark:bg-[#1a1f3a] border-b border-slate-100 dark:border-slate-700/50">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-heading">提交反馈</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5">
          {/* 反馈类型 */}
          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 block">反馈类型</label>
            <div className="grid grid-cols-3 gap-2">
              {typeOptions.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-3 rounded-2xl text-xs font-medium transition-all',
                      'min-h-[72px]',
                      type === opt.value
                        ? 'bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white shadow-md'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="简要描述你的反馈..."
              maxLength={200}
              required
              className={cn(
                'w-full px-4 py-3 rounded-2xl text-sm',
                'bg-white dark:bg-[#252b4a] border border-[#E8ECF5] dark:border-[#2d3454]',
                'text-slate-700 dark:text-slate-200 placeholder:text-slate-400',
                'focus:outline-none focus:ring-2 focus:ring-[#7B8FFF]/30 transition-all'
              )}
            />
            <div className="text-right text-[10px] text-slate-400 mt-1">{title.length}/200</div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">
              详细描述<span className="text-[10px] text-slate-400 font-normal ml-1">（最少 10 字）</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="请详细描述你的问题或建议，包括复现步骤、期望行为等..."
              rows={5}
              maxLength={5000}
              required
              className={cn(
                'w-full px-4 py-3 rounded-2xl text-sm resize-none',
                'bg-white dark:bg-[#252b4a] border border-[#E8ECF5] dark:border-[#2d3454]',
                'text-slate-700 dark:text-slate-200 placeholder:text-slate-400',
                'focus:outline-none focus:ring-2 focus:ring-[#7B8FFF]/30 transition-all'
              )}
            />
            <div className={cn(
              'text-right text-[10px] mt-1',
              content.trim().length > 0 && content.trim().length < 10 ? 'text-red-500' : 'text-slate-400'
            )}>
              {content.length}/5000
              {content.trim().length > 0 && content.trim().length < 10 && (
                <span className="ml-1">（还需 {10 - content.trim().length} 字）</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">标签（可选）</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="用逗号分隔多个标签，如：移动端, 聊天, 优化"
              className={cn(
                'w-full px-4 py-3 rounded-2xl text-sm',
                'bg-white dark:bg-[#252b4a] border border-[#E8ECF5] dark:border-[#2d3454]',
                'text-slate-700 dark:text-slate-200 placeholder:text-slate-400',
                'focus:outline-none focus:ring-2 focus:ring-[#7B8FFF]/30 transition-all'
              )}
            />
          </div>

          {/* 图片上传 */}
          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">
              截图附件（可选）
              <span className="text-[10px] text-slate-400 font-normal ml-1">最多 {MAX_IMAGES} 张，每张不超过 10MB</span>
            </label>

            {imageEntries.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {imageEntries.map((entry, index) => (
                  <div key={entry.previewUrl} className="relative aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 group">
                    <img src={entry.previewUrl} alt={`预览 ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {imageEntries.length < MAX_IMAGES && (
              <>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-all',
                    'border-2 border-dashed border-slate-200 dark:border-slate-700',
                    'text-slate-500 dark:text-slate-400',
                    'hover:border-[#7B8FFF]/40 hover:text-[#5D7CFA]',
                    'w-full justify-center min-h-[44px]'
                  )}
                >
                  <ImagePlus className="w-4 h-4" />
                  添加截图
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 rounded-2xl">{error}</div>
          )}

          <div className="pb-4">
            <button
              type="submit"
              disabled={submitting || !title.trim() || content.trim().length < 10}
              className={cn(
                'w-full py-3 rounded-2xl font-semibold text-sm text-white transition-all',
                'bg-gradient-to-r from-[#4969E9] to-[#7B8FFF]',
                'shadow-[0_8px_20px_rgba(93,124,250,0.28)]',
                'hover:shadow-[0_12px_28px_rgba(93,124,250,0.36)]',
                'active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'min-h-[48px] flex items-center justify-center gap-2'
              )}
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />提交中...</> : '提交反馈'}
            </button>
            {content.trim().length > 0 && content.trim().length < 10 && (
              <p className="text-[11px] text-red-500 text-center mt-2">详细描述至少需要 10 个字符才能提交</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
