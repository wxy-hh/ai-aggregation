import { vi } from 'vitest';

/**
 * 空壳 QuotaSession：路由测试只断言 reserve/finalize 调用，决策表行为由 packages/db 的 quota-session.test.ts 兜底
 */
export function createFakeQuotaSession(overrides?: {
  outputLimit?: number;
  hasReservation?: boolean;
  inputUnits?: number;
  finalize?: ReturnType<typeof vi.fn>;
  release?: ReturnType<typeof vi.fn>;
}) {
  return {
    outputLimit: overrides?.outputLimit ?? 2048,
    hasReservation: overrides?.hasReservation ?? true,
    inputUnits: overrides?.inputUnits ?? 100,
    finalize: overrides?.finalize ?? vi.fn().mockResolvedValue(undefined),
    release: overrides?.release ?? vi.fn().mockResolvedValue(undefined),
  };
}
