'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { DestinyCopilotResponse, DestinyReport } from '../types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

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
  return [{ id: 'm0', role: 'assistant', content: WELCOME_MESSAGE }];
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

  const sendQuestion = async (rawQuestion?: string) => {
    const q = (rawQuestion ?? input).trim();
    if (!q || sendingRef.current) return;

    setError(null);
    setInput('');
    setSending(true);
    sendingRef.current = true;

    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: q };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    try {
      const response = await fetch('/api/destiny/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportSummary: buildCopilotContext(report),
          messages: nextMessages.slice(1).map((m) => ({ role: m.role, content: m.content })),
          question: q,
        }),
      });

      const json = (await response.json()) as DestinyCopilotResponse | { error?: string };
      if (!response.ok || !('answer' in json)) {
        throw new Error(('error' in json && json.error) || '追问失败，请稍后重试');
      }

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: json.answer },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '追问失败，请稍后重试';
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-err-${Date.now()}`,
          role: 'assistant',
          content: `本次追问暂时失败：${message}`,
        },
      ]);
    } finally {
      setSending(false);
      sendingRef.current = false;
      scrollToBottom();
    }
  };

  useEffect(() => {
    if (!queuedQuestion) return;
    void sendQuestion(queuedQuestion.text);
    onQueuedQuestionHandled?.(queuedQuestion.id);
    // sessionKey 变化会重置会话后再消费新的快捷问题
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedQuestion?.id, sessionKey]);

  return (
    <div className={cn('min-h-0 flex flex-col', className)}>
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn('max-w-[92%] rounded-2xl border p-3 text-sm leading-relaxed shadow-sm', {
              'ml-auto bg-[#2F6BFF]/10 border-[#2F6BFF]/20 text-slate-800': m.role === 'user',
              'mr-auto bg-white/65 border-slate-200/70 text-slate-700': m.role === 'assistant',
            })}
          >
            <pre className="whitespace-pre-wrap break-words font-sans">{m.content}</pre>
          </div>
        ))}
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
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0 text-xs leading-relaxed text-slate-500 break-words">
              {error ?? `提示：追问时可引用年份或具体模块。${ctxSummary}`}
            </div>
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
