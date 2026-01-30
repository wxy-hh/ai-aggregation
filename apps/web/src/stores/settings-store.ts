'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ==================== 类型定义 ====================

export type Theme = 'light' | 'dark' | 'system';

export interface SettingsState {
    // 主题设置
    theme: Theme;
    resolvedTheme: 'light' | 'dark'; // 实际应用的主题（system 会被解析）

    // 未来可扩展的设置
    language: 'zh-CN' | 'en-US';
    fontSize: 'small' | 'medium' | 'large';

    // Actions
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
    setLanguage: (language: 'zh-CN' | 'en-US') => void;
    setFontSize: (size: 'small' | 'medium' | 'large') => void;

    // 内部方法
    _initializeTheme: () => void;
    _applyTheme: (resolvedTheme: 'light' | 'dark') => void;
}

// ==================== 工具函数 ====================

// 获取系统主题偏好
function getSystemTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// 解析主题（将 system 转换为实际值）
function resolveTheme(theme: Theme): 'light' | 'dark' {
    if (theme === 'system') {
        return getSystemTheme();
    }
    return theme;
}

// ==================== Store 实现 ====================

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set, get) => ({
            // 初始状态
            theme: 'system',
            resolvedTheme: 'light',
            language: 'zh-CN',
            fontSize: 'medium',

            // 设置主题
            setTheme: (theme) => {
                const resolvedTheme = resolveTheme(theme);
                set({ theme, resolvedTheme });
                get()._applyTheme(resolvedTheme);
            },

            // 切换主题（light <-> dark，跳过 system）
            toggleTheme: () => {
                const { resolvedTheme } = get();
                const newTheme = resolvedTheme === 'light' ? 'dark' : 'light';
                set({ theme: newTheme, resolvedTheme: newTheme });
                get()._applyTheme(newTheme);
            },

            // 设置语言
            setLanguage: (language) => {
                set({ language });
            },

            // 设置字体大小
            setFontSize: (fontSize) => {
                set({ fontSize });
            },

            // 初始化主题（在客户端加载时调用）
            _initializeTheme: () => {
                const { theme, _applyTheme } = get();
                const resolvedTheme = resolveTheme(theme);
                set({ resolvedTheme });
                _applyTheme(resolvedTheme);

                // 监听系统主题变化
                if (typeof window !== 'undefined' && theme === 'system') {
                    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
                    const handleChange = (e: MediaQueryListEvent) => {
                        const newResolvedTheme = e.matches ? 'dark' : 'light';
                        set({ resolvedTheme: newResolvedTheme });
                        _applyTheme(newResolvedTheme);
                    };
                    mediaQuery.addEventListener('change', handleChange);
                }
            },

            // 应用主题到 DOM
            _applyTheme: (resolvedTheme) => {
                if (typeof document === 'undefined') return;

                if (resolvedTheme === 'dark') {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            },
        }),
        {
            name: 'ai-app-settings', // localStorage key
            storage: createJSONStorage(() => localStorage),
            // 只持久化用户设置，不持久化 resolvedTheme
            partialize: (state) => ({
                theme: state.theme,
                language: state.language,
                fontSize: state.fontSize,
            }),
            onRehydrateStorage: () => (state) => {
                // 数据恢复完成后，初始化主题
                if (state) {
                    // 延迟到下一个 tick，确保 DOM 已准备好
                    setTimeout(() => {
                        state._initializeTheme();
                    }, 0);
                }
            },
        }
    )
);

// ==================== 便捷 Hooks ====================

// 获取当前主题
export const useTheme = () => {
    const theme = useSettingsStore(state => state.theme);
    const resolvedTheme = useSettingsStore(state => state.resolvedTheme);
    const toggleTheme = useSettingsStore(state => state.toggleTheme);
    const setTheme = useSettingsStore(state => state.setTheme);

    return { theme, resolvedTheme, toggleTheme, setTheme };
};

// 获取语言设置
export const useLanguage = () => useSettingsStore(state => state.language);

// 获取字体大小设置
export const useFontSize = () => useSettingsStore(state => state.fontSize);

// 获取所有设置 actions
export const useSettingsActions = () => useSettingsStore(state => ({
    setTheme: state.setTheme,
    toggleTheme: state.toggleTheme,
    setLanguage: state.setLanguage,
    setFontSize: state.setFontSize,
}));
