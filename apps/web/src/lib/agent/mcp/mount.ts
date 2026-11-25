/**
 * MCP 工具挂载守卫（工单 02 / ADR-0064 §2）
 *
 * 规则（任一不满足即不挂载）：
 * 1. Server 必须存在有效快照（`snapshotVersion` 非空且快照记录存在）；
 * 2. Server 必须处于启用状态；
 * 3. 工具必须在白名单策略中且 `enabled=true`；
 * 4. 快照中必须存在该工具的定义（上游已删除的工具不再挂载）。
 *
 * 未加入白名单的工具绝不进入 Agent 上下文；会话级覆盖只能进一步收窄。
 */

import { evaluateMcpToolSupport } from './snapshot';
import { isValidMcpModelToolName } from './naming';
import type { McpToolDefinition } from './contracts';

/** 参与挂载判定的 Server 记录 */
export interface MountableMcpServer {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  /** 当前有效快照版本号；无快照为 null */
  snapshotVersion: number | null;
  /** 安全配置指纹（与快照一致才有效） */
  configFingerprint: string | null;
}

/** 参与挂载判定的快照记录 */
export interface MountableMcpSnapshot {
  serverId: string;
  version: number;
  configFingerprint: string;
  tools: McpToolDefinition[];
}

/** 参与挂载判定的工具策略 */
export interface MountableMcpPolicy {
  serverId: string;
  toolName: string;
  enabled: boolean;
}

/** 挂载判定结果 */
export interface McpMountDecision {
  /** 是否挂载该工具 */
  mount: boolean;
  /** 不挂载的原因（用于日志与可观测性） */
  reason?:
    | 'server_inactive'
    | 'no_snapshot'
    | 'snapshot_mismatch'
    | 'not_whitelisted'
    | 'tool_missing_in_snapshot'
    | 'tool_unsupported';
}

/**
 * 判定单个工具是否应挂载到 Agent。
 *
 * @param server Server 记录
 * @param snapshot 该 Server 的当前有效快照（可为 null）
 * @param policy 该工具的白名单策略（可为 null）
 */
export function decideMcpToolMount(
  server: MountableMcpServer,
  snapshot: MountableMcpSnapshot | null,
  policy: MountableMcpPolicy | null
): McpMountDecision {
  if (!server.isActive) {
    return { mount: false, reason: 'server_inactive' };
  }
  if (server.snapshotVersion === null || !snapshot) {
    return { mount: false, reason: 'no_snapshot' };
  }
  if (snapshot.version !== server.snapshotVersion) {
    return { mount: false, reason: 'snapshot_mismatch' };
  }
  if (snapshot.configFingerprint !== server.configFingerprint) {
    return { mount: false, reason: 'snapshot_mismatch' };
  }
  if (!policy?.enabled) {
    return { mount: false, reason: 'not_whitelisted' };
  }
  const definition = snapshot.tools.find((tool) => tool.toolName === policy.toolName);
  if (!definition) {
    return { mount: false, reason: 'tool_missing_in_snapshot' };
  }
  // 不受支持的工具（非法模型名、远程 $ref、$async/$data、超限描述或 Schema）一律不挂载
  if (
    !isValidMcpModelToolName(definition.modelToolName) ||
    !evaluateMcpToolSupport(definition).supported
  ) {
    return { mount: false, reason: 'tool_unsupported' };
  }
  return { mount: true };
}

/**
 * 汇总当前应挂载的 MCP 工具。
 *
 * @param servers Server 记录列表
 * @param snapshots 快照记录列表
 * @param policies 工具策略列表
 * @returns 通过挂载判定的工具定义（含来源 Server 信息）
 */
export function selectMountableMcpTools(
  servers: MountableMcpServer[],
  snapshots: MountableMcpSnapshot[],
  policies: MountableMcpPolicy[]
): Array<McpToolDefinition & { serverId: string; serverName: string }> {
  const snapshotByServer = new Map(snapshots.map((snapshot) => [snapshot.serverId, snapshot]));
  const policyByKey = new Map(
    policies.map((policy) => [`${policy.serverId}:${policy.toolName}`, policy])
  );

  const mounted: Array<McpToolDefinition & { serverId: string; serverName: string }> = [];
  const seenModelToolNames = new Set<string>();

  for (const server of servers) {
    const snapshot = snapshotByServer.get(server.id);
    for (const tool of snapshot?.tools ?? []) {
      const policy = policyByKey.get(`${server.id}:${tool.toolName}`);
      const decision = decideMcpToolMount(server, snapshot ?? null, policy ?? null);
      if (!decision.mount) continue;
      // 历史快照可能含重名：只保留首个，绝不让注册表 list() 重名或 get() 静默覆盖
      if (seenModelToolNames.has(tool.modelToolName)) continue;
      seenModelToolNames.add(tool.modelToolName);
      mounted.push({
        ...tool,
        serverId: server.id,
        serverName: server.name,
      });
    }
  }

  return mounted;
}
