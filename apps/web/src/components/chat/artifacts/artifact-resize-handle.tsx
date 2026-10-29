'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ArtifactResizeHandleProps {
  /** 当前宽度（px） */
  width: number;
  min: number;
  max: number;
  /** 拖动或键盘调整过程中的实时宽度 */
  onChange: (width: number) => void;
  /** 一次调整结束后的最终宽度（用于写入偏好） */
  onCommit: (width: number) => void;
}

/** 键盘调整步长（px） */
const KEYBOARD_STEP = 24;

/**
 * 桌面右栏分隔手柄：贴在工作台左缘，向左拖动变宽、向右拖动变窄。
 * 同时支持键盘（←/→）调整，避免只能靠鼠标。钳制由上层完成，手柄只上报指针换算后的原始宽度。
 */
export function ArtifactResizeHandle({ width, min, max, onChange, onCommit }: ArtifactResizeHandleProps) {
  const dragRef = useRef<{ startX: number; startWidth: number; last: number } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // 卸载时移除可能残留的全局监听
  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startWidth: width, last: width };
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';

      const handleMove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        drag.last = drag.startWidth + (drag.startX - e.clientX);
        onChange(drag.last);
      };
      const finish = () => {
        const drag = dragRef.current;
        dragRef.current = null;
        cleanup();
        if (drag) onCommit(drag.last);
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        document.body.style.userSelect = previousUserSelect;
        cleanupRef.current = null;
      };
      cleanupRef.current = cleanup;
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [width, onChange, onCommit]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = width + (event.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP);
      onChange(next);
      onCommit(next);
    },
    [width, onChange, onCommit]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整产物工作台宽度"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-testid="artifact-resize-handle"
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className={cn(
        'absolute inset-y-0 left-0 z-20 hidden w-3 cursor-col-resize touch-none select-none lg:block',
        'after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:bg-transparent after:transition-colors',
        'hover:after:bg-primary/40 focus-visible:outline-none focus-visible:after:bg-primary'
      )}
    />
  );
}
