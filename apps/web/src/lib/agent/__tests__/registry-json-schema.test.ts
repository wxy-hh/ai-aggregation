/**
 * 工具注册表的 JSON Schema 规格形态测试（工单 01 / ADR-0064 §3）
 *
 * 覆盖的外部可观察行为：
 * - 注册表可同时承载 Zod 规格（MCP 之外的既有工具）与 JSON Schema 规格（MCP 工具）；
 * - JSON Schema 规格的参数校验走 JSON Schema 2020-12 语义；
 * - 非法参数被拒绝并给出可读中文原因，合法参数被接受。
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createToolRegistry, validateToolArgs } from '../registry';

describe('工具注册表的 JSON Schema 规格形态', () => {
  it('注册表可同时承载 Zod 与 JSON Schema 两种规格', () => {
    const registry = createToolRegistry([
      {
        name: 'legacy_tool',
        description: '既有 Zod 规格工具',
        parameters: z.object({ q: z.string() }),
        execute: async () => ({ ok: true, contentForModel: '', summaryForDisplay: '' }),
      },
      {
        name: 'mcp_tool',
        description: 'MCP JSON Schema 规格工具',
        parameters: {
          type: 'object',
          properties: { key: { type: 'string' } },
          required: ['key'],
        } as never,
        execute: async () => ({ ok: true, contentForModel: '', summaryForDisplay: '' }),
      },
    ]);

    expect(registry.list().map((spec) => spec.name).sort()).toEqual([
      'legacy_tool',
      'mcp_tool',
    ]);
  });

  it('Zod 规格工具的参数校验行为不变', () => {
    const registry = createToolRegistry([
      {
        name: 'legacy_tool',
        description: '既有 Zod 规格工具',
        parameters: z.object({ q: z.string() }),
        execute: async () => ({ ok: true, contentForModel: '', summaryForDisplay: '' }),
      },
    ]);

    const spec = registry.get('legacy_tool');
    expect(spec).toBeDefined();
    const ok = validateToolArgs(spec!, { q: 'x' });
    expect(ok.ok).toBe(true);
    const bad = validateToolArgs(spec!, { q: 1 });
    expect(bad.ok).toBe(false);
  });

  it('JSON Schema 规格工具的合法参数被接受', () => {
    const registry = createToolRegistry([
      {
        name: 'mcp_tool',
        description: 'MCP JSON Schema 规格工具',
        parameters: {
          type: 'object',
          properties: { key: { type: 'string' } },
          required: ['key'],
        } as never,
        execute: async () => ({ ok: true, contentForModel: '', summaryForDisplay: '' }),
      },
    ]);

    const spec = registry.get('mcp_tool');
    expect(spec).toBeDefined();
    expect(validateToolArgs(spec!, { key: 'abc' }).ok).toBe(true);
  });

  it('JSON Schema 规格工具的非法参数被拒绝并给出中文原因', () => {
    const registry = createToolRegistry([
      {
        name: 'mcp_tool',
        description: 'MCP JSON Schema 规格工具',
        parameters: {
          type: 'object',
          properties: { key: { type: 'string' } },
          required: ['key'],
        } as never,
        execute: async () => ({ ok: true, contentForModel: '', summaryForDisplay: '' }),
      },
    ]);

    const spec = registry.get('mcp_tool');
    const result = validateToolArgs(spec!, { key: 42 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/参数校验失败/);
  });

  it('JSON Schema 规格工具的必填缺失同样被拒绝', () => {
    const registry = createToolRegistry([
      {
        name: 'mcp_tool',
        description: 'MCP JSON Schema 规格工具',
        parameters: {
          type: 'object',
          properties: { key: { type: 'string' } },
          required: ['key'],
        } as never,
        execute: async () => ({ ok: true, contentForModel: '', summaryForDisplay: '' }),
      },
    ]);

    const spec = registry.get('mcp_tool');
    expect(validateToolArgs(spec!, {}).ok).toBe(false);
  });
});
