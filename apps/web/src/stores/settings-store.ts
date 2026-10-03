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

    /**
     * agent 模式开关（工具调用）。
     * 开启后对话请求带 agent 标志：服务端切到支持 function calling 的模型，
     * 走两段式编排（可调用图像生成 / 网页抓取等工具），计费按 chat-agent 单列。
     */
    agentModeEnabled: boolean;

    // Actions
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
    setLanguage: (language: 'zh-CN' | 'en-US') => void;
    setFontSize: (size: 'small' | 'medium' | 'large') => void;
    setAgentMode: (enabled: boolean) => void;

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

/**
 * 全局明暗切换时释放紫微结果页的手动偏好。
 * 动态 import 避免 settings ↔ ziwei-theme 循环依赖；失败静默（SSR / 未挂载时无副作用）。
 */
function clearZiweiThemePrefOnSystemChange() {
    if (typeof window === 'undefined') return;
    void import('@/stores/ziwei-theme-store')
        .then(({ useZiweiThemeStore }) => {
            useZiweiThemeStore.getState().clearPref();
        })
        .catch(() => {
            /* 忽略：开发热更瞬间或包未就绪 */
        });
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
            agentModeEnabled: false,

            // 设置主题
            setTheme: (theme) => {
                const prevResolved = get().resolvedTheme;
                const resolvedTheme = resolveTheme(theme);
                set({ theme, resolvedTheme });
                get()._applyTheme(resolvedTheme);
                // 全局明暗变化时释放紫微结果页手动锁定，重新跟随（暗→夜幕 / 亮→白昼）
                if (prevResolved !== resolvedTheme) {
                    clearZiweiThemePrefOnSystemChange();
                }
            },

            // 切换主题（light <-> dark，跳过 system）
            toggleTheme: () => {
                const { resolvedTheme } = get();
                const newTheme = resolvedTheme === 'light' ? 'dark' : 'light';
                set({ theme: newTheme, resolvedTheme: newTheme });
                get()._applyTheme(newTheme);
                clearZiweiThemePrefOnSystemChange();
            },

            // 设置语言
            setLanguage: (language) => {
                set({ language });
            },

            // 设置字体大小
            setFontSize: (fontSize) => {
                set({ fontSize });
            },

            // 设置 agent 模式开关
            setAgentMode: (enabled) => {
                set({ agentModeEnabled: enabled });
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
                        const prevResolved = get().resolvedTheme;
                        set({ resolvedTheme: newResolvedTheme });
                        _applyTheme(newResolvedTheme);
                        if (prevResolved !== newResolvedTheme) {
                            clearZiweiThemePrefOnSystemChange();
                        }
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
            name: 'ai-app-settings', // 本地存储键名
            storage: createJSONStorage(() => localStorage),
            // 只持久化用户设置，不持久化 resolvedTheme
            // 只持久化零代价的用户偏好。
            // agentModeEnabled 刻意不持久化：它一次同时改变模型（更贵）、计费口径与响应延迟，
            // 属于「有代价的模式」，默认必须回到安全态；且持久化会让第二次起的「开启」不再是
            // 用户显式动作（与「输入区显式开关」的约定冲突）。
            partialize: (state) => ({
                theme: state.theme,
                language: state.language,
                fontSize: state.fontSize,
            }),
            onRehydrateStorage: () => (state) => {
                // 旧版本可能把 agentModeEnabled: true 写进过 localStorage，
                // 而 zustand persist 的浅合并会把该值再带进来一次；显式归零保证每次进站都是「关」。
                state?.setAgentMode(false);
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
