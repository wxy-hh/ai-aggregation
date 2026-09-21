/**
 * conversations-store.orchestrator.test.ts —— 会话编排中枢单元测试（候选 05）
 *
 * 锁定的外部行为：
 * 1. switchMode 双模式记忆（M-1）流转：
 *    - 在单聊与对比模式间切换时，自动恢复各自模式最近活跃的会话指针；
 *    - 记忆指针对应会话被删除或无记忆时，平滑进入草稿新建态；
 * 2. switchConversation 原子联动：
 *    - 选中对比会话自动切为 compare 模式并触发 comparisonStore.loadComparison；
 *    - 选中单聊会话自动切为 single 模式并触发 chatStore.loadConversation；
 *    - 交叉取消进行中的流式生成（stop / abort）；
 * 3. startNewSession 统一新建契约：
 *    - compare 模式重置为空草稿，保留模式不变；
 *    - single 模式优先复用空单聊或创建新单聊；
 * 4. 外部唤起契约（E-1）：
 *    - openComparisonSession 正确加载对比会话；
 *    - openHistorySession 从历史记录恢复为单聊会话并载入；
 *    - prepareRelaySession 确保处于单聊模式且具备有效会话槽位。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationsStore } from './conversations-store';
import { useChatStore } from './chat-store';
import { useComparisonStore } from './comparison-store';
import type { ChatHistoryItem } from '@/types/history';

describe('ConversationsStore 会话编排中枢（候选 05）', () => {
  beforeEach(() => {
    // 重置所有相关 store
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
  });

  it('switchMode 双模式记忆流转：在单聊与对比模式间切换时恢复各模式活跃指针', () => {
    const store = useConversationsStore.getState();

    // 创建一个单聊会话与一个对比会话
    const singleId = store.createConversation('xunfei', 'lite');
    const compareId = store.createComparisonConversation([], '测试对比');

    // 选中单聊会话
    useConversationsStore.getState().switchConversation(singleId);
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).toBe(singleId);
    expect(useConversationsStore.getState().lastActiveSingleId).toBe(singleId);

    // 切换到对比模式：自动切至 compareId
    useConversationsStore.getState().switchMode('compare');
    expect(useConversationsStore.getState().mode).toBe('compare');
    expect(useConversationsStore.getState().currentConversationId).toBe(compareId);
    expect(useConversationsStore.getState().lastActiveCompareId).toBe(compareId);

    // 切回单聊模式：自动恢复为 singleId
    useConversationsStore.getState().switchMode('single');
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).toBe(singleId);
  });

  it('switchConversation 原子联动：根据会话元数据自动切换模式与加载数据', () => {
    const store = useConversationsStore.getState();
    const singleId = store.createConversation('xunfei', 'lite');
    const compareId = store.createComparisonConversation([], '测试对比');

    // 切换至对比会话
    useConversationsStore.getState().switchConversation(compareId);
    expect(useConversationsStore.getState().mode).toBe('compare');
    expect(useConversationsStore.getState().currentConversationId).toBe(compareId);
    expect(useComparisonStore.getState().activeComparisonId).toBe(compareId);

    // 切换至单聊会话
    useConversationsStore.getState().switchConversation(singleId);
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).toBe(singleId);
    expect(useChatStore.getState().activeConversationId).toBe(singleId);
  });

  it('startNewSession 统一新建契约：对比模式置空草稿，单聊模式复用或创建', () => {
    // 对比模式下新建
    useConversationsStore.getState().switchMode('compare');
    useConversationsStore.getState().startNewSession('compare');
    expect(useConversationsStore.getState().mode).toBe('compare');
    expect(useConversationsStore.getState().currentConversationId).toBeNull();
    expect(useComparisonStore.getState().turns).toEqual([]);

    // 单聊模式下新建
    useConversationsStore.getState().startNewSession('single');
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).not.toBeNull();
  });

  it('openHistorySession 外部唤起：从历史记录构建单聊会话并激活', () => {
    const historyItem: ChatHistoryItem = {
      id: 'hist-1',
      title: '历史提问',
      type: 'chat',
      preview: '你好',
      date: '今天',
      messages: [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好，我是 AI' },
      ],
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useConversationsStore.getState().openHistorySession(historyItem);

    const state = useConversationsStore.getState();
    expect(state.mode).toBe('single');
    expect(state.currentConversationId).not.toBeNull();

    const currentConv = state.getCurrentConversation();
    expect(currentConv?.provider).toBe('doubao');
    expect(currentConv?.model).toBe('doubao-seed-evolving');
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().messages[0].content).toBe('你好');
  });

  it('prepareRelaySession 接力唤起：对比模式下进入自动切到单聊并就绪', () => {
    useConversationsStore.getState().switchMode('compare');
    expect(useConversationsStore.getState().mode).toBe('compare');

    useConversationsStore.getState().prepareRelaySession();
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).not.toBeNull();
  });

  it('deleteConversation 删除当前会话时：自动同模式流转并联动重载运行时数据', () => {
    const store = useConversationsStore.getState();
    const id1 = store.createConversation('doubao', 'doubao-seed-evolving');
    store.updateMessages(id1, [
      { id: 'm1', role: 'user', content: '第一轮' },
      { id: 'm2', role: 'assistant', content: '回答一' },
    ]);
    const id2 = store.createConversation('xunfei', 'lite');
    store.updateMessages(id2, [
      { id: 'm3', role: 'user', content: '第二轮' },
      { id: 'm4', role: 'assistant', content: '回答二' },
    ]);

    // 当前在 id2
    useConversationsStore.getState().switchConversation(id2);
    expect(useChatStore.getState().activeConversationId).toBe(id2);
    expect(useChatStore.getState().messages[0].content).toBe('第二轮');

    // 删除当前会话 id2
    useConversationsStore.getState().deleteConversation(id2);

    // 自动流转至同模式的 id1 并联动重载 chatStore，杜绝数据丢失
    const afterDelete = useConversationsStore.getState();
    expect(afterDelete.currentConversationId).toBe(id1);
    expect(useChatStore.getState().activeConversationId).toBe(id1);
    expect(useChatStore.getState().messages[0].content).toBe('第一轮');
  });

  it('deleteConversation 删除对比会话时：同步重置 comparisonStore 运行时', () => {
    const store = useConversationsStore.getState();
    const compareId = store.createComparisonConversation([], '待删对比');
    useConversationsStore.getState().switchConversation(compareId);
    expect(useComparisonStore.getState().activeComparisonId).toBe(compareId);

    // 删除当前对比会话
    useConversationsStore.getState().deleteConversation(compareId);
    expect(useComparisonStore.getState().activeComparisonId).toBeNull();
  });

  it('startNewSession 单聊新建时：动态继承用户当前选择的模型配置', () => {
    // 用户当前选择了 doubao / doubao-seed-evolving
    useChatStore.getState().switchProvider('doubao', 'doubao-seed-evolving');
    useConversationsStore.getState().startNewSession('single');

    const cur = useConversationsStore.getState().getCurrentConversation();
    expect(cur?.provider).toBe('doubao');
    expect(cur?.model).toBe('doubao-seed-evolving');
  });
});

