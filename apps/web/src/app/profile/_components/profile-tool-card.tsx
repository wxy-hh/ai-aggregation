'use client';

/**
 * 单个 Webhook 工具卡片（spec §4.6 / DESIGN.md §8.3 实卡规范）
 *
 * 展示内容：
 * - 显示名、调用名徽章（wh_<callName>）；
 * - 描述文本（截断两行展示）；
 * - URL 域名（从 url 提取 hostname）；
 * - 请求方法徽章（GET/POST）；
 * - 凭证状态（hasAuthHeaderValue）；
 * - 启用状态开关（即时触发 PATCH enabled）；
 * - 测试连接按钮（三态反馈）；
 * - 编辑与删除入口（移动端热区 ≥44px，无 hover 依赖）。
 */

import React, { useState, useEffect } from 'react';
import {
  Globe,
  KeyRound,
  Play,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Variable,
  History,
  Activity,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  testAgentToolConnection,
  fetchAgentToolStats,
  type SanitizedAgentTool,
  type ProbeConnectionResult,
  type AgentToolStats,
} from '@/lib/api/agent-tools';
import { extractHostname } from './profile-tools-utils';

interface ProfileToolCardProps {
  tool: SanitizedAgentTool;
  onEdit: (tool: SanitizedAgentTool) => void;
  onDelete: (tool: SanitizedAgentTool) => void;
  onToggleEnabled: (tool: SanitizedAgentTool, nextEnabled: boolean) => Promise<void>;
  onViewLogs?: (tool: SanitizedAgentTool) => void;
  initialStats?: AgentToolStats | null;
}

export function ProfileToolCard({
  tool,
  onEdit,
  onDelete,
  onToggleEnabled,
  onViewLogs,
  initialStats,
}: ProfileToolCardProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProbeConnectionResult | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // 工具调用统计观测指标（工单 03）
  const [stats, setStats] = useState<AgentToolStats | null>(initialStats ?? null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (initialStats !== undefined) return;
    let cancelled = false;
    setStatsLoading(true);

    fetchAgentToolStats(tool.id)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        // 静默降级：观测统计拉取失败不影响卡片主要配置与操作
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tool.id, initialStats]);

  const hostname = extractHostname(tool.url);
  const paramCount = Array.isArray(tool.params) ? tool.params.length : 0;

  // 启停开关切换
  const handleToggle = async (checked: boolean) => {
    setIsToggling(true);
    try {
      await onToggleEnabled(tool, checked);
    } finally {
      setIsToggling(false);
    }
  };

  // 卡片触发测试连接
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAgentToolConnection(tool.id);
      setTestResult(res);
    } catch {
      setTestResult({
        reachable: false,
        reason: '测试请求失败，请稍后重试',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-[20px] border border-slate-900/[0.08] bg-white p-5 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none dark:hover:border-white/15'
      )}
    >
      <div>
        {/* 卡片顶部：名称、调用名与启停开关 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-[var(--font-space-grotesk)] text-base font-bold text-[#0F172A] dark:text-white">
                {tool.name}
              </h3>
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-white/[0.08] dark:text-slate-300">
                wh_{tool.callName}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-slate-400">
              <Badge
                variant="outline"
                className={cn(
                  'h-5 px-1.5 text-[10px] font-bold tracking-wider',
                  tool.method === 'POST'
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300'
                    : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300'
                )}
              >
                {tool.method}
              </Badge>

              <span className="flex items-center gap-1 font-mono text-[11px]">
                <Globe className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate max-w-[180px] sm:max-w-[220px]" title={tool.url}>
                  {hostname}
                </span>
              </span>

              {tool.hasAuthHeaderValue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                  <KeyRound className="h-2.5 w-2.5" />
                  已配置凭证
                </span>
              )}

              {paramCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[#94A3B8] dark:text-slate-500">
                  <Variable className="h-3 w-3" />
                  {paramCount} 个参数
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            <Switch
              checked={tool.enabled}
              onCheckedChange={handleToggle}
              disabled={isToggling}
              aria-label={tool.enabled ? '停用工具' : '启用工具'}
            />
            <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
              {tool.enabled ? '已启用' : '已停用'}
            </span>
          </div>
        </div>

        {/* 描述信息（截断展示） */}
        <p
          className="mt-3 text-xs leading-relaxed text-[#475569] dark:text-slate-300 line-clamp-2"
          title={tool.description}
        >
          {tool.description}
        </p>

        {/* 观测回流指标展示（工单 03） */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          {statsLoading && !stats ? (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              加载指标中…
            </span>
          ) : stats && stats.totalCalls > 0 ? (
            <>
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-white/[0.08] dark:text-slate-300">
                调用 <span className="font-mono font-semibold ml-0.5">{stats.totalCalls}</span> 次
              </span>

              {stats.successRate !== null && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-md px-2 py-0.5 font-medium',
                    stats.successRate >= 90
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : stats.successRate >= 60
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
                  )}
                >
                  成功率 <span className="font-mono font-semibold ml-0.5">{stats.successRate}%</span>
                </span>
              )}

              {stats.avgDurationMs !== null && (
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-white/[0.08] dark:text-slate-300">
                  均耗 <span className="font-mono font-semibold ml-0.5">{stats.avgDurationMs}ms</span>
                </span>
              )}

              {stats.lastErrorSummary && (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  最近失败：{stats.lastErrorSummary}
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center rounded-md bg-slate-100/70 px-2 py-0.5 font-medium text-slate-400 dark:bg-white/[0.04] dark:text-slate-500">
              暂无调用数据
            </span>
          )}
        </div>

        {/* 测试结果行内反馈 */}
        {testResult && (
          <div
            className={cn(
              'mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium',
              testResult.reachable
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
            )}
          >
            {testResult.reachable ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  连通成功 · HTTP {testResult.statusCode ?? 200} · 耗时{' '}
                  {testResult.durationMs ?? 0}ms
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                <span className="truncate" title={testResult.reason}>
                  连通失败：{testResult.reason || '网络无法连通'}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* 底部操作工具栏（移动端热区 ≥44px，无 hover 依赖） */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testing}
            onClick={handleTest}
            className="h-11 min-h-[44px] rounded-xl border-slate-200/90 bg-white px-3 text-xs font-semibold text-[#475569] shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/10"
          >
            {testing ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                测试中…
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3 w-3 text-blue-600 dark:text-blue-400" />
                测试连接
              </>
            )}
          </Button>

          {onViewLogs && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onViewLogs(tool)}
              className="h-11 min-h-[44px] rounded-xl border-slate-200/90 bg-white px-3 text-xs font-semibold text-[#475569] shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/10"
            >
              <History className="mr-1.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              调用记录
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(tool)}
            className="h-11 min-h-[44px] rounded-xl px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
            aria-label={`编辑 ${tool.name}`}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            编辑
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(tool)}
            className="h-11 min-h-[44px] rounded-xl px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20"
            aria-label={`删除 ${tool.name}`}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      </div>
    </div>
  );
}
