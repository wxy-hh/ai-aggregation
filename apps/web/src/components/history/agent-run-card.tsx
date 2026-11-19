'use client';

import React from 'react';
import { Play, Eye, Trash2, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentRunRecord } from '@/lib/api/agent-runs';

interface AgentRunCardProps {
  run: AgentRunRecord;
  onViewDetail: (run: AgentRunRecord) => void;
  onRerun: (run: AgentRunRecord) => void;
  onDelete: (run: AgentRunRecord) => void;
}

const OUTCOME_TAGS = {
  success: {
    label: '成功',
    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40',
  },
  partial: {
    label: '部分',
    className: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40',
  },
  failed: {
    label: '失败',
    className: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300 border-red-200/60 dark:border-red-800/40',
  },
};

export function AgentRunCard({
  run,
  onViewDetail,
  onRerun,
  onDelete,
}: AgentRunCardProps) {
  const tag = OUTCOME_TAGS[run.outcome] ?? OUTCOME_TAGS.failed;
  const durationText = `${(run.durationMs / 1000).toFixed(1)}s`;

  return (
    <div
      data-testid={`agent-run-card-${run.id}`}
      onClick={() => onViewDetail(run)}
      className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400/50 hover:shadow-md cursor-pointer dark:border-white/10 dark:bg-slate-900/90 dark:hover:border-blue-500/40"
    >
      <div>
        {/* 卡片头部：状态 + 步数 + 耗时 */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                tag.className
              )}
            >
              {tag.label}
            </span>
            {run.capabilityPack && (
              <span className="hidden sm:inline-block rounded-md bg-slate-100 dark:bg-white/5 px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                {run.capabilityPack}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="tabular-nums font-medium">{run.steps} 步</span>
            <span>·</span>
            <span className="tabular-nums font-medium">{durationText}</span>
          </div>
        </div>

        {/* 目标文本 Prompt */}
        <h4 className="line-clamp-2 text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {run.goalText}
        </h4>
      </div>

      {/* 卡片底部操作与消耗 */}
      <div
        className="mt-5 pt-3.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs font-medium text-slate-400">
          消耗{' '}
          <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
            {run.quotaCost.toLocaleString()}
          </span>{' '}
          点
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetail(run);
            }}
            aria-label="查看运行详情"
            className="h-9 px-2.5 text-xs text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            详情
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRerun(run);
            }}
            aria-label="以相同目标重跑"
            className="h-9 px-2.5 text-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-900/60 dark:text-blue-400 dark:hover:bg-blue-950/40"
          >
            <Play className="mr-1 h-3 w-3 fill-current" />
            重跑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(run);
            }}
            aria-label="删除运行记录"
            className="relative flex h-9 w-9 items-center justify-center p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition-colors after:absolute after:-inset-1 after:content-['']"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
