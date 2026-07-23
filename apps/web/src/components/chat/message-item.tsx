'use client';

import React from 'react';
import { useState, useCallback, useMemo, useRef, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';
import type { Attachment, Message } from '@/stores/chat-store';
import { useChatStore } from '@/stores/chat-store';
import { RelayAction } from '@/components/relay/relay-action';
import { RelayMenu } from '@/components/relay/relay-menu';
import { useRelayLauncher } from '@/components/relay/use-relay-launcher';
import { RELAY_COPY } from '@/lib/relay/copy';
import type { RelayReferenceItem } from '@repo/shared';

interface MessageItemProps {
  message: Message;
  onRegenerate?: (messageId: string) => void;
}

// 附件预览组件
const AttachmentPreview = memo(function AttachmentPreview({
  attachment,
}: {
  attachment: Attachment;
}) {
  if (attachment.type === 'image' && attachment.imageUrl) {
    return (
      <div className="relative group mb-2">
        <img
          src={attachment.imageUrl}
          alt={attachment.name}
          className="max-h-[200px] max-w-[300px] rounded-2xl border border-white/70 object-cover shadow-[0_10px_24px_rgba(76,95,154,0.1)]"
        />
        <div className="absolute bottom-2 left-2 rounded-full border border-white/20 bg-slate-950/60 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
          {attachment.name}
        </div>
      </div>
    );
  }

  if (attachment.type === 'file') {
    return (
      <div className="mb-2 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-3 py-2.5 shadow-[0_8px_20px_rgba(76,95,154,0.08)] dark:border-slate-700/80 dark:bg-slate-800/72">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/12">
          <svg
            className="w-4 h-4 text-red-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-100">
            {attachment.name}
          </p>
          {attachment.size && (
            <p className="text-xs text-slate-400">{(attachment.size / 1024).toFixed(1)} KB</p>
          )}
        </div>
      </div>
    );
  }

  return null;
});

// 附件列表组件
const AttachmentList = memo(function AttachmentList({
  attachments,
}: {
  attachments?: Attachment[];
}) {
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
    <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700 dark:text-slate-200">
      {content}
      <span className="ml-1 inline-block h-5 w-2 rounded-sm bg-blue-500 align-[-3px] animate-pulse" />
    </div>
  );
});

