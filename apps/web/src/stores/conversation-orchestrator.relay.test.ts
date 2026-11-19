import { beforeEach, describe, expect, it } from 'vitest';

import { conversationOrchestrator } from './conversation-orchestrator';
import { useChatStore } from './chat-store';
import { useComparisonStore } from './comparison-store';
import { useConversationsStore } from './conversations-store';
import { useRelayStore } from './relay-store';
import type { RelayBundle, RelayContentType, RelayModule } from '@repo/shared';

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

/** 构造一个到达对话的接力包 */
const createRelayBundle = ({
  sourceModule = 'image',
  sourceType = 'image',
  snapshotMediaUrl = 'https://example.com/image.png',
}: {
  sourceModule?: RelayModule;
  sourceType?: RelayContentType;
  snapshotMediaUrl?: string;
} = {}): RelayBundle => ({
  id: 'relay-1',
  items: [
    {
      id: 'item-1',
      sourceModule,
      sourceType,
      sourceId: 'source-1',
      sourceTitle: '来源',
      snapshotText: '内容',
      snapshotMediaUrl,
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ],
  targetModule: 'chat',
  targetRole: 'context',
  createdAt: '2026-11-01T00:00:00.000Z',
});

describe('Relay 到达命令', () => {
  beforeEach(() => {
    useConversationsStore.setState({
      conversations: [],
      currentConversationId: null,
      mode: 'single',
      lastActiveSingleId: null,
      lastActiveCompareId: null,
      isLoaded: true,
    });
    useChatStore.getState().reset();
    useComparisonStore.getState().reset();
    useRelayStore.setState({
      bundles: { 'relay-1': createRelayBundle() },
      activeByTarget: { ...EMPTY_ACTIVE, chat: 'relay-1' },
      draftByTarget: { ...EMPTY_DRAFT },
      replaceCandidate: null,
      isInitialized: true,
    });
  });

  it('对比模式下到达时切回单聊并保证存在可承载会话', () => {
    useConversationsStore.getState().createComparisonConversation([], '对比测试');
    useConversationsStore.setState({ mode: 'compare' });

    conversationOrchestrator.applyRelayArrival(createRelayBundle());

    const state = useConversationsStore.getState();
    expect(state.mode).toBe('single');
    expect(state.currentConversationId).not.toBeNull();
  });

  it('当前不是豆包时切换模型并返回 switchedModel', () => {
    useChatStore.setState({ provider: 'xunfei', model: 'lite' });
    const singleId = useConversationsStore.getState().createConversation('xunfei', 'lite');

    const result = conversationOrchestrator.applyRelayArrival(createRelayBundle());

    expect(result).toEqual({ switchedModel: true, isImageRelay: true });
    const conversation = useConversationsStore
      .getState()
      .conversations.find((item) => item.id === singleId);
    expect(conversation?.provider).toBe('doubao');
    expect(conversation?.model).toBe('doubao-seed-evolving');
  });

  it('已经是豆包时再次到达不重复切换', () => {
    const singleId = useConversationsStore.getState().createConversation('xunfei', 'lite');
    conversationOrchestrator.updateSessionModel('doubao', 'doubao-seed-evolving');

    const result = conversationOrchestrator.applyRelayArrival(createRelayBundle());

    expect(result).toEqual({ switchedModel: false, isImageRelay: true });
    const conversation = useConversationsStore
      .getState()
      .conversations.find((item) => item.id === singleId);
    expect(conversation?.provider).toBe('doubao');
    expect(conversation?.model).toBe('doubao-seed-evolving');
  });

  it('文本来源接力到达时不切换模型', () => {
    useChatStore.setState({ provider: 'xunfei', model: 'lite' });
    useConversationsStore.getState().createConversation('xunfei', 'lite');

    const result = conversationOrchestrator.applyRelayArrival(
      createRelayBundle({ sourceModule: 'chat', sourceType: 'text', snapshotMediaUrl: '' })
    );

    expect(result).toEqual({ switchedModel: false, isImageRelay: false });
    expect(useChatStore.getState().provider).toBe('xunfei');
  });

  it('到达处理不改写接力草稿与活动引用', () => {
    useChatStore.setState({ provider: 'xunfei', model: 'lite' });
    useConversationsStore.getState().createConversation('xunfei', 'lite');
    useRelayStore.setState({
      draftByTarget: { ...EMPTY_DRAFT, chat: '已有草稿' },
    });

    conversationOrchestrator.applyRelayArrival(createRelayBundle());

    expect(useRelayStore.getState().draftByTarget.chat).toBe('已有草稿');
    expect(useRelayStore.getState().activeByTarget.chat).toBe('relay-1');
  });
});
