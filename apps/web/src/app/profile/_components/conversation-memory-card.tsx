'use client';

/**
 * 会话记忆检索设置卡片 (工单 09 / QA-005 / QA-006)
 *
 * 严格遵循隐私边界：
 * 1. 默认关闭 (aria-checked="false"，严格 opt-in)
 * 2. 开启后历史会话建立加密向量索引用于检索
 * 3. 触区 ≥ 44px（移动端红线规范）
 * 4. 关闭前需二次确认，确认后彻底物理级联删除当前用户的全部 ConversationMemoryChunk
 */

import React, { useState } from 'react';
import { AlertTriangle, Brain, ShieldCheck } from 'lucide-react';
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
import { useAuthStore } from '@/stores/auth-store';
import { updateProfile } from '@/lib/api/profile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const SOLID_CARD =
  'group relative overflow-hidden rounded-[24px] border border-slate-900/[0.06] bg-white shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none dark:hover:border-white/15';

const DIALOG_SHELL =
  'w-[calc(100vw-32px)] overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/95 p-0 shadow-[0_24px_50px_-12px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95';

const DIALOG_OVERLAY = 'bg-slate-950/45 backdrop-blur-md dark:bg-slate-950/65';

const DIALOG_CANCEL_BUTTON =
  'h-11 rounded-xl border-slate-200/90 text-[#475569] hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10';

export function ConversationMemoryCard() {
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // 严格默认 false（新用户默认为 false）
  const isEnabled = user?.memorySearchEnabled === true;

  const handleToggle = async (checked: boolean) => {
    if (!checked) {
      setIsConfirmCloseOpen(true);
      return;
    }

    setLoading(true);
    try {
      await updateProfile({ memorySearchEnabled: true });
      await fetchUser();
      toast.success('已开启会话记忆检索');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '开启会话记忆检索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmClose = async () => {
    setLoading(true);
    try {
      await updateProfile({ memorySearchEnabled: false });
      await fetchUser();
      setIsConfirmCloseOpen(false);
      toast.success('已关闭会话记忆检索并彻底清空存量数据');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '关闭会话记忆检索失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className={cn(SOLID_CARD, 'flex h-full flex-col justify-between p-6')}>
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                <Brain className="h-4 w-4" />
              </span>
              <h3 className="font-[var(--font-space-grotesk)] text-lg font-semibold tracking-tight text-[#0F172A] dark:text-white">
                会话记忆检索
              </h3>
            </div>
            {/* 触区 ≥ 44px 满足移动端红线规范 */}
            <label
              htmlFor="memory-search-toggle"
              className="-mr-2 inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center p-2"
            >
              <Switch
                id="memory-search-toggle"
                aria-label="会话记忆检索"
                checked={isEnabled}
                disabled={loading}
                onCheckedChange={handleToggle}
              />
            </label>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#64748B] dark:text-slate-400">
            开启后新产生的对话将建立加密向量索引；关闭后将彻底删除已索引的记忆切片与为记忆保存的对话内容。
          </p>
        </div>

        <div className="mt-5 flex items-center gap-2">
          {isEnabled ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 text-xs font-semibold text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              已开启记忆增强
            </span>
          ) : (
            <span className="inline-flex h-7 items-center rounded-full bg-slate-500/10 px-2.5 text-xs font-semibold text-slate-500 dark:bg-slate-400/10 dark:text-slate-400">
              默认未开启
            </span>
          )}
        </div>
      </div>

      {/* 关闭确认二次弹窗 */}
      <Dialog open={isConfirmCloseOpen} onOpenChange={setIsConfirmCloseOpen}>
        <DialogContent
          overlayClassName={DIALOG_OVERLAY}
          className={cn(DIALOG_SHELL, 'max-w-[460px] p-6 sm:p-8')}
        >
          <DialogHeader className="space-y-3 text-left">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <DialogTitle className="font-[var(--font-space-grotesk)] text-xl font-bold text-[#0F172A] dark:text-white">
              关闭会话记忆检索确认
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-[#64748B] dark:text-slate-400">
              关闭后将彻底删除已索引的记忆切片与为记忆保存的对话内容，历史对话数据将不再被检索。此操作不可撤销，是否确认关闭？
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-7 flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              className={DIALOG_CANCEL_BUTTON}
              onClick={() => setIsConfirmCloseOpen(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              onClick={handleConfirmClose}
              className="h-11 rounded-xl text-sm shadow-[0_10px_24px_rgba(244,92,126,0.28)]"
            >
              {loading ? '处理中...' : '确认关闭并删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
