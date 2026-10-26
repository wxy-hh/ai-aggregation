'use client';

import React, { useState, useMemo } from 'react';
import { BookOpen, ChevronDown, ChevronUp, FileText, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CitationAnchor } from '@/lib/rag/hybrid-retrieval';
import { formatCitationAnchorText } from '@/lib/rag/citation';

export interface CitationReferenceCardProps {
  /** 1-based 编号映射的引用锚点字典 */
  citations: Record<number, CitationAnchor>;
  /** 点击任意引用条目打开抽屉回调 */
  onSelectCitation?: (anchor: CitationAnchor) => void;
  className?: string;
}

/**
 * AI 消息底部的参考来源折叠卡片组件 (CitationReferenceCard)
 * 契约：ADR-0025 / spec §双入口联动
 */
export function CitationReferenceCard({
  citations,
  onSelectCitation,
  className,
}: CitationReferenceCardProps) {
  const [expanded, setExpanded] = useState(false);

  // 提取有效引用列表
  const citationList = useMemo(() => {
    return Object.entries(citations)
      .map(([key, anchor]) => ({
        index: Number(key),
        anchor,
      }))
      .filter((item) => !isNaN(item.index) && Boolean(item.anchor))
      .sort((a, b) => a.index - b.index);
  }, [citations]);

  // 统计去重文档数
  const uniqueDocCount = useMemo(() => {
    const docIds = new Set(citationList.map((item) => item.anchor.documentId || item.anchor.documentName));
    return docIds.size;
  }, [citationList]);

  if (citationList.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="citation-reference-card"
      className={cn(
        'mt-3.5 pt-2 text-xs select-none border-t border-slate-200/60 dark:border-slate-800/60',
        className
      )}
    >
      {/* 折叠/展开控制按钮（触控热区 >= 44px） */}
      <button
        type="button"
        data-testid="citation-reference-card-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-slate-500 hover:bg-slate-100/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">参考来源</span>
          <span className="text-[11px] text-slate-400">
            · {citationList.length} 处引用（{uniqueDocCount} 篇文档）
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <span>{expanded ? '收起' : '展开'}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* 展开后的条目列表 */}
      {expanded && (
        <div className="mt-2 space-y-1.5 pl-1 pr-1 pb-1 animate-in fade-in-0 duration-fast">
          {citationList.map(({ index, anchor }) => {
            const anchorDesc = formatCitationAnchorText(anchor);
            return (
              <button
                key={`cite-ref-row-${index}`}
                type="button"
                data-testid={`citation-ref-item-${index}`}
                onClick={() => onSelectCitation?.(anchor)}
                className="group flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-blue-900/40 dark:hover:bg-blue-950/20 transition-all cursor-pointer"
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span className="inline-flex items-center justify-center font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100/60 dark:bg-blue-900/40 px-1.5 py-0.5 rounded-md shrink-0 mt-0.5">
                    [^{index}]
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 text-xs">
                      《{anchor.documentName}》
                      <span className="ml-1.5 text-[10px] text-slate-400 font-mono">
                        v{anchor.documentVersion}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {anchor.pageNumber ? `第 ${anchor.pageNumber} 页` : `切片 #${anchor.chunkIndex + 1}`}
                      {anchor.headingPath ? ` · ${anchor.headingPath}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[11px] text-slate-400 group-hover:text-blue-500 shrink-0">
                  <span className="hidden sm:inline">查看全文</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
