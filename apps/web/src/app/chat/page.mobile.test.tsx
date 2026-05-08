import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPage from './page';

const mockUseConversationsStore = vi.fn();
const mockUseChatStore = vi.fn();

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/chat/message-item', () => ({
  MessageItem: ({ message }: { message: { content: string } }) => <div>{message.content}</div>,
}));

vi.mock('@/components/chat/chat-input', () => ({
  ChatInput: ({ onSend }: { onSend: (message: string) => void }) => (
    <button type="button" onClick={() => onSend('测试消息')}>
      发送测试消息
    </button>
  ),
}));

vi.mock('@/stores', () => ({
  useConversationsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    mockUseConversationsStore(selector),
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    mockUseChatStore(selector),
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: (selector: unknown) => selector,
}));

function createConversationState() {
  const conversations = [
    {
      id: 'conv-1',
      title: '产品讨论',
      provider: 'xunfei',
      model: 'lite',
      messages: [],
    },
  ];

  return {
    conversations,
    currentConversationId: 'conv-1',
    isLoaded: true,
    createConversation: vi.fn(() => 'conv-2'),
    switchConversation: vi.fn(),
    deleteConversation: vi.fn(),
    findEmptyConversation: vi.fn(() => null),
    getGroupedConversations: vi.fn(() => [{ title: '今天', items: conversations }]),
    getCurrentConversation: vi.fn(() => conversations[0]),
    updateConversationSettings: vi.fn(),
  };
}

function createChatState() {
  return {
    messages: [],
    isLoading: false,
    error: null,
    provider: 'xunfei',
    model: 'lite',
    activeConversationId: 'conv-1',
    sendMessage: vi.fn(),
    reload: vi.fn(),
    loadConversation: vi.fn(),
    switchProvider: vi.fn(),
    reset: vi.fn(),
  };
}

describe('ChatPage mobile layout', () => {
  beforeEach(() => {
    const conversationState = createConversationState();
    const chatState = createChatState();

    mockUseConversationsStore.mockImplementation((selector) => selector(conversationState));
    mockUseChatStore.mockImplementation((selector) => selector(chatState));

    window.history.replaceState({}, '', '/chat');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('显示移动端会话与模型入口', async () => {
    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '打开会话列表' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '打开模型选择' })).toBeInTheDocument();
    });
  });

  it('点击会话入口可以打开会话抽屉', async () => {
    render(<ChatPage />);

    fireEvent.click(await screen.findByRole('button', { name: '打开会话列表' }));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText('对话列表')).toBeInTheDocument();
      expect(within(dialog).getAllByText('产品讨论').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('对话列表').closest('[role="dialog"]')).toHaveClass('bottom-0');
  });

  it('点击模型入口可以打开模型抽屉', async () => {
    render(<ChatPage />);

    fireEvent.click(await screen.findByRole('button', { name: '打开模型选择' }));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText('模型选择')).toBeInTheDocument();
      expect(within(dialog).getByText('Spark Lite (免费)')).toBeInTheDocument();
    });

    expect(screen.getByText('模型选择').closest('[role="dialog"]')).toHaveClass('bottom-0');
  });

  it('保留底部输入区域', async () => {
    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByText('发送测试消息')).toBeInTheDocument();
    });
  });
});
