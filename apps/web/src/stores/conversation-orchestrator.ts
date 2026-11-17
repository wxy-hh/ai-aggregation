'use client';

/**
 * 会话编排模块 —— 跨 store 会话动作的唯一协调位置。
 *
 * 职责：按确定顺序调用会话、聊天、对比 store 的原子操作，集中处理
 * 模式流转、在途流中止、运行时加载与外部唤起；store 之间不再互相编排。
 *
 * 本模块不持有状态；状态读取与订阅仍直接走各 store。
 */

import { useEffect } from 'react';
import { useConversationsStore } from './conversations-store';
import { useChatStore } from './chat-store';
import { useComparisonStore } from './comparison-store';
import { useHistoryStore } from './history-store';
import { useSettingsStore } from './settings-store';
import { useAudioHistoryStore } from './audio-history-store';
import { markSourcesInvalidBySourceIds, useRelayStore } from './relay-store';
import { hasRetainableContent } from './chat-projectors';
import { fromArchivedMessages } from '@/lib/conversation/message-snapshots';
import { resolveChatEntryIntent } from '@/lib/chat/chat-entry';
import { setConversationPort, type ConversationPort } from './conversation-port';
import type { ChatHistoryItem, HistoryType } from '@/types/history';
import type { Message } from '@/types/chat-message';
import type { RelayBundle } from '@repo/shared';

export type SessionMode = 'single' | 'compare';

/**
 * 会话端口默认实现：聊天 store 的落盘请求经此路由到会话与历史 store。
 * 应用加载本模块即完成注册；测试可注入假实现覆盖。
 */
const defaultConversationPort: ConversationPort = {
  saveMessages(id, messages, artifacts) {
    useConversationsStore.getState().updateMessages(id, messages, artifacts);
  },
  saveToolOverrides(id, toolOverrides) {
    useConversationsStore.getState().updateConversationToolOverrides(id, toolOverrides);
  },
  appendHistory(item) {
    useHistoryStore.getState().addItem(item);
  },
};

setConversationPort(defaultConversationPort);

/** 刷新恢复是否已执行（应用生命周期内只恢复一次） */
let hasInitialized = false;

/** 对话页面入口参数：执行后统一清理，避免刷新重复触发 */
const CHAT_ENTRY_PARAMS = [
  'new',
  'goal',
  'pack',
  'agent',
  'historyId',
  'comparisonId',
] as const;

/** 定点删除入口参数，保留 relayId、prompt 与未知参数 */
function clearChatEntryParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const key of CHAT_ENTRY_PARAMS) {
    url.searchParams.delete(key);
  }
  const nextSearch = url.searchParams.toString();
  window.history.replaceState(
    {},
    '',
    `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`
  );
}

/**
 * 切换目标模式（或切到目标模式的会话）前，同步中断被离开模式的在途流：
 * - 目标为 compare：停掉单聊流式生成——stop() 同步收尾（按「有留空删」保留已流出内容并落会话快照），
 *   否则后台流与切回时的 loadConversation 快照覆盖竞态会丢掉该轮回复；
 * - 目标为 single：停掉对比页各模型的在途请求（同类竞态的对称防护）。
 */
const abortCrossModeStreams = (targetMode: SessionMode) => {
  if (targetMode === 'compare') {
    try {
      useChatStore.getState().stop();
    } catch {
      // 单聊 store 未初始化时忽略
    }
  } else {
    try {
      const comparison = useComparisonStore.getState();
      if (comparison) {
        comparison.selectedModels.forEach((model) =>
          comparison.stopModel(`${model.provider}:${model.model}`)
        );
      }
    } catch {
      // 对比 store 未初始化时忽略
    }
  }
};

/** 把单聊会话快照加载进运行时（调用方已完成模式与指针切换） */
const loadSingleRuntime = (conversation: ReturnType<typeof useConversationsStore.getState>['conversations'][number]) => {  try {
    useChatStore.getState().loadConversation(
      conversation.id,
      conversation.messages,
      conversation.provider as never,
      conversation.model,
      conversation.capabilityPack,
      conversation.toolOverrides,
      conversation.artifacts
    );
  } catch {
    // 聊天 store 未初始化时忽略
  }
};

/** 删除正在该会话上生成的流：按「有留空删」收尾，避免已流出内容被删除竞态吞掉 */
const stopStreamIfGenerating = (id: string): void => {
  try {
    const chat = useChatStore.getState();
    if (chat.activeConversationId === id && chat.isLoading) {
      chat.stop();
    }
  } catch {
    // 聊天 store 未初始化时忽略
  }
};

