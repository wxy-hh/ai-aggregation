'use client';

/**
 * 「MCP 服务」工作台板块（ADR-0064 §2）
 *
 * 职责与规格：
 * - 获取当前用户的 MCP 服务器列表（GET /api/mcp-servers）；
 * - 卡片列表展示（显示名、目标域名、发现状态、凭证状态、启停开关）；
 * - 发现失败时显示明确原因并提供「重试工具发现」；
 * - 底部抽屉表单（新增 / 编辑）：名称、HTTPS 地址、可选静态鉴权头；
 * - 达到 10 个硬上限时禁用新建入口并提示；
 * - 空状态引导「添加第一个 MCP 服务器」；
 * - 删除二次确认流程；
 * - 全程遵循 DESIGN.md 与移动端红线（≥44px 热区、不依赖 hover）。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Server as ServerIcon,
  Plus,
  RefreshCw,
  AlertCircle,
  LogIn,
  AlertTriangle,
  Plug,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import {
  fetchMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  refreshMcpServerTools,
  type SanitizedMcpServer,
} from '@/lib/api/mcp-servers';
import { GLASS_CARD, DIALOG_OVERLAY, HAIRLINE } from '@/lib/constants/surface-styles';
import { McpToolsDrawer } from './mcp-tools-drawer';
import { toast } from 'sonner';

/** 单用户最多允许登记的 MCP 服务器数硬上限 */
const MAX_SERVERS_LIMIT = 10;


/** 从地址提取域名（只展示域名，不展示路径与查询串） */
function extractHostname(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return raw;
  }
}

/** 发现状态的展示文案与配色 */
function describeDiscovery(
  status: SanitizedMcpServer['discoveryStatus']
): { label: string; className: string } {
  if (status === 'succeeded') {
    return {
      label: '发现成功',
      className:
        'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300',
    };
  }
  if (status === 'failed') {
    return {
      label: '发现失败',
      className: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300',
    };
  }
  return {
    label: '尚未发现',
    className: 'bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300',
  };
}

