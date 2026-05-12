'use client';

import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EditUserDialog, type AdminUserRecord } from './edit-user-dialog';

const ADMIN_USERS: AdminUserRecord[] = [
  {
    id: 'USR-1029',
    name: '张伟',
    email: 'zhangwei@luminal.ai',
    role: '普通用户',
    tokens: '12,500 Tokens',
    status: '正常',
    avatar: '',
    initials: 'Z',
    avatarTone: 'bg-gradient-to-br from-[#DCEBFF] to-[#BCD7FF] text-[#3066FF]',
  },
  {
    id: 'USR-2281',
    name: '李娜',
    email: 'lina@luminal.ai',
    role: '管理员',
    tokens: '89,000 Tokens',
    status: '正常',
    avatar: '',
    initials: 'L',
    avatarTone: 'bg-gradient-to-br from-[#F0E1FF] to-[#DFC7FF] text-[#6A31D8]',
  },
  {
    id: 'USR-4412',
    name: '王强',
    email: 'wangqiang@luminal.ai',
    role: '普通用户',
    tokens: '0 Tokens',
    status: '耗尽',
    avatar: '',
    initials: 'W',
    avatarTone: 'bg-gradient-to-br from-[#FFE7C5] to-[#FFD5A0] text-[#E45700]',
  },
  {
    id: 'USR-9901',
    name: '陈小明',
    email: 'chenxiaoming@luminal.ai',
    role: '普通用户',
    tokens: '-',
    status: '已禁用',
    avatar: '',
    initials: 'C',
    avatarTone: 'bg-gradient-to-br from-[#E9EEF5] to-[#DCE3ED] text-[#79869A]',
  },
];

const SUMMARY_CARDS = [
  { label: '总用户数', value: '142', tone: 'text-slate-950 dark:text-white' },
  { label: '管理员', value: '12', tone: 'text-[#255DFF] dark:text-[#BFD0FF]' },
  { label: '异常账号', value: '5', tone: 'text-rose-500 dark:text-rose-300' },
];

