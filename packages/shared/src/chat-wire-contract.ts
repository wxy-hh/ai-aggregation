/**
 * 聊天请求传输契约（评审 C4 / ADR-0050）。
 *
 * 与输出方向的 ChatStreamEvent（chat-stream-contract.ts）对称：输入方向在此定义
 * 窄消息形状（WireMessage）、白名单运行时解析与请求投影，作为前后端共享的唯一事实源。
 *
 * 解析语义（ADR-0050 决策 2/3）：
 * - 白名单静默剥离（strip）：未知字段一律丢弃，不 400 也不透传（兼容旧缓存客户端）；
 * - 布尔门控（agent/thinking）只认严格 true，其余脏值归一化为 false（B-7 计费安全，不 400）；
 * - 已知字段值非法（role/content/附件类型/provider 等）→ 拒绝并带 details 路径；
 * - 历史（非末条）消息附件缺载荷 → 自愈剥离该附件、保留消息；末条消息附件缺载荷 → 拒绝；
 * - 末条消息 content 须「非空 || 有有效附件」。
 */

// ==================== 形状 ====================

/** 线上附件：服务端 adapter 仅消费这三个载荷字段 + 可选文件名 */
export interface WireAttachment {
  type: 'image' | 'file';
  imageUrl?: string;
  fileId?: string;
  /** 可选文件名（服务端截断 255 字符），供模型上下文提示与多模态演进 */
  name?: string;
}

/** 线上消息：窄化的聊天传输形状，前端快照的流式/UI 字段一律不上线 */
export interface WireMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: WireAttachment[];
}

/** 审批恢复载荷（ADR-0041）：形状由契约校验，签名与绑定由服务端验签 */
export interface ApprovalResumePayload {
  token: string;
  callId: string;
  toolName: string;
  params: Record<string, unknown>;
}

export const CHAT_SCENES = ['single', 'compare'] as const;
export type ChatScene = (typeof CHAT_SCENES)[number];

/** 聊天请求体（parseChatRequestBody 成功产出的归一化形状） */
export interface ChatRequestBody {
  messages: WireMessage[];
  /** 缺省 'xunfei'（契约内默认值，取代调用方逐处兜底） */
  provider: ChatWireProvider;
  /** 普通聊天或对比模式；旧客户端缺省归为 single */
  chatScene: ChatScene;
  model?: string;
  thinking: boolean;
  agent: boolean;
  capabilityPack?: string;
  disabledToolKeys?: string[];
  /** 原始产物上下文载荷，仅 agent 模式保留；长度与标题复核由 resolveArtifactContext 负责（ADR-0037） */
  artifactContext?: unknown;
  approvalResume?: ApprovalResumePayload;
  /** 审批凭证绑定的会话范围（ADR-0041，与 conversationId 分离），默认 '' */
  approvalScope: string;
  conversationId?: string;
  /** 稳定轮次标识：客户端当前轮用户消息的本地 ID，用于记忆输入消息幂等（ADR-0058） */
  turnId?: string;
  requestId?: string;
  reservationId?: string;
}

/** 解析拒绝时的结构化错误（errorId 由路由层注入请求关联标识） */
export interface ChatRequestParseError {
  /** 用户可读中文文案 */
  message: string;
  /** 机器可读错误码（INVALID_MESSAGES / INVALID_CHAT_REQUEST / INVALID_APPROVAL_RESUME） */
  code: string;
  /** 逐字段路径明细，供前端针对性映射与测试断言 */
  details: Array<{ path: string; message: string }>;
}

export type ChatRequestParseResult =
  | { ok: true; body: ChatRequestBody }
  | { ok: false; error: ChatRequestParseError };

// ==================== 常量 ====================

export const CHAT_WIRE_PROVIDERS = ['xunfei', 'doubao', 'deepseek'] as const;
export type ChatWireProvider = (typeof CHAT_WIRE_PROVIDERS)[number];

const WIRE_ROLES = ['user', 'assistant', 'system'] as const;
type WireRole = (typeof WIRE_ROLES)[number];

/** 单条 content 上限（字符）：防合规检测正则 ReDoS 与超额 token 估算 */
export const WIRE_CONTENT_MAX = 64_000;
/** 单条消息附件数上限 */
export const WIRE_ATTACHMENTS_MAX = 5;
/** imageUrl（base64 Data URL）字符串长度上限，约 10MB 图片 */
export const WIRE_IMAGE_URL_MAX = 15_000_000;
/** 附件文件名截断上限 */
export const WIRE_NAME_MAX = 255;
/** 审批范围与会话标识截断上限 */
export const WIRE_SCOPE_MAX = 200;
export const WIRE_ID_MAX = 128;
/** 批量预留模型数上限（客户端 MAX_COMPARE_MODELS=4 的一倍裕量） */
export const BATCH_MODELS_MAX = 8;