/**
 * 汇总接力来源 id：消息接力的来源是消息 id，删除会话时需连带标记会话内全部消息，
 * 否则接力包无法命中来源、不会显示「来源已删」。
 * 必须在会话从列表移除前调用。
 */
const collectRelaySourceIds = (ids: string[]): string[] => {
  if (ids.length === 0) return ids;
  const idSet = new Set(ids);
  const messageIds = useConversationsStore
    .getState()
    .conversations.filter((conversation) => idSet.has(conversation.id))
    .flatMap((conversation) => conversation.messages.map((message) => message.id));
  return messageIds.length > 0 ? [...ids, ...messageIds] : ids;
};

/**
 * 从会话列表移除记录并清理失效指针；若当前会话被删，按同模式候选或新建草稿流转。
 * 只负责会话侧，历史与接力传播由各删除命令统一补齐。
 */
const removeConversationsAndRebind = (ids: string[]): void => {
  if (ids.length === 0) return;

  const idSet = new Set(ids);
  const state = useConversationsStore.getState();
  const isDeletingCurrent = state.currentConversationId
    ? idSet.has(state.currentConversationId)
    : false;
  const remaining = state.conversations.filter((conversation) => !idSet.has(conversation.id));

  const pointerPatch: {
    conversations: typeof remaining;
    currentConversationId?: string | null;
    lastActiveSingleId?: string | null;
    lastActiveCompareId?: string | null;
  } = { conversations: remaining };
  if (state.lastActiveSingleId && idSet.has(state.lastActiveSingleId)) {
    pointerPatch.lastActiveSingleId = null;
  }
  if (state.lastActiveCompareId && idSet.has(state.lastActiveCompareId)) {
    pointerPatch.lastActiveCompareId = null;
  }

  // 若 comparison-store 当前指向已删会话，同步重置运行时
  try {
    const comparison = useComparisonStore.getState();
    if (comparison.activeComparisonId && idSet.has(comparison.activeComparisonId)) {
      comparison.startNewComparison();
    }
  } catch {
    // 对比 store 未初始化时忽略
  }

  if (isDeletingCurrent) {
    const sameModeCandidates = remaining.filter((conversation) =>
      state.mode === 'compare'
        ? conversation.mode === 'compare'
        : conversation.mode !== 'compare'
    );

    if (sameModeCandidates.length > 0) {
      const nextId = sameModeCandidates[0].id;
      useConversationsStore.setState({ ...pointerPatch, currentConversationId: nextId });
      conversationOrchestrator.switchConversation(nextId);
    } else {
      useConversationsStore.setState({ ...pointerPatch, currentConversationId: null });
      conversationOrchestrator.startNewSession(state.mode);
    }
  } else {
    useConversationsStore.setState(pointerPatch);
  }
};

/**
 * 刷新恢复：残留流式消息收尾为「已停止」，无内容草稿直接过滤。
 * 未变化的消息保持原引用，便于调用方判断是否需要回写。
 */
const restoreHydratedMessages = (messages: Message[]): Message[] => {
  const restored: Message[] = [];
  for (const message of messages) {
    if (!message.isStreaming && !message.stopped) {
      restored.push(message);
      continue;
    }
    // 零产出的流式/停止草稿不保留
    if (!hasRetainableContent(message)) continue;
    restored.push({ ...message, isStreaming: false, stopped: true });
  }
  return restored;
};

