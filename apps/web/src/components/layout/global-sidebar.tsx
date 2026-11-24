'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Plus, Clock, Home, User, Shield, Activity } from 'lucide-react';
import { ThemeToggle } from '../theme/theme-toggle';
import { AppsModal, APP_CONFIGS, type AppId } from './apps-modal';
import { AnimatePresence, motion } from 'framer-motion';
import { usePinnedApps, useShowAppsModal, useUIActions } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { SidebarAppLogo } from '@/components/layout/sidebar-app-logo';
import { toast } from 'sonner';

// 底部折叠链接：基础尺寸 + 非激活态，三个入口（管理/历史/主题）共用；遵循 Emil Kowalski 物理动效规范，拒绝卡顿与过度渲染
const bottomLinkBaseCls =
  'w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-md backdrop-saturate-150 border shadow-sm select-none transition-[color,background-color,border-color,box-shadow,transform] duration-fast ease-out-expo';
const bottomLinkStateCls =
  'bg-white/40 dark:bg-slate-800/40 border-white/40 dark:border-slate-700/40 text-slate-400 hover:bg-white/80 dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-indigo-200/40 dark:hover:shadow-black/50 hover:text-[#5D7CFA] dark:hover:text-[#91A4FF] hover:scale-105 active:scale-[0.96]';
const bottomLinkActiveCls =
  'bg-gradient-to-br from-[#5D7CFA] to-[#7D91FF] border-transparent text-white shadow-lg shadow-indigo-500/35 scale-105 active:scale-[0.96]';

