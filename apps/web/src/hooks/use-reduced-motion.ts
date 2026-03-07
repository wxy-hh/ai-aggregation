import { useEffect, useState } from 'react';

/**
 * 检测用户的动画偏好设置
 *
 * 当用户在系统设置中启用"减少动画"时，返回 true
 * 这有助于为有动画敏感性的用户提供更好的体验
 *
 * @returns {boolean} 是否应该减少动画效果
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // 检查浏览器是否支持 matchMedia
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // 设置初始值
    setPrefersReducedMotion(mediaQuery.matches);

    // 监听变化
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    // 添加监听器
    mediaQuery.addEventListener('change', handleChange);

    // 清理函数
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReducedMotion;
}
