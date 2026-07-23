'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  Children,
  isValidElement,
} from 'react';
import { cn } from '@/lib/utils';

/** 与 Tailwind gap-6 一致 */
const MASONRY_GAP_PX = 24;

interface HistoryMasonryGridProps {
  children: React.ReactNode;
  /** 图片 Tab 在较窄屏也使用双列 */
  variant?: 'default' | 'image';
  className?: string;
}

interface ItemPosition {
  top: number;
  left: number;
}

function getColumnCount(variant: 'default' | 'image', width: number): number {
  if (variant === 'image') {
    if (width >= 1280) return 3;
    if (width >= 640) return 2;
    return 1;
  }
  if (width >= 1280) return 3;
  if (width >= 1024) return 2;
  return 1;
}

/**
 * 历史记录瀑布流：按 DOM 顺序依次放入当前最短的列
 * 保证从左到右、从上到下的阅读顺序，并消除列间大块空白
 */
export function HistoryMasonryGrid({
  children,
  variant = 'default',
  className,
}: HistoryMasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [columnCount, setColumnCount] = useState(1);
  const [columnWidth, setColumnWidth] = useState(0);
  const [positions, setPositions] = useState<ItemPosition[]>([]);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const childArray = Children.toArray(children).filter(isValidElement);

  const updateColumnCount = useCallback(() => {
    const width = containerRef.current?.offsetWidth ?? window.innerWidth;
    setColumnCount(getColumnCount(variant, width));
  }, [variant]);

  useEffect(() => {
    updateColumnCount();
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      updateColumnCount();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateColumnCount]);

  const layoutMasonry = useCallback(() => {
    const container = containerRef.current;
    const items = childArray
      .map((_, index) => itemRefs.current[index])
      .filter((el): el is HTMLDivElement => el != null);
    if (!container || items.length !== childArray.length || columnCount < 1) {
      setIsReady(false);
      return;
    }

    const containerWidth = container.offsetWidth;
    if (containerWidth <= 0) return;

    const colWidth =
      (containerWidth - MASONRY_GAP_PX * (columnCount - 1)) / columnCount;
    setColumnWidth(colWidth);

    // 测量前强制列宽，避免多列时按整行宽度算高度
    items.forEach((el) => {
      el.style.width = `${colWidth}px`;
    });

    const colHeights = new Array<number>(columnCount).fill(0);
    const nextPositions: ItemPosition[] = [];

    items.forEach((el) => {
      let targetCol = 0;
      for (let c = 1; c < columnCount; c++) {
        if (colHeights[c] < colHeights[targetCol]) {
          targetCol = c;
        }
      }

      nextPositions.push({
        top: colHeights[targetCol],
        left: targetCol * (colWidth + MASONRY_GAP_PX),
      });

      colHeights[targetCol] += el.offsetHeight + MASONRY_GAP_PX;
    });

    const maxHeight = Math.max(0, ...colHeights);
    setContainerHeight(maxHeight > 0 ? maxHeight - MASONRY_GAP_PX : 0);
    setPositions(nextPositions);
    setIsReady(nextPositions.length === childArray.length);
  }, [columnCount, childArray.length]);

  useLayoutEffect(() => {
    layoutMasonry();
  }, [layoutMasonry, childArray.length]);

  // 图片加载、窗口变化导致卡片高度变化时重新布局
  useEffect(() => {
    const items = itemRefs.current.filter((el): el is HTMLDivElement => el != null);
    if (items.length === 0) return;

    const observer = new ResizeObserver(() => {
      layoutMasonry();
    });

    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [layoutMasonry, childArray.length, isReady]);

  return (
    <div
      ref={containerRef}
      data-testid="history-grid"
      className={cn('relative w-full', className)}
      style={{ height: isReady ? containerHeight : undefined }}
    >
      {childArray.map((child, index) => {
        const pos = positions[index];
        return (
          <div
            key={child.key ?? index}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className={cn(
              'absolute top-0 left-0',
              !isReady && 'invisible'
            )}
            style={{
              width: columnWidth > 0 ? columnWidth : undefined,
              transform: pos ? `translate(${pos.left}px, ${pos.top}px)` : undefined,
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}

/** 瀑布流子项占位（布局由容器计算，无需额外样式） */
export function HistoryMasonryItem({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