// 操作按钮组件
const ActionButtons = memo(function ActionButtons({
  onCopy,
  onRegenerate,
  isUser,
  relay,
}: {
  onCopy: () => void;
  onRegenerate?: () => void;
  isUser?: boolean;
  relay?: {
    disabled: boolean;
    disabledReason?: string;
    onOpen: () => void;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
  };
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
        // 移动端常显（无 hover 无法发现接力），桌面保留 hover 渐显
        'mt-2 flex items-center gap-1 px-1 transition-opacity max-sm:opacity-100 opacity-0 group-hover:opacity-100',
        isUser ? 'flex-row-reverse' : ''
      )}
    >
      {/* 复制按钮 */}
      <button
        onClick={handleCopy}
        className="rounded-full border border-transparent p-2 text-slate-400 transition-colors hover:border-slate-200 hover:bg-white/80 hover:text-slate-600 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 dark:hover:text-slate-300"
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
          className="rounded-full border border-transparent p-2 text-slate-400 transition-colors hover:border-slate-200 hover:bg-white/80 hover:text-slate-600 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 dark:hover:text-slate-300"
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
          className="rounded-full border border-transparent p-2 text-slate-400 transition-colors hover:border-slate-200 hover:bg-white/80 hover:text-slate-600 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 dark:hover:text-slate-300"
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

      {/* 接力按钮 - 只对 AI 显示（REQ-007 助手操作栏发起） */}
      {!isUser && relay && (
        <RelayAction
          ref={relay.triggerRef}
          iconOnly
          disabled={relay.disabled}
          disabledReason={relay.disabledReason}
          onClick={relay.onOpen}
          className="rounded-full border border-transparent text-slate-400 hover:border-slate-200 hover:bg-white/80 hover:text-slate-600 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 dark:hover:text-slate-300"
        />
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
              'rounded-md bg-[#F3F6FF] px-1.5 py-0.5 font-mono text-sm text-indigo-600 dark:bg-slate-800 dark:text-indigo-300',
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

/** 用户发言标识：消息气泡内人物轮廓 */
function ChatUserMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 5.5h12a2.25 2.25 0 0 1 2.25 2.25v5a2.25 2.25 0 0 1-2.25 2.25H10.8l-3.3 2.9V15h-3a2.25 2.25 0 0 1-2.25-2.25V7.75A2.25 2.25 0 0 1 4.5 5.5z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <circle cx="11.25" cy="9.85" r="2" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M7.6 14.55c.75-1.65 2.1-2.55 3.65-2.55s2.9.9 3.65 2.55"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}

/** 智能对话助手标识：对话气泡 + 星芒 + 流式回复点 */
function ChatAiMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 5.75h12.25a2.25 2.25 0 0 1 2.25 2.25v5.25a2.25 2.25 0 0 1-2.25 2.25h-4.1l-3.35 2.95V15.5H4.5a2.25 2.25 0 0 1-2.25-2.25V8a2.25 2.25 0 0 1 2.25-2.25z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="M11.35 9.1l.72 2.15 2.15.72-2.15.72-.72 2.15-.72-2.15-2.15-.72 2.15-.72.72-2.15z"
        fill="currentColor"
      />
      <circle cx="8.55" cy="12.55" r="0.55" fill="currentColor" opacity="0.55" />
      <circle cx="10.75" cy="12.55" r="0.55" fill="currentColor" opacity="0.8" />
      <circle cx="12.95" cy="12.55" r="0.55" fill="currentColor" opacity="0.55" />
      <path
        d="M16.75 7.1v1.35M16.75 11.15v1.35M14.7 9.12h1.35M18.8 9.12h1.35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity="0.75"
        strokeWidth="1.1"
      />
    </svg>
  );
}

// 用户头像：发言者（G-2 玻璃底 + 消息气泡人物标识）
const UserAvatar = memo(function UserAvatar() {
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
        'border border-white/60 bg-white/60 text-slate-600 backdrop-blur-xl',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35),0_8px_20px_-6px_rgba(76,95,154,0.12)]',
        'dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300',
        'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_8px_20px_-6px_rgba(0,0,0,0.35)]'
      )}
    >
      <ChatUserMark className="h-[22px] w-[22px]" />
    </div>
  );
});

