'use client';

import { create } from 'zustand';
import { emit, StoreEvents } from './store-events';
import { createChatHistoryItem } from '@/lib/utils/history-helpers';
import { streamChatResponse, type StreamChatRequest } from '@/lib/utils/chat-stream';
import { checkAndWarnLowBalance } from '@/lib/billing/balance-warning';
import { useSettingsStore } from '@/stores/settings-store';
import { trackArtifactEvent } from '@/lib/events/artifact-events';
import {
  buildArtifactContextRequest,
  type ArtifactContextRequest,
  type DerivationMetadata,
  type ChatStreamUsage,
  type ToolCallRecord,
  type AgentNote,
  type Artifact,
  toolCallRecordSchema,
  applyArtifactEvent,
  beginArtifactTurn,
  finalizeStreamingArtifacts,
  getArtifactVersions,
  rollbackArtifact,
} from '@repo/shared';

// ==================== 类型定义 ====================

// AI 提供商类型：讯飞星火、豆包或 DeepSeek
export type ProviderName = 'xunfei' | 'doubao' | 'deepseek';

// 附件上传状态：上传中 | 就绪 | 错误
export type AttachmentStatus = 'uploading' | 'ready' | 'error';

// 附件类型定义
export interface Attachment {
  id: string; // 附件唯一标识
  type: 'image' | 'file'; // 附件类型：图片或文件
  name: string; // 文件名
  size?: number; // 文件大小（字节）
  // 图片附件：存储 base64 编码的数据 URL
  imageUrl?: string;
  // 文件附件：存储上传后服务器返回的文件 ID
  fileId?: string;
  // 当前上传状态
  status: AttachmentStatus;
  // 错误信息（仅在 status 为 'error' 时有值）
  error?: string;
  // 来源标识（接力图片用：追踪接力来源，清空引用时清理）
  sourceId?: string;
}

// 消息类型定义
export interface Message {
  id: string; // 消息唯一标识
  role: 'user' | 'assistant' | 'system'; // 消息角色：用户 | AI助手 | 系统
  content: string; // 消息文本内容
  isStreaming?: boolean; // 是否正在流式传输（AI回复时为 true）
  stopped?: boolean; // 是否被用户/隐式中止（保留部分内容时标记）
  failed?: boolean; // 生成失败但保留了部分内容（流中途错误）
  truncationWarning?: string; // 回答可能被截断时的提示
  usage?: ChatStreamUsage; // 本次对话的 Token 消耗统计（done 帧携带）
  reasoningContent?: string; // 模型真实推理内容（仅 supportsReasoning 模型可能产生，永不回传上游）
  reasoningDurationMs?: number; // 思考时长：首个推理增量到达 → 分界点（首 text-delta / done / error / abort）冻结
  // 附件列表（可选）
  // 用户消息 = 用户上传的附件；AI 消息 = agent 工具产出的附件（如生成的图片）
  attachments?: Attachment[];
  // agent 模式下的工具调用记录（过程可见 + 刷新回看）。
  // 未开启 agent 或本轮无工具调用时为 undefined —— 渲染与现状完全一致。
  toolCalls?: ToolCallRecord[];
  // agent 模式的过程旁白（二期多步循环）：中间轮决策文本。
  // beforeCallIndex = 旁白到达时 toolCalls 的长度（即插入到第几个工具调用之前）。
  // 进过程卡片、不进正文、不入历史持久化（历史拍平时被丢弃）。类型单源在 @repo/shared。
  agentNotes?: AgentNote[];
  // 本条消息关联生成的产物标识引用列表（ADR-0015）
  artifactIds?: string[];
  // 结构化切片引用映射字典（ADR-0025 / KB-CHAT-CITE）
  citations?: Record<number, import('@/lib/rag/hybrid-retrieval').CitationAnchor>;
}

// 聊天状态管理接口
export interface ChatState {
  // ========== 状态数据 ==========
  messages: Message[]; // 当前对话的所有消息
  input: string; // 输入框的文本内容
  isLoading: boolean; // 是否正在等待AI回复
  error: Error | null; // 错误信息（如果有）
  provider: ProviderName; // 当前使用的AI提供商
  model: string | undefined; // 当前使用的模型名称
  activeConversationId: string | null; // 当前激活的对话ID
  attachment: Attachment | null; // 当前待发送的附件（单文件模式）
  activeCapabilityPackKey: string | null; // 当前激活的场景能力包 key（ADR-0014 / 工单 01）
  toolOverrides: Record<string, boolean>; // 当前会话的工具临时启停覆盖字典（ADR-0014 / 工单 02）
  // P1 Artifacts 工作台状态（ADR-0015）
  artifacts: Artifact[]; // 当前会话的产物集合池
  activeArtifactId: string | null; // 当前工作台聚焦的产物 ID
  isWorkspaceOpen: boolean; // 桌面端工作台是否展开
  viewingVersions: Record<string, number>; // 各产物当前查看的历史版本序号（缺省 = 查看当前版，瞬态不持久化，ADR-0037）

  // ========== 基础操作 ==========
  setInput: (value: string) => void; // 设置输入框内容
  setMessages: (messages: Message[]) => void; // 设置消息列表
  switchProvider: (provider: ProviderName, model?: string) => void; // 切换AI提供商和模型
  setAttachment: (attachment: Attachment | null) => void; // 设置附件
  setCapabilityPackKey: (key: string | null) => void; // 设置当前场景能力包
  setToolOverride: (toolKey: string, enabled: boolean) => void; // 切换单个工具临时启停
  setToolOverrides: (overrides: Record<string, boolean>) => void; // 批量更新工具覆盖字典
  setActiveArtifactId: (id: string | null) => void; // 设置工作台聚焦产物
  setWorkspaceOpen: (open: boolean) => void; // 开关工作台分栏
  closeWorkspace: () => void; // 关闭工作台分栏
  viewArtifactVersion: (artifactId: string, seq: number | null) => void; // 切换查看产物版本（null = 回到当前版，ADR-0037）
  rollbackArtifactToVersion: (artifactId: string, seq: number) => void; // 追加式回滚到某历史版本（ADR-0037）
  markArtifactDeposited: (artifactId: string, info: { knowledgeBaseId: string; knowledgeBaseName?: string; documentId: string; depositedAt: string }) => void; // 标记产物已入库 (ADR-0034)


  // ========== 核心交互功能 ==========
  sendMessage: (content?: string, derivation?: DerivationMetadata) => Promise<'sent' | 'aborted' | 'failed' | 'skipped'>; // 发送消息（支持流式响应）；derivation 为接力派生元数据（REQ-016）；返回发送结果供目标侧决定 commit/保留引用
  reload: (msgId?: string) => Promise<void>; // 重新生成AI回复
  stop: () => void; // 停止当前的AI生成

