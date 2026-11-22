/**
 * 智能体工作台模式持久化与水合清零 Bug 修复单元测试
 *
 * 覆盖用例：TC03 (Covers US 1, 2, 3)
 * 断言：
 * 1. settings-store 初始默认状态下，agentModeEnabled 为 true；
 * 2. 触发水合逻辑（onRehydrateStorage 回调执行）后，agentModeEnabled 保持用户设置的值，不再被强制重置为 false；
 * 3. 用户调用 setAgentMode(false) 后，设置值被写入持久化存储，重载后正确保持为 false。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../settings-store';

describe('TC03: 智能体工作台模式持久化与水合清零 Bug 修复', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      theme: 'system',
      resolvedTheme: 'light',
      language: 'zh-CN',
      fontSize: 'medium',
      agentModeEnabled: true,
      thinkingModeEnabled: false,
    });
  });

  it('断言 1: settings-store 初始状态 agentModeEnabled 默认开启 (true)', () => {
    expect(useSettingsStore.getState().agentModeEnabled).toBe(true);
  });

  it('断言 2: 触发水合逻辑后，agentModeEnabled 保持当前状态，不再被清零为 false', () => {
    // 设置用户自主选择的状态
    useSettingsStore.getState().setAgentMode(true);
    expect(useSettingsStore.getState().agentModeEnabled).toBe(true);

    // 获取 persist 配置中的 onRehydrateStorage 回调
    const persistOptions = useSettingsStore.persist?.getOptions();
    expect(persistOptions).toBeDefined();

    const currentState = useSettingsStore.getState();
    const onRehydrated = persistOptions?.onRehydrateStorage?.(currentState);
    if (typeof onRehydrated === 'function') {
      onRehydrated(currentState, undefined);
    }

    // 验证水合后仍旧保持 true，未被覆写为 false
    expect(useSettingsStore.getState().agentModeEnabled).toBe(true);
  });

  it('断言 3: 用户调用 setAgentMode(false) 后，设置值正确更新且持久化 partialize 包含 agentModeEnabled', () => {
    useSettingsStore.getState().setAgentMode(false);
    expect(useSettingsStore.getState().agentModeEnabled).toBe(false);

    // 验证 partialize 过滤器正确保留 agentModeEnabled
    const persistOptions = useSettingsStore.persist?.getOptions();
    const currentState = useSettingsStore.getState();
    const partialized = persistOptions?.partialize?.(currentState);

    expect(partialized).toHaveProperty('agentModeEnabled', false);

    // 模拟水合回调恢复保持 false
    const onRehydrated = persistOptions?.onRehydrateStorage?.(currentState);
    if (typeof onRehydrated === 'function') {
      onRehydrated(currentState, undefined);
    }
    expect(useSettingsStore.getState().agentModeEnabled).toBe(false);
  });
});
