'use client';

import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { DestinyReport } from '../reports/mock';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

function buildContext(report: DestinyReport) {
  const pillars = report.pillars.map((p) => `${p.label}:${p.stem}${p.branch}`).join('，');
  const elements = report.elements.map((e) => `${e.label}${e.value}`).join('，');
  return `盘面摘要：${report.profile.genderLabel}；四柱=${pillars}；五行能量=${elements}。`;
}

function answerWithMock(report: DestinyReport, question: string) {
  const base = buildContext(report);
  return [
    `我先基于你的盘面做一个“命理逻辑 + 现实逻辑”的拆解。`,
    '',
    `【盘面线索】${base}`,
    `【你的问题】${question}`,
    '',
    `【命理逻辑】今年更适合“有节奏的变动”，不是盲目跳跃，而是围绕一个更高的平台做迁移。`,
    `【现实逻辑】建议把变动拆成两步：先验证机会（2-4 周），再承诺长期投入（8-12 周）。`,
    '',
    `如果你愿意，把你当前行业/岗位/目标（涨薪、转岗、创业、读研等）补充一下，我可以把建议落到月份与行动清单。`,
  ].join('\n');
}

export function AICoPilotPanel({ report }: { report: DestinyReport }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>(() => [
    {
      id: 'm0',
      role: 'assistant',
      content:
        '我是你的专属 AI 顾问。你可以直接追问报告里的任何一句话，例如：\n“报告说我今年适合变动，具体几月份最稳？”',
    },
  ]);
  const listRef = useRef<HTMLDivElement | null>(null);

  const canSend = input.trim().length > 0;
  const ctxHint = useMemo(() => buildContext(report), [report]);

  const send = () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: q },
      { id: `a-${Date.now()}`, role: 'assistant', content: answerWithMock(report, q) },
    ]);
    queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-white/30 bg-white/35">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-900">AI Co-Pilot</div>
            <div className="text-xs text-slate-500 truncate">{ctxHint}</div>
          </div>
          <div className="text-[11px] font-bold text-slate-400 tracking-[0.18em] uppercase">
            Context-Aware
          </div>
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn('max-w-[92%] rounded-2xl border p-3 text-sm leading-relaxed shadow-sm', {
              'ml-auto bg-[#2F6BFF]/10 border-[#2F6BFF]/20 text-slate-800': m.role === 'user',
              'mr-auto bg-white/55 border-white/45 text-slate-700': m.role === 'assistant',
            })}
          >
            <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-white/30 bg-white/35">
        <div className="rounded-2xl border border-white/40 bg-white/55 p-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的追问…（Enter 发送，Shift+Enter 换行）"
            className="min-h-[84px] resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              提示：追问时可以引用年份、模块（事业/财运等）或具体术语
            </div>
            <Button
              type="button"
              onClick={send}
              disabled={!canSend}
              className={cn(
                'rounded-full font-extrabold bg-[#2F6BFF] text-white',
                'hover:brightness-110 active:brightness-95 transition'
              )}
            >
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

