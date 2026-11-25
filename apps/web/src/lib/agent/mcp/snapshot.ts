/**
 * MCP 工具定义快照与白名单策略重整（工单 03 / ADR-0064 §5）
 *
 * 职责（纯函数层，便于确定性验证）：
 * 1. 判定单个工具的「支持状态」：远程 `$ref`、`$async`/`$data`、描述或 Schema
 *    超限时明确标记为不支持（不自动抓取外部引用）；
 * 2. 按新快照重整白名单策略：
 *    - 仍存在且描述与 Schema 均未变的工具 → 保留原有启停与审批策略；
 *    - 新增工具、Schema 变化、描述变化的工具 → 回落「停用 + 默认必须审批」；
 *    - 上游已删除的工具 → 从白名单移除。
 *
 * 信任语义：工具名称与上游注解**不参与**安全判定，只作展示。
 */

import { MCP_MAX_SCHEMA_BYTES } from './schema';
import { MCP_MAX_TOOL_DESCRIPTION_CHARS, type McpToolDefinition } from './contracts';

export type { McpToolDefinition };

/** 白名单策略（持久层与快照层共用形状） */
export interface McpToolPolicyView {
  toolName: string;
  /** 是否加入白名单（进入 Agent 上下文） */
  enabled: boolean;
  /** 是否允许自动执行；false 表示必须经用户审批 */
  allowAutoExecute: boolean;
}

/** 工具支持状态判定结果 */
export interface McpToolSupportEvaluation {
  supported: boolean;
  /** 不支持原因（中文，供用户与模型理解） */
  reason?: string;
}

/** 判定是否为 IP 字面量（不参与此处判定，保留以便扩展） */
function isJsonSchemaLike(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 扫描工具参数契约中是否出现被禁用的关键字。
 *
 * @param schema JSON Schema 对象
 * @returns 命中的关键字名；无命中返回 null
 */
function findForbiddenKeyword(schema: unknown): string | null {
  if (!isJsonSchemaLike(schema)) return null;
  const record = schema as Record<string, unknown>;

  for (const key of ['$async', '$data'] as const) {
    if (key in record) return key;
  }
  if (typeof record.$ref === 'string' && !record.$ref.startsWith('#')) {
    return '$ref';
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findForbiddenKeyword(item);
        if (found) return found;
      }
      continue;
    }
    if (isJsonSchemaLike(value)) {
      const found = findForbiddenKeyword(value);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 判定工具是否受平台支持。
 *
 * @param tool 工具定义
 * @returns 支持与否及原因
 */
export function evaluateMcpToolSupport(tool: McpToolDefinition): McpToolSupportEvaluation {
  if ((tool.description ?? '').length > MCP_MAX_TOOL_DESCRIPTION_CHARS) {
    return { supported: false, reason: '工具描述超出长度上限，该工具不受支持' };
  }

  const bytes = Buffer.byteLength(
    JSON.stringify(tool.inputSchema ?? null),
    'utf8'
  );
  if (bytes > MCP_MAX_SCHEMA_BYTES) {
    return { supported: false, reason: '工具参数 Schema 过大，该工具不受支持' };
  }

  const forbidden = findForbiddenKeyword(tool.inputSchema);
  if (forbidden === '$ref') {
    return { supported: false, reason: '工具参数 Schema 含远程引用，该工具不受支持' };
  }
  if (forbidden) {
    return {
      supported: false,
      reason: `工具参数 Schema 含不支持的关键字（${forbidden}），该工具不受支持`,
    };
  }

  return { supported: true };
}

/** 工具定义的稳定指纹：描述与入参契约共同决定 */
function definitionFingerprint(tool: McpToolDefinition): string {
  return JSON.stringify({
    description: tool.description ?? '',
    inputSchema: tool.inputSchema ?? null,
  });
}

/**
 * 按新快照重整白名单策略。
 *
 * 这是重整语义的真源：**只有工具仍存在、且描述与 Schema 都未变**时，
 * 才保留原有的启停与审批策略；否则一律回落「停用 + 默认必须审批」。
 * 上游已删除的工具不出现在结果中（从白名单移除）。
 *
 * @param previousPolicies 上一轮策略
 * @param previousTools 上一轮工具定义（用于比对描述与 Schema）
 * @param nextTools 新快照中的工具定义
 */
export function reconcileMcpToolPolicies(
  previousPolicies: McpToolPolicyView[],
  previousTools: McpToolDefinition[],
  nextTools: McpToolDefinition[]
): McpToolPolicyView[] {
  const previousPolicyByName = new Map(
    previousPolicies.map((policy) => [policy.toolName, policy])
  );
  const previousToolByName = new Map(
    previousTools.map((tool) => [tool.toolName, tool])
  );

  return nextTools.map((tool) => {
    const policy = previousPolicyByName.get(tool.toolName);
    const previousTool = previousToolByName.get(tool.toolName);

    // 新增工具：回落默认
    if (!policy || !previousTool) {
      return { toolName: tool.toolName, enabled: false, allowAutoExecute: false };
    }

    // 描述或 Schema 变化：回落默认
    if (definitionFingerprint(previousTool) !== definitionFingerprint(tool)) {
      return { toolName: tool.toolName, enabled: false, allowAutoExecute: false };
    }

    // 未变化：保留原有启停与审批策略
    return {
      toolName: policy.toolName,
      enabled: policy.enabled,
      allowAutoExecute: policy.allowAutoExecute,
    };
  });
}
