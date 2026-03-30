'use client';

import { useMemo } from 'react';
import type { DestinyReport } from '../types';
import { AICoPilotConversation, buildCopilotContext } from './ai-copilot-conversation';

export function AICoPilotPanel({ report }: { report: DestinyReport }) {
  const ctxHint = useMemo(() => buildCopilotContext(report), [report]);
  const sessionKey = useMemo(
    () => `${report.profile.birthText}|${report.profile.locationText}|${report.timeline[0]?.year ?? ''}`,
    [report]
  );

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-white/30 bg-white/35">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-900">AI Co-Pilot</div>
            <div className="text-xs text-slate-500 truncate">{ctxHint}</div>
          </div>
        </div>
      </div>

      <AICoPilotConversation report={report} sessionKey={sessionKey} className="flex-1 min-h-0" />
    </div>
  );
}
