import { describe, expect, it, vi } from 'vitest';
import { logger } from '@repo/logger';
import { createMemorySearchTool } from './memory-search';
import { createAgentRuntimeContext } from '../runtime-context';
import { createToolRegistry } from '@/lib/agent/registry';

describe('memory_search 工具与跨用户隔离单测 (工单 09 / QA-005 / QA-006 / QA-010)', () => {
  const dummyVector = new Array(1024).fill(0.1);

  it('正常检索：稠密与词法两路召回并经 RRF 融合，以不可信内容格式包裹', async () => {
    const mockDenseSearch = vi.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        userId: 'user-a',
        sessionId: 'sess-1',
        messageId: 'msg-1',
        chunkIndex: 0,
        content: '记住暗号：蓝色大象 42',
        contentSegmented: '记住 暗号 蓝色 大象 42',
        tokenCount: 10,
        metadata: {},
        createdAt: new Date('2026-10-23T10:00:00Z'),
        similarity: 0.92,
      },
    ]);

    const mockLexicalSearch = vi.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        userId: 'user-a',
        sessionId: 'sess-1',
        messageId: 'msg-1',
        chunkIndex: 0,
        content: '记住暗号：蓝色大象 42',
        contentSegmented: '记住 暗号 蓝色 大象 42',
        tokenCount: 10,
        metadata: {},
        createdAt: new Date('2026-10-23T10:00:00Z'),
        rank: 0.85,
      },
    ]);

    const mockEmbedQuery = vi.fn().mockResolvedValue(dummyVector);

    const tool = createMemorySearchTool({
      embedQueryFn: mockEmbedQuery,
      searchDenseFn: mockDenseSearch,
      searchLexicalFn: mockLexicalSearch,
    });

    const result = await tool.execute(
      { query: '暗号是什么' },
      {
        userId: 'user-a',
        signal: new AbortController().signal,
        errorId: 'err-test',
      }
    );

    expect(result.ok).toBe(true);
    expect(result.contentForModel).toContain('<不可信检索内容 来源="会话记忆">');
    expect(result.contentForModel).toContain('蓝色大象 42');
    expect(result.summaryForDisplay).toContain('检索到 1 条历史会话记忆');
    expect(mockDenseSearch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' })
    );
    expect(mockLexicalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' })
    );
  });

  it('跨用户注入隔离：伪造他 userId 检索严格零命中 (QA-010 / 安全红线)', async () => {
    // 模拟数据层严格执行 SQL WHERE user_id = $userId：当传入 user-b 时返回空
    const mockDenseSearch = vi.fn().mockImplementation(async ({ userId }) => {
      if (userId === 'user-a') {
        return [
          {
            id: 'chunk-secret-a',
            userId: 'user-a',
            sessionId: 'sess-a',
            content: '机密暗号：蓝色大象 42',
            similarity: 0.95,
          },
        ];
      }
      return [];
    });

    const mockLexicalSearch = vi.fn().mockImplementation(async ({ userId }) => {
      if (userId === 'user-a') {
        return [
          {
            id: 'chunk-secret-a',
            userId: 'user-a',
            sessionId: 'sess-a',
            content: '机密暗号：蓝色大象 42',
            rank: 0.9,
          },
        ];
      }
      return [];
    });

    const tool = createMemorySearchTool({
      embedQueryFn: async () => dummyVector,
      searchDenseFn: mockDenseSearch,
      searchLexicalFn: mockLexicalSearch,
    });

    // 攻击场景：User B 试图查询包含 User A 暗号的记忆
    const result = await tool.execute(
      { query: '蓝色大象' },
      {
        userId: 'user-b', // 上下文严格注入 user-b
        signal: new AbortController().signal,
        errorId: 'err-leak-test',
      }
    );

    expect(result.ok).toBe(true);
    expect(result.contentForModel).toContain('未检索到相关的历史会话记忆');
    expect(result.contentForModel).not.toContain('蓝色大象 42');
    expect(mockDenseSearch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-b' })
    );
  });

  it('装配层动态过滤：用户 memorySearchEnabled === false 时自动剔除 memory_search', async () => {
    const memoryTool = createMemorySearchTool();
    const mockBaseRegistry = createToolRegistry([
      {
        name: 'web_search',
        description: '联网搜索',
        parameters: {} as any,
        execute: vi.fn(),
      },
      memoryTool,
    ]);

    // 用户关闭记忆开关
    const runtimeDisabled = await createAgentRuntimeContext({
      userId: 'user-opted-out',
      memorySearchEnabled: false,
      baseRegistry: mockBaseRegistry,
      loadUserTools: async () => [],
    });

    expect(runtimeDisabled.registry.has('memory_search')).toBe(false);
    expect(runtimeDisabled.registry.has('web_search')).toBe(true);
    expect(runtimeDisabled.registry.get('memory_search')).toBeUndefined();

    // 用户开启记忆开关
    const runtimeEnabled = await createAgentRuntimeContext({
      userId: 'user-opted-in',
      memorySearchEnabled: true,
      baseRegistry: mockBaseRegistry,
      loadUserTools: async () => [],
    });

    expect(runtimeEnabled.registry.has('memory_search')).toBe(true);
    expect(runtimeEnabled.registry.get('memory_search')?.name).toBe('memory_search');
  });
});


