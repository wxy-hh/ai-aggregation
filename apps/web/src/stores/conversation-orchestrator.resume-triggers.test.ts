import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { conversationOrchestrator } from './conversation-orchestrator';
import { useChatStore } from './chat-store';
import { useConversationsStore } from './conversations-store';
import type { Message } from '@/types/chat-message';

/**
 * 触发源回归覆盖（ADR-0061 / 工单 04）：网络恢复与回到前台时自动重试待挂载运行。
 *
 * 接缝：公共入口 conversationOrchestrator.initialize() 绑定真实 DOM 事件监听，
 * 派发真实 online / visibilitychange 事件，断言 chat store 的 resumePendingRuns 被调用。
 * 本文件独立成文件以获得干净的模块实例（resumeTriggersBound 模块级标志初始为 false），
 * 不为测试暴露私有函数、不引入依赖注入、不重构 orchestrator。
 *
 * store 方法用 setState 直接替换而非 vi.spyOn：zustand 的 setState 会复制方法引用，
 * spyOn + restoreAllMocks 会让被复制的 spy 跨测试累积，导致调用次数虚高。
 */

/** happy-dom 下 visibilityState 为只读 getter，按需覆盖 */
const setVisibility = (state: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
};

const originalResumePendingRuns = useChatStore.getState().resumePendingRuns;
const originalAttachAgentRun = useChatStore.getState().attachAgentRun;

describe('会话编排：网络恢复与回到前台自动挂载待运行（ADR-0061）', () => {
  beforeAll(() => {
    // 无当前会话时 initialize() 只绑定触发器、不做运行时恢复，避免真实网络请求
    useConversationsStore.setState({
      conversations: [],
      currentConversationId: null,
      mode: 'single',
      lastActiveSingleId: null,
      lastActiveCompareId: null,
      isLoaded: true,
    });
    conversationOrchestrator.initialize();
  });

  beforeEach(() => {
    setVisibility('visible');
    // 每个用例重置为原始方法引用，避免上一用例替换的 mock 被 setState 复制后累积
    useChatStore.setState({
      messages: [],
      resumePendingRuns: originalResumePendingRuns,
      attachAgentRun: originalAttachAgentRun,
    });
  });

  it('online 事件触发 resumePendingRuns', () => {
    const resumeMock = vi.fn();
    useChatStore.setState({ resumePendingRuns: resumeMock });

    window.dispatchEvent(new Event('online'));

    expect(resumeMock).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange 转前台触发 resumePendingRuns', () => {
    const resumeMock = vi.fn();
    useChatStore.setState({ resumePendingRuns: resumeMock });
    setVisibility('visible');

    document.dispatchEvent(new Event('visibilitychange'));

    expect(resumeMock).toHaveBeenCalledTimes(1);
  });

  it('转后台不触发 resumePendingRuns', () => {
    const resumeMock = vi.fn();
    useChatStore.setState({ resumePendingRuns: resumeMock });
    setVisibility('hidden');

    document.dispatchEvent(new Event('visibilitychange'));

    expect(resumeMock).toHaveBeenCalledTimes(0);
  });

  it('待挂载消息在 online 时被 attachAgentRun 携带 runId 与消息 id', () => {
    const pending: Message = {
      id: 'msg-pending',
      role: 'assistant',
      content: '半截内容',
      isStreaming: true,
      runId: 'run-pending',
      runPending: true,
    };
    const attachMock = vi.fn();
    useChatStore.setState({
      messages: [pending],
      resumePendingRuns: originalResumePendingRuns,
      attachAgentRun: attachMock,
    });

    window.dispatchEvent(new Event('online'));

    expect(attachMock).toHaveBeenCalledTimes(1);
    expect(attachMock).toHaveBeenCalledWith('run-pending', 'msg-pending');
  });
});
