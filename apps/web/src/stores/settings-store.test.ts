import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settings-store';

describe('SettingsStore thinkingMode 深度思考模式 (ADR-0016 / 工单 03)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ thinkingModeEnabled: false });
  });

  it('初始状态 thinkingModeEnabled 默认关闭 (false)', () => {
    expect(useSettingsStore.getState().thinkingModeEnabled).toBe(false);
  });

  it('setThinkingMode 能够显式设置思考模式状态', () => {
    useSettingsStore.getState().setThinkingMode(true);
    expect(useSettingsStore.getState().thinkingModeEnabled).toBe(true);

    useSettingsStore.getState().setThinkingMode(false);
    expect(useSettingsStore.getState().thinkingModeEnabled).toBe(false);
  });

  it('toggleThinkingMode 能够翻转思考模式状态', () => {
    useSettingsStore.getState().toggleThinkingMode();
    expect(useSettingsStore.getState().thinkingModeEnabled).toBe(true);

    useSettingsStore.getState().toggleThinkingMode();
    expect(useSettingsStore.getState().thinkingModeEnabled).toBe(false);
  });
});
