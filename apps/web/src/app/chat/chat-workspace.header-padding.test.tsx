import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import ChatWorkspace from './chat-workspace';
import { useChatStore } from '@/stores/chat-store';
import { useConversationsStore } from '@/stores/conversations-store';

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/chat',
}));

vi.mock('@/components/auth/auth-guard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/relay/use-relay-receive', () => ({
  useRelayReceive: () => ({
    initialized: true,
    bundle: null,
    replaceCandidate: null,
    isInvalid: false,
    draft: '',
    setDraft: vi.fn(),
    remove: vi.fn(),
    confirmReplace: vi.fn(),
    cancelReplace: vi.fn(),
    commitExecution: vi.fn(),
  }),
}));

vi.mock('@/lib/api/agent-tools', () => ({
  fetchAgentTools: vi.fn(async () => []),
}));

vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
}));

describe('ChatWorkspace Header 防遮挡自适应顶部间距', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [
        {
          id: 'user-msg-1',
          role: 'user',
          content: '调研一下各个厂商的 token plan 的套餐用量',
        },
      ],
      isLoading: false,
      error: null,
      provider: 'doubao',
      model: 'doubao-pro',
      activeConversationId: 'test-conv-1',
      activeCapabilityPackKey: null,
      attachment: null,
    });
    useConversationsStore.setState({
      conversations: [
        {
          id: 'test-conv-1',
          title: '主流厂商Token套餐调研',
          messages: [],
          provider: 'doubao',
          model: 'doubao-pro',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      currentConversationId: 'test-conv-1',
      isLoaded: true,
      mode: 'single',
    });
  });

  it('消息列表滚动容器具备防遮挡安全顶部内边距（pt-[116px] sm:pt-[124px] 及动态 paddingTop）', () => {
    render(<ChatWorkspace />);

    // 获取消息滚动容器
    const scrollContainer = screen.getByTestId('messages-scroll-container');
    expect(scrollContainer).toBeInTheDocument();

    // 静态 Tailwind 类名应具备安全兜底间距（防止首条消息被 107px 的悬浮 Header 遮挡）
    expect(scrollContainer.className).toContain('pt-[116px]');
    expect(scrollContainer.className).toContain('sm:pt-[124px]');

    // 用户消息正常渲染
    expect(screen.getByText('调研一下各个厂商的 token plan 的套餐用量')).toBeInTheDocument();
  });
});
