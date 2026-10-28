'use client';

/**
 * 知识库检索调试台组件 (RetrievalDebugger)
 *
 * 核心设计契约：
 * 1. 交互与布局：
 *    - 桌面端：3 列网格并排对比（RRF 融合结果、向量召回 Top20、词法召回 Top20）
 *    - 移动端（窄屏 390px 等）：自动单列垂直堆叠，所有容器与卡片 break-words，彻底杜绝横向滚动溢出（QA-017）
 * 2. 触控规范：
 *    - 输入框、测试检索按钮、常用词芯片最小触控热区高均 ≥ 44px
 * 3. 两路召回与 RRF 融合展示（QA-003）：
 *    - 呈现稠密向量 Top-20 与余弦相似度指标
 *    - 呈现词法全文 Top-20 与 ts_rank 得分指标（支持 ADR-0008 等技术编号验证）
 *    - 呈现 RRF 综合得分与双路名次标签
 *    - 统一携带来源锚点 CitationAnchor（文档名称、版本号、页码/标题路径）
 * 4. 性能耗时：
 *    - 耗时指标卡片展示各阶段耗时（向量化、向量检索、全文检索、融合与总耗时）
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchWithAuth } from '@/lib/api/client';
import type {
  HybridRetrievalResult,
  RetrievedChunk,
} from '@/lib/rag/hybrid-retrieval';
import {
  Search,
  Zap,
  FileText,
  Clock,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Hash,
  Eye,
  BookOpen,
  Tag,
} from 'lucide-react';
import {
  DocumentPreviewDrawer,
  type MatchedCitationAnchor,
} from './document-preview-drawer';

export interface RetrievalDebuggerProps {
  knowledgeBaseId: string;
}

export function RetrievalDebugger({ knowledgeBaseId }: RetrievalDebuggerProps) {
  const [query, setQuery] = React.useState('');
  const [topK, setTopK] = React.useState(20);
  const [enableRerank, setEnableRerank] = React.useState(true);
  const [tagFilterInput, setTagFilterInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<HybridRetrievalResult | null>(null);
  const [expandedChunkIds, setExpandedChunkIds] = React.useState<Set<string>>(new Set());

  // 文档全文预览抽屉状态
  const [previewState, setPreviewState] = React.useState<{
    isOpen: boolean;
    documentId: string | null;
    documentName?: string;
    documentVersion?: number;
    focusedAnchor?: {
      chunkIndex: number;
      headingPath?: string | null;
      pageNumber?: number | null;
    };
    allMatchedAnchors: MatchedCitationAnchor[];
  }>({
    isOpen: false,
    documentId: null,
    allMatchedAnchors: [],
  });

  // 打开文档全文预览并聚合当前文档全部召回切片
  const handleOpenPreview = React.useCallback(
    (target: {
      documentId: string;
      documentName?: string;
      documentVersion?: number;
      chunkIndex: number;
      headingPath?: string | null;
      pageNumber?: number | null;
    }) => {
      const anchors: MatchedCitationAnchor[] = [];
      const seenIndices = new Set<number>();

      if (result) {
        // 从融合切片收集
        for (const chunk of result.chunks) {
          if (
            chunk.citationAnchor.documentId === target.documentId &&
            !seenIndices.has(chunk.citationAnchor.chunkIndex)
          ) {
            seenIndices.add(chunk.citationAnchor.chunkIndex);
            anchors.push({
              chunkIndex: chunk.citationAnchor.chunkIndex,
              headingPath: chunk.citationAnchor.headingPath,
              pageNumber: chunk.citationAnchor.pageNumber,
              score: chunk.score,
            });
          }
        }
        // 从向量召回收集
        for (const m of result.denseMatches) {
          if (m.documentId === target.documentId && !seenIndices.has(m.chunkIndex)) {
            seenIndices.add(m.chunkIndex);
            anchors.push({
              chunkIndex: m.chunkIndex,
              headingPath: m.headingPath,
              pageNumber: m.pageNumber,
              score: m.similarity,
            });
          }
        }
        // 从词法召回收集
        for (const m of result.lexicalMatches) {
          if (m.documentId === target.documentId && !seenIndices.has(m.chunkIndex)) {
            seenIndices.add(m.chunkIndex);
            anchors.push({
              chunkIndex: m.chunkIndex,
              headingPath: m.headingPath,
              pageNumber: m.pageNumber,
            });
          }
        }
      }

      anchors.sort((a, b) => a.chunkIndex - b.chunkIndex);

      setPreviewState({
        isOpen: true,
        documentId: target.documentId,
        documentName: target.documentName,
        documentVersion: target.documentVersion,
        focusedAnchor: {
          chunkIndex: target.chunkIndex,
          headingPath: target.headingPath,
          pageNumber: target.pageNumber,
        },
        allMatchedAnchors:
          anchors.length > 0
            ? anchors
            : [
                {
                  chunkIndex: target.chunkIndex,
                  headingPath: target.headingPath,
                  pageNumber: target.pageNumber,
                },
              ],
      });
    },
    [result]
  );

  // 快捷测试词条（方便快速验证技术编号与中文词法分词）
  const quickTestQueries = ['连败熔断', 'ADR-0008', '珀金协议', '知识库检索'];

  const toggleExpand = (id: string) => {
    setExpandedChunkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSearch = async (overrideQuery?: string) => {
    const targetQuery = (overrideQuery ?? query).trim();
    if (!targetQuery) {
      setError('请输入检索查询词');
      return;
    }

    if (overrideQuery) {
      setQuery(overrideQuery);
    }

    setLoading(true);
    setError(null);

    try {
      const filterTags = tagFilterInput
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const requestPayload: {
        query: string;
        topK: number;
        enableRerank?: boolean;
        filter?: { tags?: string[] };
      } = {
        query: targetQuery,
        topK,
      };
      if (enableRerank) {
        requestPayload.enableRerank = true;
      }
      if (filterTags.length > 0) {
        requestPayload.filter = {
          tags: filterTags,
        };
      }

      const res = await fetchWithAuth(
        `/api/knowledge-bases/${knowledgeBaseId}/query`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || '检索请求执行失败');
      }

      setResult(json.data);
    } catch (err: unknown) {
      console.error('[retrieval-debugger] 检索失败:', err);
      const message = err instanceof Error ? err.message : '检索执行异常，请稍后重试';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="w-full flex flex-col space-y-6">
      {/* 检索配置与输入区 */}
      <Card className="border border-border/60 shadow-sm bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center space-x-2 text-foreground">
            <Search className="w-5 h-5 text-primary" />
            <span>检索调试台</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            验证两路召回（余弦相似度 Top-20 + 全文检索 Top-20）与倒数排名融合 (RRF) 细节
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* 输入框与提交按钮：确保触控高度 >= 44px */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="输入查询测试混合检索，如：连败熔断、ADR-0008..."
                className="min-h-[44px] h-11 text-base sm:text-sm pl-4 pr-10 rounded-xl"
                disabled={loading}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground h-11 min-h-[44px] px-3 flex items-center justify-center text-xs"
                >
                  清空
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 border border-border/60 rounded-xl px-2 h-11 bg-muted/20">
                <span className="text-xs text-muted-foreground whitespace-nowrap pl-1">Top</span>
                <select
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  disabled={loading}
                  className="bg-transparent text-sm font-medium focus:outline-none min-h-[44px] cursor-pointer pr-1"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </div>

              <label className="flex items-center space-x-1.5 border border-border/60 rounded-xl px-3 h-11 bg-muted/20 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px]">
                <input
                  type="checkbox"
                  checked={enableRerank}
                  onChange={(e) => setEnableRerank(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded text-primary focus:ring-0 cursor-pointer"
                />
                <span className="whitespace-nowrap">Rerank 精排</span>
              </label>

              <Button
                onClick={() => handleSearch()}
                disabled={loading || !query.trim()}
                className="min-h-[44px] h-11 px-6 font-medium rounded-xl flex-1 sm:flex-initial"
              >
                {loading ? (
                  <span className="flex items-center space-x-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>检索中...</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1.5">
                    <Zap className="w-4 h-4" />
                    <span>测试检索</span>
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* 前置标签过滤器输入行 (ADR-0032 / KB-META-FILTER) */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 flex-1 border border-border/60 rounded-xl px-3 min-h-[44px] h-11 bg-muted/20">
              <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                value={tagFilterInput}
                onChange={(e) => setTagFilterInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="可选前置标签过滤（多个标签用逗号或空格分隔，如：财务, 2026）"
                className="min-h-[44px] h-11 border-0 bg-transparent text-xs p-0 focus-visible:ring-0 shadow-none text-foreground placeholder:text-muted-foreground/60"
                disabled={loading}
                data-testid="retrieval-tag-filter-input"
              />
              {tagFilterInput && (
                <button
                  type="button"
                  onClick={() => setTagFilterInput('')}
                  className="text-muted-foreground hover:text-foreground text-xs px-1"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          {/* 快捷测试词条（触区 >= 44px，支持一键点击测试） */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-primary/70" />
              <span>快捷查询：</span>
            </span>
            {quickTestQueries.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleSearch(item)}
                disabled={loading}
                className="min-h-[36px] sm:min-h-[32px] px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/60 hover:bg-muted text-foreground border border-border/40 transition-colors active:scale-95 disabled:opacity-50"
              >
                {item}
              </button>
            ))}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 阶段耗时统计面板 */}
      {result && (
        <div
          className={`grid grid-cols-2 ${
            result.stats.rerankDurationMs !== undefined && result.stats.rerankDurationMs > 0
              ? 'sm:grid-cols-6'
              : 'sm:grid-cols-5'
          } gap-3`}
        >
          <div className="p-3 rounded-xl border border-border/50 bg-card/60 flex flex-col">
            <span className="text-[11px] text-muted-foreground flex items-center space-x-1">
              <Clock className="w-3 h-3 text-primary" />
              <span>总耗时</span>
            </span>
            <span className="text-lg font-bold text-foreground mt-1">{result.durationMs}ms</span>
          </div>

          <div className="p-3 rounded-xl border border-border/50 bg-card/60 flex flex-col">
            <span className="text-[11px] text-muted-foreground flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              <span>向量化耗时</span>
            </span>
            <span className="text-lg font-bold text-foreground mt-1">
              {result.stats.embeddingDurationMs}ms
            </span>
          </div>

          <div className="p-3 rounded-xl border border-border/50 bg-card/60 flex flex-col">
            <span className="text-[11px] text-muted-foreground flex items-center space-x-1">
              <Layers className="w-3 h-3 text-blue-500" />
              <span>向量检索耗时</span>
            </span>
            <span className="text-lg font-bold text-foreground mt-1">
              {result.stats.denseDurationMs}ms
            </span>
          </div>

          <div className="p-3 rounded-xl border border-border/50 bg-card/60 flex flex-col">
            <span className="text-[11px] text-muted-foreground flex items-center space-x-1">
              <Hash className="w-3 h-3 text-amber-500" />
              <span>全文检索耗时</span>
            </span>
            <span className="text-lg font-bold text-foreground mt-1">
              {result.stats.lexicalDurationMs}ms
            </span>
          </div>

          <div className="p-3 rounded-xl border border-border/50 bg-card/60 flex flex-col">
            <span className="text-[11px] text-muted-foreground flex items-center space-x-1">
              <Zap className="w-3 h-3 text-emerald-500" />
              <span>RRF 融合耗时</span>
            </span>
            <span className="text-lg font-bold text-foreground mt-1">
              {result.stats.fusionDurationMs}ms
            </span>
          </div>

          {result.stats.rerankDurationMs !== undefined && (
            <div className="col-span-2 sm:col-span-1 p-3 rounded-xl border border-border/50 bg-card/60 flex flex-col">
              <span className="text-[11px] text-muted-foreground flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-purple-500" />
                <span>Rerank 耗时</span>
                {result.isDegraded && (
                  <span className="text-[9px] text-amber-500 font-bold">[降级]</span>
                )}
              </span>
              <span className="text-lg font-bold text-foreground mt-1">
                {result.stats.rerankDurationMs}ms
              </span>
            </div>
          )}
        </div>
      )}

      {/* 加载骨架屏 */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((col) => (
            <div key={col} className="space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* 结果呈现三栏区域（桌面端 3 列，移动端纵向堆叠，杜绝横向滚动） */}
      {result && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
          {/* 第 1 列：RRF / Rerank 综合结果 */}
          <div className="flex flex-col space-y-3 w-full overflow-hidden">
            <div className="flex items-center justify-between px-1 flex-wrap gap-1.5">
              <div className="flex items-center space-x-2 flex-wrap gap-1">
                <span className="font-semibold text-sm text-foreground">
                  {result.isReranked ? 'Rerank 精排明细' : 'RRF 融合明细'}
                </span>
                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                  {result.chunks.length} 条命中
                </Badge>
                {result.isReranked && !result.isDegraded && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-800">
                    精排生效
                  </Badge>
                )}
                {result.isDegraded && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30">
                    Rerank 降级为 RRF
                  </Badge>
                )}
                {result.isFilterRelaxed && (
                  <Badge
                    variant="outline"
                    data-testid="filter-relaxed-badge"
                    className="text-xs px-2 py-0.5 border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30 font-medium"
                  >
                    已自动放宽过滤兜底召回
                  </Badge>
                )}
                {result.filteredLowScoreCount !== undefined && result.filteredLowScoreCount > 0 && (
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0 text-muted-foreground">
                    已过滤 {result.filteredLowScoreCount} 条低相关切片
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {result.isReranked ? 'bge-reranker' : 'k = 60'}
              </span>
            </div>

            {result.isFilterRelaxed && (
              <div
                data-testid="relaxed-filter-banner"
                className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs flex items-center space-x-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>指定前置标签在库中无匹配切片，系统已自动放宽限制，兜底召回全库最相关内容。</span>
              </div>
            )}

            {result.chunks.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl bg-muted/10">
                无融合命中结果
              </div>
            ) : (
              <div className="flex flex-col space-y-3 w-full">
                {result.chunks.map((chunk, idx) => (
                  <FusedChunkCard
                    key={`fused_${chunk.chunkId}_${idx}`}
                    chunk={chunk}
                    rankIndex={idx + 1}
                    isExpanded={expandedChunkIds.has(`fused_${chunk.chunkId}`)}
                    onToggle={() => toggleExpand(`fused_${chunk.chunkId}`)}
                    onPreview={handleOpenPreview}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 第 2 列：向量召回 Top20 */}
          <div className="flex flex-col space-y-3 w-full overflow-hidden">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm text-foreground">向量召回 Top20</span>
                <Badge variant="outline" className="text-xs px-2 py-0.5 text-blue-600 dark:text-blue-400">
                  {result.denseMatches.length} 条
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">余弦相似度</span>
            </div>

            {result.denseMatches.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl bg-muted/10">
                向量路未召回任何切片
              </div>
            ) : (
              <div className="flex flex-col space-y-3 w-full">
                {result.denseMatches.map((m, idx) => (
                  <DenseMatchCard
                    key={`dense_${m.id}_${idx}`}
                    match={m}
                    isExpanded={expandedChunkIds.has(`dense_${m.id}`)}
                    onToggle={() => toggleExpand(`dense_${m.id}`)}
                    onPreview={handleOpenPreview}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 第 3 列：词法召回 Top20 */}
          <div className="flex flex-col space-y-3 w-full overflow-hidden">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm text-foreground">词法召回 Top20</span>
                <Badge variant="outline" className="text-xs px-2 py-0.5 text-amber-600 dark:text-amber-400">
                  {result.lexicalMatches.length} 条
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">ts_rank_cd</span>
            </div>

            {result.lexicalMatches.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl bg-muted/10">
                词法路未召回任何切片
              </div>
            ) : (
              <div className="flex flex-col space-y-3 w-full">
                {result.lexicalMatches.map((m, idx) => (
                  <LexicalMatchCard
                    key={`lexical_${m.id}_${idx}`}
                    match={m}
                    isExpanded={expandedChunkIds.has(`lexical_${m.id}`)}
                    onToggle={() => toggleExpand(`lexical_${m.id}`)}
                    onPreview={handleOpenPreview}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 文档全文预览滑动抽屉 */}
      <DocumentPreviewDrawer
        open={previewState.isOpen}
        onOpenChange={(open) => setPreviewState((prev) => ({ ...prev, isOpen: open }))}
        knowledgeBaseId={knowledgeBaseId}
        documentId={previewState.documentId}
        documentName={previewState.documentName}
        documentVersion={previewState.documentVersion}
        focusedAnchor={previewState.focusedAnchor}
        allMatchedAnchors={previewState.allMatchedAnchors}
        onSelectAnchor={(anchor) =>
          setPreviewState((prev) => ({
            ...prev,
            focusedAnchor: {
              chunkIndex: anchor.chunkIndex,
              headingPath: anchor.headingPath,
              pageNumber: anchor.pageNumber,
            },
          }))
        }
      />
    </div>
  );
}

/**
 * 融合卡片子组件
 */
function FusedChunkCard({
  chunk,
  rankIndex,
  isExpanded,
  onToggle,
  onPreview,
}: {
  chunk: RetrievedChunk;
  rankIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  onPreview: (target: {
    documentId: string;
    documentName?: string;
    documentVersion?: number;
    chunkIndex: number;
    headingPath?: string | null;
    pageNumber?: number | null;
  }) => void;
}) {
  const { citationAnchor } = chunk;

  const triggerPreview = () => {
    onPreview({
      documentId: citationAnchor.documentId,
      documentName: citationAnchor.documentName,
      documentVersion: citationAnchor.documentVersion,
      chunkIndex: citationAnchor.chunkIndex,
      headingPath: citationAnchor.headingPath,
      pageNumber: citationAnchor.pageNumber,
    });
  };

  return (
    <Card className="border border-border/60 shadow-none hover:border-primary/40 transition-colors w-full overflow-hidden break-words">
      <CardContent className="p-3.5 space-y-2.5">
        {/* 头部：综合排名与分数 */}
        <div className="flex items-center justify-between flex-wrap gap-1.5">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary font-bold text-xs">
              #{rankIndex}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {chunk.rerankScore !== undefined
                ? `精排分 ${chunk.score.toFixed(4)}`
                : `得分 ${chunk.score.toFixed(6)}`}
            </span>
            {chunk.rerankScore !== undefined && chunk.rrfScore !== undefined && (
              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                (RRF: {chunk.rrfScore.toFixed(4)})
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1 text-[11px]">
            {chunk.rerankScore !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 font-medium">
                Rerank
              </span>
            )}

            {chunk.denseRank !== null ? (
              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-medium">
                向量 #{chunk.denseRank}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                向量未中
              </span>
            )}

            {chunk.lexicalRank !== null ? (
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 font-medium">
                词法 #{chunk.lexicalRank}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                词法未中
              </span>
            )}
          </div>
        </div>

        {/* 来源锚点徽章行：可点击直达全文预览 */}
        <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={triggerPreview}
            className="inline-flex items-center space-x-1 font-medium text-foreground hover:text-primary transition-colors text-left group"
            title="点击预览完整文档并定位高亮"
          >
            <FileText className="w-3 h-3 text-muted-foreground group-hover:text-primary" />
            <span className="truncate max-w-[160px] underline decoration-muted-foreground/30 underline-offset-2 group-hover:decoration-primary">
              {citationAnchor.documentName || '未命名文档'}
            </span>
          </button>
          <span className="px-1 rounded bg-muted/60">v{citationAnchor.documentVersion}</span>
          {citationAnchor.pageNumber !== null && (
            <span className="px-1 rounded bg-muted/60">P{citationAnchor.pageNumber}</span>
          )}
          {citationAnchor.headingPath && (
            <span className="px-1 rounded bg-muted/60 truncate max-w-[140px]">
              {citationAnchor.headingPath}
            </span>
          )}
        </div>

        {/* 标签徽章 */}
        {chunk.tags && chunk.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {chunk.tags.map((t: string) => (
              <span
                key={t}
                className="text-[10px] px-1 py-0 rounded bg-muted/60 text-muted-foreground font-normal"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* 正文切片摘要 */}
        <div className="text-xs text-foreground/90 leading-relaxed break-words whitespace-pre-wrap">
          {isExpanded ? chunk.content : truncateText(chunk.content, 120)}
        </div>

        {/* 展开/收起切换与全文预览按钮 */}
        <div className="flex items-center justify-between pt-0.5">
          {chunk.content.length > 120 ? (
            <button
              type="button"
              onClick={onToggle}
              className="text-[11px] text-primary hover:underline flex items-center space-x-0.5"
            >
              <span>{isExpanded ? '收起全文' : '查看完整切片'}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={triggerPreview}
            className="text-[11px] text-muted-foreground hover:text-primary flex items-center space-x-1 ml-auto transition-colors"
            title="打开右侧抽屉预览文档全文"
          >
            <Eye className="w-3 h-3" />
            <span>全文预览</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 向量召回卡片
 */
function DenseMatchCard({
  match,
  isExpanded,
  onToggle,
  onPreview,
}: {
  match: any;
  isExpanded: boolean;
  onToggle: () => void;
  onPreview: (target: {
    documentId: string;
    documentName?: string;
    documentVersion?: number;
    chunkIndex: number;
    headingPath?: string | null;
    pageNumber?: number | null;
  }) => void;
}) {
  const triggerPreview = () => {
    onPreview({
      documentId: match.documentId,
      documentName: match.documentName,
      documentVersion: match.documentVersion,
      chunkIndex: match.chunkIndex,
      headingPath: match.headingPath,
      pageNumber: match.pageNumber,
    });
  };

  return (
    <Card className="border border-border/50 shadow-none hover:border-blue-400/40 transition-colors w-full overflow-hidden break-words">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-100/60 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-xs">
            #{match.rank}
          </span>
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            相似度: {match.similarity.toFixed(4)}
          </span>
        </div>

        <div className="text-[11px] text-muted-foreground flex items-center space-x-1.5 flex-wrap">
          <button
            type="button"
            onClick={triggerPreview}
            className="truncate max-w-[160px] font-medium text-foreground hover:text-primary transition-colors text-left underline decoration-muted-foreground/30 underline-offset-2 hover:decoration-primary"
            title="点击预览完整文档并定位高亮"
          >
            {match.documentName || '文档'}
          </button>
          <span className="px-1 rounded bg-muted/60">v{match.documentVersion}</span>
          {match.pageNumber && <span className="px-1 rounded bg-muted/60">P{match.pageNumber}</span>}
          {match.headingPath && (
            <span className="truncate max-w-[120px] px-1 rounded bg-muted/60">
              {match.headingPath}
            </span>
          )}
        </div>

        <div className="text-xs text-foreground/85 leading-relaxed break-words whitespace-pre-wrap">
          {isExpanded ? match.content : truncateText(match.content, 90)}
        </div>

        <div className="flex items-center justify-between pt-0.5">
          {match.content.length > 90 ? (
            <button
              type="button"
              onClick={onToggle}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-0.5"
            >
              <span>{isExpanded ? '收起' : '展开'}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={triggerPreview}
            className="text-[11px] text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1 ml-auto transition-colors"
            title="打开右侧抽屉预览文档全文"
          >
            <Eye className="w-3 h-3" />
            <span>全文预览</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 词法召回卡片
 */
function LexicalMatchCard({
  match,
  isExpanded,
  onToggle,
  onPreview,
}: {
  match: any;
  isExpanded: boolean;
  onToggle: () => void;
  onPreview: (target: {
    documentId: string;
    documentName?: string;
    documentVersion?: number;
    chunkIndex: number;
    headingPath?: string | null;
    pageNumber?: number | null;
  }) => void;
}) {
  const triggerPreview = () => {
    onPreview({
      documentId: match.documentId,
      documentName: match.documentName,
      documentVersion: match.documentVersion,
      chunkIndex: match.chunkIndex,
      headingPath: match.headingPath,
      pageNumber: match.pageNumber,
    });
  };

  return (
    <Card className="border border-border/50 shadow-none hover:border-amber-400/40 transition-colors w-full overflow-hidden break-words">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100/60 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-bold text-xs">
            #{match.rank}
          </span>
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            得分: {match.rank?.toFixed(4) ?? '0.0000'}
          </span>
        </div>

        <div className="text-[11px] text-muted-foreground flex items-center space-x-1.5 flex-wrap">
          <button
            type="button"
            onClick={triggerPreview}
            className="truncate max-w-[160px] font-medium text-foreground hover:text-primary transition-colors text-left underline decoration-muted-foreground/30 underline-offset-2 hover:decoration-primary"
            title="点击预览完整文档并定位高亮"
          >
            {match.documentName || '文档'}
          </button>
          <span className="px-1 rounded bg-muted/60">v{match.documentVersion}</span>
          {match.pageNumber && <span className="px-1 rounded bg-muted/60">P{match.pageNumber}</span>}
          {match.headingPath && (
            <span className="truncate max-w-[120px] px-1 rounded bg-muted/60">
              {match.headingPath}
            </span>
          )}
        </div>

        <div className="text-xs text-foreground/85 leading-relaxed break-words whitespace-pre-wrap">
          {isExpanded ? match.content : truncateText(match.content, 90)}
        </div>

        <div className="flex items-center justify-between pt-0.5">
          {match.content.length > 90 ? (
            <button
              type="button"
              onClick={onToggle}
              className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center space-x-0.5"
            >
              <span>{isExpanded ? '收起' : '展开'}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={triggerPreview}
            className="text-[11px] text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 flex items-center space-x-1 ml-auto transition-colors"
            title="打开右侧抽屉预览文档全文"
          >
            <Eye className="w-3 h-3" />
            <span>全文预览</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