export function GlobalSidebar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  // 界面状态与固定应用列表管理
  const pinnedApps = usePinnedApps();
  const showAppsModal = useShowAppsModal();
  const { addPinnedApp, removePinnedApp, setAppsModal } = useUIActions();

  const displayName = user?.name?.trim() || '个人中心';
  const avatarSrc = user?.avatar?.trim() || null;

  // 底部快捷菜单折叠状态
  const [isBottomExpanded, setIsBottomExpanded] = useState(false);

  // 路径匹配逻辑
  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  // 切换固定应用：直接触发响应并使用统一的 Sonner 轻量通知，移除高耗能的抛物线重渲染循环
  const handleTogglePin = (id: AppId) => {
    const appConfig = APP_CONFIGS.find((a) => a.id === id);
    const appName = appConfig?.label || '应用';

    if (pinnedApps.includes(id)) {
      removePinnedApp(id);
      toast.info(`已从导航栏移除「${appName}」`);
    } else {
      addPinnedApp(id);
      toast.success(`已添加「${appName}」至导航栏`);
    }
  };

  return (
    <>
      <aside className="w-[100px] h-dvh-screen flex-shrink-0 z-50 select-none relative flex flex-col items-center py-6">
        {/* 悬浮玻璃侧边栏背景：G-2 档均匀玻璃（white/60 + blur-xl）。四角全圆角并带有对称留白 */}
        <div className="absolute inset-y-4 left-2.5 right-2.5 rounded-[28px] border border-white/50 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl backdrop-saturate-150 shadow-[0_20px_40px_-15px_rgba(59,130,246,0.12),0_8px_20px_-10px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.45)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] pointer-events-none" />

        {/* 顶部高光切割线 */}
        <div className="pointer-events-none absolute inset-x-2.5 top-4 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50" />

        {/* 背光光晕层 */}
        <div className="pointer-events-none absolute inset-y-4 left-2.5 right-2.5 rounded-[28px] bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />

        {/* 内容容器 */}
        <div className="relative z-10 flex flex-col items-center w-full h-full">
          {/* 品牌标识：星盘图标与光晕 */}
          <Link
            href="/home"
            aria-label="返回首页"
            className="mb-8 px-2 flex flex-col items-center gap-1 group active:scale-[0.97] transition-transform duration-fast ease-out-expo"
          >
            <SidebarAppLogo />
            <div className="mt-2 flex flex-col items-center">
              <span className="bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#6366F1] bg-clip-text text-[10px] font-semibold tracking-[0.14em] text-transparent uppercase leading-none dark:from-[#93C5FD] dark:via-[#A5B4FC] dark:to-[#C4B5FD]">
                AI Studio
              </span>
            </div>
          </Link>

          {/* 动态导航项列表 */}
          <nav className="sidebar-scrollbar flex-1 w-full flex flex-col gap-3 px-3 overflow-y-auto overflow-x-visible relative z-10 pt-2">
            {/* 首页固定入口 */}
            <div className="w-full">
              <Link href="/home" className="flex flex-col items-center gap-1 group w-full relative">
                {/* 激活状态侧边条 */}
                {pathname === '/home' && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-1 h-10 bg-[#6B83FA] rounded-r-full" />
                )}

                <div
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center relative select-none transition-[color,background-color,border-color,box-shadow,transform] duration-fast ease-out-expo',
                    pathname === '/home' || pathname === '/'
                      ? 'bg-gradient-to-br from-[#5D7CFA] to-[#7D91FF] text-white shadow-lg shadow-indigo-500/35 scale-105 active:scale-[0.96]'
                      : 'bg-white/40 dark:bg-slate-800/40 backdrop-blur-md backdrop-saturate-150 border border-white/40 dark:border-slate-700/40 shadow-sm text-slate-500 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-indigo-200/40 dark:hover:shadow-black/50 hover:text-[#5D7CFA] dark:hover:text-[#91A4FF] hover:scale-105 active:scale-[0.96]'
                  )}
                >
                  <Home className="w-5 h-5" strokeWidth={2} />
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium transition-colors duration-fast ease-out-expo',
                    pathname === '/home' || pathname === '/'
                      ? 'text-[#4E67E6] dark:text-[#9BADFF]'
                      : 'text-slate-500 dark:text-slate-400 group-hover:text-[#5D7CFA] dark:group-hover:text-[#9BADFF]'
                  )}
                >
                  首页
                </span>
              </Link>
            </div>

            {/* 固定的应用项：采用弹簧物理位移配合优雅入场退场 */}
            <AnimatePresence mode="popLayout">
              {pinnedApps.map((appId: AppId) => {
                const app = APP_CONFIGS.find((a) => a.id === appId);
                if (!app) return null;

                const active = isActive(app.href);

                return (
                  <motion.div
                    key={app.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.85, x: -16 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className="w-full"
                  >
                    <Link
                      href={app.href}
                      className="flex flex-col items-center gap-1 group w-full relative"
                    >
                      {/* 激活指示器 */}
                      {active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-1 h-10 bg-blue-500 rounded-r-full" />
                      )}

                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center relative select-none transition-[color,background-color,border-color,box-shadow,transform] duration-fast ease-out-expo',
                          active
                            ? 'bg-gradient-to-br from-[#5D7CFA] to-[#7D91FF] text-white shadow-lg shadow-indigo-500/35 scale-105 active:scale-[0.96]'
                            : 'bg-white/40 dark:bg-slate-800/40 backdrop-blur-md backdrop-saturate-150 border border-white/40 dark:border-slate-700/40 shadow-sm text-slate-500 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-indigo-200/40 dark:hover:shadow-black/50 hover:text-[#5D7CFA] dark:hover:text-[#91A4FF] hover:scale-105 active:scale-[0.96]'
                        )}
                      >
                        <app.icon className="w-5 h-5" strokeWidth={2} />
                      </div>

                      <span
                        className={cn(
                          'text-[10px] font-medium transition-colors duration-fast ease-out-expo text-center leading-tight px-1 line-clamp-1',
                          active
                            ? 'text-[#4E67E6] dark:text-[#9BADFF]'
                            : 'text-slate-500 dark:text-slate-400 group-hover:text-[#5D7CFA] dark:group-hover:text-[#9BADFF]'
                        )}
                      >
                        {app.label}
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* 添加更多应用入口按钮 */}
            <motion.button
              layout
              onClick={() => setAppsModal(true)}
              aria-label="打开应用中心"
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md backdrop-saturate-150 border border-white/40 dark:border-slate-700/40 shadow-sm text-slate-400 hover:bg-white/80 dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-indigo-200/40 dark:hover:shadow-black/50 hover:text-[#5D7CFA] dark:hover:text-[#91A4FF] hover:scale-105 active:scale-[0.96] transition-[color,background-color,border-color,box-shadow,transform] duration-fast ease-out-expo group mt-2 mx-auto"
            >
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-normal ease-out-expo" />
            </motion.button>
          </nav>

          {/* 底部智能折叠区域 */}
          <div
            className="mt-auto w-full px-3 pb-6 relative z-20"
            onMouseEnter={() => setIsBottomExpanded(true)}
            onMouseLeave={() => setIsBottomExpanded(false)}
          >
            {/* 向上展开的悬浮玻璃快捷卡片 */}
            <AnimatePresence>
              {isBottomExpanded && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl backdrop-saturate-150 border border-white/50 dark:border-white/10 rounded-2xl shadow-xl shadow-indigo-500/10 flex flex-col items-center gap-3 py-3 px-2 mx-auto mb-3 overflow-hidden"
                >
                  {user?.role === 'admin' && (
                    <>
                      <Link
                        href="/admin/eval"
                        aria-label="打开评测中枢"
                        title="评测中枢"
                        className={cn(
                          bottomLinkBaseCls,
                          pathname.startsWith('/admin/eval')
                            ? bottomLinkActiveCls
                            : bottomLinkStateCls
                        )}
                      >
                        <Activity className="w-5 h-5" />
                      </Link>
                      <Link
                        href="/admin/users"
                        aria-label="打开系统用户管理"
                        title="系统用户管理"
                        className={cn(
                          bottomLinkBaseCls,
                          pathname.startsWith('/admin/users')
                            ? bottomLinkActiveCls
                            : bottomLinkStateCls
                        )}
                      >
                        <Shield className="w-5 h-5" />
                      </Link>
                    </>
                  )}

                  {/* 历史记录 */}
                  <Link
                    href="/history"
                    aria-label="历史记录"
                    className={cn(bottomLinkBaseCls, bottomLinkStateCls)}
                  >
                    <Clock className="w-5 h-5" />
                  </Link>

                  {/* 主题切换 */}
                  <ThemeToggle className={cn(bottomLinkBaseCls, bottomLinkStateCls)} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* 用户头像入口 */}
            <Link
              href="/profile"
              aria-label="打开个人中心"
              className="group relative flex flex-col items-center gap-1 select-none active:scale-[0.96] transition-transform duration-fast ease-out-expo"
            >
              <div
                className={cn(
                  'relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border p-[2px] transition-[border-color,background-color,box-shadow,transform] duration-fast ease-out-expo',
                  pathname === '/profile'
                    ? 'border-[#7E96FF] bg-gradient-to-br from-[#6A82FF] via-[#88A0FF] to-[#A8B8FF] shadow-[0_10px_28px_rgba(93,124,250,0.38)] scale-105'
                    : 'border-white/70 bg-white/60 shadow-[0_8px_24px_rgba(102,119,174,0.18)] hover:scale-105 hover:shadow-[0_12px_28px_rgba(93,124,250,0.26)] dark:border-slate-700/70 dark:bg-slate-800/80'
                )}
              >
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white text-xs font-semibold text-slate-700 dark:bg-[#111827] dark:text-slate-100">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={`${displayName}头像`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </div>

                {/* 悬停时的环境外发光效果 */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-fast ease-out-expo pointer-events-none" />
              </div>
            </Link>
          </div>
        </div>
      </aside>

      <AppsModal
        isOpen={showAppsModal}
        onClose={() => setAppsModal(false)}
        pinnedApps={pinnedApps}
        onTogglePin={handleTogglePin}
      />
    </>
  );
}
