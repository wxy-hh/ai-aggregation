'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AgentPlan, PlanStep } from '@repo/shared';
import { CheckCircle2, Clock, FastForward } from 'lucide-react';
import { trackPlanEvent } from '@/lib/events/plan-events';

interface PlanInterventionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: AgentPlan;
  onConfirm: (modifiedPlan: AgentPlan) => void;
}

export function PlanInterventionDialog({
  open,
  onOpenChange,
  plan,
  onConfirm,
}: PlanInterventionDialogProps) {
  const [steps, setSteps] = useState<PlanStep[]>(plan.steps);

  // 当弹窗打开或 plan 改变时重置状态
  useEffect(() => {
    if (open) {
      setSteps(plan.steps.map((s) => ({ ...s })));
    }
  }, [open, plan]);

  const handleTitleChange = (id: string, newTitle: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s))
    );
  };

  const handleToggleSkip = (id: string) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const nextStatus = s.status === 'skipped' ? 'pending' : 'skipped';
        if (nextStatus === 'skipped') {
          trackPlanEvent('plan.step_skip', {
            planId: plan.id,
            stepCount: plan.steps.length,
            action: 'step_skip',
          });
        }
        return { ...s, status: nextStatus };
      })
    );
  };

  const handleConfirm = () => {
    const modifiedPlan: AgentPlan = {
      ...plan,
      steps,
    };
    trackPlanEvent('plan.intervened', {
      planId: plan.id,
      stepCount: plan.steps.length,
      action: 'modify_plan',
    });
    onConfirm(modifiedPlan);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="plan-intervention-dialog"
        className={cn(
          'w-full max-w-lg border-border bg-card p-6 shadow-xl',
          // 移动端全屏底抽屉适配（TC07）
          'fixed inset-x-0 bottom-0 top-auto left-0 translate-x-0 translate-y-0 rounded-t-[24px] rounded-b-none',
          'sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl',
          'max-h-[85vh] overflow-y-auto'
        )}
      >
        {/* 移动端顶部抓手（TC07） */}
        <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden" />

        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-base font-semibold text-foreground">
            调整执行计划
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            您可以修改未开始步骤的侧重目标，或直接跳过非必要检查点。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {steps.map((step, index) => {
            const isCompleted = step.status === 'completed';
            const isRunning = step.status === 'running';
            const isSkipped = step.status === 'skipped';
            const isPending = step.status === 'pending';
            const canEdit = isPending || isSkipped;

            return (
              <div
                key={step.id}
                data-testid="plan-intervention-step-row"
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                  isCompleted && 'border-slate-200/60 bg-slate-50/50 dark:border-slate-800/60 dark:bg-slate-900/40 opacity-75',
                  isRunning && 'border-blue-300/80 bg-blue-50/40 dark:border-blue-800/80 dark:bg-blue-950/30',
                  canEdit && !isSkipped && 'border-border bg-card',
                  isSkipped && 'border-dashed border-slate-300 bg-slate-100/50 dark:border-slate-700 dark:bg-slate-800/30 opacity-60'
                )}
              >
                {/* 状态徽标 */}
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : isRunning ? (
                    <Clock className="h-4 w-4 text-blue-500 animate-spin" />
                  ) : isSkipped ? (
                    <FastForward className="h-4 w-4 text-slate-400" />
                  ) : (
                    <span className="text-muted-foreground">{index + 1}</span>
                  )}
                </div>

                {/* 步骤内容或编辑框 */}
                <div className="min-w-0 flex-1">
                  {canEdit ? (
                    <Input
                      data-testid="plan-step-input"
                      value={step.title}
                      disabled={isSkipped}
                      onChange={(e) => handleTitleChange(step.id, e.target.value)}
                      className={cn(
                        'h-9 text-xs',
                        isSkipped && 'line-through text-muted-foreground'
                      )}
                      placeholder="步骤描述"
                    />
                  ) : (
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-foreground truncate">
                        {step.title}
                      </span>
                      {step.summary && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {step.summary}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 动作按钮：跳过/恢复 */}
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="plan-step-skip-btn"
                    onClick={() => handleToggleSkip(step.id)}
                    className="h-9 min-h-[44px] sm:min-h-[36px] px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {isSkipped ? '恢复' : '跳过'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="mt-5 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            data-testid="plan-intervention-cancel-btn"
            onClick={() => onOpenChange(false)}
            className="min-h-[44px] sm:min-h-[36px] w-full sm:w-auto text-xs"
          >
            取消
          </Button>
          <Button
            type="button"
            data-testid="plan-intervention-confirm-btn"
            onClick={handleConfirm}
            className="min-h-[44px] sm:min-h-[36px] w-full sm:w-auto text-xs"
          >
            应用并继续执行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
