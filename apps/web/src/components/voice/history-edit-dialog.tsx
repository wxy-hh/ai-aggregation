'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AudioHistoryItem } from '@/types/audio-history';
import { cn } from '@/lib/utils';

interface HistoryEditDialogProps {
  item: AudioHistoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: { title: string; tags: string[] }) => Promise<void>;
}

const MAX_TITLE_LENGTH = 100;
const MAX_TAG_LENGTH = 30;
const MAX_TAGS = 10;

export function HistoryEditDialog({ item, open, onOpenChange, onSave }: HistoryEditDialogProps) {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);

  // 当记录变化时初始化表单数据
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setTags([...item.tags]);
      setTagInput('');
      setError(null);
      setTitleError(null);
      setTagError(null);
    }
  }, [item]);

  // 校验标题有效性
  const validateTitle = (value: string): boolean => {
    if (value.trim().length === 0) {
      setTitleError('标题不能为空');
      return false;
    }
    if (value.length > MAX_TITLE_LENGTH) {
      setTitleError(`标题不能超过 ${MAX_TITLE_LENGTH} 个字符`);
      return false;
    }
    setTitleError(null);
    return true;
  };

  // 处理标题输入变动
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTitle(value);
    validateTitle(value);
  };

  // 添加新标签
  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();

    // 校验标签格式
    if (!trimmedTag) {
      setTagError('标签不能为空');
      return;
    }

    if (trimmedTag.length > MAX_TAG_LENGTH) {
      setTagError(`标签不能超过 ${MAX_TAG_LENGTH} 个字符`);
      return;
    }

    if (tags.includes(trimmedTag)) {
      setTagError('标签已存在');
      return;
    }

    if (tags.length >= MAX_TAGS) {
      setTagError(`最多只能添加 ${MAX_TAGS} 个标签`);
      return;
    }

    setTags([...tags, trimmedTag]);
    setTagInput('');
    setTagError(null);
  };

  // 移除标签
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
    setTagError(null);
  };

  // 处理标签输入框键盘回车事件
  const handleTagInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // 处理保存修改
  const handleSave = async () => {
    if (!item) return;

    // 保存前二次校验标题
    if (!validateTitle(title)) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(item.id, {
        title: title.trim(),
        tags,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  // 处理取消操作并重置表单
  const handleCancel = () => {
    if (item) {
      setTitle(item.title);
      setTags([...item.tags]);
      setTagInput('');
      setError(null);
      setTitleError(null);
      setTagError(null);
    }
    onOpenChange(false);
  };

  if (!item) return null;

  const hasChanges =
    title.trim() !== item.title || JSON.stringify(tags) !== JSON.stringify(item.tags);
  const canSave = hasChanges && !titleError && title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>编辑历史记录</DialogTitle>
          <DialogDescription>修改标题和标签以更好地组织您的音频文件</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 错误消息提示条 */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-2">
                <svg
                  className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
          )}

          {/* 标题输入区域 */}
          <div className="space-y-2">
            <Label htmlFor="title">
              标题 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={handleTitleChange}
              placeholder="输入标题..."
              maxLength={MAX_TITLE_LENGTH}
              className={cn(titleError && 'border-red-500 focus-visible:ring-red-500')}
            />
            <div className="flex items-center justify-between text-xs">
              {titleError ? (
                <span className="text-red-500">{titleError}</span>
              ) : (
                <span className="text-slate-400">为您的音频文件设置一个描述性标题</span>
              )}
              <span
                className={cn(
                  'text-slate-400',
                  title.length > MAX_TITLE_LENGTH * 0.9 && 'text-orange-500',
                  title.length >= MAX_TITLE_LENGTH && 'text-red-500'
                )}
              >
                {title.length}/{MAX_TITLE_LENGTH}
              </span>
            </div>
          </div>

          {/* 标签管理区域 */}
          <div className="space-y-2">
            <Label htmlFor="tag-input">标签</Label>
            <div className="flex gap-2">
              <Input
                id="tag-input"
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setTagError(null);
                }}
                onKeyPress={handleTagInputKeyPress}
                placeholder="添加标签..."
                maxLength={MAX_TAG_LENGTH}
                className={cn(tagError && 'border-red-500 focus-visible:ring-red-500')}
              />
              <Button
                type="button"
                onClick={handleAddTag}
                disabled={!tagInput.trim() || tags.length >= MAX_TAGS}
                size="sm"
              >
                添加
              </Button>
            </div>
            {tagError && <p className="text-xs text-red-500">{tagError}</p>}
            <p className="text-xs text-slate-400">
              按 Enter 键快速添加标签 ({tags.length}/{MAX_TAGS})
            </p>

            {/* 已添加标签徽标列表 */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="pl-2.5 pr-1 py-1 flex items-center gap-1"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full p-0.5 transition-colors"
                      aria-label={`删除标签 ${tag}`}
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* 音频文件信息展示（只读） */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">文件信息</p>
            <p
              className="text-sm text-slate-700 dark:text-slate-300 truncate"
              title={item.fileName}
            >
              {item.fileName}
            </p>
            <p className="text-xs text-slate-400">
              {new Date(item.createdAt).toLocaleString('zh-CN')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving}>
            取消
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave || isSaving}>
            {isSaving ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
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
                保存中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