  // ========== 生命周期管理 ==========
  loadConversation: (
    id: string,
    messages: Message[],
    provider: string,
    model: string,
    capabilityPack?: string | null,
    toolOverrides?: Record<string, boolean>,
    artifacts?: Artifact[]
  ) => void; // 加载历史对话
  reset: () => void; // 重置聊天状态
}

// ==================== 统一会话编排 ====================

/** runChatStreamSession 依赖注入：把消息/错误/会话 id 的读写交给调用方（store），编排本身不含 store 引用，可单点测试 */
export interface ChatStreamSessionDeps {
  /** 获取当前消息列表快照（只读，供流中节流落盘合成最新数据，不经 setState） */
  getMessages: () => Message[];
  /** 用 updater 改消息列表，返回新列表（供完成/失败后同步到会话列表） */
  updateMessages: (updater: (messages: Message[]) => Message[]) => Message[];
  setError: (error: Error | null) => void;
  activeConversationId: () => string | null;
  /** 获取当前会话产物池快照（可选） */
  getArtifacts?: () => Artifact[];
  /** 更新产物池（可选） */
  updateArtifacts?: (updater: (artifacts: Artifact[]) => Artifact[]) => void;
  /** 设置当前聚焦产物（可选） */
  setActiveArtifactId?: (id: string | null) => void;
  /** 设置工作台展开状态（可选） */
  setWorkspaceOpen?: (open: boolean) => void;
}

export type ChatStreamOutcome = 'sent' | 'aborted' | 'failed';

export interface RunChatStreamSessionOptions {
  /** 可注入的内容刷新调度器（默认为 requestAnimationFrame 包装，返回取消函数） */
  scheduleFlush?: (cb: () => void) => () => void;
}

/**
 * 默认内容刷新调度器（基于 requestAnimationFrame 包装）
 * 当环境不支持 requestAnimationFrame 时回退到 setTimeout
 */
function defaultScheduleFlush(cb: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(handle);
  }
  const timer = setTimeout(cb, 0);
  return () => clearTimeout(timer);
}

/** 单聊内容合帧刷新状态：assistantId -> { text, reasoning, raf }（正文/推理独立累加，同帧提交） */
interface ContentFlushEntry {
  text: string;
  /** 最新累计推理文本；undefined 表示本轮尚未收到推理增量 */
  reasoning?: string;
  raf: (() => void) | null;
}

const contentFlushState = new Map<string, ContentFlushEntry>();

/** 合帧兜底时暂存的最新流式产出（code-review Standards 轴：复用 ContentFlushEntry 同构类型，消灭匿名类型） */
type LatestStreamContent = Pick<ContentFlushEntry, 'text' | 'reasoning'>;

/** 清理并取消某条消息的待刷新合帧，返回最后暂存的最新正文与推理（若有） */
function flushLatestContentAndClear(
  assistantId: string
): LatestStreamContent | undefined {
  const entry = contentFlushState.get(assistantId);
  if (!entry) return undefined;
  if (entry.raf) {
    entry.raf();
    entry.raf = null;
  }
  contentFlushState.delete(assistantId);
  return { text: entry.text, reasoning: entry.reasoning };
}

/**
 * 把合帧兜底的最新正文/推理与冻结后的推理时长合并进消息。
 * code-review Standards 轴：done / catch 两处收尾的同一合并形状提取，消除重复。
 */
function mergeLatestStreamContent(
  m: Message,
  latest: LatestStreamContent | undefined,
  reasoningDurationMs: number | undefined
): Message {
  return {
    ...m,
    ...(latest !== undefined ? { content: latest.text } : {}),
    ...(latest?.reasoning !== undefined ? { reasoningContent: latest.reasoning } : {}),
    ...(reasoningDurationMs !== undefined ? { reasoningDurationMs } : {}),
  };
}

/**
 * 调度一帧合帧刷新：把暂存的最新正文与推理一次性写入消息（每帧最多一次 setState）。
 * 正文与推理共用同一帧：任一增量到达时若已有待执行帧则只更新暂存，不重复调度。
 */
function scheduleEntryFlush(
  assistantId: string,
  entry: ContentFlushEntry,
  deps: ChatStreamSessionDeps,
  scheduleFlush: (cb: () => void) => () => void
): void {
  if (entry.raf) return;
  let executed = false;
  const cancelFn = scheduleFlush(() => {
    executed = true;
    const current = contentFlushState.get(assistantId);
    if (!current) return;
    current.raf = null;
    // 首 text-delta 冻结后时长随本帧即落消息：「正文中」阶段折叠头定格为「已思考 X 秒」，
    // 不再等 done 才写入（code-review Spec 轴发现的定格滞后问题）
    const frozenDurationMs = reasoningTimingState.get(assistantId)?.durationMs;
    deps.updateMessages((messages) =>
      messages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content: current.text,
              ...(current.reasoning !== undefined
                ? { reasoningContent: current.reasoning }
                : {}),
              ...(frozenDurationMs !== undefined
                ? { reasoningDurationMs: frozenDurationMs }
                : {}),
            }
          : m
      )
    );
  });
  if (!executed && contentFlushState.has(assistantId)) {
    entry.raf = cancelFn;
  }
}

/** 推理计时状态：assistantId -> 首个推理增量时间戳 / 分界点冻结后的时长（store 内部变量，不持久化） */
interface ReasoningTimingEntry {
  startedAt: number;
  durationMs?: number;
}

const reasoningTimingState = new Map<string, ReasoningTimingEntry>();

/** 首个推理增量到达时记录开始时间戳（重复调用幂等） */
function recordReasoningStart(assistantId: string): void {
  if (!reasoningTimingState.has(assistantId)) {
    reasoningTimingState.set(assistantId, { startedAt: Date.now() });
  }
}

/**
 * 分界点冻结推理时长：首个 text-delta / done / error / abort 先到先冻。
 * 未收到过推理增量返回 undefined；已冻结后重复调用返回原值。
 */
function freezeReasoningDuration(assistantId: string): number | undefined {
  const entry = reasoningTimingState.get(assistantId);
  if (!entry) return undefined;
  if (entry.durationMs === undefined) {
    entry.durationMs = Date.now() - entry.startedAt;
  }
  return entry.durationMs;
}

/**
 * 消息是否含有可留存的产出（正文 / 推理 / 工具调用记录任一）。
 * agent 轮次中模型可能只调了工具、还没写正文就被中断——此时工具过程本身
 * 已是用户可见的产出（含工具生成的图片附件），不能按「空」丢弃。
 */
