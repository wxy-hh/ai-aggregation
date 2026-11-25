/**
 * MCP 工具挂载守卫测试（工单 02 / ADR-0064 §2）
 *
 * 覆盖的外部可观察行为：
 * - 无有效快照的 Server 不挂载任何工具
 * - 未加入白名单的工具不挂载
 * - 停用的 Server 不挂载
 * - 快照版本或指纹不匹配时不挂载
 * - 上游已删除的工具不挂载
 * - 满足全部条件时挂载
 */

import { describe, it, expect } from 'vitest';
import { decideMcpToolMount, selectMountableMcpTools } from '../mount';
import type { MountableMcpServer, MountableMcpSnapshot } from '../mount';

const server: MountableMcpServer = {
  id: 'srv_1',
  name: '代码仓库服务',
  url: 'https://mcp.example.com/mcp',
  isActive: true,
  snapshotVersion: 2,
  configFingerprint: 'fp_1',
};

const snapshot: MountableMcpSnapshot = {
  serverId: 'srv_1',
  version: 2,
  configFingerprint: 'fp_1',
  tools: [
    {
      toolName: 'read_value',
      description: '读取一个受控值',
      inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
      annotations: null,
      modelToolName: 'mcp_srv_1_read_value',
    },
  ],
};

const enabledPolicy = { serverId: 'srv_1', toolName: 'read_value', enabled: true };
const disabledPolicy = { serverId: 'srv_1', toolName: 'read_value', enabled: false };

describe('MCP 工具挂载守卫', () => {
  it('满足全部条件时挂载', () => {
    const decision = decideMcpToolMount(server, snapshot, enabledPolicy);

    expect(decision.mount).toBe(true);
  });

  it('Server 停用时不挂载', () => {
    const decision = decideMcpToolMount({ ...server, isActive: false }, snapshot, enabledPolicy);

    expect(decision.mount).toBe(false);
    expect(decision.reason).toBe('server_inactive');
  });

  it('无有效快照时不挂载', () => {
    const decision = decideMcpToolMount(
      { ...server, snapshotVersion: null },
      null,
      enabledPolicy
    );

    expect(decision.mount).toBe(false);
    expect(decision.reason).toBe('no_snapshot');
  });

  it('快照版本不匹配时不挂载', () => {
    const decision = decideMcpToolMount(server, { ...snapshot, version: 1 }, enabledPolicy);

    expect(decision.mount).toBe(false);
    expect(decision.reason).toBe('snapshot_mismatch');
  });

  it('快照指纹不匹配时不挂载', () => {
    const decision = decideMcpToolMount(
      server,
      { ...snapshot, configFingerprint: 'fp_other' },
      enabledPolicy
    );

    expect(decision.mount).toBe(false);
    expect(decision.reason).toBe('snapshot_mismatch');
  });

  it('工具未加入白名单时不挂载', () => {
    const decision = decideMcpToolMount(server, snapshot, disabledPolicy);

    expect(decision.mount).toBe(false);
    expect(decision.reason).toBe('not_whitelisted');
  });

  it('工具无策略记录时不挂载', () => {
    const decision = decideMcpToolMount(server, snapshot, null);

    expect(decision.mount).toBe(false);
    expect(decision.reason).toBe('not_whitelisted');
  });

  it('上游已删除的工具不挂载', () => {
    const decision = decideMcpToolMount(
      server,
      { ...snapshot, tools: [] },
      enabledPolicy
    );

    expect(decision.mount).toBe(false);
    expect(decision.reason).toBe('tool_missing_in_snapshot');
  });

  it('不受支持的工具不挂载', () => {
    const unsupportedSnapshot: MountableMcpSnapshot = {
      ...snapshot,
      tools: [
        {
          ...snapshot.tools[0],
          inputSchema: {
            type: 'object',
            properties: { payload: { $ref: 'https://evil.example.com/s.json' } },
          },
        },
      ],
    };

    const decision = decideMcpToolMount(server, unsupportedSnapshot, enabledPolicy);

    expect(decision.mount).toBe(false);
    expect(decision.reason).toBe('tool_unsupported');
  });

  it('汇总只返回通过判定的工具并带上来源 Server', () => {
    const mounted = selectMountableMcpTools([server], [snapshot], [enabledPolicy]);

    expect(mounted).toHaveLength(1);
    expect(mounted[0].toolName).toBe('read_value');
    expect(mounted[0].serverId).toBe('srv_1');
    expect(mounted[0].serverName).toBe('代码仓库服务');
  });

  it('汇总排除未加入白名单的工具', () => {
    const mounted = selectMountableMcpTools([server], [snapshot], [disabledPolicy]);

    expect(mounted).toHaveLength(0);
  });

  it('模型侧工具名非法或超过 64 字符时兜底拒绝挂载', () => {
    const invalidSnapshot: MountableMcpSnapshot = {
      ...snapshot,
      tools: [{ ...snapshot.tools[0], modelToolName: `mcp_${'x'.repeat(80)}` }],
    };

    const decision = decideMcpToolMount(server, invalidSnapshot, enabledPolicy);

    expect(decision.mount).toBe(false);
    expect(decision.reason).toBe('tool_unsupported');
  });

  it('历史快照出现重复模型侧工具名时只挂载一项，避免注册表重名覆盖', () => {
    const duplicateSnapshot: MountableMcpSnapshot = {
      ...snapshot,
      tools: [
        snapshot.tools[0],
        {
          ...snapshot.tools[0],
          toolName: 'read-value',
        },
      ],
    };
    const policies = [
      enabledPolicy,
      { serverId: 'srv_1', toolName: 'read-value', enabled: true },
    ];

    const mounted = selectMountableMcpTools([server], [duplicateSnapshot], policies);

    expect(mounted).toHaveLength(1);
    expect(new Set(mounted.map((tool) => tool.modelToolName)).size).toBe(1);
  });
});
