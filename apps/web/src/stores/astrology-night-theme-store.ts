'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AstrologyNightPref } from '@/lib/utils/astrology-night-theme';

// ==================== 类型定义 ====================

export interface AstrologyNightThemeState {
  /** 用户手动选择的主题；null = 跟随全局（亮→白昼 / 暗→夜幕） */
  pref: AstrologyNightPref;
  /** 首次「夜幕观星」邀请提示是否已展示（仅展示一次） */
  inviteSeen: boolean;

  setPref: (pref: Exclude<AstrologyNightPref, null>) => void;
  /** 清除手动偏好，回归跟随全局 */
  clearPref: () => void;
  markInviteSeen: () => void;
}

// ==================== Store 实现 ====================

/** 星座寰宇结果页主题偏好（localStorage 持久化，优先于跟随全局） */
export const useAstrologyNightThemeStore = create<AstrologyNightThemeState>()(
  persist(
    (set) => ({
      pref: null,
      inviteSeen: false,

      setPref: (pref) => set({ pref }),
      clearPref: () => set({ pref: null }),
      markInviteSeen: () => set({ inviteSeen: true }),
    }),
    {
      name: 'astrology-result-theme',
      storage: createJSONStorage(() => localStorage),
      // 只持久化偏好与邀请标记，无派生状态
      partialize: (state) => ({
        pref: state.pref,
        inviteSeen: state.inviteSeen,
      }),
    }
  )
);
