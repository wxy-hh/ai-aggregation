'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DestinyReport } from '../types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AICoPilotConversation,
  buildCopilotContext,
  type QueuedQuestion,
} from './ai-copilot-conversation';

const QUICK_ASKS = [
  {
    key: 'career',
    label: '事业',
    question: '请基于我的当前盘面与报告，聚焦接下来三个月的事业走势，给出机会、风险和行动建议。',
  },
  {
    key: 'love',
    label: '爱情',
    question: '请基于我的当前盘面与报告，聚焦接下来三个月的感情走势，给出机会、风险和行动建议。',
  },
  {
    key: 'wealth',
    label: '财运',
    question: '请基于我的当前盘面与报告，聚焦接下来三个月的财运走势，给出机会、风险和行动建议。',
  },
  {
    key: 'health',
    label: '健康',
    question: '请基于我的当前盘面与报告，聚焦接下来三个月的健康走势，给出机会、风险和行动建议。',
  },
] as const;

function reportSessionKey(report: DestinyReport) {
  const pillars = report.pillars.map((p) => `${p.label}:${p.stem}${p.branch}`).join('|');
  const elements = report.elements.map((e) => `${e.key}:${e.value}`).join('|');
  const lifeDimensions = report.lifeDimensions?.map((item) => `${item.key}:${item.value}`).join('|') || '';
  const tenGodDomains = report.tenGodDomains?.map((item) => `${item.key}:${item.value}`).join('|') || '';
  return `${report.profile.birthText}|${report.profile.locationText}|${pillars}|${elements}|${lifeDimensions}|${tenGodDomains}`;
}

export function AICoPilotDrawer({
  open,
  onOpenChange,
  report,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: DestinyReport;
}) {
  const [queuedQuestion, setQueuedQuestion] = useState<QueuedQuestion | null>(null);
  const [sending, setSending] = useState(false);

  const summary = useMemo(() => buildCopilotContext(report), [report]);
  const sessionKey = useMemo(() => reportSessionKey(report), [report]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        forceMount
        showClose={false}
        overlayClassName="bg-slate-900/18 backdrop-blur-[1px]"
        className={cn(
          'left-auto right-0 top-0 h-[100dvh] w-[min(560px,calc(100vw-88px))] max-w-[560px]',
          'translate-x-0 translate-y-0 p-0 border-0 bg-transparent shadow-none',
          'rounded-none',
          'data-[state=closed]:pointer-events-none',
          'motion-reduce:transition-none motion-reduce:data-[state=closed]:translate-x-0'
        )}
      >
        <DialogTitle className="sr-only">AI Co-Pilot 追问</DialogTitle>
        <DialogDescription className="sr-only">根据当前测算报告进行多轮追问。</DialogDescription>

        <div
          className={cn(
            'h-full min-h-0 overflow-hidden flex flex-col border-l border-white/55 bg-white/82 backdrop-blur-[24px]',
            'shadow-[-28px_0_80px_-45px_rgba(15,23,42,0.45)]'
          )}
        >
          <div className="px-4 py-4 border-b border-slate-200/65 bg-white/65">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">AI Co-Pilot 追问</div>
                <div className="mt-1 pr-1 text-xs leading-relaxed text-slate-500 break-words">
                  {summary}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={cn(
                  'rounded-xl p-2 text-slate-400/90 hover:text-slate-600 hover:bg-white/45',
                  'transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/25'
                )}
              >
                <X className="h-5 w-5" />
                <span className="sr-only">关闭</span>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_ASKS.map((item, idx) => (
                <Button
                  key={item.key}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={sending}
                  onClick={() =>
                    setQueuedQuestion({
                      id: Date.now() + idx,
                      text: item.question,
                    })
                  }
                  className={cn(
                    'h-8 rounded-full px-3 text-xs font-bold',
                    'bg-white/70 border-slate-200/80 text-slate-700 hover:bg-white'
                  )}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <AICoPilotConversation
            report={report}
            sessionKey={sessionKey}
            queuedQuestion={queuedQuestion}
            onQueuedQuestionHandled={(id) => {
              setQueuedQuestion((current) => (current?.id === id ? null : current));
            }}
            onSendingChange={setSending}
            className="flex-1 min-h-0"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