export const conversationOrchestrator = {
  /** 切换会话：自动进入目标会话所属模式并加载对应运行时 */
  switchConversation(id: string): void {
    const conversation = useConversationsStore
      .getState()
      .conversations.find((item) => item.id === id);
    if (!conversation) return;

    const isCompare = conversation.mode === 'compare';

    if (isCompare) {
      abortCrossModeStreams('compare');
      useConversationsStore.getState().setSessionState({
        currentConversationId: id,
        mode: 'compare',
        lastActiveCompareId: id,
      });
      try {
        useComparisonStore.getState().loadComparison(id);
      } catch {
        // 对比 store 未初始化时忽略
      }
    } else {
      abortCrossModeStreams('single');
      useConversationsStore.getState().setSessionState({
        currentConversationId: id,
        mode: 'single',
        lastActiveSingleId: id,
      });
      loadSingleRuntime(conversation);
    }
  },

  /** 模式切换：双模式记忆流转，离开模式前落盘当前单聊产物池 */
  switchMode(targetMode: SessionMode): void {
    const store = useConversationsStore.getState();
    if (store.mode === targetMode) return;

    const pointerPatch: {
      mode: SessionMode;
      currentConversationId?: string | null;
      lastActiveSingleId?: string | null;
      lastActiveCompareId?: string | null;
    } = { mode: targetMode };

    if (store.mode === 'single' && store.currentConversationId) {
      pointerPatch.lastActiveSingleId = store.currentConversationId;
      // 同步当前单聊产物池，防切走前未及落盘导致产物丢失（ADR-0015）
      const activeArtifacts = useChatStore.getState().artifacts;
      if (activeArtifacts && activeArtifacts.length > 0) {
        store.updateMessages(
          store.currentConversationId,
          useChatStore.getState().messages,
          activeArtifacts
        );
      }
    } else if (store.mode === 'compare' && store.currentConversationId) {
      pointerPatch.lastActiveCompareId = store.currentConversationId;
    }

    if (targetMode === 'compare') {
      abortCrossModeStreams('compare');
      const targetId = pointerPatch.lastActiveCompareId ?? store.lastActiveCompareId;
      const targetConversation = targetId
        ? store.conversations.find((item) => item.id === targetId && item.mode === 'compare')
        : null;

      if (targetConversation) {
        useConversationsStore.getState().setSessionState({
          ...pointerPatch,
          currentConversationId: targetConversation.id,
        });
        try {
          useComparisonStore.getState().loadComparison(targetConversation.id);
        } catch {
          // 对比 store 未初始化时忽略
        }
      } else {
        useConversationsStore.getState().setSessionState({
          ...pointerPatch,
          currentConversationId: null,
        });
        try {
          useComparisonStore.getState().startNewComparison();
        } catch {
          // 对比 store 未初始化时忽略
        }
      }
      return;
    }

    abortCrossModeStreams('single');
    const targetId = pointerPatch.lastActiveSingleId ?? store.lastActiveSingleId;
    const targetConversation = targetId
      ? store.conversations.find((item) => item.id === targetId && item.mode !== 'compare')
      : null;

    if (targetConversation) {
      useConversationsStore.getState().setSessionState({
        ...pointerPatch,
        currentConversationId: targetConversation.id,
      });
      loadSingleRuntime(targetConversation);
      return;
    }

    const emptyConversation = store.findEmptyConversation();
    if (emptyConversation && emptyConversation.mode !== 'compare') {
      useConversationsStore.getState().setSessionState({
        ...pointerPatch,
        currentConversationId: emptyConversation.id,
      });
      try {
        useChatStore
          .getState()
          .loadConversation(
            emptyConversation.id,
            [],
            emptyConversation.provider as never,
            emptyConversation.model
          );
      } catch {
        // 聊天 store 未初始化时忽略
      }
      return;
    }

    useConversationsStore.getState().setSessionState(pointerPatch);
    const chat = useChatStore.getState();
    const provider = chat?.provider || 'xunfei';
    const model = chat?.model || 'lite';
    const newId = store.createConversation(provider, model);
    try {
      useChatStore.getState().loadConversation(newId, [], provider, model);
    } catch {
      // 聊天 store 未初始化时忽略
    }
  },

  /** 统一新建入口：对比模式置空草稿；单聊优先复用空白会话，否则新建 */
  startNewSession(targetMode?: SessionMode): void {
    const mode = targetMode ?? useConversationsStore.getState().mode;

    if (mode === 'compare') {
      useConversationsStore.getState().setSessionState({
        mode: 'compare',
        currentConversationId: null,
      });
      try {
        useComparisonStore.getState().startNewComparison();
      } catch {
        // 对比 store 未初始化时忽略
      }
      return;
    }

    useConversationsStore.getState().setSessionState({ mode: 'single' });
    const emptyConversation = useConversationsStore.getState().findEmptyConversation();
    if (emptyConversation && emptyConversation.mode !== 'compare') {
      conversationOrchestrator.switchConversation(emptyConversation.id);
      return;
    }

    const chat = useChatStore.getState();
    const provider = chat?.provider || 'xunfei';
    const model = chat?.model || 'lite';
    const newId = useConversationsStore.getState().createConversation(provider, model);
    try {
      useChatStore.getState().loadConversation(newId, [], provider, model);
    } catch {
      // 聊天 store 未初始化时忽略
    }
  },

  /** 外部唤起对比会话（E-1 契约） */
  openComparisonSession(id: string): void {
    conversationOrchestrator.switchConversation(id);
  },

  /** 外部从历史记录唤起单聊会话（E-1 契约） */
  openHistorySession(historyItem: ChatHistoryItem): void {
    const provider = (historyItem.provider || 'xunfei') as never;
    const model = historyItem.model || 'lite';
    const newId = useConversationsStore.getState().createConversation(provider, model);
    // 历史归档 → 运行时：恢复正文、工具记录、计划、审批与工具产出附件；
    // 引用与产物关联不恢复（归档不保存这两类字段，属已知语义）
    const historyMessages = fromArchivedMessages(historyItem.messages, newId);

    useConversationsStore.getState().setSessionState({
      mode: 'single',
      currentConversationId: newId,
      lastActiveSingleId: newId,
    });
    useConversationsStore.getState().updateMessages(newId, historyMessages);
    try {
      useChatStore
        .getState()
        .loadConversation(newId, historyMessages, provider, model);
    } catch {
      // 聊天 store 未初始化时忽略
    }
  },

  /**
   * 页面入口命令：按固定优先级执行 URL 入口意图，并清理已消费的入口参数。
   * 返回新建分支的 goal 预填文本，供页面写入外部草稿通道。
   */
  enterChatFromUrl(search: string): { draftText: string | null } {
    const state = useConversationsStore.getState();
    const firstSingle = state.conversations.find(
      (conversation) => conversation.mode !== 'compare'
    );
    const intent = resolveChatEntryIntent(search, {
      currentConversationId: state.currentConversationId,
      mode: state.mode,
      firstSingleConversationId: firstSingle?.id ?? null,
    });

    let draftText: string | null = null;

    switch (intent.kind) {
      case 'comparison':
        conversationOrchestrator.openComparisonSession(intent.comparisonId);
        break;
      case 'history': {
        const existing = useConversationsStore
          .getState()
          .conversations.find((conversation) => conversation.id === intent.historyId);
        if (existing) {
          // 会话还在列表里时直接打开，避免按历史归档再复制一份
          conversationOrchestrator.switchConversation(existing.id);
          break;
        }
        const historyItem = useHistoryStore.getState().getItemById(intent.historyId);
        if (historyItem?.type === 'chat') {
          conversationOrchestrator.openHistorySession(historyItem);
        }
        break;
      }
      case 'new':
        conversationOrchestrator.startNewSession();
        if (intent.enableAgent) {
          useSettingsStore.getState().setAgentMode(true);
        }
        if (intent.capabilityPack) {
          conversationOrchestrator.updateSessionCapabilityPack(intent.capabilityPack);
        }
        draftText = intent.goal;
        break;
      case 'restore-first-single':
        conversationOrchestrator.switchConversation(intent.conversationId);
        break;
      case 'keep-current':
        break;
    }

    clearChatEntryParams();
    return { draftText };
  },

  /** 外部跨模态接力到达对话时的就绪保证（E-1 契约） */
  prepareRelaySession(): void {
    if (useConversationsStore.getState().mode === 'compare') {
      conversationOrchestrator.switchMode('single');
    }
    const currentConversation = useConversationsStore.getState().getCurrentConversation();
    if (!currentConversation || currentConversation.mode === 'compare') {
      conversationOrchestrator.startNewSession('single');
    }
  },

  /**
   * Relay 到达处理：保证单聊落点；图片来源在非豆包模型下自动切换并返回决策结果。
   * 草稿填充、附件状态与提示文案由页面负责；命令本身幂等。
   */
  applyRelayArrival(bundle: RelayBundle): {
    switchedModel: boolean;
    isImageRelay: boolean;
  } {
    conversationOrchestrator.prepareRelaySession();

    const firstItem = bundle.items[0];
    const isImageRelay =
      Boolean(firstItem?.snapshotMediaUrl) &&
      firstItem?.sourceType === 'image' &&
      firstItem?.sourceModule === 'image';

    if (!isImageRelay) return { switchedModel: false, isImageRelay };

    if (useChatStore.getState().provider === 'doubao') {
      return { switchedModel: false, isImageRelay };
    }

    conversationOrchestrator.updateSessionModel('doubao', 'doubao-seed-evolving');
    return { switchedModel: true, isImageRelay };
  },

  /**
   * 更新当前会话模型：运行时 provider/model 与本地快照绑定同时更新。
   */
  updateSessionModel(provider: string, model: string): void {
    try {
      useChatStore.getState().switchProvider(provider as never, model);
    } catch {
      // 聊天 store 未初始化时忽略
    }

    const currentId = useConversationsStore.getState().currentConversationId;
    if (currentId) {
      useConversationsStore
        .getState()
        .updateConversationSettings(currentId, provider, model);
    }
  },

  /**
   * 更新当前会话能力包：运行时能力包与本地快照绑定同时更新。
   * 没有当前会话时只更新运行时，避免凭空创建会话。
   */
  updateSessionCapabilityPack(capabilityPack: string | null): void {
    try {
      useChatStore.getState().setCapabilityPackKey(capabilityPack);
    } catch {
      // 聊天 store 未初始化时忽略
    }

    const currentId = useConversationsStore.getState().currentConversationId;
    if (currentId) {
      useConversationsStore
        .getState()
        .updateConversationCapabilityPack(currentId, capabilityPack);
    }
  },

  /**
   * 发送前保证存在可承载消息的单聊会话：已有单聊会话直接复用，
   * 否则创建并加载一次运行时；返回承载会话 id。
   */
  ensureActiveConversation(): string {
    const store = useConversationsStore.getState();
    const current = store.getCurrentConversation();
    if (current && current.mode !== 'compare') {
      return current.id;
    }

    const chat = useChatStore.getState();
    const provider = chat?.provider || 'xunfei';
    const model = chat?.model || 'lite';
    const newId = store.createConversation(provider, model);
    try {
      useChatStore.getState().loadConversation(newId, [], provider as never, model);
    } catch {
      // 聊天 store 未初始化时忽略
    }
    return newId;
  },

  /**
   * 发送事务：确保会话 → 读取接力派生元数据 → 发送 → 成功才提交接力并清理匹配附件。
   * 返回聊天 store 的四态结果，供页面决定输入框恢复与提示。
   */
  async sendChatMessage(
    content: string
  ): Promise<'sent' | 'aborted' | 'failed' | 'skipped'> {
    conversationOrchestrator.ensureActiveConversation();

    const relay = useRelayStore.getState();
    const activeId = relay.activeByTarget.chat;
    const bundle = activeId ? relay.bundles[activeId] : null;
    // 接力两段式：发送前只读派生元数据，成功后才清引用与草稿（REQ-016）
    const derivation = bundle
      ? {
          derivedFromRelayId: bundle.id,
          derivedFromReferenceIds: bundle.items.map((item) => item.id),
        }
      : undefined;

    const result = await useChatStore.getState().sendMessage(content, derivation);

    if (result !== 'sent') return result;

    if (bundle) {
      relay.clearActiveForTarget('chat');
      relay.clearDraftForTarget('chat');

      // 只清理来源匹配的接力附件，避免误删用户手动上传的附件
      const attachment = useChatStore.getState().attachment;
      if (attachment?.sourceId === bundle.id) {
        useChatStore.getState().setAttachment(null);
      }
    }

    return result;
  },

  /**
   * 刷新恢复：按上次打开的会话恢复运行时，与切换会话共用同一条加载路径。
   * 由应用初始化入口在水合完成后调用。
   */
  initialize(): void {
    const state = useConversationsStore.getState();
    const { mode, currentConversationId, conversations } = state;
    if (!currentConversationId) return;

    const conversation = conversations.find((item) => item.id === currentConversationId);
    if (!conversation) return;

    if (mode === 'compare') {
      if (conversation.mode === 'compare') {
        try {
          useComparisonStore.getState().loadComparison(conversation.id);
        } catch {
          // 对比 store 未初始化时忽略
        }
      }
      return;
    }

    if (conversation.mode === 'compare') return;

    const restoredMessages = restoreHydratedMessages(conversation.messages);
    const repaired =
      restoredMessages.length !== conversation.messages.length ||
      restoredMessages.some((message, index) => message !== conversation.messages[index]);

    if (repaired) {
      useConversationsStore
        .getState()
        .updateMessages(conversation.id, restoredMessages, conversation.artifacts);
    }

    loadSingleRuntime({ ...conversation, messages: restoredMessages });
  },

  /** 应用生命周期内只执行一次刷新恢复，避免初始化入口重复触发 */
  initializeOnce(): void {
    if (hasInitialized) return;
    hasInitialized = true;
    conversationOrchestrator.initialize();
  },

  /**
   * 侧边栏删除会话：停流 → 会话删除与同模式流转 → 历史删除 → 接力来源失效。
   * 同一删除的每个关联副作用只执行一次。
   */
  deleteConversation(id: string): void {
    stopStreamIfGenerating(id);
    // 会话移除前收集来源 id（含会话内消息 id），确保消息接力包能被标记失效
    const sourceIds = collectRelaySourceIds([id]);
    removeConversationsAndRebind([id]);
    useHistoryStore.getState().deleteItem(id);
    markSourcesInvalidBySourceIds(sourceIds);
  },

  /**
   * 历史页单删：历史删除 → 按记录类型传播（chat 删会话、voice 删音频侧）→ 接力来源失效。
   */
  async deleteHistoryItem(id: string): Promise<void> {
    const item = useHistoryStore.getState().getItemById(id);
    const projectedChat = useConversationsStore
      .getState()
      .conversations.some((conversation) => conversation.id === id);
    const sourceIds = collectRelaySourceIds([id]);
    useHistoryStore.getState().deleteItem(id);

    if (item?.type === 'chat' || (!item && projectedChat)) {
      stopStreamIfGenerating(id);
      removeConversationsAndRebind([id]);
    } else if (item?.type === 'voice') {
      await useAudioHistoryStore.getState().deleteAudioItemOnly(id);
    }

    markSourcesInvalidBySourceIds(sourceIds);
  },

  /**
   * 历史页批删：先按删除前的记录快照分类，再一次性移除历史并传播关联副作用。
   */
  async deleteHistoryItems(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const items = useHistoryStore.getState().items.filter((item) => ids.includes(item.id));
    const chatIds = items.filter((item) => item.type === 'chat').map((item) => item.id);
    const voiceIds = items.filter((item) => item.type === 'voice').map((item) => item.id);
    const sourceIds = collectRelaySourceIds(ids);

    useHistoryStore.getState().deleteItems(ids);
    chatIds.forEach(stopStreamIfGenerating);
    removeConversationsAndRebind(chatIds);

    // 各语音记录相互独立，并发删除避免逐条等待 IndexedDB 事务
    await Promise.all(
      voiceIds.map((voiceId) =>
        useAudioHistoryStore.getState().deleteAudioItemOnly(voiceId)
      )
    );

    markSourcesInvalidBySourceIds(sourceIds);
  },

  /**
   * 清空历史：按删除前的记录快照传播，每个关联副作用按各自记录执行一次。
   */
  async clearHistory(type?: HistoryType): Promise<void> {
    const items = useHistoryStore
      .getState()
      .items.filter((item) => !type || item.type === type);
    const ids = items.map((item) => item.id);
    const chatIds = items.filter((item) => item.type === 'chat').map((item) => item.id);
    const voiceIds = items.filter((item) => item.type === 'voice').map((item) => item.id);
    const sourceIds = collectRelaySourceIds(ids);

    useHistoryStore.getState().clearHistory(type);
    chatIds.forEach(stopStreamIfGenerating);
    removeConversationsAndRebind(chatIds);

    // 各语音记录相互独立，并发删除避免逐条等待 IndexedDB 事务
    await Promise.all(
      voiceIds.map((voiceId) =>
        useAudioHistoryStore.getState().deleteAudioItemOnly(voiceId)
      )
    );

    markSourcesInvalidBySourceIds(sourceIds);
  },

  /**
   * 音频库删除入口：删两侧（音频详情 + 统一历史摘要）并标记接力来源失效。
   */
  async deleteAudioItems(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    // 各音频记录相互独立，并发删除避免逐条等待 IndexedDB 事务
    await Promise.all(
      ids.map((id) => useAudioHistoryStore.getState().deleteItem(id))
    );

    markSourcesInvalidBySourceIds(ids);
  },
};

/**
 * 应用初始化入口：水合完成后执行一次刷新恢复。
 * 由 components/providers/conversation-orchestrator-mount.tsx 懒加载挂载。
 */
export function OrchestratorEffect(): null {
  useEffect(() => {
    // 水合完成后恢复上次会话运行时（应用生命周期内只执行一次）
    const unsubscribeHydration = useConversationsStore.persist.onFinishHydration(() => {
      conversationOrchestrator.initializeOnce();
    });
    if (useConversationsStore.persist.hasHydrated()) {
      conversationOrchestrator.initializeOnce();
    }
    return () => unsubscribeHydration();
  }, []);
  return null;
}
