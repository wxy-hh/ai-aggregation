/**
 * MCP 共享契约与有界常量真源（工单 01 / ADR-0064 §4、§5、§7）
 *
 * 本文件是 MCP 扩展的**单一常量真源**与**共享类型真源**：
 * - 数值上限只在此定义，其它模块一律引用，不得就地写死；
 * - 跨层共享的实体形状（Server 配置、工具定义快照、工具策略、审计记录、
 *   工具调用结果）在此定义，持久层、API 层、运行时与前端共用。
 *
 * 所有上限均为失败关闭的硬边界：超限即拒绝，不静默截取。
 */

/* ==================== 有界常量 ==================== */

/** 每用户可登记的 MCP 服务器数量上限 */
export const MCP_MAX_SERVERS_PER_USER = 10;

/** 所有服务器合计允许启用的 MCP 工具数量上限 */
export const MCP_MAX_ENABLED_TOOLS = 8;

/** 工具发现总超时（毫秒） */
export const MCP_DISCOVERY_TIMEOUT_MS = 10_000;

/** 工具发现单页请求超时（毫秒） */
export const MCP_DISCOVERY_PAGE_TIMEOUT_MS = 5_000;

/** 工具发现允许翻页的最大页数 */
export const MCP_MAX_DISCOVERY_PAGES = 16;

/** 单次发现允许返回的工具数量上限 */
export const MCP_MAX_DISCOVERED_TOOLS = 128;

/** 工具定义快照总字节上限 */
export const MCP_MAX_SNAPSHOT_BYTES = 256 * 1024;

/** 服务器地址最大字符数 */
export const MCP_MAX_URL_CHARS = 2048;

/** 静态鉴权头名最大字符数 */
export const MCP_MAX_AUTH_HEADER_NAME_CHARS = 100;

/** 静态鉴权头取值最大字符数 */
export const MCP_MAX_AUTH_HEADER_VALUE_CHARS = 2000;

/** 审批参数规范化序列化后最大字符数（超限拒绝签发审批，不截断后批准） */
export const MCP_MAX_APPROVAL_PARAM_CHARS = 8000;

/** 模型侧工具名最大字符数（对齐 OpenAI 兼容接口的函数名上限） */
export const MCP_MAX_MODEL_TOOL_NAME_CHARS = 64;

/** 上游错误原因进入模型上下文前的最大字符数 */
export const MCP_MAX_UPSTREAM_ERROR_REASON_CHARS = 500;

/** 服务器显示名最大字符数 */
export const MCP_MAX_SERVER_NAME_CHARS = 50;

/** 工具描述最大字符数（超出部分截断） */
export const MCP_MAX_TOOL_DESCRIPTION_CHARS = 2000;

/* ==================== 发现状态 ==================== */

/**
 * 服务器的发现状态：
 * - `never`：尚未尝试发现
 * - `succeeded`：最近一次发现成功，快照可用
 * - `failed`：最近一次发现失败，保留上一次成功快照
 */
export type McpDiscoveryStatus = 'never' | 'succeeded' | 'failed';

/* ==================== 共享实体形状 ==================== */

