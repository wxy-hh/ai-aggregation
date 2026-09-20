'use client';

/**
 * astrology-temp-record.ts —— 星座寰宇匿名会话临时记录（11 工单）
 *
 * 设计文档 §6.7/§12：匿名用户只保留当前会话的临时记录，
 * 登录后经明确确认才迁移为统一历史；未确认的临时记录会话结束后删除。
 *
 * 实现口径：sessionStorage 持久化——刷新或整页跳转（如去 /login 登录）不丢，
 * 关闭标签页（会话结束）即由浏览器清除，无需手动钩子。
 * 登录确认迁移由 lib/astrology/history.ts 的 migrateTempRecordToHistory 完成。
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DestinyHistoryItem } from '@/types/history';

interface AstrologyTempRecordState {
  /** 匿名会话内最近一次测算的临时记录（新测算直接替换，只留一份） */
  tempRecord: DestinyHistoryItem | null;
  setTempRecord: (item: DestinyHistoryItem) => void;
  clearTempRecord: () => void;
}

export const useAstrologyTempRecordStore = create<AstrologyTempRecordState>()(
  persist(
    (set) => ({
      tempRecord: null,
      setTempRecord: (tempRecord) => set({ tempRecord }),
      clearTempRecord: () => set({ tempRecord: null }),
    }),
    {
      // 会话级存储：标签页关闭即失效（§12「未确认的临时记录会话结束后删除」）
      name: 'astro-temp-record',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ tempRecord: state.tempRecord }),
    }
  )
);
