'use client';

import React, { useMemo } from 'react';
import { findSectionRange } from '@repo/shared';
import { ArtifactMarkdown } from './artifact-markdown';

interface HighlightedMarkdownProps {
  content: string;
  /** 本轮已成功应用补丁的章节标题行 */
  sections: string[];
}

interface Segment {
  text: string;
  highlight: boolean;
}

/** 按被改章节切分全文；章节区间重叠（父子章节都被改）时只保留外层 */
function splitByHighlightedSections(content: string, sections: string[]): Segment[] {
  const ranges = sections
    .map((s) => findSectionRange(content, s))
    .filter((r): r is { start: number; end: number } => r !== null)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) segments.push({ text: content.slice(cursor, range.start), highlight: false });
    segments.push({ text: content.slice(range.start, range.end), highlight: true });
    cursor = range.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor), highlight: false });
  return segments;
}

/** 补丁完成后短暂高亮被改章节：未改章节不带高亮标记 */
export function HighlightedMarkdown({ content, sections }: HighlightedMarkdownProps) {
  const segments = useMemo(() => splitByHighlightedSections(content, sections), [content, sections]);
  return (
    <div>
      {segments.map((seg, index) =>
        seg.highlight ? (
          <div
            key={index}
            data-testid="artifact-section-highlight"
            className="rounded-xl bg-primary/5 px-3 ring-1 ring-primary/30 transition-colors"
          >
            <ArtifactMarkdown content={seg.text} />
          </div>
        ) : (
          <ArtifactMarkdown key={index} content={seg.text} />
        )
      )}
    </div>
  );
}
