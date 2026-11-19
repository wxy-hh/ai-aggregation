/**
 * conversation-orchestrator.test.ts —— 会话编排模块测试
 *
 * 锁定的外部行为：
 * 1. switchMode 双模式记忆（M-1）流转；
 * 2. switchConversation 原子联动与交叉流中止；
 * 3. startNewSession 统一新建契约；
 * 4. 外部唤起契约（E-1）；
 * 5. 删除当前会话后的同模式流转；
 * 6. 一个动作只产生一次加载/停止副作用。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conversationOrchestrator } from './conversation-orchestrator';
import { useConversationsStore } from './conversations-store';
import { useChatStore } from './chat-store';
import { useComparisonStore } from './comparison-store';
import type { ChatHistoryItem } from '@/types/history';
import type { AgentPlan } from '@repo/shared';
import type { MessageApproval } from '@/lib/agent/approval-display';
import type { Artifact } from '@repo/shared';

const mocks = vi.hoisted(() => ({
  mockDeleteConversations: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/lib/api/conversations', () => ({
  deleteConversations: mocks.mockDeleteConversations,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.mockToastError,
  },
}));

describe('会话编排模块', () => {
  beforeEach(() => {
    mocks.mockDeleteConversations.mockReset();
    mocks.mockToastError.mockReset();
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

    const singleId = store.createConversation('xunfei', 'lite');
    const compareId = store.createComparisonConversation([], '测试对比');

    conversationOrchestrator.switchConversation(singleId);
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).toBe(singleId);
    expect(useConversationsStore.getState().lastActiveSingleId).toBe(singleId);

    conversationOrchestrator.switchMode('compare');
    expect(useConversationsStore.getState().mode).toBe('compare');
    expect(useConversationsStore.getState().currentConversationId).toBe(compareId);
    expect(useConversationsStore.getState().lastActiveCompareId).toBe(compareId);

    conversationOrchestrator.switchMode('single');
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).toBe(singleId);
  });

  it('switchMode 模式切换保持单聊产物池与工作台状态（切对比再切回单聊不丢失工作台）', () => {
    const store = useConversationsStore.getState();
    const singleId = store.createConversation('xunfei', 'lite');
    const compareId = store.createComparisonConversation([], '测试对比');

    const mockArtifact: Artifact = {
      id: 'art-1',
      title: '季度述职汇报',
      type: 'markdown',
      content: '# 季度述职汇报大纲',
      status: 'complete',
    };

    conversationOrchestrator.switchConversation(singleId);
    useChatStore.setState({
      activeConversationId: singleId,
      artifacts: [mockArtifact],
      activeArtifactId: 'art-1',
      isWorkspaceOpen: true,
    });
    useConversationsStore.getState().updateMessages(singleId, [], [mockArtifact]);

    expect(useChatStore.getState().artifacts).toHaveLength(1);
    expect(useChatStore.getState().isWorkspaceOpen).toBe(true);

    conversationOrchestrator.switchMode('compare');
    expect(useConversationsStore.getState().mode).toBe('compare');
    expect(useConversationsStore.getState().currentConversationId).toBe(compareId);

    conversationOrchestrator.switchMode('single');
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).toBe(singleId);

    const restoredChat = useChatStore.getState();
    expect(restoredChat.artifacts).toHaveLength(1);
    expect(restoredChat.artifacts[0].id).toBe('art-1');
    expect(restoredChat.isWorkspaceOpen).toBe(false);
    expect(restoredChat.activeArtifactId).toBe('art-1');
  });

  it('switchMode 切到对比模式：中断进行中的单聊流式生成并按「有留空删」收尾保留', () => {
    const store = useConversationsStore.getState();
    const singleId = store.createConversation('xunfei', 'lite');
    conversationOrchestrator.switchConversation(singleId);

    useChatStore.setState({
      isLoading: true,
      activeConversationId: singleId,
      messages: [
        { id: 'u1', role: 'user', content: '问题' },
        {
          id: 'a1',
          role: 'assistant',
          content: '',
          reasoningContent: '已流出的推理',
          isStreaming: true,
        },
      ],
    });

    conversationOrchestrator.switchMode('compare');

    const chat = useChatStore.getState();
    expect(chat.isLoading).toBe(false);
    const a1 = chat.messages.find((m) => m.id === 'a1');
    expect(a1?.stopped).toBe(true);
    expect(a1?.reasoningContent).toBe('已流出的推理');
  });

  it('switchMode 切到单聊模式：对称中断进行中的对比页流式生成', () => {
    conversationOrchestrator.switchMode('compare');
    const compareId = useConversationsStore.getState().createComparisonConversation(
      [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite',
        },
      ],
      '测试对比'
    );
    conversationOrchestrator.switchConversation(compareId);
    expect(useConversationsStore.getState().mode).toBe('compare');

    const stopModelSpy = vi.spyOn(useComparisonStore.getState(), 'stopModel');
    conversationOrchestrator.switchMode('single');

    expect(stopModelSpy).toHaveBeenCalledWith('xunfei:lite');
    expect(useConversationsStore.getState().mode).toBe('single');
    stopModelSpy.mockRestore();
  });

  it('switchConversation 原子联动：根据会话元数据自动切换模式与加载数据', () => {
    const store = useConversationsStore.getState();
    const singleId = store.createConversation('xunfei', 'lite');
    const compareId = store.createComparisonConversation([], '测试对比');

    conversationOrchestrator.switchConversation(compareId);
    expect(useConversationsStore.getState().mode).toBe('compare');
    expect(useConversationsStore.getState().currentConversationId).toBe(compareId);
    expect(useComparisonStore.getState().activeComparisonId).toBe(compareId);

    conversationOrchestrator.switchConversation(singleId);
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).toBe(singleId);
    expect(useChatStore.getState().activeConversationId).toBe(singleId);
  });

  it('switchConversation 只加载一次目标会话运行时', () => {
    const store = useConversationsStore.getState();
    const firstId = store.createConversation('xunfei', 'lite');
    const secondId = store.createConversation('xunfei', 'lite');

    conversationOrchestrator.switchConversation(firstId);
    const loadSpy = vi.spyOn(useChatStore.getState(), 'loadConversation');

    conversationOrchestrator.switchConversation(secondId);

    expect(loadSpy).toHaveBeenCalledTimes(1);
    loadSpy.mockRestore();
  });

  it('startNewSession 统一新建契约：对比模式置空草稿，单聊模式复用或创建', () => {
    conversationOrchestrator.switchMode('compare');
    conversationOrchestrator.startNewSession('compare');
    expect(useConversationsStore.getState().mode).toBe('compare');
    expect(useConversationsStore.getState().currentConversationId).toBeNull();
    expect(useComparisonStore.getState().turns).toEqual([]);

    conversationOrchestrator.startNewSession('single');
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

    conversationOrchestrator.openHistorySession(historyItem);

    const state = useConversationsStore.getState();
    expect(state.mode).toBe('single');
    expect(state.currentConversationId).not.toBeNull();

    const currentConv = state.getCurrentConversation();
    expect(currentConv?.provider).toBe('doubao');
    expect(currentConv?.model).toBe('doubao-seed-evolving');
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().messages[0].content).toBe('你好');
  });

  it('openHistorySession 保留 agent 工具记录与工具产出附件（B-10）', () => {
    const historyItem: ChatHistoryItem = {
      id: 'hist-2',
      title: 'agent 历史',
      type: 'chat',
      preview: '画一张猫',
      date: '今天',
      messages: [
        { role: 'user', content: '画一张猫' },
        {
          role: 'assistant',
          content: '已经为你画好啦。',
          toolCalls: [
            {
              id: 'call_1',
              name: 'image_generate',
              argsSummary: '{"prompt":"一只猫"}',
              status: 'success',
              resultSummary: '已生成图片',
            },
          ],
          attachments: [
            {
              id: 'tool-call_1',
              type: 'image',
              name: '工具生成的图片',
              imageUrl: 'https://cdn.agnes.ai/a.png',
              status: 'ready',
            },
          ],
        },
      ],
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    conversationOrchestrator.openHistorySession(historyItem);

    const restored = useChatStore.getState().messages[1];
    expect(restored.toolCalls).toHaveLength(1);
    expect(restored.toolCalls?.[0]).toMatchObject({ id: 'call_1', name: 'image_generate' });
    expect(restored.attachments?.[0]).toMatchObject({
      id: 'tool-call_1',
      imageUrl: 'https://cdn.agnes.ai/a.png',
    });
  });

  it('openHistorySession 恢复计划与审批，不补造引用与产物关联（双快照）', () => {
    const historyItem: ChatHistoryItem = {
      id: 'hist-3',
      title: '审批历史',
      type: 'chat',
      preview: '写入文件',
      date: '今天',
      messages: [
        { role: 'user', content: '写入文件' },
        {
          role: 'assistant',
          content: '需要确认后写入。',
          plan: { id: 'plan-1', title: '写入计划', steps: [] } as unknown as AgentPlan,
          approval: {
            id: 'approval-1',
            status: 'pending',
            action: 'write_file',
          } as unknown as MessageApproval,
        },
      ],
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    conversationOrchestrator.openHistorySession(historyItem);

    const restored = useChatStore.getState().messages[1];
    expect(restored.plan).toMatchObject({ id: 'plan-1' });
    expect(restored.approval).toMatchObject({ id: 'approval-1' });
    // 归档不保存引用与产物关联，历史唤起时不补造
    expect(restored.citations).toBeUndefined();
    expect(restored.artifactIds).toBeUndefined();
  });

  it('prepareRelaySession 接力唤起：对比模式下进入自动切到单聊并就绪', () => {
    conversationOrchestrator.switchMode('compare');
    expect(useConversationsStore.getState().mode).toBe('compare');

    conversationOrchestrator.prepareRelaySession();
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

    conversationOrchestrator.switchConversation(id2);
    expect(useChatStore.getState().activeConversationId).toBe(id2);
    expect(useChatStore.getState().messages[0].content).toBe('第二轮');

    conversationOrchestrator.deleteConversation(id2);

    const afterDelete = useConversationsStore.getState();
    expect(afterDelete.currentConversationId).toBe(id1);
    expect(useChatStore.getState().activeConversationId).toBe(id1);
    expect(useChatStore.getState().messages[0].content).toBe('第一轮');
  });

  it('deleteConversation 同时请求服务端清理记忆会话', async () => {
    mocks.mockDeleteConversations.mockResolvedValue(1);
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');

    conversationOrchestrator.deleteConversation(id);

    await vi.waitFor(() => {
      expect(mocks.mockDeleteConversations).toHaveBeenCalledWith([id]);
    });
  });

  it('deleteConversation 服务端清理失败时提示中文错误且本地仍删除', async () => {
    mocks.mockDeleteConversations.mockRejectedValue(new Error('network'));
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');

    conversationOrchestrator.deleteConversation(id);

    await vi.waitFor(() => {
      expect(mocks.mockToastError).toHaveBeenCalledWith('服务端记忆清理失败，请重试');
    });
    expect(
      useConversationsStore.getState().conversations.some((conversation) => conversation.id === id)
    ).toBe(false);
  });

  it('deleteConversation 失败后再次触发会重试服务端清理', async () => {
    mocks.mockDeleteConversations
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(1);
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');

    conversationOrchestrator.deleteConversation(id);
    await vi.waitFor(() => {
      expect(mocks.mockToastError).toHaveBeenCalledTimes(1);
    });

    conversationOrchestrator.deleteConversation(id);
    await vi.waitFor(() => {
      expect(mocks.mockDeleteConversations).toHaveBeenCalledTimes(2);
    });
  });

  it('ensureActiveConversation 复用当前会话时同步 chat-store 的 activeConversationId', () => {
    const id = useConversationsStore.getState().createConversation('xunfei', 'lite');
    useChatStore.setState({ activeConversationId: null });

    const resolved = conversationOrchestrator.ensureActiveConversation();

    expect(resolved).toBe(id);
    expect(useChatStore.getState().activeConversationId).toBe(id);
  });

  it('deleteConversation 删除对比会话时：同步重置 comparisonStore 运行时', () => {
    const store = useConversationsStore.getState();
    const compareId = store.createComparisonConversation([], '待删对比');
    conversationOrchestrator.switchConversation(compareId);
    expect(useComparisonStore.getState().activeComparisonId).toBe(compareId);

    conversationOrchestrator.deleteConversation(compareId);
    expect(useComparisonStore.getState().activeComparisonId).toBeNull();
  });

  it('startNewSession 单聊新建时：动态继承用户当前选择的模型配置', () => {
    useChatStore.getState().switchProvider('doubao', 'doubao-seed-evolving');
    conversationOrchestrator.startNewSession('single');

    const cur = useConversationsStore.getState().getCurrentConversation();
    expect(cur?.provider).toBe('doubao');
    expect(cur?.model).toBe('doubao-seed-evolving');
  });

  it('会话工具覆盖隔离与还原：切换会话无损恢复 toolOverrides，新建会话重置（ADR-0014 / 工单 02）', () => {
    const store = useConversationsStore.getState();

    const idA = store.createConversation('doubao', 'doubao-seed-evolving', 'deep-research');
    const idB = store.createConversation('doubao', 'doubao-seed-evolving', 'visual-report');

    store.updateConversationToolOverrides(idA, { web_fetch: false });
    store.updateConversationToolOverrides(idB, { image_generate: false });

    conversationOrchestrator.switchConversation(idA);
    expect(useChatStore.getState().activeConversationId).toBe(idA);
    expect(useChatStore.getState().activeCapabilityPackKey).toBe('deep-research');
    expect(useChatStore.getState().toolOverrides).toEqual({ web_fetch: false });

    conversationOrchestrator.switchConversation(idB);
    expect(useChatStore.getState().activeConversationId).toBe(idB);
    expect(useChatStore.getState().activeCapabilityPackKey).toBe('visual-report');
    expect(useChatStore.getState().toolOverrides).toEqual({ image_generate: false });

    conversationOrchestrator.startNewSession('single');
    expect(useChatStore.getState().toolOverrides).toEqual({});
    expect(useChatStore.getState().activeCapabilityPackKey).toBeNull();
  });
});
