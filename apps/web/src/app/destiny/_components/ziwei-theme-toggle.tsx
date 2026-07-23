'use client';

import { useEffect, useRef, useState } from 'react';
import { MoonStar, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';
import { useZiweiThemeStore } from '@/stores/ziwei-theme-store';
import { resolveZiweiTheme } from '@/lib/utils/ziwei-theme';

// ═══════════════════════════════════════════════════════════════
//  紫微结果页主题切换 —「白昼 ⇄ 夜幕观星」
//  - 手动偏好持久化（ziwei-theme-store），缺省跟随系统明暗
//  - 首次进入白昼态展示一次性邀请气泡（5s 自动消失，点击即记已见）
//  - 暗色系统默认夜幕，此时邀请无意义，不展示
// ═══════════════════════════════════════════════════════════════

/** 邀请气泡自动消失时长 */
const INVITE_TIMEOUT_MS = 5000;

export function ZiweiThemeToggle() {
  const pref = useZiweiThemeStore((s) => s.pref);
  const inviteSeen = useZiweiThemeStore((s) => s.inviteSeen);
  const setPref = useZiweiThemeStore((s) => s.setPref);
  const markInviteSeen = useZiweiThemeStore((s) => s.markInviteSeen);
  const systemResolved = useSettingsStore((s) => s.resolvedTheme);

  const resolved = resolveZiweiTheme(pref, systemResolved);
  const isNight = resolved === 'night';

  const [showInvite, setShowInvite] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearInviteTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // 仅白昼态且从未见过时展示邀请；暗色系统默认夜幕，邀请无意义
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={label}
        title={label}
        className={cn('zw-gold-btn gap-1.5', showInvite && 'zw-invite-pulse')}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
        <span className="hidden sm:inline">{isNight ? '白昼' : '夜幕观星'}</span>
      </button>

      {/* 首次邀请气泡（仅一次）：鎏金描边 + 小箭头指向按钮 */}
      {showInvite && (
        <div
          role="status"
          className="zw-tooltip absolute right-0 top-full z-20 mt-2 w-44 rounded-xl p-3 text-xs leading-relaxed"
        >
          <span
            aria-hidden
            className="absolute -top-[5px] right-5 h-2.5 w-2.5 rotate-45"
            style={{
              background: 'var(--zw-panel-bg-95)',
              borderLeft: '1px solid var(--zw-gold-a20)',
              borderTop: '1px solid var(--zw-gold-a20)',
            }}
          />
          <span className="zw-text-gold font-song font-bold">试试夜幕观星</span>
          <span className="zw-text-2">，沉浸查看星盘</span>
        </div>
      )}
    </div>
  );
}