function StatusBadge({ status }: { status: AdminUserRecord['status'] }) {
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

function RoleBadge({ role }: { role: AdminUserRecord['role'] }) {
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

export function UserManagementShell() {
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(ADMIN_USERS[0]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const headerDescription = useMemo(
    () => '超级管理员专属控制台：全局用户权限审核、算力额度分配与账户状态监控。',
    []
  );

  return (
    <>
      <div className="relative min-h-full w-full overflow-y-auto overflow-x-hidden bg-[#F3F5FA] px-4 pb-8 pt-6 dark:bg-slate-950 sm:px-6 lg:px-10 lg:py-10">
        <div
          className="pointer-events-none absolute inset-0 -z-10 dark:hidden"
          aria-hidden
          style={{
            backgroundColor: '#F3F5FA',
            backgroundImage:
              'radial-gradient(980px 540px at 14% 8%, rgba(121,168,236,0.18) 0%, rgba(121,168,236,0.07) 34%, rgba(121,168,236,0) 72%),' +
              'radial-gradient(1040px 580px at 84% 16%, rgba(129,146,255,0.13) 0%, rgba(129,146,255,0.05) 30%, rgba(129,146,255,0) 66%),' +
              'linear-gradient(180deg, #FBFCFF 0%, #F7F9FE 40%, #F2F6FD 100%)',
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
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-100/55 via-white/20 to-transparent dark:from-blue-500/8 dark:via-transparent" />

        <div className="relative mx-auto flex w-full max-w-[1520px] flex-col">
          <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-white/60 via-white/24 to-transparent px-5 py-5 shadow-[0_20px_60px_-22px_rgba(59,130,246,0.14)] backdrop-blur-[24px] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0.58))] dark:shadow-[0_18px_44px_-24px_rgba(0,0,0,0.4)] sm:px-6 sm:py-6 lg:rounded-[32px] lg:px-8 lg:py-6">
            <div className="pointer-events-none absolute inset-0 rounded-[28px] border border-white/58 [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)] dark:border-white/10 lg:rounded-[32px]" />
            <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-80 dark:via-white/20" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-transparent dark:from-white/5 dark:via-transparent" />
            <div className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full bg-blue-200/30 blur-3xl dark:hidden" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center rounded-full border border-white/65 bg-white/58 px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-[#255DFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.76),0_10px_24px_-20px_rgba(59,130,246,0.32)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-[#A8BAFF]">
                  超级管理员控制台
                </div>
                <h1 className="font-[var(--font-space-grotesk)] text-[26px] font-bold tracking-tight text-slate-950 dark:text-white sm:text-[28px]">
                  系统用户管理
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {headerDescription}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {SUMMARY_CARDS.map((card) => (
                  <div
                    key={card.label}
                    className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-b from-white/72 to-white/38 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_26px_-24px_rgba(59,130,246,0.3)] backdrop-blur-[14px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.54))]"
                  >
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {card.label}
                    </div>
                    <div className={cn('mt-1.5 text-sm font-semibold', card.tone)}>{card.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </header>

          <section className="relative mt-6 overflow-hidden rounded-[28px] bg-gradient-to-b from-white/70 via-white/26 to-transparent px-4 py-4 shadow-[0_28px_72px_-24px_rgba(59,130,246,0.14)] backdrop-blur-[26px] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))] sm:px-6 sm:py-5 lg:rounded-[32px] lg:px-8 lg:py-7">
            <div className="pointer-events-none absolute inset-0 rounded-[28px] border border-white/58 [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)] dark:border-white/10 lg:rounded-[32px]" />
            <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-80 dark:via-white/20" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/28 via-white/10 to-transparent dark:from-white/5 dark:via-transparent" />
            <div className="pointer-events-none absolute -left-8 bottom-4 h-32 w-32 rounded-full bg-purple-200/20 blur-3xl dark:hidden" />

            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    aria-label="搜索用户"
                    placeholder="搜索用户名、ID 或邮箱..."
                    className="h-14 w-full rounded-2xl border border-white/70 bg-gradient-to-b from-white/84 to-white/64 pl-12 pr-4 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_16px_30px_-24px_rgba(59,130,246,0.18)] outline-none backdrop-blur-[16px] placeholder:text-slate-400 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.56))] dark:text-slate-100"
                    readOnly
                  />
                </div>

                <button
                  type="button"
                  aria-label="筛选用户"
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/70 bg-gradient-to-b from-white/84 to-white/64 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_16px_30px_-24px_rgba(59,130,246,0.18)] backdrop-blur-[16px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.56))] dark:text-slate-300"
                >
                  <Filter className="h-5 w-5" />
                </button>
              </div>

              <Button type="button" className="h-14 rounded-2xl px-6 text-base">
                <UserPlus className="mr-2 h-5 w-5" />
                新增用户
              </Button>
            </div>

            <div className="relative mt-5 hidden lg:block">
              <div className="grid grid-cols-[minmax(0,2.2fr)_0.95fr_1.1fr_1fr_0.7fr] gap-5 border-b border-white/58 px-4 pb-3 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
                <span>用户（头像 / 姓名 / ID）</span>
                <span>角色权限</span>
                <span>代币余额</span>
                <span>状态</span>
                <span className="text-right">操作</span>
              </div>

              <div className="divide-y divide-white/55 dark:divide-white/10">
                {ADMIN_USERS.map((user) => (
                  <div
                    key={user.id}
                    className="grid grid-cols-[minmax(0,2.2fr)_0.95fr_1.1fr_1fr_0.7fr] items-center gap-5 px-4 py-5"
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_18px_30px_-24px_rgba(59,130,246,0.2)]',
                          user.avatarTone
                        )}
                      >
                        {user.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">
                          {user.name}
                        </p>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400">{user.id}</p>
                      </div>
                    </div>

                    <RoleBadge role={user.role} />

                    <div className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">
                      {user.tokens.split(' ')[0]}
                      <span className="ml-1.5 text-[13px] font-medium text-slate-400">
                        {user.tokens === '-' ? '' : 'Tokens'}
                      </span>
                    </div>

                    <StatusBadge status={user.status} />

                    <div className="flex items-center justify-end gap-3 text-[13px] font-semibold">
                      <button
                        type="button"
                        className="text-[#255DFF]"
                        onClick={() => {
                          setSelectedUser(user);
                          setDialogOpen(true);
                        }}
                      >
                        更新
                      </button>
                      <button type="button" className="inline-flex items-center gap-1 text-rose-500">
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>删除</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mt-5 grid gap-4 lg:hidden">
              {ADMIN_USERS.map((user) => (
                <article
                  key={user.id}
                  className="relative overflow-hidden rounded-[26px] border border-white/65 bg-gradient-to-b from-white/84 via-white/60 to-white/42 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_18px_30px_-24px_rgba(59,130,246,0.18)] backdrop-blur-[16px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.74),rgba(15,23,42,0.58))]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 to-transparent dark:from-white/5" />
                  <div className="relative">
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_18px_30px_-24px_rgba(59,130,246,0.2)]',
                          user.avatarTone
                        )}
                      >
                        {user.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                            {user.name}
                          </h2>
                          <RoleBadge role={user.role} />
                        </div>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user.id}</p>
                        <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">
                          {user.email}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-white/60 bg-white/72 px-4 py-3 dark:border-white/10 dark:bg-slate-900/72">
                        <p className="text-xs text-slate-500 dark:text-slate-400">代币余额</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                          {user.tokens}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/60 bg-white/72 px-4 py-3 dark:border-white/10 dark:bg-slate-900/72">
                        <p className="text-xs text-slate-500 dark:text-slate-400">账号状态</p>
                        <div className="mt-2">
                          <StatusBadge status={user.status} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3 pb-[calc(env(safe-area-inset-bottom)+0.125rem)]">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 flex-1 rounded-2xl text-sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setDialogOpen(true);
                        }}
                      >
                        更新
                      </Button>
                      <Button type="button" variant="ghost" className="h-11 flex-1 rounded-2xl text-rose-500">
                        删除
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="relative mt-6 flex flex-col gap-4 border-t border-white/58 pt-5 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <p>显示 1 到 10，共 142 名用户</p>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  aria-label="上一页"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/55 dark:text-slate-300 dark:hover:bg-slate-800/55"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {[1, 2, 3].map((page) => (
                  <button
                    key={page}
                    type="button"
                    className={cn(
                      'flex h-11 min-w-[44px] items-center justify-center rounded-2xl px-3 text-base font-semibold transition-all',
                      page === 1
                        ? 'bg-gradient-to-r from-[#255DFF] to-[#3D71FF] text-white shadow-[0_14px_28px_-16px_rgba(37,93,255,0.45)]'
                        : 'text-slate-700 hover:bg-white/55 dark:text-slate-200 dark:hover:bg-slate-800/55'
                    )}
                  >
                    {page}
                  </button>
                ))}
                <span className="px-1">...</span>
                <button type="button" className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl px-3 text-base font-semibold">
                  15
                </button>
                <button
                  type="button"
                  aria-label="下一页"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-white/55 dark:text-slate-200 dark:hover:bg-slate-800/55"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <EditUserDialog open={dialogOpen} onOpenChange={setDialogOpen} user={selectedUser} />
    </>
  );
}
