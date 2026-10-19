'use client';

import React from 'react';
import {
  X,
  Play,
  Clock,
  Coins,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Table,
  Code,
  Image as ImageIcon,
  Wrench,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AgentRunRecord } from '@/lib/api/agent-runs';

export interface AgentRunDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: AgentRunRecord | null;
  onRerun: (run: AgentRunRecord) => void;
}

const OUTCOME_CONFIG = {
  success: { label: '执行成功', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' },
  partial: { label: '部分交付', icon: AlertTriangle, className: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300' },
  failed: { label: '执行失败', icon: XCircle, className: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300' },
};

const ARTIFACT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  markdown: FileText,
  table: Table,
  code: Code,
  image: ImageIcon,
};

export function AgentRunDetailDrawer({
  open,
  onOpenChange,
  run,
  onRerun,
}: AgentRunDetailDrawerProps) {
  if (!run) return null;

  const outcomeInfo = OUTCOME_CONFIG[run.outcome] ?? OUTCOME_CONFIG.failed;
  const OutcomeIcon = outcomeInfo.icon;
  const durationText = `${(run.durationMs / 1000).toFixed(1)}s`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="agent-run-detail-drawer"
        showClose={false}
        className={cn(
          'p-0 gap-0 overflow-hidden border border-slate-200/80 bg-white/95 dark:border-white/10 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl',
          'w-[calc(100vw-2rem)] max-w-2xl max-h-[88vh] flex flex-col rounded-2xl sm:rounded-[24px]',
          'max-sm:fixed max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[28px] max-sm:max-h-[92vh]'
        )}
      >
        {/* 移动端顶部抓手 */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-white/20" />
        </div>

        {/* 顶部标题栏 */}
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/80 px-6 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                运行详情与审计
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                完整回溯该次智能体任务的步骤与消耗
              </DialogDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="关闭运行详情"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 主体滚动区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* 任务目标卡片 */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="text-xs font-semibold text-slate-400 mb-1.5">任务目标 (Prompt)</div>
            <div className="text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
              {run.goalText}
            </div>
            {run.capabilityPack && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                场景能力包：{run.capabilityPack}
              </div>
            )}
          </div>

          {/* 核心指标统计 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <OutcomeIcon className="h-3.5 w-3.5" />
                <span>终态结果</span>
              </div>
              <div className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                {outcomeInfo.label}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                <span>运行耗时</span>
              </div>
              <div className="mt-2 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {durationText}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Coins className="h-3.5 w-3.5" />
                <span>配额消耗</span>
              </div>
              <div className="mt-2 text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {run.quotaCost.toLocaleString()} 点
              </div>
            </div>
          </div>

          {/* 工具调用序列流水 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                工具调用流水 ({run.toolCalls?.length || 0})
              </h4>
              <span className="text-xs text-slate-400">共 {run.steps} 步编排</span>
            </div>

            {run.toolCalls && run.toolCalls.length > 0 ? (
              <div className="space-y-2.5">
                {run.toolCalls.map((call, idx) => (
                  <div
                    key={call.id || idx}
                    className="flex flex-col gap-1.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {call.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {call.durationMs !== undefined && (
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {call.durationMs}ms
                          </span>
                        )}
                        <Badge
                          variant={call.status === 'success' ? 'default' : 'destructive'}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {call.status === 'success' ? '成功' : '失败'}
                        </Badge>
                      </div>
                    </div>
                    {call.argsSummary && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        入参：{call.argsSummary}
                      </div>
                    )}
                    {call.summary && (
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        结果：{call.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-800">
                本次任务无外部工具调用
              </div>
            )}
          </div>

          {/* 关联产物清单 */}
          <div data-testid="run-artifact-refs">
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                产出的交付物 ({run.artifactRefs?.length || 0})
              </h4>
            </div>

            {run.artifactRefs && run.artifactRefs.length > 0 ? (
              <div className="space-y-2">
                {run.artifactRefs.map((art) => {
                  const Icon = ARTIFACT_ICON_MAP[art.type] || FileText;
                  return (
                    <div
                      key={art.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {art.title}
                        </span>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {art.type}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-800">
                本次任务未产出独立 Artifact
              </div>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-200/80 px-6 py-4 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
            已记录完整审计流水 · 可根据历史参数再次运行
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 px-4 rounded-xl border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              关闭
            </Button>
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onRerun(run);
              }}
              className="flex items-center gap-2 h-10 px-5 rounded-xl shadow-sm"
            >
              <Play className="h-4 w-4" />
              <span>以相同目标重跑</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
