/**
 * quota-exhausted-dialog.test.tsx —— 额度耗尽弹框文案变体测试（ADR-0012 / 工单 04）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { QuotaExhaustedDialog } from './quota-exhausted-dialog';
import { useSettingsStore } from '@/stores/settings-store';
import { dispatchQuotaExhausted } from '@/lib/api/quota-events';

describe('QuotaExhaustedDialog 额度弹框场景文案', () => {
  beforeEach(async () => {
    await act(async () => {
      useSettingsStore.setState({ agentModeEnabled: false });
    });
  });

  afterEach(() => {
    cleanup();
    useSettingsStore.setState({ agentModeEnabled: false });
  });

  it('普通对话场景（agentModeEnabled 为 false）：展示通用额度耗尽文案', async () => {
    render(<QuotaExhaustedDialog />);

    act(() => {
      dispatchQuotaExhausted();
    });

    expect(screen.getByText('文本或语音额度不足')).toBeInTheDocument();
    expect(
      screen.getByText(/当前文本或语音额度不足。您可以继续查看历史记录，图片和视频任务统计不受此额度影响。/)
    ).toBeInTheDocument();
  });

  it('Agent 场景（agentModeEnabled 为 true）：展示专用文案变体，绝不降级自动重发', async () => {
    useSettingsStore.setState({ agentModeEnabled: true });

    render(<QuotaExhaustedDialog />);

    act(() => {
      dispatchQuotaExhausted();
    });

    expect(
      screen.getByText('额度不足以开启联网查询，可充值后重试；或关闭 Agent 模式直接对话')
    ).toBeInTheDocument();
  });
});
