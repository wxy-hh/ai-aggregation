'use client';

/**
 * 比较视图容器 — 并行对比模式的主体
 *
 * 自上而下：各轮「共享问题区 + 模型概览轨道 + 双列聚焦答案区」纵向堆叠；底部固定比较输入区。
 * 桌面双列；<768px 改模型 Tab。挂载时若存在持久化的当前比较会话且 turns 为空，自动恢复。
 */

import { memo, useEffect } from 'react';
import { Sparkles, GitCompareArrows } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-is-mobile';
import type { ComparisonTurn } from '@/types/comparison';
import { ModelOverviewRail } from './model-overview-rail';
import { FocusAnswerPane } from './focus-answer-pane';
import { ComparisonInput } from './comparison-input';
import {
  useComparisonStore,
  useComparisonTurns,
  useActiveComparisonId,
  useSelectedModels,
} from '@/stores/comparison-store';

// 共享问题区：本轮唯一的用户 Prompt（浅蓝信息底）
const SharedPrompt = memo(function SharedPrompt({ prompt }: { prompt: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-blue-200/50 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 px-4 py-3 dark:border-blue-500/20 dark:from-blue-500/15 dark:to-cyan-500/10">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/70 text-blue-600 shadow-sm dark:border-white/10 dark:bg-slate-800/70 dark:text-blue-300">
        <Sparkles className="h-4 w-4" />
      </div>
      <p className="whitespace-pre-wrap pt-1 text-[15px] leading-6 text-slate-800 dark:text-slate-100">
        {prompt}
      </p>
    </div>
  );
});

// 单轮：概览轨道 + 聚焦答案
const TurnSection = memo(function TurnSection({
  turn,
  isMobile,
}: {
  turn: ComparisonTurn;
  isMobile: boolean;
}) {
  const setFocus = useComparisonStore((s) => s.setFocus);
  const retryModel = useComparisonStore((s) => s.retryModel);
  const stopModel = useComparisonStore((s) => s.stopModel);

  const runs = Object.values(turn.runs);
  const leftRun = turn.runs[turn.focusSlots.left];
  const rightRun = turn.runs[turn.focusSlots.right];
  const focusedCount = new Set([turn.focusSlots.left, turn.focusSlots.right]).size;

  return (
    <div className="flex flex-col gap-3">
      <SharedPrompt prompt={turn.prompt} />

      <ModelOverviewRail turn={turn} onReplace={(slot, key) => setFocus(turn.id, slot, key)} />

      {isMobile ? (
        // 移动端：模型 Tab
        <div>
          <p className="mb-1.5 px-1 text-[11px] text-slate-400">
            正在比较 {focusedCount}/{runs.length}，左右切换查看全部
          </p>
          <Tabs defaultValue={turn.focusSlots.left}>
            <TabsList className="mb-2 h-auto w-full justify-start gap-1 overflow-x-auto bg-white/50 p-1 dark:bg-slate-800/50">
              {runs.map((run) => (
                <TabsTrigger
                  key={run.modelKey}
                  value={run.modelKey}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-blue-500 data-[state=active]:text-white"
                >
                  {run.label.split(' · ')[1] ?? run.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {runs.map((run) => (
              <TabsContent key={run.modelKey} value={run.modelKey} className="mt-0 h-[52vh]">
                <FocusAnswerPane
                  run={run}
                  turnId={turn.id}
                  onRetry={retryModel}
                  onStop={stopModel}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      ) : (
        // 桌面：双列聚焦
        <div className="grid grid-cols-2 gap-4">
          {leftRun && (
            <div className="h-[58vh] min-h-0">
              <FocusAnswerPane run={leftRun} turnId={turn.id} onRetry={retryModel} onStop={stopModel} />
            </div>
          )}
          {rightRun && (
            <div className="h-[58vh] min-h-0">
              <FocusAnswerPane run={rightRun} turnId={turn.id} onRetry={retryModel} onStop={stopModel} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// 空状态：引导选模型并发问
const EmptyState = memo(function EmptyState({ modelCount }: { modelCount: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-4 rounded-full bg-gradient-to-br from-blue-400/20 via-indigo-400/14 to-cyan-400/20 blur-2xl"
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl border border-white/60 bg-white/70 text-blue-600 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/70 dark:text-blue-300">
          <GitCompareArrows className="h-8 w-8" />
        </div>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">并行对比，一题多问</h2>
        <p className="mx-auto max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          已选 {modelCount} 个模型。输入同一个问题同时发送，先看全局状态，再聚焦比较两份完整答案，选中更好的继续追问。
        </p>
      </div>
    </div>
  );
});

export const ComparisonView = memo(function ComparisonView() {
  const isMobile = useIsMobile();
  const turns = useComparisonTurns();
  const selectedModels = useSelectedModels();
  const activeComparisonId = useActiveComparisonId();
  const loadComparison = useComparisonStore((s) => s.loadComparison);

  // 挂载时恢复持久化的当前比较会话（刷新后 turns 为空但会话 id 仍在），仅执行一次
  useEffect(() => {
    if (activeComparisonId && turns.length === 0) {
      loadComparison(activeComparisonId);
    }
    // 故意只在挂载时执行一次：恢复逻辑不随 turns/activeComparisonId 变化重跑
  }, [activeComparisonId, turns.length, loadComparison]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {turns.length === 0 ? (
        <EmptyState modelCount={selectedModels.length} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2 custom-scrollbar">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            {turns.map((turn) => (
              <TurnSection key={turn.id} turn={turn} isMobile={isMobile} />
            ))}
          </div>
        </div>
      )}

      {/* 底部固定比较输入区（安全区适配） */}
      <div className="shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        <ComparisonInput />
      </div>
    </div>
  );
});
