import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildArtifactStorageKey,
  buildChunkInheritedMetadata,
  estimateTokenCount,
} from '@repo/shared';

const mocks = vi.hoisted(() => ({
  txDocumentCreate: vi.fn(),
  insertWithInheritance: vi.fn(),
  storageUpload: vi.fn(),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) => {
      return cb({
        document: { create: mocks.txDocumentCreate },
      });
    }),
  },
  insertDocumentChunksWithInheritance: mocks.insertWithInheritance,
}));

vi.mock('@repo/storage', () => ({
  createStorageProvider: () => ({ upload: mocks.storageUpload }),
}));

import { segmentForIndex } from '@repo/text';
import { depositArtifactToKnowledgeBase, splitArtifactMarkdown } from './artifact-deposit-service';

describe('depositArtifactToKnowledgeBase 直接测试 (C1 / TC07)', () => {
  const baseParams = {
    userId: 'user_1',
    knowledgeBaseId: 'kb_1',
    input: {
      artifactId: 'art_1',
      title: '竞品分析报告',
      content: '# 核心结论\n报销政策与差旅标准规定细则。',
      type: 'markdown' as const,
      tags: ['竞品', '调研'],
      sourceSessionId: 'sess_1',
    },
    embedTextsFn: async (values: string[]) =>
      values.map(() => new Array(1024).fill(0.1)),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txDocumentCreate.mockResolvedValue({ id: 'doc_art_1' });
    mocks.insertWithInheritance.mockResolvedValue(1);
    mocks.storageUpload.mockResolvedValue(undefined);
  });

  it('TC07-1 断言1: 切片经继承事实构造后 B 层字段完整且 parsedContentKey 派生正确', async () => {
    await depositArtifactToKnowledgeBase(baseParams);

    expect(mocks.insertWithInheritance).toHaveBeenCalledTimes(1);
    const [chunks, inheritance] = mocks.insertWithInheritance.mock.calls[0];

    // 调用者不再自行拼切片 metadata（C1 新契约）
    for (const chunk of chunks) {
      expect(chunk.metadata).toBeUndefined();
    }

    expect(inheritance.sourceType).toBe('chat_artifact');
    expect(inheritance.name).toBe('竞品分析报告');
    expect(inheritance.storageKey).toMatch(new RegExp(`^docs/user_1/artifact-.+/v1/content\\.md$`));
    expect(inheritance.tags).toEqual(['竞品', '调研']);

    const composed = buildChunkInheritedMetadata(inheritance);
    expect(composed.sourceType).toBe('chat_artifact');
    expect(composed.fileName).toBe('竞品分析报告');
    expect(composed.parsedContentKey).toBe(inheritance.storageKey);
    expect(String(composed.parsedContentKey).endsWith('/content.md')).toBe(true);
  });

  it('TC07-2 断言2: 切片 metadata 不再包含 chunkIndex 键', async () => {
    await depositArtifactToKnowledgeBase(baseParams);

    const [chunks] = mocks.insertWithInheritance.mock.calls[0];
    for (const chunk of chunks) {
      expect(chunk).not.toHaveProperty('metadata');
      expect(chunk.chunkIndex).toBeTypeOf('number');
    }

    const [, inheritance] = mocks.insertWithInheritance.mock.calls[0];
    const composed = buildChunkInheritedMetadata(inheritance);
    expect(composed).not.toHaveProperty('chunkIndex');
  });

  it('TC07-3 断言3: 中文内容切片 tokenCount 等于共享 estimateTokenCount（不再是 len/3）', async () => {
    await depositArtifactToKnowledgeBase(baseParams);

    const [chunks] = mocks.insertWithInheritance.mock.calls[0];
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBe(estimateTokenCount(chunk.content));
      // 对照旧公式：ceil(len/3) 对纯中文内容系统性偏小
      expect(chunk.tokenCount).toBeGreaterThan(Math.ceil(chunk.content.length / 3));
    }
  });

  it('TC07-4 断言4: 切片继承 C 层溯源键（双向溯源在标签编辑后可用）', async () => {
    await depositArtifactToKnowledgeBase(baseParams);

    const [, inheritance] = mocks.insertWithInheritance.mock.calls[0];
    const composed = buildChunkInheritedMetadata(inheritance);
    expect(composed.sourceSessionId).toBe('sess_1');
    expect(composed.sourceArtifactId).toBe('art_1');
    expect(composed).toHaveProperty('depositedAt');
    expect(composed.artifactType).toBe('markdown');
  });

  it('TC04-3 Artifact 上传与持久化共用共享 key 构造', async () => {
    // 固定调用方产生的时间与随机事实，让期望值来自共享构造器而非字符串模板
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1760000000000);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    try {
      await depositArtifactToKnowledgeBase(baseParams);

      const expectedKey = buildArtifactStorageKey({
        userId: 'user_1',
        timestamp: 1760000000000,
        randomToken: '4fzzzxjy',
      });

      // 对象存储上传、主表持久化与切片继承事实使用同一 key，且与共享构造器完全一致
      expect(mocks.storageUpload).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Buffer),
        'text/markdown'
      );
      expect(mocks.txDocumentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storageKey: expectedKey }),
        })
      );
      const [, inheritance] = mocks.insertWithInheritance.mock.calls[0];
      expect(inheritance.storageKey).toBe(expectedKey);
    } finally {
      nowSpy.mockRestore();
      randomSpy.mockRestore();
    }
  });
});


