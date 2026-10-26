'use client';

import React, { useState } from 'react';
import { BookOpen, ExternalLink, CheckCircle2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { CitationAnchor } from '@/lib/rag/hybrid-retrieval';
import { formatCitationAnchorText } from '@/lib/rag/citation';

export interface CitationBadgeProps {
  /** 引用编号 (1-based)，例如 1 对应 [^1] */
  index: number;
  /** 关联的切片物理锚点（若有） */
  anchor?: CitationAnchor | null;
  /** 点击跳转定位原文回调 */
  onNavigate?: (anchor: CitationAnchor) => void;
  /** 点击直接唤起全文抽屉回调 (ADR-0025) */
  onOpenCitation?: (anchor: CitationAnchor) => void;
  /** 紧凑模式或自定义样式 */
  className?: string;
}

/**
 * 消息内可点击引用上标徽标组件 (QA-004)
 * 点击展开 Popover 展示切片来源详情（文档名、单调版本、页码或标题层级）
 */
export function CitationBadge({
  index,
  anchor,
  onNavigate,
  onOpenCitation,
  className,
}: CitationBadgeProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const anchorText = anchor ? formatCitationAnchorText(anchor) : null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!anchorText) return;
    navigator.clipboard.writeText(anchorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (anchor && onOpenCitation) {
      setOpen(false);
      onOpenCitation(anchor);
    } else if (anchor && onNavigate) {
      onNavigate(anchor);
    } else if (anchor) {
      // 默认若有知识库路由，可跳转至知识库管理或文档
      window.open(`/knowledge?docId=${encodeURIComponent(anchor.documentId)}&v=${anchor.documentVersion}`, '_blank');
    }
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    if (anchor && onOpenCitation) {
      onOpenCitation(anchor);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`citation-badge-${index}`}
          aria-label={`查看引用 [^${index}] 来源`}
          onClick={handleTriggerClick}
          className={cn(
            'inline-flex items-center justify-center align-super text-[11px] font-semibold leading-none',
            'mx-0.5 px-1 py-0.5 rounded-md cursor-pointer select-none transition-colors duration-fast ease-out-expo',
            'border border-blue-200 bg-blue-50/80 text-blue-700 hover:bg-blue-100 hover:text-blue-800 hover:border-blue-300',
            'dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60',
            className
          )}
        >
          [^{index}]
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80 p-3.5 rounded-2xl shadow-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs"
      >
        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
            <BookOpen className="h-3.5 w-3.5" />
            <span>引用来源 [^{index}]</span>
          </div>
          {anchor && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full font-medium">
              <CheckCircle2 className="h-3 w-3" />
              已核验锚点
            </span>
          )}
        </div>

        {anchor ? (
          <div className="space-y-2">
            <div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">文档名称</div>
              <div className="font-medium text-slate-900 dark:text-slate-100 break-words">
                《{anchor.documentName}》
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
              <div>
                <span className="text-slate-400 dark:text-slate-500">版本号：</span>
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  v{anchor.documentVersion}
                </span>
              </div>
              {anchor.pageNumber ? (
                <div>
                  <span className="text-slate-400 dark:text-slate-500">页码：</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    第 {anchor.pageNumber} 页
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-slate-400 dark:text-slate-500">切片序号：</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    #{anchor.chunkIndex + 1}
                  </span>
                </div>
              )}
            </div>

            {anchor.headingPath && (
              <div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">章节层级</div>
                <div className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-lg">
                  {anchor.headingPath}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? '已复制' : '复制出处'}</span>
              </button>

              <button
                type="button"
                onClick={handleNavigate}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg font-medium transition-colors cursor-pointer"
              >
                <span>定位原文</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="py-2 text-slate-500 dark:text-slate-400">
            <p>该条引用未匹配到物理切片锚点（可能来自模型概括或未绑定切片）。</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** 正则拆分文本并嵌入 CitationBadge 组件 */
export function injectCitationBadges(
  text: string,
  anchorMap?: Map<number, CitationAnchor>,
  onOpenCitation?: (anchor: CitationAnchor) => void
): React.ReactNode {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // 匹配 [^1], [^2] 等
  const parts = text.split(/(\[\^\d+\])/g);
  if (parts.length === 1) {
    return text;
  }

  return parts.map((part, idx) => {
    const match = /^\[\^(\d+)\]$/.exec(part);
    if (match) {
      const num = parseInt(match[1], 10);
      const anchor = anchorMap?.get(num);
      return (
        <CitationBadge
          key={`cite-${num}-${idx}`}
          index={num}
          anchor={anchor}
          onOpenCitation={onOpenCitation}
        />
      );
    }
    return part;
  });
}

/** 递归遍历 React 节点树将文本中的 [^n] 替换为 CitationBadge */
export function wrapCitationsInReactNode(
  node: React.ReactNode,
  anchorMap?: Map<number, CitationAnchor>,
  onOpenCitation?: (anchor: CitationAnchor) => void
): React.ReactNode {
  if (typeof node === 'string') {
    return injectCitationBadges(node, anchorMap, onOpenCitation);
  }
  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <React.Fragment key={i}>
        {wrapCitationsInReactNode(child, anchorMap, onOpenCitation)}
      </React.Fragment>
    ));
  }
  if (React.isValidElement(node) && node.props && (node.props as { children?: React.ReactNode }).children) {
    const props = node.props as { children?: React.ReactNode };
    return React.cloneElement(node, {
      ...props,
      children: wrapCitationsInReactNode(props.children, anchorMap, onOpenCitation),
    } as Record<string, unknown>);
  }
  return node;
}
