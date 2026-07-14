'use client';

/**
 * 聚焦答案面板 — 双列聚焦阅读中的单列
 *
 * 每列独立滚动。长文阅读区使用实体高对比背景（DESIGN.md：忌玻璃套玻璃）。
 * 局部状态：排队骨架屏 / 流式光标 / 完成 Markdown / 失败重试 / 已停止续写。
 * 行为栏：复制、重试、停止。
 */

import { memo, useMemo, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, RotateCw, Square, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from '../code-block';
import type { ModelRun } from '@/types/comparison';

// 流式内容：纯文本 + 光标（不做 Markdown 解析，避免流式抖动）
const StreamingContent = memo(function StreamingContent({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700 dark:text-slate-200">
      {content}
      <span className="ml-1 inline-block h-5 w-2 rounded-sm bg-blue-500 align-[-3px] animate-pulse" />
    </div>
  );
});

// 完成态 Markdown 渲染（复用 message-item 的渲染约定与 CodeBlock）
const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const components = useMemo(
    () => ({
      code({ inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const getText = (child: any): string => {
          if (typeof child === 'string') return child;
          if (Array.isArray(child)) return child.map(getText).join('');
          if (child?.props?.children) return getText(child.props.children);
          return '';
        };
        const text = getText(children);
        if (!inline && match) {
          return (
            <CodeBlock language={match[1]} className={className}>
              {text.replace(/\n$/, '')}
            </CodeBlock>
          );
        }
        return (
          <code
            className={cn(
              'rounded-md bg-[#F3F6FF] px-1.5 py-0.5 font-mono text-sm text-indigo-600 dark:bg-slate-800 dark:text-indigo-300',
              className
            )}
            {...props}
          >
            {text}
          </code>
        );
      },
    }),
    []
  );

  return (
    <div className="markdown-body prose max-w-none prose-p:leading-7 prose-p:text-slate-700 prose-headings:font-heading prose-headings:text-slate-900 prose-strong:text-slate-900 prose-pre:rounded-2xl prose-pre:border prose-pre:border-slate-200 prose-pre:p-0 dark:prose-invert dark:prose-p:text-slate-200 dark:prose-headings:text-white dark:prose-strong:text-white dark:prose-pre:border-slate-700">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

// 排队骨架屏（光晕呼吸，DESIGN.md §7.3）
const QueuedSkeleton = memo(function QueuedSkeleton() {
  return (
    <div className="space-y-2.5 py-1">
      <div className="h-4 w-full animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-700/80" />
      <div className="h-4 w-[92%] animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-700/80" />
      <div className="h-4 w-[80%] animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-700/80" />
    </div>
  );
});

function formatDuration(run: ModelRun): string | null {
  if (run.startedAt && run.completedAt) {
    return `${((run.completedAt - run.startedAt) / 1000).toFixed(1)} 秒`;
  }
  return null;
}

const STATUS_LABEL: Record<ModelRun['status'], { text: string; cls: string }> = {
  queued: { text: '等待发送', cls: 'text-slate-400' },
  streaming: { text: '生成中', cls: 'text-blue-600 dark:text-blue-400' },
  completed: { text: '已完成', cls: 'text-emerald-600 dark:text-emerald-400' },
  failed: { text: '失败', cls: 'text-rose-600 dark:text-rose-400' },
  stopped: { text: '已停止', cls: 'text-slate-500' },
};

interface FocusAnswerPaneProps {
  run: ModelRun;
  turnId: string;
  onRetry: (turnId: string, modelKey: string) => void;
  onStop: (modelKey: string) => void;
}

export const FocusAnswerPane = memo(function FocusAnswerPane({
  run,
  turnId,
  onRetry,
  onStop,
}: FocusAnswerPaneProps) {
  const [copied, setCopied] = useState(false);
  const duration = formatDuration(run);
  const status = STATUS_LABEL[run.status];

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(run.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [run.content]);

  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-col rounded-[24px] border',
        'border-white/70 bg-white/85 shadow-[0_10px_26px_rgba(76,95,154,0.08)]',
        'dark:border-slate-700/70 dark:bg-slate-900/80'
      )}
      aria-label={`${run.label} 的回答`}
    >
      {/* 模型头部 */}
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              run.status === 'completed'
                ? 'bg-emerald-500'
                : run.status === 'failed'
                  ? 'bg-rose-500'
                  : run.status === 'streaming'
                    ? 'animate-pulse bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]'
                    : 'bg-slate-300 dark:bg-slate-600'
            )}
          />
          <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {run.label}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn('text-xs font-medium', status.cls)}>{status.text}</span>
          {duration && <span className="text-[11px] text-slate-400">{duration}</span>}
        </div>
      </header>

      {/* 回答正文（独立滚动） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
        {run.status === 'queued' && <QueuedSkeleton />}
        {run.status === 'streaming' &&
          (run.content ? <StreamingContent content={run.content} /> : <QueuedSkeleton />)}
        {(run.status === 'completed' || run.status === 'stopped') && (
          <>
            <MarkdownContent content={run.content} />
            {run.status === 'stopped' && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                回答已停止，可重试该模型重新生成。
              </div>
            )}
            {run.truncationWarning && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                {run.truncationWarning}
              </div>
            )}
          </>
        )}
        {run.status === 'failed' && (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/60 px-4 py-4 dark:border-rose-900/50 dark:bg-rose-950/30">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">生成失败</span>
            </div>
            <p className="text-sm text-rose-500/90 dark:text-rose-300/90">
              {run.error ?? `${run.label} 暂时不可用，可重试该模型`}
            </p>
          </div>
        )}
      </div>

      {/* 行为栏 */}
      <footer className="flex items-center gap-1 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!run.content}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="复制"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '已复制' : '复制'}
        </button>

        {run.status === 'streaming' ? (
          <button
            type="button"
            onClick={() => onStop(run.modelKey)}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/40"
            title="停止该模型"
          >
            <Square className="h-3.5 w-3.5" />
            停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRetry(turnId, run.modelKey)}
            disabled={run.status === 'queued'}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title="重试该模型"
          >
            {run.status === 'queued' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
            重试
          </button>
        )}
      </footer>
    </section>
  );
});