// AI 头像：智能对话助手（低饱和蓝青背光 + 外层呼吸光晕）
const AIAvatar = memo(function AIAvatar() {
  return (
    <div className="relative h-10 w-10 shrink-0">
      {/* 外层柔和光晕（呼吸动效，系统减少动效时自动弱化） */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-2 rounded-[20px]',
          'bg-gradient-to-br from-blue-400/22 via-indigo-400/14 to-cyan-400/20',
          'blur-[7px] motion-safe:animate-avatar-glow-breathe',
          'dark:from-blue-500/28 dark:via-indigo-500/18 dark:to-cyan-500/22'
        )}
      />
      <div
        className={cn(
          'relative z-[1] flex h-10 w-10 items-center justify-center rounded-2xl',
          'border border-blue-200/55 bg-gradient-to-br from-blue-500/14 via-indigo-500/10 to-cyan-500/14',
          'text-blue-600 backdrop-blur-xl',
          'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.45),0_6px_16px_-6px_rgba(59,130,246,0.14)]',
          'dark:border-blue-500/22 dark:from-blue-500/18 dark:via-indigo-500/12 dark:to-cyan-500/16',
          'dark:text-blue-300',
          'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_6px_16px_-6px_rgba(59,130,246,0.1)]'
        )}
      >
        <ChatAiMark className="h-[22px] w-[22px]" />
      </div>
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

  // 接力：仅非流式、非空的 AI 助手回答可发起（REQ-007）
  const currentModel = useChatStore((s) => s.model);
  const currentProvider = useChatStore((s) => s.provider);
  const canRelay = !isUser && !isStreaming && !isThinking && message.content.trim().length > 0;
  // 气泡容器 ref：用于判定用户是否在气泡内选中了片段（REQ-009 选区优先）
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const relay = useRelayLauncher({
    sourceType: 'text',
    selectionRootRef: bubbleRef,
    disabledReason: !canRelay
      ? isStreaming || isThinking
        ? RELAY_COPY.disabled.generating
        : RELAY_COPY.disabled.empty
      : undefined,
    buildItem: ({ selectedText }) => {
      if (!canRelay) return null;
      // 选区片段优先；否则回退到完整回答
      const snapshot = selectedText ?? message.content;
      const partial: Omit<RelayReferenceItem, 'id' | 'createdAt'> = {
        sourceModule: 'chat',
        sourceType: 'text',
        sourceId: message.id,
        sourceTitle: snapshot.slice(0, 30) || '对话回答',
        sourceModel: currentModel ?? currentProvider,
        snapshotText: snapshot,
      };
      return partial;
    },
  });

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
  }, [message.content]);

  return (
    <div className={cn('flex w-full mb-6', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'flex w-full flex-col gap-2 md:gap-4',
          isUser ? 'items-end md:items-start md:flex-row-reverse' : 'items-start md:flex-row'
        )}
      >
        {/* 头像 */}
        {isUser ? <UserAvatar /> : <AIAvatar />}

        {/* 内容 */}
        <div
          className={cn(
            'relative group flex flex-col',
            isUser ? 'items-end w-full md:max-w-[80%]' : 'w-full flex-1 max-w-full'
          )}
        >
          {/* 用户名/角色 */}
          <div
            className={cn(
              'flex items-center gap-2 mb-1.5 px-1 text-xs text-slate-400 dark:text-slate-500',
              isUser ? 'self-end md:flex-row-reverse' : 'self-start'
            )}
          >
            <span className={cn('font-medium', isThinking ? 'text-blue-500 animate-pulse' : '')}>
              {isUser ? '用户' : isThinking ? 'AI 思考中...' : 'AI 助手'}
            </span>
          </div>

          {/* Message Bubble */}
          <div
            ref={bubbleRef}
            onContextMenu={!isUser ? relay.onContextMenu : undefined}
            {...(!isUser ? relay.longPressProps : {})}
            className={cn(
              'max-w-full break-words rounded-[24px] px-5 py-4 text-[15px] leading-relaxed shadow-[0_10px_26px_rgba(76,95,154,0.08)]',
              isUser
                ? 'w-full rounded-tr-[10px] border border-blue-400/20 bg-[linear-gradient(135deg,#4969E9_0%,#5D7CFA_56%,#7D91FF_100%)] text-white md:w-fit'
                : 'rounded-tl-[10px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.78))] text-slate-800 dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.92),rgba(15,23,42,0.82))] dark:text-slate-200',
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
              <div className="markdown-body prose max-w-none prose-p:leading-7 prose-p:text-slate-700 prose-headings:font-heading prose-headings:text-slate-900 prose-strong:text-slate-900 prose-pre:rounded-2xl prose-pre:border prose-pre:border-slate-200 prose-pre:p-0 dark:prose-invert dark:prose-p:text-slate-200 dark:prose-headings:text-white dark:prose-strong:text-white dark:prose-pre:border-slate-700">
                {isThinking ? (
                  <ThinkingIndicator />
                ) : isStreaming ? (
                  <StreamingContent content={message.content} />
                ) : (
                  <>
                    <MarkdownContent content={message.content} />
                    {message.truncationWarning && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                        {message.truncationWarning}
                      </div>
                    )}
                  </>
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
              relay={
                !isUser
                  ? {
                      disabled: relay.disabled,
                      disabledReason: relay.disabledReason,
                      onOpen: relay.openAtTrigger,
                      triggerRef: relay.triggerRef,
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>

      {/* 接力菜单（显式按钮/右键/长按复用同一菜单） */}
      {!isUser && (
        <RelayMenu
          open={relay.menuOpen}
          onOpenChange={relay.setMenuOpen}
          targets={relay.targets}
          onSelect={relay.onSelect}
          anchorPoint={relay.anchorPoint}
          triggerRef={relay.triggerRef}
        />
      )}
    </div>
  );
});
