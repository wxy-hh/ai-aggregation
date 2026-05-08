import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBreakpoint } from './use-breakpoint';
import { useIsMobile } from './use-is-mobile';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useBreakpoint', () => {
  it('在 767px 时返回 mobile', () => {
    setViewportWidth(767);

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBe('mobile');
  });

  it('在 768px 时返回 tablet', () => {
    setViewportWidth(768);

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBe('tablet');
  });

  it('在 1024px 时返回 desktop', () => {
    setViewportWidth(1024);

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBe('desktop');
  });

  it('在窗口尺寸变化时更新断点', () => {
    setViewportWidth(767);

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBe('mobile');

    act(() => {
      setViewportWidth(1024);
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe('desktop');
  });

  it('首轮渲染与 SSR 保持一致，并在 effect 后更新为真实断点', async () => {
    setViewportWidth(1024);

    function TestComponent() {
      const breakpoint = useBreakpoint();

      return <span data-testid="breakpoint">{breakpoint}</span>;
    }

    const serverHtml = renderToString(<TestComponent />);
    expect(serverHtml).toContain('mobile');

    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(container.textContent).toBe('mobile');

    await act(async () => {
      hydrateRoot(container, <TestComponent />);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.textContent).toBe('desktop');
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe('useIsMobile', () => {
  it('仅在 mobile 断点返回 true', () => {
    setViewportWidth(767);
    const { result, rerender } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);

    act(() => {
      setViewportWidth(768);
      window.dispatchEvent(new Event('resize'));
    });
    rerender();
    expect(result.current).toBe(false);

    act(() => {
      setViewportWidth(1024);
      window.dispatchEvent(new Event('resize'));
    });
    rerender();
    expect(result.current).toBe(false);
  });
});
