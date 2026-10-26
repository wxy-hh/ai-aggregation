'use client';

import React from 'react';
import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { cn } from '@/lib/utils';
import { Square, AlertCircle, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { CodeBlock } from './code-block';
import { SafeParagraph } from './markdown-utils';
import { AgentTrace } from './agent-trace';
import { AttachmentPreview } from './attachment-preview';
import { ArtifactCard } from './artifacts/artifact-card';
import { CitationBadge, wrapCitationsInReactNode, injectCitationBadges } from './citation-badge';
import { CitationReferenceCard } from './citation-reference-card';
import type { CitationAnchor } from '@/lib/rag/hybrid-retrieval';
import { extractCitationIndices } from '@/lib/rag/citation';
import type { Attachment, Message } from '@/stores/chat-store';
import { useChatStore } from '@/stores/chat-store';
import { RelayAction } from '@/components/relay/relay-action';
import { RelayMenu } from '@/components/relay/relay-menu';
import { useRelayLauncher } from '@/components/relay/use-relay-launcher';
import { RELAY_COPY } from '@/lib/relay/copy';
import type { RelayReferenceItem } from '@repo/shared';

/** 格式化消息 token 消耗展示文案 */
export function formatUsageText(usage: NonNullable<Message['usage']>): string {
  const prefix = usage.estimated ? '约 ' : '';
  const total = usage.totalTokens.toLocaleString();
  if (usage.inputTokens !== null && usage.outputTokens !== null) {
    return `${prefix}${total} tokens（输入 ${usage.inputTokens.toLocaleString()} · 输出 ${usage.outputTokens.toLocaleString()}）`;
  }
  return `${prefix}${total} tokens`;
}

interface MessageItemProps {
  message: Message;
  onRegenerate?: (messageId: string) => void;
  onOpenCitation?: (anchor: CitationAnchor) => void;
}

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

// 流式内容组件 - 呈现纯文本与实时引用徽标 + 光标
const StreamingContent = memo(function StreamingContent({
  content,
  anchorMap,
  onOpenCitation,
}: {
  content: string;
  anchorMap?: Map<number, CitationAnchor>;
  onOpenCitation?: (anchor: CitationAnchor) => void;
}) {
  return (
    <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700 dark:text-slate-200">
      {injectCitationBadges(content, anchorMap, onOpenCitation)}
      <span className="ml-1 inline-block h-5 w-2 rounded-sm bg-blue-500 align-[-3px] animate-pulse" />
    </div>
  );
});

// 操作按钮共享样式（2026-10-15 评审 H2/M2：全断点常显 + 触屏 44px 热区）
// 浅色常态文字用 day-muted（DESIGN.md §2.6 白底 AA），深色 slate 表面允许 slate-400；
// 尺寸：触屏或 <md 恒 44px；仅「md 及以上 + 精细指针（桌面鼠标）」降 32px 小档，
// 避免 iPad 等 md 断点触屏设备被 md:h-8 压回 32px 不达标
const ACTION_BTN_CLASS =
  'flex h-11 w-11 items-center justify-center rounded-full border border-transparent text-day-muted select-none transition-[color,background-color,border-color,transform] duration-fast ease-out-expo hover:border-slate-200 hover:bg-white/80 hover:text-slate-600 md:pointer-fine:h-8 md:pointer-fine:w-8 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 dark:hover:text-slate-300 active:scale-[0.90]';

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
        // 全断点常显（2026-10-15 评审 H2）：hover 无法作为触屏端唯一发现手段；
        // 常态低对比（slate-400 图标），hover 仅增强按钮自身底色
        'mt-2 flex items-center gap-1 px-1 transition-opacity duration-fast ease-out-expo',
        isUser ? 'flex-row-reverse' : ''
      )}
    >
      {/* 复制按钮 */}
      <button
        onClick={handleCopy}
        className={ACTION_BTN_CLASS}
        title="复制"
        aria-label="复制消息内容"
      >
        {copied ? (
          <svg
            className="w-4 h-4 text-emerald-500 animate-in zoom-in-75 duration-fast ease-out-expo"
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

      {/* 重新生成按钮 - 仅对 AI 消息显示 */}
      {!isUser && onRegenerate && (
        <button
          onClick={onRegenerate}
          className={ACTION_BTN_CLASS}
          title="重新生成"
          aria-label="重新生成回答"
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

      {/* 点赞按钮 - 仅对 AI 消息显示 */}
      {!isUser && (
        <button
          className={ACTION_BTN_CLASS}
          title="赞"
          aria-label="点赞"
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

      {/* 接力按钮 - 仅对 AI 消息显示 */}
      {!isUser && relay && (
        <RelayAction
          ref={relay.triggerRef}
          iconOnly
          disabled={relay.disabled}
          disabledReason={relay.disabledReason}
          onClick={relay.onOpen}
          className={ACTION_BTN_CLASS}
        />
      )}
    </div>
  );
});

// 静态 Markdown 内容组件 - 只在非流式时渲染
const MarkdownContent = memo(function MarkdownContent({
  content,
  anchorMap,
  onOpenCitation,
}: {
  content: string;
  anchorMap?: Map<number, CitationAnchor>;
  onOpenCitation?: (anchor: CitationAnchor) => void;
}) {
  // 提取子元素中的纯文本内容，过滤掉复杂对象
  const getTextContent = useCallback((child: any): string => {
    if (typeof child === 'string') return child;
    if (Array.isArray(child)) return child.map(getTextContent).join('');
    if (child && typeof child === 'object' && child.props && child.props.children) {
      return getTextContent(child.props.children);
    }
    return '';
  }, []);

  // 使用 useMemo 缓存 components 配置，避免每次渲染都创建新对象
  const components = useMemo(
    () => ({
      pre({ children }: any) {
        // pre 标签专门包裹代码块（react-markdown v10 保证行内代码绝不走 pre）
        if (React.isValidElement(children)) {
          const codeProps: any = children.props || {};
          const className = codeProps.className || '';
          const match = /language-(\w+)/.exec(className);
          const language = match ? match[1] : 'text';
          const textContent = getTextContent(codeProps.children);
          return (
            <CodeBlock language={language} className={className}>
              {textContent.replace(/\n$/, '')}
            </CodeBlock>
          );
        }
        return <pre>{children}</pre>;
      },
      code({ node, className, children, ...props }: any) {
        // 行内代码（inline code）：渲染优雅的单行徽标样式，杜绝误染为独立多行代码块卡片
        return (
          <code
            className={cn(
              'rounded-md bg-[#F3F6FF] px-1.5 py-0.5 font-mono text-sm text-indigo-600 dark:bg-slate-800 dark:text-indigo-300',
              className
            )}
            {...props}
          >
            {children}
          </code>
        );
      },
      // 链接与脚注引用处理：若命中 GFM footnote 引用，转换为可点击交互的 CitationBadge (QA-004)
      a({ href, children, ...props }: any) {
        if (
          props['data-footnote-ref'] ||
          href?.startsWith('#user-content-fn-') ||
          href?.startsWith('#fn-')
        ) {
          const num = parseInt(String(children), 10);
          if (!isNaN(num)) {
            const anchor = anchorMap?.get(num);
            return (
              <CitationBadge
                index={num}
                anchor={anchor}
                onOpenCitation={onOpenCitation}
              />
            );
          }
        }
        return (
          <a href={href} {...props}>
            {children}
          </a>
        );
      },
      // 代码围栏紧跟段落（无空行）时会被解析为段落内元素：SafeParagraph 统一处理为 div，并包装可点击 [^n] 引用
      p({ children, ...props }: any) {
        const wrapped = wrapCitationsInReactNode(children, anchorMap, onOpenCitation);
        return <SafeParagraph {...props}>{wrapped}</SafeParagraph>;
      },
      // 列表项同样支持解析正文内 [^n] 引用
      li({ children, ...props }: any) {
        const wrapped = wrapCitationsInReactNode(children, anchorMap, onOpenCitation);
        return <li {...props}>{wrapped}</li>;
      },
    }),
    [anchorMap, onOpenCitation, getTextContent]
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
          'bg-gradient-to-br from-blue-400/[0.22] via-indigo-400/[0.14] to-cyan-400/20',
          'blur-[7px] motion-safe:animate-avatar-glow-breathe',
          'dark:from-blue-500/[0.28] dark:via-indigo-500/[0.18] dark:to-cyan-500/[0.22]'
        )}
      />
      <div
        className={cn(
          'relative z-[1] flex h-10 w-10 items-center justify-center rounded-2xl',
          'border border-blue-200/55 bg-gradient-to-br from-blue-500/[0.14] via-indigo-500/10 to-cyan-500/[0.14]',
          'text-blue-600 backdrop-blur-xl',
          'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.45),0_6px_16px_-6px_rgba(59,130,246,0.14)]',
          'dark:border-blue-500/[0.22] dark:from-blue-500/[0.18] dark:via-indigo-500/[0.12] dark:to-cyan-500/[0.16]',
          'dark:text-blue-300',
          'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_6px_16px_-6px_rgba(59,130,246,0.1)]'
        )}
      >
        <ChatAiMark className="h-[22px] w-[22px]" />
      </div>
    </div>
  );
});

// 首字节等待骨架屏（语义：等待上游首个增量到达的加载态，不冒充思考内容）
// 2026-10-15 评审 H3：长时间无反馈死锁——加入已等待秒数与分级提示（10s/45s 两档）
const FIRST_BYTE_HINT_SLOW_MS = 10_000;
const FIRST_BYTE_HINT_STUCK_MS = 45_000;

const ThinkingIndicator = memo(function ThinkingIndicator() {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const hint =
    elapsedMs >= FIRST_BYTE_HINT_STUCK_MS
      ? '响应时间较长，可停止后换个模型重试'
      : elapsedMs >= FIRST_BYTE_HINT_SLOW_MS
        ? '模型响应较慢，请稍候'
        : null;

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
        {elapsedSeconds > 0 && (
          <span className="tabular-nums text-xs font-normal text-day-muted dark:text-slate-400">
            已等待 {elapsedSeconds} 秒
          </span>
        )}
      </div>
      {hint && (
        <p className="text-xs text-day-muted dark:text-slate-400 -mt-2">{hint}</p>
      )}

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

// 思考过程块：渲染模型真实推理流（reasoning-delta 驱动），豆包官方同款折叠时序。
// 状态机见 docs/features/2026-10-01-chat-reasoning-stream/spec.md §5：
// 推理期（流式且无正文）默认展开 → 首个正文增量到达即自动折叠（仅这一次）→ 用户手动操作后不再自动干预。
const ThinkingBlock = memo(function ThinkingBlock({
  reasoning,
  durationMs,
  defaultExpanded,
  isStreaming,
}: {
  reasoning: string;
  /** 冻结后的思考时长（分界点写入）；未冻结表示推理仍在进行 */
  durationMs?: number;
  /** 默认展开态纯数据驱动：流式中且无正文时为 true；正文一旦到达转为 false 且不可逆（自动折叠只发生一次） */
  defaultExpanded: boolean;
  isStreaming: boolean;
}) {
  // 用户手动展开/收起的覆盖态：一旦设置，该消息内不再被自动时序干预
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const expanded = userOverride ?? defaultExpanded;

  // 计时：组件随首个 reasoning-delta 挂载，推理流式中按 1s 跳动；durationMs 冻结后定格
  // （DESIGN.md §9：计时数字强制 tabular-nums）
  const mountTsRef = useRef(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const ticking = isStreaming && durationMs === undefined;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setElapsedMs(Date.now() - mountTsRef.current), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  const shownSeconds =
    durationMs !== undefined ? Math.round(durationMs / 1000) : Math.round(elapsedMs / 1000);

  return (
    <div className="mb-3 rounded-xl border-l-2 border-slate-300 pl-3 dark:border-slate-600">
      {/* 折叠头：整行可点；DESIGN.md §2.6 浅色次要文字用 day-muted，深色中性 slate 表面允许 slate-400 */}
      <button
        type="button"
        onClick={() => setUserOverride(!expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? '收起思考过程' : '展开思考过程'}
        className="flex min-h-[44px] w-full items-center gap-1.5 text-xs text-day-muted dark:text-slate-400 md:min-h-[32px]"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span className="tabular-nums">
          {ticking
            ? `思考中… ${shownSeconds} 秒`
            : shownSeconds > 0
              ? `已思考 ${shownSeconds} 秒`
              : '已思考'}
        </span>
      </button>
      {/* 推理内容：纯文本渲染（不跑 markdown，省流式重渲染预算），弱化于正文 */}
      {expanded && (
        <div className="whitespace-pre-wrap pb-2 text-xs leading-6 text-day-muted dark:text-slate-400 animate-in fade-in-0 duration-fast">
          {reasoning}
          {/* 流式光标：与正文 StreamingContent 同款的蓝条 pulse（DESIGN.md §10 chat 标志装置） */}
          {isStreaming && (
            <span className="ml-1 inline-block h-4 w-1.5 rounded-sm bg-blue-500 align-[-2px] animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
});

// 主消息组件
export const MessageItem = memo(function MessageItem({
  message,
  onRegenerate,
  onOpenCitation,
}: MessageItemProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming ?? false;

  // 构造 1-based 物理切片锚点索引表 (ADR-0025)
  const anchorMap = useMemo(() => {
    if (!message.citations) return undefined;
    const map = new Map<number, CitationAnchor>();
    for (const [key, anchor] of Object.entries(message.citations)) {
      const idx = Number(key);
      if (!isNaN(idx) && anchor) {
        map.set(idx, anchor);
      }
    }
    return map;
  }, [message.citations]);
  // 是否持有 agent 过程记录（工具调用或过程旁白；决定过程卡片是否渲染；非 agent 轮次自然为 0）
  const hasAgentTrace =
    !isUser && Boolean(message.toolCalls?.length || message.agentNotes?.length);
  // 首字节等待态：AI 消息 + 流式中 + 推理/正文/工具记录均未到达（骨架屏展示条件）
  // 工具记录也算「已有产出」：决策步只产 tool_call 时不挂骨架屏，视觉由过程卡片接管
  const isAwaitingFirstByte =
    !isUser && isStreaming && !message.content && !message.reasoningContent && !hasAgentTrace;
  // 是否持有真实推理内容（决定思考块整棵子树是否渲染；无推理的模型/轮次自然退化）
  const hasReasoning = !isUser && !!message.reasoningContent;
  // 附件：用户消息为用户上传件，AI 消息为 agent 工具产出件（如生成的图片）
  const hasAttachments = message.attachments && message.attachments.length > 0;

  // 是否包含检索类工具调用（QA-004：知识库检索来源元信息计数）
  const retrievalToolCalls = useMemo(() => {
    return (message.toolCalls ?? []).filter(
      (tc) =>
        (tc.name === 'knowledge_search' || tc.name === 'memory_search') &&
        tc.status === 'success'
    );
  }, [message.toolCalls]);
  const hasRetrievalSource = !isUser && retrievalToolCalls.length > 0;
  const citationIndices = useMemo(() => {
    return extractCitationIndices(message.content);
  }, [message.content]);

  // 接力：仅非流式、非空的 AI 助手回答可发起（REQ-007）
  const currentModel = useChatStore((s) => s.model);
  const currentProvider = useChatStore((s) => s.provider);
  const canRelay = !isUser && !isStreaming && !isAwaitingFirstByte && message.content.trim().length > 0;
  // 气泡容器 ref：用于判定用户是否在气泡内选中了片段（REQ-009 选区优先）
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const relay = useRelayLauncher({
    sourceType: 'text',
    selectionRootRef: bubbleRef,
    disabledReason: !canRelay
      ? isStreaming || isAwaitingFirstByte
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
    <div
      className={cn(
        'flex w-full mb-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-fast ease-out-expo',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'flex w-full flex-col gap-2 md:gap-4',
          isUser ? 'items-end md:items-start md:flex-row-reverse' : 'items-start md:flex-row'
        )}
      >
        {/* 头像 */}
        {isUser ? <UserAvatar /> : <AIAvatar />}

        {/* 内容 */}
        {/* min-w-0：解除 flex 子项「min-width:auto = min-content」下限。否则气泡内
            不换行长内容（如 agent 过程卡里 truncate 的参数摘要）会把祖先 flex 子项
            撑宽到超出消息列表，滚动容器因此出现横向导航条 */}
        <div
          className={cn(
            'relative group flex flex-col min-w-0',
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
            <span className={cn('font-medium', isAwaitingFirstByte ? 'text-blue-500 animate-pulse' : '')}>
              {isUser ? '用户' : isAwaitingFirstByte ? 'AI 思考中...' : 'AI 助手'}
            </span>
          </div>

          {/* 消息气泡 */}
          <div
            ref={bubbleRef}
            onContextMenu={!isUser ? relay.onContextMenu : undefined}
            {...(!isUser ? relay.longPressProps : {})}
            className={cn(
              // min-w-0：气泡是纵向 flex 容器的子项，同上解除 min-content 下限，
              // 让宽度由消息容器（而非内部最长不换行内容）决定
              'max-w-full min-w-0 break-words rounded-[24px] px-5 py-4 text-[15px] leading-relaxed shadow-[0_10px_26px_rgba(76,95,154,0.08)]',
              // AI 回复用实色面而非长渐变：近似等亮度的长半透明渐变会被渲染器抖出色带，在缩放或高分屏下呈横向条纹
              isUser
                ? 'w-full rounded-tr-[10px] border border-blue-400/20 bg-[linear-gradient(135deg,#4969E9_0%,#5D7CFA_56%,#7D91FF_100%)] text-white md:w-fit'
                : 'rounded-tl-[10px] border border-slate-200/70 bg-white text-slate-800 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-200',
              // 首字节等待态下，气泡宽度设为更宽以容纳骨架屏
              isAwaitingFirstByte ? 'w-full max-w-[500px]' : ''
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
                {/* 思考块位于气泡内、正文上方；无推理内容时整棵子树不渲染（讯飞模型/无推理轮次自然退化） */}
                {hasReasoning && (
                  <ThinkingBlock
                    reasoning={message.reasoningContent ?? ''}
                    durationMs={message.reasoningDurationMs}
                    defaultExpanded={isStreaming && !message.content}
                    isStreaming={isStreaming}
                  />
                )}
                {/* agent 过程卡片：位于气泡内、正文上方；复用思考块同一套折叠时序。
                    非 agent 轮次无 toolCalls/agentNotes，整棵子树不渲染（降级无感知） */}
                {hasAgentTrace && (
                  <AgentTrace
                    toolCalls={message.toolCalls ?? []}
                    agentNotes={message.agentNotes}
                    isStreaming={isStreaming}
                  />
                )}
                {/* 工具产出附件（当前仅生成图片）：按时间序位于过程卡片之后、正文之前 */}
                {hasAttachments && <AttachmentList attachments={message.attachments} />}
                {isAwaitingFirstByte ? (
                  <ThinkingIndicator />
                ) : isStreaming ? (
                  // 推理阶段（无正文）此处渲染为空，流式光标由思考块内部承担
                  message.content ? (
                    <StreamingContent
                      content={message.content}
                      anchorMap={anchorMap}
                      onOpenCitation={onOpenCitation}
                    />
                  ) : null
                ) : (
                  <>
                    <MarkdownContent
                      content={message.content}
                      anchorMap={anchorMap}
                      onOpenCitation={onOpenCitation}
                    />
                    {message.truncationWarning && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                        {message.truncationWarning}
                      </div>
                    )}
                    {message.stopped && (
                      // DESIGN.md §2.6：浅色次要文字用 day-muted（白底过 AA）；深色中性 slate 表面允许 slate-400
                      // 空内容停止（用户抢先停止且无产出）与部分停止的文案区分（2026-10-15 评审 H3）
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-day-muted dark:text-slate-400">
                        <Square className="h-3 w-3" />
                        <span>{message.content ? '已停止 · 内容可能不完整' : '已停止 · 未生成内容'}</span>
                      </div>
                    )}
                    {message.failed && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3" />
                        <span>生成中断 · 内容可能不完整</span>
                      </div>
                    )}
                    {message.usage && (
                      <div className="mt-2 text-xs text-day-muted dark:text-slate-400">
                        {formatUsageText(message.usage)}
                      </div>
                    )}
                    {/* 知识库检索来源元信息行（QA-004） */}
                    {hasRetrievalSource && (
                      <div
                        data-testid="retrieval-source-meta"
                        className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium"
                      >
                        <BookOpen className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          已参考知识库来源
                          {citationIndices.length > 0 ? ` · ${citationIndices.length} 处引用` : ''}
                        </span>
                      </div>
                    )}
                    {/* 知识库引用来源折叠卡片 (ADR-0025 / TC04) */}
                    {!isUser && message.citations && Object.keys(message.citations).length > 0 && (
                      <CitationReferenceCard
                        citations={message.citations}
                        onSelectCitation={onOpenCitation}
                      />
                    )}
                  </>
                )}
                {/* 关联产物卡片清单（ADR-0015） */}
                {message.artifactIds && message.artifactIds.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {message.artifactIds.map((artId) => (
                      <ArtifactCard key={artId} artifactId={artId} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 操作按钮 - 同时显示给用户和 AI，但在流式传输期间不显示 */}
          {!isStreaming && !isAwaitingFirstByte && (
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
