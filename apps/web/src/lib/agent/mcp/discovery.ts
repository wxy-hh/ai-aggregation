/**
 * MCP 工具发现编排（工单 02 / ADR-0064 §5）
 *
 * 职责：把「一次发现」收敛为可复用的纯流程：
 * - 解密静态鉴权头并注入（明文只在进程内短暂存在，不进日志与审计）；
 * - 调用工单 01 的客户端管理器执行受控发现；
 * - 把结果映射为快照条目与可读失败原因。
 *
 * 失败关闭：发现失败不抛出到路由层，而是返回明确原因，由调用方决定保留配置。
 */

import { createHash } from 'node:crypto';
import { decryptWebhookSecret } from '@/lib/crypto/webhook-secret';
import { createMcpClientManager, type McpDiscoverOptions } from './client';
import { buildMcpToolName } from './naming';
import { MCP_MAX_SNAPSHOT_BYTES, MCP_MAX_TOOL_DESCRIPTION_CHARS } from './contracts';

/** 发现入参 */
export interface DiscoverMcpToolsInput {
  /** Streamable HTTP 端点地址 */
  url: string;
  /** Server 稳定标识（用于派生模型侧工具名） */
  serverKey: string;
  /** 鉴权头名（可空） */
  authHeaderName?: string | null;
  /** 鉴权头密文（AES-256-GCM；可空） */
  authHeaderValueEnc?: string | null;
  /** 仅测试注入点：受控 Fetch、目标白名单与明文降级 */
  fetchImpl?: McpDiscoverOptions['fetchImpl'];
  allowedPrivateTargets?: string[];
  allowInsecureHttp?: boolean;
}

/** 发现结果 */
export type DiscoverMcpToolsResult =
  | {
      ok: true;
      tools: Array<{
        toolName: string;
        description: string;
        inputSchema: unknown;
        annotations: Record<string, unknown> | null;
        modelToolName: string;
      }>;
      totalBytes: number;
    }
  | { ok: false; reason: string };

/**
 * 推导安全配置指纹。
 *
 * 绑定「规范化 URL + 鉴权头名 + 密文摘要 + 快照版本 + 启停状态 + 审批策略」，
 * 由服务端推导，不接受请求体传入；任一项变化都会改变指纹，从而使旧审批失效。
 *
 * @param input 指纹构成项
 */
export function computeConfigFingerprint(input: {
  url: string;
  authHeaderName?: string | null;
  authHeaderValueEnc?: string | null;
  snapshotVersion?: number | null;
  isActive?: boolean;
  toolPolicies?: Array<{ toolName: string; enabled: boolean; allowAutoExecute: boolean }>;
}): string {
  const canonicalUrl = (() => {
    try {
      const url = new URL(input.url);
      return `${url.protocol}//${url.host}${url.pathname}`;
    } catch {
      return input.url.trim();
    }
  })();

  const policies = (input.toolPolicies ?? [])
    .map(
      (policy) =>
        `${policy.toolName}:${policy.enabled ? 1 : 0}:${policy.allowAutoExecute ? 1 : 0}`
    )
    .sort()
    .join('|');

  const material = [
    canonicalUrl,
    input.authHeaderName ?? '',
    input.authHeaderValueEnc ? createHash('sha256').update(input.authHeaderValueEnc).digest('hex') : '',
    String(input.snapshotVersion ?? 0),
    input.isActive === false ? '0' : '1',
    policies,
  ].join('\n');

  return createHash('sha256').update(material).digest('hex');
}

/** 解密静态鉴权头取值；无密文返回 null；解密失败按失败关闭抛错 */
function resolveAuthHeaders(input: DiscoverMcpToolsInput): Record<string, string> {
  if (!input.authHeaderName) return {};
  if (!input.authHeaderValueEnc) return {};
  const plain = decryptWebhookSecret(input.authHeaderValueEnc);
  return { [input.authHeaderName]: plain };
}

/**
 * 执行一次受控工具发现。
 *
 * @param input 发现入参
 * @returns 成功返回工具条目与快照字节数；失败返回明确中文原因
 */
export async function discoverMcpTools(
  input: DiscoverMcpToolsInput
): Promise<DiscoverMcpToolsResult> {
  let authHeaders: Record<string, string>;
  try {
    authHeaders = resolveAuthHeaders(input);
  } catch {
    // 解密失败：不静默降级为无鉴权（否则请求会带着缺失凭证发出）
    return { ok: false, reason: '鉴权凭证解密失败，请检查配置后重试' };
  }

  const manager = createMcpClientManager();
  try {
    const result = await manager.discover(input.url, {
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(authHeaders.Authorization || Object.keys(authHeaders).length
        ? { authHeaders }
        : {}),
      ...(input.allowedPrivateTargets
        ? { allowedPrivateTargets: input.allowedPrivateTargets }
        : {}),
      ...(input.allowInsecureHttp ? { allowInsecureHttp: true } : {}),
    });

    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    const rawToolNames = new Set<string>();
    for (const tool of result.tools) {
      if (rawToolNames.has(tool.toolName)) {
        return { ok: false, reason: `上游返回重复工具名「${tool.toolName}」，已拒绝保存快照` };
      }
      rawToolNames.add(tool.toolName);
    }

    const baseNames = result.tools.map((tool) =>
      buildMcpToolName(input.serverKey, tool.toolName)
    );
    const baseNameCounts = new Map<string, number>();
    for (const name of baseNames) {
      baseNameCounts.set(name, (baseNameCounts.get(name) ?? 0) + 1);
    }

    const tools = result.tools.map((tool, index) => ({
      ...tool,
      description: (tool.description ?? '').slice(0, MCP_MAX_TOOL_DESCRIPTION_CHARS),
      // 归一化后重名的一组工具统一附加原始名哈希，避免顺序变化导致名称互换
      modelToolName: buildMcpToolName(input.serverKey, tool.toolName, {
        disambiguate: (baseNameCounts.get(baseNames[index]) ?? 0) > 1,
      }),
    }));

    const totalBytes = Buffer.byteLength(JSON.stringify(tools), 'utf8');
    if (totalBytes > MCP_MAX_SNAPSHOT_BYTES) {
      return {
        ok: false,
        reason: `工具定义快照过大（超过 ${MCP_MAX_SNAPSHOT_BYTES} 字节上限），已拒绝保存`,
      };
    }

    return { ok: true, tools, totalBytes };
  } finally {
    // 发现连接必须可靠关闭（幂等）
    await manager.dispose();
  }
}
