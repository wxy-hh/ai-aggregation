/** 组合根决策：三个 CLI 入口共用的适配器选择逻辑（纯函数，可被门禁单测） */
export type AdapterKind = 'replay' | 'real' | 'none';

export interface AdapterResolutionInput {
  isDryRun: boolean;
  confirmRealRun: boolean;
}

/**
 * - dry-run → 回放（固定轨迹，不调模型）
 * - 未显式确认 → none（真实档 fail-closed）
 * - 显式确认 → real（真实执行适配器，由 CLI 动态注入）
 */
export function resolveAdapterKind(input: AdapterResolutionInput): AdapterKind {
  if (input.isDryRun) return 'replay';
  if (!input.confirmRealRun) return 'none';
  return 'real';
}
