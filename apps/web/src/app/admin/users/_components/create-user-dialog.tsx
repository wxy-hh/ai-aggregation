'use client';

import React, { useState } from 'react';
import { UserPlus, KeyRound, UserRound } from 'lucide-react';
import { usePasswordValidation, PasswordToggleButton } from '@/hooks/use-password-toggle';
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
import { DIALOG_OVERLAY_CLASSES, EDIT_DIALOG_CONTENT_CLASSES } from './dialog-styles';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateUserDialog({ open, onOpenChange, onSuccess }: CreateUserDialogProps) {
  const [username, setUsername] = useState('');
  const {
    password,
    confirmPassword,
    showPassword,
    showConfirmPassword,
    setPassword,
    setConfirmPassword,
    togglePassword,
    toggleConfirmPassword,
    isMatch,
    reset,
  } = usePasswordValidation();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // 重置表单状态
  const resetForm = () => {
    setUsername('');
    reset();
    setError('');
    setIsSaving(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }
    if (password.trim().length < 6) {
      setError('密码长度不能少于 6 位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await adminApi.createUser({
        username: username.trim(),
        password: password.trim(),
      });
      toast.success('用户创建成功');
      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建用户失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showClose={false}
        overlayClassName={DIALOG_OVERLAY_CLASSES}
        className={EDIT_DIALOG_CONTENT_CLASSES}
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
            新增用户
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-[1.5] text-slate-500 dark:text-slate-400">
            创建新的系统用户账号，填写基本信息后即可完成注册。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {error ? (
            <div className="mb-4 rounded-[16px] border border-rose-200/90 bg-rose-50/90 px-4 py-3 text-[14px] text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4">
            <div className="relative overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.60)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.58),rgba(255,255,255,0.38))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_16px_28px_-24px_rgba(59,130,246,0.14)] backdrop-blur-[18px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0.6))] sm:rounded-[24px]">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/24 to-transparent dark:from-white/5" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/70 bg-white/80 text-[#1D46DB] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_20px_-18px_rgba(59,130,246,0.22)] dark:border-white/10 dark:bg-slate-900/72 dark:text-[#A8BAFF]">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-semibold text-slate-950 dark:text-white">基本信息</p>
                  <p className="mt-1 text-[14px] leading-[1.5] text-slate-500 dark:text-slate-400">
                    填写新用户的账号信息，用户名和密码为必填项。
                  </p>
                  <div className="mt-4 grid gap-3">
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
                        用户名 <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="请输入用户名"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="h-[44px] w-full rounded-[12px] border border-[rgba(255,255,255,0.70)] bg-white/76 pl-10 pr-4 text-[14px] text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_8px_20px_rgba(76,95,154,0.08)] outline-none placeholder:text-slate-400 dark:border-white/10 dark:bg-slate-900/72 dark:text-white dark:placeholder:text-slate-500"
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
                        密码 <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="请输入密码（至少 6 位）"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-[44px] w-full rounded-[12px] border border-[rgba(255,255,255,0.70)] bg-white/76 pl-10 pr-12 text-[14px] text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_8px_20px_rgba(76,95,154,0.08)] outline-none placeholder:text-slate-400 dark:border-white/10 dark:bg-slate-900/72 dark:text-white dark:placeholder:text-slate-500"
                          disabled={isSaving}
                        />
                        <PasswordToggleButton
                          show={showPassword}
                          onToggle={togglePassword}
                          className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[10px] text-slate-400 transition-colors hover:bg-[#eef4ff] hover:text-[#3c6df3] dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
                        确认密码 <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="请再次输入密码"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="h-[44px] w-full rounded-[12px] border border-[rgba(255,255,255,0.70)] bg-white/76 pl-10 pr-12 text-[14px] text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_8px_20px_rgba(76,95,154,0.08)] outline-none placeholder:text-slate-400 dark:border-white/10 dark:bg-slate-900/72 dark:text-white dark:placeholder:text-slate-500"
                          disabled={isSaving}
                        />
                        <PasswordToggleButton
                          show={showConfirmPassword}
                          onToggle={toggleConfirmPassword}
                          className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[10px] text-slate-400 transition-colors hover:bg-[#eef4ff] hover:text-[#3c6df3] dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        />
                      </div>
                      {isMatch !== null && (
                        <p
                          className={cn(
                            'mt-1.5 text-[13px]',
                            isMatch
                              ? 'text-emerald-600'
                              : 'text-rose-500'
                          )}
                        >
                          {isMatch ? '✓ 两次密码输入一致' : '✗ 两次密码输入不一致'}
                        </p>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 shrink-0 flex-col-reverse gap-3 border-t border-[rgba(255,255,255,0.60)] pt-4 sm:flex-row sm:justify-end sm:space-x-0 dark:border-white/10">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
            className="h-10 w-full rounded-[12px] border-white/65 bg-white/70 text-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_12px_24px_-18px_rgba(90,128,198,0.22)] sm:w-auto sm:min-w-[112px]"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="h-10 w-full rounded-[12px] text-[14px] sm:w-auto sm:min-w-[132px]"
          >
            {isSaving ? '创建中...' : '创建用户'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
