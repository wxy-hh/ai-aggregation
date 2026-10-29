'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { CodeBlock } from '../code-block';
import { SafeParagraph } from '../markdown-utils';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p: SafeParagraph,
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children);
    if (match || codeString.includes('\n')) {
      return <CodeBlock language={match?.[1] || 'text'}>{codeString}</CodeBlock>;
    }
    return (
      <code
        className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200"
        {...props}
      >
        {children}
      </code>
    );
  },
};

/**
 * 产物 Markdown 渲染。以 content 字符串做 memo 比较：流式预览时前后块内容不变，
 * 就不会随中间块的增量重新渲染（ADR-0037 §3 就地流式预览）。
 */
export const ArtifactMarkdown = React.memo(function ArtifactMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-slate max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-blue-600 prose-pre:p-0 prose-table:text-sm">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
