'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { buildUnifiedDiff, type DiffLineType } from './artifact-diff';

interface ArtifactDiffPanelProps {
  /** 对比基准版本（较旧） */
  fromSeq: number;
  fromContent: string;
  /** 被对比版本（较新） */
  toSeq: number;
  toContent: string;
}

const LINE_STYLE: Record<DiffLineType, { row: string; marker: string; markerText: string; label: string }> = {
  added: {
    row: 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100',
    marker: 'text-emerald-600 dark:text-emerald-400',
    markerText: '+',
    label: '新增',
  },
  removed: {
    row: 'bg-rose-50 text-rose-950 dark:bg-rose-950/30 dark:text-rose-100',
    marker: 'text-rose-600 dark:text-rose-400',
    markerText: '-',
    label: '删除',
  },
  unchanged: {
    row: 'text-slate-700 dark:text-slate-300',
    marker: 'text-transparent',
    markerText: ' ',
    label: '',
  },
};

/** 行内高亮样式：新增与删除字符各用语义色加深，未变化字符不进入高亮节点 */
const HIGHLIGHT_STYLE: Record<'added' | 'removed', string> = {
  added: 'rounded-sm bg-emerald-200/80 dark:bg-emerald-700/50',
  removed: 'rounded-sm bg-rose-200/80 dark:bg-rose-700/50',
};

/** 统一视图差异面板（ADR-0037 §7）：对比相邻两个正式版本的 Markdown 源码 */
export function ArtifactDiffPanel({ fromSeq, fromContent, toSeq, toContent }: ArtifactDiffPanelProps) {
  const lines = useMemo(() => buildUnifiedDiff(fromContent, toContent), [fromContent, toContent]);
  const changedCount = lines.filter((l) => l.type !== 'unchanged').length;

  return (
    <div data-testid="artifact-diff-panel" className="space-y-3">
      <p data-testid="artifact-diff-caption" className="text-xs font-medium text-slate-600 dark:text-slate-300">
        对比 v{fromSeq} → v{toSeq}
        <span className="ml-2 font-normal text-slate-400">
          {changedCount === 0 ? '两个版本内容一致' : `共 ${changedCount} 行改动`}
        </span>
      </p>
      <div
        role="table"
        aria-label={`v${fromSeq} 与 v${toSeq} 的差异`}
        className="overflow-hidden rounded-xl border border-slate-200/80 font-mono text-xs leading-6 dark:border-slate-800"
      >
        {lines.map((line, index) => {
          const style = LINE_STYLE[line.type];
          return (
            <div
              key={index}
              role="row"
              data-testid={`diff-line-${line.type}`}
              className={cn('flex gap-2 px-2', style.row)}
            >
              <span aria-hidden="true" className={cn('w-3 shrink-0 select-none text-center', style.marker)}>
                {style.markerText}
              </span>
              {style.label && <span className="sr-only">{style.label}：</span>}
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {line.text === ''
                  ? ' '
                  : line.segments.map((seg, i) =>
                      seg.highlight && line.type !== 'unchanged' ? (
                        <mark
                          key={i}
                          data-testid="diff-inline-highlight"
                          className={cn('text-inherit', HIGHLIGHT_STYLE[line.type])}
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <React.Fragment key={i}>{seg.text}</React.Fragment>
                      )
                    )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
