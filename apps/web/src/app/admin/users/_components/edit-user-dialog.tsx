'use client';

import React from 'react';
import { ShieldCheck, UserRound, WalletCards, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
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
        'relative overflow-hidden rounded-[28px] border border-white/62 bg-gradient-to-b from-white/82 via-white/58 to-white/38 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_20px_38px_-28px_rgba(59,130,246,0.22)] backdrop-blur-[18px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0.6))]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/24 to-transparent dark:from-white/5" />
      <div className="relative flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-[#1D46DB] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_24px_-18px_rgba(59,130,246,0.25)] dark:border-white/10 dark:bg-slate-900/72 dark:text-[#A8BAFF]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-950 dark:text-white">{title}</p>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
          <div className="mt-4">{children}</div>
        </div>
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
        overlayClassName="bg-[rgba(222,230,246,0.58)] backdrop-blur-[10px] dark:bg-[rgba(5,10,24,0.72)]"
        className="w-[calc(100vw-1.5rem)] max-w-[720px] gap-0 overflow-hidden rounded-[36px] bg-gradient-to-b from-white/78 via-white/38 to-transparent p-5 shadow-[0_30px_90px_-26px_rgba(59,130,246,0.24)] backdrop-blur-[28px] sm:p-8 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.78))]"
      >
        <div className="pointer-events-none absolute inset-0 rounded-[36px] border border-white/62 [mask-image:linear-gradient(to_bottom,black_35%,transparent_100%)] dark:border-white/10" />
        <div className="pointer-events-none absolute top-0 inset-x-10 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-85 dark:via-white/20" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/26 via-white/8 to-transparent dark:from-white/6 dark:via-transparent" />
        <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-200/35 blur-3xl dark:hidden" />

        <DialogHeader className="space-y-2">
          <DialogTitle className="font-[var(--font-space-grotesk)] text-[28px] font-bold tracking-tight text-[#0B1B53] dark:text-white">
            编辑用户权限与额度
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            当前仅为静态展示界面，用于预览后续超管控制台的视觉与布局。
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-6 overflow-hidden rounded-[30px] border border-white/62 bg-gradient-to-r from-white/80 via-white/64 to-white/56 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_18px_36px_-26px_rgba(59,130,246,0.22)] backdrop-blur-[18px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/18 to-transparent dark:from-white/5" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'flex h-20 w-20 shrink-0 items-center justify-center rounded-[26px] text-2xl font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_18px_34px_-24px_rgba(59,130,246,0.28)]',
                  user.avatarTone
                )}
              >
                {user.initials}
              </div>
              <div className="min-w-0">
                <p className="text-[30px] font-semibold tracking-tight text-slate-950 dark:text-white">
                  {user.name}
                </p>
                <p className="mt-1 break-all text-lg text-slate-500 dark:text-slate-400">{user.email}</p>
              </div>
            </div>
            <div className="inline-flex items-center rounded-full bg-[#DDE6FF] px-4 py-2 text-sm font-semibold tracking-[0.08em] text-[#255DFF] dark:bg-[#1E3A8A]/40 dark:text-[#BFD0FF]">
              当前在线
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <SettingCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="用户角色"
            description="展示普通用户与管理员两种静态权限态。"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div
                className={cn(
                  'rounded-[24px] border px-5 py-5',
                  user.role === '普通用户'
                    ? 'border-white/70 bg-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_16px_28px_-24px_rgba(59,130,246,0.18)]'
                    : 'border-[#2A5BFF] bg-white/70 shadow-[0_18px_30px_-24px_rgba(42,91,255,0.2)]'
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/88 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_24px_-18px_rgba(15,23,42,0.16)]">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <span className="text-[28px] font-semibold tracking-tight text-slate-950">普通用户</span>
                </div>
              </div>

              <div
                className={cn(
                  'rounded-[24px] border px-5 py-5',
                  user.role === '管理员'
                    ? 'border-[#2A5BFF] bg-white/70 shadow-[0_18px_30px_-24px_rgba(42,91,255,0.24)]'
                    : 'border-white/70 bg-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_16px_28px_-24px_rgba(59,130,246,0.18)]'
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/88 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_24px_-18px_rgba(15,23,42,0.16)]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <span className="text-[28px] font-semibold tracking-tight text-slate-950">管理员</span>
                </div>
              </div>
            </div>
          </SettingCard>

          <SettingCard
            icon={<WalletCards className="h-5 w-5" />}
            title="Token 额度管理"
            description="此处仅展示额度信息与快捷加额按钮样式。"
          >
            <div className="flex flex-col gap-4 rounded-[24px] border border-white/70 bg-white/76 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_16px_28px_-22px_rgba(59,130,246,0.18)] dark:border-white/10 dark:bg-slate-900/72 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-[#255DFF]">
                <WalletCards className="h-6 w-6" />
                <span className="text-[22px] font-semibold tracking-tight text-slate-950 dark:text-white">
                  {user.tokens}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#255DFF]">
                <button type="button" className="rounded-full bg-[#EDF2FF] px-3 py-2">
                  + 100k
                </button>
                <button type="button" className="rounded-full bg-[#EDF2FF] px-3 py-2">
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
            <div className="flex items-center justify-between gap-4 rounded-[24px] border border-white/70 bg-white/76 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_16px_28px_-22px_rgba(59,130,246,0.18)] dark:border-white/10 dark:bg-slate-900/72">
              <div>
                <p className="text-lg font-semibold text-slate-950 dark:text-white">
                  {accountEnabled ? '账号启用中' : '账号已禁用'}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {accountEnabled ? '当前用户可正常登录与使用系统。' : '当前为禁用展示态，用户不可登录。'}
                </p>
              </div>
              <Switch
                checked={accountEnabled}
                aria-label="切换账号状态"
                className="h-8 w-14 border-0 bg-slate-200 data-[state=checked]:bg-[#D7E4FF] data-[state=unchecked]:bg-slate-200 dark:data-[state=checked]:bg-[#1D4ED8] dark:data-[state=unchecked]:bg-slate-700"
              />
            </div>
          </SettingCard>
        </div>

        <DialogFooter className="mt-8 flex-col-reverse gap-3 border-t border-white/60 pt-6 sm:flex-row sm:justify-end sm:space-x-0 dark:border-white/10">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-12 min-w-[128px] rounded-2xl border-white/65 bg-white/70 text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_24px_-18px_rgba(90,128,198,0.22)]"
          >
            取消
          </Button>
          <Button type="button" className="h-12 min-w-[160px] rounded-2xl text-base">
            保存修改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
