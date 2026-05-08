import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoEditor } from './video-editor';

const mockGenerateVideo = vi.fn();

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./config-panel', () => ({
  ConfigPanel: ({ onGenerate }: { onGenerate: () => void }) => (
    <div>
      <div>视频配置面板</div>
      <button type="button" onClick={onGenerate}>
        面板内生成
      </button>
    </div>
  ),
}));

vi.mock('./assets-sidebar', () => ({
  AssetsSidebar: () => <div>资源面板内容</div>,
}));

vi.mock('./preview-canvas', () => ({
  PreviewCanvas: () => <div>视频预览区</div>,
}));

vi.mock('./timeline-bar', () => ({
  TimelineBar: () => <div>时间轴区域</div>,
}));

vi.mock('./use-video-generation', () => ({
  useVideoGeneration: () => ({
    prompt: '测试视频 prompt',
    setPrompt: vi.fn(),
    status: 'idle',
    loadingStep: '',
    videoUrl: null,
    coverUrl: null,
    progress: 0,
    config: {
      model: 'cogvideox-flash',
      aspectRatio: '16:9',
      duration: 5,
      resolution: '720p',
    },
    setConfig: vi.fn(),
    referenceImage: null,
    setReferenceImage: vi.fn(),
    generateVideo: mockGenerateVideo,
    reset: vi.fn(),
  }),
}));

describe('VideoEditor mobile layout', () => {
  beforeEach(() => {
    window.innerWidth = 375;
    window.dispatchEvent(new Event('resize'));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('移动端显示配置入口、资源入口和底部生成按钮', async () => {
    render(<VideoEditor />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '打开配置面板' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '打开资源面板' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '生成视频' })).toBeInTheDocument();
    });
  });

  it('点击配置入口后打开配置抽屉', async () => {
    render(<VideoEditor />);

    fireEvent.click(await screen.findByRole('button', { name: '打开配置面板' }));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('创作参数')).toBeInTheDocument();
      expect(within(dialog).getByText('视频配置面板')).toBeInTheDocument();
    });
  });

  it('点击资源入口后打开资源抽屉', async () => {
    render(<VideoEditor />);

    fireEvent.click(await screen.findByRole('button', { name: '打开资源面板' }));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('资源面板')).toBeInTheDocument();
      expect(within(dialog).getByText('资源面板内容')).toBeInTheDocument();
    });
  });

  it('点击底部生成按钮会触发视频生成', async () => {
    render(<VideoEditor />);

    fireEvent.click(await screen.findByRole('button', { name: '生成视频' }));

    expect(mockGenerateVideo).toHaveBeenCalledTimes(1);
  });
});
