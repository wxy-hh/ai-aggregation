'use client';

/**
 * 对话智能提炼 FAQ 弹窗 (ADR-0034 / AGENT-KB-LOOP)
 *
 * 核心功能：
 * 1. 自动调用 /api/chat/distill-faq 进行智能语义提炼（提取标准问、权威答与相似问）；
 * 2. 骨架屏加载态与超时自动降级；
 * 3. 目标知识库选择，支持用户自主微调修改；
 * 4. 提交保存至指定知识库的 FAQ 标准库中（触发 ADR-0027 强短路索引）；
 * 5. 严格对齐移动端与桌面端自适应规范（触控热区 >= 44x44px）。
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
import { toast } from 'sonner';
import {
  HelpCircle,
  Sparkles,
  Plus,
  X,
  RefreshCw,
  AlertCircle,
  FileQuestion,
  CheckCircle2,
} from 'lucide-react';

export interface DistillFaqDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userQuery: string;
  aiResponse: string;
  sessionId?: string | null;
}

interface KnowledgeBaseOption {
  id: string;
  name: string;
  description?: string;
}

export function DistillFaqDialog({
  open,
  onOpenChange,
  userQuery,
  aiResponse,
  sessionId,
}: DistillFaqDialogProps) {
  const [distilling, setDistilling] = React.useState(false);
  const [knowledgeBases, setKnowledgeBases] = React.useState<KnowledgeBaseOption[]>([]);
  const [loadingKbs, setLoadingKbs] = React.useState(false);
  const [selectedKbId, setSelectedKbId] = React.useState<string>('');

  const [question, setQuestion] = React.useState('');
  const [answer, setAnswer] = React.useState('');
  const [similarQuestions, setSimilarQuestions] = React.useState<string[]>([]);
  const [similarInput, setSimilarInput] = React.useState('');
  const [isFallback, setIsFallback] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
          setSelectedKbId((prev) => prev || list[0].id);
        }
      }
    } catch (err) {
      console.error('[DistillFaqDialog] 获取知识库列表失败:', err);
    } finally {
      setLoadingKbs(false);
    }
  }, []);

  // 执行模型智能语义提炼
  const runDistill = React.useCallback(async () => {
    if (!userQuery || !aiResponse) return;

    setDistilling(true);
    setError(null);

    try {
      const res = await fetchWithAuth('/api/chat/distill-faq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userQuery, aiResponse }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setQuestion(json.data.question || userQuery);
        setAnswer(json.data.answer || aiResponse);
        setSimilarQuestions(json.data.similarQuestions || []);
        setIsFallback(Boolean(json.data.isFallback));
      } else {
        // 降级为原始文本
        setQuestion(userQuery.slice(0, 200));
        setAnswer(aiResponse.slice(0, 3000));
        setSimilarQuestions([]);
        setIsFallback(true);
      }
    } catch (err) {
      console.warn('[DistillFaqDialog] 提炼异常，降级展示:', err);
      setQuestion(userQuery.slice(0, 200));
      setAnswer(aiResponse.slice(0, 3000));
      setSimilarQuestions([]);
      setIsFallback(true);
    } finally {
      setDistilling(false);
    }
  }, [userQuery, aiResponse]);

  // 打开弹窗仅在首次打开时触发初始化与提炼（防止切换知识库时覆盖用户已编辑的问答）
  const prevOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      setError(null);
      setSimilarInput('');
      loadKnowledgeBases();
      runDistill();
    }
    prevOpenRef.current = open;
  }, [open, loadKnowledgeBases, runDistill]);

  // 添加相似问
  const handleAddSimilar = () => {
    const trimmed = similarInput.trim();
    if (!trimmed) return;
    if (similarQuestions.includes(trimmed)) {
      setError(`相似问“${trimmed}”已存在`);
      return;
    }
    if (similarQuestions.length >= 5) {
      setError('最多添加 5 条相似问');
      return;
    }
    setSimilarQuestions([...similarQuestions, trimmed]);
    setSimilarInput('');
    setError(null);
  };

  const handleSimilarKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSimilar();
    }
  };

  const handleRemoveSimilar = (qToRemove: string) => {
    setSimilarQuestions(similarQuestions.filter((q) => q !== qToRemove));
  };

  // 提交写入知识库 FAQ
  const handleSubmit = async () => {
    if (!selectedKbId) {
      setError('请选择要存入的目标知识库');
      return;
    }
    const cleanQ = question.trim();
    const cleanA = answer.trim();
    if (!cleanQ) {
      setError('标准问题不能为空');
      return;
    }
    if (!cleanA) {
      setError('标准答案不能为空');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        question: cleanQ,
        answer: cleanA,
        similarQuestions,
        enabled: true,
      };

      const res = await fetchWithAuth(`/api/knowledge-bases/${selectedKbId}/faqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || '沉淀 FAQ 失败');
      }

      toast.success('已成功沉淀为官方 FAQ 问答对！');
      onOpenChange(false);
    } catch (err: unknown) {
      console.error('[DistillFaqDialog] 提交异常:', err);
      setError(err instanceof Error ? err.message : '保存问答对异常，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="distill-faq-dialog"
        className="sm:max-w-[540px] p-5 sm:p-6 rounded-2xl gap-5 max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader className="space-y-1.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                提炼并沉淀为 FAQ 问答对
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                通过智能提炼将优质问答转化为官方权威口径，享受秒级极速向量短路与高权重召回
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 提炼加载骨架屏 */}
        {distilling ? (
          <div data-testid="distill-loading-skeleton" className="space-y-4 py-4 animate-pulse">
            <div className="flex items-center space-x-2 text-xs text-primary font-medium">
              <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
              <span>正在对对话进行智能语义去噪与蒸馏...</span>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-muted/60 rounded w-1/4" />
              <div className="h-10 bg-muted/40 rounded-xl w-full" />
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-muted/60 rounded w-1/4" />
              <div className="h-24 bg-muted/40 rounded-xl w-full" />
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* 降级提示 */}
            {isFallback && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>模型语义提炼超时，已平滑预填原始对话内容，您可以手工调整。</span>
              </div>
            )}

            {/* 目标知识库 */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center justify-between">
                <span>目标知识库</span>
                {loadingKbs && <span className="text-[11px] text-muted-foreground animate-pulse">加载中...</span>}
              </label>
              {knowledgeBases.length > 0 ? (
                <select
                  data-testid="faq-kb-select"
                  value={selectedKbId}
                  onChange={(e) => setSelectedKbId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-border/80 bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                >
                  {knowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.id}>
                      {kb.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 rounded-xl border border-dashed border-border text-center text-muted-foreground">
                  {loadingKbs ? '正在获取知识库列表...' : '未找到可用知识库，请先前往“知识库”创建'}
                </div>
              )}
            </div>

            {/* 标准问题 */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">标准问题 (Question)</label>
              <Input
                data-testid="faq-question-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="请输入脱敏后的标准业务问题"
                maxLength={200}
                className="h-11 rounded-xl text-xs"
              />
            </div>

            {/* 标准答案 */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">权威答案 (Answer)</label>
              <textarea
                data-testid="faq-answer-input"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="请输入提纯后的权威标准口径答案"
                rows={4}
                className="w-full p-3 rounded-xl border border-border/80 bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-y min-h-[96px]"
              />
            </div>

            {/* 相似问法 */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center justify-between">
                <span>相似扩展问法 (Sentence-to-Sentence 向量优化)</span>
                <span className="text-[11px] text-muted-foreground">({similarQuestions.length}/5)</span>
              </label>

              {similarQuestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/30 border border-border/40">
                  {similarQuestions.map((q) => (
                    <Badge
                      key={q}
                      variant="secondary"
                      data-testid="similar-question-badge"
                      className="h-7 px-2.5 rounded-lg text-xs font-normal gap-1 flex items-center bg-background border border-border/60"
                    >
                      <span className="max-w-[200px] truncate">{q}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSimilar(q)}
                        aria-label={`移除相似问 ${q}`}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Input
                  data-testid="faq-similar-input"
                  value={similarInput}
                  onChange={(e) => {
                    setSimilarInput(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={handleSimilarKeyDown}
                  placeholder="输入常见同义问法，按回车快速添加"
                  className="h-11 rounded-xl text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddSimilar}
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
        )}

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
            data-testid="confirm-distill-faq-btn"
            onClick={handleSubmit}
            disabled={submitting || distilling || knowledgeBases.length === 0}
            className="min-h-[44px] px-5 rounded-xl text-xs flex items-center bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                <span>正在写入 FAQ...</span>
              </>
            ) : (
              <span>确认沉淀为 FAQ</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
