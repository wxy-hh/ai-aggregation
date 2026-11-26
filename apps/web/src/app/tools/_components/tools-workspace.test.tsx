/**
 * 我的工具工作台组件测试
 *
 * 覆盖的规格行为（docs/features/2026-11-25-tools-workbench-ia-migration/spec.md §2）：
 * 1. 页内同时承载「我的工具」与「MCP 服务」两个分区，且 Webhook 分区在前；
 * 2. 两个分区各带稳定锚点 id（webhook / mcp），供对话页跳转链接直达；
 * 3. 挂载后按 URL hash 主动滚动定位到目标分区（原生锚点在动态导入的客户端组件
 *    挂载前不会生效，故须由组件主动定位）；
 * 4. 无 hash 或 hash 指向未知分区时不发生滚动。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { ToolsWorkspace } from './tools-workspace';

const mockFetchAgentTools = vi.fn();
const mockFetchMcpServers = vi.fn();

vi.mock('@/lib/api/agent-tools', () => ({
  fetchAgentTools: (...args: unknown[]) => mockFetchAgentTools(...args),
}));

vi.mock('@/lib/api/mcp-servers', () => ({
  fetchMcpServers: (...args: unknown[]) => mockFetchMcpServers(...args),
  fetchEnabledMcpTools: vi.fn().mockResolvedValue([]),
}));

const scrollToSpy = vi.fn();
const windowScrollSpy = vi.fn();

function setHash(hash: string) {
  // 用 replaceState 设置 hash：直接赋值 location.hash 会触发 hashchange 事件，
  // 而「页面加载时 URL 已带锚点」不会触发，用它才能真实模拟冷加载场景。
  window.history.replaceState(null, '', hash);
}

/** 页面自带滚动容器（桌面端 main 为 h-screen + overflow-hidden），锚点落位滚动的是它而非 window */
function getScrollContainer(): HTMLElement | null {
  return document.querySelector('.custom-scrollbar') as HTMLElement | null;
}

/**
 * 模拟 lg 断点（1024px）：桌面端 main 为 h-screen + overflow-hidden，滚动在容器内；
 * 移动端 main 为 min-h-screen，滚动在 window。
 */
function mockBreakpoint(isDesktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 1024px') ? isDesktop : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('我的工具工作台：双分区与锚点落位', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAgentTools.mockResolvedValue([]);
    mockFetchMcpServers.mockResolvedValue([]);
    window.location.hash = '';
    Object.defineProperty(window, 'scrollTo', {
      value: windowScrollSpy,
      writable: true,
      configurable: true,
    });
    // 滚动容器的 scrollTo 同样打桩，供锚点落位断言使用
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      value: scrollToSpy,
      writable: true,
      configurable: true,
    });
    // 默认模拟桌面端：main 为 h-screen + overflow-hidden，内容溢出容器、滚动发生在容器上
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      value: 1000,
      configurable: true,
    });
    mockBreakpoint(true);
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('同时渲染两个分区，Webhook 工具分区在 MCP 服务分区之前', async () => {
    render(<ToolsWorkspace />);

    const webhookSection = document.getElementById('webhook');
    const mcpSection = document.getElementById('mcp');

    expect(webhookSection).toBeInTheDocument();
    expect(mcpSection).toBeInTheDocument();

    // DOM 顺序：Webhook 分区在前
    expect(
      webhookSection!.compareDocumentPosition(mcpSection!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // 两个分区各自带有板块标题（页头同名标题不参与匹配）
    await waitFor(() => {
      expect(within(webhookSection!).getByRole('heading', { name: '我的工具' })).toBeInTheDocument();
      expect(within(mcpSection!).getByRole('heading', { name: 'MCP 服务器' })).toBeInTheDocument();
    });
  });

  it('桌面视口（lg 断点及以上）落位滚动页面自带的滚动容器', async () => {
    setHash('#mcp');
    mockBreakpoint(true);

    render(<ToolsWorkspace />);

    const container = getScrollContainer();
    expect(container).not.toBeNull();

    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
    });

    const options = scrollToSpy.mock.calls[0][0] as { top: number; behavior: string };
    expect(typeof options.top).toBe('number');
    expect(Number.isFinite(options.top)).toBe(true);
    expect(options.top).toBeGreaterThanOrEqual(0);
    expect(['auto', 'smooth']).toContain(options.behavior);
    // 桌面端走容器滚动，不应同时滚动窗口
    expect(windowScrollSpy).not.toHaveBeenCalled();
  });

  it('移动视口（lg 断点以下）落位改为滚动窗口', async () => {
    setHash('#mcp');
    mockBreakpoint(false);

    render(<ToolsWorkspace />);

    const container = getScrollContainer();
    expect(container).not.toBeNull();

    await waitFor(() => {
      expect(windowScrollSpy).toHaveBeenCalledTimes(1);
    });

    // 移动端不应调用容器的 scrollTo
    expect(scrollToSpy).not.toHaveBeenCalled();

    const options = windowScrollSpy.mock.calls[0][0] as { top: number; behavior: string };
    expect(Number.isFinite(options.top)).toBe(true);
    expect(options.top).toBeGreaterThanOrEqual(0);
    expect(['auto', 'smooth']).toContain(options.behavior);
  });

  it('hash 为 #webhook 时挂载后滚动定位到 Webhook 工具分区', async () => {
    setHash('#webhook');
    render(<ToolsWorkspace />);

    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('用户偏好减动效时落位改为瞬时滚动', async () => {
    // 减动效偏好须在滚动发生时同步判定：useReducedMotion 的初始状态恒为 false，
    // 其自身 effect 的异步更新要到下一次渲染才生效。
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion')
        ? true
        : query.includes('min-width: 1024px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    try {
      setHash('#webhook');
      render(<ToolsWorkspace />);

      await waitFor(() => {
        expect(scrollToSpy).toHaveBeenCalledTimes(1);
      });

      const options = scrollToSpy.mock.calls[0][0] as { behavior: string };
      expect(options.behavior).toBe('auto');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('无 hash 或 hash 指向未知分区时不触发滚动', async () => {
    setHash('');
    const { unmount } = render(<ToolsWorkspace />);
    await waitFor(() => {
      expect(document.getElementById('mcp')).toBeInTheDocument();
    });
    expect(scrollToSpy).not.toHaveBeenCalled();
    unmount();

    setHash('#not-a-section');
    render(<ToolsWorkspace />);
    await waitFor(() => {
      expect(document.getElementById('mcp')).toBeInTheDocument();
    });
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('组件卸载后不再继续滚动（定位令牌随卸载失效）', async () => {
    setHash('#mcp');
    const { unmount } = render(<ToolsWorkspace />);

    // 等到布局稳定判定完成、落位真正发生
    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalled();
    });
    const callsBeforeUnmount = scrollToSpy.mock.calls.length;

    unmount();

    // 卸载后继续推进若干帧，定位循环必须停止，不得再发起滚动
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
    expect(scrollToSpy.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it('快速切换锚点时只保留最后一次定位，不被旧定位覆盖', async () => {
    setHash('#webhook');
    render(<ToolsWorkspace />);

    // 在稳定性窗口内切换到另一个锚点
    window.history.replaceState(null, '', '#mcp');
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalled();
    });
    const callsAfterSwitch = scrollToSpy.mock.calls.length;

    // 旧锚点的定位循环必须已停止：继续推进若干帧不应再产生新的滚动调用
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
    expect(scrollToSpy.mock.calls.length).toBe(callsAfterSwitch);
  });
});