describe('TC05 记忆检索词法降级', () => {
  const dummyVector = new Array(1024).fill(0.1);
  const ctx = {
    userId: 'user-a',
    signal: new AbortController().signal,
    errorId: 'err-test',
  };
  const denseMatch = {
    id: 'chunk-1',
    userId: 'user-a',
    sessionId: 'sess-1',
    messageId: 'msg-1',
    chunkIndex: 0,
    content: '记住暗号：蓝色大象 42',
    contentSegmented: '记住 暗号 蓝色 大象 42',
    tokenCount: 10,
    metadata: {},
    createdAt: new Date('2026-10-23T10:00:00Z'),
    similarity: 0.92,
  };

  it('TC05-4 正常检索时词法检索入口收到的 query 等于 segmentForQuery 输出', async () => {
    const searchLexicalFn = vi.fn().mockResolvedValue([]);
    const segmentQueryFn = vi.fn(() => '暗号 是什么');

    const tool = createMemorySearchTool({
      embedQueryFn: async () => dummyVector,
      segmentQueryFn,
      searchDenseFn: async () => [],
      searchLexicalFn,
    });

    await tool.execute({ query: '暗号是什么' }, ctx);

    expect(segmentQueryFn).toHaveBeenCalledWith('暗号是什么');
    expect(searchLexicalFn).toHaveBeenCalledWith(
      expect.objectContaining({ query: '暗号 是什么' })
    );
  });

  it('TC05-5 分词器不可用时词法检索入口调用 0 次', async () => {
    const searchLexicalFn = vi.fn();

    const tool = createMemorySearchTool({
      embedQueryFn: async () => dummyVector,
      segmentQueryFn: () => null,
      searchDenseFn: async () => [denseMatch],
      searchLexicalFn,
    });

    await tool.execute({ query: '暗号是什么' }, ctx);

    expect(searchLexicalFn).toHaveBeenCalledTimes(0);
  });

  it('TC05-6 分词器不可用时稠密检索入口调用 1 次且工具返回 ok=true', async () => {
    const searchDenseFn = vi.fn().mockResolvedValue([denseMatch]);

    const tool = createMemorySearchTool({
      embedQueryFn: async () => dummyVector,
      segmentQueryFn: () => null,
      searchDenseFn,
      searchLexicalFn: vi.fn(),
    });

    const result = await tool.execute({ query: '暗号是什么' }, ctx);

    expect(searchDenseFn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it('TC05-7 分词器不可用时 contentForModel 包含稠密检索结果内容', async () => {
    const tool = createMemorySearchTool({
      embedQueryFn: async () => dummyVector,
      segmentQueryFn: () => null,
      searchDenseFn: async () => [denseMatch],
      searchLexicalFn: vi.fn(),
    });

    const result = await tool.execute({ query: '暗号是什么' }, ctx);

    expect(result.contentForModel).toContain('蓝色大象 42');
  });

  it('TC05-8 降级告警包含 userId 与 errorId 且不包含查询原文', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const uniqueQuery = 'UNIQUE_C9_MEMORY_QUERY_888';

    try {
      const tool = createMemorySearchTool({
        embedQueryFn: async () => dummyVector,
        segmentQueryFn: () => null,
        searchDenseFn: async () => [],
        searchLexicalFn: vi.fn(),
      });

      await tool.execute({ query: uniqueQuery }, ctx);

      const degradedCall = warnSpy.mock.calls.find(([message]) =>
        String(message).includes('分词不可用')
      );
      expect(degradedCall?.[1]).toEqual(
        expect.objectContaining({
          feature: 'memory-lexical-degraded',
          userId: 'user-a',
          errorId: 'err-test',
        })
      );
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(uniqueQuery);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
