'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, Search, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { adminApi } from '@/lib/api/admin-api';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAuthStore } from '@/stores/auth-store';
import { DeleteUserDialog } from './delete-user-dialog';
import { EditUserDialog, type AdminUserRecord } from './edit-user-dialog';
import { CreateUserDialog } from './create-user-dialog';

/** 与 admin-api.ts 中的 AdminUser 保持一致 */
interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  role: string;
  status: string;
  tokens: number;
  createdAt: string;
}

const GLASS_PANEL =
  'relative overflow-hidden border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,255,255,0.30),transparent)] shadow-[0_20px_60px_-10px_rgba(59,130,246,0.10)] backdrop-blur-[24px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))]';

const GLASS_SURFACE =
  'border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(255,255,255,0.62))] shadow-[inset_0_1px_0_rgba(255,255,255,0.80),0_8px_20px_rgba(76,95,154,0.10)] backdrop-blur-[16px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.56))]';

const ROW_SURFACE =
  'rounded-[24px] border border-[rgba(255,255,255,0.65)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.58))] shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_16px_28px_-24px_rgba(59,130,246,0.18)] backdrop-blur-[16px] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_24px_32px_-24px_rgba(59,130,246,0.22)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.74),rgba(15,23,42,0.58))]';

const SEARCH_INPUT_CLASSES =
  'h-[48px] w-full rounded-[12px] border border-[rgba(255,255,255,0.72)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.78))] pl-10 pr-4 text-[14px] text-[var(--home-color-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),var(--home-shadow-sm)] outline-none transition-[box-shadow,border-color,background-color] duration-200 placeholder:text-[var(--home-color-text-quaternary)] focus:border-[#BFDBFE] focus:bg-white focus:shadow-[0_0_0_2px_rgba(59,130,246,0.20),inset_0_1px_0_rgba(255,255,255,0.92),0_6px_16px_rgba(78,99,160,0.12)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.64))] dark:text-slate-200 dark:focus:border-[#3B82F6]/40 dark:focus:bg-slate-900/78';

const TABLE_ACTION_BUTTON_CLASSES =
  'inline-flex h-8 items-center rounded-[10px] border px-3 text-[12px] font-semibold transition-[background-color,box-shadow,color] duration-200';

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === '正常'
      ? 'border-emerald-200/90 bg-emerald-50/90 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
      : status === '耗尽'
        ? 'border-rose-200/90 bg-rose-50/90 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
        : 'border-slate-200/90 bg-slate-100/90 text-slate-600 dark:border-slate-600/40 dark:bg-slate-700/30 dark:text-slate-300';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
        styles
      )}
    >
      <span className="h-2 w-2 rounded-full bg-current opacity-80" />
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_22px_-20px_rgba(59,130,246,0.18)]',
        role === '管理员'
          ? 'border-[#BFD1FF] bg-[#EEF3FF] text-[#255DFF] dark:border-[#2D4FA3] dark:bg-[#1B2D57]/65 dark:text-[#BFD0FF]'
          : 'border-slate-200/90 bg-white/82 text-slate-600 dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-300'
      )}
    >
      {role}
    </span>
  );
}

function UserMetaLine({ email, createdAt }: { email: string | null; createdAt: string }) {
  const dateText = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(createdAt));

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500 dark:text-slate-400">
      {email ? <span className="break-all">{email}</span> : <span>未填写邮箱</span>}
      <span className="hidden h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600 sm:inline-block" />
      <span>加入于 {dateText}</span>
    </div>
  );
}

/**
 * 将 API 返回的 AdminUser 转换为 AdminUserRecord，供 EditUserDialog 直接使用。
 */
function toRecord(user: AdminUser): AdminUserRecord {
  const displayStatus: AdminUserRecord['status'] = user.status === 'disabled' ? '已禁用' : '正常';
  const displayRole: AdminUserRecord['role'] = user.role === 'admin' ? '管理员' : '普通用户';

  return {
    id: user.id,
    name: user.username,
    email: user.email || '',
    role: displayRole,
    tokens: user.role === 'admin' ? '无限额度' : user.tokens.toLocaleString() + ' Tokens',
    status: displayStatus,
    avatar: user.avatar || '',
    initials: user.username.charAt(0).toUpperCase(),
    avatarTone: 'bg-gradient-to-br from-[#DCEBFF] to-[#BCD7FF] text-[#3066FF]',
  };
}

