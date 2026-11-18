import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  embedMany: vi.fn(),
  embed: vi.fn(),
  info: vi.fn(),
  createEmbeddingModel: vi.fn(() => ({ modelId: 'fake-model' })),
}));

vi.mock('ai', () => ({
  embedMany: mocks.embedMany,
  embed: mocks.embed,
}));

vi.mock('@repo/providers', () => ({
  createEmbeddingModel: mocks.createEmbeddingModel,
}));

vi.mock('@repo/logger', () => ({
  logger: {
    info: mocks.info,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { embedText, embedTexts } from '../embedding';

const texts = Array.from({ length: 130 }, (_, index) => `t${index}`);

function defaultBatch(values: string[]): { embeddings: number[][] } {
  return {
    embeddings: values.map((value) => [Number(value.replace('t', ''))]),
  };
}

describe('EmbeddingBatch 公开入口', () => {
  beforeEach(() => {
    mocks.embedMany.mockReset();
    mocks.embed.mockReset();
    mocks.info.mockReset();
    mocks.createEmbeddingModel.mockReset();
    mocks.createEmbeddingModel.mockReturnValue({ modelId: 'fake-model' });
    mocks.embedMany.mockImplementation(async ({ values }: { values: string[] }) =>
      defaultBatch(values)
    );
    mocks.embed.mockResolvedValue({ embedding: [42] });
  });

  it('TC03-1 130 条输入时批量向量化调用 3 次', async () => {
    await embedTexts(texts, { feature: 'test-feature' });
    expect(mocks.embedMany).toHaveBeenCalledTimes(3);
  });

  it('TC03-2 三次调用的批大小依次为 64、64、2', async () => {
    await embedTexts(texts, { feature: 'test-feature' });
    const sizes = mocks.embedMany.mock.calls.map(
      (call) => (call[0] as { values: string[] }).values.length
    );
    expect(sizes).toEqual([64, 64, 2]);
  });

  it('TC03-3 返回数组长度为 130', async () => {
    const result = await embedTexts(texts, { feature: 'test-feature' });
    expect(result).toHaveLength(130);
  });

  it('TC03-4 返回数组按输入顺序保持（第 1、65、130 项对应）', async () => {
    const result = await embedTexts(texts, { feature: 'test-feature' });
    expect(result[0]?.[0]).toBe(0);
    expect(result[64]?.[0]).toBe(64);
    expect(result[129]?.[0]).toBe(129);
  });

  it('TC03-5 第一次调用收到的 values 等于输入前 64 条原文', async () => {
    await embedTexts(texts, { feature: 'test-feature' });
    const first = mocks.embedMany.mock.calls[0]?.[0] as { values: string[] };
    expect(first.values).toEqual(texts.slice(0, 64));
  });

  it('TC03-6 空数组输入返回空数组且批量向量化调用 0 次', async () => {
    const result = await embedTexts([], { feature: 'test-feature' });
    expect(result).toEqual([]);
    expect(mocks.embedMany).toHaveBeenCalledTimes(0);
  });

  it('TC03-7 单条 embedText 调用单条向量化 1 次并返回其向量', async () => {
    const result = await embedText('查询');
    expect(mocks.embed).toHaveBeenCalledTimes(1);
    expect(result).toEqual([42]);
  });

  it('TC03-8 第 2 批抛错时 embedTexts 拒绝并原样传播错误', async () => {
    mocks.embedMany
      .mockResolvedValueOnce({ embeddings: Array.from({ length: 64 }, () => [0]) })
      .mockRejectedValueOnce(new Error('batch-2-failed'));

    await expect(
      embedTexts(Array.from({ length: 65 }, (_, index) => `t${index}`), {
        feature: 'test-feature',
      })
    ).rejects.toThrow('batch-2-failed');
  });

  it('TC03-9 每次批量调用产生 1 条 info 日志，共 3 条', async () => {
    await embedTexts(texts, { feature: 'test-feature' });
    expect(mocks.info).toHaveBeenCalledTimes(3);
  });

  it('TC03-10 日志负载包含 feature、批次序号、总批数与批大小', async () => {
    await embedTexts(texts, { feature: 'test-feature' });
    const payloads = mocks.info.mock.calls.map(
      (call) => call[1] as Record<string, unknown>
    );
    expect(payloads.map((payload) => payload.feature)).toEqual([
      'test-feature',
      'test-feature',
      'test-feature',
    ]);
    expect(payloads.map((payload) => payload.batchIndex)).toEqual([1, 2, 3]);
    expect(payloads.map((payload) => payload.totalBatches)).toEqual([3, 3, 3]);
    expect(payloads.map((payload) => payload.batchSize)).toEqual([64, 64, 2]);
  });

  it('TC03-11 日志负载序列化后不包含输入文本', async () => {
    const unique = 'UNIQUE_C9_LOG_TOKEN_9001';
    await embedTexts([unique], { feature: 'test-feature' });
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain(unique);
  });
});
