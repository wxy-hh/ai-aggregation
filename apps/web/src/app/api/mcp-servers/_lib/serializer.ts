/**
 * MCP 服务器配置响应脱敏序列化（工单 02 / ADR-0064 §2）
 *
 * 安全纪律：
 * - 永不向客户端下发鉴权头取值密文；
 * - 永不回显明文密钥；
 * - 仅提供 hasAuthHeaderValue 标识凭证是否已配置，供前端编辑态展示状态。
 */

import type { McpServerConfig } from '@repo/db';
import type { McpAuditEventType, McpAuditOutcome, McpDiscoveryStatus } from '@/lib/agent/mcp/contracts';

/** 用户可见的 MCP 服务器配置 */
export interface SanitizedMcpServer {
  id: string;
  userId: string;
  name: string;
  url: string;
  authHeaderName: string | null;
  hasAuthHeaderValue: boolean;
  isActive: boolean;
  discoveryStatus: McpDiscoveryStatus;
  discoveryError: string | null;
  snapshotVersion: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * 将数据库实体脱敏输出为安全的用户可见格式。
 *
 * @param server 数据库查询出的 McpServerConfig 记录
 */
export function sanitizeMcpServer(server: McpServerConfig): SanitizedMcpServer {
  return {
    id: server.id,
    userId: server.userId,
    name: server.name,
    url: server.url,
    authHeaderName: server.authHeaderName,
    hasAuthHeaderValue: Boolean(server.authHeaderValueEnc),
    isActive: server.isActive,
    discoveryStatus: server.discoveryStatus as McpDiscoveryStatus,
    discoveryError: server.discoveryError,
    snapshotVersion: server.snapshotVersion,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

/** MCP 元数据审计的用户可见摘要（运营视图） */
export interface McpAuditSummary {
  id: string;
  serverName: string | null;
  toolName: string | null;
  hostname: string;
  eventType: McpAuditEventType;
  outcome: McpAuditOutcome;
  durationMs: number;
  createdAt: Date | string;
}

/** 审计记录脱敏输出 */
export function sanitizeMcpAudit(record: {
  id: string;
  serverName: string | null;
  toolName: string | null;
  hostname: string;
  eventType: string;
  outcome: string;
  durationMs: number;
  createdAt: Date | string;
}): McpAuditSummary {
  return {
    id: record.id,
    serverName: record.serverName,
    toolName: record.toolName,
    hostname: record.hostname,
    eventType: record.eventType as McpAuditEventType,
    outcome: record.outcome as McpAuditOutcome,
    durationMs: record.durationMs,
    createdAt: record.createdAt,
  };
}
