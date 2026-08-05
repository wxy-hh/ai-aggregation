import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DestinyPageClient } from './destiny-page-client';

// Next.js App Router 在 happy-dom 中未挂载，提供最小 mock
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/destiny',
  useSearchParams: () => new URLSearchParams('tab=astrology'),
}));

// Image 组件在测试中不需要真实尺寸推断
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

// 强制使用移动端布局，确保四段 Tab 渲染
vi.mock('@/hooks/use-breakpoint', () => ({
  useBreakpoint: () => 'mobile',
}));

// 避免接力层在测试环境中访问未初始化的 router
vi.mock('@/components/relay/use-relay-receive', () => ({
  useRelayReceive: () => ({
    bundle: null,
    replaceCandidate: null,
    isInvalid: false,
    confirmReplace: vi.fn(),
    cancelReplace: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock('@/components/relay/use-relay-launcher', () => ({
  useRelayLauncher: () => ({
    openAtTrigger: vi.fn(),
    onContextMenu: vi.fn(),
    longPressProps: {},
    menuOpen: false,
    setMenuOpen: vi.fn(),
    targets: [],
    anchorPoint: { x: 0, y: 0 },
    triggerRef: { current: null },
    disabled: true,
    disabledReason: '',
  }),
}));

describe('DestinyPageClient', () => {
  it('移动端渲染四段等宽 Tab 且包含「星座」', () => {
    render(<DestinyPageClient initialTab="astrology" />);

    // 四项文案均出现
    expect(screen.getByText('八字')).toBeInTheDocument();
    expect(screen.getByText('紫微')).toBeInTheDocument();
    expect(screen.getByText('奇门')).toBeInTheDocument();
    expect(screen.getByText('星座')).toBeInTheDocument();

    // 四项等宽：外层容器使用 grid-cols-4
    const grid = screen.getByText('八字').parentElement;
    expect(grid).toHaveClass('grid-cols-4');
  });
});
