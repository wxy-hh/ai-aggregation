/**
 * hydration-recovery.test.ts —— 刷新恢复统一入口测试
 *
 * 锁定的外部行为（ADR-0046 / 工单 05）：
 * 1. 初始化一次恢复上次打开的单聊会话运行时；
 * 2. 初始化一次恢复上次打开的对比会话与轮次；
 * 3. 残留流式消息标记为已停止、无内容草稿被过滤；
 * 4. 水合回调只设置加载完成标记，不直接调用运行时。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { conversationOrchestrator } from './conversation-orchestrator';
import { useConversationsStore } from './conversations-store';
import { useChatStore } from './chat-store';
import { useComparisonStore } from './comparison-store';

const ORIGINAL_LOAD_CONVERSATION = useChatStore.getState().loadConversation;

const resetStores = () => {
  useChatStore.setState({ loadConversation: ORIGINAL_LOAD_CONVERSATION });
  useChatStore.getState().reset();
  useComparisonStore.getState().reset();
  useConversationsStore.setState({
    conversations: [],
    currentConversationId: null,
    mode: 'single',
    lastActiveSingleId: null,
    lastActiveCompareId: null,
    isLoaded: false,
  });
};

describe('水合恢复统一入口', () => {
  beforeEach(() => {
    resetStores();
  });

  it('初始化一次恢复上次打开的单聊会话运行时', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');
    useConversationsStore.getState().updateMessages(id, [
      { id: 'm1', role: 'user', content: '上次的问题' },
      { id: 'm2', role: 'assistant', content: '上次的回答' },
    ]);
    useConversationsStore.setState({ isLoaded: true });

    conversationOrchestrator.initialize();

    expect(useChatStore.getState().activeConversationId).toBe(id);
    expect(useChatStore.getState().messages.map((m) => m.content)).toEqual([
      '上次的问题',
      '上次的回答',
    ]);
  });

  it('初始化一次恢复上次打开的对比会话与轮次', () => {
    const compareId = useConversationsStore
      .getState()
      .createComparisonConversation(
        [
          {
            provider: 'xunfei',
            model: 'lite',
            providerLabel: '讯飞星火',
            label: '讯飞星火 · Spark Lite',
          },
        ],
        '上次的对比'
      );
    useConversationsStore.getState().updateComparisonTurns(compareId, [
      {
        prompt: '对比问题',
        runs: {},
      } as never,
    ]);
    useConversationsStore.setState({ mode: 'compare', isLoaded: true });

    conversationOrchestrator.initialize();

    expect(useComparisonStore.getState().activeComparisonId).toBe(compareId);
    expect(useComparisonStore.getState().turns).toHaveLength(1);
  });

  it('残留流式消息被标记为已停止，无内容草稿被过滤', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');
    useConversationsStore.getState().updateMessages(id, [
      { id: 'm1', role: 'user', content: '问题' },
      { id: 'm2', role: 'assistant', content: '', isStreaming: true },
      { id: 'm3', role: 'assistant', content: '已流出的部分', isStreaming: true },
    ]);
    useConversationsStore.setState({ isLoaded: true });

    conversationOrchestrator.initialize();

    const messages = useChatStore.getState().messages;
    expect(messages.some((m) => m.id === 'm2')).toBe(false);
    const streamed = messages.find((m) => m.id === 'm3');
    expect(streamed?.isStreaming).toBe(false);
    expect(streamed?.stopped).toBe(true);
    expect(streamed?.content).toBe('已流出的部分');
  });

  it('水合回调只设置加载完成标记，不直接调用运行时', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'src/stores/conversations-store.ts'),
      'utf8'
    );
    const start = source.indexOf('onRehydrateStorage');
    const end = source.indexOf('        }', start);
    const hydrationCallback = source.slice(start, end);

    expect(hydrationCallback).toContain('setIsLoaded');
    expect(hydrationCallback).not.toContain('loadConversation');
    expect(hydrationCallback).not.toContain('loadComparison');
  });

  it('初始化不会重复加载同一会话：水合完成后只执行一次恢复', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');
    useConversationsStore.setState({ isLoaded: true });
    const loadSpy = vi.spyOn(useChatStore.getState(), 'loadConversation');

    conversationOrchestrator.initializeOnce();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().activeConversationId).toBe(id);
  });
});