export function McpServersSection() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const authStatus = useAuthStore((s) => s.status);

  const [servers, setServers] = useState<SanitizedMcpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 表单抽屉状态
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<SanitizedMcpServer | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formAuthHeaderName, setFormAuthHeaderName] = useState('');
  const [formAuthHeaderValue, setFormAuthHeaderValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 删除二次确认状态
  const [deletingServer, setDeletingServer] = useState<SanitizedMcpServer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 刷新工具发现中的服务器 id
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // 工具列表抽屉
  const [toolsServerId, setToolsServerId] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    if (!accessToken || authStatus !== 'ready') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setServers(await fetchMcpServers());
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取 MCP 服务器列表失败');
    } finally {
      setLoading(false);
    }
  }, [accessToken, authStatus]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const handleOpenCreate = () => {
    if (servers.length >= MAX_SERVERS_LIMIT) {
      toast.error(`最多只能创建 ${MAX_SERVERS_LIMIT} 个 MCP 服务器`);
      return;
    }
    setEditingServer(null);
    setFormName('');
    setFormUrl('');
    setFormAuthHeaderName('');
    setFormAuthHeaderValue('');
    setFormError(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (server: SanitizedMcpServer) => {
    setEditingServer(server);
    setFormName(server.name);
    setFormUrl(server.url);
    setFormAuthHeaderName(server.authHeaderName ?? '');
    // 鉴权头取值永不回显：编辑态留空表示保持不变
    setFormAuthHeaderValue('');
    setFormError(null);
    setIsDrawerOpen(true);
  };

  const handleToggleEnabled = async (
    server: SanitizedMcpServer,
    nextEnabled: boolean
  ) => {
    setServers((prev) =>
      prev.map((item) => (item.id === server.id ? { ...item, isActive: nextEnabled } : item))
    );
    try {
      const updated = await updateMcpServer(server.id, { isActive: nextEnabled });
      setServers((prev) => prev.map((item) => (item.id === server.id ? updated : item)));
      toast.success(nextEnabled ? `已启用「${updated.name}」` : `已停用「${updated.name}」`);
    } catch (err) {
      setServers((prev) =>
        prev.map((item) =>
          item.id === server.id ? { ...item, isActive: server.isActive } : item
        )
      );
      toast.error(err instanceof Error ? err.message : '切换状态失败');
    }
  };

  const handleRefreshTools = async (server: SanitizedMcpServer) => {
    setRefreshingId(server.id);
    try {
      const result = await refreshMcpServerTools(server.id);
      setServers((prev) => prev.map((item) => (item.id === server.id ? result.server : item)));
      if (result.server.discoveryStatus === 'failed') {
        toast.error(result.server.discoveryError ?? '工具发现失败');
      } else {
        toast.success('工具已刷新');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '刷新工具失败');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (editingServer) {
        const payload: Parameters<typeof updateMcpServer>[1] = {
          name: formName.trim(),
          url: formUrl.trim(),
          authHeaderName: formAuthHeaderName.trim() || null,
        };
        // 鉴权头取值：留空表示保持不变；显式清除由「清除凭证」按钮表达
        if (formAuthHeaderValue.trim() !== '') {
          payload.authHeaderValue = formAuthHeaderValue.trim();
        }
        const updated = await updateMcpServer(editingServer.id, payload);
        setServers((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        toast.success('MCP 服务器已更新');
      } else {
        const created = await createMcpServer({
          name: formName.trim(),
          url: formUrl.trim(),
          authHeaderName: formAuthHeaderName.trim() || null,
          ...(formAuthHeaderValue.trim() !== ''
            ? { authHeaderValue: formAuthHeaderValue.trim() }
            : {}),
        });
        setServers((prev) => [created, ...prev]);
        if (created.discoveryStatus === 'failed') {
          toast.error(created.discoveryError ?? '已保存，但工具发现失败');
        } else {
          toast.success('MCP 服务器已添加');
        }
      }
      setIsDrawerOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingServer) return;
    setIsDeleting(true);
    try {
      await deleteMcpServer(deletingServer.id);
      setServers((prev) => prev.filter((item) => item.id !== deletingServer.id));
      toast.success(`已删除「${deletingServer.name}」`);
      setDeletingServer(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除 MCP 服务器失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const isLimitReached = servers.length >= MAX_SERVERS_LIMIT;

  // 未登录用户展示提示卡片
  if (!accessToken) {
    return (
      <div className={cn(GLASS_CARD, 'p-6 sm:p-8')}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
            <ServerIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-[var(--font-space-grotesk)] text-xl font-bold tracking-tight text-foreground">
              MCP 服务器
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              连接标准 MCP 服务，供 AI 智能体在对话中调用其工具
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 p-8 text-center dark:border-white/10">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
            <LogIn className="h-6 w-6" />
          </span>
          <h3 className="mt-3 text-base font-bold text-foreground">
            登录后即可管理您的 MCP 服务器
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            登录账号后，可添加最多 {MAX_SERVERS_LIMIT} 个私有 MCP 服务，并逐个决定信任哪些工具。
          </p>
          <Button
            asChild
            className="mt-5 h-11 rounded-xl px-5 text-xs font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
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
              <ServerIcon className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-[var(--font-space-grotesk)] text-xl font-bold tracking-tight text-foreground">
                  MCP 服务器
                </h2>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    isLimitReached
                      ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300'
                      : 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300'
                  )}
                >
                  {servers.length} / {MAX_SERVERS_LIMIT}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                连接标准 MCP 服务（Streamable HTTP），逐个决定信任哪些工具
              </p>
              <p className="mt-0.5 text-[13px] text-day-muted dark:text-slate-400">
                工具默认需要你确认后才会执行；外部工具的描述与结果按不可信数据处理。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadServers()}
              disabled={loading}
              className="h-11 rounded-xl border-slate-200/90 bg-white/80 px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/10"
              aria-label="刷新 MCP 服务器列表"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              <span className="ml-1 hidden sm:inline">刷新</span>
            </Button>

            <Button
              type="button"
              disabled={isLimitReached}
              onClick={handleOpenCreate}
              className="h-11 rounded-xl px-4 text-xs font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {isLimitReached ? `已达上限（最多 ${MAX_SERVERS_LIMIT} 个）` : '添加 MCP Server'}
            </Button>
          </div>
        </div>

        {/* 板块主体区域 */}
        <div className="mt-6">
          {loading && servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-xs">正在加载 MCP 服务器列表…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/60 p-6 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
              <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
              <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadServers()}
                className="h-11 rounded-lg text-xs"
              >
                重试
              </Button>
            </div>
          ) : servers.length === 0 ? (
            /* 空状态引导 */
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 p-8 text-center dark:border-white/10 sm:p-12">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
                <Plug className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-[var(--font-space-grotesk)] text-base font-bold text-foreground">
                添加第一个 MCP 服务器
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                填入标准 MCP 服务地址，发现它暴露的工具后，再逐个决定信任哪些。
              </p>
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="mt-5 h-11 rounded-xl px-5 text-sm font-semibold shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                添加第一个 MCP 服务器
              </Button>
            </div>
          ) : (
            /* 卡片列表 */
            <div data-testid="mcp-server-list" className="grid gap-4 md:grid-cols-2">
              {servers.map((server) => {
                const discovery = describeDiscovery(server.discoveryStatus);
                return (
                  <div
                    key={server.id}
                    data-testid="mcp-server-card"
                    className="rounded-2xl border border-slate-900/[0.06] bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {server.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {extractHostname(server.url)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                          discovery.className
                        )}
                      >
                        {discovery.label}
                      </span>
                    </div>

                    {server.discoveryStatus === 'failed' && server.discoveryError && (
                      <p className="mt-2 text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">
                        {server.discoveryError}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-slate-500/10 px-2 py-0.5">
                        {server.hasAuthHeaderValue ? '已配置鉴权' : '无鉴权'}
                      </span>
                      {server.snapshotVersion ? (
                        <span className="rounded-full bg-slate-500/10 px-2 py-0.5">
                          快照 v{server.snapshotVersion}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={refreshingId === server.id}
                        onClick={() => void handleRefreshTools(server)}
                        className="h-11 flex-1 rounded-xl text-xs"
                      >
                        <RefreshCw
                          className={cn(
                            'mr-1.5 h-3.5 w-3.5',
                            refreshingId === server.id && 'animate-spin'
                          )}
                        />
                        {server.discoveryStatus === 'succeeded' ? '刷新工具' : '重试工具发现'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setToolsServerId(server.id)}
                        className="h-11 flex-1 rounded-xl text-xs"
                      >
                        查看工具
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(server)}
                        className="h-11 flex-1 rounded-xl text-xs"
                      >
                        配置
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingServer(server)}
                        className="h-11 rounded-xl px-3 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 新增 / 编辑抽屉 */}
      <Dialog open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DialogContent
          overlayClassName={DIALOG_OVERLAY}
          className="max-w-[460px] rounded-[24px] border border-white/70 bg-white/95 p-6 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/95"
        >
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="font-[var(--font-space-grotesk)] text-lg font-bold text-foreground">
              {editingServer ? '配置 MCP 服务器' : '添加 MCP 服务器'}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
              仅支持 Streamable HTTP 协议的 https 地址。保存后会自动发现该服务暴露的工具。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            {formError && (
              <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                {formError}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="mcp-server-name" className="text-xs font-medium">
                名称
              </Label>
              <Input
                id="mcp-server-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例如：代码仓库服务"
                className="h-11 rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mcp-server-url" className="text-xs font-medium">
                服务器地址
              </Label>
              <Input
                id="mcp-server-url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://mcp.example.com/mcp"
                className="h-11 rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mcp-server-auth-name" className="text-xs font-medium">
                鉴权头名（可选）
              </Label>
              <Input
                id="mcp-server-auth-name"
                value={formAuthHeaderName}
                onChange={(e) => setFormAuthHeaderName(e.target.value)}
                placeholder="Authorization"
                className="h-11 rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mcp-server-auth-value" className="text-xs font-medium">
                鉴权头取值（可选）
              </Label>
              <Input
                id="mcp-server-auth-value"
                type="password"
                value={formAuthHeaderValue}
                onChange={(e) => setFormAuthHeaderValue(e.target.value)}
                placeholder={
                  editingServer?.hasAuthHeaderValue ? '已配置，输入新值可覆盖' : 'Bearer …'
                }
                className="h-11 rounded-xl text-sm"
              />
              {editingServer?.hasAuthHeaderValue && (
                <p className="text-[11px] text-muted-foreground">
                  取值永不回显；留空表示保持不变。
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="mt-6 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setIsDrawerOpen(false)}
              className="h-11 rounded-xl text-xs"
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="h-11 rounded-xl text-xs"
            >
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 工具列表抽屉 */}
      <McpToolsDrawer
        open={Boolean(toolsServerId)}
        serverId={toolsServerId ?? ''}
        onOpenChange={(next) => {
          if (!next) setToolsServerId(null);
        }}
      />

      {/* 删除二次确认弹层 */}
      <Dialog
        open={Boolean(deletingServer)}
        onOpenChange={(open) => {
          if (!open) setDeletingServer(null);
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
              确认删除「{deletingServer?.name}」？
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
              删除后，智能体将无法再调用该服务的任何工具，工具定义与鉴权信息一并清除且无法恢复。
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setDeletingServer(null)}
              className="h-11 rounded-xl text-xs"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void handleConfirmDelete()}
              className="h-11 rounded-xl text-xs"
            >
              {isDeleting ? '正在删除…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
