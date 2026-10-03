/**
 * Webhook 工具响应脱敏序列化（spec §4.1 / §4.3）
 *
 * 安全纪律：
 * - 永不向客户端下发 authHeaderValueEnc 密文；
 * - 永不回显明文 secret；
 * - 仅提供 hasAuthHeaderValue 标识凭证是否已配置，供前端编辑态展示状态。
 */

import type { UserWebhookTool } from '@repo/db';
import type { SanitizedAgentTool, WebhookParamItem } from '@/schemas/agent-tool.schema';

export type { SanitizedAgentTool };

/**
 * 将数据库实体记录脱敏输出为安全的用户可见格式。
 *
 * @param tool 数据库查询出的 UserWebhookTool 记录
 * @returns 剥离敏感凭证字段的工具对象
 */
export function sanitizeAgentTool(tool: UserWebhookTool): SanitizedAgentTool {
  return {
    id: tool.id,
    userId: tool.userId,
    name: tool.name,
    callName: tool.callName,
    description: tool.description,
    url: tool.url,
    method: tool.method as 'GET' | 'POST',
    authHeaderName: tool.authHeaderName,
    hasAuthHeaderValue: Boolean(tool.authHeaderValueEnc),
    params: (tool.params ?? []) as WebhookParamItem[],
    enabled: tool.enabled,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };
}
