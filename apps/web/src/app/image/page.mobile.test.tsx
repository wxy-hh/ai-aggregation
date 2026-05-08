import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImagePage from './page';

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/image/style-selector', () => ({
  StyleSelector: () => <div>风格预设面板</div>,
}));

vi.mock('@/components/image/settings-panel', () => ({
  SettingsPanel: () => <div>参数配置面板</div>,
}));

vi.mock('@/components/image/creative-cockpit', () => ({
  CreativeCockpit: () => <div>灵感舱</div>,
}));

vi.mock('@/components/image/negative-prompt', () => ({
  NegativePrompt: () => <div>排除内容面板</div>,
}));

vi.mock('@/lib/api/kolors', () => ({
  generateKolorsImage: vi.fn(),
  downloadImage: vi.fn(),
}));

vi.mock('@/stores/history-store', () => ({
  useHistoryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      addItem: vi.fn(),
    }),
}));

vi.mock('@/lib/utils/history-helpers', () => ({
  createImageHistoryItem: vi.fn(() => ({
    type: 'image',
    title: '测试图片',
  })),
}));

vi.mock('@/lib/utils/image-url', () => ({
  blobToDataUrl: vi.fn(),
}));

describe('ImagePage mobile layout', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('显示参数入口和主提示词输入框', async () => {
    render(<ImagePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '打开参数面板' })).toBeInTheDocument();
      expect(screen.getAllByPlaceholderText('描述你想要生成的画面...').length).toBeGreaterThan(
        0
      );
    });
  });

  it('点击参数入口可以打开设置面板', async () => {
    render(<ImagePage />);

    fireEvent.click(await screen.findByRole('button', { name: '打开参数面板' }));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText('参数设置')).toBeInTheDocument();
      expect(within(dialog).getByText('风格预设面板')).toBeInTheDocument();
      expect(within(dialog).getByText('参数配置面板')).toBeInTheDocument();
      expect(dialog).toHaveClass('bottom-0');
    });
  });

  it('默认显示空状态提示', async () => {
    render(<ImagePage />);

    await waitFor(() => {
      expect(screen.getByText('准备好开始创作了吗？')).toBeInTheDocument();
    });
  });
});
