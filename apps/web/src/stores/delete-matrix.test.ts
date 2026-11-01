/**
 * delete-matrix.test.ts —— 统一删除传播矩阵测试
 *
 * 锁定的外部行为（ADR-0046 / 工单 02）：
 * 1. 侧边栏删会话：会话删除、历史删除、接力标记各一次；
 * 2. 历史页删 chat：历史删除、会话删除、接力标记各一次；
 * 3. 历史页删 voice：历史删除、音频侧删除、接力标记各一次；
 * 4. 批删与清空历史：关联数据按各自记录执行一次；
 * 5. 删非当前会话不扰动当前运行时；
 * 6. 删正在生成的会话先停止流；
 * 7. 音频库删除同时移除统一历史摘要。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// history-store 依赖 authFetch 拉取远端历史；本测试只覆盖本地删除链
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
  fetchWithAuth: vi.fn(),
  authHeaders: vi.fn(),
}));

import { conversationOrchestrator } from './conversation-orchestrator';
import { useConversationsStore } from './conversations-store';
import { useHistoryStore } from './history-store';
import { useAudioHistoryStore } from './audio-history-store';
import { useRelayStore } from './relay-store';
import { useChatStore } from './chat-store';
import type { ChatHistoryItem, VoiceHistoryItem } from '@/types/history';
import type { RelayBundle } from '@repo/shared';

const NOW = '2026-11-01T00:00:00.000Z';

const chatHistoryItem = (id: string): ChatHistoryItem => ({
  id,
  type: 'chat',
  title: `对话-${id}`,
  preview: '你好',
  date: '刚刚',
  model: 'lite',
  provider: 'xunfei',
  messages: [],
  createdAt: NOW,
  updatedAt: NOW,
});

const voiceHistoryItem = (id: string): VoiceHistoryItem => ({
  id,
  type: 'voice',
  title: `录音-${id}`,
  preview: '转写摘要',
  date: '刚刚',
  duration: '00:10',
  model: 'whisper',
  fileName: 'a.wav',
  fileSize: 1024,
  transcription: '转写正文',
  createdAt: NOW,
  updatedAt: NOW,
});

const relayBundle = (id: string, sourceId: string): RelayBundle => ({
  id,
  items: [
    {
      id: `item-${id}`,
      sourceModule: 'chat',
      sourceType: 'text',
      sourceId,
      sourceTitle: `来源-${sourceId}`,
      snapshotText: '快照正文',
      createdAt: NOW,
    },
  ],
  targetModule: 'image',
  targetRole: 'context',
  createdAt: NOW,
});

const seedConversation = (id: string) => {
  useConversationsStore.setState({
    conversations: [
      {
        id,
        title: `会话-${id}`,
        messages: [{ id: `${id}-m1`, role: 'user', content: '你好' }],
        provider: 'xunfei',
        model: 'lite',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    currentConversationId: id,
    mode: 'single',
    lastActiveSingleId: id,
    lastActiveCompareId: null,
    isLoaded: true,
  });
};

const audioItem = (id: string) => ({
  id,
  fileName: 'a.wav',
  fileSize: 1024,
  fileMimeType: 'audio/wav',
  uploadTime: new Date(NOW),
  processingStatus: 'completed' as const,
  tags: [],
  title: `录音-${id}`,
  createdAt: new Date(NOW),
  updatedAt: new Date(NOW),
});

// zustand 每次 set 都会创建新 state 对象，spy 会随 Object.assign 被复制到新对象；
// 每个用例开始前把 action 复位为原始实现，避免上一用例的 spy 计数累积。
const ORIGINAL_ACTIONS = {
  historyDeleteItem: useHistoryStore.getState().deleteItem,
  historyDeleteItems: useHistoryStore.getState().deleteItems,
  historyClearHistory: useHistoryStore.getState().clearHistory,
  audioDeleteItemOnly: useAudioHistoryStore.getState().deleteAudioItemOnly,
  audioDeleteItem: useAudioHistoryStore.getState().deleteItem,
  chatStop: useChatStore.getState().stop,
};

const restoreOriginalActions = () => {
  useHistoryStore.setState({
    deleteItem: ORIGINAL_ACTIONS.historyDeleteItem,
    deleteItems: ORIGINAL_ACTIONS.historyDeleteItems,
    clearHistory: ORIGINAL_ACTIONS.historyClearHistory,
  });
  useAudioHistoryStore.setState({
    deleteAudioItemOnly: ORIGINAL_ACTIONS.audioDeleteItemOnly,
    deleteItem: ORIGINAL_ACTIONS.audioDeleteItem,
  });
  useChatStore.setState({ stop: ORIGINAL_ACTIONS.chatStop });
};

describe('统一删除传播矩阵', () => {
  beforeEach(async () => {
    // 等待 persist 水合完成，避免 rehydrate 覆盖预置状态
    await Promise.resolve();

    restoreOriginalActions();
    useChatStore.getState().reset();

    useConversationsStore.setState({
      conversations: [],
      currentConversationId: null,
      mode: 'single',
      lastActiveSingleId: null,
      lastActiveCompareId: null,
      isLoaded: true,
    });

    useHistoryStore.setState({
      items: [],
      isLoading: false,
      error: null,
      isInitialized: true,
      filter: { type: 'all' },
    });

    useAudioHistoryStore.setState({
      items: [],
      currentItem: null,
      selectedIds: [],
      stats: null,
      isInitialized: true,
      service: null,
    });

    useRelayStore.setState({ bundles: {}, isInitialized: true });
  });

  it('侧边栏删会话：会话删除、历史删除、接力标记各恰好一次', () => {
    seedConversation('conv-1');
    useHistoryStore.setState({ items: [chatHistoryItem('conv-1')] });
    useRelayStore.setState({ bundles: { b1: relayBundle('b1', 'conv-1') } });

    const historyDeleteSpy = vi.spyOn(useHistoryStore.getState(), 'deleteItem');

    conversationOrchestrator.deleteConversation('conv-1');

    expect(historyDeleteSpy).toHaveBeenCalledTimes(1);
    expect(historyDeleteSpy).toHaveBeenCalledWith('conv-1');
    expect(
      useConversationsStore.getState().conversations.find((c) => c.id === 'conv-1')
    ).toBeUndefined();
    expect(useRelayStore.getState().bundles.b1.items[0].sourceId).toBe('');
  });

  it('历史页删 chat：历史删除、会话删除、接力标记各恰好一次', async () => {
    seedConversation('conv-1');
    useHistoryStore.setState({ items: [chatHistoryItem('conv-1')] });
    useRelayStore.setState({ bundles: { b1: relayBundle('b1', 'conv-1') } });

    const historyDeleteSpy = vi.spyOn(useHistoryStore.getState(), 'deleteItem');

    await conversationOrchestrator.deleteHistoryItem('conv-1');

    expect(historyDeleteSpy).toHaveBeenCalledTimes(1);
    expect(
      useConversationsStore.getState().conversations.find((c) => c.id === 'conv-1')
    ).toBeUndefined();
    expect(useRelayStore.getState().bundles.b1.items[0].sourceId).toBe('');
  });

  it('历史页删 voice：历史删除、音频侧删除、接力标记各恰好一次', async () => {
    useHistoryStore.setState({ items: [voiceHistoryItem('voice-1')] });
    useAudioHistoryStore.setState({ items: [audioItem('voice-1')] });
    useRelayStore.setState({ bundles: { b1: relayBundle('b1', 'voice-1') } });

    const historyDeleteSpy = vi.spyOn(useHistoryStore.getState(), 'deleteItem');
    const audioDeleteSpy = vi
      .spyOn(useAudioHistoryStore.getState(), 'deleteAudioItemOnly')
      .mockResolvedValue(undefined);

    await conversationOrchestrator.deleteHistoryItem('voice-1');

    expect(historyDeleteSpy).toHaveBeenCalledTimes(1);
    expect(audioDeleteSpy).toHaveBeenCalledTimes(1);
    expect(audioDeleteSpy).toHaveBeenCalledWith('voice-1');
    expect(useRelayStore.getState().bundles.b1.items[0].sourceId).toBe('');
  });

  it('历史页批删 chat 与 voice：两类关联删除全部按记录执行一次', async () => {
    seedConversation('conv-1');
    useHistoryStore.setState({
      items: [chatHistoryItem('conv-1'), voiceHistoryItem('voice-1')],
    });
    useAudioHistoryStore.setState({ items: [audioItem('voice-1')] });
    useRelayStore.setState({
      bundles: {
        b1: relayBundle('b1', 'conv-1'),
        b2: relayBundle('b2', 'voice-1'),
      },
    });

    const historyDeleteItemsSpy = vi.spyOn(useHistoryStore.getState(), 'deleteItems');
    const audioDeleteSpy = vi
      .spyOn(useAudioHistoryStore.getState(), 'deleteAudioItemOnly')
      .mockResolvedValue(undefined);

    await conversationOrchestrator.deleteHistoryItems(['conv-1', 'voice-1']);

    expect(historyDeleteItemsSpy).toHaveBeenCalledTimes(1);
    expect(historyDeleteItemsSpy).toHaveBeenCalledWith(['conv-1', 'voice-1']);
    expect(audioDeleteSpy).toHaveBeenCalledTimes(1);
    expect(audioDeleteSpy).toHaveBeenCalledWith('voice-1');
    expect(
      useConversationsStore.getState().conversations.find((c) => c.id === 'conv-1')
    ).toBeUndefined();
    expect(useRelayStore.getState().bundles.b1.items[0].sourceId).toBe('');
    expect(useRelayStore.getState().bundles.b2.items[0].sourceId).toBe('');
  });

  it('清空历史：所有会话、音频与接力标记按各自记录执行一次', async () => {
    seedConversation('conv-1');
    useHistoryStore.setState({
      items: [chatHistoryItem('conv-1'), voiceHistoryItem('voice-1')],
    });
    useAudioHistoryStore.setState({ items: [audioItem('voice-1')] });
    useRelayStore.setState({
      bundles: {
        b1: relayBundle('b1', 'conv-1'),
        b2: relayBundle('b2', 'voice-1'),
      },
    });

    const historyClearSpy = vi.spyOn(useHistoryStore.getState(), 'clearHistory');
    const audioDeleteSpy = vi
      .spyOn(useAudioHistoryStore.getState(), 'deleteAudioItemOnly')
      .mockResolvedValue(undefined);

    await conversationOrchestrator.clearHistory();

    expect(historyClearSpy).toHaveBeenCalledTimes(1);
    expect(audioDeleteSpy).toHaveBeenCalledTimes(1);
    expect(audioDeleteSpy).toHaveBeenCalledWith('voice-1');
    // 当前会话被删且无同模式候选：自动转入新建草稿，原会话不残留
    expect(
      useConversationsStore.getState().conversations.find((c) => c.id === 'conv-1')
    ).toBeUndefined();
    expect(useConversationsStore.getState().currentConversationId).not.toBeNull();
    expect(useRelayStore.getState().bundles.b1.items[0].sourceId).toBe('');
    expect(useRelayStore.getState().bundles.b2.items[0].sourceId).toBe('');
  });

  it('删除非当前会话：当前会话指针与运行时消息保持不变', () => {
    const store = useConversationsStore.getState();
    const keepId = store.createConversation('xunfei', 'lite');
    const removeId = store.createConversation('xunfei', 'lite');

    useChatStore.setState({
      activeConversationId: keepId,
      messages: [{ id: 'm1', role: 'user', content: '保留消息' }],
      isLoading: false,
    });
    useConversationsStore.setState({ currentConversationId: keepId });

    conversationOrchestrator.deleteConversation(removeId);

    expect(useConversationsStore.getState().currentConversationId).toBe(keepId);
    expect(useChatStore.getState().activeConversationId).toBe(keepId);
    expect(useChatStore.getState().messages[0]?.content).toBe('保留消息');
  });

  it('删除正在生成回复的会话：先停止流收尾，再执行删除', () => {
    seedConversation('conv-1');
    useChatStore.setState({ activeConversationId: 'conv-1', isLoading: true });

    const order: string[] = [];
    const stopSpy = vi
      .spyOn(useChatStore.getState(), 'stop')
      .mockImplementation(() => void order.push('stop'));
    const historyDeleteSpy = vi
      .spyOn(useHistoryStore.getState(), 'deleteItem')
      .mockImplementation(() => void order.push('delete'));

    conversationOrchestrator.deleteConversation('conv-1');

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['stop', 'delete']);
  });

  it('音频库删一条语音：音频详情与统一历史摘要同步删除', async () => {
    const serviceDeleteSpy = vi.fn().mockResolvedValue(undefined);
    useAudioHistoryStore.setState({
      items: [audioItem('voice-1')],
      service: {
        deleteItem: serviceDeleteSpy,
        getStatistics: vi.fn().mockResolvedValue(null),
      } as never,
      isInitialized: true,
    });
    useHistoryStore.setState({ items: [voiceHistoryItem('voice-1')] });
    useRelayStore.setState({ bundles: { b1: relayBundle('b1', 'voice-1') } });

    const historyDeleteSpy = vi.spyOn(useHistoryStore.getState(), 'deleteItem');

    await conversationOrchestrator.deleteAudioItems(['voice-1']);

    expect(serviceDeleteSpy).toHaveBeenCalledTimes(1);
    expect(historyDeleteSpy).toHaveBeenCalledTimes(1);
    expect(useHistoryStore.getState().items.find((item) => item.id === 'voice-1')).toBeUndefined();
    expect(useRelayStore.getState().bundles.b1.items[0].sourceId).toBe('');
  });

  it('对已删除的会话重复调用删除命令：可观察状态不产生第二次变化（幂等）', () => {
    seedConversation('conv-1');
    useHistoryStore.setState({ items: [chatHistoryItem('conv-1')] });
    useRelayStore.setState({ bundles: { b1: relayBundle('b1', 'conv-1') } });

    conversationOrchestrator.deleteConversation('conv-1');
    const afterFirstDelete = {
      conversations: useConversationsStore.getState().conversations,
      historyItems: useHistoryStore.getState().items,
      sourceId: useRelayStore.getState().bundles.b1.items[0].sourceId,
    };
    expect(afterFirstDelete.conversations.some((item) => item.id === 'conv-1')).toBe(false);
    expect(afterFirstDelete.historyItems).toHaveLength(0);
    expect(afterFirstDelete.sourceId).toBe('');

    // 再次删除同一 id：会话、历史与接力包均不应出现新的删除/标记副作用
    conversationOrchestrator.deleteConversation('conv-1');

    expect(useConversationsStore.getState().conversations).toEqual(afterFirstDelete.conversations);
    expect(useHistoryStore.getState().items).toEqual(afterFirstDelete.historyItems);
    expect(useRelayStore.getState().bundles.b1.items[0].sourceId).toBe(afterFirstDelete.sourceId);
  });
});
