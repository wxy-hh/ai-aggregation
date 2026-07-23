'use client';

/**
 * 移动端长按 Hook — 与显式「接力」按钮打开同一菜单（REQ-002）
 *
 * 长按（默认 500ms）触发 onLongPress；点击/滑动取消。
 * 桌面右键经 contextmenu 事件复用同一菜单，不经此 Hook。
 */

import { useRef, useCallback } from 'react';

export interface LongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
}

export function useLongPress(onLongPress: () => void, delay = 500): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(() => {
    firedRef.current = false;
    clear();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay, clear]);

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  const onTouchMove = useCallback(() => {
    // 滑动视为取消长按
    clear();
  }, [clear]);

  return { onTouchStart, onTouchEnd, onTouchMove };
}
