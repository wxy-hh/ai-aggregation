/**
 * 命理能力注册 — 单元测试
 *
 * 覆盖 REQ-012（能力注册、ready/needs_input/unsupported、文本只作问题/背景、
 * 三术数平级无推荐）与设计 §13。
 */

import { describe, it, expect } from 'vitest';
import {
  DESTINY_CAPABILITIES,
  getDestinyCapabilities,
  getDestinyCapability,
  computeDestinyReadiness,
} from './destiny-capabilities';

describe('命理能力注册', () => {
  it('注册三术数且平级（无推荐/排序字段）', () => {
    const caps = getDestinyCapabilities();
    expect(caps.map((c) => c.id)).toEqual(['bazi', 'ziwei', 'qimen']);
    // 不含任何推荐/权重/排序字段
    for (const cap of caps) {
      expect(cap).not.toHaveProperty('recommended');
      expect(cap).not.toHaveProperty('weight');
      expect(cap).not.toHaveProperty('order');
    }
  });

  it('文本只作问题或背景，绝不作出生资料', () => {
    for (const cap of DESTINY_CAPABILITIES) {
      expect(['question', 'background']).toContain(cap.referenceRole);
    }
  });

  it('按 id 取能力', () => {
    expect(getDestinyCapability('bazi')?.label).toBe('八字');
    expect(getDestinyCapability('qimen')?.referenceRole).toBe('question');
    expect(getDestinyCapability('nonexistent')).toBeUndefined();
  });
});

describe('computeDestinyReadiness', () => {
  it('不支持的引用类型返回 unsupported（UI 不展示）', () => {
    const bazi = getDestinyCapability('bazi')!;
    // 八字不支持图片/视频
    expect(computeDestinyReadiness(bazi, { sourceType: 'image' })).toBe('unsupported');
    expect(computeDestinyReadiness(bazi, { sourceType: 'video' })).toBe('unsupported');
  });

  it('缺出生资料时八字/紫微返回 needs_input', () => {
    const bazi = getDestinyCapability('bazi')!;
    expect(computeDestinyReadiness(bazi, { sourceType: 'text', hasBirthProfile: false })).toBe(
      'needs_input',
    );
  });

  it('有出生资料时八字返回 ready', () => {
    const bazi = getDestinyCapability('bazi')!;
    expect(computeDestinyReadiness(bazi, { sourceType: 'text', hasBirthProfile: true })).toBe(
      'ready',
    );
  });

  it('奇门需问题+起局时间，缺一则 needs_input', () => {
    const qimen = getDestinyCapability('qimen')!;
    expect(computeDestinyReadiness(qimen, { sourceType: 'text', hasQuestion: true, hasCastTime: false })).toBe(
      'needs_input',
    );
    expect(computeDestinyReadiness(qimen, { sourceType: 'text', hasQuestion: true, hasCastTime: true })).toBe(
      'ready',
    );
  });
});
