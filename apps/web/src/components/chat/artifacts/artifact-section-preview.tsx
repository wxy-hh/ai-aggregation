'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { findSectionRange } from '@repo/shared';
import { ArtifactMarkdown } from './artifact-markdown';

interface StreamingPatchPreviewProps {
  /** 补丁流式期间的当前版全文（增量不会写进它） */
  content: string;
  /** 被修改章节的标题行 */
  section: string;
  /** 正在流入的新章节内容 */
  draft: string;
}

/**
 * 就地流式预览（ADR-0037 §3）：文档拆为「章节前 / 流入的新章节 / 章节后」三块，
 * 仅中间块随增量刷新并带「修改中」标记；前后块内容不变，不会重新渲染。
 * 旧章节在流式期间被新章节替换，找不到章节（标题抄错）时新内容接在全文之后。
 */
export function StreamingPatchPreview({ content, section, draft }: StreamingPatchPreviewProps) {
  const { before, after } = useMemo(() => {
    const range = findSectionRange(content, section);
    return range
      ? { before: content.slice(0, range.start), after: content.slice(range.end) }
      : { before: content, after: '' };
  }, [content, section]);

  // 自动滚动：让流入内容的末尾保持在可视区内；nearest 只在末尾离开视口时才滚动，不抢用户的位置
  const tailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tailRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [draft]);

  return (
    <div data-testid="artifact-patch-preview" className="space-y-0">
      {before.trim() && (
        <div data-testid="artifact-preview-before">
          <ArtifactMarkdown content={before} />
        </div>
      )}
      <div
        data-testid="artifact-preview-streaming"
        className="relative my-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2"
      >
        <span
          data-testid="artifact-preview-streaming-badge"
          role="status"
          className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" aria-hidden="true" />
          修改中 · {section}
        </span>
        <ArtifactMarkdown content={draft || '*(正在生成该章节…)*'} />
        <div ref={tailRef} aria-hidden="true" className="h-px" />
      </div>
      {after.trim() && (
        <div data-testid="artifact-preview-after">
          <ArtifactMarkdown content={after} />
        </div>
      )}
    </div>
  );
}
