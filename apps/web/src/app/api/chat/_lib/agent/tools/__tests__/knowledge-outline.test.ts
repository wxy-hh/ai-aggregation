import { describe, it, expect, vi } from 'vitest';
import { createKnowledgeOutlineTool } from '../knowledge-outline';
import type { ToolExecutionContext } from '@/lib/agent/registry';
import type { DocumentOutline } from '@repo/shared';

describe('knowledge_outline 只读大纲工具单元测试 (TC06 / ADR-0036)', () => {
  const mockContext: ToolExecutionContext = {
    userId: 'user-alice',
    signal: new AbortController().signal,
    errorId: 'err-outline-123',
  };

  const sampleOutline: DocumentOutline = {
    version: 1,
    totalNodes: 4,
    maxDepth: 3,
    tree: [
      {
        id: 'node_1',
        title: '1. 总体设计',
        level: 1,
        headingPath: '1. 总体设计',
        chunkRange: [0, 2],
        tokenCount: 600,
        children: [
          {
            id: 'node_2',
            title: '1.1 技术架构',
            level: 2,
            headingPath: '1. 总体设计 > 1.1 技术架构',
            chunkRange: [0, 1],
            tokenCount: 400,
            children: [
              {
                id: 'node_3',
                title: '1.1.1 存储选型',
                level: 3,
                headingPath: '1. 总体设计 > 1.1 技术架构 > 1.1.1 存储选型',
                chunkRange: [1, 1],
                tokenCount: 200,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'node_4',
        title: '2. 权限模型',
        level: 1,
        headingPath: '2. 权限模型',
        chunkRange: [3, 4],
        tokenCount: 500,
        children: [],
      },
    ],
  };

  it('TC06-1: 参数校验与基础调用退出码为 0', async () => {
    const mockFindDoc = vi.fn().mockResolvedValue({
      id: 'doc-1',
      name: '架构方案.md',
      knowledgeBaseId: 'kb-1',
      metadata: { outline: sampleOutline },
    });

    const tool = createKnowledgeOutlineTool({
      findDocumentFn: mockFindDoc,
    });

    const result = await tool.execute({ documentId: 'doc-1' }, mockContext);
    expect(result.ok).toBe(true);
    expect(result.contentForModel).toContain('1. 总体设计');
    expect(result.contentForModel).toContain('2. 权限模型');
  });

  it('TC06-2: 跨租户越权探测他人文档时被坚决拦截', async () => {
    // 模拟底层查不到属于当前用户 alice 的该文档（即越权访问 bob 的文档）
    const mockFindDoc = vi.fn().mockResolvedValue(null);

    const tool = createKnowledgeOutlineTool({
      findDocumentFn: mockFindDoc,
    });

    await expect(tool.execute({ documentId: 'doc-of-bob' }, mockContext)).rejects.toThrow('指定的文档不存在或无权访问');
    expect(mockFindDoc).toHaveBeenCalledWith('user-alice', 'doc-of-bob');
  });

  it('TC06-3: 传入 maxDepth: 2 参数时，返回的大纲树严格截断至二级，三级子标题被收敛', async () => {
    const mockFindDoc = vi.fn().mockResolvedValue({
      id: 'doc-1',
      name: '架构方案.md',
      knowledgeBaseId: 'kb-1',
      metadata: { outline: sampleOutline },
    });

    const tool = createKnowledgeOutlineTool({
      findDocumentFn: mockFindDoc,
    });

    // 默认 maxDepth 为 2
    const result = await tool.execute({ documentId: 'doc-1', maxDepth: 2 }, mockContext);
    expect(result.ok).toBe(true);
    expect(result.contentForModel).toContain('1. 总体设计');
    expect(result.contentForModel).toContain('1.1 技术架构');
    // 三级标题应该被截断过滤掉
    expect(result.contentForModel).not.toContain('1.1.1 存储选型');

    // 若展开到 maxDepth: 3，则包含三级标题
    const resultDepth3 = await tool.execute({ documentId: 'doc-1', maxDepth: 3 }, mockContext);
    expect(resultDepth3.contentForModel).toContain('1.1.1 存储选型');
  });

  it('TC06-4: 针对存量未生成大纲的旧文档，返回友好降级引导提示，不中断调用链路', async () => {
    // 模拟存量旧文档，metadata 中无 outline 字段
    const mockFindDoc = vi.fn().mockResolvedValue({
      id: 'doc-legacy',
      name: '历史规范.txt',
      knowledgeBaseId: 'kb-1',
      metadata: { tags: ['历史'] },
    });

    const tool = createKnowledgeOutlineTool({
      findDocumentFn: mockFindDoc,
    });

    const result = await tool.execute({ documentId: 'doc-legacy' }, mockContext);
    expect(result.ok).toBe(true);
    expect(result.contentForModel).toContain('暂无多级章节大纲');
    expect(result.contentForModel).toContain('建议直接调用 knowledge_search 工具');
    expect(result.summaryForDisplay).toContain('暂无多级大纲');
  });

  it('无文档参数时支持汇总输出知识库文档大纲列表', async () => {
    const mockFindDocs = vi.fn().mockResolvedValue([
      {
        id: 'doc-1',
        name: '系统设计',
        knowledgeBaseId: 'kb-1',
        metadata: { outline: sampleOutline },
      },
      {
        id: 'doc-2',
        name: '无大纲文档',
        knowledgeBaseId: 'kb-1',
        metadata: {},
      },
    ]);

    const tool = createKnowledgeOutlineTool({
      findDocumentsWithOutlinesFn: mockFindDocs,
    });

    const result = await tool.execute({ knowledgeBaseId: 'kb-1' }, mockContext);
    expect(result.ok).toBe(true);
    expect(result.contentForModel).toContain('【知识库可用文档大纲总览】');
    expect(result.contentForModel).toContain('系统设计');
    expect(result.contentForModel).toContain('无大纲文档');
  });
});
