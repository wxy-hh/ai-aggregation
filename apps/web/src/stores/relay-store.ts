'use client';

/**
 * 跨模态单引用接力 — 接力持久化 Store
 *
 * 设计：docs/plans/2026-07-14-cross-modal-reference-relay-design.md §14
 * - 快照正文/媒体地址持久化在 IndexedDB（Dexie），URL 只携带 relayId。
 * - 首版单引用上限 MAX_RELAY_ITEMS=1，但 bundles.items 是集合（协议不假设单元素）。
 * - hydration 门闩：Dexie 异步水合完成前 isInitialized=false，目标页恢复必须等待，
 *   避免把有效引用误判「已失效」（对齐 history-store 的 onRehydrateStorage 模式）。
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '@/lib/storage/zustand-dexie-storage';
import {
  MAX_RELAY_ITEMS,
  type RelayBundle,
  type RelayModule,
  type RelayReferenceItem,
  type RelayTargetRole,
} from '@repo/shared';

// ==================== 类型 ====================

/** 替换候选态：目标已有活动引用时，新接力先进入候选，待用户确认后替换 */
export interface RelayReplaceCandidate {
  /** 待替换的新包 */
  incoming: RelayBundle;
  /** 当前被占用的目标模块 */
  targetModule: RelayModule;
}

interface RelayState {
  /** 所有接力包，按 id 索引 */
  bundles: Record<string, RelayBundle>;
  /** 每个目标模块当前活动的 relayId（单引用上限下每目标至多一个） */
  activeByTarget: Record<RelayModule, string | null>;
  /** 各目标模块用户已编辑的草稿（编辑时同步、刷新后恢复，REQ-004） */
  draftByTarget: Record<RelayModule, string>;
  /** 待确认的替换候选（非 null 时 ReferenceBar 显示替换确认） */
  replaceCandidate: RelayReplaceCandidate | null;
  /** Dexie 水合完成标记 */
  isInitialized: boolean;

  // 操作（Actions）
  /** 创建接力包并设为对应目标的活动引用；目标已有活动引用时返回替换候选 */
  createBundle: (
    item: RelayReferenceItem,
    targetModule: RelayModule,
    targetRole: RelayTargetRole,
  ) => { bundleId: string; needsReplaceConfirm: boolean };
  /** 确认替换：把候选包设为活动引用 */
  confirmReplace: () => void;
  /** 取消替换：丢弃候选，保留原引用与草稿 */
  cancelReplace: () => void;
  getBundle: (id: string) => RelayBundle | undefined;
  /** 移除接力包（只解来源，不清草稿） */
  removeBundle: (id: string) => void;
  setActiveForTarget: (target: RelayModule, relayId: string | null) => void;
  clearActiveForTarget: (target: RelayModule) => void;
  /** 同步目标模块草稿 */
  setDraftForTarget: (target: RelayModule, draft: string) => void;
  /** 清除目标模块草稿（执行成功后） */
  clearDraftForTarget: (target: RelayModule) => void;
  /** 标记来源已删除（快照仍可用，隐藏「查看来源」） */
  markSourceInvalid: (id: string) => void;
  /** 标记媒体快照失效（写入失败/过大，仅保留元信息） */
  markMediaInvalid: (id: string) => void;
}

// 模块级 set 引用，供 onRehydrateStorage 回调在水合完成后置初始化标记
let _storeSet: ((partial: Partial<RelayState>) => void) | null = null;

const EMPTY_ACTIVE: Record<RelayModule, string | null> = {
  chat: null,
  image: null,
  voice: null,
  video: null,
  destiny: null,
};

const EMPTY_DRAFT: Record<RelayModule, string> = {
  chat: '',
  image: '',
  voice: '',
  video: '',
  destiny: '',
};

