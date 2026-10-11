'use client';

/**
 * Webhook 工具调用记录抽屉组件（spec §4.4 / 工单 03）
 *
 * 职责与规格：
 * - 容器带有 [data-testid="tool-logs-drawer"]；
 * - 顶部展示工具名与调用名；
 * - 健康概览区：总调次、成功率、平均耗时、最近调用时间，若有最近失败原因也展示；
 * - 时间倒序单次调用审计明细列表：方法（GET/POST）、HTTP 状态码、耗时、时间、结果标签与失败原因；
 * - 空态：无调用记录时展示「暂无调用记录」；
 * - 遵循移动端红线规范，触控热区 ≥44px。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  RefreshCw,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Loader2,
  Calendar,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  fetchAgentToolStats,
  fetchAgentToolLogs,
  type SanitizedAgentTool,
  type AgentToolStats,
  type AgentToolLogItem,
} from '@/lib/api/agent-tools';

interface ProfileToolLogsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool: SanitizedAgentTool | null;
  initialStats?: AgentToolStats | null;
}

function formatErrorDetail(log: AgentToolLogItem): string {
  if (log.errorKind === 'timeout') return '连接超时';
  if (log.errorKind === 'tls') return '证书校验失败';
  if (log.errorKind === 'dns') return '域名无法解析';
  if (log.errorKind === 'blocked') return '安全策略拦截';
  if (log.errorKind === 'auth_error') return '鉴权凭证错误';
  if (log.statusCode && log.statusCode >= 400) return `HTTP ${log.statusCode} 错误`;
  if (log.errorKind === 'http_error') return '接口响应异常';
  return '调用失败';
}

function formatLogTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function ProfileToolLogsDrawer({
  open,
  onOpenChange,
  tool,
  initialStats,
}: ProfileToolLogsDrawerProps) {
  const [stats, setStats] = useState<AgentToolStats | null>(initialStats ?? null);
  const [logs, setLogs] = useState<AgentToolLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!tool) return;
    setLoading(true);
    setError(null);
    try {
      const [statsRes, logsRes] = await Promise.all([
        fetchAgentToolStats(tool.id),
        fetchAgentToolLogs(tool.id, { limit: 50 }),
      ]);
      setStats(statsRes);
      setLogs(logsRes.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取调用记录失败');
    } finally {
      setLoading(false);
    }
  }, [tool]);

  useEffect(() => {
    if (open && tool) {
      void loadData();
    } else if (!open) {
      setLogs([]);
      setError(null);
    }
  }, [open, tool, loadData]);

  if (!tool) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="tool-logs-drawer"
        className={cn(
          'p-0 gap-0 overflow-hidden border border-slate-900/10 bg-white/95 backdrop-blur-xl shadow-2xl dark:border-white/10 dark:bg-slate-950/95',
          'w-full max-w-2xl sm:rounded-[24px]',
          'max-sm:fixed max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[28px] max-sm:max-h-[90vh]'
        )}
      >
        {/* 移动端顶部抓手 */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-white/20" />
        </div>

        {/* 头部区 */}
        <DialogHeader className="relative px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.08]">
          <div className="flex items-start justify-between pr-8">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="truncate font-[var(--font-space-grotesk)] text-lg font-bold text-[#0F172A] dark:text-white">
                  {tool.name} · 调用记录
                </DialogTitle>
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-white/[0.08] dark:text-slate-300">
                  wh_{tool.callName}
                </span>
              </div>
              <DialogDescription className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                查看 Webhook 工具单次调用的 HTTP 状态码、响应耗时与执行明细
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 内容主体滚动区 */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
          {/* 健康概览指标卡片 */}
          <div className="rounded-2xl border border-slate-900/[0.06] bg-slate-50/70 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                健康概览
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => void loadData()}
                className="h-7 px-2 text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <RefreshCw className={cn('mr-1 h-3 w-3', loading && 'animate-spin')} />
                刷新
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-xl bg-white p-3 shadow-xs dark:bg-white/[0.04]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">调用总数</div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">
                  {stats ? stats.totalCalls : '-'}
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 shadow-xs dark:bg-white/[0.04]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">成功率</div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">
                  {stats && stats.successRate !== null ? `${stats.successRate}%` : '暂无'}
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 shadow-xs dark:bg-white/[0.04]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">平均耗时</div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">
                  {stats && stats.avgDurationMs !== null ? `${stats.avgDurationMs}ms` : '暂无'}
                </div>
              </div>
            </div>

            {stats?.lastErrorSummary && (
              <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>最近失败原因：{stats.lastErrorSummary}</span>
              </div>
            )}
          </div>

          {/* 调用明细列表 */}
          <div>
            <div className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              单次审计记录（倒序）
            </div>

            {loading && logs.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs">加载调用记录中…</span>
              </div>
            ) : error ? (
              <div className="rounded-xl bg-rose-50 p-4 text-center text-xs text-rose-600 dark:bg-rose-950/20 dark:text-rose-400">
                {error}
              </div>
            ) : logs.length === 0 ? (
              <div className="flex h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-6 text-slate-400 dark:border-white/10">
                <Calendar className="mb-1.5 h-6 w-6 stroke-[1.5]" />
                <span className="text-xs font-medium">暂无调用记录</span>
                <span className="mt-0.5 text-[11px] text-slate-400/80">
                  当智能体在对话中触发该 Webhook 工具后，记录将自动在此回流
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => {
                  const isSuccess = log.outcome === 'success';
                  const isBlocked = log.outcome === 'blocked';
                  const errorReason = !isSuccess ? formatErrorDetail(log) : null;

                  return (
                    <div
                      key={log.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-900/[0.04] bg-white p-3 shadow-xs dark:border-white/[0.06] dark:bg-white/[0.03]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-5 px-1.5 text-[10px] font-bold tracking-wider',
                            log.method === 'POST'
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300'
                              : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300'
                          )}
                        >
                          {log.method}
                        </Badge>

                        {log.statusCode !== null ? (
                          <span
                            className={cn(
                              'font-mono text-xs font-semibold px-1.5 py-0.5 rounded',
                              isSuccess
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            )}
                          >
                            {log.statusCode}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-slate-400">无状态码</span>
                        )}

                        <span className="flex items-center gap-1 font-mono text-xs text-slate-600 dark:text-slate-400">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {log.durationMs}ms
                        </span>

                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            成功
                          </span>
                        ) : isBlocked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            <ShieldAlert className="h-3 w-3" />
                            安全拦截
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            <XCircle className="h-3 w-3" />
                            失败
                            {errorReason && `（${errorReason}）`}
                          </span>
                        )}
                      </div>

                      <div className="font-mono text-[11px] text-slate-400 shrink-0">
                        {formatLogTime(log.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
