'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { AgentPlan } from '@repo/shared';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  FastForward,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackPlanEvent } from '@/lib/events/plan-events';
import { useChatStore } from '@/stores/chat-store';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { PlanInterventionDialog } from './plan-intervention-dialog';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface AgentPlanCardProps {
  messageId: string;
  plan: AgentPlan;
  isStreaming?: boolean;
}

export function AgentPlanCard({ messageId, plan, isStreaming }: AgentPlanCardProps) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  const isMobile = useIsMobile();
  const interruptAndResumeWithPlan = useChatStore((s) => s.interruptAndResumeWithPlan);

  // 计算当前步骤索引与当前正在进行的步骤
  const { currentIndex, currentStep, completedCount, totalCount } = useMemo(() => {
    const total = plan.steps.length;
    const runningIdx = plan.steps.findIndex((s) => s.status === 'running');
    const completed = plan.steps.filter((s) => s.status === 'completed').length;

    if (runningIdx !== -1) {
      return {
        currentIndex: runningIdx + 1,
        currentStep: plan.steps[runningIdx],
        completedCount: completed,
        totalCount: total,
      };
    }

    // 若全部完成
    if (completed === total) {
      return {
        currentIndex: total,
        currentStep: plan.steps[total - 1],
        completedCount: completed,
        totalCount: total,
      };
    }

    // 默认取首个未完成项
    const pendingIdx = plan.steps.findIndex((s) => s.status === 'pending');
    const idx = pendingIdx !== -1 ? pendingIdx : 0;
    return {
      currentIndex: idx + 1,
      currentStep: plan.steps[idx],
      completedCount: completed,
      totalCount: total,
    };
  }, [plan.steps]);

  // 展开折叠切换
  const handleToggleExpand = () => {
    if (isMobile) {
      setMobileDrawerOpen(true);
      trackPlanEvent('plan.expand', {
        planId: plan.id,
        stepCount: plan.steps.length,
        action: 'expand',
      });
      return;
    }
    const nextState = !expanded;
    setExpanded(nextState);
    if (nextState) {
      trackPlanEvent('plan.expand', {
        planId: plan.id,
        stepCount: plan.steps.length,
        action: 'expand',
      });
    }
  };

  const handleOpenDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDialogOpen(true);
  };

  const handleConfirmIntervention = async (modifiedPlan: AgentPlan) => {
    await interruptAndResumeWithPlan(messageId, modifiedPlan);
  };

  const isAllCompleted = completedCount === totalCount;

  return (
    <div
      data-testid="agent-plan-card"
      className={cn(
        'mb-3 w-full rounded-2xl border border-blue-100 bg-blue-50/30 p-2 text-xs transition-all duration-fast ease-out-expo dark:border-blue-900/40 dark:bg-blue-950/20'
      )}
    >
      {/* 顶部紧凑胶囊条 (TC06-1 / TC07-1) */}
      <div
        data-testid="plan-capsule"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={handleToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleExpand();
          }
        }}
        className={cn(
          'flex min-h-[44px] md:min-h-[32px] w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 cursor-pointer select-none',
          'hover:bg-blue-100/50 dark:hover:bg-blue-900/40 transition-colors'
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* 图标与进度胶囊 */}
          <span
            data-testid="plan-capsule-text"
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[11px]',
              isAllCompleted
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
            )}
          >
            {isAllCompleted ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : isStreaming ? (
              <Clock className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            <span>
              [◉ 步骤 {currentIndex}/{totalCount}]
            </span>
          </span>

          {/* 当前步骤标题文案 */}
          <span className="truncate text-slate-700 dark:text-slate-200 font-medium">
            {currentStep?.title || plan.title}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* 调整计划按钮（仅在有未完成步骤时可交互） */}
          {!isAllCompleted && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="plan-intervene-button"
              onClick={handleOpenDialog}
              className="h-7 px-2 min-h-[44px] md:min-h-[28px] text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <SlidersHorizontal className="h-3 w-3 mr-1" />
              <span>调整</span>
            </Button>
          )}

          {/* 展开折叠箭头 */}
          <div className="text-slate-400 dark:text-slate-500 p-1">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </div>
        </div>
      </div>

      {/* 展开的步骤清单 (TC06-2) */}
      {expanded && (
        <div
          data-testid="plan-step-list"
          className="mt-2 space-y-1.5 border-t border-blue-100/60 pt-2 dark:border-blue-900/40 animate-in fade-in-0 duration-fast"
        >
          {plan.steps.map((step, idx) => {
            const isCompleted = step.status === 'completed';
            const isRunning = step.status === 'running';
            const isFailed = step.status === 'failed';
            const isSkipped = step.status === 'skipped';

            return (
              <div
                key={step.id}
                data-testid="plan-step-item"
                className={cn(
                  'flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                  isRunning && 'bg-blue-100/60 dark:bg-blue-900/40 font-medium',
                  isCompleted && 'text-slate-600 dark:text-slate-300',
                  isSkipped && 'text-slate-400 line-through dark:text-slate-500'
                )}
              >
                <div className="flex items-center gap-2">
                  {/* 状态图标 */}
                  {isCompleted ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : isRunning ? (
                    <Clock className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
                  ) : isFailed ? (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  ) : isSkipped ? (
                    <FastForward className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[10px]">
                      {idx + 1}
                    </span>
                  )}

                  {/* 步骤标题 */}
                  <span className="flex-1 truncate">{step.title}</span>
                </div>

                {/* 阶段摘要 */}
                {step.summary && (
                  <div className="pl-5 text-[11px] text-muted-foreground">
                    {step.summary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 调整干预弹窗 (TC06-3) */}
      <PlanInterventionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        plan={plan}
        onConfirm={handleConfirmIntervention}
      />

      {/* 移动端底部抽屉适配 (TC07) */}
      {isMobile && (
        <Dialog open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
          <DialogContent
            data-testid="plan-mobile-drawer"
            showClose={false}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
            className={cn(
              'fixed inset-x-0 bottom-0 top-auto left-0 translate-x-0 translate-y-0',
              'w-full max-w-full rounded-t-[24px] rounded-b-none border-border bg-card p-0 shadow-2xl',
              'max-h-[85vh] flex flex-col overflow-hidden'
            )}
          >
            {/* 顶部半透明抓手 (TC07-1) */}
            <div className="pt-3 pb-1 flex justify-center w-full">
              <div
                data-testid="plan-drawer-grabber"
                className="h-1.5 w-12 rounded-full bg-slate-300/80 dark:bg-slate-600/80"
              />
            </div>

            {/* 抽屉头部 */}
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
              <div className="min-w-0 flex-1 pr-2">
                <DialogTitle className="text-sm font-bold text-foreground break-words leading-snug">
                  {plan.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  共 {totalCount} 个阶段检查点 · 已完成 {completedCount} 步
                </DialogDescription>
              </div>

              {/* 右上角唯一关闭按钮：热区 ≥ 44x44px (TC07-2) */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid="plan-drawer-close-btn"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="关闭"
                className="h-11 w-11 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* 抽屉主体：内容无横向滚动且标题文字自动换行 (TC07-3) */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-3">
              {plan.steps.map((step, idx) => {
                const isCompleted = step.status === 'completed';
                const isRunning = step.status === 'running';
                const isFailed = step.status === 'failed';
                const isSkipped = step.status === 'skipped';

                return (
                  <div
                    key={step.id}
                    className={cn(
                      'flex flex-col gap-1 rounded-xl border p-3 text-xs break-words overflow-hidden',
                      isRunning && 'border-blue-400/60 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30',
                      isCompleted && 'border-border/80 bg-muted/30 text-muted-foreground',
                      isSkipped && 'border-dashed border-border opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : isRunning ? (
                        <Clock className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                      ) : isFailed ? (
                        <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                      ) : isSkipped ? (
                        <FastForward className="h-4 w-4 text-slate-400 shrink-0" />
                      ) : (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                          {idx + 1}
                        </span>
                      )}
                      <span className="font-medium text-foreground break-words flex-1">
                        {step.title}
                      </span>
                    </div>
                    {step.summary && (
                      <div className="pl-6 text-[11px] text-muted-foreground break-words">
                        {step.summary}
                      </div>
                    )}
                  </div>
                );
              })}

              {!isAllCompleted && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="plan-drawer-adjust-btn"
                    onClick={(e) => {
                      setMobileDrawerOpen(false);
                      handleOpenDialog(e);
                    }}
                    className="w-full min-h-[44px] text-xs flex items-center justify-center gap-1.5"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span>微调步骤计划</span>
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
