'use client';

/**
 * MCP 工具列表抽屉（工单 03 / ADR-0064 §5）
 *
 * 职责与规格：
 * - 展示该 Server 当前快照中的工具：名称、描述与参数摘要；
 * - 逐工具提供白名单启用开关与审批策略（必须审批 / 允许自动执行）；
 * - 新发现工具默认停用且默认必须审批；
 * - 不受支持的工具展示原因且不提供启用开关；
 * - 「允许自动执行」的文案明确表示信任参数出站，不暗示只读或无泄漏风险；
 * - 遵循 DESIGN.md 与移动端红线（≥44px 热区、不依赖 hover）。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  fetchMcpServerTools,
  updateMcpToolPolicy,
  type McpToolItem,
} from '@/lib/api/mcp-servers';
import { DIALOG_OVERLAY } from '@/lib/constants/surface-styles';

export interface McpToolsDrawerProps {
  open: boolean;
  serverId: string;
  onOpenChange: (open: boolean) => void;
}

export function McpToolsDrawer({
  open,
  serverId,
  onOpenChange,
}: McpToolsDrawerProps) {
  const [tools, setTools] = useState<McpToolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingTool, setPendingTool] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTools(await fetchMcpServerTools(serverId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取工具列表失败');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (!open) return;
    void loadTools();
  }, [open, loadTools]);

  const handleToggleEnabled = async (tool: McpToolItem, nextEnabled: boolean) => {
    setPendingTool(tool.toolName);
    try {
      const updated = await updateMcpToolPolicy(serverId, {
        toolName: tool.toolName,
        enabled: nextEnabled,
      });
      setTools((prev) =>
        prev.map((item) =>
          item.toolName === updated.toolName
            ? {
                ...item,
                enabled: updated.enabled,
                allowAutoExecute: updated.allowAutoExecute,
              }
            : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新工具策略失败');
    } finally {
      setPendingTool(null);
    }
  };

  const handleToggleAutoExecute = async (tool: McpToolItem, nextAutoExecute: boolean) => {
    setPendingTool(tool.toolName);
    try {
      const updated = await updateMcpToolPolicy(serverId, {
        toolName: tool.toolName,
        allowAutoExecute: nextAutoExecute,
      });
      setTools((prev) =>
        prev.map((item) =>
          item.toolName === updated.toolName
            ? {
                ...item,
                enabled: updated.enabled,
                allowAutoExecute: updated.allowAutoExecute,
              }
            : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新审批策略失败');
    } finally {
      setPendingTool(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={DIALOG_OVERLAY}
        className="max-h-[86vh] max-w-[520px] overflow-y-auto rounded-[24px] border border-white/70 bg-white/95 p-6 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/95"
      >
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="font-[var(--font-space-grotesk)] text-lg font-bold text-foreground">
            该服务暴露的工具
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            逐个决定信任哪些工具。工具默认需要你确认后才会执行；工具名称与上游注解不作为安全依据。
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
              <button
                type="button"
                onClick={() => void loadTools()}
                className="mt-1.5 min-h-[44px] text-xs font-medium text-rose-700 underline dark:text-rose-300"
              >
                重试
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {loading && tools.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
              <p className="text-xs">正在加载工具列表…</p>
            </div>
          ) : tools.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300/80 p-8 text-center dark:border-white/10">
              <p className="text-xs text-muted-foreground">
                该服务暂无工具，或尚未成功发现工具。
              </p>
            </div>
          ) : (
            tools.map((tool) => (
              <div
                key={tool.toolName}
                data-testid="mcp-tool-item"
                className="rounded-2xl border border-slate-900/[0.06] bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {tool.toolName}
                    </p>
                    {tool.description && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {tool.description}
                      </p>
                    )}
                  </div>

                  {tool.supported ? (
                    <div className="flex min-h-[44px] shrink-0 items-center">
                      <Switch
                        checked={tool.enabled}
                        disabled={pendingTool === tool.toolName}
                        onCheckedChange={(checked) =>
                          void handleToggleEnabled(tool, checked)
                        }
                        aria-label={`启用 ${tool.toolName}`}
                      />
                    </div>
                  ) : null}
                </div>

                {tool.inputSummary.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {tool.inputSummary.map((param) => (
                      <span
                        key={param.name}
                        className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {param.name}
                        <span className="ml-1 opacity-70">{param.type}</span>
                        {param.required ? <span className="ml-1">必填</span> : null}
                      </span>
                    ))}
                  </div>
                )}

                {!tool.supported && (
                  <p className="mt-2.5 text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">
                    {tool.supportReason ?? '该工具不受支持'}
                  </p>
                )}

                {tool.supported && (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-900/[0.06] pt-3 dark:border-white/[0.08]">
                    <div className="flex min-w-0 items-start gap-2">
                      {tool.allowAutoExecute ? (
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      ) : (
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      )}
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {tool.allowAutoExecute
                          ? '已允许自动执行：信任把模型生成的参数发送至该服务。'
                          : '开启「允许自动执行」即代表信任把模型生成的参数发送至该服务；关闭时执行前需要你确认。'}
                      </p>
                    </div>
                    <div className="flex min-h-[44px] shrink-0 items-center">
                      <Switch
                        checked={tool.allowAutoExecute}
                        disabled={pendingTool === tool.toolName || !tool.enabled}
                        onCheckedChange={(checked) =>
                          void handleToggleAutoExecute(tool, checked)
                        }
                        aria-label={`允许 ${tool.toolName} 自动执行`}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
