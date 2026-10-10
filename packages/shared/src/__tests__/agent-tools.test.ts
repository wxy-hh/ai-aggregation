import { describe, expect, it } from 'vitest';
import { toolCallRecordSchema } from '../agent-tools';

describe('toolCallRecordSchema（工单 P0a-01：durationMs 校验）', () => {
  const baseRecord = {
    id: 'call-1',
    name: 'web_fetch',
    argsSummary: '{"url":"https://example.com"}',
    status: 'success' as const,
    resultSummary: '获取完成',
  };

  it('缺省 durationMs 通过（向后兼容）', () => {
    const parsed = toolCallRecordSchema.parse(baseRecord);
    expect(parsed).toEqual(baseRecord);
    expect(parsed.durationMs).toBeUndefined();
  });

  it('正整数与 0 的 durationMs 通过', () => {
    const withPositive = toolCallRecordSchema.parse({
      ...baseRecord,
      durationMs: 120,
    });
    expect(withPositive.durationMs).toBe(120);

    const withZero = toolCallRecordSchema.parse({
      ...baseRecord,
      durationMs: 0,
    });
    expect(withZero.durationMs).toBe(0);
  });

  it('负数 durationMs 拒绝', () => {
    expect(() =>
      toolCallRecordSchema.parse({
        ...baseRecord,
        durationMs: -1,
      })
    ).toThrow();
  });

  it('小数 durationMs 拒绝', () => {
    expect(() =>
      toolCallRecordSchema.parse({
        ...baseRecord,
        durationMs: 12.34,
      })
    ).toThrow();
  });

  it('非数字 durationMs 拒绝', () => {
    expect(() =>
      toolCallRecordSchema.parse({
        ...baseRecord,
        durationMs: '120',
      })
    ).toThrow();
  });
});
