import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HistoryPage from './page';

const mockPush = vi.fn();

const mockHistoryItems = [
  {
    id: 'chat-1',
    type: 'chat',
    title: '多模型对话',
    date: '2026-05-04',
    createdAt: '2026-05-04',
    updatedAt: '2026-05-04',
    preview: '这是对话预览',
    tags: ['总结'],
    model: 'qwen-max',
    provider: 'dashscope',
    messages: [],
  },
  {
    id: 'voice-1',
    type: 'voice',
    title: '会议录音',
    date: '2026-05-04',
    createdAt: '2026-05-04',
    updatedAt: '2026-05-04',
    preview: '这是语音预览',
    duration: '03:12',
    model: 'SenseVoice',
    fileName: 'meeting.mp3',
    fileSize: 1024,
    transcription: '测试转写',
  },
  {
    id: 'image-1',
    type: 'image',
    title: '城市夜景',
    date: '2026-05-04',
    createdAt: '2026-05-04',
    updatedAt: '2026-05-04',
    preview: '霓虹城市',
    model: 'Kolors',
    imageUrl: 'https://example.com/image.png',
    prompt: '一座有霓虹灯的未来城市',
  },
];

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/stores/history-store', () => ({
  useHistoryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      filter: {
        type: 'all',
        search: '',
      },
      isLoading: false,
      setFilter: vi.fn(),
      getFilteredItems: () => mockHistoryItems,
      getStats: () => ({
        total: 3,
        chat: 1,
        voice: 1,
        image: 1,
      }),
      deleteItem: vi.fn(),
    }),
}));

describe('HistoryPage mobile layout', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('移动端仍显示 tabs 和搜索框', async () => {
    render(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByTestId('history-tabs')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('搜索历史记录...')).toBeInTheDocument();
    });
  });

  it('历史卡片在移动端使用单列主布局', async () => {
    render(<HistoryPage />);

    await waitFor(() => {
      const grid = screen.getByTestId('history-grid');
      expect(grid.className).toContain('grid-cols-1');
      expect(screen.getByText('多模型对话')).toBeInTheDocument();
      expect(screen.getByText('会议录音')).toBeInTheDocument();
      expect(screen.getByText('霓虹城市')).toBeInTheDocument();
    });
  });

  it('点击图片预览后打开详情弹层', async () => {
    render(<HistoryPage />);

    fireEvent.click(await screen.findByRole('button', { name: '预览' }));

    await waitFor(() => {
      expect(screen.getByTestId('history-preview-overlay')).toBeInTheDocument();
      expect(screen.getByText('Prompt 描述')).toBeInTheDocument();
      expect(screen.getByText('城市夜景')).toBeInTheDocument();
    });
  });
});
