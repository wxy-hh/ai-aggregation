import { useEffect, useRef } from 'react';

/**
 * 焦点陷阱 Hook
 *
 * 功能:
 * - 将焦点限制在指定容器内
 * - 支持 Tab 和 Shift+Tab 循环导航
 * - 防止焦点离开弹层
 *
 * @param isActive - 是否激活焦点陷阱
 * @returns 容器引用
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(isActive: boolean) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;

    // 获取所有可聚焦元素
    const getFocusableElements = (): HTMLElement[] => {
      const selector = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');

      return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      );
    };

    // 处理 Tab 键导航
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab: 从第一个元素跳到最后一个
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
      // Tab: 从最后一个元素跳到第一个
      else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive]);

  return containerRef;
}
