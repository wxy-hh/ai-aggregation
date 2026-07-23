'use client';

/**
 * useRelayReceive — 目标模块接收接力的复用 Hook
 *
 * 职责：
 * - 等 relay-store Dexie 水合完成（不与水合竞态，避免误判「引用已失效」）。
 * - 按 ?relayId= 取接力包；包不存在时不写输入区、提示失效。
 * - 提供 ReferenceBar 所需 bundle/替换确认态与操作（移除/替换/填入）。
 * - 提供目标草稿（draftByTarget）读写，供刷新后恢复。
 * - 执行分两段（REQ-016 失败保留引用）：
 *   prepareExecution() 执行前只读派生元数据（不清状态）；
 *   commitExecution() 成功回调里再清活动引用与草稿。
 *   失败/取消时不调 commit，引用与草稿原样保留，允许原地重试。
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useRelayStore,
  useRelayInitialized,
  useRelayReplaceCandidate,
  useRelayActions,
} from '@/stores/relay-store';
import type { RelayBundle, RelayModule, DerivationMetadata } from '@repo/shared';

export interface RelayReceive {
  /** 水合是否完成 */
  initialized: boolean;
  /** 当前目标的活动接力包（无则 null） */
  bundle: RelayBundle | null;
  /** 接力包是否已失效（?relayId= 指向的包不存在） */
  isInvalid: boolean;
  /** 替换确认态（目标已有活动引用时新接力进入候选） */
  replaceCandidate: { incoming: RelayBundle } | null;
  /** 移除引用（只解来源，不清草稿） */
  remove: () => void;
  /** 确认/取消替换 */
  confirmReplace: () => void;
  cancelReplace: () => void;
  /** 目标草稿（刷新后恢复） */
  draft: string;
  setDraft: (text: string) => void;
  /** 执行前只读派生元数据（不清状态），供历史项写入；无活动引用返回 undefined */
  prepareExecution: () => DerivationMetadata | undefined;
  /** 执行成功回调：清活动引用与草稿（REQ-016 成功才完成接力） */
  commitExecution: () => void;
  /**
   * @deprecated 旧的两段合并接口（取派生即清引用），失败路径不保留引用。
   * 请改用 prepareExecution + commitExecution。保留仅为兼容期过渡。
   */
  consumeForExecution: () => DerivationMetadata | undefined;
}

export function useRelayReceive(targetModule: RelayModule): RelayReceive {
  const initialized = useRelayInitialized();
  const replaceCandidate = useRelayReplaceCandidate();
  const {
    getBundle,
    removeBundle,
    confirmReplace,
    cancelReplace,
    setDraftForTarget,
    clearDraftForTarget,
    clearActiveForTarget,
  } = useRelayActions();

  const [isInvalid, setIsInvalid] = useState(false);

  const activeId = useRelayStore((s) => s.activeByTarget[targetModule]);
  const bundle = useRelayStore((s) => (s.activeByTarget[targetModule] ? (s.bundles[s.activeByTarget[targetModule]!] ?? null) : null));
  const draft = useRelayStore((s) => s.draftByTarget[targetModule] ?? '');

  // ?relayId= 恢复：水合完成后校验包是否存在
  useEffect(() => {
    if (!initialized) return;
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const relayId = url.searchParams.get('relayId');
    if (!relayId) return;
    const found = getBundle(relayId);
    if (!found) {
      // 包不存在：不写输入区，提示失效（REQ-006 恢复失败三态）
      setIsInvalid(true);
    }
    // 仅定点删除 relayId 参数，保留同页其他查询串（?historyId=/?comparisonId=/?new=，M1）
    url.searchParams.delete('relayId');
    const nextSearch = url.searchParams.toString();
    window.history.replaceState({}, '', url.pathname + (nextSearch ? `?${nextSearch}` : ''));

  }, [initialized, targetModule]);

  // 目标页活动包变化时重置失效标记
  useEffect(() => {
    if (bundle) setIsInvalid(false);
  }, [bundle]);

  const currentReplaceCandidate = useMemo(() => {
    if (replaceCandidate && replaceCandidate.targetModule === targetModule) {
      return { incoming: replaceCandidate.incoming };
    }
    return null;
  }, [replaceCandidate, targetModule]);

  const remove = () => {
    if (activeId) removeBundle(activeId);
  };

  const setDraft = (text: string) => setDraftForTarget(targetModule, text);

  // 执行前只读派生元数据，不清状态（REQ-016 失败保留引用，允许原地重试）
  const prepareExecution = (): DerivationMetadata | undefined => {
    if (!bundle) return undefined;
    return {
      derivedFromRelayId: bundle.id,
      derivedFromReferenceIds: bundle.items.map((it) => it.id),
    };
  };

  // 执行成功回调：清活动引用与草稿（REQ-016 成功才完成接力）
  const commitExecution = () => {
    if (!bundle) return;
    clearActiveForTarget(targetModule);
    clearDraftForTarget(targetModule);
  };

  // 兼容旧接口：取派生即清引用（失败不保留，deprecated）
  const consumeForExecution = (): DerivationMetadata | undefined => {
    const meta = prepareExecution();
    commitExecution();
    return meta;
  };

  return {
    initialized,
    bundle,
    isInvalid,
    replaceCandidate: currentReplaceCandidate,
    remove,
    confirmReplace,
    cancelReplace,
    draft,
    setDraft,
    prepareExecution,
    commitExecution,
    consumeForExecution,
  };
}
