import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from './page';
import ResumeEntryPage from './resume/page';
import ResumeTemplatePage from './resume/template/page';

const mockPush = vi.fn();

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/home/home-content', () => ({
  HomeContent: () => (
    <div>
      <div data-testid="home-feature-grid" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        <div>智能对话</div>
        <div>语音转写</div>
        <div>灵感绘图</div>
      </div>
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

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

vi.mock('@/stores', () => ({
  useConversationsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      conversations: [],
      createConversation: vi.fn(),
    }),
  useAudioHistoryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      items: [],
      isInitialized: true,
      initializeService: vi.fn(),
    }),
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setInput: vi.fn(),
    }),
}));

vi.mock('@/hooks/use-auto-save', () => ({
  useAutoSave: vi.fn(),
}));

vi.mock('@/stores/resume-editor-store', () => ({
  useResumeEditorStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      saveStatus: 'saved',
      lastSavedAt: null,
    }),
}));

vi.mock('./resume/template/_components/content-panel', () => ({
  ContentPanel: () => <div>编辑面板</div>,
}));

vi.mock('./resume/template/_components/preview-viewport', () => ({
  PreviewViewport: () => <div>预览面板</div>,
}));

vi.mock('./resume/template/_components/ai-assistant-panel', () => ({
  AIAssistantPanel: () => <div>AI 助手面板</div>,
}));

vi.mock('./resume/template/_components/ai-drawer', () => ({
  AIDrawer: () => null,
}));

vi.mock('./resume/template/_components/ai-drawer-trigger', () => ({
  AIDrawerTrigger: () => null,
}));

vi.mock('./resume/template/_components/save-status-indicator', () => ({
  SaveStatusIndicator: () => <div>保存状态</div>,
}));

describe('Remaining pages mobile layout', () => {
  beforeEach(() => {
    window.innerWidth = 375;
    window.dispatchEvent(new Event('resize'));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('首页模块入口在移动端可见', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('智能对话')).toBeInTheDocument();
      expect(screen.getByText('语音转写')).toBeInTheDocument();
      expect(screen.getByText('灵感绘图')).toBeInTheDocument();
      expect(screen.getByTestId('home-feature-grid').className).toContain('grid-cols-1');
    });
  });

  it('简历入口页在移动端保留双入口', async () => {
    render(<ResumeEntryPage />);

    await waitFor(() => {
      expect(screen.getByText('使用通用模板')).toBeInTheDocument();
      expect(screen.getByText('上传您的简历')).toBeInTheDocument();
      const templateHeading = screen.getByText('使用通用模板');
      const uploadHeading = screen.getByText('上传您的简历');
      const grid = templateHeading.closest('.grid');

      expect(grid?.className).toContain('grid-cols-1');
      expect(grid).toContainElement(uploadHeading);
    });
  });

  it('简历模板页移动端入口仍可切换', async () => {
    render(<ResumeTemplatePage />);

    await waitFor(() => {
      expect(screen.getAllByText('编辑面板').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '切换到预览' }));
    await waitFor(() => {
      expect(screen.getAllByText('预览面板').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '切换到AI 助手' }));
    await waitFor(() => {
      expect(screen.getAllByText('AI 助手面板').length).toBeGreaterThan(0);
    });
  });
});
