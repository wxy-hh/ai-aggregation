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
import type { Artifact } from '@repo/shared';

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

  it('switchMode 模式切换保持单聊产物池与工作台状态（切对比再切回单聊不丢失工作台）', () => {
    const store = useConversationsStore.getState();
    const singleId = store.createConversation('xunfei', 'lite');
    const compareId = store.createComparisonConversation([], '测试对比');

    // 模拟单聊会话中已生成产物，且工作台展开
    const mockArtifact: Artifact = {
      id: 'art-1',
      title: '季度述职汇报',
      type: 'markdown',
      content: '# 季度述职汇报大纲',
      status: 'complete',
    };

    useConversationsStore.getState().switchConversation(singleId);
    useChatStore.setState({
      activeConversationId: singleId,
      artifacts: [mockArtifact],
      activeArtifactId: 'art-1',
      isWorkspaceOpen: true,
    });
    // 会话列表同步记录产物池
    useConversationsStore.getState().updateMessages(singleId, [], [mockArtifact]);

    // 确认切走前工作台处于展开态且有产物
    expect(useChatStore.getState().artifacts).toHaveLength(1);
    expect(useChatStore.getState().isWorkspaceOpen).toBe(true);

    // 切换到对比模式
    useConversationsStore.getState().switchMode('compare');
    expect(useConversationsStore.getState().mode).toBe('compare');
    expect(useConversationsStore.getState().currentConversationId).toBe(compareId);

    // 切回单聊模式：验证产物池完整还原且工作台保持展开（ADR-0015）
    useConversationsStore.getState().switchMode('single');
    expect(useConversationsStore.getState().mode).toBe('single');
    expect(useConversationsStore.getState().currentConversationId).toBe(singleId);

    const restoredChat = useChatStore.getState();
    expect(restoredChat.artifacts).toHaveLength(1);
    expect(restoredChat.artifacts[0].id).toBe('art-1');
    expect(restoredChat.isWorkspaceOpen).toBe(true);
    expect(restoredChat.activeArtifactId).toBe('art-1');
  });

  it('switchMode 切到对比模式：中断进行中的单聊流式生成并按「有留空删」收尾保留', () => {
    const store = useConversationsStore.getState();
    const singleId = store.createConversation('xunfei', 'lite');
    useConversationsStore.getState().switchConversation(singleId);

    // 模拟单聊流式进行中：isLoading + 一条流式 assistant 消息（正文空、推理已有内容）
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

    // 切到对比模式应先同步中断单聊流（否则后台流与切回时的快照覆盖竞态会丢掉该轮回复）
    useConversationsStore.getState().switchMode('compare');

    const chat = useChatStore.getState();
    expect(chat.isLoading).toBe(false);
    const a1 = chat.messages.find((m) => m.id === 'a1');
    expect(a1?.stopped).toBe(true);
    expect(a1?.reasoningContent).toBe('已流出的推理');
  });

  it('switchMode 切到单聊模式：对称中断进行中的对比页流式生成', () => {
    // 先进入对比模式并选中一个对比会话（含一个已选模型）
    useConversationsStore.getState().switchMode('compare');
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
    useConversationsStore.getState().switchConversation(compareId);
    expect(useConversationsStore.getState().mode).toBe('compare');

    // 切回单聊模式应先停掉对比页在途流（与 switchConversation 的交叉中止对称）
    const stopModelSpy = vi.spyOn(useComparisonStore.getState(), 'stopModel');
    useConversationsStore.getState().switchMode('single');

    expect(stopModelSpy).toHaveBeenCalledWith('xunfei:lite');
    expect(useConversationsStore.getState().mode).toBe('single');
    stopModelSpy.mockRestore();
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

    useConversationsStore.getState().openHistorySession(historyItem);

    const restored = useChatStore.getState().messages[1];
    expect(restored.toolCalls).toHaveLength(1);
    expect(restored.toolCalls?.[0]).toMatchObject({ id: 'call_1', name: 'image_generate' });
    expect(restored.attachments?.[0]).toMatchObject({
      id: 'tool-call_1',
      imageUrl: 'https://cdn.agnes.ai/a.png',
    });
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

  it('会话工具覆盖隔离与还原：切换会话无损恢复 toolOverrides，新建会话重置（ADR-0014 / 工单 02）', () => {
    const store = useConversationsStore.getState();

    // 1. 创建两个会话
    const idA = store.createConversation('doubao', 'doubao-seed-evolving', 'deep-research');
    const idB = store.createConversation('doubao', 'doubao-seed-evolving', 'visual-report');

    // 2. 为会话 A 设置覆盖项：禁用 web_fetch
    store.updateConversationToolOverrides(idA, { web_fetch: false });
    // 为会话 B 设置覆盖项：禁用 image_generate
    store.updateConversationToolOverrides(idB, { image_generate: false });

    // 3. 切换至会话 A：chatStore 恢复会话 A 的 capabilityPack 与 toolOverrides
    store.switchConversation(idA);
    expect(useChatStore.getState().activeConversationId).toBe(idA);
    expect(useChatStore.getState().activeCapabilityPackKey).toBe('deep-research');
    expect(useChatStore.getState().toolOverrides).toEqual({ web_fetch: false });

    // 4. 切换至会话 B：chatStore 恢复会话 B 的 capabilityPack 与 toolOverrides（严格隔离，不污染）
    store.switchConversation(idB);
    expect(useChatStore.getState().activeConversationId).toBe(idB);
    expect(useChatStore.getState().activeCapabilityPackKey).toBe('visual-report');
    expect(useChatStore.getState().toolOverrides).toEqual({ image_generate: false });

    // 5. 新建会话：重置 toolOverrides 为空字典，capabilityPack 为 null
    store.startNewSession('single');
    expect(useChatStore.getState().toolOverrides).toEqual({});
    expect(useChatStore.getState().activeCapabilityPackKey).toBeNull();
  });
});