function generateRelayId(): string {
  return `relay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ==================== Store ====================

export const useRelayStore = create<RelayState>()(
  persist(
    (set, get) => {
      _storeSet = set;
      return {
        bundles: {},
        activeByTarget: { ...EMPTY_ACTIVE },
        draftByTarget: { ...EMPTY_DRAFT },
        replaceCandidate: null,
        isInitialized: false,

        createBundle: (item, targetModule, targetRole) => {
          // 单引用上限断言：协议 items 是集合，首版界面限制 1 条
          const items = [item].slice(0, MAX_RELAY_ITEMS);
          const bundle: RelayBundle = {
            id: generateRelayId(),
            items,
            targetModule,
            targetRole,
            createdAt: new Date().toISOString(),
          };

          const existingActiveId = get().activeByTarget[targetModule];
          if (existingActiveId && existingActiveId !== bundle.id) {
            // 目标已有活动引用：落库为候选包但不切换活动引用，由目标页弹替换确认（REQ-005）
            set((state) => ({
              bundles: { ...state.bundles, [bundle.id]: bundle },
              replaceCandidate: { incoming: bundle, targetModule },
            }));
            return { bundleId: bundle.id, needsReplaceConfirm: true };
          }

          set((state) => ({
            bundles: { ...state.bundles, [bundle.id]: bundle },
            activeByTarget: { ...state.activeByTarget, [targetModule]: bundle.id },
            replaceCandidate: null,
          }));
          return { bundleId: bundle.id, needsReplaceConfirm: false };
        },

        confirmReplace: () => {
          const candidate = get().replaceCandidate;
          if (!candidate) return;
          const { incoming, targetModule } = candidate;
          set((state) => {
            const bundles = { ...state.bundles, [incoming.id]: incoming };
            // 移除被替换的旧包，避免孤儿数据
            const oldId = state.activeByTarget[targetModule];
            if (oldId && oldId !== incoming.id) {
              delete bundles[oldId];
            }
            return {
              bundles,
              activeByTarget: { ...state.activeByTarget, [targetModule]: incoming.id },
              replaceCandidate: null,
            };
          });
        },

        cancelReplace: () => {
          // 丢弃候选，原引用与草稿均不变（REQ-005 取消后状态不变）
          set({ replaceCandidate: null });
        },

        getBundle: (id) => get().bundles[id],

        removeBundle: (id) => {
          set((state) => {
            const bundles = { ...state.bundles };
            const bundle = bundles[id];
            delete bundles[id];
            const activeByTarget = { ...state.activeByTarget };
            if (bundle && activeByTarget[bundle.targetModule] === id) {
              activeByTarget[bundle.targetModule] = null;
            }
            // 只解来源，不清草稿（REQ-005 移除只解除关联）
            return { bundles, activeByTarget };
          });
        },

        setActiveForTarget: (target, relayId) => {
          set((state) => ({
            activeByTarget: { ...state.activeByTarget, [target]: relayId },
          }));
        },

        clearActiveForTarget: (target) => {
          set((state) => ({
            activeByTarget: { ...state.activeByTarget, [target]: null },
          }));
        },

        setDraftForTarget: (target, draft) => {
          set((state) => ({
            draftByTarget: { ...state.draftByTarget, [target]: draft },
          }));
        },

        clearDraftForTarget: (target) => {
          set((state) => ({
            draftByTarget: { ...state.draftByTarget, [target]: '' },
          }));
        },

        markSourceInvalid: (id) => {
          // 来源删除后快照继续可用：仅清 sourceId，保留快照与元信息（REQ-006）
          set((state) => {
            const bundle = state.bundles[id];
            if (!bundle) return state;
            const items = bundle.items.map((it) => ({ ...it, sourceId: '' }));
            return { bundles: { ...state.bundles, [id]: { ...bundle, items } } };
          });
        },

        markMediaInvalid: (id) => {
          // 媒体快照失效：保留标题/模型/尺寸等元信息，置 mediaInvalid（REQ-008/§4.3.3）
          set((state) => {
            const bundle = state.bundles[id];
            if (!bundle) return state;
            const items = bundle.items.map((it) => ({
              ...it,
              snapshotMediaUrl: undefined,
              mediaInvalid: true,
            }));
            return { bundles: { ...state.bundles, [id]: { ...bundle, items } } };
          });
        },
      };
    },
    {
      name: 'ai-relay-store',
      storage: createJSONStorage(() => createDexieStorage('ai-relay-db')),
      partialize: (state) => ({
        bundles: state.bundles,
        activeByTarget: state.activeByTarget,
        draftByTarget: state.draftByTarget,
      }),
      // Dexie 数据水合完成后标记为已初始化，确保 ?relayId= 恢复不与水合竞态
      onRehydrateStorage: () => () => {
        _storeSet?.({ isInitialized: true });
      },
    },
  ),
);

// ==================== Hooks ====================

/**
 * 按来源 ID 批量标记接力引用「来源已删除」（REQ-006：快照仍可用，仅清 sourceId）。
 * 供 history-store 删除/清空历史时同步，避免在调用方做类型断言与遍历（L2）。
 */
export const markSourcesInvalidBySourceIds = (sourceIds: string[]): void => {
  if (sourceIds.length === 0) return;
  const idSet = new Set(sourceIds);
  const state = useRelayStore.getState();
  Object.values(state.bundles).forEach((bundle) => {
    if (bundle.items.some((it) => it.sourceId && idSet.has(it.sourceId))) {
      state.markSourceInvalid(bundle.id);
    }
  });
};

export const useRelayBundles = () => useRelayStore((state) => state.bundles);
export const useRelayInitialized = () => useRelayStore((state) => state.isInitialized);
export const useRelayReplaceCandidate = () => useRelayStore((state) => state.replaceCandidate);

/** 取某目标模块当前活动的接力包（含快照），未初始化/无活动返回 null */
export const useActiveBundleForTarget = (target: RelayModule): RelayBundle | null =>
  useRelayStore((state) => {
    const id = state.activeByTarget[target];
    return id ? (state.bundles[id] ?? null) : null;
  });

/** 取某目标模块已编辑草稿 */
export const useDraftForTarget = (target: RelayModule): string =>
  useRelayStore((state) => state.draftByTarget[target] ?? '');

export const useRelayActions = () =>
  useRelayStore(
    useShallow((state) => ({
      createBundle: state.createBundle,
      confirmReplace: state.confirmReplace,
      cancelReplace: state.cancelReplace,
      getBundle: state.getBundle,
      removeBundle: state.removeBundle,
      setActiveForTarget: state.setActiveForTarget,
      clearActiveForTarget: state.clearActiveForTarget,
      setDraftForTarget: state.setDraftForTarget,
      clearDraftForTarget: state.clearDraftForTarget,
      markSourceInvalid: state.markSourceInvalid,
      markMediaInvalid: state.markMediaInvalid,
    })),
  );
