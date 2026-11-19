/**
 * session-state-sync.test.ts —— 关联状态同步命令测试
 *
 * 锁定的外部行为（ADR-0046 / 工单 03）：
 * 1. 切模型、选能力包后运行时与会话绑定同时更新；
 * 2. 没有当前会话时只更新运行时，不凭空创建会话；
 * 3. 发送前保证命令按需创建并加载一次；
 * 4. 新建会话不继承上一会话的工具覆盖与能力包。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { conversationOrchestrator } from './conversation-orchestrator';
import { useConversationsStore } from './conversations-store';
import { useChatStore } from './chat-store';

// zustand 每次 set 都会创建新 state 对象，spy 会被复制；每个用例前复位原始实现
const ORIGINAL_LOAD_CONVERSATION = useChatStore.getState().loadConversation;

const resetStores = () => {
  useChatStore.setState({ loadConversation: ORIGINAL_LOAD_CONVERSATION });
  useChatStore.getState().reset();
  useConversationsStore.setState({
    conversations: [],
    currentConversationId: null,
    mode: 'single',
    lastActiveSingleId: null,
    lastActiveCompareId: null,
    isLoaded: true,
  });
};

describe('关联状态同步命令', () => {
  beforeEach(() => {
    resetStores();
  });

  it('更新会话模型一次：运行时模型与会话绑定同时更新', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');

    conversationOrchestrator.updateSessionModel('doubao', 'doubao-seed-evolving');

    expect(useChatStore.getState().provider).toBe('doubao');
    expect(useChatStore.getState().model).toBe('doubao-seed-evolving');
    const conv = useConversationsStore
      .getState()
      .conversations.find((item) => item.id === id);
    expect(conv?.provider).toBe('doubao');
    expect(conv?.model).toBe('doubao-seed-evolving');
  });

  it('更新能力包一次：运行时能力包与会话绑定同时更新', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');

    conversationOrchestrator.updateSessionCapabilityPack('deep-research');

    expect(useChatStore.getState().activeCapabilityPackKey).toBe('deep-research');
    const conv = useConversationsStore
      .getState()
      .conversations.find((item) => item.id === id);
    expect(conv?.capabilityPack).toBe('deep-research');
  });

  it('没有当前会话时更新能力包：只更新运行时，不创建会话', () => {
    conversationOrchestrator.updateSessionCapabilityPack('deep-research');

    expect(useChatStore.getState().activeCapabilityPackKey).toBe('deep-research');
    expect(useConversationsStore.getState().conversations).toHaveLength(0);
    expect(useConversationsStore.getState().currentConversationId).toBeNull();
  });

  it('发送前保证：当前单聊会话存在时不创建、不重复加载', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');
    const loadSpy = vi.spyOn(useChatStore.getState(), 'loadConversation');

    const ensuredId = conversationOrchestrator.ensureActiveConversation();

    expect(ensuredId).toBe(id);
    expect(loadSpy).not.toHaveBeenCalled();
    expect(useConversationsStore.getState().conversations).toHaveLength(1);
    expect(useConversationsStore.getState().currentConversationId).toBe(id);
  });

  it('发送前保证：当前会话不存在时创建并加载一次', () => {
    const loadSpy = vi.spyOn(useChatStore.getState(), 'loadConversation');

    const ensuredId = conversationOrchestrator.ensureActiveConversation();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(ensuredId).not.toBeNull();
    expect(useConversationsStore.getState().currentConversationId).toBe(ensuredId);
    expect(useChatStore.getState().activeConversationId).toBe(ensuredId);
  });

  it('发送前保证：当前是对比会话时新建单聊会话承载发送', () => {
    const compareId = useConversationsStore
      .getState()
      .createComparisonConversation([], '测试对比');

    const ensuredId = conversationOrchestrator.ensureActiveConversation();

    expect(ensuredId).not.toBe(compareId);
    const conv = useConversationsStore
      .getState()
      .conversations.find((item) => item.id === ensuredId);
    expect(conv?.mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).toBe(ensuredId);
  });

  it('新建会话不继承上一会话的工具覆盖与能力包', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');
    useConversationsStore.getState().updateConversationToolOverrides(id, { web_fetch: false });
    useConversationsStore.getState().updateConversationCapabilityPack(id, 'deep-research');
    useConversationsStore.getState().updateMessages(id, [
      { id: 'm1', role: 'user', content: '已有内容' },
    ]);
    conversationOrchestrator.switchConversation(id);

    conversationOrchestrator.startNewSession('single');

    expect(useChatStore.getState().toolOverrides).toEqual({});
    expect(useChatStore.getState().activeCapabilityPackKey).toBeNull();
    const current = useConversationsStore.getState().getCurrentConversation();
    expect(current?.toolOverrides).toBeUndefined();
    expect(current?.capabilityPack).toBeUndefined();
  });
});