export function UserManagementShell() {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [disabledCount, setDisabledCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogUser, setDeleteDialogUser] = useState<{ id: string; username: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const PAGE_SIZE = 10;

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.listUsers({
        search: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
      });
      if (res.success && res.data) {
        setUsers(res.data.users);
        setTotal(res.data.meta.total);
        setAdminCount(res.data.meta.adminCount);
        setDisabledCount(res.data.meta.disabledCount);
      }
    } catch {
      toast.error('加载用户列表失败');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, page]);

  // 用 setTimeout 延迟取数：避开 React Strict Mode（开发环境）的双次调用
  // 以及 auth 初始化期间组件 mount/unmount 的 race condition
  useEffect(() => {
    const timer = setTimeout(() => fetchUsers());
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  // 切换搜索关键词时回到第一页
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const headlineDescription = useMemo(
    () => '超级管理员专属控制台：全局用户权限审核、算力额度分配与账户状态监控。',
    []
  );

  const SUMMARY_CARDS = [
    { label: '总用户数', value: String(total), tone: 'text-slate-950 dark:text-white' as const },
    {
      label: '管理员',
      value: String(adminCount),
      tone: 'text-[#255DFF]' as const,
    },
    {
      label: '已停用',
      value: String(disabledCount),
      tone: 'text-rose-500' as const,
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleDelete = (user: AdminUser) => {
    setDeleteDialogUser({ id: user.id, username: getDisplayName(user) });
    setDeleteDialogOpen(true);
  };

  const handleEdit = (record: AdminUserRecord) => {
    setSelectedUser(record);
    setEditDialogOpen(true);
  };

  // 分页按钮生成
  const pageButtons = useMemo(() => {
    const buttons: number[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) buttons.push(i);
    } else {
      buttons.push(1);
      if (page > 3) buttons.push(-1); // 省略号标记
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) buttons.push(i);
      if (page < totalPages - 2) buttons.push(-2); // 省略号标记
      buttons.push(totalPages);
    }
    return buttons;
  }, [page, totalPages]);

  const footerText = `显示 ${(page - 1) * PAGE_SIZE + 1} 到 ${Math.min(page * PAGE_SIZE, total)}，共 ${total} 名用户`;

  // 获取显示状态
  const getDisplayStatus = (user: AdminUser): string => {
    return user.status === 'disabled' ? '已禁用' : '正常';
  };

  // 获取显示角色
  const getDisplayRole = (user: AdminUser): string => {
    return user.role === 'admin' ? '管理员' : '普通用户';
  };

  // 获取显示名称（统一使用用户名）
  const getDisplayName = (user: AdminUser): string => {
    return user.username;
  };

  // 格式化 tokens 显示，管理员显示无限额度
  const formatTokens = (user: AdminUser): string => {
    if (user.role === 'admin') return '无限额度';
    return user.tokens.toLocaleString();
  };

  const renderLoading = (
    <div className={cn(GLASS_SURFACE, 'rounded-[20px] px-5 py-7 text-center')}>
      <p className="text-[14px] text-[var(--home-color-text-tertiary)]">加载中...</p>
    </div>
  );

  const renderEmpty = (
    <div className={cn(GLASS_SURFACE, 'rounded-[20px] px-5 py-7 text-center')}>
      <p className="text-[14px] text-[var(--home-color-text-tertiary)]">
        {searchQuery ? `没有找到与"${searchQuery}"匹配的用户。` : '暂无用户数据。'}
      </p>
      {searchQuery && (
        <button
          type="button"
          className="mt-3 text-[13px] font-semibold text-[#255DFF] hover:underline"
          onClick={() => handleSearchChange('')}
        >
          清除搜索条件
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="relative min-h-full w-full overflow-y-auto overflow-x-hidden bg-[var(--home-color-page-bg)] px-4 pb-8 pt-6 dark:bg-slate-950 sm:px-6 lg:px-8 lg:py-10">
        <div
          className="pointer-events-none absolute inset-0 -z-10 dark:hidden"
          aria-hidden
          style={{
            backgroundColor: 'var(--home-color-page-bg)',
            backgroundImage:
              'radial-gradient(384px 384px at 14% 8%, rgba(219,234,254,0.50) 0%, rgba(219,234,254,0.18) 34%, rgba(219,234,254,0) 72%),' +
              'radial-gradient(288px 288px at 84% 16%, rgba(233,213,255,0.30) 0%, rgba(233,213,255,0.10) 30%, rgba(233,213,255,0) 66%),' +
              'linear-gradient(180deg, #FBFCFF 0%, #F7F9FE 42%, #F3F5FA 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 hidden dark:block"
          aria-hidden
          style={{
            backgroundImage:
              'radial-gradient(900px 460px at 18% 10%, rgba(37,99,235,0.14) 0%, rgba(37,99,235,0.05) 34%, rgba(37,99,235,0) 70%),' +
              'radial-gradient(960px 520px at 80% 18%, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.04) 30%, rgba(99,102,241,0) 62%)',
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#DBEAFE]/70 via-white/20 to-transparent dark:from-blue-500/8 dark:via-transparent" />

        <div className="relative mx-auto flex w-full max-w-[1400px] flex-col">
          <header
            className={cn(
              GLASS_PANEL,
              'rounded-[32px] px-5 py-4 sm:px-6 sm:py-5 lg:rounded-[40px] lg:px-8 lg:py-6'
            )}
          >
            <div className="pointer-events-none absolute inset-0 rounded-[32px] [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)] lg:rounded-[48px]" />
            <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-80 dark:via-white/20" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-transparent dark:from-white/5 dark:via-transparent" />
            <div className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full bg-[rgba(191,219,254,0.30)] blur-3xl dark:hidden" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 inline-flex min-h-[24px] items-center gap-2 rounded-full bg-[rgba(59,130,246,0.10)] px-3 py-1 text-[12px] font-bold tracking-[0.05em] text-[var(--home-color-primary-600)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--home-color-primary-500)]" />
                  超级管理员控制台
                </div>
                <h1 className="text-[26px] font-black tracking-[-0.025em] text-[var(--home-color-text-primary)] dark:text-white sm:text-[30px] lg:text-[36px]">
                  系统用户管理
                </h1>
                <p className="mt-2 max-w-2xl text-[15px] leading-[1.5] text-[var(--home-color-text-tertiary)] dark:text-slate-300">
                  {headlineDescription}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[360px]">
                {SUMMARY_CARDS.map((card) => (
                  <div
                    key={card.label}
                    className={cn(
                      GLASS_SURFACE,
                      'relative overflow-hidden rounded-[20px] px-4 py-3'
                    )}
                  >
                    <div className="text-[12px] font-medium text-[var(--home-color-text-tertiary)] dark:text-slate-400">
                      {card.label}
                    </div>
                    <div
                      className={cn('mt-1.5 text-[16px] font-bold tracking-[-0.02em]', card.tone)}
                    >
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </header>

          <section
            className={cn(
              GLASS_PANEL,
              'mt-6 rounded-[32px] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-7'
            )}
          >
            <div className="pointer-events-none absolute inset-0 rounded-[32px] [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)]" />
            <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-80 dark:via-white/20" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/28 via-white/10 to-transparent dark:from-white/5 dark:via-transparent" />
            <div className="pointer-events-none absolute -left-8 bottom-4 h-32 w-32 rounded-full bg-[rgba(233,213,255,0.24)] blur-3xl dark:hidden" />

            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="home-search relative flex-1">
                  <Search className="home-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--home-color-text-quaternary)]" />
                  <input
                    type="text"
                    aria-label="搜索用户"
                    placeholder="搜索用户名、ID 或邮箱..."
                    className={SEARCH_INPUT_CLASSES}
                    value={searchQuery}
                    onChange={(event) => handleSearchChange(event.target.value)}
                  />
                </div>
              </div>

              <Button
                type="button"
                className="h-[44px] rounded-[12px] px-5 text-[14px]"
                onClick={() => setCreateDialogOpen(true)}
              >
                <UserPlus className="mr-2 h-5 w-5" />
                新增用户
              </Button>
            </div>

            <div className="relative mt-5 hidden lg:block">
              <div className="grid grid-cols-[minmax(0,2.2fr)_0.95fr_1.1fr_1fr_0.7fr] gap-5 px-6 pb-3 text-[12px] font-semibold text-[var(--home-color-text-tertiary)] dark:text-slate-400">
                <span>用户（头像 / 用户名 / ID）</span>
                <span>角色权限</span>
                <span>Token 余额</span>
                <span>状态</span>
                <span className="text-right">操作</span>
              </div>

              <div className="mt-3 space-y-3">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className={cn(
                      ROW_SURFACE,
                      'grid grid-cols-[minmax(0,2.2fr)_0.95fr_1.1fr_1fr_0.7fr] items-center gap-5 px-6 py-5'
                    )}
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_18px_30px_-24px_rgba(59,130,246,0.2)]',
                          'bg-gradient-to-br from-[#DCEBFF] to-[#BCD7FF] text-[#3066FF]'
                        )}
                      >
                        {getDisplayName(user).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold tracking-tight text-slate-950 dark:text-white">
                          {getDisplayName(user)}
                        </p>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400">{user.id}</p>
                        <UserMetaLine email={user.email} createdAt={user.createdAt} />
                      </div>
                    </div>

                    <RoleBadge role={getDisplayRole(user)} />

                    <div className="text-[15px] font-semibold tracking-tight text-slate-950 dark:text-white">
                      {formatTokens(user)}
                      <span className="ml-1.5 text-[13px] font-medium text-slate-400">
                        {user.role === 'admin' ? '' : 'Tokens'}
                      </span>
                    </div>

                    <StatusBadge status={getDisplayStatus(user)} />

                    <div className="flex items-center justify-end gap-3 text-[13px] font-semibold">
                      <button
                        type="button"
                        className={cn(
                          TABLE_ACTION_BUTTON_CLASSES,
                          'border-[#D9E5FF] bg-[#F7FAFF] text-[#255DFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] hover:bg-[#EFF6FF] hover:shadow-[0_8px_18px_-16px_rgba(59,130,246,0.28)]'
                        )}
                        onClick={() => handleEdit(toRecord(user))}
                      >
                        更新
                      </button>
                      {user.role !== 'admin' && (
                        <button
                          type="button"
                          className={cn(
                            TABLE_ACTION_BUTTON_CLASSES,
                            'gap-1 border-rose-200/90 bg-rose-50/90 text-rose-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] hover:bg-rose-100/90 hover:shadow-[0_8px_18px_-16px_rgba(229,67,80,0.3)]'
                          )}
                          onClick={() => handleDelete(user)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>删除</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {isLoading ? renderLoading : users.length === 0 ? renderEmpty : null}
            </div>

            {/* 移动端列表 */}
            <div className="relative mt-5 grid gap-4 lg:hidden">
              {users.map((user) => (
                <article key={user.id} className={cn(ROW_SURFACE, 'p-4')}>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 to-transparent dark:from-white/5" />
                  <div className="relative">
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_18px_30px_-24px_rgba(59,130,246,0.2)]',
                          'bg-gradient-to-br from-[#DCEBFF] to-[#BCD7FF] text-[#3066FF]'
                        )}
                      >
                        {getDisplayName(user).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-[15px] font-semibold text-slate-950 dark:text-white">
                            {getDisplayName(user)}
                          </h2>
                          <RoleBadge role={getDisplayRole(user)} />
                        </div>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user.id}</p>
                        <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">
                          {user.email || user.username}
                        </p>
                        <p className="mt-1 text-[12px] text-slate-400 dark:text-slate-500">
                          加入于{' '}
                          {new Intl.DateTimeFormat('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          }).format(new Date(user.createdAt))}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className={cn(GLASS_SURFACE, 'rounded-[16px] px-4 py-3')}>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Token 余额</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                          {formatTokens(user)}
                          {user.role !== 'admin' && ' Tokens'}
                        </p>
                      </div>
                      <div className={cn(GLASS_SURFACE, 'rounded-[16px] px-4 py-3')}>
                        <p className="text-xs text-slate-500 dark:text-slate-400">账号状态</p>
                        <div className="mt-2">
                          <StatusBadge status={getDisplayStatus(user)} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3 pb-[calc(env(safe-area-inset-bottom)+0.125rem)]">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 flex-1 rounded-2xl text-sm"
                        onClick={() => handleEdit(toRecord(user))}
                      >
                        更新
                      </Button>
                      {user.role !== 'admin' && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 flex-1 rounded-2xl text-rose-500"
                          onClick={() => handleDelete(user)}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}

              {isLoading ? renderLoading : users.length === 0 ? renderEmpty : null}
            </div>

            {/* 分页 */}
            <div className="relative mt-6 flex flex-col gap-4 border-t border-[rgba(255,255,255,0.60)] pt-5 text-sm text-[var(--home-color-text-tertiary)] dark:border-white/10 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <p>{footerText}</p>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  aria-label="上一页"
                  disabled={page <= 1}
                  className={cn(
                    GLASS_SURFACE,
                    'flex h-10 w-10 items-center justify-center rounded-[12px] text-[var(--home-color-text-tertiary)] hover:bg-white/90 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800/55'
                  )}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageButtons.map((btn, idx) => {
                  if (btn < 0) {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-1">
                        ...
                      </span>
                    );
                  }
                  return (
                    <button
                      key={btn}
                      type="button"
                      onClick={() => setPage(btn)}
                      className={cn(
                        'flex h-10 min-w-[40px] items-center justify-center rounded-[12px] px-3 text-[14px] font-semibold transition-all',
                        btn === page
                          ? 'bg-[rgba(59,130,246,0.12)] text-[var(--home-color-primary-600)] shadow-[0_8px_20px_rgba(76,95,154,0.08)]'
                          : 'border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(255,255,255,0.62))] text-[var(--home-color-text-secondary)] shadow-[0_8px_20px_rgba(76,95,154,0.10)] hover:bg-white/90 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.56))] dark:text-slate-200 dark:hover:bg-slate-800/55'
                      )}
                    >
                      {btn}
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-label="下一页"
                  disabled={page >= totalPages}
                  className={cn(
                    GLASS_SURFACE,
                    'flex h-10 w-10 items-center justify-center rounded-[12px] text-[var(--home-color-text-secondary)] hover:bg-white/90 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800/55'
                  )}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <EditUserDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        user={selectedUser}
        onSuccess={fetchUsers}
        currentUserId={currentUserId}
      />

      <CreateUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchUsers}
      />

      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteDialogUser(null);
        }}
        user={deleteDialogUser}
        onSuccess={fetchUsers}
      />
    </>
  );
}
