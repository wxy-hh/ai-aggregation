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
    expect(runtime.finishMetadata()).toEqual({ webhookCalls: 0, mcpCalls: 0 });
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
    expect(runtime.finishMetadata()).toEqual({ webhookCalls: 0, mcpCalls: 0 });
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

  describe('场景能力包白名单收敛 (ADR-0014 / 工单 01)', () => {
    function makeMultiBuiltinRegistry(): { registry: ToolRegistry } {
      const fetchTool: AgentToolSpec = {
        name: 'web_fetch',
        description: '网页抓取',
        parameters: z.object({ url: z.string() }),
        execute: async () => ({ ok: true, contentForModel: '网页正文', summaryForDisplay: '完成' }),
      };
      const imageTool: AgentToolSpec = {
        name: 'image_generate',
        description: '生成图片',
        parameters: z.object({ prompt: z.string() }),
        execute: async () => ({ ok: true, contentForModel: '图片URL', summaryForDisplay: '完成' }),
      };
      return { registry: createToolRegistry([fetchTool, imageTool]) };
    }

    it('deep-research 深度调研包：严格仅保留 web_fetch，绝不出图（image_generate 被剔除）', async () => {
      const { registry: base } = makeMultiBuiltinRegistry();
      const runtime = await createAgentRuntimeContext({
        userId: 'u1',
        baseRegistry: base,
        capabilityPack: 'deep-research',
        loadUserTools: async () => [makeUserTool()],
      });

      // 白名单包含 web_fetch，不包含 image_generate
      expect(runtime.registry.has('web_fetch')).toBe(true);
      expect(runtime.registry.has('image_generate')).toBe(false);
      // 用户自定义 Webhook 作为插槽依然可用
      expect(runtime.registry.has('wh_weather')).toBe(true);
    });

    it('visual-report 图文报告包：保留 image_generate，剔除非白名单内置工具 web_fetch', async () => {
      const { registry: base } = makeMultiBuiltinRegistry();
      const runtime = await createAgentRuntimeContext({
        userId: 'u1',
        baseRegistry: base,
        capabilityPack: 'visual-report',
        loadUserTools: async () => [],
      });

      expect(runtime.registry.has('image_generate')).toBe(true);
      expect(runtime.registry.has('web_fetch')).toBe(false);
    });

    it('未指定能力包或未知包时，保持通用 Agent 行为，保留全部内置工具', async () => {
      const { registry: base } = makeMultiBuiltinRegistry();
      const runtime = await createAgentRuntimeContext({
        userId: 'u1',
        baseRegistry: base,
        capabilityPack: undefined,
        loadUserTools: async () => [],
      });

      expect(runtime.registry.has('web_fetch')).toBe(true);
      expect(runtime.registry.has('image_generate')).toBe(true);
    });
  });

  describe('会话级临时停用工具 (disabledToolKeys · ADR-0014 / 工单 02)', () => {
    function makeMultiBuiltinRegistry(): { registry: ToolRegistry } {
      const fetchTool: AgentToolSpec = {
        name: 'web_fetch',
        description: '网页抓取',
        parameters: z.object({ url: z.string() }),
        execute: async () => ({ ok: true, contentForModel: '网页正文', summaryForDisplay: '完成' }),
      };
      const imageTool: AgentToolSpec = {
        name: 'image_generate',
        description: '生成图片',
        parameters: z.object({ prompt: z.string() }),
        execute: async () => ({ ok: true, contentForModel: '图片URL', summaryForDisplay: '完成' }),
      };
      return { registry: createToolRegistry([fetchTool, imageTool]) };
    }

    it('disabledToolKeys 剔除指定内置工具', async () => {
      const { registry: base } = makeMultiBuiltinRegistry();
      const runtime = await createAgentRuntimeContext({
        userId: 'u1',
        baseRegistry: base,
        disabledToolKeys: ['image_generate'],
        loadUserTools: async () => [],
      });

      expect(runtime.registry.has('image_generate')).toBe(false);
      expect(runtime.registry.has('web_fetch')).toBe(true);
    });

    it('disabledToolKeys 支持按 callName、wh_ 前缀或 id 剔除用户 Webhook 工具', async () => {
      const { registry: base } = makeMultiBuiltinRegistry();
      const runtime = await createAgentRuntimeContext({
        userId: 'u1',
        baseRegistry: base,
        disabledToolKeys: ['weather'], // 按 callName 禁用
        loadUserTools: async () => [
          makeUserTool({ id: 'tool-weather', callName: 'weather' }),
          makeUserTool({ id: 'tool-stock', callName: 'stock' }),
        ],
      });

      expect(runtime.registry.has('wh_weather')).toBe(false);
      expect(runtime.registry.has('wh_stock')).toBe(true);
      expect(runtime.registry.has('web_fetch')).toBe(true);
    });

    it('能力包白名单与 disabledToolKeys 双重叠加过滤', async () => {
      const { registry: base } = makeMultiBuiltinRegistry();
      const runtime = await createAgentRuntimeContext({
        userId: 'u1',
        baseRegistry: base,
        capabilityPack: 'deep-research', // 白名单包含 web_fetch
        disabledToolKeys: ['web_fetch'], // 临时禁用 web_fetch
        loadUserTools: async () => [makeUserTool({ callName: 'weather' })],
      });

      // web_fetch 虽然在能力包白名单，但被 disabledToolKeys 临时剔除
      expect(runtime.registry.has('web_fetch')).toBe(false);
      expect(runtime.registry.has('image_generate')).toBe(false);
      // 未被禁用的 webhook 依旧保留
      expect(runtime.registry.has('wh_weather')).toBe(true);
    });

    it('全部内置与 Webhook 工具被禁用时，注册表清空', async () => {
      const { registry: base } = makeMultiBuiltinRegistry();
      const runtime = await createAgentRuntimeContext({
        userId: 'u1',
        baseRegistry: base,
        disabledToolKeys: ['web_fetch', 'image_generate', 'weather'],
        loadUserTools: async () => [makeUserTool({ callName: 'weather' })],
      });

      expect(runtime.registry.list()).toHaveLength(0);
    });
  });

  describe('知识库动态过滤 (工单 08 / QA-010)', () => {
    function makeRagRegistry(): { registry: ToolRegistry } {
      const searchTool: AgentToolSpec = {
        name: 'knowledge_search',
        description: '知识库检索',
        parameters: z.object({ query: z.string() }),
        execute: async () => ({ ok: true, contentForModel: '切片', summaryForDisplay: '完成' }),
      };
      const fetchTool: AgentToolSpec = {
        name: 'web_fetch',
        description: '抓取',
        parameters: z.object({ url: z.string() }),
        execute: async () => ({ ok: true, contentForModel: '内容', summaryForDisplay: '完成' }),
      };
      return { registry: createToolRegistry([searchTool, fetchTool]) };
    }

    it('无知识库用户自动剔除 knowledge_search 工具 (QA-010)', async () => {
      const { registry: base } = makeRagRegistry();
      const runtime = await createAgentRuntimeContext({
        userId: 'user-no-kb',
        baseRegistry: base,
        hasKnowledgeBases: async () => false, // 模拟无知识库
        loadUserTools: async () => [],
      });

      expect(runtime.registry.has('knowledge_search')).toBe(false);
      expect(runtime.registry.has('web_fetch')).toBe(true);
    });

    it('有知识库用户正常挂载 knowledge_search 工具', async () => {
      const { registry: base } = makeRagRegistry();
      const runtime = await createAgentRuntimeContext({
        userId: 'user-with-kb',
        baseRegistry: base,
        hasKnowledgeBases: async () => true, // 模拟有知识库
        loadUserTools: async () => [],
      });

      expect(runtime.registry.has('knowledge_search')).toBe(true);
      expect(runtime.registry.has('web_fetch')).toBe(true);
    });
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

    expect(runtime.finishMetadata()).toEqual({ webhookCalls: 0, mcpCalls: 0 });

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

describe('MCP 工具装配、策略边界与 dispose 生命周期（工单 04）', () => {
  function makeMcpBundle(overrides?: {
    isActive?: boolean;
    allowAutoExecute?: boolean;
    enabled?: boolean;
    fingerprintMismatch?: boolean;
    readOnlyHint?: boolean;
  }) {
    const fingerprint = 'fp-valid-1';
    return {
      server: {
        id: 'srv_1',
        name: '代码仓库',
        url: 'https://mcp.example.com/mcp',
        isActive: overrides?.isActive ?? true,
        snapshotVersion: 1,
        configFingerprint: fingerprint,
        authHeaderName: null,
        authHeaderValueEnc: null,
      },
      snapshot: {
        serverId: 'srv_1',
        version: 1,
        configFingerprint: overrides?.fingerprintMismatch ? 'fp-stale' : fingerprint,
        tools: [
          {
            toolName: 'read_value',
            description: '读取受控值',
            inputSchema: {
              type: 'object',
              properties: { key: { type: 'string' } },
              required: ['key'],
            },
            annotations: overrides?.readOnlyHint ? { readOnlyHint: true } : null,
            modelToolName: 'mcp_srv_1_read_value',
          },
          {
            toolName: 'unlisted_tool',
            description: '未加入白名单的工具',
            inputSchema: { type: 'object', properties: {} },
            annotations: null,
            modelToolName: 'mcp_srv_1_unlisted_tool',
          },
        ],
      },
      policies: [
        {
          serverId: 'srv_1',
          toolName: 'read_value',
          enabled: overrides?.enabled ?? true,
          allowAutoExecute: overrides?.allowAutoExecute ?? true,
        },
        {
          serverId: 'srv_1',
          toolName: 'unlisted_tool',
          enabled: false,
          allowAutoExecute: false,
        },
      ],
    };
  }

  it('只挂载已加入白名单且快照指纹一致的 MCP 工具，未白名单工具绝不进入注册表', async () => {
    const { registry: base } = makeBaseRegistry();
    const runtime = await createAgentRuntimeContext({
      userId: 'u1',
      baseRegistry: base,
      loadUserTools: async () => [],
      loadMcpServers: async () => [makeMcpBundle()],
    });

    expect(runtime.registry.has('mcp_srv_1_read_value')).toBe(true);
    expect(runtime.registry.has('mcp_srv_1_unlisted_tool')).toBe(false);
    expect(runtime.registry.get('mcp_srv_1_read_value')?.serverName).toBe('代码仓库');
  });

  it('readOnlyHint=true 但策略为必须审批时仍挂载 approval；改回必须审批立即生效', async () => {
    const { registry: base } = makeBaseRegistry();
    const runtimeApproval = await createAgentRuntimeContext({
      userId: 'u1',
      baseRegistry: base,
      loadUserTools: async () => [],
      loadMcpServers: async () => [makeMcpBundle({ allowAutoExecute: false, readOnlyHint: true })],
    });
    const specWithApproval = runtimeApproval.registry.get('mcp_srv_1_read_value');
    expect(specWithApproval?.approval).toBeDefined();

    const runtimeAuto = await createAgentRuntimeContext({
      userId: 'u1',
      baseRegistry: base,
      loadUserTools: async () => [],
      loadMcpServers: async () => [makeMcpBundle({ allowAutoExecute: true })],
    });
    const specAuto = runtimeAuto.registry.get('mcp_srv_1_read_value');
    expect(specAuto?.approval).toBeUndefined();
  });

  it('CapabilityPack 不额外过滤 MCP 工具，disabledToolKeys 可按会话收窄', async () => {
    const { registry: base } = makeBaseRegistry();
    const runtimeWithPack = await createAgentRuntimeContext({
      userId: 'u1',
      baseRegistry: base,
      capabilityPack: 'deep-research',
      loadUserTools: async () => [],
      loadMcpServers: async () => [makeMcpBundle()],
    });
    expect(runtimeWithPack.registry.has('mcp_srv_1_read_value')).toBe(true);

    const runtimeDisabled = await createAgentRuntimeContext({
      userId: 'u1',
      baseRegistry: base,
      capabilityPack: 'deep-research',
      disabledToolKeys: ['mcp_srv_1_read_value'],
      loadUserTools: async () => [],
      loadMcpServers: async () => [makeMcpBundle()],
    });
    expect(runtimeDisabled.registry.has('mcp_srv_1_read_value')).toBe(false);
  });

  it('执行 MCP 工具后递增 finishMetadata().mcpCalls，且审计写库失败不阻断调用', async () => {
    const { registry: base } = makeBaseRegistry();
    const closeMock = vi.fn(async () => {});
    const callToolMock = vi.fn(async () => ({
      ok: true as const,
      content: { content: [{ type: 'text', text: '值:ok' }] },
      statusCode: 200,
      responseBytes: 32,
    }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const runtime = await createAgentRuntimeContext({
        userId: 'u1',
        baseRegistry: base,
        loadUserTools: async () => [],
        loadMcpServers: async () => [makeMcpBundle()],
        createMcpClient: () => ({ callTool: callToolMock, close: closeMock }),
        mcpCallAudit: async () => {
          throw new Error('audit db down');
        },
      });

      const spec = runtime.registry.get('mcp_srv_1_read_value');
      const outcome = await spec!.execute({ key: 'k1' }, CTX);

      expect(outcome.ok).toBe(true);
      expect(outcome.contentForModel).toContain('值:ok');
      expect(runtime.finishMetadata().mcpCalls).toBe(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('审计'),
        expect.anything()
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('dispose 幂等关闭（连续调用 3 次只 close 1 次），close 抛错不抛出', async () => {
    const { registry: base } = makeBaseRegistry();
    const closeMock = vi.fn(async () => {
      throw new Error('close failed');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const runtime = await createAgentRuntimeContext({
        userId: 'u1',
        baseRegistry: base,
        loadUserTools: async () => [],
        loadMcpServers: async () => [makeMcpBundle()],
        createMcpClient: () => ({
          callTool: vi.fn(),
          close: closeMock,
        }),
      });

      await runtime.dispose?.();
      await runtime.dispose?.();
      await runtime.dispose?.();

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
