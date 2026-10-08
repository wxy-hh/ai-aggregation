/**
 * Agent 运行时上下文深模块单测（runtime-context.test.ts）· Candidate 04 / ADR-0011
 *
 * 接缝策略：接口即测试表面 —— 只注入 loadUserTools（数据源）与 baseRegistry（内存注册表），
 * 全程不触数据库、不发网络请求；Webhook 执行器与审计写入以模块替身隔离。
 *
 * 覆盖：
 * 1. 装配：启用工具进入合并注册表（wh_ 前缀），停用工具被隔离，内置工具保持可用；
 * 2. 加载失败降级：告警留痕、不抛错、注册表回落 baseRegistry、元数据为 0；
 * 3. 空工具列表：直接复用 baseRegistry 单例（零额外开销）；
 * 4. 观测元数据：实际派发次数经 finishMetadata 统一产出，达上限后拦截不增计数。
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { UserWebhookTool } from '@repo/db';
import { createToolRegistry, type AgentToolSpec, type ToolRegistry } from '@/lib/agent/registry';
import { AGENT_MAX_WEBHOOK_CALLS } from './agent-config';
import { createAgentRuntimeContext } from './runtime-context';

const { executeWebhookToolMock, writeAuditRecordMock } = vi.hoisted(() => ({
  executeWebhookToolMock: vi.fn(),
  writeAuditRecordMock: vi.fn(async () => {}),
}));

// 出站执行与审计落库整体替换：本套件只验证运行时装配与计数契约
vi.mock('@/lib/webhook/executor', () => ({
  executeWebhookTool: executeWebhookToolMock,
  writeAuditRecord: writeAuditRecordMock,
  tryExtractHostname: (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  },
}));

/** 构造一条用户 Webhook 工具数据库实体（测试夹具） */
function makeUserTool(overrides: Partial<UserWebhookTool> = {}): UserWebhookTool {
  return {
    id: 'tool-1',
    userId: 'u1',
    name: '天气查询',
    callName: 'weather',
    description: '查询天气',
    url: 'https://api.example.com/weather',
    method: 'POST',
    authHeaderName: null,
    authHeaderValueEnc: null,
    params: [{ name: 'city', type: 'string', required: true }],
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserWebhookTool;
}

/** 构造内存基础注册表（内置工具替身） */
function makeBaseRegistry(): { registry: ToolRegistry; builtin: AgentToolSpec } {
  const builtin: AgentToolSpec = {
    name: 'web_fetch',
    description: '内置抓取工具',
    parameters: z.object({ url: z.string() }),
    execute: async () => ({ ok: true, contentForModel: '内置结果', summaryForDisplay: '完成' }),
  };
  return { registry: createToolRegistry([builtin]), builtin };
}

const CTX = {
  userId: 'u1',
  signal: new AbortController().signal,
  errorId: 'err-1',
};

describe('createAgentRuntimeContext 运行时装配', () => {
  it('启用工具进入合并注册表，停用工具被隔离，内置工具保持可用', async () => {
    const { registry: base } = makeBaseRegistry();
    const runtime = await createAgentRuntimeContext({
      userId: 'u1',
      baseRegistry: base,
      loadUserTools: async () => [
        makeUserTool(),
        makeUserTool({ id: 'tool-2', callName: 'stock', enabled: false }),
      ],
    });

    expect(runtime.registry.has('wh_weather')).toBe(true);
    expect(runtime.registry.has('wh_stock')).toBe(false);
    expect(runtime.registry.has('web_fetch')).toBe(true);
    expect(runtime.registry.list().map((s) => s.name)).toEqual(['web_fetch', 'wh_weather']);
  });

  it('加载失败时降级：告警留痕、不抛错、注册表回落 baseRegistry、元数据为 0', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { registry: base } = makeBaseRegistry();

    const runtime = await createAgentRuntimeContext({
      userId: 'u1',
      errorId: 'err-load',
      baseRegistry: base,
      loadUserTools: async () => {
        throw new Error('Postgres 连接超时');
      },
    });

    expect(runtime.registry).toBe(base);
    expect(runtime.finishMetadata()).toEqual({ webhookCalls: 0 });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[chat] 加载用户自定义工具失败，按无用户工具继续'),
      expect.objectContaining({ error: 'Postgres 连接超时', userId: 'u1', errorId: 'err-load' })
    );
    warnSpy.mockRestore();
  });

  it('无用户工具时直接复用 baseRegistry 单例（零额外开销）', async () => {
    const { registry: base } = makeBaseRegistry();
    const runtime = await createAgentRuntimeContext({
      userId: 'u1',
      baseRegistry: base,
      loadUserTools: async () => [],
    });

    expect(runtime.registry).toBe(base);
    expect(runtime.finishMetadata()).toEqual({ webhookCalls: 0 });
  });

  it('loadUserTools 返回 undefined 时按空列表处理', async () => {
    const { registry: base } = makeBaseRegistry();
    const runtime = await createAgentRuntimeContext({
      userId: 'u1',
      baseRegistry: base,
      loadUserTools: async () => undefined as unknown as UserWebhookTool[],
    });

    expect(runtime.registry).toBe(base);
  });
});

describe('finishMetadata 完成态观测元数据', () => {
  it('实际派发次数随执行递增，达上限后拦截且不再计入', async () => {
    executeWebhookToolMock.mockResolvedValue({
      ok: true,
      contentForModel: '天气：晴',
      summaryForDisplay: '已查询',
    });
    const { registry: base } = makeBaseRegistry();
    const runtime = await createAgentRuntimeContext({
      userId: 'u1',
      baseRegistry: base,
      loadUserTools: async () => [makeUserTool()],
    });

    expect(runtime.finishMetadata()).toEqual({ webhookCalls: 0 });

    const spec = runtime.registry.get('wh_weather');
    expect(spec).toBeDefined();

    // 连续派发至上限：计数语义为「实际派发次数」（先判后增）
    for (let i = 1; i <= AGENT_MAX_WEBHOOK_CALLS; i++) {
      const result = await spec!.execute({ city: 'Beijing' }, CTX);
      expect(result.ok).toBe(true);
      expect(runtime.finishMetadata().webhookCalls).toBe(i);
    }

    // 第 4 次：上限拦截，不发出站请求、不增计数，返回模型可读的次数已用完文案
    const blocked = await spec!.execute({ city: 'Beijing' }, CTX);
    expect(blocked.ok).toBe(false);
    expect(blocked.contentForModel).toContain('次数已用完');
    expect(executeWebhookToolMock).toHaveBeenCalledTimes(AGENT_MAX_WEBHOOK_CALLS);
    expect(runtime.finishMetadata().webhookCalls).toBe(AGENT_MAX_WEBHOOK_CALLS);
    expect(writeAuditRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'skipped' })
    );
  });
});