function hasRetainableContent(m: Message): boolean {
  return Boolean(m.content || m.reasoningContent || m.toolCalls?.length);
}

/**
 * 中止收尾（空删有留）：有部分内容（正文/推理/工具记录任一）标记 stopped 保留，空内容移除。
 * 与服务商计费语义同构（空退 failed / 有扣 partial）。
 * match 由调用方给定：编排层按消息 id 匹配，store 层按「正在流式的 assistant 消息」匹配。
 * keepEmptyStopped：用户主动停止（stop()）时置位——零产出也保留消息并标记 stopped，
 * 让「已停止 · 未生成内容」在会话里有迹可循；隐式中止（切会话/切模式）保持空删。
 */
function finalizeAbortedMessages(
  messages: Message[],
  match: (m: Message) => boolean,
  options?: { keepEmptyStopped?: boolean }
): { next: Message[]; changed: boolean } {
  const target = messages.find(match);
  // 未找到或已被收尾（isStreaming 已为 false）时不重复处理
  if (!target || !target.isStreaming) return { next: messages, changed: false };
  const next = hasRetainableContent(target)
    ? messages.map((m) =>
        m.id === target.id
          ? // 不再流式就必须没有 running 工具调用：中止时工具还没回 tool_result，
            // 不清洗的话过程卡片会永远停在「正在调用…」的转圈态（T07 实测发现）
            sanitizeToolCalls({ ...m, isStreaming: false, stopped: true })
          : m
      )
    : options?.keepEmptyStopped
      ? messages.map((m) =>
          m.id === target.id ? sanitizeToolCalls({ ...m, isStreaming: false, stopped: true }) : m
        )
      : messages.filter((m) => m.id !== target.id);
  return { next, changed: true };
}

/**
 * 清洗持久化消息里 toolCalls 的残留：
 * 1. 先按共享 schema 过滤形状非法的记录（localStorage 可被手工篡改，B-9）；
 * 2. 再把 running 中间态归一为 failed —— 刷新/崩溃时来不及收到 tool_result，
 *    running 记录会成为永久「进行中」的假象。
 * 无变化时返回原消息对象（loadConversation 用引用比较检测变更，避免重复写回）。
 */
function sanitizeToolCalls(m: Message): Message {
  if (!m.toolCalls?.length) return m;
  const valid = m.toolCalls.filter((c) => toolCallRecordSchema.safeParse(c).success);
  const hasRunning = valid.some((c) => c.status === 'running');
  if (valid.length === m.toolCalls.length && !hasRunning) return m;
  return {
    ...m,
    toolCalls: valid.map((c) =>
      c.status === 'running'
        ? { ...c, status: 'failed' as const, resultSummary: c.resultSummary || '执行未完成' }
        : c
    ),
  };
}

/**
 * 剥离过程旁白（二期）：旁白是过程性内容，只服务于本轮 live 展示，
 * 刷新还原时不恢复（spec D-二期-6「不入历史持久化」；流式期间 CONVERSATION_UPDATED
 * 落盘的会话列表快照里可能带着旁白，加载时在此剥离）。
 * 注意只挂在 loadConversation 还原路径：done/abort/failed 的 live 收尾共用
 * sanitizeToolCalls 但**不**剥离——收尾后用户仍应能在过程卡片里回看完整旁白。
 * 无旁白时返回原引用（loadConversation 用引用比较检测变更）。
 */
function stripAgentNotes(m: Message): Message {
  if (!m.agentNotes?.length) return m;
  return { ...m, agentNotes: undefined };
}

/**
 * 单聊会话流统一编排（评审 C6：sendMessage / reload 共用，删除重复模板）。
 *
 * 职责：streamChatResponse（fetch → !ok 抛错 → SSE 消费）+ 完成/失败/中止的语义映射：
 * - chunk/warning → 更新 assistant 消息（rAF 合帧每帧最多一次 setState，后台停帧时 1s 节流落盘仍正常工作）；
 * - 完成 → cancelAnimationFrame 并兜底 flush 最新文本，移除 isStreaming 并同步到会话列表，回调 onDone；
 * - AbortError → cancelAnimationFrame 并兜底 flush 最新文本，返回 aborted，不设错误、按空删有留原则收尾并同步会话（若未被调用方收尾）；
 * - 其他失败 → cancelAnimationFrame 并兜底 flush 最新文本，设错误，按有留空删原则收尾并同步会话（有内容保留并标记 failed，空内容移除）。
 * 调用方只负责：deps 注入、请求体构造、前置校验与历史保存钩子。
 */
