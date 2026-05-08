'use client';

import React from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { APP_CONFIGS } from './apps-modal';
import { Clock3, FileStack, FileText } from 'lucide-react';

interface MobileAppDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRIMARY_APP_IDS = new Set(['chat', 'image', 'voice']);

const QUICK_LINKS = [
  {
    href: '/history',
    label: '历史',
    description: '查看最近生成与对话记录',
    icon: Clock3,
  },
  {
    href: '/resume',
    label: '简历',
    description: '快速进入简历制作工作区',
    icon: FileText,
  },
];

const drawerApps = APP_CONFIGS.filter((app) => !app.disabled && !PRIMARY_APP_IDS.has(app.id));

export function MobileAppDrawer({ open, onOpenChange }: MobileAppDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="inset-x-0 bottom-0 top-auto flex w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-[28px] rounded-b-none border-0 bg-white p-0 shadow-2xl max-h-[min(78dvh,720px)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom dark:bg-[#111218]"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex justify-center px-4 pb-2 pt-3">
            <div className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
          </div>
          <div className="border-b border-slate-200/80 px-4 pb-4 dark:border-slate-800/80">
            <DialogTitle className="text-base font-semibold text-slate-900 dark:text-white">
              更多应用
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              在移动端切换更多能力与全局入口
            </DialogDescription>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">应用入口</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {drawerApps.map((app) => (
                  <Link
                    key={app.id}
                    href={app.href}
                    onClick={() => onOpenChange(false)}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-3 transition-colors dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${app.iconBg} ${app.iconColor}`}
                      >
                        <app.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {app.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {app.description}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="mt-5 space-y-3">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">常用入口</h3>
              <div className="space-y-2">
                {QUICK_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {item.label}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}

                <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">主题切换</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      在浅色与深色模式间切换
                    </p>
                  </div>
                  <ThemeToggle className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200/80 text-slate-600 transition-colors dark:bg-slate-800 dark:text-slate-300" />
                </div>
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
