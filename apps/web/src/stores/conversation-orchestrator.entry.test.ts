import { beforeEach, describe, expect, it } from 'vitest';

import { conversationOrchestrator } from './conversation-orchestrator';
import { useChatStore } from './chat-store';
import { useComparisonStore } from './comparison-store';
import { useConversationsStore } from './conversations-store';
import { useHistoryStore } from './history-store';
import { useSettingsStore } from './settings-store';
import type { ChatHistoryItem, VoiceHistoryItem } from '@/types/history';

/** 构造一条 chat 历史记录 */
const createChatHistoryItem = (id: string): ChatHistoryItem => ({
  id,
  type: 'chat',
  title: '历史会话',
  preview: '历史内容',
  model: 'lite',
  provider: 'xunfei',
  messages: [{ role: 'user', content: '历史内容' }],
  date: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
});

/** 构造一条 voice 历史记录（非对话类型） */
const createVoiceHistoryItem = (id: string): VoiceHistoryItem => ({
  id,
  type: 'voice',
  title: '语音记录',
  preview: '语音',
  duration: '00:10',
  model: 'rtasr',
  fileName: 'a.wav',
  fileSize: 1024,
  transcription: '内容',
  date: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
});

describe('对话页面入口命令', () => {
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
    useHistoryStore.setState({ items: [] });
    useSettingsStore.setState({ agentModeEnabled: false });
    window.history.replaceState({}, '', '/chat');
  });

  it('?new=true 新建并激活单聊会话', () => {
    conversationOrchestrator.enterChatFromUrl('?new=true');

    const state = useConversationsStore.getState();
    expect(state.conversations).toHaveLength(1);
    expect(state.currentConversationId).toBe(state.conversations[0].id);
    expect(state.mode).toBe('single');
  });

  it('?historyId= 恢复历史会话正文', () => {
    useHistoryStore.getState().addItem(createChatHistoryItem('h-1'));

    conversationOrchestrator.enterChatFromUrl('?historyId=h-1');

    const state = useConversationsStore.getState();
    expect(state.getCurrentConversation()?.messages.map((message) => message.content)).toEqual([
      '历史内容',
    ]);
    expect(state.mode).toBe('single');
  });

  it('?comparisonId= 打开对比会话', () => {
    const compareId = useConversationsStore
      .getState()
      .createComparisonConversation([], '对比测试');
    useConversationsStore.setState({ currentConversationId: null, mode: 'single' });

    conversationOrchestrator.enterChatFromUrl(`?comparisonId=${compareId}`);

    const state = useConversationsStore.getState();
    expect(state.currentConversationId).toBe(compareId);
    expect(state.mode).toBe('compare');
  });

  it('同时带 comparisonId 与 historyId 时打开对比会话且不新增会话', () => {
    useHistoryStore.getState().addItem(createChatHistoryItem('h-1'));
    const compareId = useConversationsStore
      .getState()
      .createComparisonConversation([], '对比测试');
    const beforeCount = useConversationsStore.getState().conversations.length;

    conversationOrchestrator.enterChatFromUrl(
      `?comparisonId=${compareId}&historyId=h-1`
    );

    const state = useConversationsStore.getState();
    expect(state.currentConversationId).toBe(compareId);
    expect(state.conversations).toHaveLength(beforeCount);
  });

  it('同时带 historyId 与 new 时打开历史会话而非新建草稿', () => {
    useHistoryStore.getState().addItem(createChatHistoryItem('h-1'));

    conversationOrchestrator.enterChatFromUrl('?historyId=h-1&new=true');

    const state = useConversationsStore.getState();
    expect(state.conversations).toHaveLength(1);
    expect(state.getCurrentConversation()?.messages[0]?.content).toBe('历史内容');
  });

  it('?new=true 携带能力包与 agent 参数时同步绑定', () => {
    conversationOrchestrator.enterChatFromUrl('?new=true&pack=deep-research&agent=true');

    const current = useConversationsStore.getState().getCurrentConversation();
    expect(current?.capabilityPack).toBe('deep-research');
    expect(useSettingsStore.getState().agentModeEnabled).toBe(true);
  });

  it('?new=true 携带 goal 时返回草稿预填文本', () => {
    expect(
      conversationOrchestrator.enterChatFromUrl(
        '?new=true&goal=%E7%9B%AE%E6%A0%87'
      )
    ).toEqual({ draftText: '目标' });
  });

  it('不带 new 时 pack 参数不改变当前会话', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');

    conversationOrchestrator.enterChatFromUrl('?pack=deep-research');

    const state = useConversationsStore.getState();
    expect(state.currentConversationId).toBe(id);
    expect(state.getCurrentConversation()?.capabilityPack).toBeUndefined();
  });

  it('无参数、无当前指针时恢复首个单聊会话', () => {
    useConversationsStore.getState().createConversation('xunfei', 'lite');
    const firstSingleId = useConversationsStore.getState().createConversation('xunfei', 'lite');
    useConversationsStore.setState({ currentConversationId: null, mode: 'single' });

    conversationOrchestrator.enterChatFromUrl('');

    expect(useConversationsStore.getState().currentConversationId).toBe(firstSingleId);
  });

  it('无参数且已有当前指针时保持当前会话', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');

    conversationOrchestrator.enterChatFromUrl('');

    expect(useConversationsStore.getState().currentConversationId).toBe(id);
  });

  it('执行后只删除入口参数并保留 relayId 与 prompt', () => {
    window.history.replaceState(
      {},
      '',
      '/chat?new=true&goal=x&relayId=r-1&prompt=p-1'
    );

    conversationOrchestrator.enterChatFromUrl(window.location.search);

    const search = window.location.search;
    expect(search).toContain('relayId=r-1');
    expect(search).toContain('prompt=p-1');
    expect(search).not.toContain('new=');
    expect(search).not.toContain('goal=');
  });

  it('historyId 指向不存在的记录时静默忽略', () => {
    expect(() => conversationOrchestrator.enterChatFromUrl('?historyId=missing')).not.toThrow();

    const state = useConversationsStore.getState();
    expect(state.conversations).toHaveLength(0);
    expect(state.currentConversationId).toBeNull();
  });

  it('historyId 指向非对话记录时静默忽略', () => {
    useHistoryStore.getState().addItem(createVoiceHistoryItem('voice-1'));

    conversationOrchestrator.enterChatFromUrl('?historyId=voice-1');

    const state = useConversationsStore.getState();
    expect(state.conversations).toHaveLength(0);
    expect(state.currentConversationId).toBeNull();
  });

  it('外部唤起对比会话后仍可切回单聊会话', () => {
    const compareId = useConversationsStore
      .getState()
      .createComparisonConversation([], '对比测试');
    useConversationsStore.setState({ currentConversationId: null, mode: 'single' });
    const singleId = useConversationsStore.getState().createConversation('xunfei', 'lite');

    conversationOrchestrator.enterChatFromUrl(`?comparisonId=${compareId}`);
    conversationOrchestrator.switchConversation(singleId);

    const state = useConversationsStore.getState();
    expect(state.currentConversationId).toBe(singleId);
    expect(state.mode).toBe('single');
  });
});
