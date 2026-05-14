'use client';

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { APP_CONFIGS } from './apps-modal';
import {
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileText,
  History,
  Palette,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

interface MobileAppDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRIMARY_APP_IDS = new Set(['chat', 'image', 'voice']);

const QUICK_LINKS = [
  {
    href: '/admin/users',
    label: '系统用户管理',
    description: '查看静态用户列表、角色与额度配置展示',
    icon: ShieldCheck,
  },
  {
    href: '/history',
    label: '历史',
    description: '查看最近生成与对话记录',
    icon: History,
  },
  {
    href: '/resume',
    label: '简历',
    description: '快速进入简历制作工作区',
    icon: FileText,
  },
  {
    href: '/profile',
    label: '个人中心',
    description: '查看资料、算力消耗与账户安全操作',
    icon: CircleUserRound,
  },
];

const drawerApps = APP_CONFIGS.filter((app) => !PRIMARY_APP_IDS.has(app.id));

const APP_ICON_OVERRIDES: Partial<Record<(typeof drawerApps)[number]['id'], React.ElementType>> = {};

const QUICK_LINK_ICON_STYLES: Record<
  (typeof QUICK_LINKS)[number]['href'],
  { iconBg: string; iconColor: string; iconRing: string }
> = {
  '/admin/users': {
    iconBg:
      'bg-[linear-gradient(180deg,rgba(239,244,255,0.98),rgba(225,235,255,0.92))] dark:bg-[linear-gradient(180deg,rgba(37,52,97,0.92),rgba(29,40,76,0.88))]',
    iconColor: 'text-[#5878F6] dark:text-[#B9C7FF]',
    iconRing: 'border-[#D8E3FF] dark:border-[#344A86]',
  },
  '/history': {
    iconBg:
      'bg-[linear-gradient(180deg,rgba(241,244,255,0.98),rgba(229,234,255,0.92))] dark:bg-[linear-gradient(180deg,rgba(49,48,102,0.92),rgba(34,35,79,0.88))]',
    iconColor: 'text-[#6A77F8] dark:text-[#C3C8FF]',
    iconRing: 'border-[#DCE3FF] dark:border-[#413F88]',
  },
  '/resume': {
    iconBg:
      'bg-[linear-gradient(180deg,rgba(236,249,245,0.98),rgba(217,243,235,0.94))] dark:bg-[linear-gradient(180deg,rgba(27,76,72,0.92),rgba(20,58,56,0.88))]',
    iconColor: 'text-[#2D9A83] dark:text-[#9EE8D7]',
    iconRing: 'border-[#CFEFE7] dark:border-[#215B54]',
  },
  '/profile': {
    iconBg:
      'bg-[linear-gradient(180deg,rgba(246,242,255,0.98),rgba(236,231,255,0.94))] dark:bg-[linear-gradient(180deg,rgba(68,48,103,0.92),rgba(47,34,76,0.88))]',
    iconColor: 'text-[#7A63DE] dark:text-[#D2C6FF]',
    iconRing: 'border-[#E4DBFF] dark:border-[#523B83]',
  },
};

const THEME_ICON_STYLE = {
  iconBg:
    'bg-[linear-gradient(180deg,rgba(255,246,233,0.98),rgba(255,236,208,0.94))] dark:bg-[linear-gradient(180deg,rgba(92,64,30,0.92),rgba(64,45,22,0.88))]',
  iconColor: 'text-[#D38B2E] dark:text-[#FFD48B]',
  iconRing: 'border-[#F8E1BE] dark:border-[#775526]',
};

function DrawerIconTile({
  icon: Icon,
  iconBg,
  iconColor,
  iconRing,
  disabled = false,
  size = 'md',
}: {
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  iconRing?: string;
  disabled?: boolean;
  size?: 'md' | 'sm';
}) {
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_10px_24px_-18px_rgba(93,124,250,0.32)]',
        size === 'md' ? 'h-12 w-12' : 'h-10 w-10',
        iconRing ?? 'border-white/70 dark:border-white/10',
        iconBg ?? 'bg-[linear-gradient(180deg,rgba(243,246,255,0.95),rgba(231,237,255,0.9))]',
        disabled
          ? 'text-slate-400 dark:bg-slate-800/80 dark:text-slate-500'
          : cn(iconColor ?? 'text-[#5D7CFA]', 'dark:text-[#B8C6FF]')
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/45 via-transparent to-transparent dark:from-white/5" />
      <Icon className={cn('relative', size === 'md' ? 'h-5 w-5' : 'h-4.5 w-4.5')} strokeWidth={2} />
    </div>
  );
}

