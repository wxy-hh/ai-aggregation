import { describe, expect, it } from 'vitest';
import {
  buildCompatibilityShareCardData,
  buildCompatibilityShareUrl,
} from './compatibility-share-card-data';
import type { CompatibilityReport, CompatibilityViewPayload } from '../types';

function createView(
  overrides: Partial<CompatibilityViewPayload> = {}
): CompatibilityViewPayload {
  return {
    relationType: 'romance',
    oneLiner: '表达节奏不同，但仍能彼此靠近',
    needs: { self: [], partner: [] },
    attractions: [],
    frictions: [],
    dimensions: [
      { key: 'expression', label: '情感表达', value: 72 },
      { key: 'pace', label: '沟通节奏', value: 68 },
      { key: 'intimacy', label: '亲密需求', value: 75 },
      { key: 'practical', label: '现实协作', value: 60 },
      { key: 'repair', label: '冲突修复', value: 70 },
      { key: 'stability', label: '关系稳定感', value: 66 },
    ],
    rhythm: [],
    weeklyActions: [{ id: 'a1', text: '本周主动约一次轻松短聊' }],
    disclaimers: [],
    ...overrides,
  };
}

function createReport(
  overrides: Partial<CompatibilityReport> = {}
): CompatibilityReport {
  return {
    id: 'c1',
    relationType: 'romance',
    focusTags: [],
    partnerDisplayName: '小雨',
    createdAt: new Date().toISOString(),
    chartFacts: {
      self: {
        name: '我',
        dayMaster: '甲',
        dayMasterElement: 'wood',
        pillars: [],
        elements: [],
      },
      partner: {
        name: '小雨',
        dayMaster: '庚',
        dayMasterElement: 'metal',
        pillars: [],
        elements: [],
        hasHourPillar: true,
      },
      completeness: { self: 'full', partner: 'full', labels: [] },
      score: 72,
      scoreBand: 'mid',
      scoreHints: [],
    },
    views: {
      romance: createView(),
    },
    ...overrides,
  };
}

describe('buildCompatibilityShareUrl', () => {
  it('附带合盘 UTM 且不深链报告', () => {
    const url = buildCompatibilityShareUrl('https://example.com');
    expect(url).toBe(
      'https://example.com/destiny?utm_source=share_card&utm_medium=qrcode&utm_campaign=bazi_compatibility'
    );
    expect(url).not.toContain('historyId');
  });
});

describe('buildCompatibilityShareCardData', () => {
  it('从当前视角构建白名单字段', () => {
    const data = buildCompatibilityShareCardData(createReport(), 'romance', {
      origin: 'https://example.com',
    });
    expect(data).not.toBeNull();
    expect(data!.partnerLabel).toBe('小雨');
    expect(data!.relationLabel).toBe('恋爱');
    expect(data!.oneLiner).toContain('表达节奏');
    expect(data!.weeklyAction).toContain('短聊');
    expect(data!.score).toBeGreaterThan(0);
    expect(data!.bandTitle.length).toBeGreaterThan(0);
    expect(data!.shareUrl).toContain('bazi_compatibility');
    expect(data!.shareText).toContain('恋爱');
    expect(data!.shareText).not.toContain('命盘底分');
    expect(data!.fileName).toContain('缘分卡');
    // 隐私：卡面数据不得出现生辰/地点类键（防回归）
    expect(data).not.toHaveProperty('birthDate');
    expect(data).not.toHaveProperty('birthText');
    expect(data).not.toHaveProperty('location');
    expect(data).not.toHaveProperty('pillars');
    expect(data).not.toHaveProperty('baseScore');
  });

  it('当前视角无 view 时返回 null', () => {
    const report = createReport({ views: {} });
    expect(
      buildCompatibilityShareCardData(report, 'marriage', {
        origin: 'https://example.com',
      })
    ).toBeNull();
  });

  it('oneLiner 为空时返回 null', () => {
    const report = createReport({
      views: { romance: createView({ oneLiner: '  ' }) },
    });
    expect(
      buildCompatibilityShareCardData(report, 'romance', {
        origin: 'https://example.com',
      })
    ).toBeNull();
  });

  it('无 weeklyActions 时 weeklyAction 为 null 仍可构建', () => {
    const report = createReport({
      views: { romance: createView({ weeklyActions: [] }) },
    });
    const data = buildCompatibilityShareCardData(report, 'romance', {
      origin: 'https://example.com',
    });
    expect(data).not.toBeNull();
    expect(data!.weeklyAction).toBeNull();
  });

  it('对方名为空时回退 TA', () => {
    const report = createReport({ partnerDisplayName: '' });
    const data = buildCompatibilityShareCardData(report, 'romance', {
      origin: 'https://example.com',
    });
    expect(data!.partnerLabel).toBe('TA');
  });
});
