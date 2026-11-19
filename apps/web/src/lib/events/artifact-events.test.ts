import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildArtifactEventProps, toSizeBucket, trackArtifactEvent } from './artifact-events';
import { artifactEventPropsSchema } from '@/schemas/product-event.schema';

const mocks = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('./tracker', () => ({ trackEvent: mocks.trackEvent }));

describe('产物埋点属性构造 (ADR-0037 §8)', () => {
  beforeEach(() => mocks.trackEvent.mockReset());

  it('字符数按 1,000 / 6,000 / 30,000 边界分区间', () => {
    expect(toSizeBucket(0)).toBe('lt_1k');
    expect(toSizeBucket(999)).toBe('lt_1k');
    expect(toSizeBucket(1_000)).toBe('1k_6k');
    expect(toSizeBucket(5_999)).toBe('1k_6k');
    expect(toSizeBucket(6_000)).toBe('6k_30k');
    expect(toSizeBucket(30_000)).toBe('6k_30k');
    expect(toSizeBucket(30_001)).toBe('gt_30k');
  });

  it('构造的属性通过 strict schema，且只含三个允许字段；版本序号至少为 1', () => {
    const props = buildArtifactEventProps({ type: 'code', versionSeq: 0, contentLength: 2_500 });
    expect(artifactEventPropsSchema.safeParse(props).success).toBe(true);
    expect(Object.keys(props).sort()).toEqual(['artifactType', 'sizeBucket', 'versionSeq']);
    expect(props.versionSeq).toBe(1);
  });

  it('即使入参被塞入标题、正文，上报属性序列化后也不含它们', () => {
    const polluted = {
      type: 'markdown' as const,
      versionSeq: 3,
      contentLength: 800,
      title: '绝密季度研报',
      content: '# 绝密正文',
    };
    trackArtifactEvent('artifact.copy', polluted);
    const [, props] = mocks.trackEvent.mock.calls[0];
    const json = JSON.stringify(props);
    expect(json).not.toContain('绝密');
    expect(props).toEqual({ artifactType: 'markdown', versionSeq: 3, sizeBucket: 'lt_1k' });
  });
});