const CARD_SURFACE =
  'rounded-[24px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_16px_32px_-24px_rgba(93,124,250,0.22)] backdrop-blur-[18px] transition-[transform,box-shadow,border-color,background-color] duration-200 active:scale-[0.985] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.9),rgba(17,24,39,0.86))] dark:shadow-[0_20px_36px_-28px_rgba(0,0,0,0.5)]';

export function MobileAppDrawer({ open, onOpenChange }: MobileAppDrawerProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';

  // 非管理员不显示管理入口
  const filteredQuickLinks = QUICK_LINKS.filter((link) => link.href !== '/admin/users' || isAdmin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="inset-x-0 bottom-0 top-auto flex w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-[32px] rounded-b-none border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-0 shadow-[0_-24px_60px_-28px_rgba(93,124,250,0.28)] max-h-[min(78dvh,720px)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(17,18,24,0.98),rgba(15,23,42,0.96))]"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex justify-center px-4 pb-2 pt-3">
            <div className="h-1.5 w-12 rounded-full bg-[#D8E0EF] dark:bg-slate-700" />
          </div>
          <div className="border-b border-slate-200/80 px-5 pb-4 dark:border-slate-800/80">
            <DialogTitle className="font-[var(--font-space-grotesk)] text-[18px] font-bold tracking-tight text-slate-900 dark:text-white">
              更多应用
            </DialogTitle>
            <DialogDescription className="mt-1 text-[14px] leading-6 text-slate-500 dark:text-slate-400">
              在移动端切换更多能力与全局入口
            </DialogDescription>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">
            <section className="space-y-3">
              <h3 className="px-1 text-[11px] font-semibold tracking-[0.05em] text-slate-500 dark:text-slate-400">
                应用入口
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {drawerApps.map((app) => {
                  const isDisabled = app.disabled === true;
                  const DrawerIcon = APP_ICON_OVERRIDES[app.id] ?? app.icon;

                  return (
                    <button
                      key={app.id}
                      type="button"
                      disabled={isDisabled}
                      aria-disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        router.push(app.href);
                        onOpenChange(false);
                      }}
                      className={cn(
                        CARD_SURFACE,
                        'relative px-4 py-4 text-left',
                        isDisabled
                          ? 'cursor-not-allowed opacity-75'
                          : 'hover:-translate-y-[1px] hover:border-[#D7E0FF] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_20px_32px_-24px_rgba(93,124,250,0.3)] dark:hover:border-[#33487C]'
                      )}
                    >
                      {isDisabled ? (
                        <span className="absolute right-4 top-4 rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-300">
                          开发中
                        </span>
                      ) : null}
                      <div className="flex items-start gap-3">
                        <DrawerIconTile
                          icon={DrawerIcon}
                          iconBg={app.iconBg}
                          iconColor={app.iconColor}
                          disabled={isDisabled}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {app.label}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {isDisabled
                              ? (app.disabledDescription ?? app.description)
                              : app.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mt-5 space-y-3">
              <h3 className="px-1 text-[11px] font-semibold tracking-[0.05em] text-slate-500 dark:text-slate-400">
                常用入口
              </h3>
              <div className="space-y-2">
                {filteredQuickLinks.map((item) => (
                  (() => {
                    const iconStyle = QUICK_LINK_ICON_STYLES[item.href as keyof typeof QUICK_LINK_ICON_STYLES];

                    return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      router.push(item.href);
                      onOpenChange(false);
                    }}
                    className={cn(
                      CARD_SURFACE,
                      'flex w-full items-center justify-between px-4 py-3.5 hover:-translate-y-[1px] hover:border-[#D7E0FF] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_20px_32px_-24px_rgba(93,124,250,0.3)] dark:hover:border-[#33487C]'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <DrawerIconTile
                        icon={item.icon}
                        size="sm"
                        iconBg={iconStyle?.iconBg}
                        iconColor={iconStyle?.iconColor}
                        iconRing={iconStyle?.iconRing}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white text-left">
                          {item.label}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                  </button>
                    );
                  })()
                ))}

                <div className={cn(CARD_SURFACE, 'flex w-full items-center justify-between px-4 py-3.5')}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <DrawerIconTile
                      icon={Palette}
                      size="sm"
                      iconBg={THEME_ICON_STYLE.iconBg}
                      iconColor={THEME_ICON_STYLE.iconColor}
                      iconRing={THEME_ICON_STYLE.iconRing}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        主题切换
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        在浅色与深色模式间切换
                      </p>
                    </div>
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