// ==================== 附件窄化 ====================

/**
 * 把任意附件输入窄化为契约形状；缺载荷（image 无 imageUrl / file 无 fileId）返回 null。
 * 返回 null 的语义分两层：历史轮次由调用方静默剥离，当前发送轮次由调用方硬阻断（不静默吞图）。
 */
export function toWireAttachment(input: unknown): WireAttachment | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type;
  if (type !== 'image' && type !== 'file') return null;
  if (type === 'image') {
    if (typeof raw.imageUrl !== 'string' || !raw.imageUrl) return null;
  } else if (typeof raw.fileId !== 'string' || !raw.fileId) {
    return null;
  }
  const wire: WireAttachment = { type };
  if (type === 'image') wire.imageUrl = raw.imageUrl as string;
  else wire.fileId = raw.fileId as string;
  if (typeof raw.name === 'string' && raw.name) {
    wire.name = raw.name.slice(0, WIRE_NAME_MAX);
  }
  return wire;
}

// ==================== 消息解析 ====================

function fail(
  code: string,
  message: string,
  details: Array<{ path: string; message: string }>
): { ok: false; error: ChatRequestParseError } {
  return { ok: false, error: { code, message, details } };
}

type MessageParseResult = { ok: true; message: WireMessage } | { ok: false; error: ChatRequestParseError };

/**
 * 解析单条线上消息。
 * isLast 为 true 时执行严格语义（末条 content 联合校验、附件缺载荷拒绝）；
 * 历史消息则自愈剥离损坏附件，保证会话不因单条历史污损而死锁（ADR-0050 决策 3）。
 */
