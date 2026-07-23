'use client';

/**
 * RelayMenu — 接力菜单（REQ-002/003/014/015）
 *
 * 标题固定「用此继续」，只列 getAvailableTargets 结果（不支持的目标不显示）。
 * - 桌面：Popover 对齐触发器；右键 contextmenu 复用同一菜单定位到光标。
 * - 移动：Dialog + inset-x-0 bottom-0 底部抽屉（≤85vh、滚动锁定、50px 项、安全区）。
 * - 键盘：Esc 关闭、方向键移动、回车选中、焦点返回触发器。
 */

import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { RELAY_COPY } from '@/lib/relay/copy';
import type { RelayTargetOption } from '@/lib/relay/types';

/** 判断当前是否移动视口（与 Tailwind sm 断点对齐） */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export interface RelayMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 可用目标列表（已按能力过滤） */
  targets: RelayTargetOption[];
  onSelect: (target: RelayTargetOption) => void;
  /** 桌面右键模式：虚拟锚点坐标（光标位置） */
  anchorPoint?: { x: number; y: number } | null;
  /** 触发器 ref（桌面 Popover 对齐 + 关闭后焦点返回） */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function RelayMenu({
  open,
  onOpenChange,
  targets,
  onSelect,
  anchorPoint,
  triggerRef,
}: RelayMenuProps) {
  const isMobile = useIsMobile();
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // 打开时聚焦第一项，便于键盘操作
  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      const t = setTimeout(() => itemRefs.current[0]?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 关闭后焦点返回触发器
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setTimeout(() => triggerRef?.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndex + 1) % targets.length;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndex - 1 + targets.length) % targets.length;
      setActiveIndex(prev);
      itemRefs.current[prev]?.focus();
    }
  };

  const renderItems = () => (
    <ul role="menu" aria-label={RELAY_COPY.menuTitle} className="flex flex-col gap-1">
      {targets.map((target, i) => (
        <li key={`${target.targetModule}-${target.field}`} role="none">
          <button
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect(target);
              handleOpenChange(false);
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              'flex min-h-[50px] w-full items-center rounded-lg px-4 text-left text-sm',
              'text-slate-700 transition-colors hover:bg-slate-100 focus:bg-slate-100 focus:outline-none',
              'dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800',
            )}
          >
            {target.label}
          </button>
        </li>
      ))}
      {targets.length === 0 && (
        <li className="px-4 py-3 text-sm text-slate-400">{RELAY_COPY.disabled.noTarget}</li>
      )}
    </ul>
  );

  // 移动端：底部抽屉
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(
            'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0',
            'rounded-t-[28px] rounded-b-none border-0 bg-white p-0 dark:bg-slate-950',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          )}
        >
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="text-left text-base font-semibold text-slate-900 dark:text-white">
              {RELAY_COPY.menuTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">{RELAY_COPY.menuTitle}</DialogDescription>
          </div>
          <div
            className="max-h-[85vh] overflow-y-auto p-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
          >
            {renderItems()}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // 桌面：Popover（右键模式用虚拟锚点定位到光标）。
  // 虚拟元素只需实现 getBoundingClientRect（L3：最小接口，避免跨度过大的 as unknown as HTMLElement）
  const virtualAnchor: { getBoundingClientRect: () => DOMRect } | undefined = anchorPoint
    ? {
        getBoundingClientRect: () =>
          ({
            x: anchorPoint.x,
            y: anchorPoint.y,
            top: anchorPoint.y,
            left: anchorPoint.x,
            right: anchorPoint.x,
            bottom: anchorPoint.y,
            width: 0,
            height: 0,
          }) as DOMRect,
      }
    : undefined;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {anchorPoint && virtualAnchor ? (
        <PopoverAnchor virtualRef={{ current: virtualAnchor as unknown as HTMLElement }} />
      ) : triggerRef ? (
        <PopoverAnchor virtualRef={triggerRef as React.RefObject<HTMLElement>} />
      ) : null}
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-56 rounded-xl border-slate-200 p-2 dark:border-slate-700 dark:bg-slate-900"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          itemRefs.current[0]?.focus();
        }}
      >
        <div className="px-2 pb-1 pt-1 text-xs font-medium text-slate-400">
          {RELAY_COPY.menuTitle}
        </div>
        {renderItems()}
      </PopoverContent>
    </Popover>
  );
}
