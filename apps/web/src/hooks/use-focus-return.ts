import { useEffect, useRef } from 'react';

/**
 * 焦点返回 Hook
 *
 * 功能:
 * - 保存触发元素的引用
 * - 弹层关闭后自动返回焦点到触发元素
 *
 * @param isOpen - 弹层是否打开
 */
export function useFocusReturn(isOpen: boolean) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // 弹层打开时，保存当前焦点元素
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
    }
    // 弹层关闭时，恢复焦点
    else if (previousActiveElementRef.current) {
      // 使用 setTimeout 确保 DOM 更新完成后再恢复焦点
      setTimeout(() => {
        previousActiveElementRef.current?.focus();
        previousActiveElementRef.current = null;
      }, 0);
    }
  }, [isOpen]);
}
