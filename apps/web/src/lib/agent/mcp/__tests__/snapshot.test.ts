/**
 * MCP 快照重整策略测试（工单 03 / ADR-0064 §5）
 *
 * 覆盖的外部可观察行为：
 * - 仍存在且描述与 Schema 未变的工具保留原有启停与审批策略
 * - 新增工具回落「停用 + 默认必须审批」
 * - Schema 变化的工具回落「停用 + 默认必须审批」
 * - 描述变化的工具回落「停用 + 默认必须审批」
 * - 上游删除的工具从白名单移除
 * - 跨 Server 重名工具的模型侧命名不覆盖
 * - 远程 `$ref` / `$async` / `$data` / 超限 Schema 的工具被标记不支持
 */

import { describe, it, expect } from 'vitest';
import {
  reconcileMcpToolPolicies,
  evaluateMcpToolSupport,
  type McpToolDefinition,
} from '../snapshot';

const serverId = 'srv_1';

function tool(overrides: Partial<McpToolDefinition> = {}): McpToolDefinition {
  return {
    toolName: 'read_value',
    description: '读取一个受控值',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
    annotations: null,
    modelToolName: 'mcp_srv_1_read_value',
    ...overrides,
  };
}

describe('MCP 快照重整策略', () => {
  it('仍存在且描述与 Schema 未变的工具保留原有启停与审批策略', () => {
    const previous = [{ toolName: 'read_value', enabled: true, allowAutoExecute: true }];
    const next = [tool()];

    const result = reconcileMcpToolPolicies(previous, [tool()], next);

    expect(result).toEqual([
      { toolName: 'read_value', enabled: true, allowAutoExecute: true },
    ]);
  });

  it('新增工具回落停用且默认必须审批', () => {
    const previous = [
      { toolName: 'read_value', enabled: true, allowAutoExecute: false },
    ];
    const next = [tool(), tool({ toolName: 'write_value', modelToolName: 'mcp_srv_1_write_value' })];

    const result = reconcileMcpToolPolicies(previous, [tool()], next);

    const added = result.find((policy) => policy.toolName === 'write_value');
    expect(added?.enabled).toBe(false);
    expect(added?.allowAutoExecute).toBe(false);
  });

  it('Schema 变化的工具回落停用且默认必须审批', () => {
    const previous = [
      { toolName: 'read_value', enabled: true, allowAutoExecute: true },
    ];
    const next = [
      tool({
        inputSchema: { type: 'object', properties: { key: { type: 'number' } } },
      }),
    ];

    const result = reconcileMcpToolPolicies(previous, [tool()], next);

    expect(result[0].enabled).toBe(false);
    expect(result[0].allowAutoExecute).toBe(false);
  });

  it('描述变化的工具回落停用且默认必须审批', () => {
    const previous = [
      { toolName: 'read_value', enabled: true, allowAutoExecute: true },
    ];
    const next = [tool({ description: '读取一个受控值（新版说明）' })];

    const result = reconcileMcpToolPolicies(previous, [tool()], next);

    expect(result[0].enabled).toBe(false);
    expect(result[0].allowAutoExecute).toBe(false);
  });

  it('上游删除的工具从白名单移除', () => {
    const previous = [
      { toolName: 'read_value', enabled: true, allowAutoExecute: false },
      { toolName: 'write_value', enabled: true, allowAutoExecute: false },
    ];
    const next = [tool()];

    const result = reconcileMcpToolPolicies(previous, [tool(), tool({ toolName: 'write_value' })], next);

    expect(result.map((policy) => policy.toolName)).toEqual(['read_value']);
  });

  it('跨 Server 重名工具的模型侧命名不覆盖', () => {
    const first = tool({ modelToolName: 'mcp_srv_1_read_value' });
    const second = tool({ modelToolName: 'mcp_srv_2_read_value' });

    expect(first.modelToolName).not.toBe(second.modelToolName);
  });

  it('远程 $ref 的工具被标记不支持', () => {
    const evaluation = evaluateMcpToolSupport({
      ...tool(),
      inputSchema: {
        type: 'object',
        properties: { payload: { $ref: 'https://evil.example.com/s.json' } },
      },
    });

    expect(evaluation.supported).toBe(false);
    expect(evaluation.reason).toMatch(/远程引用/);
  });

  it('含 $async 或 $data 的工具被标记不支持', () => {
    const asyncEval = evaluateMcpToolSupport({ ...tool(), inputSchema: { type: 'object', $async: true } });
    const dataEval = evaluateMcpToolSupport({
      ...tool(),
      inputSchema: { type: 'object', properties: { v: { $data: { prop: 'x' } } } },
    });

    expect(asyncEval.supported).toBe(false);
    expect(dataEval.supported).toBe(false);
  });

  it('描述超限的工具被标记不支持', () => {
    const evaluation = evaluateMcpToolSupport({
      ...tool(),
      description: 'x'.repeat(2001),
    });

    expect(evaluation.supported).toBe(false);
    expect(evaluation.reason).toMatch(/描述/);
  });

  it('合法工具被标记为支持', () => {
    const evaluation = evaluateMcpToolSupport(tool());

    expect(evaluation.supported).toBe(true);
    expect(evaluation.reason).toBeUndefined();
  });
});
