'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type AppId } from '@/components/layout/apps-modal';

// ==================== 类型定义 ====================

export interface UIState {
  // 侧边栏固定应用
  pinnedApps: AppId[];

  // 应用模态框状态
  showAppsModal: boolean;

  // Actions
  addPinnedApp: (appId: AppId) => void;
  removePinnedApp: (appId: AppId) => void;
  isPinned: (appId: AppId) => boolean;

  setAppsModal: (open: boolean) => void;
  toggleAppsModal: () => void;
}

// ==================== Store 实现 ====================

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // 初始状态
      pinnedApps: ['chat', 'voice', 'image', 'video'],
      showAppsModal: false,

      // Actions
      addPinnedApp: (appId) => {
        const { pinnedApps } = get();
        if (!pinnedApps.includes(appId)) {
          set({ pinnedApps: [...pinnedApps, appId] });
        }
      },

      removePinnedApp: (appId) => {
        set({ pinnedApps: get().pinnedApps.filter((id) => id !== appId) });
      },

      isPinned: (appId) => {
        return get().pinnedApps.includes(appId);
      },

      setAppsModal: (open) => {
        set({ showAppsModal: open });
      },

      toggleAppsModal: () => {
        set({ showAppsModal: !get().showAppsModal });
      },
    }),
    {
      name: 'ai-app-ui-storage', // 本地存储键名
      storage: createJSONStorage(() => localStorage),
      // 只持久化 pinnedApps
      partialize: (state) => ({
        pinnedApps: state.pinnedApps,
      }),
    }
  )
);

// ==================== 便捷 Hooks ====================

import { useShallow } from 'zustand/react/shallow';

export const usePinnedApps = () => useUIStore((state) => state.pinnedApps);
export const useShowAppsModal = () => useUIStore((state) => state.showAppsModal);

export const useUIActions = () =>
  useUIStore(
    useShallow((state) => ({
      addPinnedApp: state.addPinnedApp,
      removePinnedApp: state.removePinnedApp,
      isPinned: state.isPinned,
      setAppsModal: state.setAppsModal,
      toggleAppsModal: state.toggleAppsModal,
    }))
  );
