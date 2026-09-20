/**
 * astrology-night-toggle.test.tsx —— 「夜幕观星」主题切换按钮
 *
 * 锁定的外部行为：
 * - 全局亮色且无手动偏好：按钮提示「切换夜幕观星」，并展示一次性邀请气泡；
 * - 点击按钮：写入手动偏好 night、邀请气泡消失、邀请标记为已见；
 * - 全局暗色：页面恒夜幕（html.dark 级联无法局部撤销，白昼视图不可交付），
 *   切换钮无可切之物，整体不渲染；
 * - 邀请已看过（inviteSeen）的白昼态：不再重复展示气泡。
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AstrologyNightToggle } from './astrology-night-toggle';
import { useAstrologyNightThemeStore } from '@/stores/astrology-night-theme-store';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * 设置全局明暗。
 * theme 一并写入：settings-store 的持久化与延迟初始化会按 theme 重新解析 resolvedTheme，
 * 只改 resolvedTheme 会被它覆盖回跟随系统（测试环境为亮）。
 */
function setGlobalTheme(theme: 'light' | 'dark') {
  useSettingsStore.setState({ theme, resolvedTheme: theme });
}

/** 重置两处 store 与本地存储，避免用例间串扰 */
function resetStores() {
  localStorage.clear();
  useAstrologyNightThemeStore.setState({ pref: null, inviteSeen: false });
}

beforeEach(resetStores);

afterEach(() => {
  // 先卸载，避免重置 store 触发仍挂载组件的状态更新（邀请气泡副作用）
  cleanup();
  resetStores();
});

describe('AstrologyNightToggle 夜幕观星切换', () => {
  it('全局亮色且无手动偏好：提示「切换夜幕观星」并展示首次邀请气泡', () => {
    setGlobalTheme('light');
    render(<AstrologyNightToggle />);

    expect(screen.getByRole('button', { name: '切换夜幕观星' })).toBeInTheDocument();
    expect(screen.getByText(/试试夜幕观星/)).toBeInTheDocument();
  });

  it('点击按钮：写入夜幕偏好、气泡消失、邀请记为已见', () => {
    setGlobalTheme('light');
    render(<AstrologyNightToggle />);

    fireEvent.click(screen.getByRole('button', { name: '切换夜幕观星' }));

    expect(useAstrologyNightThemeStore.getState().pref).toBe('night');
    expect(useAstrologyNightThemeStore.getState().inviteSeen).toBe(true);
    expect(screen.queryByText(/试试夜幕观星/)).toBeNull();
    expect(screen.getByRole('button', { name: '切换到白昼视图' })).toBeInTheDocument();
  });

  it('全局暗色：页面恒夜幕（白昼不可交付），切换钮整体不渲染', () => {
    setGlobalTheme('dark');
    const { container } = render(<AstrologyNightToggle />);

    // 暗全局下 html.dark 级联无法局部撤销，白昼视图是空头支票——按钮无可切之物，不渲染
    expect(container).toBeEmptyDOMElement();
    expect(useAstrologyNightThemeStore.getState().inviteSeen).toBe(false);
  });

  it('邀请已看过的白昼态：不再重复展示气泡', () => {
    setGlobalTheme('light');
    useAstrologyNightThemeStore.setState({ inviteSeen: true });
    render(<AstrologyNightToggle />);

    expect(screen.getByRole('button', { name: '切换夜幕观星' })).toBeInTheDocument();
    expect(screen.queryByText(/试试夜幕观星/)).toBeNull();
  });
});
