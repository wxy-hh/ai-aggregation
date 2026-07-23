'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** 仅当用户手动收起时写入；缺省视为展开 */
const STORAGE_KEY = 'destiny:desktop-nav-state';
const LEGACY_STORAGE_KEY = 'destiny:desktop-nav-collapsed';

/** 导航面板宽度（px） */
export const DESTINY_NAV_WIDTH_PX = 280;
/** 导航距左侧留白（px），对应 Tailwind left-6 */
export const DESTINY_NAV_LEFT_PX = 24;
/** 主内容区左侧偏移 = 留白 + 面板宽 */
export const DESTINY_NAV_OFFSET_PX = DESTINY_NAV_WIDTH_PX + DESTINY_NAV_LEFT_PX;

function readNavCollapsedFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function writeNavCollapsedToStorage(collapsed: boolean) {
  try {
    if (collapsed) {
      localStorage.setItem(STORAGE_KEY, 'collapsed');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // 隐私模式等场景忽略
  }
}

type DestinyNavContextValue = {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  navOffsetPx: number;
};

const DestinyNavContext = createContext<DestinyNavContextValue | null>(null);

export function DestinyNavProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(readNavCollapsedFromStorage);

  // 清理旧版存储键（曾用 '1' 表示收起），新逻辑默认展开
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    writeNavCollapsedToStorage(value);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writeNavCollapsedToStorage(next);
      return next;
    });
  }, []);

  const navOffsetPx = collapsed ? DESTINY_NAV_LEFT_PX : DESTINY_NAV_OFFSET_PX;

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed,
      navOffsetPx,
    }),
    [collapsed, navOffsetPx, setCollapsed, toggleCollapsed]
  );

  return <DestinyNavContext.Provider value={value}>{children}</DestinyNavContext.Provider>;
}

export function useDestinyNav(): DestinyNavContextValue {
  const ctx = useContext(DestinyNavContext);
  if (!ctx) {
    return {
      collapsed: false,
      setCollapsed: () => {},
      toggleCollapsed: () => {},
      navOffsetPx: DESTINY_NAV_OFFSET_PX,
    };
  }
  return ctx;
}
