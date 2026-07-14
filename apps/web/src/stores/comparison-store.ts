'use client';

/**
 * 多模型比较对话 — 运行时编排 store
 *
 * 职责：
 * - 管理比较模式状态（已选模型、轮次、焦点槽位）
 * - 复用 /api/chat，为每个模型发起独立并发 SSE 请求（独立 AbortController、独立流式状态）
 * - 分支隔离：每个模型维护自己的 branchMessages，绝不串上下文
 * - 故障局部化：单模型慢/失败/停止不阻塞其它模型
 * - 持久化镜像：turns 同步到 conversations-store（localStorage），刷新可恢复
 *
 * 单一写入方约定：活动会话期间以本 store 的 turns 为权威；
 * conversations-store.turns 仅作持久化镜像，在流式完成/失败/停止时同步。
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type {
  ComparisonMode,
  SelectedModel,
  ComparisonTurn,
  ModelRun,
  ModelCatalogItem,
} from '@/types/comparison';
import { toModelKey } from '@/types/comparison';
import {
  CHAT_MODEL_CATALOG,
  DEFAULT_COMPARE_MODEL_KEYS,
  MIN_COMPARE_MODELS,
  MAX_COMPARE_MODELS,
} from '@/lib/constants/chat-models';
import { consumeChatResponse } from '@/lib/utils/chat-stream';
import { authFetch } from '@/lib/api/client';
import { useConversationsStore } from './conversations-store';
import { useHistoryStore } from './history-store';
import { createComparisonHistoryItem } from '@/lib/utils/history-helpers';
import type { ChatHistoryItem } from '@/types/history';

// ==================== 模块级非响应式状态 ====================

// 当前正在进行的请求：modelKey -> AbortController（key 用 modelKey，stopModel 只需模型维度）
const abortControllers = new Map<string, AbortController>();

// 内容刷新节流：`${turnId}|${modelKey}` -> { content, raf }，每模型每帧最多一次 set，避免 4 并发抖动
const contentFlushState = new Map<string, { content: string; raf: number | null }>();

// ==================== 工具函数 ====================

// 由默认 modelKey 组合构造已选模型列表
function defaultSelected(): SelectedModel[] {
  const result: SelectedModel[] = [];
  for (const key of DEFAULT_COMPARE_MODEL_KEYS) {
    const item = CHAT_MODEL_CATALOG.find((c) => toModelKey(c.provider, c.model) === key);
    if (item) {
      result.push({
        provider: item.provider,
        model: item.model,
        providerLabel: item.providerLabel,
        label: `${item.providerLabel} · ${item.label}`,
      });
    }
  }
  return result;
}

// 更新某轮某模型的运行状态（不可变更新）
function updateRun(turnId: string, modelKey: string, updater: (run: ModelRun) => ModelRun) {
  useComparisonStore.setState((state) => ({
    turns: state.turns.map((t) =>
      t.id === turnId && t.runs[modelKey]
        ? { ...t, runs: { ...t.runs, [modelKey]: updater(t.runs[modelKey]) } }
        : t
    ),
  }));
}

// 节流：调度某模型内容刷新（每帧最多一次）
function scheduleContentFlush(turnId: string, modelKey: string, content: string) {
  const key = `${turnId}|${modelKey}`;
  let entry = contentFlushState.get(key);
  if (!entry) {
    entry = { content, raf: null };
    contentFlushState.set(key, entry);
  }
  entry.content = content;
  if (entry.raf !== null) return;
  entry.raf = requestAnimationFrame(() => {
    entry!.raf = null;
    updateRun(turnId, modelKey, (r) => ({ ...r, content: entry!.content }));
  });
}

// 清理某模型的节流状态（完成/失败/停止时调用，并取消未执行的帧）
function clearContentFlush(turnId: string, modelKey: string) {
  const key = `${turnId}|${modelKey}`;
  const entry = contentFlushState.get(key);
  if (entry?.raf !== null && entry?.raf !== undefined) {
    cancelAnimationFrame(entry.raf);
  }
  contentFlushState.delete(key);
}

// 把 turns 镜像到 conversations-store（持久化）
function syncTurnsToConversation() {
  const { activeComparisonId, turns } = useComparisonStore.getState();
  if (!activeComparisonId) return;
  useConversationsStore.getState().updateComparisonTurns(activeComparisonId, turns);
}

// 记录历史（addItem 按 id 去重覆盖，等同 upsert）
function recordHistory() {
  const { activeComparisonId, turns, selectedModels } = useComparisonStore.getState();
  if (!activeComparisonId || turns.length === 0) return;
  const now = new Date().toISOString();
  const item = {
    id: activeComparisonId,
    ...createComparisonHistoryItem(activeComparisonId, turns, selectedModels),
    createdAt: now,
    updatedAt: now,
  } as ChatHistoryItem;
  useHistoryStore.getState().addItem(item);
}

// ==================== 核心：单模型流式运行（故障局部化） ====================

async function runModel(
  turnId: string,
  model: SelectedModel,
  prompt: string,
  appendToBranch: boolean
): Promise<void> {
  const modelKey = toModelKey(model.provider, model.model);
  const controller = new AbortController();
  abortControllers.set(modelKey, controller);
  const startedAt = Date.now();

  // 1) 置为 streaming，并把本轮 user prompt 写入该模型自己的分支
  updateRun(turnId, modelKey, (run) => ({
    ...run,
    status: 'streaming',
    startedAt,
    completedAt: undefined,
    error: undefined,
    truncationWarning: undefined,
    content: '',
    branchMessages: appendToBranch
      ? [...run.branchMessages, { role: 'user', content: prompt }]
      : [{ role: 'user', content: prompt }],
  }));

  let accumulated = '';

  try {
    // 读取更新后的分支作为请求上下文（分支隔离：只发该模型自己的上下文）
    const branch =
      useComparisonStore.getState().turns.find((t) => t.id === turnId)?.runs[modelKey]
        ?.branchMessages ?? [];

    const response = await authFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: branch.map((m) => ({ role: m.role, content: m.content })),
        provider: model.provider,
        model: model.model,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `请求失败: ${response.status}`);
    }

    await consumeChatResponse(
      response,
      (chunk) => {
        accumulated += chunk;
        scheduleContentFlush(turnId, modelKey, accumulated);
      },
      (warning) => {
        updateRun(turnId, modelKey, (r) => ({ ...r, truncationWarning: warning }));
      }
    );

    // 2) 完成：先取消未执行的节流帧，再写入最终内容与 assistant 分支
    clearContentFlush(turnId, modelKey);
    updateRun(turnId, modelKey, (r) => ({
      ...r,
      status: 'completed',
      content: accumulated,
      completedAt: Date.now(),
      branchMessages: [...r.branchMessages, { role: 'assistant', content: accumulated }],
    }));
  } catch (err) {
    clearContentFlush(turnId, modelKey);
    if (err instanceof Error && err.name === 'AbortError') {
      // 用户主动停止：保留已生成内容，允许重试
      updateRun(turnId, modelKey, (r) => ({
        ...r,
        status: 'stopped',
        content: accumulated,
        completedAt: Date.now(),
      }));
    } else {
      const message = err instanceof Error ? err.message : '未知错误';
      updateRun(turnId, modelKey, (r) => ({
        ...r,
        status: 'failed',
        content: accumulated,
        completedAt: Date.now(),
        error: `${model.label} 暂时不可用：${message}，可重试该模型`,
      }));
    }
  } finally {
    abortControllers.delete(modelKey);
    // 流式结束（完成/失败/停止）才持久化镜像；进行中内容不落盘
    syncTurnsToConversation();
  }
}

// ==================== Store 接口 ====================

interface ComparisonState {
  // 状态
  mode: ComparisonMode;
  selectedModels: SelectedModel[];
  turns: ComparisonTurn[];
  activeComparisonId: string | null;
  input: string;
  error: Error | null;

  // 操作
  setMode: (mode: ComparisonMode) => void;
  toggleModel: (item: ModelCatalogItem) => void;
  setInput: (value: string) => void;
  sendComparison: (prompt?: string) => Promise<void>;
  continueComparison: (prompt?: string) => Promise<void>;
  stopModel: (modelKey: string) => void;
  retryModel: (turnId: string, modelKey: string) => Promise<void>;
  setFocus: (turnId: string, slot: 'left' | 'right', modelKey: string) => void;
  loadComparison: (id: string) => void;
  startNewComparison: () => void;
  reset: () => void;
}

// ==================== Store 实现 ====================

export const useComparisonStore = create<ComparisonState>()(
  persist(
    (set, get) => ({
      mode: 'compare',
      selectedModels: defaultSelected(),
      turns: [],
      activeComparisonId: null,
      input: '',
      error: null,

      setMode: (mode) => set({ mode }),

      setInput: (value) => set({ input: value }),

      toggleModel: (item) => {
        const { selectedModels, activeComparisonId } = get();
        const key = toModelKey(item.provider, item.model);
        const exists = selectedModels.some((m) => toModelKey(m.provider, m.model) === key);
        let next: SelectedModel[];
        if (exists) {
          next = selectedModels.filter((m) => toModelKey(m.provider, m.model) !== key);
        } else {
          if (selectedModels.length >= MAX_COMPARE_MODELS) return; // 达上限忽略
          next = [
            ...selectedModels,
            {
              provider: item.provider,
              model: item.model,
              providerLabel: item.providerLabel,
              label: `${item.providerLabel} · ${item.label}`,
            },
          ];
        }
        set({ selectedModels: next });
        // 同步到持久化会话：避免刷新/重新加载后已选模型回退到创建时的组合
        if (activeComparisonId) {
          useConversationsStore.getState().updateComparisonSelectedModels(activeComparisonId, next);
        }
      },

      sendComparison: async (promptOverride) => {
        const { selectedModels, input } = get();
        const prompt = (promptOverride ?? input).trim();
        if (!prompt) return;
        if (selectedModels.length < MIN_COMPARE_MODELS) {
          set({ error: new Error(`请至少选择 ${MIN_COMPARE_MODELS} 个模型进行对比`) });
          return;
        }

        const turnId = `turn-${Date.now()}`;
        const runs: Record<string, ModelRun> = {};
        for (const m of selectedModels) {
          const modelKey = toModelKey(m.provider, m.model);
          runs[modelKey] = {
            modelKey,
            provider: m.provider,
            model: m.model,
            label: m.label,
            status: 'queued',
            content: '',
            branchMessages: [],
          };
        }
        const keys = Object.keys(runs);
        const turn: ComparisonTurn = {
          id: turnId,
          prompt,
          createdAt: Date.now(),
          runs,
          focusSlots: { left: keys[0], right: keys[1] ?? keys[0] },
        };

        // 若无激活会话则创建持久化会话
        let convId = get().activeComparisonId;
        if (!convId) {
          convId = useConversationsStore.getState().createComparisonConversation(selectedModels, prompt);
          set({ activeComparisonId: convId });
        }

        set((s) => ({ turns: [...s.turns, turn], input: '', error: null }));

        // 并发：各自独立，互不阻塞
        await Promise.allSettled(selectedModels.map((m) => runModel(turnId, m, prompt, false)));

        recordHistory();
      },

      continueComparison: async (promptOverride) => {
        const { turns, input, selectedModels } = get();
        const prompt = (promptOverride ?? input).trim();
        const lastTurn = turns[turns.length - 1];
        if (!prompt || !lastTurn) return;
        if (selectedModels.length < MIN_COMPARE_MODELS) {
          set({ error: new Error(`请至少选择 ${MIN_COMPARE_MODELS} 个模型进行对比`) });
          return;
        }

        const turnId = `turn-${Date.now()}`;
        const runs: Record<string, ModelRun> = {};
        // 新一轮只向当前已选模型发送（设计文档 §3.6/§4.5）：被取消的模型保留在历史轮次中，不再参与
        for (const m of selectedModels) {
          const modelKey = toModelKey(m.provider, m.model);
          // 追溯该模型最近一次出现的轮次分支：中途取消再选回也不丢失它自己的上下文
          let branchMessages: ModelRun['branchMessages'] = [];
          for (let i = turns.length - 1; i >= 0; i--) {
            const prev = turns[i].runs[modelKey];
            if (prev) {
              branchMessages = [...prev.branchMessages];
              break;
            }
          }
          runs[modelKey] = {
            modelKey,
            provider: m.provider,
            model: m.model,
            label: m.label,
            status: 'queued',
            content: '',
            branchMessages,
          };
        }
        const keys = Object.keys(runs);
        // 焦点继承：被取消的焦点模型重定向到新一轮可用模型，避免悬空槽位（只显示一列）
        const prevFocus = lastTurn.focusSlots;
        const left = runs[prevFocus.left] ? prevFocus.left : keys[0];
        const right = runs[prevFocus.right] ? prevFocus.right : keys[1] ?? keys[0];
        const turn: ComparisonTurn = {
          id: turnId,
          prompt,
          createdAt: Date.now(),
          runs,
          focusSlots: { left, right },
        };

        set((s) => ({ turns: [...s.turns, turn], input: '', error: null }));

        await Promise.allSettled(selectedModels.map((m) => runModel(turnId, m, prompt, true)));

        recordHistory();
      },

      stopModel: (modelKey) => {
        // 只终止该模型的请求，不影响其它模型
        abortControllers.get(modelKey)?.abort();
      },

      retryModel: async (turnId, modelKey) => {
        const turn = get().turns.find((t) => t.id === turnId);
        const run = turn?.runs[modelKey];
        if (!turn || !run) return;
        // 找到该模型分支中最后一条 user 作为重发内容
        const lastUserIndex = [...run.branchMessages]
          .map((m, i) => ({ m, i }))
          .reverse()
          .find((x) => x.m.role === 'user')?.i;
        if (lastUserIndex === undefined) return;
        const lastUser = run.branchMessages[lastUserIndex];
        const prior = run.branchMessages.slice(0, lastUserIndex);

        // 回退到该轮之前的历史，重发当前轮
        updateRun(turnId, modelKey, (r) => ({
          ...r,
          status: 'queued',
          content: '',
          error: undefined,
          branchMessages: prior,
        }));

        await runModel(
          turnId,
          { provider: run.provider, model: run.model, providerLabel: '', label: run.label },
          lastUser.content,
          true
        );
        recordHistory();
      },

      setFocus: (turnId, slot, modelKey) => {
        // focusSlots 只影响 UI，不同步历史/持久化
        set((s) => ({
          turns: s.turns.map((t) =>
            t.id === turnId ? { ...t, focusSlots: { ...t.focusSlots, [slot]: modelKey } } : t
          ),
        }));
      },

      loadComparison: (id) => {
        const conv = useConversationsStore.getState().conversations.find((c) => c.id === id);
        if (!conv || conv.mode !== 'compare') return;
        // 终止进行中的请求
        for (const c of abortControllers.values()) c.abort();
        abortControllers.clear();
        set({
          activeComparisonId: id,
          turns: conv.turns ?? [],
          selectedModels: conv.selectedModels ?? get().selectedModels,
          mode: 'compare',
          input: '',
          error: null,
        });
      },

      startNewComparison: () => {
        for (const c of abortControllers.values()) c.abort();
        abortControllers.clear();
        set({ turns: [], activeComparisonId: null, input: '', error: null });
      },

      reset: () => {
        for (const c of abortControllers.values()) c.abort();
        abortControllers.clear();
        set({
          turns: [],
          activeComparisonId: null,
          input: '',
          error: null,
          selectedModels: defaultSelected(),
        });
      },
    }),
    {
      name: 'ai-chat-comparison',
      storage: createJSONStorage(() => localStorage),
      // 仅持久化模式、已选模型与当前会话 id；turns 以 conversations-store 为权威，避免双写
      partialize: (state) => ({
        mode: state.mode,
        selectedModels: state.selectedModels,
        activeComparisonId: state.activeComparisonId,
      }),
    }
  )
);

// ==================== 选择器（useShallow 避免不必要重渲染） ====================

export const useComparisonMode = () => useComparisonStore((s) => s.mode);
export const useSelectedModels = () => useComparisonStore((s) => s.selectedModels);
export const useComparisonTurns = () => useComparisonStore((s) => s.turns);
export const useComparisonInput = () => useComparisonStore((s) => s.input);
export const useActiveComparisonId = () => useComparisonStore((s) => s.activeComparisonId);

export const useComparisonActions = () =>
  useComparisonStore(
    useShallow((s) => ({
      setMode: s.setMode,
      toggleModel: s.toggleModel,
      setInput: s.setInput,
      sendComparison: s.sendComparison,
      continueComparison: s.continueComparison,
      stopModel: s.stopModel,
      retryModel: s.retryModel,
      setFocus: s.setFocus,
      loadComparison: s.loadComparison,
      startNewComparison: s.startNewComparison,
      reset: s.reset,
    }))
  );
