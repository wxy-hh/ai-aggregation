import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ArtifactWorkspaceDock } from './artifact-workspace-dock';
import { ArtifactWorkspace } from './artifact-workspace';
import { WORKSPACE_WIDTH_STORAGE_KEY } from './artifact-workspace-width';
import { useChatStore } from '@/stores/chat-store';
import type { Artifact } from '@repo/shared';

const ARTIFACT: Artifact = {
  id: 'art-w',
  type: 'markdown',
  title: '宽度测试研报',
  content: '# 研报\n\n正文',
  status: 'complete',
};

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

/** jsdom 无 PointerEvent 构造器，用 MouseEvent 派发同名事件即可（手柄只读取 clientX） */
function pointer(target: Element | Window, type: string, clientX: number) {
  act(() => {
    fireEvent(target, new MouseEvent(type, { bubbles: true, clientX }));
  });
}

/** 从视口右缘向左拖到使右栏变为目标宽度（手柄随右栏左缘，向左拖变宽） */
function dragBy(handle: Element, deltaLeft: number, startX = 1000) {
  pointer(handle, 'pointerdown', startX);
  pointer(window, 'pointermove', startX - deltaLeft);
  pointer(window, 'pointerup', startX - deltaLeft);
}

function openWorkspace() {
  useChatStore.setState({ artifacts: [ARTIFACT], activeArtifactId: 'art-w', isWorkspaceOpen: true });
}

const asideWidth = () => (screen.getByTestId('artifact-workspace-aside') as HTMLElement).style.width;

describe('ArtifactWorkspaceDock 桌面右栏拖拽调宽 (TC11 / ADR-0037 §1)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    window.localStorage.clear();
    setViewport(1440);
    openWorkspace();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('[TC11-1] 桌面非全屏工作台存在 role="separator" 手柄，向左拖动后右栏宽度随指针变宽', () => {
    render(<ArtifactWorkspaceDock />);
    const handle = screen.getByRole('separator', { name: '调整产物工作台宽度' });
    expect(handle).toBeInTheDocument();
    // 1440 宽视口（xl）默认 540
    expect(asideWidth()).toBe('540px');

    pointer(handle, 'pointerdown', 1000);
    pointer(window, 'pointermove', 900);
    expect(asideWidth()).toBe('640px');
    pointer(window, 'pointermove', 800);
    expect(asideWidth()).toBe('740px');
    pointer(window, 'pointerup', 800);
    expect(asideWidth()).toBe('740px');
  });

  it('[TC11-2] 视口 1440 时拖到 300px 被钳制为 480px，拖到 1200px 被钳制为视口 60%（864px）', () => {
    render(<ArtifactWorkspaceDock />);
    const handle = screen.getByTestId('artifact-resize-handle');

    // 默认 540，向右拖 240 → 目标 300 → 钳制到 480
    dragBy(handle, -240);
    expect(asideWidth()).toBe('480px');

    // 当前 480，向左拖 720 → 目标 1200 → 钳制到 864
    dragBy(handle, 720);
    expect(asideWidth()).toBe('864px');
  });

  it('[TC11-3] 调整后的宽度写入本地偏好，重新挂载后读取到同一宽度', () => {
    const first = render(<ArtifactWorkspaceDock />);
    dragBy(screen.getByTestId('artifact-resize-handle'), 160);
    expect(asideWidth()).toBe('700px');
    expect(window.localStorage.getItem(WORKSPACE_WIDTH_STORAGE_KEY)).toBe('700');
    first.unmount();

    render(<ArtifactWorkspaceDock />);
    expect(asideWidth()).toBe('700px');
  });

  it('[TC11-5] 本地偏好值非法（非数字、负数、零）时回退默认宽度且不抛异常', () => {
    for (const bad of ['abc', '-300', '0', '', 'NaN', 'Infinity']) {
      window.localStorage.setItem(WORKSPACE_WIDTH_STORAGE_KEY, bad);
      const { unmount } = render(<ArtifactWorkspaceDock />);
      expect(asideWidth()).toBe('540px');
      unmount();
    }
  });

  it('偏好宽度超过当前视口上限时按视口钳制；视口缩小后右栏随之收窄', () => {
    window.localStorage.setItem(WORKSPACE_WIDTH_STORAGE_KEY, '1300');
    render(<ArtifactWorkspaceDock />);
    expect(asideWidth()).toBe('864px');

    setViewport(1000);
    act(() => {
      fireEvent(window, new Event('resize'));
    });
    expect(asideWidth()).toBe('600px');
  });

  it('键盘 ←/→ 可调整宽度并写入偏好', () => {
    render(<ArtifactWorkspaceDock />);
    const handle = screen.getByTestId('artifact-resize-handle');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(asideWidth()).toBe('564px');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(asideWidth()).toBe('516px');
    expect(window.localStorage.getItem(WORKSPACE_WIDTH_STORAGE_KEY)).toBe('516');
  });

  it('本地存储不可用时拖拽仍生效，不抛异常', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      render(<ArtifactWorkspaceDock />);
      expect(() => dragBy(screen.getByTestId('artifact-resize-handle'), 100)).not.toThrow();
      expect(asideWidth()).toBe('640px');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('ArtifactWorkspace 手柄显隐 (TC11-4)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    setViewport(1440);
    openWorkspace();
  });

  const resize = { width: 540, min: 480, max: 864, onChange: () => {}, onCommit: () => {} };

  it('[TC11-4] isMobile 渲染不出现手柄，宽度偏好不影响其全屏布局', () => {
    window.localStorage.setItem(WORKSPACE_WIDTH_STORAGE_KEY, '700');
    render(<ArtifactWorkspace isMobile resize={resize} />);
    expect(screen.queryByTestId('artifact-resize-handle')).not.toBeInTheDocument();
    const overlay = screen.getByTestId('mobile-artifact-overlay');
    expect(overlay.className).toMatch(/fixed/);
    expect(overlay.style.width).toBe('');
  });

  it('[TC11-4] 进入全屏后手柄消失，退出全屏后恢复', () => {
    render(<ArtifactWorkspace resize={resize} />);
    expect(screen.getByTestId('artifact-resize-handle')).toBeInTheDocument();

    const fullscreenBtn = screen.getByLabelText(/全屏/);
    fireEvent.click(fullscreenBtn);
    expect(screen.queryByTestId('artifact-resize-handle')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/退出全屏|还原|收起全屏/));
    expect(screen.getByTestId('artifact-resize-handle')).toBeInTheDocument();
  });
});
