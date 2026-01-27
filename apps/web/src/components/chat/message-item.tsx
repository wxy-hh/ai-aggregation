'use client';

import { useState, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';

// 消息接口定义
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface MessageItemProps {
  message: Message;
}

// 流式内容组件 - 不使用 Markdown 解析，只显示纯文本 + 光标
const StreamingContent = memo(function StreamingContent({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap">
      {content}
      <span className="inline-block w-2 h-5 ml-0.5 bg-blue-500 animate-pulse rounded-sm" />
    </div>
  );
});

// 静态 Markdown 内容组件 - 只在非流式时渲染
const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  // 使用 useMemo 缓存 components 配置，避免每次渲染都创建新对象
  const components = useMemo(
    () => ({
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');

        if (!inline && match) {
          return (
            <CodeBlock language={match[1]} className={className}>
              {String(children).replace(/\n$/, '')}
            </CodeBlock>
          );
        }

        return (
          <code
            className={cn(
              'bg-slate-100 dark:bg-slate-700/50 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-mono text-sm',
              className
            )}
            {...props}
          >
            {children}
          </code>
        );
      },
    }),
    []
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});

// 用户头像组件
const UserAvatar = memo(function UserAvatar() {
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
      <div className="text-slate-600 dark:text-slate-200 font-medium text-sm">U</div>
    </div>
  );
});

// AI 头像组件
const AIAvatar = memo(function AIAvatar() {
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-gradient-to-br from-indigo-500 to-purple-600 border border-transparent">
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    </div>
  );
});

// 操作按钮组件
const ActionButtons = memo(function ActionButtons({ onCopy }: { onCopy: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [onCopy]);

  return (
    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity px-1">
      <button
        onClick={handleCopy}
        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        title="复制回答"
      >
        {copied ? (
          <svg
            className="w-4 h-4 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
      <button
        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        title="重新生成"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
      <button
        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        title="赞"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
          />
        </svg>
      </button>
    </div>
  );
});

// 主消息组件
export const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming ?? false;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
  }, [message.content]);

  return (
    <div className={cn('flex w-full mb-6', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-4xl w-full gap-4', isUser ? 'flex-row-reverse' : 'flex-row')}>
        {/* Avatar */}
        {isUser ? <UserAvatar /> : <AIAvatar />}

        {/* Content */}
        <div
          className={cn(
            'relative group flex flex-col',
            isUser ? 'items-end max-w-[80%]' : 'flex-1 max-w-full'
          )}
        >
          {/* Name */}
          <div
            className={cn(
              'flex items-center gap-2 mb-1.5 px-1 text-xs text-slate-400 dark:text-slate-500',
              isUser ? 'flex-row-reverse' : ''
            )}
          >
            <span className="font-medium">{isUser ? '用户' : 'AI 助手'}</span>
          </div>

          {/* Message Bubble */}
          <div
            className={cn(
              'px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm w-fit max-w-full break-words',
              isUser
                ? 'bg-blue-600 text-white rounded-tr-none'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none text-slate-800 dark:text-slate-200'
            )}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <div className="markdown-body prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-700 prose-pre:rounded-xl">
                {/* 关键修复：流式时显示纯文本，完成后才渲染 Markdown */}
                {isStreaming ? (
                  <StreamingContent content={message.content} />
                ) : (
                  <MarkdownContent content={message.content} />
                )}
              </div>
            )}
          </div>

          {/* Action buttons - only show when not streaming */}
          {!isUser && !isStreaming && <ActionButtons onCopy={handleCopy} />}
        </div>
      </div>
    </div>
  );
});
