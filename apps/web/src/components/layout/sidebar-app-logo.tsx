'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

type SidebarAppLogoMarkProps = {
  className?: string;
};

/**
 * 星盘图形（源自 星盘.svg）
 * 小尺寸优先线型结构清晰
 */
export function SidebarAppLogoMark({ className }: SidebarAppLogoMarkProps) {
  const rawId = useId();
  const id = rawId.replace(/:/g, '');

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-ring`} x1="14" y1="12" x2="86" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1D4ED8" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient
          id={`${id}-ring-dark`}
          x1="14"
          y1="12"
          x2="86"
          y2="88"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#93C5FD" />
          <stop offset="1" stopColor="#A5B4FC" />
        </linearGradient>
        <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
          <stop stopColor="#3B82F6" stopOpacity="0.2" />
          <stop offset="0.6" stopColor="#2563EB" stopOpacity="0.08" />
          <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-halo-dark`} cx="50%" cy="50%" r="50%">
          <stop stopColor="#60A5FA" stopOpacity="0.24" />
          <stop offset="0.65" stopColor="#3B82F6" stopOpacity="0.1" />
          <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 内置科技蓝柔光（克制、低饱和） */}
      <circle cx="50" cy="50" r="40" fill={`url(#${id}-halo)`} className="dark:hidden" />
      <circle cx="50" cy="50" r="40" fill={`url(#${id}-halo-dark)`} className="hidden dark:block" />

      <circle
        cx="50"
        cy="50"
        r="37"
        stroke={`url(#${id}-ring)`}
        strokeWidth="2"
        className="dark:hidden"
      />
      <circle
        cx="50"
        cy="50"
        r="37"
        stroke={`url(#${id}-ring-dark)`}
        strokeWidth="2"
        className="hidden dark:block"
      />

      <circle
        cx="50"
        cy="50"
        r="24"
        stroke="#4F46E5"
        strokeWidth="1.15"
        strokeDasharray="4 3.5"
        className="dark:stroke-[#A5B4FC]"
      />

      <line
        x1="23"
        y1="23"
        x2="77"
        y2="77"
        stroke="#94A3B8"
        strokeWidth="1"
        strokeLinecap="round"
        className="dark:stroke-slate-500"
      />
      <line
        x1="77"
        y1="23"
        x2="23"
        y2="77"
        stroke="#94A3B8"
        strokeWidth="1"
        strokeLinecap="round"
        className="dark:stroke-slate-500"
      />

      <line
        x1="50"
        y1="13"
        x2="50"
        y2="87"
        stroke="#1E3A8A"
        strokeWidth="1.55"
        strokeLinecap="round"
        className="dark:stroke-slate-200"
      />
      <line
        x1="13"
        y1="50"
        x2="87"
        y2="50"
        stroke="#1E3A8A"
        strokeWidth="1.55"
        strokeLinecap="round"
        className="dark:stroke-slate-200"
      />

      <path
        d="M23,23 L36,50 M77,23 L64,50 M23,77 L36,50 M77,77 L64,50"
        stroke="#2563EB"
        strokeWidth="1.2"
        strokeLinecap="round"
        className="dark:stroke-[#60A5FA]"
      />

      <circle
        cx="50"
        cy="50"
        r="7.5"
        stroke="#7C3AED"
        strokeWidth="1"
        strokeOpacity="0.55"
        className="dark:stroke-[#C4B5FD] dark:stroke-opacity-0.65"
      />
      <circle cx="50" cy="50" r="3.5" fill="#2563EB" className="dark:fill-[#93C5FD]" />
    </svg>
  );
}

type SidebarAppLogoProps = {
  className?: string;
};

/** 侧边栏 Logo：无背景框，星盘 + 双层柔和光晕 */
export function SidebarAppLogo({ className }: SidebarAppLogoProps) {
  return (
    <span
      className={cn(
        'relative inline-flex h-10 w-10 shrink-0 items-center justify-center',
        className
      )}
    >
      {/* CSS 科技蓝外晕（细线 SVG 无法用 drop-shadow） */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[-6px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.26)_0%,rgba(37,99,235,0.1)_48%,transparent_70%)] opacity-75 blur-[8px] transition-opacity duration-200 group-hover:opacity-90 dark:bg-[radial-gradient(circle,rgba(96,165,250,0.3)_0%,rgba(59,130,246,0.12)_48%,transparent_70%)]"
      />
      <SidebarAppLogoMark className="relative h-10 w-10 transition-transform duration-200 ease-out group-hover:scale-[1.03]" />
    </span>
  );
}
