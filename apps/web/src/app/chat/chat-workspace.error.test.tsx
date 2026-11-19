import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, act } from '@testing-library/react';
import { toast } from 'sonner';

import ChatWorkspace from './chat-workspace';
import { useChatStore } from '@/stores/chat-store';
import { useConversationsStore } from '@/stores/conversations-store';
import { useSettingsStore } from '@/stores/settings-store';

// 复用能力包测试的 mock 集合，不为错误回归新增 mock
vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
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

describe('ChatWorkspace 错误提示去重', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/chat');
    useConversationsStore.setState({
      conversations: [],
      currentConversationId: null,
      mode: 'single',
      isLoaded: true,
    });
    useChatStore.setState({
      messages: [],
      isLoading: false,
      error: null,
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      activeConversationId: null,
      attachment: null,
    });
    useSettingsStore.setState({ agentModeEnabled: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('同一错误只产生一次提示，无关状态变化不重复', () => {
    const errorSpy = vi.spyOn(toast, 'error');
    render(<ChatWorkspace />);

    act(() => {
      useChatStore.setState({ error: new Error('生成失败') });
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);

    act(() => {
      useChatStore.setState({ isLoading: true });
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('错误消息为空时使用通用文案', () => {
    const errorSpy = vi.spyOn(toast, 'error');
    render(<ChatWorkspace />);

    act(() => {
      useChatStore.setState({ error: new Error('') });
    });

    expect(errorSpy).toHaveBeenCalledWith('请求失败，请稍后重试');
  });

  it('附件校验错误原样展示具体消息', () => {
    const errorSpy = vi.spyOn(toast, 'error');
    render(<ChatWorkspace />);

    act(() => {
      useChatStore.setState({ error: new Error('附件功能仅支持豆包模型') });
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('附件功能仅支持豆包模型');
  });
});