describe('TC04 产物入库批量化与失败回滚', () => {
  const manySections = Array.from({ length: 70 }, (_, index) => `## 小节${index}\n内容${index}`).join('\n\n');
  const baseInput = {
    artifactId: 'art_many',
    title: '多章节产物',
    content: manySections,
    type: 'markdown' as const,
    tags: [],
    sourceSessionId: 'sess_many',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txDocumentCreate.mockResolvedValue({ id: 'doc_many' });
    mocks.insertWithInheritance.mockResolvedValue(70);
    mocks.storageUpload.mockResolvedValue(undefined);
  });

  it('TC04-1 70 个切片沉淀时批量向量化入口调用 1 次且入参长度 70', async () => {
    expect(splitArtifactMarkdown(manySections)).toHaveLength(70);
    const embedTextsFn = vi.fn(async (values: string[]) =>
      values.map(() => new Array(1024).fill(0.1))
    );

    await depositArtifactToKnowledgeBase({
      userId: 'user_1',
      knowledgeBaseId: 'kb_1',
      input: baseInput,
      embedTextsFn,
    });

    expect(embedTextsFn).toHaveBeenCalledTimes(1);
    expect(embedTextsFn.mock.calls[0]?.[0]).toHaveLength(70);
  });

  it('TC04-2 同一沉淀过程中单条向量化入口调用 0 次', async () => {
    const embedTextsFn = vi.fn(async (values: string[]) =>
      values.map(() => new Array(1024).fill(0.1))
    );
    const embedTextFn = vi.fn();

    await depositArtifactToKnowledgeBase({
      userId: 'user_1',
      knowledgeBaseId: 'kb_1',
      input: baseInput,
      embedTextsFn,
      // @ts-expect-error 单条入口不属于本服务依赖，仅用于断言未被调用
      embedTextFn,
    });

    expect(embedTextFn).toHaveBeenCalledTimes(0);
  });

  it('TC04-3 沉淀成功后 contentSegmented 等于 segmentForIndex(content)', async () => {
    const embedTextsFn = async (values: string[]) =>
      values.map(() => new Array(1024).fill(0.1));

    await depositArtifactToKnowledgeBase({
      userId: 'user_1',
      knowledgeBaseId: 'kb_1',
      input: baseInput,
      embedTextsFn,
    });

    const [chunks] = mocks.insertWithInheritance.mock.calls[0];
    for (const chunk of chunks) {
      expect(chunk.contentSegmented).toBe(segmentForIndex(chunk.content));
    }
  });

  it('TC04-4 沉淀成功后切片 embedding 与批量向量化替身返回一致', async () => {
    const vector = new Array(1024).fill(0.321);
    const embedTextsFn = async (values: string[]) => values.map(() => vector);

    await depositArtifactToKnowledgeBase({
      userId: 'user_1',
      knowledgeBaseId: 'kb_1',
      input: baseInput,
      embedTextsFn,
    });

    const [chunks] = mocks.insertWithInheritance.mock.calls[0];
    for (const chunk of chunks) {
      expect(chunk.embedding).toEqual(vector);
    }
  });

  it('TC04-5 分词器不可用时沉淀拒绝且文档创建调用 0 次', async () => {
    const embedTextsFn = async (values: string[]) =>
      values.map(() => new Array(1024).fill(0.1));

    await expect(
      depositArtifactToKnowledgeBase({
        userId: 'user_1',
        knowledgeBaseId: 'kb_1',
        input: baseInput,
        embedTextsFn,
        segmentFn: () => {
          throw new Error('segmentation unavailable');
        },
      })
    ).rejects.toThrow('segmentation unavailable');

    expect(mocks.txDocumentCreate).toHaveBeenCalledTimes(0);
  });

  it('TC04-6 向量化不可用时沉淀拒绝且文档创建调用 0 次', async () => {
    const embedTextsFn = async () => {
      throw new Error('embedding unavailable');
    };

    await expect(
      depositArtifactToKnowledgeBase({
        userId: 'user_1',
        knowledgeBaseId: 'kb_1',
        input: baseInput,
        embedTextsFn,
      })
    ).rejects.toThrow('embedding unavailable');

    expect(mocks.txDocumentCreate).toHaveBeenCalledTimes(0);
  });

  it('TC04-7 上述两种失败下切片批量写入调用均为 0 次', async () => {
    const embedTextsFn = async () => {
      throw new Error('embedding unavailable');
    };

    await expect(
      depositArtifactToKnowledgeBase({
        userId: 'user_1',
        knowledgeBaseId: 'kb_1',
        input: baseInput,
        embedTextsFn,
      })
    ).rejects.toThrow('embedding unavailable');

    expect(mocks.insertWithInheritance).toHaveBeenCalledTimes(0);
  });
});
