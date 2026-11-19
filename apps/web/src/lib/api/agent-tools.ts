/**
 * Agent 自定义 Webhook 工具 API 客户端（spec §4.3）
 *
 * 接口包含：
 * - fetchAgentTools: 获取当前用户的 Webhook 工具列表
 * - createAgentTool: 登记新 Webhook 工具
 * - updateAgentTool: 更新指定 Webhook 工具
 * - deleteAgentTool: 删除指定 Webhook 工具
 * - testAgentToolConnection: 握手级连通性探测
 */

import { authFetch } from './client';
import type { SanitizedAgentTool, WebhookParamItem } from '@/schemas/agent-tool.schema';

export type { SanitizedAgentTool, WebhookParamItem };
export type AgentToolParamItem = WebhookParamItem;

export interface CreateAgentToolDto {
  name: string;
  callName: string;
  description: string;
  url: string;
  method: 'GET' | 'POST';
  authHeaderName?: string | null;
  authHeaderValue?: string | null;
  params: WebhookParamItem[];
  enabled?: boolean;
  /** 调用前需用户确认；省略时服务端按 method 推导（POST 开、GET 关） */
  requiresApproval?: boolean;
}

export interface UpdateAgentToolDto {
  name?: string;
  callName?: string;
  description?: string;
  url?: string;
  method?: 'GET' | 'POST';
  authHeaderName?: string | null;
  authHeaderValue?: string | null;
  params?: WebhookParamItem[];
  enabled?: boolean;
  requiresApproval?: boolean;
}

export interface ProbeConnectionResult {
  reachable: boolean;
  statusCode?: number;
  durationMs?: number;
  reason?: string;
}

/**
 * 封装 API 请求错误，携带字段级校验报错与错误码
 */
export class AgentToolApiError extends Error {
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
    this.name = 'AgentToolApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * 获取当前登录用户的 Webhook 工具列表。
 */
export async function fetchAgentTools(): Promise<SanitizedAgentTool[]> {
  const response = await authFetch('/api/agent-tools');

  if (!response.ok) {
    if (response.status === 429) {
      throw new AgentToolApiError('请求过于频繁，请稍后再试', 429, 'TOO_MANY_REQUESTS');
    }
    const payload = await response.json().catch(() => ({ error: '获取工具列表失败' }));
    throw new AgentToolApiError(
      payload.error || '获取工具列表失败',
      response.status,
      payload.errorCode
    );
  }

  const result = await response.json();
  return result.data?.tools || [];
}

/**
 * 创建新的自定义 Webhook 工具。
 */
export async function createAgentTool(data: CreateAgentToolDto): Promise<SanitizedAgentTool> {
  const response = await authFetch('/api/agent-tools', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new AgentToolApiError('操作过于频繁，请稍后再试', 429, 'TOO_MANY_REQUESTS');
    }
    const payload = await response.json().catch(() => ({ error: '创建工具失败' }));
    const fieldErrors = payload.details?.errors as Record<string, string[]> | undefined;
    throw new AgentToolApiError(
      payload.error || '创建工具失败',
      response.status,
      payload.errorCode,
      fieldErrors
    );
  }

  const result = await response.json();
  return result.data.tool;
}

/**
 * 更新指定的 Webhook 工具。
 */
export async function updateAgentTool(
  id: string,
  data: UpdateAgentToolDto
): Promise<SanitizedAgentTool> {
  const response = await authFetch(`/api/agent-tools/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new AgentToolApiError('操作过于频繁，请稍后再试', 429, 'TOO_MANY_REQUESTS');
    }
    const payload = await response.json().catch(() => ({ error: '更新工具失败' }));
    const fieldErrors = payload.details?.errors as Record<string, string[]> | undefined;
    throw new AgentToolApiError(
      payload.error || '更新工具失败',
      response.status,
      payload.errorCode,
      fieldErrors
    );
  }

  const result = await response.json();
  return result.data.tool;
}

/**
 * 删除指定的 Webhook 工具。
 */
export async function deleteAgentTool(id: string): Promise<void> {
  const response = await authFetch(`/api/agent-tools/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new AgentToolApiError('操作过于频繁，请稍后再试', 429, 'TOO_MANY_REQUESTS');
    }
    const payload = await response.json().catch(() => ({ error: '删除工具失败' }));
    throw new AgentToolApiError(
      payload.error || '删除工具失败',
      response.status,
      payload.errorCode
    );
  }
}

/**
 * 测试 Webhook 工具的连通性。
 */
export async function testAgentToolConnection(id: string): Promise<ProbeConnectionResult> {
  const response = await authFetch(`/api/agent-tools/${id}/test`, {
    method: 'POST',
  });

  if (!response.ok) {
    if (response.status === 429) {
      return {
        reachable: false,
        reason: '操作过于频繁，请稍后再试',
      };
    }
    const payload = await response.json().catch(() => ({ error: '测试连接失败' }));
    return {
      reachable: false,
      reason: payload.error || '测试连接失败，请稍后重试',
    };
  }

  const result = await response.json();
  return result.data;
}

export interface AgentToolStats {
  totalCalls: number;
  successRate: number | null;
  avgDurationMs: number | null;
  lastCalledAt: string | null;
  lastErrorSummary: string | null;
}

export interface AgentToolLogItem {
  id: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  outcome: string;
  errorKind: string | null;
  createdAt: string;
}

export interface AgentToolLogsResponse {
  logs: AgentToolLogItem[];
  total: number;
  hasMore: boolean;
}

/**
 * 获取指定 Webhook 工具的调用聚合统计数据（工单 03 / spec §4.4）
 */
export async function fetchAgentToolStats(id: string): Promise<AgentToolStats> {
  const response = await authFetch(`/api/agent-tools/${id}/stats`);

  if (!response.ok) {
    if (response.status === 429) {
      throw new AgentToolApiError('请求过于频繁，请稍后再试', 429, 'TOO_MANY_REQUESTS');
    }
    const payload = await response.json().catch(() => ({ error: '获取工具统计失败' }));
    throw new AgentToolApiError(
      payload.error || '获取工具统计失败',
      response.status,
      payload.errorCode
    );
  }

  const result = await response.json();
  return result.data;
}

/**
 * 倒序分页获取指定 Webhook 工具的历史调用审计记录（工单 03 / spec §4.4）
 */
export async function fetchAgentToolLogs(
  id: string,
  options?: { limit?: number; offset?: number }
): Promise<AgentToolLogsResponse> {
  const queryParams = new URLSearchParams();
  if (options?.limit !== undefined) {
    queryParams.set('limit', String(options.limit));
  }
  if (options?.offset !== undefined) {
    queryParams.set('offset', String(options.offset));
  }

  const queryStr = queryParams.toString();
  const url = `/api/agent-tools/${id}/logs${queryStr ? `?${queryStr}` : ''}`;

  const response = await authFetch(url);

  if (!response.ok) {
    if (response.status === 429) {
      throw new AgentToolApiError('请求过于频繁，请稍后再试', 429, 'TOO_MANY_REQUESTS');
    }
    const payload = await response.json().catch(() => ({ error: '获取调用日志失败' }));
    throw new AgentToolApiError(
      payload.error || '获取调用日志失败',
      response.status,
      payload.errorCode
    );
  }

  const result = await response.json();
  return result.data;
}

