'use client';

/**
 * 知识库文档全文预览滑动抽屉组件 (DocumentPreviewDrawer)
 *
 * 交互契约：
 * 1. 响应式布局：桌面端呈现为右侧 Sheet 宽抽屉（占宽 ~640px），移动端呈现为全屏/底部 Drawer；
 * 2. 多格式渲染：Markdown/TXT 原生排版渲染并支持代码高亮与一键复制；PDF 展示提取章节文本并提供原件外链；
 * 3. 容错与无障碍：加载展示平滑骨架屏，错误展示中文友好重试面板；所有触控按钮热区 >= 44x44px；
 * 4. 锚点与穿梭：接收 focusedAnchor 并支持高亮定位与多切片轮播控制器。
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchWithAuth } from '@/lib/api/client';
import { CodeBlock } from '@/components/chat/code-block';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X,
  FileText,
  ExternalLink,
  Download,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Hash,
  Sparkles,
} from 'lucide-react';
import type { FocusedCitationAnchor, MatchedCitationAnchor } from '@/types/citation';

export interface DocumentPreviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBaseId: string | null;
  documentId: string | null;
  documentName?: string;
  documentVersion?: number;
  initialStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  initialErrorMessage?: string | null;
  /** 当前选中的切片锚点 */
  focusedAnchor?: FocusedCitationAnchor;
  /** 当前文档命中过的所有切片集合（用于导航器） */
  allMatchedAnchors?: MatchedCitationAnchor[];
  /** 切换高亮切片时的回调（如由 Navigator 触发） */
  onSelectAnchor?: (anchor: MatchedCitationAnchor) => void;
  /** 是否模态阻塞，默认 true；聊天页传 false 时隐藏遮罩实现非模态边看边聊 (TC02 / ADR-0025) */
  modal?: boolean;
  /** 接口 404/403 失败时的降级历史切片快照 (TC07 / CitationSnapshotFallback) */
  fallbackSnippet?: string;
  /** 外链来源 URL (ADR-0028) */
  sourceUrl?: string | null;
}

interface DocumentContentData {
  id: string;
  name: string;
  version: number;
  chunkCount: number | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  errorMessage?: string | null;
  fileType: 'markdown' | 'text' | 'pdf' | 'docx' | 'xlsx' | 'csv' | string;
  content: string;
  originalUrl?: string | null;
  sourceType?: string;
  sourceUrl?: string | null;
  chunks?: Array<{
    chunkIndex: number;
    content: string;
    headingPath?: string | null;
    pageNumber?: number | null;
  }>;
}

