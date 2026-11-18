import { describe, expect, it } from 'vitest';
import golden from './fixtures/segment-golden.json';
import { segmentForIndex, segmentForQuery } from '../tokenizer';

describe('Tokenizer 正常路径契约', () => {
  it('TC01-1 固定语料经 segmentForIndex 输出与当前 HEAD 黄金样本逐字节一致', () => {
    for (const row of golden) {
      expect(segmentForIndex(row.input)).toBe(row.index);
    }
  });

  it('TC01-2 固定语料经 segmentForQuery 输出与 segmentForIndex 逐字节一致', () => {
    for (const row of golden) {
      expect(segmentForQuery(row.input)).toBe(row.index);
    }
  });

  it('TC01-3 segmentForIndex 对空串返回空串', () => {
    expect(segmentForIndex('')).toBe('');
  });

  it('TC01-4 segmentForIndex 对全空白返回空串', () => {
    expect(segmentForIndex('   ')).toBe('');
  });

  it('TC01-5 segmentForQuery 对空串返回空串', () => {
    expect(segmentForQuery('')).toBe('');
  });

  it('TC01-6 segmentForQuery 对全空白返回空串', () => {
    expect(segmentForQuery('   ')).toBe('');
  });
});
