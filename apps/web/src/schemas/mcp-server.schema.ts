/**
 * MCP 服务器配置入参校验（工单 02 / ADR-0064 §2）
 *
 * 校验纪律：
 * - 保存前做**零 I/O** 校验（HTTPS-only、字面量安全、长度），不发起任何出站请求；
 * - 逐字段返回中文原因，前端可就地标注；
 * - 鉴权头名与取值成对：显式清除取值必须同时清除头名（防止密文残留）。
 */

import { z } from 'zod';
import { validateUrlLiteral } from '@repo/shared';
import {
  isQaAllowedHttpsTarget,
  MCP_MAX_AUTH_HEADER_NAME_CHARS,
  MCP_MAX_AUTH_HEADER_VALUE_CHARS,
  MCP_MAX_SERVER_NAME_CHARS,
  MCP_MAX_URL_CHARS,
} from '@/lib/agent/mcp/contracts';

/** 校验 MCP 服务器地址：HTTPS-only 且未命中内网/回环/元数据字面量 */
export function validateMcpServerUrl(raw: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, reason: '服务器地址不能为空' };
  if (trimmed.length > MCP_MAX_URL_CHARS) {
    return { ok: false, reason: `服务器地址不能超过 ${MCP_MAX_URL_CHARS} 个字符` };
  }

  // 非生产 QA 靶场显式白名单：仅允许精确匹配的 https host:port，其余地址仍走字面量 SSRF 校验
  if (isQaAllowedHttpsTarget(trimmed)) {
    return { ok: true };
  }

  const guard = validateUrlLiteral(trimmed);
  if (!guard.ok) {
    return { ok: false, reason: guard.reason };
  }
  if (guard.url.protocol !== 'https:') {
    return { ok: false, reason: 'MCP 服务器地址必须使用 https 协议' };
  }
  return { ok: true };
}

/** 创建入参 */
export const createMcpServerSchema = z.object({
  name: z
    .string({ required_error: '名称不能为空' })
    .trim()
    .min(1, '名称不能为空')
    .max(MCP_MAX_SERVER_NAME_CHARS, `名称不能超过 ${MCP_MAX_SERVER_NAME_CHARS} 个字符`),
  url: z.string({ required_error: '服务器地址不能为空' }).trim(),
  authHeaderName: z
    .string()
    .trim()
    .max(
      MCP_MAX_AUTH_HEADER_NAME_CHARS,
      `鉴权头名不能超过 ${MCP_MAX_AUTH_HEADER_NAME_CHARS} 个字符`
    )
    .optional()
    .nullable(),
  authHeaderValue: z
    .string()
    .max(
      MCP_MAX_AUTH_HEADER_VALUE_CHARS,
      `鉴权头取值不能超过 ${MCP_MAX_AUTH_HEADER_VALUE_CHARS} 个字符`
    )
    .optional()
    .nullable(),
  /** 传输形态：本期只支持 Streamable HTTP；旧版 SSE 由路由层以中文原因明确拒绝 */
  transport: z.string().trim().max(32).optional(),
  /** 创建后立即启用的工具名（可选） */
  enableTool: z.string().trim().max(128).optional(),
});

export type CreateMcpServerInput = z.infer<typeof createMcpServerSchema>;

/** 更新入参 */
export const updateMcpServerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '名称不能为空')
    .max(MCP_MAX_SERVER_NAME_CHARS, `名称不能超过 ${MCP_MAX_SERVER_NAME_CHARS} 个字符`)
    .optional(),
  url: z.string().trim().optional(),
  authHeaderName: z
    .string()
    .trim()
    .max(
      MCP_MAX_AUTH_HEADER_NAME_CHARS,
      `鉴权头名不能超过 ${MCP_MAX_AUTH_HEADER_NAME_CHARS} 个字符`
    )
    .optional()
    .nullable(),
  /**
   * 鉴权头取值更新语义：
   * - undefined：保持不变
   * - "" 或 null：清除密文（并连带清除鉴权头名）
   * - 非空：覆盖加密
   */
  authHeaderValue: z
    .string()
    .max(
      MCP_MAX_AUTH_HEADER_VALUE_CHARS,
      `鉴权头取值不能超过 ${MCP_MAX_AUTH_HEADER_VALUE_CHARS} 个字符`
    )
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

export type UpdateMcpServerInput = z.infer<typeof updateMcpServerSchema>;