export async function runChatStreamSession(
  deps: ChatStreamSessionDeps,
  assistantId: string,
  request: StreamChatRequest,
  onDone?: (finalMessages: Message[]) => void,
  options?: RunChatStreamSessionOptions
): Promise<ChatStreamOutcome> {
  const scheduleFlush = options?.scheduleFlush ?? defaultScheduleFlush;

  // 流中节流落盘：每秒最多同步一次会话列表，缩小刷新/切后台时部分内容丢失的窗口
  let lastPersistAt = 0;
  let streamUsage: ChatStreamUsage | undefined;
  // 过程旁白累计值的已消费长度（onAgentNote 回调为累计值，按此切增量）
  let agentNoteConsumedLength = 0;
  // 工具调用/结果/旁白三类低频事件共用的落盘出口：更新 state 后立即同步会话列表
  const persistConversation = (next: Message[]) => {
    const conversationId = deps.activeConversationId();
    if (conversationId) {
      const currentArtifacts = deps.getArtifacts ? deps.getArtifacts() : undefined;
      emit(StoreEvents.CONVERSATION_UPDATED, {
        id: conversationId,
        messages: next,
        ...(currentArtifacts ? { artifacts: currentArtifacts } : {}),
      });
    }
  };
  // 收尾残留的流式产物（正常结束缺 end 帧、中止、失败共用）：
  // 有上一版则丢弃草稿保留上一版，全新产物保留半成品并标记未完成。返回当前产物池与是否有变化
  const finalizeArtifacts = (): { artifacts: Artifact[] | undefined; changed: boolean } => {
    const before = deps.getArtifacts?.();
    deps.updateArtifacts?.((prev) => finalizeStreamingArtifacts(prev));
    const after = deps.getArtifacts?.();
    return { artifacts: after, changed: before !== after };
  };
  // 新一轮开始：清除上一轮的章节补丁合并标记与结果，使本轮补丁产生新版本（ADR-0037）
  deps.updateArtifacts?.((prev) => beginArtifactTurn(prev));
  try {
    await streamChatResponse(request, {
      onChunk: (text) => {
        // 分界点：首个 text-delta 到达即冻结推理时长（未开始推理时为空操作）
        freezeReasoningDuration(assistantId);

        // 1. rAF 合帧：更新暂存最新文本并调度帧刷新，每帧最多触发一次 setState
        let entry = contentFlushState.get(assistantId);
        if (!entry) {
          entry = { text, raf: null };
          contentFlushState.set(assistantId, entry);
        }
        entry.text = text;
        scheduleEntryFlush(assistantId, entry, deps, scheduleFlush);

        // 2. 渲染与落盘分离：1s 节流落盘留在 onChunk 同步路径（后台停帧时不受影响）
        // 基于 deps.getMessages 快照构造新消息列表并 emit，不经过 setState
        const now = Date.now();
        if (now - lastPersistAt >= 1000) {
          lastPersistAt = now;
          const conversationId = deps.activeConversationId();
          if (conversationId) {
            const currentMessages = deps.getMessages();
            const persistedMessages = currentMessages.map((m) =>
              m.id === assistantId ? { ...m, content: text } : m
            );
            emit(StoreEvents.CONVERSATION_UPDATED, { id: conversationId, messages: persistedMessages });
          }
        }
      },
      onReasoning: (reasoning) => {
        // 首个推理增量到达：记录思考开始时间戳（store 内部变量，不持久化）
        recordReasoningStart(assistantId);

        // 推理走与正文相同的 rAF 合帧机制：独立累加器，与正文同帧提交，每帧最多一次 setState
        let entry = contentFlushState.get(assistantId);
        if (!entry) {
          entry = { text: '', raf: null };
          contentFlushState.set(assistantId, entry);
        }
        entry.reasoning = reasoning;
        scheduleEntryFlush(assistantId, entry, deps, scheduleFlush);
      },
      onToolCall: (call) => {
        // 工具调用开始：追加一条 running 记录（agent 模式）。
        // 低频事件（一轮至多几次），直接落 state 与本地存储即可，不参与正文的合帧节流；
        // 立即落盘是为了让「图片生成中」这类长耗时工具在刷新后仍有踪迹（spec §8）。
        const next = deps.updateMessages((messages) =>
          messages.map((m) => {
            if (m.id !== assistantId) return m;
            const prev = m.toolCalls ?? [];
            // 幂等：同一 callId 重复到达（重放/乱序）不追加第二条
            if (prev.some((c) => c.id === call.id)) return m;
            return {
              ...m,
              toolCalls: [
                ...prev,
                {
                  id: call.id,
                  name: call.name,
                  argsSummary: call.argsSummary,
                  status: 'running' as const,
                  resultSummary: '',
                },
              ],
            };
          })
        );
        persistConversation(next);
      },
      onToolResult: (result) => {
        // 工具执行结束：按 callId 落到终态；若 tool_call 未到达（事件丢失）则补一条完整记录，避免过程缺失。
        // 工具产出附件（当前仅生成图片）并入消息附件列表，与用户附件共用同一渲染通道。
        const next = deps.updateMessages((messages) =>
          messages.map((m) => {
            if (m.id !== assistantId) return m;
            const prev = m.toolCalls ?? [];
            const nextCalls = prev.some((c) => c.id === result.callId)
              ? prev.map((c) =>
                  c.id === result.callId
                    ? {
                        ...c,
                        status: result.status,
                        resultSummary: result.summary,
                        ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
                      }
                    : c
                )
              : [
                  ...prev,
                  {
                    id: result.callId,
                    name: result.name,
                    argsSummary: '',
                    status: result.status,
                    resultSummary: result.summary,
                    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
                  },
                ];

            const attachmentId = `tool-${result.callId}`;
            const prevAttachments = m.attachments ?? [];
            const nextAttachments =
              result.attachment && !prevAttachments.some((a) => a.id === attachmentId)
                ? [
                    ...prevAttachments,
                    {
                      id: attachmentId,
                      type: 'image' as const,
                      name: '工具生成的图片',
                      // 直接用上游产物地址：展示型 <img> 不需要 CORS，实测浏览器可正常加载。
                      // 刻意**不走** /api/image/proxy —— 该代理是为「下载成 Blob / dataURL」设计的，
                      // 多一跳只会多绑一份白名单约束；图像页下载仍走代理（见 media-proxy-policy）。
                      imageUrl: result.attachment.url,
                      status: 'ready' as const,
                    },
                  ]
                : m.attachments;

            const nextCitations = result.citations
              ? { ...(m.citations ?? {}), ...result.citations }
              : m.citations;

            return {
              ...m,
              toolCalls: nextCalls,
              attachments: nextAttachments,
              ...(nextCitations ? { citations: nextCitations } : {}),
            };
          })
        );
        persistConversation(next);
      },
      onAgentNote: (accumulatedNote) => {
        // 过程旁白（agent 二期）：onAgentNote 与 onChunk 同形、回调的是累计值，
        // 这里按已消费长度切出增量（服务端每个 agent_note 事件携带一整轮旁白，故增量即一整条）。
        // 低频事件，与 tool_call 同级处理；不进正文、不随历史拍平持久化。
        const delta = accumulatedNote.slice(agentNoteConsumedLength);
        agentNoteConsumedLength = accumulatedNote.length;
        if (!delta) return;
        const next = deps.updateMessages((messages) =>
          messages.map((m) => {
            if (m.id !== assistantId) return m;
            const entry = { beforeCallIndex: m.toolCalls?.length ?? 0, text: delta };
            return { ...m, agentNotes: [...(m.agentNotes ?? []), entry] };
          })
        );
        persistConversation(next);
      },
      onArtifactStart: (artifact) => {
        // 经版本引擎演进产物池：同 identifier 再生成从空草稿开始，不再拼接旧正文（ADR-0037）
        deps.updateArtifacts?.((prev) =>
          applyArtifactEvent(prev, { type: 'artifact_start', artifact }, Date.now())
        );
        deps.setActiveArtifactId?.(artifact.id);
        deps.setWorkspaceOpen?.(true);

        const next = deps.updateMessages((messages) =>
          messages.map((m) => {
            if (m.id !== assistantId) return m;
            const prevIds = m.artifactIds ?? [];
            if (prevIds.includes(artifact.id)) return m;
            return { ...m, artifactIds: [...prevIds, artifact.id] };
          })
        );
        persistConversation(next);
      },
      onArtifactDelta: (id, delta) => {
        deps.updateArtifacts?.((prev) =>
          applyArtifactEvent(prev, { type: 'artifact_delta', id, delta }, Date.now())
        );
      },
      onArtifactEnd: (id, status) => {
        const reportedBefore = deps.getArtifacts?.().find((a) => a.id === id)?.patchReport?.length ?? 0;
        deps.updateArtifacts?.((prev) =>
          applyArtifactEvent(prev, { type: 'artifact_end', id, status }, Date.now())
        );
        // 章节补丁结果埋点：本次新增的每条结果各上报一次，失败事件不含章节标题（ADR-0037 §8）
        const settled = deps.getArtifacts?.().find((a) => a.id === id);
        if (settled?.patchReport) {
          const versions = getArtifactVersions(settled);
          const base = {
            type: settled.type,
            versionSeq: versions[versions.length - 1]?.seq ?? 1,
            contentLength: settled.content.length,
          };
          for (const result of settled.patchReport.slice(reportedBefore)) {
            trackArtifactEvent(
              result.status === 'applied' ? 'artifact.patch_applied' : 'artifact.patch_failed',
              base
            );
          }
        }
        persistConversation(deps.getMessages());
      },
      onWarning: (warning) => {
        deps.updateMessages((messages) =>
          messages.map((m) => (m.id === assistantId ? { ...m, truncationWarning: warning } : m))
        );
      },
      onDone: (usage) => {
        streamUsage = usage;
      },
    });

    // 完成：先 cancelAnimationFrame 并用最新正文/推理兜底 flush
    // （合并写入最新 content、reasoningContent、reasoningDurationMs 与 usage，移除 isStreaming 标记）
    const latest = flushLatestContentAndClear(assistantId);
    // 分界点：done（首个 text-delta 未到达过的纯推理流在此冻结；已冻结则取原值）
    const reasoningDurationMs = freezeReasoningDuration(assistantId);
    const finalMessages = deps.updateMessages((messages) =>
      messages.map((m) => {
        if (m.id !== assistantId) return m;
        // 「不再流式 ⇒ 不存在 running 工具调用」是统一不变式：
        // 正常结束也走一道清洗，兜住 tool_result 事件缺失时残留的进行中态。
        return {
          ...sanitizeToolCalls(mergeLatestStreamContent(m, latest, reasoningDurationMs)),
          isStreaming: false,
          ...(streamUsage ? { usage: streamUsage } : {}),
        };
      })
    );
    const conversationId = deps.activeConversationId();
    if (conversationId) {
      const currentArtifacts = finalizeArtifacts().artifacts;
      emit(StoreEvents.CONVERSATION_UPDATED, {
        id: conversationId,
        messages: finalMessages,
        ...(currentArtifacts ? { artifacts: currentArtifacts } : {}),
      });
    }
    onDone?.(finalMessages);
    return 'sent';
  } catch (err) {
    // 中止/失败收尾前必须 cancelAnimationFrame 并用最新正文/推理兜底 flush
    // 现有「中止/失败」的「空删有留」判断基于 store 里的 content/reasoningContent 判空，兜底 flush 必须先于它们执行
    const latest = flushLatestContentAndClear(assistantId);
    // 分界点：error / abort 冻结推理时长（先到先冻，已冻结则取原值）
    const reasoningDurationMs = freezeReasoningDuration(assistantId);
    if (latest !== undefined || reasoningDurationMs !== undefined) {
      deps.updateMessages((messages) =>
        messages.map((m) =>
          m.id === assistantId ? mergeLatestStreamContent(m, latest, reasoningDurationMs) : m
        )
      );
    }

    // 用户主动取消不算错误：按空删有留收尾并同步会话（已被调用方同步收尾时幂等跳过）
    if (err instanceof Error && err.name === 'AbortError') {
      let result = { next: [] as Message[], changed: false };
      deps.updateMessages((messages) => {
        result = finalizeAbortedMessages(messages, (m) => m.id === assistantId);
        return result.next;
      });
      const abortedArtifacts = finalizeArtifacts();
      if (result.changed || abortedArtifacts.changed) {
        const conversationId = deps.activeConversationId();
        if (conversationId) {
          emit(StoreEvents.CONVERSATION_UPDATED, {
            id: conversationId,
            messages: result.changed ? result.next : deps.getMessages(),
            ...(abortedArtifacts.artifacts ? { artifacts: abortedArtifacts.artifacts } : {}),
          });
        }
      }
      return 'aborted';
    }

    deps.setError(err instanceof Error ? err : new Error('未知错误'));
    // 失败收尾（有留空删）：有部分内容（正文/推理/工具记录任一）保留并标记 failed（用户已读内容不丢），空内容移除
    const filtered = deps.updateMessages((messages) => {
      const target = messages.find((m) => m.id === assistantId);
      if (!target) return messages;
      if (hasRetainableContent(target)) {
        return messages.map((m) =>
          m.id === assistantId
            ? sanitizeToolCalls({ ...m, isStreaming: false, failed: true })
            : m
        );
      }
      return messages.filter((m) => m.id !== assistantId);
    });
    const failedArtifacts = finalizeArtifacts().artifacts;
    const conversationId = deps.activeConversationId();
    if (conversationId) {
      emit(StoreEvents.CONVERSATION_UPDATED, {
        id: conversationId,
        messages: filtered,
        ...(failedArtifacts ? { artifacts: failedArtifacts } : {}),
      });
    }
    return 'failed';
  } finally {
    // 最终防御：确保清理模块级 Map 条目，防止内存泄漏
    flushLatestContentAndClear(assistantId);
    reasoningTimingState.delete(assistantId);
  }
}

