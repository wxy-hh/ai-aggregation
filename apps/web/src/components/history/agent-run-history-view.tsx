'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import {
  fetchAgentRuns,
  deleteAgentRun,
  type AgentRunRecord,
} from '@/lib/api/agent-runs';
import { AgentRunCard } from './agent-run-card';
import { AgentRunDetailDrawer } from './agent-run-detail-drawer';
import { toast } from 'sonner';

const OUTCOME_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'success', label: '成功' },
  { id: 'partial', label: '部分' },
  { id: 'failed', label: '失败' },
] as const;

type OutcomeFilterType = (typeof OUTCOME_FILTERS)[number]['id'];

const PAGE_SIZE = 8;

export function AgentRunHistoryView() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const authStatus = useAuthStore((s) => s.status);

  const [runs, setRuns] = useState<AgentRunRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilterType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 审计抽屉状态
  const [selectedRun, setSelectedRun] = useState<AgentRunRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 删除确认对话框状态
  const [runToDelete, setRunToDelete] = useState<AgentRunRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [total]);

  const loadRuns = useCallback(
    async (targetPage = page, targetOutcome = outcomeFilter) => {
      if (!accessToken || authStatus !== 'ready') {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await fetchAgentRuns({
          page: targetPage,
          limit: PAGE_SIZE,
          outcome: targetOutcome === 'all' ? undefined : targetOutcome,
        });
        setRuns(data.runs || []);
        setTotal(data.total || 0);
      } catch (err) {
        console.error('[agent-runs] 加载运行记录失败:', err);
        setError(err instanceof Error ? err.message : '加载运行记录失败');
      } finally {
        setLoading(false);
      }
    },
    [accessToken, authStatus, page, outcomeFilter]
  );

  useEffect(() => {
    void loadRuns(page, outcomeFilter);
  }, [loadRuns, page, outcomeFilter]);

  // 状态过滤切换：重置回第 1 页
  const handleFilterChange = (filterId: OutcomeFilterType) => {
    setOutcomeFilter(filterId);
    setPage(1);
  };

  // 重跑任务
  const handleRerun = useCallback(
    (run: AgentRunRecord) => {
      const params = new URLSearchParams();
      params.set('new', 'true');
      params.set('agent', 'true');
      params.set('goal', run.goalText);
      if (run.capabilityPack) {
        params.set('pack', run.capabilityPack);
      }
      toast.success('已载入任务目标，正在前往会话...');
      router.push(`/chat?${params.toString()}`);
    },
    [router]
  );

  // 执行删除
  const handleConfirmDelete = async () => {
    if (!runToDelete) return;

    setIsDeleting(true);
    try {
      await deleteAgentRun(runToDelete.id);
      toast.success('运行记录已删除');

      // 若当前页只有最后一条且不是第 1 页，翻到前一页（依赖 setPage 触发单一拉取）
      setRunToDelete(null);
      if (runs.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        await loadRuns(page, outcomeFilter);
      }
    } catch (err) {
      console.error('[agent-runs] 删除失败:', err);
      toast.error(err instanceof Error ? err.message : '删除运行记录失败');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div data-testid="agent-run-history-view" className="flex flex-col h-full space-y-4">
      {/* 顶部控制栏：过滤胶囊与操作 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/60 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/10 backdrop-blur-sm">
        {/* 状态筛选 */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <span className="text-xs font-medium text-slate-400 mr-1 hidden sm:inline-flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" />
            状态:
          </span>
          {OUTCOME_FILTERS.map((f) => {
            const isActive = outcomeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => handleFilterChange(f.id)}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* 统计徽章与刷新 */}
        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <Badge variant="outline" className="text-xs px-2.5 py-1 rounded-lg">
            共 {total} 次任务
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadRuns()}
            disabled={loading}
            aria-label="刷新智能体任务"
            className="h-8 gap-1.5 rounded-xl border-slate-200/90 text-xs text-slate-600 dark:border-white/10 dark:text-slate-300"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span>刷新</span>
          </Button>
        </div>
      </div>

      {/* 主内容展示区 */}
      <div className="flex-1 min-h-[360px]">
        {loading && runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-xs text-slate-400">
            <RefreshCw className="h-7 w-7 animate-spin text-blue-500 mb-3" />
            <span>加载智能体运行记录中...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-between rounded-2xl border border-red-200/60 bg-red-50/50 p-4 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void loadRuns()}
              className="text-xs"
            >
              重试
            </Button>
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200/90 p-12 text-center dark:border-white/10 my-4">
            <Sparkles className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              暂无符合条件的智能体记录
            </p>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
              在对话中开启 Agent 模式或选用场景能力包完成任务后，执行轨迹将在此处完整留痕
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            {runs.map((run) => (
              <AgentRunCard
                key={run.id}
                run={run}
                onViewDetail={(r) => {
                  setSelectedRun(r);
                  setIsDrawerOpen(true);
                }}
                onRerun={handleRerun}
                onDelete={(r) => setRunToDelete(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 服务端分页控制器 */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between pt-4 pb-2 border-t border-slate-200/80 dark:border-white/10 text-xs text-slate-500">
          <div className="text-slate-400">
            第 <span className="font-semibold text-slate-700 dark:text-slate-200">{page}</span> /{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{totalPages}</span> 页 ·
            每页 {PAGE_SIZE} 条
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-3 rounded-xl gap-1 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-3 rounded-xl gap-1 text-xs"
            >
              下一页
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* 审计详情抽屉 */}
      <AgentRunDetailDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        run={selectedRun}
        onRerun={handleRerun}
      />

      {/* 删除确认对话框 */}
      <Dialog open={!!runToDelete} onOpenChange={(open) => !open && setRunToDelete(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>删除运行记录</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-2">
              确定要删除这条智能体运行记录吗？该记录的步骤审计与配额扣减凭据将被永久清除，且不可恢复。
            </DialogDescription>
          </DialogHeader>

          {runToDelete && (
            <div className="my-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/5 dark:bg-white/5 dark:text-slate-300 line-clamp-2">
              {runToDelete.goalText}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={() => setRunToDelete(null)}
              className="rounded-xl"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isDeleting}
              onClick={() => void handleConfirmDelete()}
              className="rounded-xl"
            >
              {isDeleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
