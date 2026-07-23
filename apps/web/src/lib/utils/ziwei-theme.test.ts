import { describe, expect, it } from 'vitest';
import { resolveZiweiTheme } from './ziwei-theme';

describe('resolveZiweiTheme 紫微结果页主题解析', () => {
    it('无偏好时亮色系统默认白昼', () => {
        expect(resolveZiweiTheme(null, 'light')).toBe('day');
    });

    it('无偏好时暗色系统默认夜幕', () => {
        expect(resolveZiweiTheme(null, 'dark')).toBe('night');
    });

    it('手动偏好优先于跟随系统（暗系统切白昼）', () => {
        expect(resolveZiweiTheme('day', 'dark')).toBe('day');
    });

    it('手动偏好优先于跟随系统（亮系统切夜幕）', () => {
        expect(resolveZiweiTheme('night', 'light')).toBe('night');
    });

    it('clearPref 后恢复跟随：暗色系统 → 夜幕', () => {
        // 模拟用户曾手动锁白昼，再 clearPref 后应跟随全局暗色
        expect(resolveZiweiTheme(null, 'dark')).toBe('night');
    });
});

describe('useZiweiThemeStore 持久化范围', () => {
    it('partialize 仅持久化 pref 与 inviteSeen', async () => {
        const { useZiweiThemeStore } = await import('@/stores/ziwei-theme-store');
        // 触发一次写入后再检查持久化内容（zustand persist 首次 set 时才落盘）
        useZiweiThemeStore.getState().setPref('night');
        const persisted = JSON.parse(localStorage.getItem('ziwei-result-theme') ?? '{}');
        expect(Object.keys(persisted.state ?? {}).sort()).toEqual(['inviteSeen', 'pref']);
        expect(persisted.state.pref).toBe('night');
        useZiweiThemeStore.getState().clearPref();
    });

    it('setPref / clearPref / markInviteSeen 行为正确', async () => {
        const { useZiweiThemeStore } = await import('@/stores/ziwei-theme-store');
        useZiweiThemeStore.getState().setPref('night');
        expect(useZiweiThemeStore.getState().pref).toBe('night');
        useZiweiThemeStore.getState().markInviteSeen();
        expect(useZiweiThemeStore.getState().inviteSeen).toBe(true);
        useZiweiThemeStore.getState().clearPref();
        expect(useZiweiThemeStore.getState().pref).toBeNull();
    });
});
