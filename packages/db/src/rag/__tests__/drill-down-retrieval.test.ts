import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../client';
import {
  searchDocumentChunksDense,
  getSequentialChapterChunks,
} from '../chunk-store';

vi.mock('../../client', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

describe('数据层定向下钻检索与顺序通读 SQL 逻辑测试 (P-M2 / ADR-0036)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('稠密向量检索：正确注入 headingPath 转义参数并构建前缀匹配子句', async () => {
    const mockQueryRaw = vi.fn().mockResolvedValue([]);
    (prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>) = mockQueryRaw;

    await searchDocumentChunksDense({
      userId: 'user-alice',
      knowledgeBaseId: 'kb-test',
      queryVector: new Array(1024).fill(0.1),
      headingPath: '3. 系统架构 > 3.2 权限控制',
      documentId: 'doc-arch-001',
      topK: 5,
    });

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const [sql, ...params] = mockQueryRaw.mock.calls[0];

    // 断言 SQL 包含双向匹配：精确路径匹配与下级前缀子树匹配
    expect(sql).toContain('dc."heading_path" = $');
    expect(sql).toContain("LIKE $5 || ' > %'");
    expect(sql).toContain('dc."document_id" = $6');

    // 验证参数中包含了原始 headingPath 与转义后的 headingPath
    expect(params[3]).toBe('3. 系统架构 > 3.2 权限控制');
    expect(params[4]).toBe('3. 系统架构 > 3.2 权限控制');
    expect(params[5]).toBe('doc-arch-001');
  });

  it('LIKE 通配符防注入转义：自动转义 % 与 _ 特殊字符 (S-H2 / security.md)', async () => {
    const mockQueryRaw = vi.fn().mockResolvedValue([]);
    (prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>) = mockQueryRaw;

    await searchDocumentChunksDense({
      userId: 'user-alice',
      knowledgeBaseId: 'kb-test',
      queryVector: new Array(1024).fill(0.1),
      headingPath: '第50%节_特殊章节',
      topK: 5,
    });

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const [, ...params] = mockQueryRaw.mock.calls[0];
    // 验证第二个参数为转义后的字符串
    expect(params[4]).toBe('第50\\%节\\_特殊章节');
  });

  it('章节连续通读提取：按 document_id ASC 与 chunk_index ASC 双重有序排序 (P-W2)', async () => {
    const mockQueryRaw = vi.fn().mockResolvedValue([
      {
        id: 'c-1',
        document_id: 'doc-1',
        document_name: '架构.md',
        knowledge_base_id: 'kb-1',
        user_id: 'user-alice',
        document_version: 1,
        chunk_index: 0,
        content: '第一款内容',
        content_segmented: '第一款 内容',
        heading_path: '1. 导言',
        page_number: 1,
        token_count: 50,
        metadata: {},
        created_at: new Date(),
      },
    ]);
    (prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>) = mockQueryRaw;

    const result = await getSequentialChapterChunks({
      userId: 'user-alice',
      knowledgeBaseId: 'kb-1',
      headingPath: '1. 导言',
      limit: 50,
    });

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const [sql] = mockQueryRaw.mock.calls[0];

    // 断言包含双重稳定排序
    expect(sql).toContain('ORDER BY dc."document_id" ASC, dc."chunk_index" ASC');
    expect(result.length).toBe(1);
    expect(result[0].chunkIndex).toBe(0);
  });
});
