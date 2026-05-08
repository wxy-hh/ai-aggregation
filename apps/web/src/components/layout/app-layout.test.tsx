import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './app-layout';

const mockUsePathname = vi.fn();

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('./global-sidebar', () => ({
  GlobalSidebar: () => <aside data-testid="global-sidebar">桌面侧边栏</aside>,
}));

vi.mock('@/components/theme/theme-toggle', () => ({
  ThemeToggle: ({ className }: { className?: string }) => (
    <button className={className} type="button">
      主题切换
    </button>
  ),
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe('AppLayout', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/');
    setViewportWidth(1280);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('桌面壳层保留 GlobalSidebar 包装结构', async () => {
    render(
      <AppLayout>
        <div>页面内容</div>
      </AppLayout>
    );

    await waitFor(() => {
      expect(screen.getByTestId('global-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('global-sidebar').parentElement).toHaveClass('hidden', 'lg:block');
    });
  });

  it('移动端使用独立壳层包装', async () => {
    setViewportWidth(390);

    render(
      <AppLayout>
        <div>页面内容</div>
      </AppLayout>
    );

    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });
  });

  it('移动端渲染顶部栏和底部导航', async () => {
    setViewportWidth(390);

    render(
      <AppLayout>
        <div>页面内容</div>
      </AppLayout>
    );

    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: '移动端底部导航' })).toBeInTheDocument();
    });
  });

  it('点击更多按钮可以打开移动抽屉', async () => {
    setViewportWidth(390);

    render(
      <AppLayout>
        <div>页面内容</div>
      </AppLayout>
    );

    fireEvent.click(await screen.findByRole('button', { name: '更多' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('更多应用')).toBeInTheDocument();
      expect(screen.getByText('视频生成')).toBeInTheDocument();
      expect(screen.getAllByText('主题切换').length).toBeGreaterThan(0);
    });
  });
});
