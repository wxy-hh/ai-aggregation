/**
 * MCP 服务器配置的前端 API 客户端（工单 02 / ADR-0064 §2）
 *
 * 纪律：
 * - 鉴权头取值永不出现在请求体之外的地方：更新时仅在用户实际填写时携带；
 * - 错误统一转为带中文文案的异常，供 UI 直接展示。
 */

import { authFetch } from './client';

/** 用户可见的 MCP 服务器配置 */
export interface SanitizedMcpServer {
  id: string;
  userId: string;
  name: string;
  url: string;
  authHeaderName: string | null;
  hasAuthHeaderValue: boolean;
  isActive: boolean;
  discoveryStatus: 'never' | 'succeeded' | 'failed';
  discoveryError: string | null;
  snapshotVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

/** 会话内可读的已启用 MCP 工具项（由服务端全局白名单派生） */
export interface EnabledMcpToolItem {
  serverId: string;
  serverName: string;
  toolName: string;
  description: string;
  modelToolName: string;
  allowAutoExecute: boolean;
}

/** 创建入参 */
export interface CreateMcpServerDto {
  name: string;
  url: string;
  authHeaderName?: string | null;
  authHeaderValue?: string | null;
  transport?: 'http';
}

/** 更新入参 */
export interface UpdateMcpServerDto {
  name?: string;
  url?: string;
  authHeaderName?: string | null;
  /** undefined 保持不变；"" 或 null 表示清除 */
  authHeaderValue?: string | null;
  isActive?: boolean;
}

/** API 错误 */
export class McpServerApiError extends Error {
  statusCode: number;
  errorCode?: string;
  fieldErrors?: Record<string, string[]>;

  constructor(
    message: string,
    statusCode: number,
    errorCode?: string,
    fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'McpServerApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.fieldErrors = fieldErrors;
  }
}

/** 解析错误响应为带中文文案的异常 */
async function toApiError(response: Response): Promise<never> {
  if (response.status === 429) {
    throw new McpServerApiError('请求过于频繁，请稍后再试', 429, 'TOO_MANY_REQUESTS');
  }
  const payload = await response.json().catch(() => ({ error: '请求失败，请稍后重试' }));
  const fieldErrors = payload.details?.errors as Record<string, string[]> | undefined;
  const firstFieldMessage = fieldErrors
    ? Object.values(fieldErrors)
        .flat()
        .find((msg): msg is string => typeof msg === 'string' && msg.trim().length > 0)
    : undefined;
  throw new McpServerApiError(
    firstFieldMessage || payload.error || '请求失败，请稍后重试',
    response.status,
    payload.errorCode,
    fieldErrors
  );
}

/** 获取当前用户的 MCP 服务器列表 */
export async function fetchMcpServers(): Promise<SanitizedMcpServer[]> {
  const response = await authFetch('/api/mcp-servers');
  if (!response.ok) await toApiError(response);
  const result = await response.json();
  return result.data?.servers ?? [];
}

/** 懒加载当前用户所有已在全局白名单启用且可挂载的 MCP 工具（失败静默降级为空数组） */
export async function fetchEnabledMcpTools(): Promise<EnabledMcpToolItem[]> {
  try {
    const response = await authFetch('/api/mcp-servers?includeEnabledTools=1');
    if (!response.ok) return [];
    const result = await response.json().catch(() => null);
    return Array.isArray(result?.data?.enabledTools) ? result.data.enabledTools : [];
  } catch {
    return [];
  }
}

/** 登记新的 MCP 服务器 */
export async function createMcpServer(
  data: CreateMcpServerDto
): Promise<SanitizedMcpServer> {
  const response = await authFetch('/api/mcp-servers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) await toApiError(response);
  const result = await response.json();
  return result.data.server;
}

/** 更新 MCP 服务器配置 */
export async function updateMcpServer(
  id: string,
  data: UpdateMcpServerDto
): Promise<SanitizedMcpServer> {
  const response = await authFetch(`/api/mcp-servers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!response.ok) await toApiError(response);
  const result = await response.json();
  return result.data.server;
}

/** 删除 MCP 服务器配置 */
export async function deleteMcpServer(id: string): Promise<void> {
  const response = await authFetch(`/api/mcp-servers/${id}`, { method: 'DELETE' });
  if (!response.ok) await toApiError(response);
}

/** 用户可见的 MCP 工具条目 */
export interface McpToolItem {
  toolName: string;
  description: string;
  /** 入参契约摘要（参数名、类型、是否必填） */
  inputSummary: Array<{ name: string; type: string; required: boolean }>;
  annotations: Record<string, unknown> | null;
  modelToolName: string;
  /** 是否受平台支持 */
  supported: boolean;
  /** 不支持原因（中文） */
  supportReason?: string;
  /** 是否加入白名单 */
  enabled: boolean;
  /** 是否允许自动执行 */
  allowAutoExecute: boolean;
}

/** 更新工具策略入参 */
export interface UpdateMcpToolPolicyDto {
  toolName: string;
  enabled?: boolean;
  allowAutoExecute?: boolean;
}

/** 获取指定 MCP 服务器的工具列表与各自策略 */
export async function fetchMcpServerTools(serverId: string): Promise<McpToolItem[]> {
  const response = await authFetch(`/api/mcp-servers/${serverId}/tools`);
  if (!response.ok) await toApiError(response);
  const result = await response.json();
  return result.data?.tools ?? [];
}

/** 更新单个 MCP 工具的白名单与审批策略 */
export async function updateMcpToolPolicy(
  serverId: string,
  data: UpdateMcpToolPolicyDto
): Promise<{ toolName: string; enabled: boolean; allowAutoExecute: boolean }> {
  const response = await authFetch(`/api/mcp-servers/${serverId}/tools`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!response.ok) await toApiError(response);
  const result = await response.json();
  return result.data;
}

/** 刷新 MCP 服务器的工具定义 */
export async function refreshMcpServerTools(
  id: string
): Promise<{ server: SanitizedMcpServer; tools?: unknown[] }> {
  const response = await authFetch(`/api/mcp-servers/${id}/refresh`, { method: 'POST' });
  if (!response.ok) await toApiError(response);
  const result = await response.json();
  return result.data;
}