function parseWireMessage(raw: unknown, index: number, isLast: boolean): MessageParseResult {
  const base = `messages.${index}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('INVALID_CHAT_REQUEST', '消息格式不合法', [
      { path: base, message: '消息必须是对象' },
    ]);
  }
  const m = raw as Record<string, unknown>;

  if (!WIRE_ROLES.includes(m.role as WireRole)) {
    return fail('INVALID_CHAT_REQUEST', '消息格式不合法', [
      { path: `${base}.role`, message: '不支持的消息角色' },
    ]);
  }
  if (typeof m.content !== 'string') {
    return fail('INVALID_CHAT_REQUEST', '消息格式不合法', [
      { path: `${base}.content`, message: '消息内容必须是字符串' },
    ]);
  }
  if (m.content.length > WIRE_CONTENT_MAX) {
    return fail('INVALID_CHAT_REQUEST', '消息内容超出最大长度限制', [
      { path: `${base}.content`, message: `单条消息内容不能超过 ${WIRE_CONTENT_MAX} 字符` },
    ]);
  }

  let attachments: WireAttachment[] | undefined;
  if (m.attachments !== undefined) {
    if (!Array.isArray(m.attachments)) {
      return fail('INVALID_CHAT_REQUEST', '附件列表格式不合法', [
        { path: `${base}.attachments`, message: '附件必须是数组' },
      ]);
    }
    if (m.attachments.length > WIRE_ATTACHMENTS_MAX) {
      return fail('INVALID_CHAT_REQUEST', '附件数量超出上限', [
        { path: `${base}.attachments`, message: `单条消息附件不能超过 ${WIRE_ATTACHMENTS_MAX} 个` },
      ]);
    }
    const wires: WireAttachment[] = [];
    for (let i = 0; i < m.attachments.length; i++) {
      const raw = m.attachments[i];
      const rawType =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>).type
          : undefined;
      // 已知字段值非法（type 不在枚举内）→ 一律 400，不按缺载荷自愈（评审 r1 P-W1）
      if (rawType !== 'image' && rawType !== 'file') {
        return fail('INVALID_CHAT_REQUEST', '附件类型不合法', [
          { path: `${base}.attachments.${i}`, message: "附件 type 必须是 'image' 或 'file'" },
        ]);
      }
      const wire = toWireAttachment(raw);
      if (!wire) {
        if (isLast) {
          return fail('INVALID_CHAT_REQUEST', '附件数据不完整，请重新上传', [
            { path: `${base}.attachments.${i}`, message: '附件缺少有效载荷' },
          ]);
        }
        // 历史自愈：静默剥离损坏附件，保留消息文本
        continue;
      }
      if (wire.imageUrl && wire.imageUrl.length > WIRE_IMAGE_URL_MAX) {
        return fail('INVALID_CHAT_REQUEST', '附件数据超出最大体积', [
          { path: `${base}.attachments.${i}`, message: '图片附件超出体积上限' },
        ]);
      }
      wires.push(wire);
    }
    if (wires.length > 0) attachments = wires;
  }

  if (isLast && !m.content.trim() && (!attachments || attachments.length === 0)) {
    return fail('INVALID_CHAT_REQUEST', '消息内容不能为空', [
      { path: `${base}.content`, message: '末条消息无正文且无有效附件' },
    ]);
  }

  const message: WireMessage = { role: m.role as WireRole, content: m.content };
  if (attachments) message.attachments = attachments;
  return { ok: true, message };
}

// ==================== 顶层解析 ====================

function parseOptionalString(
  raw: Record<string, unknown>,
  key: 'model' | 'requestId' | 'reservationId' | 'turnId'
): { ok: true; value?: string } | { ok: false; error: ChatRequestParseError } {
  const value = raw[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'string') {
    return fail('INVALID_CHAT_REQUEST', '请求参数格式不合法', [
      { path: key, message: '必须是字符串' },
    ]);
  }
  return { ok: true, value };
}

/** 归一化截断类标识字段：非字符串视为缺省（undefined），空串归零 */
function normalizeId(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/**
 * 解析聊天请求体为 ChatRequestBody（唯一入口，两段式：形状校验 + 不变量归一化）。
 * 布尔门控脏值（agent: 1 等）归一化为 false（B-7，不 400）；
 * 非 agent 模式剥离 capabilityPack / disabledToolKeys / artifactContext / approvalResume。
 */
export function parseChatRequestBody(input: unknown): ChatRequestParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('INVALID_MESSAGES', '请求体格式不合法', [
      { path: 'body', message: '请求体必须是 JSON 对象' },
    ]);
  }
  const raw = input as Record<string, unknown>;

  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    return fail('INVALID_MESSAGES', '消息列表不能为空', [
      { path: 'messages', message: '消息列表不能为空' },
    ]);
  }

  const messages: WireMessage[] = [];
  for (let i = 0; i < raw.messages.length; i++) {
    const parsed = parseWireMessage(raw.messages[i], i, i === raw.messages.length - 1);
    if (!parsed.ok) return parsed;
    messages.push(parsed.message);
  }
  if (!messages.some((m) => m.role === 'user')) {
    return fail('INVALID_MESSAGES', '至少需要一条用户消息', [
      { path: 'messages', message: '消息列表中必须至少存在一条用户消息' },
    ]);
  }

  // provider 枚举校验：已知字段值非法 → 拒绝（取代现状「静默落 GenericAdapter」）
  let provider: ChatWireProvider = 'xunfei';
  if (raw.provider !== undefined) {
    if (!CHAT_WIRE_PROVIDERS.includes(raw.provider as ChatWireProvider)) {
      return fail('INVALID_CHAT_REQUEST', '不支持的模型供应方', [
        { path: 'provider', message: `provider 必须是 ${CHAT_WIRE_PROVIDERS.join(' / ')} 之一` },
      ]);
    }
    provider = raw.provider as ChatWireProvider;
  }

  const model = parseOptionalString(raw, 'model');
  if (!model.ok) return model;
  const requestId = parseOptionalString(raw, 'requestId');
  if (!requestId.ok) return requestId;
  const reservationId = parseOptionalString(raw, 'reservationId');
  if (!reservationId.ok) return reservationId;
  const turnId = parseOptionalString(raw, 'turnId');
  if (!turnId.ok) return turnId;

  let chatScene: ChatScene = 'single';
  if (raw.chatScene !== undefined) {
    if (!CHAT_SCENES.includes(raw.chatScene as ChatScene)) {
      return fail('INVALID_CHAT_REQUEST', '聊天场景不合法', [
        { path: 'chatScene', message: `chatScene 必须是 ${CHAT_SCENES.join(' / ')} 之一` },
      ]);
    }
    chatScene = raw.chatScene as ChatScene;
  }

  // 布尔门控：只认严格 true，其余脏值归一化为 false（B-7 计费安全语义）
  const agent = raw.agent === true;
  const thinking = raw.thinking === true;

  // agent 门控字段：非 agent 模式一律剥离；agent 模式按现状语义宽容归一（非法值忽略而非拒绝）
  let capabilityPack: string | undefined;
  let disabledToolKeys: string[] | undefined;
  let artifactContext: unknown;
  let approvalResume: ApprovalResumePayload | undefined;
  if (agent) {
    if (typeof raw.capabilityPack === 'string' && raw.capabilityPack.trim()) {
      capabilityPack = raw.capabilityPack.trim();
    }
    if (Array.isArray(raw.disabledToolKeys)) {
      const keys = raw.disabledToolKeys.filter(
        (k): k is string => typeof k === 'string' && Boolean(k.trim())
      );
      if (keys.length > 0) disabledToolKeys = keys;
    }
    if (raw.approvalResume !== undefined) {
      const resume = parseApprovalResume(raw.approvalResume);
      if (!resume) {
        return fail('INVALID_APPROVAL_RESUME', '审批恢复请求格式不正确，请重新提出需求', [
          { path: 'approvalResume', message: '审批恢复请求必须包含 token、callId、toolName 与 params' },
        ]);
      }
      approvalResume = resume;
    }
    if (raw.artifactContext !== undefined) artifactContext = raw.artifactContext;
  }

  const body: ChatRequestBody = {
    messages,
    provider,
    chatScene,
    agent,
    thinking,
    approvalScope:
      typeof raw.approvalScope === 'string' ? raw.approvalScope.trim().slice(0, WIRE_SCOPE_MAX) : '',
  };
  // model 归一：trim 且空串归 undefined，避免全空白字符串绕过默认模型回退（评审 r1 S-J1）
  const trimmedModel = model.value?.trim();
  if (trimmedModel) body.model = trimmedModel;
  if (requestId.value) body.requestId = normalizeId(requestId.value, WIRE_ID_MAX);
  if (reservationId.value) body.reservationId = normalizeId(reservationId.value, WIRE_ID_MAX);
  if (turnId.value) {
    const normalizedTurnId = normalizeId(turnId.value, WIRE_ID_MAX);
    if (normalizedTurnId) body.turnId = normalizedTurnId;
  }
  const conversationId = normalizeId(raw.conversationId, WIRE_ID_MAX);
  if (conversationId) body.conversationId = conversationId;
  if (capabilityPack) body.capabilityPack = capabilityPack;
  if (disabledToolKeys) body.disabledToolKeys = disabledToolKeys;
  if (artifactContext !== undefined) body.artifactContext = artifactContext;
  if (approvalResume) body.approvalResume = approvalResume;
  return { ok: true, body };
}

function parseApprovalResume(raw: unknown): ApprovalResumePayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { token, callId, toolName, params } = raw as Record<string, unknown>;
  if (typeof token !== 'string' || !token) return null;
  if (typeof callId !== 'string' || !callId) return null;
  if (typeof toolName !== 'string' || !toolName) return null;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  return { token, callId, toolName, params: params as Record<string, unknown> };
}

// ==================== 请求投影 ====================

/** projectWireHistory 的窄鸭子类型入参：不依赖前端 Store 的完整 Message 类型（Q1 红线） */
export interface WireHistorySource {
  role: string;
  content: string;
  attachments?: unknown;
  /** 审批卡片展示态（只读 status/toolName；凭证等其余字段一律不进入投影输出） */
  approval?: unknown;
}

interface NormalizedApproval {
  status: string;
  toolName: string;
}

function normalizeApproval(raw: unknown): NormalizedApproval | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.status !== 'string' || typeof a.toolName !== 'string') return null;
  return { status: a.status, toolName: a.toolName };
}

function narrowAttachments(raw: unknown): { attachments?: WireAttachment[] } {
  if (!Array.isArray(raw)) return {};
  const wires = raw
    .map((item) => toWireAttachment(item))
    .filter((w): w is WireAttachment => w !== null);
  return wires.length > 0 ? { attachments: wires } : {};
}

/**
 * 把会话快照消息投影为线上消息历史（ADR-0041 审批剥离规则的跨端唯一事实源）：
 * - 审批卡片与其凭证绝不进历史；content 为空的审批消息整跳（不发送）；
 * - 已拒绝的卡片追加一句系统提示，让模型下一轮可见；
 * - 历史残缺附件经 toWireAttachment 自愈剥离。
 */
export function projectWireHistory(messages: WireHistorySource[]): WireMessage[] {
  const history: WireMessage[] = [];
  for (const m of messages) {
    const approval = normalizeApproval(m.approval);
    if (approval) {
      if (typeof m.content === 'string' && m.content) {
        history.push({ role: m.role as WireRole, content: m.content, ...narrowAttachments(m.attachments) });
      }
      if (approval.status === 'rejected') {
        history.push({ role: 'system', content: `用户拒绝了执行 ${approval.toolName}` });
      }
      continue;
    }
    if (typeof m.content !== 'string') continue;
    history.push({ role: m.role as WireRole, content: m.content, ...narrowAttachments(m.attachments) });
  }
  return history;
}

// ==================== 批量预留 ====================

/** 批量预留单个模型输入 */
export interface BatchModelInput {
  provider: ChatWireProvider;
  model: string;
}

export interface BatchReserveRequestBody {
  messages: WireMessage[];
  models: BatchModelInput[];
}

export type BatchReserveParseResult =
  | { ok: true; body: BatchReserveRequestBody }
  | { ok: false; error: ChatRequestParseError };

/**
 * 解析批量预留请求体：复用 WireMessage 校验与 provider 枚举，保留独立批量语义
 * （独立形状、服务端生成 requestId、不合并进 parseChatRequestBody）。
 */
export function parseBatchReserveBody(input: unknown): BatchReserveParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('INVALID_MESSAGES', '请求体格式不合法', [
      { path: 'body', message: '请求体必须是 JSON 对象' },
    ]);
  }
  const raw = input as Record<string, unknown>;

  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    return fail('INVALID_MESSAGES', '消息列表不能为空', [
      { path: 'messages', message: '消息列表不能为空' },
    ]);
  }
  const messages: WireMessage[] = [];
  for (let i = 0; i < raw.messages.length; i++) {
    const parsed = parseWireMessage(raw.messages[i], i, i === raw.messages.length - 1);
    if (!parsed.ok) return parsed;
    messages.push(parsed.message);
  }
  // 与单聊解析器同一安全门控：messages 至少含一条 user 消息（评审 r1 P-M2）
  if (!messages.some((m) => m.role === 'user')) {
    return fail('INVALID_MESSAGES', '至少需要一条用户消息', [
      { path: 'messages', message: '消息列表中必须至少存在一条用户消息' },
    ]);
  }

  if (!Array.isArray(raw.models)) {
    return fail('INVALID_CHAT_REQUEST', '模型列表不能为空', [
      { path: 'models', message: '模型列表必须是数组' },
    ]);
  }
  if (raw.models.length === 0) {
    return fail('INVALID_CHAT_REQUEST', '模型列表不能为空', [
      { path: 'models', message: '模型列表不能为空' },
    ]);
  }
  if (raw.models.length > BATCH_MODELS_MAX) {
    return fail('INVALID_CHAT_REQUEST', '模型列表超出上限', [
      { path: 'models', message: `单次批量预留模型数不能超过 ${BATCH_MODELS_MAX} 个` },
    ]);
  }
  const models: BatchModelInput[] = [];
  for (let i = 0; i < raw.models.length; i++) {
    const base = `models.${i}`;
    const item = raw.models[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return fail('INVALID_CHAT_REQUEST', '模型列表格式不合法', [
        { path: base, message: '模型输入必须是对象' },
      ]);
    }
    const m = item as Record<string, unknown>;
    if (!CHAT_WIRE_PROVIDERS.includes(m.provider as ChatWireProvider)) {
      return fail('INVALID_CHAT_REQUEST', '不支持的模型供应方', [
        { path: `${base}.provider`, message: `provider 必须是 ${CHAT_WIRE_PROVIDERS.join(' / ')} 之一` },
      ]);
    }
    if (typeof m.model !== 'string' || !m.model.trim()) {
      return fail('INVALID_CHAT_REQUEST', '模型名称不能为空', [
        { path: `${base}.model`, message: '模型名称必须是非空字符串' },
      ]);
    }
    models.push({ provider: m.provider as ChatWireProvider, model: m.model.trim().slice(0, 100) });
  }

  return { ok: true, body: { messages, models } };
}

/** 批量预留响应体（双向契约：客户端断言以其为准） */
export interface BatchReservationItem {
  provider: ChatWireProvider;
  model: string;
  requestId: string;
  reservationId: string;
}

export interface BatchReserveResponseBody {
  reservations: BatchReservationItem[];
}
