import { beforeEach, describe, expect, it, vi } from 'vitest';

import { conversationOrchestrator } from './conversation-orchestrator';
import { useChatStore } from './chat-store';
import { useComparisonStore } from './comparison-store';
import { useConversationsStore } from './conversations-store';
import { useRelayStore } from './relay-store';
import type { RelayBundle } from '@repo/shared';

const ORIGINAL_SEND_MESSAGE = useChatStore.getState().sendMessage;
const ORIGINAL_LOAD_CONVERSATION = useChatStore.getState().loadConversation;

/** 空的接力目标状态 */
const EMPTY_ACTIVE = {
  chat: null,
  image: null,
  voice: null,
  video: null,
  destiny: null,
} as const;

const EMPTY_DRAFT = {
  chat: '',
  image: '',
  voice: '',
  video: '',
  destiny: '',
};

/** 构造一个对话目标的文本接力包 */
const createTextRelayBundle = (): RelayBundle => ({
  id: 'relay-1',
  items: [
    {
      id: 'item-1',
      sourceModule: 'chat',
      sourceType: 'text',
      sourceId: 'source-1',
      sourceTitle: '来源',
      snapshotText: '引用内容',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ],
  targetModule: 'chat',
  targetRole: 'context',
  createdAt: '2026-11-01T00:00:00.000Z',
});

describe('发送事务命令', () => {
  beforeEach(() => {
    useConversationsStore.setState({
      conversations: [],
      currentConversationId: null,
      mode: 'single',
      lastActiveSingleId: null,
      lastActiveCompareId: null,
      isLoaded: true,
    });
    useChatStore.setState({ sendMessage: ORIGINAL_SEND_MESSAGE, loadConversation: ORIGINAL_LOAD_CONVERSATION });
    useChatStore.getState().reset();
    useComparisonStore.getState().reset();
    useRelayStore.setState({
      bundles: {},
      activeByTarget: { ...EMPTY_ACTIVE },
      draftByTarget: { ...EMPTY_DRAFT },
      replaceCandidate: null,
      isInitialized: true,
    });
  });

  it('没有当前会话时先创建会话再发送', async () => {
    const sendMessage = vi.fn().mockResolvedValue('sent');
    const loadConversation = vi.fn();
    useChatStore.setState({ sendMessage, loadConversation });

    await conversationOrchestrator.sendChatMessage('hi');

    const state = useConversationsStore.getState();
    expect(state.conversations).toHaveLength(1);
    expect(state.currentConversationId).toBe(state.conversations[0].id);
    expect(loadConversation).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('hi', undefined);
  });

  it('发送成功时提交接力：清空活动引用与目标草稿', async () => {
    useRelayStore.setState({
      bundles: { 'relay-1': createTextRelayBundle() },
      activeByTarget: { ...EMPTY_ACTIVE, chat: 'relay-1' },
      draftByTarget: { ...EMPTY_DRAFT, chat: '草稿内容' },
    });
    useChatStore.setState({ sendMessage: vi.fn().mockResolvedValue('sent') });

    await conversationOrchestrator.sendChatMessage('hi');

    expect(useRelayStore.getState().activeByTarget.chat).toBeNull();
    expect(useRelayStore.getState().draftByTarget.chat).toBe('');
  });

  it('发送成功且附件来源匹配接力包时清空附件', async () => {
    useRelayStore.setState({
      bundles: { 'relay-1': createTextRelayBundle() },
      activeByTarget: { ...EMPTY_ACTIVE, chat: 'relay-1' },
    });
    useChatStore.setState({
      sendMessage: vi.fn().mockResolvedValue('sent'),
      attachment: {
        id: 'attachment-1',
        type: 'image',
        name: '接力图片.png',
        status: 'ready',
        sourceId: 'relay-1',
      },
    });

    await conversationOrchestrator.sendChatMessage('hi');

    expect(useChatStore.getState().attachment).toBeNull();
  });

  it('发送成功但附件来源不匹配时保留附件', async () => {
    useRelayStore.setState({
      bundles: { 'relay-1': createTextRelayBundle() },
      activeByTarget: { ...EMPTY_ACTIVE, chat: 'relay-1' },
    });
    const manualAttachment = {
      id: 'attachment-2',
      type: 'image' as const,
      name: '手动上传.png',
      status: 'ready' as const,
      sourceId: 'manual-1',
    };
    useChatStore.setState({
      sendMessage: vi.fn().mockResolvedValue('sent'),
      attachment: manualAttachment,
    });

    await conversationOrchestrator.sendChatMessage('hi');

    expect(useChatStore.getState().attachment).toEqual(manualAttachment);
  });

  it('发送失败时保留接力引用与目标草稿', async () => {
    useRelayStore.setState({
      bundles: { 'relay-1': createTextRelayBundle() },
      activeByTarget: { ...EMPTY_ACTIVE, chat: 'relay-1' },
      draftByTarget: { ...EMPTY_DRAFT, chat: '草稿内容' },
    });
    useChatStore.setState({ sendMessage: vi.fn().mockResolvedValue('failed') });

    const result = await conversationOrchestrator.sendChatMessage('hi');

    expect(result).toBe('failed');
    expect(useRelayStore.getState().activeByTarget.chat).toBe('relay-1');
    expect(useRelayStore.getState().draftByTarget.chat).toBe('草稿内容');
  });

  it('发送中止时保留接力引用与目标草稿', async () => {
    useRelayStore.setState({
      bundles: { 'relay-1': createTextRelayBundle() },
      activeByTarget: { ...EMPTY_ACTIVE, chat: 'relay-1' },
      draftByTarget: { ...EMPTY_DRAFT, chat: '草稿内容' },
    });
    useChatStore.setState({ sendMessage: vi.fn().mockResolvedValue('aborted') });

    const result = await conversationOrchestrator.sendChatMessage('hi');

    expect(result).toBe('aborted');
    expect(useRelayStore.getState().activeByTarget.chat).toBe('relay-1');
    expect(useRelayStore.getState().draftByTarget.chat).toBe('草稿内容');
  });

  it('发送被跳过时保留接力引用与目标草稿', async () => {
    useRelayStore.setState({
      bundles: { 'relay-1': createTextRelayBundle() },
      activeByTarget: { ...EMPTY_ACTIVE, chat: 'relay-1' },
      draftByTarget: { ...EMPTY_DRAFT, chat: '草稿内容' },
    });
    useChatStore.setState({ sendMessage: vi.fn().mockResolvedValue('skipped') });

    const result = await conversationOrchestrator.sendChatMessage('hi');

    expect(result).toBe('skipped');
    expect(useRelayStore.getState().activeByTarget.chat).toBe('relay-1');
    expect(useRelayStore.getState().draftByTarget.chat).toBe('草稿内容');
  });

  it('没有接力包时发送不携带派生元数据且不改动接力状态', async () => {
    const sendMessage = vi.fn().mockResolvedValue('sent');
    useChatStore.setState({ sendMessage });

    await conversationOrchestrator.sendChatMessage('hi');

    expect(sendMessage).toHaveBeenCalledWith('hi', undefined);
    expect(useRelayStore.getState().activeByTarget.chat).toBeNull();
    expect(useRelayStore.getState().draftByTarget.chat).toBe('');
  });

  it('发送内容原样透传，不做裁剪或改写', async () => {
    const sendMessage = vi.fn().mockResolvedValue('sent');
    useChatStore.setState({ sendMessage });

    await conversationOrchestrator.sendChatMessage('  hi  ');

    expect(sendMessage).toHaveBeenCalledWith('  hi  ', undefined);
  });
});