export function DocumentPreviewDrawer({
  open,
  onOpenChange,
  knowledgeBaseId,
  documentId,
  documentName,
  documentVersion,
  initialStatus,
  initialErrorMessage,
  focusedAnchor,
  allMatchedAnchors = [],
  onSelectAnchor,
  modal = true,
  fallbackSnippet,
  sourceUrl,
}: DocumentPreviewDrawerProps) {
  const [data, setData] = React.useState<DocumentContentData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 计算当前有效文档状态与错误提示 (US-12)
  const effectiveStatus = data?.status || initialStatus || 'ready';
  const effectiveErrorMessage = data?.errorMessage || initialErrorMessage || null;

  // 滚动容器引用与高亮节点引用
  const contentContainerRef = React.useRef<HTMLDivElement>(null);
  const highlightedRef = React.useRef<HTMLDivElement>(null);

  // 加载文档内容
  const loadContent = React.useCallback(async () => {
    if (!knowledgeBaseId || !documentId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/content`
      );
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || '加载文档内容失败');
      }

      setData(json.data);
    } catch (err: unknown) {
      console.error('[DocumentPreviewDrawer] 加载失败:', err);
      setError(err instanceof Error ? err.message : '加载文档失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId, documentId]);

  // 依赖变化时请求内容
  React.useEffect(() => {
    if (open && knowledgeBaseId && documentId) {
      loadContent();
    } else {
      setData(null);
      setError(null);
    }
  }, [open, knowledgeBaseId, documentId, loadContent]);

  // 自动滚动至高亮切片（聚焦平滑滚动）
  React.useEffect(() => {
    if (!loading && data && focusedAnchor && highlightedRef.current) {
      const timer = setTimeout(() => {
        highlightedRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [loading, data, focusedAnchor]);

  // Markdown 自定义组件：将 pre 转为可一键复制代码块，表格包裹支持横向平滑滚动与热区适配
  const markdownComponents = React.useMemo(() => {
    return {
      pre({ children }: any) {
        if (React.isValidElement(children)) {
          const codeProps: any = children.props || {};
          const className = codeProps.className || '';
          const match = /language-(\w+)/.exec(className);
          const language = match ? match[1] : 'text';
          const codeText = Array.isArray(codeProps.children)
            ? codeProps.children.join('')
            : String(codeProps.children || '');

          return (
            <CodeBlock language={language} className={className}>
              {codeText.replace(/\n$/, '')}
            </CodeBlock>
          );
        }
        return <pre>{children}</pre>;
      },
      table({ children }: any) {
        return (
          <div className="overflow-x-auto my-3 rounded-xl border border-border/60 bg-muted/10 max-w-full">
            <table className="w-full text-xs text-left border-collapse">{children}</table>
          </div>
        );
      },
      th({ children }: any) {
        return (
          <th className="px-3.5 py-2.5 bg-muted/40 font-semibold border-b border-border/60 text-foreground whitespace-nowrap">
            {children}
          </th>
        );
      },
      td({ children }: any) {
        return (
          <td className="px-3.5 py-2 border-b border-border/30 text-muted-foreground whitespace-nowrap text-xs">
            {children}
          </td>
        );
      },
    };
  }, []);

  // 计算当前高亮切片在列表中的序号
  const currentAnchorIndex = React.useMemo(() => {
    if (!focusedAnchor || allMatchedAnchors.length === 0) return -1;
    return allMatchedAnchors.findIndex((a) => a.chunkIndex === focusedAnchor.chunkIndex);
  }, [focusedAnchor, allMatchedAnchors]);

  // 处理跨切片穿梭跳转
  const handleNavigateAnchor = (direction: 'prev' | 'next') => {
    if (allMatchedAnchors.length === 0 || !onSelectAnchor) return;

    let targetIdx = direction === 'next' ? currentAnchorIndex + 1 : currentAnchorIndex - 1;
    if (targetIdx < 0) targetIdx = allMatchedAnchors.length - 1;
    if (targetIdx >= allMatchedAnchors.length) targetIdx = 0;

    const targetAnchor = allMatchedAnchors[targetIdx];
    if (targetAnchor) {
      onSelectAnchor(targetAnchor);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogContent
        data-testid="document-preview-drawer-content"
        showClose={false}
        contentAnimation="none"
        hideOverlay={!modal}
        overlayClassName={modal ? 'bg-black/40 backdrop-blur-sm' : 'hidden pointer-events-none'}
        className="!fixed !left-auto !right-0 !top-0 !translate-x-0 !translate-y-0 h-full w-full sm:w-[600px] lg:w-[680px] max-w-full p-0 gap-0 border-l border-border/70 bg-card shadow-2xl flex flex-col z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300 rounded-none sm:rounded-l-2xl overflow-hidden"
      >
        {/* 抽屉头部 */}
        <DialogHeader className="p-4 sm:p-5 border-b border-border/50 bg-muted/20 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground truncate">
                  {data?.name || documentName || '文档全文预览'}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 flex items-center flex-wrap gap-2">
                  <span>版本: v{data?.version ?? documentVersion ?? 1}</span>
                  {data?.chunkCount != null && (
                    <>
                      <span>•</span>
                      <span>{data.chunkCount} 个切片</span>
                    </>
                  )}
                  {data?.fileType && (
                    <>
                      <span>•</span>
                      <span className="uppercase font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted">
                        {data.fileType}
                      </span>
                    </>
                  )}
                  {effectiveStatus !== 'ready' && (
                    <>
                      <span>•</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          effectiveStatus === 'failed'
                            ? 'bg-destructive/15 text-destructive'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {effectiveStatus === 'failed' ? '失败' : '索引中'}
                      </span>
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>

            {/* 右上角操作区：PDF原版链接、网页跳转原文与关闭按钮 */}
            <div className="flex items-center space-x-1.5 shrink-0">
              {(data?.sourceUrl || sourceUrl) && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="min-h-[44px] px-3 rounded-xl text-xs gap-1.5 flex items-center text-primary hover:text-primary"
                >
                  <a
                    href={(data?.sourceUrl || sourceUrl) as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="document-source-link"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">跳转原文</span>
                  </a>
                </Button>
              )}

              {data?.originalUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="min-h-[44px] px-3 rounded-xl text-xs gap-1.5 flex items-center"
                >
                  <a
                    href={data.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    data-testid="document-download-link"
                  >
                    {data.fileType === 'pdf' ? (
                      <>
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">查看原版 PDF</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">下载原文件</span>
                      </>
                    )}
                  </a>
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                aria-label="关闭预览"
                className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* 跨切片导航控制器 (ChunkNavigator) */}
          {allMatchedAnchors.length > 0 && (
            <div className="mt-3.5 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 text-primary font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  命中切片 {currentAnchorIndex >= 0 ? currentAnchorIndex + 1 : 1} / {allMatchedAnchors.length}
                </span>
                {focusedAnchor?.headingPath && (
                  <span className="text-muted-foreground text-[11px] truncate max-w-[200px]">
                    ({focusedAnchor.headingPath})
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNavigateAnchor('prev')}
                  disabled={allMatchedAnchors.length <= 1}
                  className="min-h-[44px] px-3.5 rounded-xl text-xs flex items-center"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                  <span>上一个</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNavigateAnchor('next')}
                  disabled={allMatchedAnchors.length <= 1}
                  className="min-h-[44px] px-3.5 rounded-xl text-xs flex items-center"
                >
                  <span>下一个</span>
                  <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* 抽屉正文内容主视口 */}
        <div
          ref={contentContainerRef}
          className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar bg-card/60"
        >
          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-8 w-2/3 rounded-xl" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-5/6 rounded-md" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-4 w-4/5 rounded-md" />
            </div>
          )}

          {error && !loading && (
            fallbackSnippet ? (
              <div data-testid="citation-snapshot-fallback" className="p-4 sm:p-5 space-y-4">
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 space-y-1">
                  <div className="flex items-center space-x-2 font-medium text-xs sm:text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>源文档已被删除或更新</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    原文档可能已被知识库维护者移除或重命名，当前为您呈现问答时保存的切片快照内容：
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2">
                  <div className="flex items-center space-x-1.5 text-xs text-muted-foreground">
                    <Hash className="w-3.5 h-3.5 text-primary" />
                    <span>历史引用切片快照</span>
                    {focusedAnchor?.headingPath && <span>· {focusedAnchor.headingPath}</span>}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm text-foreground/90">
                    {fallbackSnippet}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadContent}
                  className="min-h-[44px] rounded-xl text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  <span>重新加载</span>
                </Button>
              </div>
            )
          )}

          {/* 文档处理中或失败状态面板 (US-12) */}
          {!loading && !error && effectiveStatus !== 'ready' && (
            <div className="p-8 text-center flex flex-col items-center justify-center space-y-4">
              {effectiveStatus === 'failed' ? (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-destructive">文档解析或切片失败</h4>
                    <p className="text-xs text-muted-foreground max-w-sm break-words">
                      {effectiveErrorMessage || '文档解析或向量化处理异常，请检查文件编码或格式后重新上传'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center animate-pulse">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground">文档正在切片索引中</h4>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      该文档正在后台进行智能切片与向量化构建，处理完成后即可查阅完整排版并定位切片。
                    </p>
                  </div>
                  <div className="w-full max-w-xs space-y-2 pt-2">
                    <Skeleton className="h-4 w-full rounded-md" />
                    <Skeleton className="h-4 w-4/5 rounded-md mx-auto" />
                  </div>
                </>
              )}
            </div>
          )}

          {!loading && !error && effectiveStatus === 'ready' && data && (
            <div className="max-w-none text-foreground/90 text-sm leading-relaxed space-y-4">
              {/* PDF 格式切片分段渲染 */}
              {data.fileType === 'pdf' && data.chunks && data.chunks.length > 0 ? (
                <div className="space-y-4">
                  {data.chunks.map((c) => {
                    const isMatched = focusedAnchor?.chunkIndex === c.chunkIndex;
                    return (
                      <div
                        key={`pdf_chk_${c.chunkIndex}`}
                        ref={isMatched ? highlightedRef : undefined}
                        data-chunk-index={c.chunkIndex}
                        className={`p-4 rounded-xl border transition-all ${
                          isMatched
                            ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40'
                            : 'bg-muted/10 border-border/50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-2 border-b border-border/30 mb-2">
                          <span className="flex items-center space-x-1 font-medium text-foreground">
                            <Hash className="w-3 h-3 text-primary" />
                            <span>切片 #{c.chunkIndex + 1}</span>
                            {c.headingPath && <span>· {c.headingPath}</span>}
                          </span>
                          {c.pageNumber !== null && <span>P{c.pageNumber}</span>}
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                          {c.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : data.chunks && data.chunks.length > 0 ? (
                /* Markdown / TXT 分块切片渲染并支持定位与高亮联动 (Spec 契约) */
                <div className="space-y-4">
                  {data.chunks.map((c) => {
                    const isMatched = focusedAnchor?.chunkIndex === c.chunkIndex;
                    return (
                      <div
                        key={`md_chk_${c.chunkIndex}`}
                        ref={isMatched ? highlightedRef : undefined}
                        data-chunk-index={c.chunkIndex}
                        className={`p-4 rounded-xl border transition-all ${
                          isMatched
                            ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40'
                            : 'bg-muted/10 border-border/50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-2 border-b border-border/30 mb-2">
                          <span className="flex items-center space-x-1 font-medium text-foreground">
                            <Hash className="w-3 h-3 text-primary" />
                            <span>切片 #{c.chunkIndex + 1}</span>
                            {c.headingPath && <span>· {c.headingPath}</span>}
                          </span>
                          {c.pageNumber !== null && <span>P{c.pageNumber}</span>}
                        </div>
                        <div className="prose dark:prose-invert max-w-none text-foreground/90 text-sm leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {c.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* 兜底：纯正文 Markdown 渲染 */
                <div className="prose dark:prose-invert max-w-none text-foreground/90 text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {data.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
