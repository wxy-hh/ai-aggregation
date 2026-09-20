import { describe, expect, it } from 'vitest';
import { resolveAstrologyNightTheme } from './astrology-night-theme';

describe('resolveAstrologyNightTheme 星座寰宇结果页主题解析', () => {
  it('无偏好时亮色全局默认白昼', () => {
    expect(resolveAstrologyNightTheme(null, 'light')).toBe('day');
  });

  it('无偏好时暗色全局恒夜幕', () => {
    expect(resolveAstrologyNightTheme(null, 'dark')).toBe('night');
  });

  it('暗色全局下白昼偏好不可交付，仍为夜幕（html.dark 级联无法局部撤销）', () => {
    expect(resolveAstrologyNightTheme('day', 'dark')).toBe('night');
  });

  it('亮色全局下手动夜幕偏好生效（夜幕观星是亮全局的沉浸开关）', () => {
    expect(resolveAstrologyNightTheme('night', 'light')).toBe('night');
  });
});

describe('useAstrologyNightThemeStore 持久化范围', () => {
  it('partialize 仅持久化 pref 与 inviteSeen', async () => {
    const { useAstrologyNightThemeStore } = await import('@/stores/astrology-night-theme-store');
    // 触发一次写入后再检查持久化内容（zustand persist 首次 set 时才落盘）
    useAstrologyNightThemeStore.getState().setPref('night');
    const persisted = JSON.parse(localStorage.getItem('astrology-result-theme') ?? '{}');
    expect(Object.keys(persisted.state ?? {}).sort()).toEqual(['inviteSeen', 'pref']);
    expect(persisted.state.pref).toBe('night');
    useAstrologyNightThemeStore.getState().clearPref();
  });

  it('setPref / clearPref / markInviteSeen 行为正确', async () => {
    const { useAstrologyNightThemeStore } = await import('@/stores/astrology-night-theme-store');
    useAstrologyNightThemeStore.getState().setPref('night');
    expect(useAstrologyNightThemeStore.getState().pref).toBe('night');
    useAstrologyNightThemeStore.getState().markInviteSeen();
    expect(useAstrologyNightThemeStore.getState().inviteSeen).toBe(true);
    useAstrologyNightThemeStore.getState().clearPref();
    expect(useAstrologyNightThemeStore.getState().pref).toBeNull();
  });
});
