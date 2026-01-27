'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '../theme/theme-toggle';
import { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-dark-bg transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-dark-surface border-r border-slate-200 dark:border-dark-border flex flex-col shadow-sm transition-colors duration-300">
        {/* Logo */}
        <div className="p-6 border-b border-slate-200 dark:border-dark-border flex items-center gap-3 transition-colors duration-300">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 rounded-xl flex items-center justify-center shadow-md">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-xl font-bold text-slate-900 dark:text-white transition-colors duration-300">
            AI Suite
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            核心服务
          </div>
          <ul className="space-y-1">
            <li>
              <Link
                href="/"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer ${
                  isActive('/')
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                首页
              </Link>
            </li>
            <li>
              <Link
                href="/chat"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer ${
                  isActive('/chat')
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
                智能对话
              </Link>
            </li>
            <li>
              <Link
                href="/voice"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer ${
                  isActive('/voice')
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                语音转写
              </Link>
            </li>
            <li>
              <Link
                href="/image"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer ${
                  isActive('/image')
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                灵感绘图
              </Link>
            </li>
          </ul>

          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-8 mb-3">
            个人中心
          </div>
          <ul className="space-y-1">
            <li>
              <Link
                href="/history"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer ${
                  isActive('/history')
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                历史记录
              </Link>
            </li>
            <li>
              <Link
                href="/templates"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors duration-200 cursor-pointer ${
                  isActive('/templates')
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
                模板库
              </Link>
            </li>
          </ul>
        </nav>

        {/* Theme Toggle & User Profile */}
        <div className="p-4 border-t border-slate-200 dark:border-dark-border space-y-2 transition-colors duration-300">
          <ThemeToggle />

          <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors duration-200">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 dark:from-emerald-400 dark:to-emerald-500 rounded-full flex items-center justify-center text-white font-semibold relative shadow-sm">
              U
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 dark:bg-emerald-300 border-2 border-white dark:border-dark-surface rounded-full"></div>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900 dark:text-white">用户账户</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Pro 会员版</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
