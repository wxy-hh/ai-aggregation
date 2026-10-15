'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  RefreshCw,
  Clock,
  Play,
  FileText,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { fetchAgentRuns, type AgentRunRecord } from '@/lib/api/agent-runs';
import { ProfileAgentRunDetailDrawer } from './profile-agent-run-detail-drawer';
import { GLASS_CARD } from './profile-shell';
import { toast } from 'sonner';

const HAIRLINE = 'border-slate-900/[0.06] dark:border-white/[0.08]';

const OUTCOME_TAGS = {
  success: { label: '成功', className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' },
  partial: { label: '部分', className: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300' },
  failed: { label: '失败', className: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300' },
};

export function ProfileAgentRunsSection() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const authStatus = useAuthStore((s) => s.status);
  const isAnonymousUser = user?.isAnonymous === true;

  const [runs, setRuns] = useState<AgentRunRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 审计抽屉状态
  const [selectedRun, setSelectedRun] = useState<AgentRunRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const loadRuns = useCallback(async () => {
    if (!accessToken || isAnonymousUser || authStatus !== 'ready') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchAgentRuns({ page: 1, limit: 10 });
      setRuns(data.runs || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('[agent-runs] 加载失败:', err);
      setError(err instanceof Error ? err.message : '加载运行记录失败');
    } finally {
      setLoading(false);
    }
  }, [accessToken, authStatus]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // 重跑链路：导航回 /chat 并注入目标与场景能力包
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

  return (
    <>
      <section data-testid="agent-runs-section" className={cn(GLASS_CARD, 'p-6 sm:p-8')}>
        {/* 顶部标牌 */}
        <div
          className={cn(
            'flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between',
            HAIRLINE
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-[var(--font-space-grotesk)] text-lg font-bold tracking-tight text-[#0F172A] dark:text-white sm:text-xl">
                  智能体运行记录
                </h2>
                <Badge variant="outline" className="text-xs">
                  共 {total} 次任务
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                记录每次智能体多步执行的思考步骤、外部工具调用与额度消耗
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadRuns()}
              disabled={loading}
              aria-label="刷新运行记录"
              className="h-9 gap-1.5 rounded-xl border-slate-200/90 text-xs text-[#475569] dark:border-white/10 dark:text-slate-300"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              <span>刷新</span>
            </Button>
          </div>
        </div>

        {/* 列表主体 */}
        <div className="mt-6">
          {loading && runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mb-2" />
              <span>加载运行记录中...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-between rounded-2xl border border-red-200/60 bg-red-50/50 p-4 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => void loadRuns()}>
                重试
              </Button>
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200/90 p-8 text-center dark:border-white/10">
              <Sparkles className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                暂无智能体运行记录
              </p>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                在对话中开启 Agent 模式或选用场景能力包完成任务后，执行轨迹将在此处完整留痕
              </p>
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {runs.map((run) => {
                const tag = OUTCOME_TAGS[run.outcome] ?? OUTCOME_TAGS.failed;
                const durationText = `${(run.durationMs / 1000).toFixed(1)}s`;

                return (
                  <div
                    key={run.id}
                    className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm transition-all duration-200 hover:border-blue-400/50 hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-slate-900/50 dark:hover:border-blue-500/40"
                  >
                    <div>
                      {/* 卡片头部：状态 + 步数 + 耗时 */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            tag.className
                          )}
                        >
                          {tag.label}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span className="tabular-nums">{run.steps} 步</span>
                          <span>·</span>
                          <span className="tabular-nums">{durationText}</span>
                        </div>
                      </div>

                      {/* 目标文本 */}
                      <h4 className="line-clamp-2 text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                        {run.goalText}
                      </h4>
                    </div>

                    {/* 卡片底部操作与消耗 */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
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
                          onClick={() => {
                            setSelectedRun(run);
                            setIsDrawerOpen(true);
                          }}
                          className="h-8 px-2 text-xs text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          详情
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRerun(run)}
                          className="h-8 px-2.5 text-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-900/60 dark:text-blue-400 dark:hover:bg-blue-950/40"
                        >
                          <Play className="mr-1 h-3 w-3 fill-current" />
                          重跑
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 审计详情抽屉 */}
      <ProfileAgentRunDetailDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        run={selectedRun}
        onRerun={handleRerun}
      />
    </>
  );
}
