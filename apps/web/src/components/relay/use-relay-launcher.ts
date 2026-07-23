'use client';

/**
 * useRelayLauncher — 来源模块发起接力的复用 Hook
 *
 * 封装：菜单开关状态、右键(contextmenu)/长按复用同一菜单、按能力过滤目标、
 * 创建接力包（含替换确认）并路由跳转（URL 只携带 relayId）。
 *
 * 用法：
 *   const relay = useRelayLauncher({ buildItem, sourceType });
 *   <RelayAction onClick={relay.openAtTrigger} disabled={relay.disabled} disabledReason={...} />
 *   <span {...relay.longPressProps} onContextMenu={relay.onContextMenu}>…内容…</span>
 *   <RelayMenu open={relay.menuOpen} onOpenChange={relay.setMenuOpen} targets={relay.targets}
 *              onSelect={relay.onSelect} anchorPoint={relay.anchorPoint} triggerRef={relay.triggerRef} />
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useRelayActions } from '@/stores/relay-store';
import { getAvailableTargets } from '@/lib/relay/target-registry';
import { useLongPress } from '@/components/relay/use-long-press';
import type { RelayTargetOption } from '@/lib/relay/types';
import type {
  RelayContentType,
  RelayModule,
  RelayReferenceItem,
} from '@repo/shared';

/** 目标模块 → 路由路径 */
const TARGET_ROUTE: Record<RelayModule, string> = {
  chat: '/chat',
  image: '/image',
  voice: '/voice',
  video: '/video',
  destiny: '/destiny',
};

/** 打开菜单时捕获的合法选区片段（REQ-009 选区优先） */
export interface RelaySelection {
  /** 完全位于 selectionRootRef 容器内、trim 后非空的选中文本 */
  selectedText?: string;
}

export interface UseRelayLauncherOptions {
  /** 来源内容类型 */
  sourceType: RelayContentType;
  /**
   * 构造来源引用项（不含 id/createdAt，由 Hook 补全）。
   * 返回 null 表示当前不可接力（如内容为空）。
   * selection.selectedText 存在时应优先作为 snapshotText；
   * 缺省时回退到完整快照（REQ-009 第 4 条）。
   */
  buildItem: (
    selection: RelaySelection,
  ) => Omit<RelayReferenceItem, 'id' | 'createdAt'> | null;
  /** 禁用原因（生成中/空等）；非空则动作禁用 */
  disabledReason?: string;
  /**
   * 可选：用于判定「合法选区」的容器 ref。
   * 传入时，打开菜单的瞬间从 window.getSelection() 取片段，
   * 仅当 anchor/focus 都落在该容器内才视为合法；
   * 缺省或选区越界时 selectedText 为 undefined，走完整快照。
   */
  selectionRootRef?: RefObject<HTMLElement | null>;
}

/**
 * 读取 selectionRootRef 容器内的合法选区文本。
 * 仅在浏览器环境、容器存在、选区非折叠、anchor 与 focus 都在容器内时返回文本；
 * 其余情况返回 undefined，由 buildItem 回退到完整快照。
 */
function readSelectionWithin(root: HTMLElement | null): string | undefined {
  if (!root || typeof window === 'undefined') return undefined;
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const { anchorNode, focusNode } = selection;
  if (!anchorNode || !focusNode) return undefined;
  if (!root.contains(anchorNode) || !root.contains(focusNode)) return undefined;
  const text = selection.toString().trim();
  return text.length > 0 ? text : undefined;
}

export function useRelayLauncher({
  sourceType,
  buildItem,
  disabledReason,
  selectionRootRef,
}: UseRelayLauncherOptions) {
  const router = useRouter();
  const { createBundle } = useRelayActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorPoint, setAnchorPoint] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // 打开菜单瞬间捕获的合法选区片段；onSelect 时连同 buildItem 一起消费
  const selectionRef = useRef<RelaySelection>({});

  const disabled = Boolean(disabledReason);
  const targets = useMemo(() => getAvailableTargets(sourceType), [sourceType]);

  // 在打开菜单前捕获容器内选区（如果有 selectionRootRef）
  const captureSelection = useCallback(() => {
    selectionRef.current = {
      selectedText: readSelectionWithin(selectionRootRef?.current ?? null),
    };
  }, [selectionRootRef]);

  const openAtTrigger = useCallback(
    (e?: React.MouseEvent) => {
      if (disabled) return;
      e?.preventDefault();
      captureSelection();
      setAnchorPoint(null);
      setMenuOpen(true);
    },
    [disabled, captureSelection],
  );

  // 桌面右键：复用同一菜单，定位到光标
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      captureSelection();
      setAnchorPoint({ x: e.clientX, y: e.clientY });
      setMenuOpen(true);
    },
    [disabled, captureSelection],
  );

  // 移动端长按：复用同一菜单
  const longPressProps = useLongPress(() => {
    if (disabled) return;
    captureSelection();
    setMenuOpen(true);
  });

  const onSelect = useCallback(
    (target: RelayTargetOption) => {
      const partial = buildItem(selectionRef.current);
      selectionRef.current = {};
      if (!partial) return;
      const item: RelayReferenceItem = {
        ...partial,
        id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date().toISOString(),
      };
      // 目标侧字段承接由各目标页直接读 bundle 快照（snapshotText/snapshotMediaUrl），
      // 发起侧不做适配（适配器 adaptForTarget 为纯函数备用，不在此调用）
      const { bundleId } = createBundle(item, target.targetModule, target.targetRole);

      // URL 只携带 relayId（快照在 Dexie）；替换确认由目标页 ReferenceBar 处理
      router.push(`${TARGET_ROUTE[target.targetModule]}?relayId=${bundleId}`);
    },
    [buildItem, createBundle, router],
  );

  return {
    menuOpen,
    setMenuOpen,
    anchorPoint,
    triggerRef,
    targets,
    disabled,
    disabledReason,
    openAtTrigger,
    onContextMenu,
    longPressProps,
    onSelect,
  };
}