// ==================== Store 实现 ====================

export const useChatStore = create<ChatState>((set, get) => {
  // AbortController 实例：用于取消正在进行的网络请求
  // 不作为响应式状态，避免触发不必要的重新渲染
  let abortController: AbortController | null = null;

  // 产物上下文请求字段（ADR-0037 §4）：无可编辑产物时返回空对象，请求体与改造前一致
  const artifactContextField = (): { artifactContext?: ArtifactContextRequest } => {
    const { artifacts, activeArtifactId, isWorkspaceOpen } = get();
    const artifactContext = buildArtifactContextRequest({ artifacts, activeArtifactId, isWorkspaceOpen });
    return artifactContext ? { artifactContext } : {};
  };

  // 统一会话编排的依赖注入（评审 C6）：把消息/错误/当前会话 id 的读写交给 store
  const sessionDeps = (): ChatStreamSessionDeps => ({
    getMessages: () => get().messages,
    updateMessages: (updater) => {
      const next = updater(get().messages);
      set({ messages: next });
      return next;
    },
    setError: (error) => set({ error }),
    activeConversationId: () => get().activeConversationId,
    getArtifacts: () => get().artifacts,
    updateArtifacts: (updater) => {
      const next = updater(get().artifacts);
      set({ artifacts: next });
    },
    setActiveArtifactId: (id) => set({ activeArtifactId: id }),
    setWorkspaceOpen: (open) => set({ isWorkspaceOpen: open }),
  });

  // 中止前同步收尾当前流式消息：有部分内容标记 stopped 并同步会话列表落盘，空内容删除。
  // keepEmptyStopped 仅用户主动停止（stop()）置位：零产出也保留消息标记 stopped，
  // 让「已停止 · 未生成内容」在会话里有迹可循；其余隐式中止路径（切会话/重载/再发送）维持空删
  const finalizeStreamingMessage = (options?: { keepEmptyStopped?: boolean }) => {
    const { messages, activeConversationId } = get();
    const streamingAssistant = messages.find(
      (m) => m.isStreaming === true && m.role === 'assistant'
    );
    if (streamingAssistant) {
      // 若存在未 flush 的最新正文/推理，先取消调度并同步最新内容
      const latest = flushLatestContentAndClear(streamingAssistant.id);
      if (latest !== undefined) {
        streamingAssistant.content = latest.text;
        if (latest.reasoning !== undefined) {
          streamingAssistant.reasoningContent = latest.reasoning;
        }
      }
      // 分界点：abort 冻结推理时长（先到先冻；未开始推理时不写字段）
      const reasoningDurationMs = freezeReasoningDuration(streamingAssistant.id);
      if (reasoningDurationMs !== undefined) {
        streamingAssistant.reasoningDurationMs = reasoningDurationMs;
      }
      reasoningTimingState.delete(streamingAssistant.id);
    }
    const { next, changed } = finalizeAbortedMessages(
      messages,
      (m) => m.isStreaming === true && m.role === 'assistant',
      { keepEmptyStopped: options?.keepEmptyStopped }
    );
    if (!changed) return;
    set({ messages: next });
    if (activeConversationId) {
      emit(StoreEvents.CONVERSATION_UPDATED, { id: activeConversationId, messages: next });
    }
  };

  return {
    // ========== 初始状态 ==========
    messages: [], // 空消息列表
    input: '', // 空输入框
    isLoading: false, // 未加载
    error: null, // 无错误
    provider: 'xunfei', // 默认使用讯飞星火
    model: undefined, // 使用默认模型
    activeConversationId: null, // 无激活对话
    attachment: null, // 无附件
    activeCapabilityPackKey: null, // 当前无激活场景能力包
    toolOverrides: {}, // 当前无工具覆盖字典（ADR-0014 / 工单 02）
    artifacts: [], // 产物集合池（ADR-0015）
    activeArtifactId: null, // 当前工作台聚焦产物 ID
    isWorkspaceOpen: false, // 桌面端工作台是否展开
    viewingVersions: {}, // 无历史版本查看态

    // ========== 基础操作方法 ==========

    // 设置输入框内容
    setInput: (value) => set({ input: value }),

    // 设置消息列表
    setMessages: (messages) => set({ messages }),

    // 设置附件
    setAttachment: (attachment) => set({ attachment }),

    // 设置当前激活的场景能力包
    setCapabilityPackKey: (key) => set({ activeCapabilityPackKey: key }),

    // 设置工作台聚焦产物
    setActiveArtifactId: (id) => set({ activeArtifactId: id }),

    // 开关工作台分栏
    setWorkspaceOpen: (open) => set({ isWorkspaceOpen: open }),

    // 关闭工作台分栏
    closeWorkspace: () => set({ isWorkspaceOpen: false }),

    // 切换查看产物版本：选择当前版（末尾版本）等同于回到当前版，不留历史查看态
    viewArtifactVersion: (artifactId, seq) => {
      const { artifacts, viewingVersions } = get();
      const artifact = artifacts.find((a) => a.id === artifactId);
      const versions = artifact ? getArtifactVersions(artifact) : [];
      const isHistorical =
        seq !== null &&
        versions.some((v) => v.seq === seq) &&
        seq !== versions[versions.length - 1]?.seq;
      if (isHistorical) {
        set({ viewingVersions: { ...viewingVersions, [artifactId]: seq } });
      } else if (artifactId in viewingVersions) {
        const { [artifactId]: _removed, ...rest } = viewingVersions;
        set({ viewingVersions: rest });
      }
    },

    // 追加式回滚（ADR-0037）：把所选历史版本复制为新的末尾版本，工作台随即回到新当前版
    rollbackArtifactToVersion: (artifactId, seq) => {
      const { artifacts, viewingVersions, messages, activeConversationId } = get();
      let changed = false;
      const next = artifacts.map((art) => {
        if (art.id !== artifactId) return art;
        const rolled = rollbackArtifact(art, seq, Date.now());
        if (rolled !== art) changed = true;
        return rolled;
      });
      if (!changed) return;
      const { [artifactId]: _removed, ...restViewing } = viewingVersions;
      set({ artifacts: next, viewingVersions: restViewing });
      // 回滚产生新版本，同步落盘会话产物池
      if (activeConversationId) {
        emit(StoreEvents.CONVERSATION_UPDATED, {
          id: activeConversationId,
          messages,
          artifacts: next,
        });
      }
    },

    // 标记产物已入库 (ADR-0034)；入库状态绑定当时的当前版本（ADR-0037）
    markArtifactDeposited: (artifactId, info) => {
      const current = get().artifacts;
      const next = current.map((art) => {
        if (art.id === artifactId) {
          const versions = getArtifactVersions(art);
          const currentVersion = versions[versions.length - 1];
          return {
            ...art,
            kbDeposit: {
              deposited: true,
              knowledgeBaseId: info.knowledgeBaseId,
              knowledgeBaseName: info.knowledgeBaseName,
              documentId: info.documentId,
              depositedAt: info.depositedAt,
              ...(currentVersion ? { versionId: currentVersion.id } : {}),
            },
          };
        }
        return art;
      });
      set({ artifacts: next });
    },


    // 切换单个工具的临时启停状态
    setToolOverride: (toolKey, enabled) => {
      const current = get().toolOverrides;
      const next = { ...current, [toolKey]: enabled };
      set({ toolOverrides: next });
      const conversationId = get().activeConversationId;
      if (conversationId) {
        emit(StoreEvents.CONVERSATION_TOOL_OVERRIDES_UPDATED, {
          id: conversationId,
          toolOverrides: next,
        });
      }
    },

    // 批量设置工具覆盖字典
    setToolOverrides: (overrides) => {
      const next = { ...overrides };
      set({ toolOverrides: next });
      const conversationId = get().activeConversationId;
      if (conversationId) {
        emit(StoreEvents.CONVERSATION_TOOL_OVERRIDES_UPDATED, {
          id: conversationId,
          toolOverrides: next,
        });
      }
    },

    // 切换AI提供商和模型
    // 切换时会清空附件（因为不同提供商支持的附件类型可能不同）
    // 但保留接力图片（有 sourceId 的附件）以支持图片接力场景
    switchProvider: (provider, model) =>
      set((state) => ({
        provider,
        model,
        // 只清空非接力图片（无 sourceId 的附件）
        attachment: state.attachment?.sourceId ? state.attachment : null,
      })),

    // 加载历史对话
    // 用于从对话列表切换到某个历史对话（支持还原绑定的能力包、工具覆盖与产物池，ADR-0014 / ADR-0015）
    loadConversation: (id, messages, provider, model, capabilityPack, toolOverrides, artifacts) => {
      // 停止之前的AI生成（如果有）
      finalizeStreamingMessage();
      if (abortController) {
        abortController.abort();
        abortController = null;
      }

      // 清洗历史消息：处理持久化数据中残留的流式消息（有内容标记 stopped，无内容直接过滤）
      // 判空口径与「有留空删」一致：正文/推理/工具记录任一非空即算有内容
      // 另：toolCalls 里残留的 running 中间态一并归一为 failed（刷新时未收到 tool_result）；
      // 过程旁白（agentNotes）属过程性内容，还原时剥离不恢复（spec D-二期-6）
      const sanitizedMessages = messages
        .filter((m) => !(m.isStreaming && !hasRetainableContent(m)))
        .map((m) =>
          stripAgentNotes(
            sanitizeToolCalls(m.isStreaming ? { ...m, isStreaming: false, stopped: true } : m)
          )
        );
      // 清洗有实际变化时回写会话列表，避免持久化层残留脏数据、每次加载重复清洗
      const sanitizedChanged =
        sanitizedMessages.length !== messages.length ||
        sanitizedMessages.some((m, i) => m !== messages[i]);
      // 还原路径收尾残留的流式产物（刷新/崩溃时来不及收到 artifact_end），避免卡在假进度（ADR-0037）
      const finalizedArtifacts = artifacts ? finalizeStreamingArtifacts(artifacts) : undefined;
      const artifactsChanged = finalizedArtifacts !== artifacts;
      if (sanitizedChanged || artifactsChanged) {
        emit(StoreEvents.CONVERSATION_UPDATED, {
          id,
          messages: sanitizedMessages,
          ...(finalizedArtifacts ? { artifacts: finalizedArtifacts } : {}),
        });
      }

      // 过滤掉纯图片的冗余产物（图片已由消息流原生卡片直接承载，不污染工作台）
      const initialArtifacts = (finalizedArtifacts ? [...finalizedArtifacts] : []).filter(
        (a) => a.type !== 'image'
      );
      const latestArtifactId = initialArtifacts.length > 0 ? initialArtifacts[initialArtifacts.length - 1].id : null;

      // 更新状态
      set({
        activeConversationId: id, // 设置当前对话ID
        messages: sanitizedMessages, // 加载清洗后的历史消息
        provider: provider as ProviderName, // 恢复之前使用的提供商
        model, // 恢复之前使用的模型
        activeCapabilityPackKey: capabilityPack ?? null, // 恢复绑定的场景能力包
        toolOverrides: toolOverrides ? { ...toolOverrides } : {}, // 恢复会话级工具覆盖字典
        artifacts: initialArtifacts, // 恢复会话级产物池（ADR-0015）
        activeArtifactId: latestArtifactId, // 聚焦最新产物
        viewingVersions: {}, // 切换会话后不沿用上一会话的历史版本查看态
        isWorkspaceOpen: false, // 加载历史会话保持单栏沉浸阅读，不强行分屏打扰（可由用户点击顶部或卡片按需展开）
        input: '', // 清空输入框
        isLoading: false, // 重置加载状态
        error: null, // 清空错误
      });
    },

    // 重置聊天状态
    // 用于开始新对话
    reset: () => {
      // 停止之前的AI生成（如果有）
      finalizeStreamingMessage();
      if (abortController) {
        abortController.abort();
        abortController = null;
      }

      // 重置所有状态
      set({
        messages: [], // 清空消息
        input: '', // 清空输入框
        isLoading: false, // 重置加载状态
        error: null, // 清空错误
        activeConversationId: null, // 清空对话ID
        activeCapabilityPackKey: null, // 清空能力包选择
        toolOverrides: {}, // 清空工具覆盖字典
        artifacts: [], // 清空产物池
        activeArtifactId: null, // 清空活动产物
        viewingVersions: {}, // 清空历史版本查看态
        isWorkspaceOpen: false, // 关闭工作台
        // 注意：provider 和 model 保持不变，保留用户的选择
      });
    },

    // 停止AI生成
    // 用于用户主动中断AI回复
    stop: () => {
      // 中止前同步收尾当前流式消息（keepEmptyStopped：用户主动停止，空产出也留「已停止」痕迹）
      finalizeStreamingMessage({ keepEmptyStopped: true });
      // 取消网络请求
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      // 更新加载状态
      set({ isLoading: false });
    },

    // 发送消息
    sendMessage: async (contentOverrides, derivation) => {
      const {
        input,
        provider,
        model,
        isLoading,
        activeConversationId,
        attachment,
        activeCapabilityPackKey,
        toolOverrides,
      } = get();
      const content = contentOverrides || input;
      // agent 模式开关（settings-store）。仅在开启时往请求体带标志，
      // 关闭时请求体与现状逐字节一致 —— 老链路的降级无感知由这里保证。
      const agentMode = useSettingsStore.getState().agentModeEnabled;
      // 深度思考模式开关（ADR-0016 / 工单 03）
      const thinkingMode = useSettingsStore.getState().thinkingModeEnabled;
      // 会话级临时停用工具差异项（ADR-0014 / 工单 02）：仅提取当前会话中值为 false 的工具
      const disabledToolKeys = Object.entries(toolOverrides)
        .filter(([_, enabled]) => enabled === false)
        .map(([key]) => key);

      // 有附件时允许空文本，否则需要文本内容
      if ((!content.trim() && !attachment) || isLoading) return 'skipped';

      // 附件只能在豆包模型下使用（agent 模式服务端强制走豆包，故此时一并放行）
      if (attachment && provider !== 'doubao' && !agentMode) {
        set({ error: new Error('附件功能仅支持豆包模型') });
        return 'skipped';
      }

      // 附件必须准备就绪
      if (attachment && attachment.status !== 'ready') {
        set({ error: new Error('附件尚未准备就绪') });
        return 'skipped';
      }

      // 1. 中断之前的请求（finalize 可能改动消息列表，其后必须重新读取最新快照）
      finalizeStreamingMessage();
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();
      const currentMessages = get().messages;

      // 2. 构造消息对象
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        // 包含附件
        attachments: attachment ? [attachment] : undefined,
      };

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      // 3. 更新 UI 状态
      const newMessages = [...currentMessages, userMessage, assistantMessage];
      set({
        messages: newMessages,
        input: '',
        isLoading: true,
        error: null,
        // 清空附件
        attachment: null,
      });

      // 同步到对话列表（通过事件总线，避免静态依赖）
      if (activeConversationId) {
        emit(StoreEvents.CONVERSATION_UPDATED, { id: activeConversationId, messages: newMessages });
      }

      try {
        // ===== 4-9. 流式消费 + 完成/失败/中止的语义映射（统一编排 runChatStreamSession，评审 C6） =====
        // 前置校验已在上方完成；历史保存/接力派生经 onDone 钩子
        const outcome = await runChatStreamSession(
          sessionDeps(),
          assistantMessage.id,
          {
            body: {
              // 发送历史消息 + 新用户消息
              messages: [...currentMessages, userMessage].map((m) => ({
                role: m.role,
                content: m.content,
                attachments: m.attachments,
              })),
              provider, // AI提供商
              model, // 模型名称
              thinking: thinkingMode, // 深度思考模式开关（ADR-0016 / 工单 03）
              // agent 模式：服务端据此切到支持 function calling 的模型、走工具编排、按 chat-agent 计费（spec §5.2）
              ...(agentMode ? { agent: true } : {}),
              // 场景能力包（ADR-0014 / 工单 01）：带上所选能力包 key
              ...(agentMode && activeCapabilityPackKey ? { capabilityPack: activeCapabilityPackKey } : {}),
              // 会话级临时停用工具（ADR-0014 / 工单 02）：仅在有被关闭工具时携带差异项
              ...(agentMode && disabledToolKeys.length > 0 ? { disabledToolKeys } : {}),
              // 产物上下文（ADR-0037 §4）：仅 agent 模式且存在可编辑产物时携带；
              // 工作台展开才带聚焦产物全文，关闭时只带目录
              ...(agentMode ? artifactContextField() : {}),
            },
            signal: abortController.signal, // 支持取消请求
          },
          (finalMessages) => {
            // 保存到历史记录（携带接力派生元数据，REQ-016「由某来源接力生成」）
            if (finalMessages.length >= 2 && activeConversationId) {
              // 至少有一轮对话才保存
              const historyItem = {
                id: activeConversationId, // 使用对话ID作为历史记录ID
                ...createChatHistoryItem(
                  // 保留 agent 工具记录与工具产出附件（B-10：历史入口恢复后可回看过程与生成图）；
                  // 用户上传附件是 base64 dataURL，刻意不入历史，避免撑爆 localStorage
                  finalMessages.map((m) => ({
                    role: m.role,
                    content: m.content,
                    ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}),
                    ...(m.attachments?.some((a) => a.id.startsWith('tool-'))
                      ? { attachments: m.attachments.filter((a) => a.id.startsWith('tool-')) }
                      : {}),
                  })),
                  provider,
                  model || 'unknown'
                ),
                // 接力派生：成功才记录（失败/取消时已由目标侧保留引用，不进此分支）
                ...(derivation ?? {}),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              emit(StoreEvents.CHAT_HISTORY_SAVED, { item: historyItem });
            }
          }
        );
        if (outcome === 'sent') {
          void checkAndWarnLowBalance(activeConversationId);
        }
        return outcome;
      } finally {
        // ===== 10. 清理工作 =====
        set({ isLoading: false }); // 重置加载状态
        abortController = null; // 清空 AbortController
      }
    },

    // 重新生成
    reload: async (msgId) => {
      const { messages, isLoading, provider, model, activeConversationId } = get();
      if (isLoading) return;
      // 重新生成沿用当前的 agent 开关与思考模式状态（与 sendMessage 同一来源）
      const agentMode = useSettingsStore.getState().agentModeEnabled;
      const thinkingMode = useSettingsStore.getState().thinkingModeEnabled;

      // 最后一轮 user 消息定位（无参 = 重新生成最后一次）
      let lastUserIndex = messages.length - 1;
      while (lastUserIndex >= 0 && messages[lastUserIndex].role !== 'user') lastUserIndex--;
      if (lastUserIndex === -1) return;

      let index = lastUserIndex;
      if (msgId) {
        const found = messages.findIndex((m) => m.id === msgId);
        if (found === -1 || messages[found].role !== 'user') return;
        // 线性会话无分支模型：仅允许重新生成最后一轮；
        // 中间轮重生成会静默丢弃后续消息（数据丢失缺陷修复）
        if (found !== lastUserIndex) {
          console.warn('[chat] 仅支持重新生成最后一轮回答，已忽略对历史轮次的请求');
          return;
        }
        index = found;
      }

      const history = messages.slice(0, index);
      const content = messages[index].content;

      // 中断
      if (abortController) abortController.abort();
      abortController = new AbortController();

      // 构造新消息
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
      };
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      const newMessages = [...history, userMessage, assistantMessage];

      set({
        messages: newMessages,
        isLoading: true,
        error: null,
      });

      if (activeConversationId) {
        emit(StoreEvents.CONVERSATION_UPDATED, { id: activeConversationId, messages: newMessages });
      }

      try {
        // 会话流统一编排（评审 C6），与 sendMessage 共用三态归一；
        // reload 不需要历史保存钩子（沿用既有会话记录）
        const outcome = await runChatStreamSession(
          sessionDeps(),
          assistantMessage.id,
          {
            body: {
              messages: [...history, userMessage].map((m) => ({
                role: m.role,
                content: m.content,
              })),
              provider,
              model,
              thinking: thinkingMode,
              ...(agentMode ? { agent: true } : {}),
              // 重新生成沿用同一份产物上下文来源（ADR-0037 §4）
              ...(agentMode ? artifactContextField() : {}),
            },
            signal: abortController.signal,
          }
        );
        if (outcome === 'sent') {
          void checkAndWarnLowBalance(activeConversationId);
        }
      } finally {
        set({ isLoading: false });
        abortController = null;
      }
    },
  };
});

// 仅在本地开发或 E2E 自动化测试环境向 window 暴露用于状态校验，生产环境严格禁用
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as { __chatStore?: typeof useChatStore }).__chatStore = useChatStore;
}

