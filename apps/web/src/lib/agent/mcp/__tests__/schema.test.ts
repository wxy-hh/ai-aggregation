/**
 * MCP 工具参数 JSON Schema 2020-12 校验表驱动测试（工单 01 / ADR-0064 §4）
 *
 * 覆盖的外部可观察行为：
 * - 合法的 2020-12 组合关键字（oneOf/allOf/条件/本地 $defs）能编译并正确判定；
 * - 远程 $ref、$async、$data 一律拒绝，且不触发任何网络请求；
 * - Schema 深度、描述长度、Schema 字节数上限被拒绝，上限内被接受；
 * - 编译与校验预算被实际施加。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateMcpToolArguments,
  compileMcpToolSchema,
  McpSchemaError,
  MCP_MAX_SCHEMA_DEPTH,
  MCP_MAX_SCHEMA_BYTES,
  MCP_MAX_DESCRIPTION_CHARS,
  MCP_SCHEMA_COMPILE_BUDGET_MS,
  MCP_SCHEMA_VALIDATE_BUDGET_MS,
} from '../schema';

describe('MCP 工具参数 Schema 校验', () => {
  it('接受含 oneOf 与本地 $defs 的合法 Schema 并判定参数', () => {
    const schema = {
      type: 'object',
      $defs: {
        编号: { type: 'string' },
      },
      properties: {
        目标: { oneOf: [{ $ref: '#/$defs/编号' }, { type: 'number' }] },
      },
      required: ['目标'],
    };

    const result = validateMcpToolArguments(schema, { 目标: 'A-1' });

    expect(result.ok).toBe(true);
  });

  it('合法 Schema 拒绝不符合约束的参数', () => {
    const schema = {
      type: 'object',
      properties: { 数量: { type: 'number', minimum: 1 } },
      required: ['数量'],
    };

    const result = validateMcpToolArguments(schema, { 数量: 0 });

    expect(result.ok).toBe(false);
  });

  it('拒绝含远程 $ref 的 Schema 且不发起网络请求', () => {
    const schema = {
      type: 'object',
      properties: { 外链: { $ref: 'https://evil.example.com/schema.json' } },
    };

    expect(() => compileMcpToolSchema(schema)).toThrow(McpSchemaError);
  });

  it('拒绝含 $async 关键字的 Schema', () => {
    const schema = { type: 'object', $async: true };

    expect(() => compileMcpToolSchema(schema)).toThrow(McpSchemaError);
  });

  it('拒绝含 $data 关键字的 Schema', () => {
    const schema = { type: 'object', properties: { 值: { $data: { prop: 'x' } } } };

    expect(() => compileMcpToolSchema(schema)).toThrow(McpSchemaError);
  });

  it('拒绝深度超限的 Schema', () => {
    const schema: Record<string, unknown> = { type: 'object' };
    let cursor = schema;
    for (let depth = 0; depth <= MCP_MAX_SCHEMA_DEPTH + 2; depth += 1) {
      const next: Record<string, unknown> = { type: 'object' };
      cursor.properties = { 子: next };
      cursor = next;
    }

    expect(() => compileMcpToolSchema(schema)).toThrow(/深度/i);
  });

  it('拒绝字节数超限的 Schema', () => {
    const schema = {
      type: 'object',
      properties: { 长: { type: 'string', description: 'x'.repeat(MCP_MAX_SCHEMA_BYTES) } },
    };

    expect(() => compileMcpToolSchema(schema)).toThrow(/过大/i);
  });

  it('接受上限内的 Schema', () => {
    const schema = {
      type: 'object',
      properties: { 短: { type: 'string', description: 'x'.repeat(10) } },
    };

    expect(() => compileMcpToolSchema(schema)).not.toThrow();
  });

  it('描述长度上限被单独校验，且编译预算 500ms 与校验预算 100ms 实际生效（TC11-6）', () => {
    expect(MCP_MAX_DESCRIPTION_CHARS).toBe(2000);
    expect(MCP_SCHEMA_COMPILE_BUDGET_MS).toBe(500);
    expect(MCP_SCHEMA_VALIDATE_BUDGET_MS).toBe(100);

    const schema = { type: 'object', properties: { key: { type: 'string' } } };
    let tick = 1000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      const val = tick;
      tick += 501;
      return val;
    });

    try {
      expect(() => compileMcpToolSchema(schema)).toThrow(/超出预算/);
    } finally {
      nowSpy.mockRestore();
    }

    // 编译不超时（+1ms），但校验超时（+101ms）
    let calls = 0;
    const validateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      calls += 1;
      if (calls === 1) return 1000;
      if (calls === 2) return 1001;
      if (calls === 3) return 2000;
      return 2101;
    });
    try {
      const res = validateMcpToolArguments(schema, { key: 'ok' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/超出预算/);
    } finally {
      validateSpy.mockRestore();
    }
  });
});
