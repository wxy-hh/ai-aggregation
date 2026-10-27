'use client';

/**
 * 网页 URL 与微信文章批量录入对话框组件 (UrlImportDialog)
 *
 * 核心交互契约 (ADR-0028):
 * 1. 批量输入：支持 Textarea 换行粘贴多条网址（1~10 条）
 * 2. 实时识别：即时统计合法 URL 数量，微信公众号文章（mp.weixin.qq.com）显示专属高亮徽章
 * 3. 安全防护：实时调用 validateUrlLiteral 进行基础协议与内网字面量筛查
 * 4. 移动端优先：所有按钮与输入触控热区均 >= 44x44px，移动端宽度自适应
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/api/client';
import { validateUrlLiteral } from '@repo/shared';
import { Globe, Link as LinkIcon, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export interface UrlImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBaseId: string;
  onSuccess: () => void;
}

export function UrlImportDialog({
  open,
  onOpenChange,
  knowledgeBaseId,
  onSuccess,
}: UrlImportDialogProps) {
  const [text, setText] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 解析当前输入的每行 URL 并进行实时校验
  const parsedUrls = React.useMemo(() => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const validUrls: string[] = [];
    const invalidLines: string[] = [];
    let wechatCount = 0;

    for (const line of lines) {
      const guard = validateUrlLiteral(line);
      if (guard.ok) {
        validUrls.push(line);
        if (guard.hostname.toLowerCase() === 'mp.weixin.qq.com') {
          wechatCount += 1;
        }
      } else {
        invalidLines.push(line);
      }
    }

    return {
      totalLines: lines.length,
      validUrls,
      invalidLines,
      wechatCount,
    };
  }, [text]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedUrls.validUrls.length === 0) {
      setError('请至少输入一个合法的 HTTP/HTTPS 网址');
      return;
    }

    if (parsedUrls.validUrls.length > 10) {
      setError('单次最多允许导入 10 个网址，请分批提交');
      return;
    }

    if (parsedUrls.invalidLines.length > 0) {
      setError(`存在无法解析或不合规的网址（如 ${parsedUrls.invalidLines[0]}），请检查后重试`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithAuth(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: parsedUrls.validUrls }),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || '导入网页失败');
      }

      // 重置并通知成功
      setText('');
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg font-bold flex items-center space-x-2">
            <Globe className="w-5 h-5 text-primary shrink-0" />
            <span>一键导入网页 / 微信文章</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            支持粘贴微信公众号深度长文、官方技术开发文档与博客。系统将自动抓取、剥离广告并转换为纯净切片。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                网页链接列表（每行一个网址，单次最多 10 个） <span className="text-destructive">*</span>
              </label>
              <span className="text-[11px] text-muted-foreground">
                已识别: <strong className="text-foreground">{parsedUrls.validUrls.length}</strong> / 10
              </span>
            </div>

            <Textarea
              placeholder={`https://mp.weixin.qq.com/s/...\nhttps://react.dev/reference/react\nhttps://developer.mozilla.org/...`}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
              rows={5}
              disabled={submitting}
              className="text-xs font-mono leading-relaxed rounded-xl p-3 resize-none custom-scrollbar min-h-[110px]"
              autoFocus
            />
          </div>

          {/* 实时识别统计与提示条 */}
          {parsedUrls.totalLines > 0 && (
            <div data-testid="url-import-stats" className="bg-muted/40 rounded-xl p-3 space-y-2 border border-border/40 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-muted-foreground">
                    已识别 <strong className="text-foreground">{parsedUrls.validUrls.length}</strong> 个有效网址
                  </span>
                </div>

                {parsedUrls.wechatCount > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                    微信文章 × {parsedUrls.wechatCount}
                  </Badge>
                )}
              </div>

              {parsedUrls.invalidLines.length > 0 && (
                <div className="flex items-start space-x-1.5 text-destructive text-[11px] pt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    发现 {parsedUrls.invalidLines.length} 行无效或不支持的网址格式（如内网地址或缺少协议）
                  </span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start space-x-2 text-destructive bg-destructive/10 p-3 rounded-xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words flex-1">{error}</span>
            </div>
          )}

          <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="min-h-[44px] rounded-xl text-xs w-full sm:w-auto"
            >
              取消
            </Button>
            <Button
              type="submit"
              data-testid="url-import-submit-btn"
              disabled={submitting || parsedUrls.validUrls.length === 0}
              className="min-h-[44px] rounded-xl text-xs font-semibold w-full sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span>正在提交抓取任务...</span>
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 mr-1.5" />
                  <span>开始抓取入库 ({parsedUrls.validUrls.length})</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
