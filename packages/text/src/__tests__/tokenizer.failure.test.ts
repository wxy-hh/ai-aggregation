import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withDict: vi.fn(() => {
    throw new Error('native jieba unavailable');
  }),
}));

vi.mock('@node-rs/jieba', () => ({
  Jieba: { withDict: mocks.withDict },
}));

vi.mock('@node-rs/jieba/dict', () => ({ dict: {} }));

import {
  SegmentationUnavailableError,
  segmentForIndex,
  segmentForQuery,
} from '../tokenizer';

describe('Tokenizer 分词器不可用时的失败策略', () => {
  beforeEach(() => {
    mocks.withDict.mockClear();
  });

  it('TC01-7 分词器不可用时 segmentForIndex 抛出 SegmentationUnavailableError', () => {
    expect(() => segmentForIndex('测试文本')).toThrow(SegmentationUnavailableError);
  });

  it('TC01-8 分词器不可用时 segmentForQuery 返回 null', () => {
    expect(segmentForQuery('测试文本')).toBeNull();
  });

  it('TC01-9 分词器不可用时 segmentForQuery 对空串返回空串且不触发分词器', () => {
    expect(segmentForQuery('')).toBe('');
    expect(mocks.withDict).toHaveBeenCalledTimes(0);
  });

  it('TC01-10 分词器不可用时 segmentForQuery 对英文标识符返回 null 而不是正则分词结果', () => {
    expect(segmentForQuery('ADR-0008')).toBeNull();
  });
});