/** MCP 服务器配置（持久层与 API 层共用的字段形状） */
export interface McpServerConfigShape {
  id: string;
  userId: string;
  /** 显示名 */
  name: string;
  /** Streamable HTTP 端点地址（HTTPS） */
  url: string;
  /** 静态鉴权头名；为空表示无鉴权 */
  authHeaderName: string | null;
  /** 是否已配置鉴权头取值（永不返回明文） */
  hasAuthHeaderValue: boolean;
  /** 是否启用 */
  isActive: boolean;
  /** 最近一次发现状态 */
  discoveryStatus: McpDiscoveryStatus;
  /** 最近一次发现失败的中文原因 */
  discoveryError: string | null;
  /** 当前有效快照版本号；无快照为 null */
  snapshotVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

/** MCP 工具定义（快照内的单条） */
export interface McpToolDefinition {
  /** 上游暴露的原始工具名 */
  toolName: string;
  /** 上游描述（给用户与模型看） */
  description: string;
  /** 入参契约（JSON Schema 2020-12） */
  inputSchema: unknown;
  /** 上游注解（如 readOnlyHint）；仅展示，不参与安全判定 */
  annotations: Record<string, unknown> | null;
  /** 模型侧工具名 */
  modelToolName: string;
}

/** MCP 工具定义快照（一个 Server 的当前有效工具集合） */
export interface McpToolSnapshotShape {
  id: string;
  serverId: string;
  userId: string;
  /** 快照版本号，单调递增 */
  version: number;
  /** 安全配置指纹（服务端推导） */
  configFingerprint: string;
  /** 工具定义列表 */
  tools: McpToolDefinition[];
  createdAt: string;
}

/** MCP 工具策略（白名单与审批策略） */
export interface McpToolPolicyShape {
  id: string;
  serverId: string;
  userId: string;
  /** 上游原始工具名 */
  toolName: string;
  /** 是否加入白名单（进入 Agent 上下文） */
  enabled: boolean;
  /** 是否允许自动执行；false 表示必须经用户审批 */
  allowAutoExecute: boolean;
  createdAt: string;
  updatedAt: string;
}

/** MCP 审计事件类型 */
export type McpAuditEventType =
  | 'discover'
  | 'refresh'
  | 'call'
  | 'pending_approval'
  | 'blocked';

/** MCP 审计结果状态 */
export type McpAuditOutcome =
  | 'success'
  | 'failed'
  | 'skipped'
  | 'blocked'
  | 'pending_approval';

/** MCP 元数据审计记录（不含原始参数、结果、鉴权信息与 URL 查询串） */
export interface McpAuditRecordShape {
  userId: string;
  serverId: string | null;
  /** 来源服务器名称（冗余留痕，便于按名称检索） */
  serverName: string | null;
  /** 工具名；服务器级事件为空 */
  toolName: string | null;
  /** 目标域名（不含路径与查询串） */
  hostname: string;
  eventType: McpAuditEventType;
  outcome: McpAuditOutcome;
  /** 快照版本 */
  snapshotVersion: number | null;
  /** HTTP 状态码；无响应语义事件为空 */
  statusCode: number | null;
  /** 耗时（毫秒） */
  durationMs: number;
  /** 响应字节数 */
  responseBytes: number;
  /** 错误类别（不含原始错误细节） */
  errorKind: string | null;
  createdAt: string;
}

/** MCP 工具调用结果（供模型与前端消费的有界投影） */
export interface McpToolCallResult {
  ok: boolean;
  /** 进模型的正文（已按上限截断） */
  contentForModel: string;
  /** 下发前端的摘要（已按上限截断） */
  summaryForDisplay: string;
}

/* ==================== 非生产受控 QA 靶场放行辅助 ==================== */

/**
 * 读取非生产环境受控 QA HTTPS 靶场目标（`host:port`）。
 * 生产环境及浏览器端无条件返回 null，绝不放宽私有网络校验。
 */
export function resolveQaAllowedMcpTarget(): string | null {
  if (
    typeof process === 'undefined' ||
    !process.versions?.node ||
    process.env?.NODE_ENV === 'production'
  ) {
    return null;
  }
  const raw = process.env?.['MCP_QA_ALLOWED_TARGET']?.trim();
  return raw ? raw.toLowerCase() : null;
}

/**
 * 判断 URL 是否精确命中非生产受控 QA 靶场。
 * 仍强制要求 `https:` 协议且 `host:port` 与配置完全一致；`http://` 与其它私网地址继续拒绝。
 */
export function isQaAllowedHttpsTarget(rawUrl: string): string | null {
  const allowedTarget = resolveQaAllowedMcpTarget();
  if (!allowedTarget) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const port = parsed.port || '443';
    const targetKey = `${host}:${port}`;
    return targetKey === allowedTarget ? targetKey : null;
  } catch {
    return null;
  }
}
