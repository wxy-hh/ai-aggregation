import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VoicePage from './page';

const mockGetItemById = vi.fn();

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/voice/waveform', () => ({
  WaveformVisualizer: () => <div>波形图</div>,
}));

vi.mock('@/components/voice/transcript-list', () => ({
  TranscriptList: () => <div>转写列表</div>,
}));

vi.mock('@/components/voice/upload-audio', () => ({
  UploadAudio: () => <div>上传音频面板</div>,
}));

vi.mock('@/components/voice/recording-library', () => ({
  RecordingLibrary: ({
    onHistoryItemClick,
  }: {
    onHistoryItemClick?: (item: Record<string, unknown>) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onHistoryItemClick?.({
          id: 'voice-1',
          fileName: 'meeting.mp3',
          fileSize: 1024,
          fileMimeType: 'audio/mpeg',
          uploadTime: new Date(),
          transcriptionText: '测试转写',
          processingStatus: 'completed',
          tags: [],
          title: '会议录音',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }
    >
      打开历史记录项
    </button>
  ),
}));

vi.mock('@/hooks/use-rtasr-realtime', () => ({
  useRtasrRealtime: () => ({
    status: 'idle',
    elapsedMs: 0,
    segments: [],
    level: 0,
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(async () => []),
  }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/stores/history-store', () => ({
  useHistoryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      addItem: vi.fn(),
      getItemById: mockGetItemById,
    }),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('VoicePage mobile layout', () => {
  beforeEach(() => {
    mockGetItemById.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('显示模式切换和历史记录入口', async () => {
    render(<VoicePage />);

    await waitFor(() => {
      expect(screen.getByText('实时录音')).toBeInTheDocument();
      expect(screen.getByText('上传音频')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '打开历史记录' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: '开始录音' }).length).toBeGreaterThan(0);
    });
  });

  it('点击历史记录入口可以打开抽屉', async () => {
    render(<VoicePage />);

    fireEvent.click(await screen.findByRole('button', { name: '打开历史记录' }));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText('历史记录')).toBeInTheDocument();
      expect(within(dialog).getByText('打开历史记录项')).toBeInTheDocument();
    });
  });

  it('点击历史记录项后关闭抽屉并切换到上传模式', async () => {
    render(<VoicePage />);

    fireEvent.click(await screen.findByRole('button', { name: '打开历史记录' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('打开历史记录项'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('上传音频面板')).toBeInTheDocument();
    });
  });
});
