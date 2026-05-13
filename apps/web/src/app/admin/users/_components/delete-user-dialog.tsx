'use client';

import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
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
import { adminApi } from '@/lib/api/admin-api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DIALOG_OVERLAY_CLASSES, DELETE_DIALOG_CONTENT_CLASSES } from './dialog-styles';

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; username: string } | null;
  onSuccess: () => void;
}

export function DeleteUserDialog({ open, onOpenChange, user, onSuccess }: DeleteUserDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await adminApi.deleteUser(user.id);
      toast.success('用户已删除');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        overlayClassName={DIALOG_OVERLAY_CLASSES}
        className={DELETE_DIALOG_CONTENT_CLASSES}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[24px] [mask-image:linear-gradient(to_bottom,black_35%,transparent_100%)] sm:rounded-[28px]" />
        <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-85 dark:via-white/20" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/26 via-white/8 to-transparent dark:from-white/6 dark:via-transparent" />
        <div className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full bg-[rgba(191,219,254,0.24)] blur-3xl dark:hidden" />
        <DialogClose className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[rgba(255,255,255,0.65)] bg-white/76 text-slate-500 shadow-[0_8px_20px_rgba(76,95,154,0.10)] transition-colors hover:bg-white hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[rgba(59,130,246,0.20)] dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100">
          <span className="text-[18px] leading-none">&times;</span>
          <span className="sr-only">关闭</span>
        </DialogClose>

        <DialogHeader className="shrink-0 space-y-1.5 pr-10">
          <DialogTitle className="text-[22px] font-bold tracking-[-0.02em] text-[var(--home-color-text-primary)] dark:text-white sm:text-[24px]">
            确认删除用户
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-[1.5] text-slate-500 dark:text-slate-400">
            此操作不可撤销，将级联删除该用户所有关联数据。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 min-h-0 flex-1">
          <div className="relative overflow-hidden rounded-[20px] border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(90deg,rgba(255,255,255,0.82),rgba(255,255,255,0.64),rgba(255,255,255,0.56))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_14px_28px_-24px_rgba(59,130,246,0.18)] backdrop-blur-[18px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))] sm:rounded-[22px]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/18 to-transparent dark:from-white/5" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#DCEBFF] to-[#BCD7FF] text-[20px] font-bold text-[#3066FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_16px_26px_-22px_rgba(59,130,246,0.24)] sm:h-14 sm:w-14 sm:text-[24px]">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[18px] font-bold tracking-[-0.02em] text-slate-950 dark:text-white sm:text-[20px]">
                  {user.username}
                </p>
                <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400 sm:text-[15px]">
                  用户 #{user.id}
                </p>
              </div>
            </div>
          </div>

          <div
            className={cn(
              'mt-4 flex items-start gap-3 rounded-[20px] border border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.58),rgba(255,255,255,0.38))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_16px_28px_-24px_rgba(59,130,246,0.14)] backdrop-blur-[18px] dark:border-rose-500/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0.6))] sm:rounded-[22px]'
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-rose-200/80 bg-rose-50/90 text-rose-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_20px_-18px_rgba(233,70,86,0.18)] dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-slate-950 dark:text-white">危险操作</p>
              <p className="mt-1 text-[14px] leading-[1.5] text-slate-500 dark:text-slate-400">
                删除后将清空该用户的聊天记录、AI 生成内容和系统操作日志，且无法恢复。
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 shrink-0 flex-col-reverse gap-3 border-t border-[rgba(255,255,255,0.60)] pt-4 sm:flex-row sm:justify-end sm:space-x-0 dark:border-white/10">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="h-10 w-full rounded-[12px] border-white/65 bg-white/70 text-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_24px_-18px_rgba(90,128,198,0.22)] sm:w-auto sm:min-w-[112px]"
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-10 w-full rounded-[12px] text-[14px] sm:w-auto sm:min-w-[132px]"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {isDeleting ? '删除中...' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
