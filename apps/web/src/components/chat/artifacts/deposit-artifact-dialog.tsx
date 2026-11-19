'use client';

/**
 * 产物沉淀至知识库弹窗 (ADR-0034 / AGENT-KB-LOOP)
 *
 * 核心功能：
 * 1. 目标知识库下拉选择（自动拉取用户知识库，空状态引导创建）；
 * 2. 标题微调与多维分类标签输入（支持回车添加与删除，对齐 ADR-0032 规范）；
 * 3. 重复沉淀防护感知（已入库时展示已沉淀时间与知识库名称，提供覆盖或另存选项）；
 * 4. 严格对齐移动端与桌面端自适应规范（触控热区 >= 44x44px）。
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
import { useChatStore } from '@/stores/chat-store';
import { toast } from 'sonner';
import {
  BookOpen,
  Tag,
  X,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FolderGit2,
} from 'lucide-react';
import { deriveArtifactDepositState, type Artifact } from '@repo/shared';

export interface DepositArtifactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifact: Artifact | null;
  sessionId?: string | null;
}

interface KnowledgeBaseOption {
  id: string;
  name: string;
  description?: string;
}

export function DepositArtifactDialog({
  open,
  onOpenChange,
  artifact,
  sessionId,
}: DepositArtifactDialogProps) {
  const markArtifactDeposited = useChatStore((state) => state.markArtifactDeposited);

  const [knowledgeBases, setKnowledgeBases] = React.useState<KnowledgeBaseOption[]>([]);
  const [loadingKbs, setLoadingKbs] = React.useState(false);
  const [selectedKbId, setSelectedKbId] = React.useState<string>('');
  const [title, setTitle] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isAlreadyDeposited = Boolean(artifact?.kbDeposit?.deposited);
  // 入库状态绑定版本（ADR-0037）：入库版本落后于当前版时提示并以当前版另存
  const depositState = artifact ? deriveArtifactDepositState(artifact) : { status: 'none' as const };

  // 加载知识库列表
  const loadKnowledgeBases = React.useCallback(async () => {
    setLoadingKbs(true);
    try {
      const res = await fetchWithAuth('/api/knowledge-bases');
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : (json.data?.knowledgeBases || []);
      if (res.ok && json.success) {
        setKnowledgeBases(list);
        if (list.length > 0) {
          setSelectedKbId((prev) => {
            if (prev) return prev;
            const prevKbId = artifact?.kbDeposit?.knowledgeBaseId;
            const matchPrev = list.find((k: KnowledgeBaseOption) => k.id === prevKbId);
            return matchPrev ? matchPrev.id : list[0].id;
          });
        }
      }
    } catch (err) {
      console.error('[DepositArtifactDialog] 获取知识库列表失败:', err);
    } finally {
      setLoadingKbs(false);
    }
  }, [artifact?.kbDeposit?.knowledgeBaseId]);

  // 打开弹窗初始化状态（仅在由关变开时触发一次，不被 selectedKbId 等交互状态重置）
  const prevOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (open && !prevOpenRef.current && artifact) {
      setTitle(artifact.title || '交付产物');
      setTags([]);
      setTagInput('');
      setError(null);
      loadKnowledgeBases();
    }
    prevOpenRef.current = open;
  }, [open, artifact, loadKnowledgeBases]);

  // 添加标签
  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    if (tags.includes(trimmed)) {
      setError(`标签“${trimmed}”已存在`);
      return;
    }
    if (tags.length >= 10) {
      setError('单篇文档最多添加 10 个标签');
      return;
    }
    if (trimmed.length > 20) {
      setError('单个标签长度不能超过 20 个字符');
      return;
    }

    setTags([...tags, trimmed]);
    setTagInput('');
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // 提交沉淀
  const handleSubmit = async () => {
    if (!artifact) return;
    if (!selectedKbId) {
      setError('请选择要存入的目标知识库');
      return;
    }
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('文档标题不能为空');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        artifactId: artifact.id,
        title: cleanTitle,
        content: artifact.content,
        type: artifact.type === 'table' ? 'table' : artifact.type === 'code' ? 'code' : 'markdown',
        tags,
        sourceSessionId: sessionId || undefined,
      };

      const res = await fetchWithAuth(
        `/api/knowledge-bases/${selectedKbId}/documents/artifact`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || '沉淀入库失败');
      }

      const targetKb = knowledgeBases.find((kb) => kb.id === selectedKbId);

      markArtifactDeposited(artifact.id, {
        knowledgeBaseId: selectedKbId,
        knowledgeBaseName: targetKb?.name || '指定知识库',
        documentId: json.data.id,
        depositedAt: new Date().toISOString(),
      });

      toast.success('产物已成功沉淀至知识库！');
      onOpenChange(false);
    } catch (err: unknown) {
      console.error('[DepositArtifactDialog] 提交异常:', err);
      setError(err instanceof Error ? err.message : '沉淀入库发生异常，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (!artifact) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="deposit-artifact-dialog"
        className="sm:max-w-[480px] p-5 sm:p-6 rounded-2xl gap-5"
      >
        <DialogHeader className="space-y-1.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                沉淀至知识库
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                将当前产物保存为知识库的永久文档，用于后续问答检索与二次复用
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 重复沉淀防重复提示 */}
        {isAlreadyDeposited && (
          <div
            data-testid="already-deposited-hint"
            className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 leading-relaxed">
              <span>该产物已沉淀至 </span>
              <strong className="font-semibold">
                {artifact.kbDeposit?.knowledgeBaseName || '知识库'}
              </strong>
              <span>
                {depositState.status === 'stale'
                  ? `（入库于 v${depositState.depositedSeq}，当前已有新版本 v${depositState.currentSeq}），本次将把当前版另存为新文档。`
                  : '，再次提交将新建一份知识库文档。'}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-4 text-xs">
          {/* 目标知识库选择 */}
          <div className="space-y-1.5">
            <label className="font-medium text-foreground flex items-center justify-between">
              <span>目标知识库</span>
              {loadingKbs && <span className="text-[11px] text-muted-foreground animate-pulse">加载中...</span>}
            </label>
            {knowledgeBases.length > 0 ? (
              <select
                data-testid="kb-select"
                value={selectedKbId}
                onChange={(e) => setSelectedKbId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border/80 bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name} {kb.description ? `(${kb.description.slice(0, 20)})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 rounded-xl border border-dashed border-border text-center text-muted-foreground">
                {loadingKbs ? '正在获取知识库列表...' : '您还没有创建任何知识库，请先前往“知识库”页面创建'}
              </div>
            )}
          </div>

          {/* 产物标题 */}
          <div className="space-y-1.5">
            <label className="font-medium text-foreground">文档标题</label>
            <Input
              data-testid="artifact-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入入库文档标题"
              maxLength={100}
              className="h-11 rounded-xl text-xs"
            />
          </div>

          {/* 分类标签 */}
          <div className="space-y-1.5">
            <label className="font-medium text-foreground flex items-center justify-between">
              <span>分类标签 (Tags)</span>
              <span className="text-[11px] text-muted-foreground">按回车快速添加 ({tags.length}/10)</span>
            </label>

            {/* 既有标签徽章区 */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/30 border border-border/40">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    data-testid="artifact-tag-badge"
                    className="h-7 px-2.5 rounded-lg text-xs font-normal gap-1 flex items-center bg-background border border-border/60"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      aria-label={`移除标签 ${t}`}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* 标签输入框与添加按钮 */}
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  data-testid="artifact-tag-input"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="如: 竞品调研、2026、技术架构"
                  maxLength={20}
                  className="pl-8 h-11 rounded-xl text-xs"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                className="h-11 px-3.5 rounded-xl shrink-0 text-xs flex items-center"
              >
                <Plus className="w-4 h-4 mr-1" />
                <span>添加</span>
              </Button>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center space-x-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-end space-x-2 pt-2 border-t border-border/40">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="min-h-[44px] px-4 rounded-xl text-xs"
          >
            取消
          </Button>
          <Button
            type="button"
            data-testid="confirm-deposit-btn"
            onClick={handleSubmit}
            disabled={submitting || knowledgeBases.length === 0}
            className="min-h-[44px] px-5 rounded-xl text-xs flex items-center bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                <span>正在秒级入库...</span>
              </>
            ) : (
              <span>{isAlreadyDeposited ? '确认另存新文档' : '确认沉淀'}</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
