'use client';

/**
 * 文档多维标签与元数据编辑弹窗 (ADR-0032 / KB-META-FILTER)
 *
 * 核心功能：
 * 1. 支持文档标签（Tags）即时增删改，按 Enter 或点击按钮追加；
 * 2. 保存时触发服务端原地批量同步 document_chunks，毫秒级生效无需重新排队切片；
 * 3. 严格遵循移动端优先与无障碍热区规范（点击目标 >= 44x44px）。
 */

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/api/client';
import { Tag, X, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import type { DocumentItem } from '../knowledge-workspace';

export interface DocumentMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBaseId: string;
  document: DocumentItem | null;
  onSuccess: (updatedDoc: { id: string; tags: string[] }) => void;
}

export function DocumentMetadataDialog({
  open,
  onOpenChange,
  knowledgeBaseId,
  document,
  onSuccess,
}: DocumentMetadataDialogProps) {
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 打开弹窗时回显文档现有标签
  React.useEffect(() => {
    if (document) {
      setTags(document.tags || []);
      setTagInput('');
      setError(null);
    }
  }, [document, open]);

  // 添加标签
  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    if (tags.includes(trimmed)) {
      setError(`标签“${trimmed}”已存在`);
      return;
    }

    if (trimmed.length > 30) {
      setError('单个标签长度不能超过 30 个字符');
      return;
    }

    setTags([...tags, trimmed]);
    setTagInput('');
    setError(null);
  };

  // 回车键快捷添加
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // 删除标签
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // 保存修改
  const handleSave = async () => {
    if (!document) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetchWithAuth(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/${document.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tags,
            metadata: document.metadata ?? {},
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || '更新文档标签失败');
      }

      onSuccess({
        id: document.id,
        tags,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="document-metadata-dialog-content"
        className="w-[92vw] max-w-md sm:max-w-lg p-5 sm:p-6 rounded-2xl"
      >
        <DialogHeader className="space-y-1.5">
          <div className="flex items-center space-x-2 text-primary font-semibold text-base sm:text-lg">
            <Tag className="w-5 h-5 shrink-0" />
            <DialogTitle>编辑文档分类标签</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground break-words truncate">
            {document?.name ? `当前文档：${document.name}` : '设置文档分类标签，切片将原地即时同步'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 标签录入输入框 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              添加标签（用于前置检索过滤与分类）
            </label>
            <div className="flex items-center space-x-2">
              <Input
                data-testid="metadata-tag-input"
                placeholder="输入标签（如：财务、2026、报销），按回车添加"
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={handleKeyDown}
                className="h-12 min-h-[48px] text-xs rounded-xl"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddTag}
                data-testid="metadata-add-tag-button"
                className="h-12 min-h-[48px] min-w-[48px] px-3.5 rounded-xl text-xs gap-1 flex items-center shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加</span>
              </Button>
            </div>
          </div>

          {/* 已添加标签徽章列表 */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">
              已选标签（{tags.length} 个）：
            </span>
            <div
              data-testid="metadata-tags-container"
              className="min-h-[48px] p-2.5 rounded-xl border border-border/50 bg-muted/20 flex flex-wrap gap-1.5 items-center"
            >
              {tags.length === 0 ? (
                <span className="text-xs text-muted-foreground/60 select-none">
                  暂未添加标签，可在上方输入后添加
                </span>
              ) : (
                tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    data-testid={`metadata-tag-badge-${tag}`}
                    className="pl-2.5 pr-1.5 py-1 text-xs gap-1 flex items-center rounded-lg bg-card border border-border/60 text-foreground"
                  >
                    <span>#{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`移除标签 ${tag}`}
                      data-testid={`remove-tag-${tag}`}
                      className="relative w-5 h-5 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors after:absolute after:-inset-3 after:content-['']"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            💡 保存后，该文档名下全部切片将通过数据库原地批量原子更新标签元数据，无需等待重新排队切片或消耗向量化配额。
          </p>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="w-full sm:w-auto h-12 min-h-[48px] rounded-xl text-xs"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            data-testid="metadata-save-button"
            className="w-full sm:w-auto h-12 min-h-[48px] rounded-xl text-xs font-semibold gap-1.5 flex items-center"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>保存中...</span>
              </>
            ) : (
              <span>保存修改</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
