/**
 * Agent 运行记录前端 API 客户端（ADR-0015 / 工单 02）
 */

import { authFetch } from '@/lib/api/client';

export interface AgentRunRecord {
  id: string;
  userId: string;
  conversationId: string | null;
  messageId: string | null;
  goalText: string;
  steps: number;
  toolCalls: Array<{
    id: string;
    name: string;
    argsSummary: string;
    status: 'success' | 'failed';
    summary: string;
    durationMs?: number;
  }>;
  artifactRefs: Array<{
    id: string;
    type: string;
    title: string;
  }>;
  capabilityPack: string | null;
  outcome: 'success' | 'partial' | 'failed';
  quotaCost: number;
  durationMs: number;
  createdAt: string;
}

export interface FetchAgentRunsResult {
  runs: AgentRunRecord[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchAgentRuns(params?: {
  page?: number;
  limit?: number;
  outcome?: string;
}): Promise<FetchAgentRunsResult> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.outcome) query.set('outcome', params.outcome);

  const res = await authFetch(`/api/agent-runs?${query.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `获取运行记录失败: ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}

export async function deleteAgentRun(id: string): Promise<{ id: string }> {
  const res = await authFetch(`/api/agent-runs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `删除运行记录失败: ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}
