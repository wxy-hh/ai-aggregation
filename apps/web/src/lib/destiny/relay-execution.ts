import { useRelayStore } from '@/stores/relay-store';
import type { DerivationMetadata } from '@repo/shared';

/**
 * 命理跨模态接力执行前派生助手（只读快照派生）
 *
 * 对应 REQ-016 两阶段接力的 prepare 阶段：
 * 从 useRelayStore 快照中读取当前 destiny 目标的活动接力包，
 * 派生用于历史记录落盘的 DerivationMetadata。
 *
 * 行为保证：
 * - 纯 store 快照派生，不依赖 React Hook；
 * - 无活动接力包或 bundle 不存在时返回 undefined；
 * - 存在活动接力包时返回包含 derivedFromRelayId 与 derivedFromReferenceIds 的元数据，
 *   其中 referenceIds 的元素 id 与数组顺序与 bundle.items 完全一致；
 * - 只读操作，绝不改写 store 状态，即使执行失败仍保留引用以支持原地重试。
 */
export function prepareDestinyRelay(): DerivationMetadata | undefined {
  const state = useRelayStore.getState();
  const activeId = state.activeByTarget.destiny;
  if (!activeId) {
    return undefined;
  }

  const bundle = state.bundles[activeId];
  if (!bundle) {
    return undefined;
  }

  return {
    derivedFromRelayId: bundle.id,
    derivedFromReferenceIds: bundle.items.map((it) => it.id),
  };
}

/**
 * 命理跨模态接力执行成功提交助手（清理目标引用与草稿）
 *
 * 对应 REQ-016 两阶段接力的 commit 阶段：
 * 当命理推演（或八字中 AI 顾问后续发送）成功后调用，
 * 清除 destiny 目标上的活动引用与用户草稿。
 *
 * 行为保证：
 * - 幂等调用 store 的 clearActiveForTarget('destiny') 与 clearDraftForTarget('destiny')；
 * - 仅在业务真正成功闭环时调用。
 */
export function commitDestinyRelay(): void {
  const { clearActiveForTarget, clearDraftForTarget } = useRelayStore.getState();
  clearActiveForTarget('destiny');
  clearDraftForTarget('destiny');
}
