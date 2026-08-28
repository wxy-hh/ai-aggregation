import { describe, it, expect, vi } from 'vitest';
import { finalizeChatStream, type BillingManager } from './billing-manager';
import { estimateOutputTokens } from '@/lib/billing/usage-measurement';

/** 构造可断言的 BillingManager 桩（默认有预留、inputUnits=100） */
function mockBilling(overrides: Partial<BillingManager> = {}): BillingManager {
  return {
    finalized: false,
    hasReservation: true,
    inputUnits: 100,
    outputLimit: 1024,
    settle: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as BillingManager;
}

describe('finalizeChatStream（评审 C2：统一结算决策）', () => {
  const usage = { totalTokens: 42, inputTokens: 10, outputTokens: 32 };

  it('success + 有预留：settle(usage, input+输出估算, success)，不 release', async () => {
    const billing = mockBilling();
    await finalizeChatStream(billing, {
      outcome: 'success',
      usage,
      outputText: '你好，世界',
    });

    expect(billing.settle).toHaveBeenCalledTimes(1);
    expect(billing.settle).toHaveBeenCalledWith(
      usage,
      100 + estimateOutputTokens('你好，世界'),
      'success'
    );
    expect(billing.release).not.toHaveBeenCalled();
    expect(billing.recordUsage).not.toHaveBeenCalled();
  });

  it('partial + 有预留：settle(..., partial)——部分内容按部分结算', async () => {
    const billing = mockBilling();
    await finalizeChatStream(billing, {
      outcome: 'partial',
      usage,
      outputText: '部分内容',
      reason: '上游流截断',
    });

    expect(billing.settle).toHaveBeenCalledWith(
      usage,
      100 + estimateOutputTokens('部分内容'),
      'partial'
    );
    expect(billing.release).not.toHaveBeenCalled();
  });

  it('failed + 有预留：释放预留（取消应退款），绝不 settle', async () => {
    const billing = mockBilling();
    await finalizeChatStream(billing, {
      outcome: 'failed',
      usage: null,
      outputText: '',
      reason: '模型未返回任何内容',
    });

    expect(billing.release).toHaveBeenCalledWith('模型未返回任何内容');
    expect(billing.settle).not.toHaveBeenCalled();
    expect(billing.recordUsage).not.toHaveBeenCalled();
  });

  it('admin（无预留）success：recordUsage(usage, success)', async () => {
    const billing = mockBilling({ hasReservation: false });
    await finalizeChatStream(billing, { outcome: 'success', usage, outputText: '你好' });

    expect(billing.recordUsage).toHaveBeenCalledWith(usage, 'success');
    expect(billing.settle).not.toHaveBeenCalled();
    expect(billing.release).not.toHaveBeenCalled();
  });

  it('admin partial：recordUsage(usage, partial)', async () => {
    const billing = mockBilling({ hasReservation: false });
    await finalizeChatStream(billing, {
      outcome: 'partial',
      usage,
      outputText: '部分',
      reason: '截断',
    });

    expect(billing.recordUsage).toHaveBeenCalledWith(usage, 'partial');
    expect(billing.settle).not.toHaveBeenCalled();
  });

  it('admin failed：仍走 release 路径（真实 BillingManager 实现内部对无预留自动跳过）', async () => {
    const billing = mockBilling({ hasReservation: false });
    await finalizeChatStream(billing, {
      outcome: 'failed',
      usage: null,
      outputText: '',
      reason: '用户取消',
    });

    expect(billing.release).toHaveBeenCalledWith('用户取消');
    expect(billing.recordUsage).not.toHaveBeenCalled();
  });

  it('usage 无效（null）：fallback 兜底为 input+输出估算（统一口径）', async () => {
    const billing = mockBilling();
    await finalizeChatStream(billing, {
      outcome: 'success',
      usage: null,
      outputText: '无真实用量',
    });

    expect(billing.settle).toHaveBeenCalledWith(
      null,
      100 + estimateOutputTokens('无真实用量'),
      'success'
    );
  });
});
