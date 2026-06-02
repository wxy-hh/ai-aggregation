'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
import type { DestinyCopilotDecadeFocus } from './destiny-copilot-types';

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

const PANEL_EASE = [0.32, 0.72, 0, 1] as const;

function reportSessionKey(report: DestinyReport, focusDecadeName?: string | null) {
  const pillars = report.pillars.map((p) => `${p.label}:${p.stem}${p.branch}`).join('|');
  const elements = report.elements.map((e) => `${e.key}:${e.value}`).join('|');
  const lifeDimensions =
    report.lifeDimensions?.map((item) => `${item.key}:${item.value}`).join('|') || '';
  const tenGodDomains =
    report.tenGodDomains?.map((item) => `${item.key}:${item.value}`).join('|') || '';
  return `${report.profile.birthText}|${report.profile.locationText}|${pillars}|${elements}|${lifeDimensions}|${tenGodDomains}|focus:${focusDecadeName ?? 'general'}`;
}

export function AICoPilotDrawer({
  open,
  onOpenChange,
  report,
  focusDecade = null,
  queuedQuestion: queuedQuestionProp = null,
  onQueuedQuestionHandled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: DestinyReport;
  /** 从十年大运弹层进入时，展示聚焦步运 */
  focusDecade?: DestinyCopilotDecadeFocus | null;
  queuedQuestion?: QueuedQuestion | null;
  onQueuedQuestionHandled?: (id: number) => void;
}) {
  const [localQueuedQuestion, setLocalQueuedQuestion] = useState<QueuedQuestion | null>(null);
  const queuedQuestion = queuedQuestionProp ?? localQueuedQuestion;
  const [sending, setSending] = useState(false);
  const reduceMotion = useReducedMotion();

  const summary = useMemo(() => buildCopilotContext(report), [report]);
  const sessionKey = useMemo(
    () => reportSessionKey(report, focusDecade?.decadeName),
    [report, focusDecade?.decadeName]
  );

  const overlayTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.28, ease: PANEL_EASE };

  const panelTransition = reduceMotion
    ? { duration: 0.01 }
    : { type: 'spring' as const, damping: 36, stiffness: 420, mass: 0.82, restDelta: 0.001 };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        forceMount
        showClose={false}
        hideOverlay
        contentAnimation="none"
        className={cn(
          'fixed inset-0 z-50 max-w-none translate-x-0 translate-y-0',
          'border-0 bg-transparent p-0 shadow-none',
          'grid-cols-1 gap-0 rounded-none',
          'pointer-events-none data-[state=open]:pointer-events-auto'
        )}
      >
        <DialogTitle className="sr-only">AI Co-Pilot 追问</DialogTitle>
        <DialogDescription className="sr-only">根据当前测算报告进行多轮追问。</DialogDescription>

        <AnimatePresence>
          {open ? (
            <div key="copilot-layer" className="pointer-events-auto fixed inset-0 z-50">
              <motion.button
                type="button"
                aria-label="关闭追问面板"
                className="absolute inset-0 bg-slate-900/22"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={overlayTransition}
                onClick={() => onOpenChange(false)}
              />

              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="copilot-drawer-title"
                className={cn(
                  'absolute inset-y-0 right-0 flex w-[min(560px,calc(100vw-2rem))] max-w-[560px] flex-col',
                  'border-l border-slate-200/80 bg-[#f8fafc] shadow-[-24px_0_64px_-36px_rgba(15,23,42,0.38)]',
                  'dark:border-white/10 dark:bg-slate-950',
                  'transform-gpu will-change-transform'
                )}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={panelTransition}
              >
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                  <div className="border-b border-slate-200/60 bg-[#f8fafc] px-4 py-4 dark:border-white/10 dark:bg-slate-950">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          id="copilot-drawer-title"
                          className="text-sm font-extrabold text-slate-900 dark:text-slate-100"
                        >
                          AI Co-Pilot 追问
                        </div>
                        <div className="mt-1 break-words pr-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                          {summary}
                        </div>
                        {focusDecade ? (
                          <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full border border-[#5D7CFA]/25 bg-[#5D7CFA]/10 px-2 py-0.5 text-[10px] font-bold text-[#5D7CFA] dark:text-[#9BADFF]">
                            <span className="shrink-0">聚焦</span>
                            <span className="truncate">{focusDecade.label}</span>
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className={cn(
                          'rounded-xl p-2 text-slate-400/90 transition-colors duration-200',
                          'hover:bg-slate-100/80 hover:text-slate-600',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4969E9]/25',
                          'dark:hover:bg-slate-800/80 dark:hover:text-slate-200'
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
                            setLocalQueuedQuestion({
                              id: Date.now() + idx,
                              text: item.question,
                            })
                          }
                          className={cn(
                            'h-9 min-h-[36px] rounded-full px-3 text-xs font-bold',
                            'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50',
                            'dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
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
                    focusDecadeName={focusDecade?.decadeName}
                    queuedQuestion={queuedQuestion}
                    onQueuedQuestionHandled={(id) => {
                      onQueuedQuestionHandled?.(id);
                      setLocalQueuedQuestion((current) => (current?.id === id ? null : current));
                    }}
                    onSendingChange={setSending}
                    className="min-h-0 flex-1"
                  />
                </div>
              </motion.div>
            </div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
