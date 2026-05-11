import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalSidebar } from './global-sidebar';

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
  usePathname: () => '/chat',
}));

vi.mock('../theme/theme-toggle', () => ({
  ThemeToggle: ({ className }: { className?: string }) => (
    <button className={className} type="button">
      主题切换
    </button>
  ),
}));

vi.mock('./apps-modal', () => ({
  AppsModal: () => null,
  APP_CONFIGS: [],
}));

vi.mock('@/stores', () => ({
  usePinnedApps: () => [],
  useShowAppsModal: () => false,
  useUIActions: () => ({
    addPinnedApp: vi.fn(),
    removePinnedApp: vi.fn(),
    setAppsModal: vi.fn(),
  }),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, layout: _layout, ...props }: React.HTMLAttributes<HTMLDivElement> & { layout?: boolean }) => (
      <div {...props}>{children}</div>
    ),
    button: ({
      children,
      layout: _layout,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { layout?: boolean }) => (
      <button {...props}>{children}</button>
    ),
  },
  useAnimationControls: () => ({}),
}));

describe('GlobalSidebar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('在底部渲染个人中心头像入口并跳转到个人中心页面', () => {
    render(<GlobalSidebar />);

    const profileLink = screen.getByRole('link', { name: '打开个人中心' });
    expect(profileLink).toHaveAttribute('href', '/profile');
  });
});
