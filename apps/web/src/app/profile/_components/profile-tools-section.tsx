'use client';

/**
 * profile 页「我的工具」板块（spec §4.6 / 工单 04）
 *
 * 职责与规格：
 * - 获取当前用户 Webhook 工具列表（GET /api/agent-tools）；
 * - 卡片列表展示（显示名、描述截断、URL 域名、方法徽章、凭证状态、启停开关）；
 * - 达到 10 个硬上限时禁用新建入口并提示；
 * - 空状态引导「添加第一个工具」（含一句话说明）；
 * - 底部升起抽屉（编辑/新增表单）；
 * - 删除二次确认流程；
 * - 匿名与未登录用户友好引导，无异常报错；
 * - 全程遵循 DESIGN.md 与 AGENTS.md 移动端红线规范。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Plus,
  RefreshCw,
  AlertCircle,
  LogIn,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
  fetchAgentTools,
  updateAgentTool,
  deleteAgentTool,
  type SanitizedAgentTool,
} from '@/lib/api/agent-tools';
import { ProfileToolCard } from './profile-tool-card';
import { ProfileToolDrawer } from './profile-tool-drawer';
import { ProfileToolLogsDrawer } from './profile-tool-logs-drawer';
import { ProfileToolEntryModal } from './profile-tool-entry-modal';
import type { ToolTemplate } from './profile-tool-templates';
import type { ParsedCurlDto } from '@/lib/agent/parse-curl';
import { GLASS_CARD, DIALOG_OVERLAY } from './profile-shell';
import { toast } from 'sonner';

/** 单用户最多允许登记的自定义工具数硬上限 */
const MAX_TOOLS_LIMIT = 10;

const HAIRLINE = 'border-slate-900/[0.06] dark:border-white/[0.08]';

