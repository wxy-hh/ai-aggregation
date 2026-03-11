'use client';

import { useState, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';
import type { Attachment, Message } from '@/stores/chat-store';

interface MessageItemProps {
  message: Message;
  onRegenerate?: (messageId: string) => void;
}

// 附件预览组件
const AttachmentPreview = memo(function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  if (attachment.type === 'image' && attachment.imageUrl) {
    return (
      <div className="relative group mb-2">
        <img
          src={attachment.imageUrl}
          alt={attachment.name}
          className="max-w-[300px] max-h-[200px] rounded-lg object-cover border border-white/20"
        />
        <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
          {attachment.name}
        </div>
      </div>
    );
  }

  if (attachment.type === 'file') {
    return (
      <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 mb-2">
        <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.name}</p>
          {attachment.size && (
            <p className="text-xs opacity-70">
              {(attachment.size / 1024).toFixed(1)} KB
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
});

// 附件列表组件
const AttachmentList = memo(function AttachmentList({ attachments }: { attachments?: Attachment[] }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <AttachmentPreview key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
});

// 流式内容组件 - 不使用 Markdown 解析，只显示纯文本 + 光标
const StreamingContent = memo(function StreamingContent({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap">
      {content}
      <span className="inline-block w-2 h-5 ml-0.5 bg-blue-500 animate-pulse rounded-sm" />
    </div>
  );
});

// 操作按钮组件
const ActionButtons = memo(function ActionButtons({
  onCopy,
  onRegenerate,
  isUser,
}: {
  onCopy: () => void;
  onRegenerate?: () => void;
  isUser?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [onCopy]);

  return (
    <div
      className={cn(
        'flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity px-1',
        isUser ? 'flex-row-reverse' : ''
      )}
    >
      {/* 复制按钮 */}
      <button
        onClick={handleCopy}
        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        title="复制"
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

      {/* 重新生成按钮 */}
      {onRegenerate && (
        <button
          onClick={onRegenerate}
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
      )}

      {/* 赞按钮 - 只对 AI 显示 */}
      {!isUser && (
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
      )}
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

        // 将 children 转换为字符串，过滤掉对象
        const getTextContent = (child: any): string => {
          if (typeof child === 'string') return child;
          if (Array.isArray(child)) return child.map(getTextContent).join('');
          if (child && typeof child === 'object' && child.props && child.props.children) {
            return getTextContent(child.props.children);
          }
          return '';
        };

        const textContent = getTextContent(children);

        if (!inline && match) {
          return (
            <CodeBlock language={match[1]} className={className}>
              {textContent.replace(/\n$/, '')}
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
            {textContent}
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
    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    </div>
  );
});

// AI 头像组件
const AIAvatar = memo(function AIAvatar() {
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-md bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 border border-white/20 text-white ring-2 ring-white dark:ring-slate-800">
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2L14.4 7.2L20 9.6L14.4 12L12 17.2L9.6 12L4 9.6L9.6 7.2L12 2Z"
          fill="currentColor"
          className="animate-pulse"
        />
        <path
          d="M19 15L20 17L22 18L20 19L19 21L18 19L16 18L18 17L19 15Z"
          fill="currentColor"
          className="opacity-70"
        />
      </svg>
    </div>
  );
});

// 思考过程骨架屏组件
const ThinkingIndicator = memo(function ThinkingIndicator() {
  return (
    <div className="w-full max-w-[400px] space-y-3 py-1">
      {/* 标题动画 */}
      <div className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 mb-4 animate-pulse">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span>AI 正在思考</span>
        <span className="flex gap-0.5 ml-1">
          <span className="animate-bounce delay-0">.</span>
          <span className="animate-bounce delay-150">.</span>
          <span className="animate-bounce delay-300">.</span>
        </span>
      </div>

      {/* 骨架屏线条 */}
      <div className="space-y-2.5">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-full animate-pulse" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-[90%] animate-pulse delay-75" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-[95%] animate-pulse delay-150" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-[80%] animate-pulse delay-200" />
      </div>
    </div>
  );
});

// 主消息组件
export const MessageItem = memo(function MessageItem({ message, onRegenerate }: MessageItemProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming ?? false;
  // 判断是否处于思考状态：是 AI 消息 + 正在流式传输 + 内容为空
  const isThinking = !isUser && isStreaming && !message.content;
  const hasAttachments = message.attachments && message.attachments.length > 0;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
  }, [message.content]);

  return (
    <div className={cn('flex w-full mb-6', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-4xl w-full gap-4', isUser ? 'flex-row-reverse' : 'flex-row')}>
        {/* 头像 */}
        {isUser ? <UserAvatar /> : <AIAvatar />}

        {/* 内容 */}
        <div
          className={cn(
            'relative group flex flex-col',
            isUser ? 'items-end max-w-[80%]' : 'flex-1 max-w-full'
          )}
        >
          {/* 用户名/角色 */}
          <div
            className={cn(
              'flex items-center gap-2 mb-1.5 px-1 text-xs text-slate-400 dark:text-slate-500',
              isUser ? 'flex-row-reverse' : ''
            )}
          >
            <span className={cn('font-medium', isThinking ? 'text-blue-500 animate-pulse' : '')}>
              {isUser ? '用户' : isThinking ? 'AI 思考中...' : 'AI 助手'}
            </span>
          </div>

          {/* Message Bubble */}
          <div
            className={cn(
              'px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm w-fit max-w-full break-words',
              isUser
                ? 'bg-blue-600 text-white rounded-tr-none'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none text-slate-800 dark:text-slate-200',
              // 思考状态下，气泡宽度设为更宽以容纳骨架屏
              isThinking ? 'w-full max-w-[500px]' : ''
            )}
          >
            {isUser ? (
              <>
                {/* 用户消息：先显示附件，再显示文本 */}
                {hasAttachments && <AttachmentList attachments={message.attachments} />}
                {message.content && <div className="whitespace-pre-wrap">{message.content}</div>}
              </>
            ) : (
              <div className="markdown-body prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-700 prose-pre:rounded-xl">
                {isThinking ? (
                  <ThinkingIndicator />
                ) : isStreaming ? (
                  <StreamingContent content={message.content} />
                ) : (
                  <MarkdownContent content={message.content} />
                )}
              </div>
            )}
          </div>

          {/* 操作按钮 - 同时显示给用户和 AI，但在流式传输期间不显示 */}
          {!isStreaming && !isThinking && (
            <ActionButtons
              onCopy={handleCopy}
              onRegenerate={onRegenerate ? () => onRegenerate(message.id) : undefined}
              isUser={isUser}
            />
          )}
        </div>
      </div>
    </div>
  );
});