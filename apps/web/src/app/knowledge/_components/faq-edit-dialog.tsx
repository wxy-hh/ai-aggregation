'use client';

/**
 * FAQ 新建与编辑弹窗组件 (FaqEditDialog)
 */

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Loader2 } from 'lucide-react';
import { type KnowledgeFaqItem } from '@repo/shared';

export interface FaqEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  faq?: KnowledgeFaqItem | null;
  onSave: (data: {
    question: string;
    answer: string;
    similarQuestions: string[];
  }) => Promise<void>;
}

export function FaqEditDialog({
  isOpen,
  onClose,
  faq,
  onSave,
}: FaqEditDialogProps) {
  const isEditing = Boolean(faq);
  const [question, setQuestion] = React.useState('');
  const [answer, setAnswer] = React.useState('');
  const [similarQuestions, setSimilarQuestions] = React.useState<string[]>([]);
  const [similarInput, setSimilarInput] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (faq) {
      setQuestion(faq.question);
      setAnswer(faq.answer);
      setSimilarQuestions(faq.similarQuestions || []);
    } else {
      setQuestion('');
      setAnswer('');
      setSimilarQuestions([]);
    }
    setSimilarInput('');
    setError(null);
  }, [faq, isOpen]);

  const handleAddSimilar = () => {
    const trimmed = similarInput.trim();
    if (!trimmed) return;
    if (similarQuestions.includes(trimmed) || trimmed === question.trim()) {
      setError('相似问不能重复或与标准问题相同');
      return;
    }
    if (similarQuestions.length >= 20) {
      setError('最多添加 20 条相似问');
      return;
    }
    setSimilarQuestions((prev) => [...prev, trimmed]);
    setSimilarInput('');
    setError(null);
  };

  const handleKeyDownSimilar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSimilar();
    }
  };

  const handleRemoveSimilar = (indexToRemove: number) => {
    setSimilarQuestions((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    try {
      setSubmitting(true);
      setError(null);
      await onSave({
        question: cleanQ,
        answer: cleanA,
        similarQuestions,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-xl max-h-[90vh] overflow-y-auto w-[95vw]">
        <DialogHeader>
          <DialogTitle>{isEditing ? '编辑标准问答 (FAQ)' : '新建标准问答 (FAQ)'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
              {error}
            </div>
          )}

          {/* 标准问题 */}
          <div className="space-y-1.5">
            <Label htmlFor="faq-question">
              标准问题 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="faq-question"
              placeholder="例如：如何申请退款？"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              disabled={submitting}
              className="h-11"
            />
          </div>

          {/* 标准答案 */}
          <div className="space-y-1.5">
            <Label htmlFor="faq-answer">
              权威标准答案 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="faq-answer"
              placeholder="输入该问题的权威口径答案，支持纯文本或 Markdown 格式..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={5000}
              rows={5}
              disabled={submitting}
              className="resize-y min-h-[120px]"
            />
          </div>

          {/* 相似问法录入 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="faq-similar">相似问法 / 别名扩展 ({similarQuestions.length}/20)</Label>
              <span className="text-xs text-muted-foreground">输入后按回车添加</span>
            </div>

            <div className="flex gap-2">
              <Input
                id="faq-similar"
                placeholder="例如：退钱流程是什么、退货找谁..."
                value={similarInput}
                onChange={(e) => setSimilarInput(e.target.value)}
                onKeyDown={handleKeyDownSimilar}
                maxLength={500}
                disabled={submitting || similarQuestions.length >= 20}
                className="h-11 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddSimilar}
                disabled={!similarInput.trim() || submitting || similarQuestions.length >= 20}
                className="min-h-[44px] min-w-[44px] px-3 shrink-0"
              >
                <Plus className="w-4 h-4 mr-1" />
                添加
              </Button>
            </div>

            {/* 相似问列表 Tags */}
            {similarQuestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 max-h-36 overflow-y-auto">
                {similarQuestions.map((q, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="flex items-center gap-1 py-1 px-2.5 text-xs bg-muted/80 hover:bg-muted"
                  >
                    <span>{q}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSimilar(idx)}
                      disabled={submitting}
                      className="ml-1 text-muted-foreground hover:text-foreground rounded-full p-0.5 focus:outline-none"
                    >
                      <X className="w-3 h-3" />
                      <span className="sr-only">移除</span>
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[44px] min-w-[44px]"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={submitting || !question.trim() || !answer.trim()}
              className="min-h-[44px] min-w-[44px]"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? '保存修改' : '创建并向量化'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