export function ProfileToolsSection() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const authStatus = useAuthStore((s) => s.status);

  const [tools, setTools] = useState<SanitizedAgentTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 三入口选择弹层状态
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ToolTemplate | null>(null);
  const [selectedCurlPrefill, setSelectedCurlPrefill] = useState<ParsedCurlDto | null>(null);

  // 表单抽屉状态
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<SanitizedAgentTool | null>(null);

  // 调用记录抽屉状态（工单 03）
  const [logsTool, setLogsTool] = useState<SanitizedAgentTool | null>(null);

  // 删除二次确认状态
  const [deletingTool, setDeletingTool] = useState<SanitizedAgentTool | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 加载工具列表
  const loadTools = useCallback(async () => {
    if (!accessToken || authStatus !== 'ready') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchAgentTools();
      setTools(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取工具列表失败');
    } finally {
      setLoading(false);
    }
  }, [accessToken, authStatus]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  // 工具启停切换
  const handleToggleEnabled = async (tool: SanitizedAgentTool, nextEnabled: boolean) => {
    // 乐观更新
    setTools((prev) =>
      prev.map((item) => (item.id === tool.id ? { ...item, enabled: nextEnabled } : item))
    );

    try {
      const updated = await updateAgentTool(tool.id, { enabled: nextEnabled });
      setTools((prev) =>
        prev.map((item) => (item.id === tool.id ? updated : item))
      );
      toast.success(nextEnabled ? `已启用「${tool.name}」` : `已停用「${tool.name}」`);
    } catch (err) {
      // 失败回滚
      setTools((prev) =>
        prev.map((item) => (item.id === tool.id ? { ...item, enabled: tool.enabled } : item))
      );
      toast.error(err instanceof Error ? err.message : '切换工具状态失败');
    }
  };

  // 打开新建入口（唤起三入口弹层）
  const handleOpenCreate = () => {
    if (tools.length >= MAX_TOOLS_LIMIT) {
      toast.error(`最多只能创建 ${MAX_TOOLS_LIMIT} 个自定义工具`);
      return;
    }
    setEditingTool(null);
    setSelectedTemplate(null);
    setSelectedCurlPrefill(null);
    setIsEntryModalOpen(true);
  };

  // 三入口：选择手动填写
  const handleSelectManual = () => {
    setIsEntryModalOpen(false);
    setSelectedTemplate(null);
    setSelectedCurlPrefill(null);
    setIsDrawerOpen(true);
  };

  // 三入口：选择预置模板
  const handleSelectTemplate = (template: ToolTemplate) => {
    setIsEntryModalOpen(false);
    setSelectedTemplate(template);
    setSelectedCurlPrefill(null);
    setIsDrawerOpen(true);
  };

  // 三入口：选择 cURL 解析导入
  const handleSelectCurl = (dto: ParsedCurlDto) => {
    setIsEntryModalOpen(false);
    setSelectedTemplate(null);
    setSelectedCurlPrefill(dto);
    setIsDrawerOpen(true);
  };

  // 打开编辑抽屉
  const handleOpenEdit = (tool: SanitizedAgentTool) => {
    setEditingTool(tool);
    setSelectedTemplate(null);
    setSelectedCurlPrefill(null);
    setIsDrawerOpen(true);
  };

  // 保存完成回调
  const handleToolSaved = (savedTool: SanitizedAgentTool) => {
    setTools((prev) => {
      const index = prev.findIndex((item) => item.id === savedTool.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = savedTool;
        return next;
      }
      return [savedTool, ...prev];
    });
  };

  // 确认删除
  const handleConfirmDelete = async () => {
    if (!deletingTool) return;
    setIsDeleting(true);
    try {
      await deleteAgentTool(deletingTool.id);
      setTools((prev) => prev.filter((item) => item.id !== deletingTool.id));
      toast.success(`已删除「${deletingTool.name}」`);
      setDeletingTool(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除工具失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const isLimitReached = tools.length >= MAX_TOOLS_LIMIT;

  // 未登录用户展示提示卡片
  if (!accessToken) {
    return (
      <div className={cn(GLASS_CARD, 'p-6 sm:p-8')}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-[var(--font-space-grotesk)] text-xl font-bold tracking-tight text-[#0F172A] dark:text-white">
              我的工具
            </h2>
            <p className="mt-0.5 text-[13px] text-[#94A3B8] dark:text-slate-400">
              配置私有 Webhook 接口，供 AI 智能体在对话中自主调度
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 p-8 text-center dark:border-white/10">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
            <LogIn className="h-6 w-6" />
          </span>
          <h3 className="mt-3 text-base font-bold text-[#0F172A] dark:text-white">
            登录后即可管理您的专属 Webhook 工具
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
            您当前处于匿名体验模式。登录账号后，{'可添加最多 ' + MAX_TOOLS_LIMIT + ' 个私有 Webhook 接口'}，并在对话中由 AI 智能体自主调用。
          </p>
          <Button
            asChild
            className="mt-5 h-10 rounded-xl px-5 text-xs font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
          >
            <Link href="/login">
              <LogIn className="mr-1.5 h-3.5 w-3.5" />
              前往登录
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn(GLASS_CARD, 'p-6 sm:p-8')}>
        {/* 板块顶部标题与操作 */}
        <div
          className={cn(
            'flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between',
            HAIRLINE
          )}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
              <Wrench className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-[var(--font-space-grotesk)] text-xl font-bold tracking-tight text-[#0F172A] dark:text-white">
                  我的工具
                </h2>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    isLimitReached
                      ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300'
                      : 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300'
                  )}
                >
                  {tools.length} / {MAX_TOOLS_LIMIT}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-[#94A3B8] dark:text-slate-400">
                配置私有 Webhook 接口，供 AI 智能体在对话中自主调度
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadTools()}
              disabled={loading}
              className="h-10 rounded-xl border-slate-200/90 bg-white/80 px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/10"
              aria-label="刷新工具列表"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              <span className="ml-1 hidden sm:inline">刷新</span>
            </Button>

            <Button
              type="button"
              disabled={isLimitReached}
              onClick={handleOpenCreate}
              className="h-10 rounded-xl px-4 text-xs font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {isLimitReached ? `已达上限（最多 ${MAX_TOOLS_LIMIT} 个）` : '添加新工具'}
            </Button>
          </div>
        </div>

        {/* 板块主体区域 */}
        <div className="mt-6">
          {loading && tools.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-[#94A3B8] dark:text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-xs">正在加载我的工具列表…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/60 p-6 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
              <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
              <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadTools()}
                className="h-8 rounded-lg text-xs"
              >
                重试
              </Button>
            </div>
          ) : tools.length === 0 ? (
            /* 空状态引导 */
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 p-8 text-center dark:border-white/10 sm:p-12">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                <Wrench className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-[var(--font-space-grotesk)] text-base font-bold text-[#0F172A] dark:text-white">
                添加第一个工具
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                配置您的私有 Webhook 接口，使 AI 智能体在对话中能调用您的专属服务与数据。
              </p>
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="mt-5 h-11 rounded-xl px-5 text-sm font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                添加第一个工具
              </Button>
            </div>
          ) : (
            /* 卡片网格列表 */
            <div className="grid gap-4 md:grid-cols-2">
              {tools.map((tool) => (
                <ProfileToolCard
                  key={tool.id}
                  tool={tool}
                  onEdit={handleOpenEdit}
                  onDelete={(t) => setDeletingTool(t)}
                  onToggleEnabled={handleToggleEnabled}
                  onViewLogs={(t) => setLogsTool(t)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 创建工具入口选择弹层 */}
      <ProfileToolEntryModal
        open={isEntryModalOpen}
        onOpenChange={setIsEntryModalOpen}
        onSelectManual={handleSelectManual}
        onSelectTemplate={handleSelectTemplate}
        onSelectCurl={handleSelectCurl}
        onSelectDraft={handleSelectCurl}
      />

      {/* 新增 / 编辑抽屉 */}
      <ProfileToolDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        tool={editingTool}
        initialTemplate={selectedTemplate}
        initialPrefill={selectedCurlPrefill}
        onSaved={handleToolSaved}
      />

      {/* 调用记录抽屉（工单 03） */}
      <ProfileToolLogsDrawer
        open={Boolean(logsTool)}
        onOpenChange={(open) => {
          if (!open) setLogsTool(null);
        }}
        tool={logsTool}
      />

      {/* 删除二次确认弹层 */}
      <Dialog
        open={Boolean(deletingTool)}
        onOpenChange={(open) => {
          if (!open) setDeletingTool(null);
        }}
      >
        <DialogContent
          overlayClassName={DIALOG_OVERLAY}
          className="max-w-[440px] rounded-[24px] border border-white/70 bg-white/95 p-6 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/95"
        >
          <DialogHeader className="space-y-3 text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <DialogTitle className="font-[var(--font-space-grotesk)] text-lg font-bold text-rose-600 dark:text-rose-400">
              确认删除工具「{deletingTool?.name}」？
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
              删除后，智能体将无法再调用此工具，且配置与鉴权信息无法恢复。确定继续吗？
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setDeletingTool(null)}
              className="h-10 rounded-xl text-xs"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="h-10 rounded-xl text-xs"
            >
              {isDeleting ? '正在删除…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
