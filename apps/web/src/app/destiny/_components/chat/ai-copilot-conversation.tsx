'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { authHeaders } from '@/lib/api/client';
import { consumeChatResponse } from '@/lib/utils/chat-stream';
import type { DestinyReport } from '../types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ThinkingParticles } from './thinking-particles';

type MsgStatus = 'complete' | 'thinking' | 'typing';
type Msg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: MsgStatus;
  displayedContent?: string;
};

export type QueuedQuestion = {
  id: number;
  text: string;
};

const WELCOME_MESSAGE =
  '我是你的专属 AI 顾问。你可以直接追问报告里的任何一句话，例如：\n“报告说我今年适合变动，具体几月份最稳？”';

export function buildCopilotContext(report: DestinyReport) {
  const pillars = report.pillars.map((p) => `${p.label}:${p.stem}${p.branch}`).join('，');
  const elements = report.elements.map((e) => `${e.label}${e.value}`).join('，');
  return `盘面摘要：${report.profile.genderLabel}；四柱=${pillars}；五行能量=${elements}。`;
}

function initialMessages(): Msg[] {
  return [{ id: 'm0', role: 'assistant', content: WELCOME_MESSAGE, status: 'complete' }];
}

export function AICoPilotConversation({
  report,
  sessionKey,
  queuedQuestion,
  onQueuedQuestionHandled,
  onSendingChange,
  className,
}: {
  report: DestinyReport;
  sessionKey: string;
  queuedQuestion?: QueuedQuestion | null;
  onQueuedQuestionHandled?: (id: number) => void;
  onSendingChange?: (sending: boolean) => void;
  className?: string;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>(() => initialMessages());
  const sendingRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const canSend = input.trim().length > 0;
  const ctxSummary = useMemo(() => buildCopilotContext(report), [report]);

  useEffect(() => {
    sendingRef.current = sending;
    onSendingChange?.(sending);
  }, [onSendingChange, sending]);

  useEffect(() => {
    setInput('');
    setError(null);
    setMessages(initialMessages());
    setSending(false);
    sendingRef.current = false;
  }, [sessionKey]);

  const scrollToBottom = () => {
    queueMicrotask(() =>
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    );
  };

  // 打字机效果
  const startTypingEffect = (msgId: string, fullContent: string) => {
    let charIndex = 0;
    const typeNextChar = () => {
      if (charIndex < fullContent.length) {
        charIndex++;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, displayedContent: fullContent.slice(0, charIndex), status: 'typing' }
              : m
          )
        );
        scrollToBottom();
        typingTimerRef.current = setTimeout(typeNextChar, 25); // 25ms/字符
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, displayedContent: fullContent, status: 'complete' } : m
          )
        );
        scrollToBottom();
      }
    };
    typeNextChar();
  };

  // 跳过打字机动画
  const skipTyping = (msgId: string) => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, displayedContent: m.content, status: 'complete' } : m
      )
    );
  };

  const sendQuestion = async (rawQuestion?: string) => {
    const q = (rawQuestion ?? input).trim();
    if (!q || sendingRef.current) return;

    setError(null);
    setInput('');
    setSending(true);
    sendingRef.current = true;

    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: q, status: 'complete' };
    const thinkingMsg: Msg = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      status: 'thinking',
    };
    const nextMessages = [...messages, userMsg, thinkingMsg];
    setMessages(nextMessages);
    scrollToBottom();

    try {
      const response = await fetch('/api/destiny/copilot', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          report,
          question: q,
        }),
      });

      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || '追问失败，请稍后重试');
      }

      let streamedAnswer = '';
      await consumeChatResponse(response, (chunk) => {
        streamedAnswer += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === thinkingMsg.id
              ? {
                  ...m,
                  content: streamedAnswer,
                  displayedContent: streamedAnswer,
                  status: 'typing',
                }
              : m
          )
        );
        scrollToBottom();
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsg.id
            ? {
                ...m,
                content: streamedAnswer || '本次追问没有返回内容，请稍后重试。',
                displayedContent: streamedAnswer || '本次追问没有返回内容，请稍后重试。',
                status: 'complete',
              }
            : m
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '追问失败，请稍后重试';
      setError(message);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsg.id
            ? {
                ...m,
                content: `本次追问暂时失败：${message}`,
                displayedContent: `本次追问暂时失败：${message}`,
                status: 'complete',
              }
            : m
        )
      );
    } finally {
      setSending(false);
      sendingRef.current = false;
      scrollToBottom();
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!queuedQuestion) return;
    void sendQuestion(queuedQuestion.text);
    onQueuedQuestionHandled?.(queuedQuestion.id);
    // sessionKey 变化会重置会话后再消费新的快捷问题
  }, [queuedQuestion?.id, sessionKey]);

  return (
    <div className={cn('min-h-0 flex flex-col', className)}>
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar"
      >
        {messages.map((m) => {
          const isUser = m.role === 'user';
          const isThinking = m.status === 'thinking';
          const isTyping = m.status === 'typing';
          const displayContent = m.displayedContent ?? m.content;

          return (
            <div
              key={m.id}
              className={cn('max-w-[92%] rounded-2xl border shadow-sm', {
                'ml-auto bg-[#2F6BFF]/10 border-[#2F6BFF]/20': isUser,
                'mr-auto bg-white/65 border-slate-200/70': !isUser,
              })}
            >
              {isThinking ? (
                <ThinkingParticles />
              ) : (
                <div className="p-3 text-sm leading-relaxed text-slate-700">
                  <pre className="whitespace-pre-wrap break-words font-sans">{displayContent}</pre>
                  {isTyping && (
                    <button
                      type="button"
                      onClick={() => skipTyping(m.id)}
                      className="mt-2 text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                      立即显示全部
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-200/60 bg-white/55">
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的追问…（Enter 发送，Shift+Enter 换行）"
            className="min-h-[84px] resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendQuestion();
              }
            }}
          />
          <div className="mt-3 flex items-center justify-end gap-3">
            {error && (
              <div className="min-w-0 flex-1 text-xs leading-relaxed text-red-500 break-words">
                {error}
              </div>
            )}
            <Button
              type="button"
              onClick={() => void sendQuestion()}
              disabled={!canSend || sending}
              className={cn(
                'rounded-full font-extrabold bg-[#2F6BFF] text-white',
                'hover:brightness-110 active:brightness-95 transition'
              )}
            >
              {sending ? '发送中...' : '发送'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
