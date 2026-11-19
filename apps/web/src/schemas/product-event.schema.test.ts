import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_EVENT_NAMES,
  PRODUCT_EVENT_NAMES,
  artifactEventPropsSchema,
  trackProductEventSchema,
} from './product-event.schema';

const validProps = { artifactType: 'markdown', versionSeq: 2, sizeBucket: '1k_6k' } as const;

describe('产物埋点 schema (ADR-0037 §8 / TC12)', () => {
  it('[TC12-1] 白名单新增复制、导出、补丁成功、补丁失败、回滚、差异打开六个事件名，且保留原有芯片事件', () => {
    expect([...ARTIFACT_EVENT_NAMES]).toEqual([
      'artifact.copy',
      'artifact.export',
      'artifact.patch_applied',
      'artifact.patch_failed',
      'artifact.rollback',
      'artifact.diff_open',
    ]);
    for (const name of ARTIFACT_EVENT_NAMES) {
      expect(PRODUCT_EVENT_NAMES).toContain(name);
      expect(trackProductEventSchema.safeParse({ event: name, props: validProps }).success).toBe(true);
    }
    expect(PRODUCT_EVENT_NAMES).toContain('agent_intent_chip.click');
    expect(trackProductEventSchema.safeParse({ event: 'agent_intent_chip.click', props: { signal: 'url' } }).success).toBe(true);
  });

  it('[TC12-2] 属性只允许产物类型、版本序号、字符数区间；携带 title、content、section 等多余字段被 strict 拒绝', () => {
    for (const extra of [{ title: '机密研报' }, { content: '# 正文' }, { section: '## 第五章' }, { reason: 'not-found' }]) {
      expect(artifactEventPropsSchema.safeParse({ ...validProps, ...extra }).success).toBe(false);
      expect(
        trackProductEventSchema.safeParse({ event: 'artifact.patch_failed', props: { ...validProps, ...extra } }).success
      ).toBe(false);
    }
  });

  it('属性取值非法被拒绝：未知类型、非整数/非正版本序号、未知区间、缺字段', () => {
    const bad = [
      { ...validProps, artifactType: 'video' },
      { ...validProps, versionSeq: 0 },
      { ...validProps, versionSeq: 1.5 },
      { ...validProps, sizeBucket: '12345' },
      { artifactType: 'markdown', versionSeq: 1 },
    ];
    for (const props of bad) {
      expect(artifactEventPropsSchema.safeParse(props).success).toBe(false);
    }
  });

  it('事件名与属性形状必须对应：产物事件不能带芯片属性，芯片事件不能带产物属性；顶层多余字段拒绝', () => {
    expect(trackProductEventSchema.safeParse({ event: 'artifact.copy', props: { signal: 'url' } }).success).toBe(false);
    expect(trackProductEventSchema.safeParse({ event: 'agent_intent_chip.click', props: validProps }).success).toBe(false);
    expect(trackProductEventSchema.safeParse({ event: 'artifact.copy', props: validProps, extra: 1 }).success).toBe(false);
    expect(trackProductEventSchema.safeParse({ event: 'artifact.unknown', props: validProps }).success).toBe(false);
  });
});
