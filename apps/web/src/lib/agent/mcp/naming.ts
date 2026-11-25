/**
 * MCP 模型侧工具命名（工单 01 / ADR-0064 §7）
 *
 * 命名契约：
 * - 模型侧工具名为 `mcp_<serverKey>_<toolName>`，由 Server 稳定标识与原始工具名
 *   确定性派生，保证同一配置多次装配得到同一名称（审批凭证才能绑定）；
 * - Server 标识与原始工具名统一归一化为小写安全字符，避免模型侧非法字符；
 * - 保留「模型名 → Server + 原始工具名」映射，`tools/call` 时据此回放原始名。
 *
 * 跨 Server 重名不覆盖：Server 标识参与派生，不同 Server 的同名工具得到不同名称。
 */

import { createHash } from 'node:crypto';
import { MCP_MAX_MODEL_TOOL_NAME_CHARS } from './contracts';

/** 模型侧 MCP 工具名前缀 */
export const MCP_TOOL_NAME_PREFIX = 'mcp';

/** 短 Server 标识保留原文；超过该长度的标识使用确定性短哈希 */
const MAX_READABLE_SERVER_KEY_CHARS = 16;

/** 冲突消解与长名截断共用的短哈希长度 */
const DISAMBIGUATION_HASH_CHARS = 8;

/** 对原始标识生成确定性短哈希，不依赖上游工具返回顺序 */
function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, DISAMBIGUATION_HASH_CHARS);
}

/** 归一化：仅保留小写字母、数字与下划线，其余折叠为下划线并去重 */
function normalizeSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
  return normalized || 'x';
}

/**
 * 派生模型侧工具名。
 *
 * 短 Server 标识保持可读；长标识压缩为短哈希。工具名超限时截断并附原始名哈希；
 * `disambiguate` 用于归一化后重名的一组工具，保证各项名称稳定且互不覆盖。
 *
 * @param serverKey Server 稳定标识（配置 ID 或其派生短标识）
 * @param toolName 上游暴露的原始工具名
 * @param options 是否强制附加原始工具名哈希以消解归一化冲突
 */
export function buildMcpToolName(
  serverKey: string,
  toolName: string,
  options: { disambiguate?: boolean } = {}
): string {
  const normalizedServerKey = normalizeSegment(serverKey);
  const serverSegment =
    normalizedServerKey.length <= MAX_READABLE_SERVER_KEY_CHARS
      ? normalizedServerKey
      : shortHash(serverKey);
  const toolSegment = normalizeSegment(toolName);
  const base = `${MCP_TOOL_NAME_PREFIX}_${serverSegment}_${toolSegment}`;
  if (!options.disambiguate && base.length <= MCP_MAX_MODEL_TOOL_NAME_CHARS) {
    return base;
  }

  const suffix = `_${shortHash(toolName)}`;
  const prefix = `${MCP_TOOL_NAME_PREFIX}_${serverSegment}_`;
  const toolBudget = Math.max(
    1,
    MCP_MAX_MODEL_TOOL_NAME_CHARS - prefix.length - suffix.length
  );
  const boundedToolSegment = toolSegment.slice(0, toolBudget).replace(/_+$/g, '') || 'x';
  return `${prefix}${boundedToolSegment}${suffix}`;
}

/** 校验历史快照中的模型侧工具名是否符合模型 API 的函数名约束 */
export function isValidMcpModelToolName(name: string): boolean {
  return new RegExp(`^[a-z0-9_]{1,${MCP_MAX_MODEL_TOOL_NAME_CHARS}}$`).test(name);
}

/** 反解结果 */
export interface ParsedMcpToolName {
  serverKey: string;
  toolName: string;
}

/**
 * 反解模型侧工具名回 Server 标识与原始工具名。
 *
 * 注意：归一化会丢失原始大小写与特殊字符，因此反解得到的是归一化后的片段；
 * 真实调用时应以映射表为准，此函数仅用于展示与诊断。
 *
 * @param name 模型侧工具名
 * @returns 反解失败（非 MCP 前缀）时返回 null
 */
export function parseMcpToolName(name: string): ParsedMcpToolName | null {
  if (!name.startsWith(`${MCP_TOOL_NAME_PREFIX}_`)) return null;
  const rest = name.slice(MCP_TOOL_NAME_PREFIX.length + 1);
  const separator = rest.indexOf('_');
  if (separator <= 0 || separator >= rest.length - 1) return null;
  return {
    serverKey: rest.slice(0, separator),
    toolName: rest.slice(separator + 1),
  };
}
