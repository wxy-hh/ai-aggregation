'use client';

import { useEffect, useRef, useState } from 'react';
import { MoonStar, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';
import { useAstrologyNightThemeStore } from '@/stores/astrology-night-theme-store';
import { resolveAstrologyNightTheme } from '@/lib/utils/astrology-night-theme';

// ═══════════════════════════════════════════════════════════════
//  星座寰宇结果页主题切换 —「白昼 ⇄ 夜幕观星」
//  - 手动偏好持久化（astrology-night-theme-store），仅在全局亮时生效
//  - 全局暗色时页面恒为夜幕（html.dark 级联无法局部撤销，白昼视图不可交付），
//    切换钮无可切之物，整体不渲染
//  - 首次进入白昼态展示一次性邀请气泡（5s 自动消失，点击即记已见）
//  - 视觉语言与紫微 ZiweiThemeToggle 同型，但用结果页玻璃卡体系（不引 zw-* 类）
// ═══════════════════════════════════════════════════════════════

/** 邀请气泡自动消失时长 */
const INVITE_TIMEOUT_MS = 5000;

export function AstrologyNightToggle() {
  const pref = useAstrologyNightThemeStore((s) => s.pref);
  const inviteSeen = useAstrologyNightThemeStore((s) => s.inviteSeen);
  const setPref = useAstrologyNightThemeStore((s) => s.setPref);
  const markInviteSeen = useAstrologyNightThemeStore((s) => s.markInviteSeen);
  const systemResolved = useSettingsStore((s) => s.resolvedTheme);

  const resolved = resolveAstrologyNightTheme(pref, systemResolved);
  const isNight = resolved === 'night';

  const [showInvite, setShowInvite] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearInviteTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // 仅白昼态且从未见过时展示邀请；暗色全局默认夜幕，邀请无意义
  useEffect(() => {
    if (inviteSeen || isNight) return;
    setShowInvite(true);
    timerRef.current = window.setTimeout(() => {
      setShowInvite(false);
      markInviteSeen();
    }, INVITE_TIMEOUT_MS);
    return clearInviteTimer;
  }, [inviteSeen, isNight, markInviteSeen]);

  const dismissInvite = () => {
    clearInviteTimer();
    if (showInvite) {
      setShowInvite(false);
    }
    markInviteSeen();
  };

  const handleToggle = () => {
    dismissInvite();
    setPref(isNight ? 'day' : 'night');
  };

  const Icon = isNight ? Sun : MoonStar;
  const label = isNight ? '切换到白昼视图' : '切换夜幕观星';

  // 全局暗色：页面恒夜幕，白昼视图不可交付（html.dark 级联不可局部撤销），切换钮无可切之物不渲染
  if (systemResolved === 'dark') return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={label}
        title={label}
        className={cn(
          'night-toggle inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
          'border-indigo-200/70 bg-white/70 text-indigo-600 hover:bg-indigo-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          'dark:border-indigo-300/20 dark:bg-white/[0.06] dark:text-indigo-200 dark:hover:bg-white/[0.1]',
          showInvite && 'astrology-invite-pulse'
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
        <span className="hidden sm:inline">{isNight ? '白昼' : '夜幕观星'}</span>
      </button>

      {/* 首次邀请气泡（仅一次）：玻璃卡 + 小箭头指向按钮 */}
      {showInvite && (
        <div
          role="status"
          className="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-indigo-200/60 bg-white/95 p-3 text-xs leading-relaxed shadow-[0_16px_40px_-16px_rgba(30,41,82,0.3)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#0D1226]/[0.92]"
        >
          <span
            aria-hidden
            className="absolute -top-[5px] right-5 h-2.5 w-2.5 rotate-45 border-l border-t border-indigo-200/60 bg-white dark:border-white/10 dark:bg-[#0D1226]"
          />
          <span className="font-semibold text-indigo-600 dark:text-indigo-200">试试夜幕观星</span>
          <span className="text-slate-500 dark:text-night-muted">，沉浸查看星盘</span>
        </div>
      )}
    </div>
  );
}
