'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/stores';

/**
 * 主题初始化组件
 * 用于确保主题在客户端正确应用，处理系统主题变化等
 * 替代旧的 ThemeProvider，但不需要包裹 children
 */
export function ThemeInitializer() {
  const _initializeTheme = useSettingsStore((state) => state._initializeTheme);

  useEffect(() => {
    // 组件挂载时初始化主题监听
    _initializeTheme();
  }, [_initializeTheme]);

  return null; // 不渲染任何内容
}
