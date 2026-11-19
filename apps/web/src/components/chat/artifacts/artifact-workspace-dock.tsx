'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArtifactWorkspace } from './artifact-workspace';
import {
  clampWorkspaceWidth,
  getDefaultWorkspaceWidth,
  getWorkspaceMaxWidth,
  readStoredWorkspaceWidth,
  writeStoredWorkspaceWidth,
  WORKSPACE_MIN_WIDTH,
} from './artifact-workspace-width';

interface ArtifactWorkspaceDockProps {
  onPrefillInput?: (text: string) => void;
}

/**
 * 桌面右栏容器：持有宽度（拖拽中的临时值 > 本地偏好 > 默认值），
 * 并随视口变化重新钳制，保证不会挤坏对话区。仅在桌面分栏处挂载。
 */
export function ArtifactWorkspaceDock({ onPrefillInput }: ArtifactWorkspaceDockProps) {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth
  );
  // 工作台仅在客户端交互后才挂载，惰性读取本地偏好不会造成水合差异
  const [preferred, setPreferred] = useState<number | null>(() =>
    typeof window === 'undefined' ? null : readStoredWorkspaceWidth()
  );
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const width = clampWorkspaceWidth(
    dragWidth ?? preferred ?? getDefaultWorkspaceWidth(viewportWidth),
    viewportWidth
  );

  const handleChange = useCallback((next: number) => setDragWidth(next), []);
  const handleCommit = useCallback(
    (next: number) => {
      const clamped = clampWorkspaceWidth(next, viewportWidth);
      setPreferred(clamped);
      setDragWidth(null);
      writeStoredWorkspaceWidth(clamped);
    },
    [viewportWidth]
  );

  return (
    <aside
      data-testid="artifact-workspace-aside"
      style={{ width }}
      className="hidden h-full min-h-0 flex-shrink-0 flex-col p-4 pl-0 lg:flex"
    >
      <ArtifactWorkspace
        onPrefillInput={onPrefillInput}
        resize={{
          width,
          min: WORKSPACE_MIN_WIDTH,
          max: getWorkspaceMaxWidth(viewportWidth),
          onChange: handleChange,
          onCommit: handleCommit,
        }}
      />
    </aside>
  );
}
