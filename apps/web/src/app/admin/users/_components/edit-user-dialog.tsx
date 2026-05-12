'use client';

import React from 'react';
import { ShieldCheck, UserRound, WalletCards, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: '普通用户' | '管理员';
  tokens: string;
  status: '正常' | '耗尽' | '已禁用';
  avatar: string;
  initials: string;
  avatarTone: string;
}

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUserRecord | null;
}

function SettingCard({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.58),rgba(255,255,255,0.38))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_16px_28px_-24px_rgba(59,130,246,0.14)] backdrop-blur-[18px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0.6))] sm:rounded-[24px]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/24 to-transparent dark:from-white/5" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/70 bg-white/80 text-[#1D46DB] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_20px_-18px_rgba(59,130,246,0.22)] dark:border-white/10 dark:bg-slate-900/72 dark:text-[#A8BAFF]">
          <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-semibold text-slate-950 dark:text-white">{title}</p>
          {description ? (
            <p className="mt-1 text-[14px] leading-[1.5] text-slate-500 dark:text-slate-400">
              {description}
            </p>
          ) : null}
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function RoleOption({
  selected,
  icon,
  label,
}: {
  selected: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[16px] border px-4 py-3.5 transition-colors',
        selected
          ? 'border-[#93C5FD] bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF5FF_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_12px_22px_-20px_rgba(59,130,246,0.24)]'
          : 'border-[rgba(255,255,255,0.70)] bg-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_22px_-20px_rgba(59,130,246,0.16)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-[12px] bg-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_18px_-18px_rgba(15,23,42,0.16)]',
              selected ? 'text-[#255DFF]' : 'text-slate-900'
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
          </div>
          <span className="text-[16px] font-semibold tracking-tight text-slate-950">{label}</span>
        </div>

        {selected ? (
          <span className="inline-flex items-center rounded-full bg-[#DBEAFE] px-2.5 py-1 text-[11px] font-semibold text-[#255DFF]">
            当前角色
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function EditUserDialog({ open, onOpenChange, user }: EditUserDialogProps) {
  if (!user) return null;

  const accountEnabled = user.status !== '已禁用';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        overlayClassName="bg-[rgba(222,230,246,0.58)] backdrop-blur-[10px] dark:bg-[rgba(5,10,24,0.72)]"
        className="flex max-h-[min(88vh,820px)] w-[calc(100vw-1rem)] max-w-[640px] flex-col gap-0 overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.48),transparent)] p-3 shadow-[0_20px_56px_-16px_rgba(59,130,246,0.14)] backdrop-blur-[24px] sm:rounded-[28px] sm:p-6 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.78))]"
      >
        <div className="pointer-events-none absolute inset-0 rounded-[24px] [mask-image:linear-gradient(to_bottom,black_35%,transparent_100%)] sm:rounded-[28px]" />
        <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-85 dark:via-white/20" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/26 via-white/8 to-transparent dark:from-white/6 dark:via-transparent" />
        <div className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full bg-[rgba(191,219,254,0.24)] blur-3xl dark:hidden" />
        <DialogClose className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[rgba(255,255,255,0.65)] bg-white/76 text-slate-500 shadow-[0_8px_20px_rgba(76,95,154,0.10)] transition-colors hover:bg-white hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[rgba(59,130,246,0.20)] dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100">
          <span className="text-[18px] leading-none">×</span>
          <span className="sr-only">关闭</span>
        </DialogClose>

        <DialogHeader className="shrink-0 space-y-1.5 pr-10">
          <DialogTitle className="text-[22px] font-bold tracking-[-0.02em] text-[var(--home-color-text-primary)] dark:text-white sm:text-[24px]">
            编辑用户权限与额度
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-[1.5] text-slate-500 dark:text-slate-400">
            当前仅为静态展示界面，用于预览后续超管控制台的视觉与布局。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="relative overflow-hidden rounded-[20px] border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(90deg,rgba(255,255,255,0.82),rgba(255,255,255,0.64),rgba(255,255,255,0.56))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_14px_28px_-24px_rgba(59,130,246,0.18)] backdrop-blur-[18px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))] sm:rounded-[22px]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/18 to-transparent dark:from-white/5" />
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] text-[24px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_16px_26px_-22px_rgba(59,130,246,0.24)] sm:h-16 sm:w-16 sm:rounded-[20px] sm:text-[28px]',
                    user.avatarTone
                  )}
                >
                  {user.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[18px] font-bold tracking-[-0.02em] text-slate-950 dark:text-white sm:text-[20px]">
                    {user.name}
                  </p>
                  <p className="mt-1 break-all text-[14px] text-slate-500 dark:text-slate-400 sm:text-[15px]">
                    {user.email}
                  </p>
                </div>
              </div>
              <div className="inline-flex w-fit items-center rounded-full bg-[rgba(59,130,246,0.10)] px-3 py-1.5 text-[13px] font-semibold text-[var(--home-color-primary-600)] dark:bg-[#1E3A8A]/40 dark:text-[#BFD0FF]">
                当前在线
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <SettingCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="用户角色"
              description="展示普通用户与管理员两种静态权限态。"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <RoleOption
                  selected={user.role === '普通用户'}
                  icon={<UserRound className="h-4 w-4" />}
                  label="普通用户"
                />
                <RoleOption
                  selected={user.role === '管理员'}
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="管理员"
                />
              </div>
            </SettingCard>

            <SettingCard
              icon={<WalletCards className="h-5 w-5" />}
              title="Token 额度管理"
              description="此处仅展示额度信息与快捷加额按钮样式。"
            >
              <div className="flex flex-col gap-3 rounded-[18px] border border-[rgba(255,255,255,0.70)] bg-white/76 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_14px_22px_-20px_rgba(59,130,246,0.16)] dark:border-white/10 dark:bg-slate-900/72 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 text-[#255DFF]">
                  <WalletCards className="h-5 w-5" />
                  <span className="text-[18px] font-semibold tracking-tight text-slate-950 dark:text-white">
                    {user.tokens}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#255DFF]">
                  <button
                    type="button"
                    className="rounded-[10px] border border-[#D9E5FF] bg-[#F7FAFF] px-3 py-1.5 transition-colors hover:bg-[#EFF6FF]"
                  >
                    + 100k
                  </button>
                  <button
                    type="button"
                    className="rounded-[10px] border border-[#D9E5FF] bg-[#F7FAFF] px-3 py-1.5 transition-colors hover:bg-[#EFF6FF]"
                  >
                    + 500k
                  </button>
                </div>
              </div>
            </SettingCard>

            <SettingCard
              icon={<Ban className="h-5 w-5" />}
              title="账号状态"
              description="禁用后用户将无法登录系统。此处不执行真实状态变更。"
            >
              <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[rgba(255,255,255,0.70)] bg-white/76 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_14px_22px_-20px_rgba(59,130,246,0.16)] dark:border-white/10 dark:bg-slate-900/72">
                <div>
                  <p className="text-[16px] font-semibold text-slate-950 dark:text-white">
                    {accountEnabled ? '账号启用中' : '账号已禁用'}
                  </p>
                  <p className="mt-1 text-[14px] leading-[1.5] text-slate-500 dark:text-slate-400">
                    {accountEnabled ? '当前用户可正常登录与使用系统。' : '当前为禁用展示态，用户不可登录。'}
                  </p>
                </div>
                <Switch
                  checked={accountEnabled}
                  aria-label="切换账号状态"
                  className="h-7 w-12 border border-[rgba(226,232,240,0.9)] bg-slate-100 data-[state=checked]:border-[#BFDBFE] data-[state=checked]:bg-[#DCE8FF] data-[state=unchecked]:bg-slate-100 [&>span]:h-4.5 [&>span]:w-4.5 [&>span]:bg-white [&>span]:shadow-[0_2px_6px_rgba(15,23,42,0.12)] [&>span[data-state=checked]]:translate-x-[22px] dark:border-white/10 dark:data-[state=checked]:bg-[#1D4ED8] dark:data-[state=unchecked]:bg-slate-700"
                />
              </div>
            </SettingCard>
          </div>
        </div>

        <DialogFooter className="mt-4 shrink-0 flex-col-reverse gap-3 border-t border-[rgba(255,255,255,0.60)] pt-4 sm:flex-row sm:justify-end sm:space-x-0 dark:border-white/10">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 w-full rounded-[12px] border-white/65 bg-white/70 text-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_24px_-18px_rgba(90,128,198,0.22)] sm:w-auto sm:min-w-[112px]"
          >
            取消
          </Button>
          <Button type="button" className="h-10 w-full rounded-[12px] text-[14px] sm:w-auto sm:min-w-[132px]">
            保存修改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
