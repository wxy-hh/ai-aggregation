import { describe, expect, it } from 'vitest';
import {
  buildCompatibilityChartFacts,
  computeHarmonyScore,
} from './compatibility-chart';
import { normalizeCompatibilityView } from './compatibility-normalizer';
import { computeBaziChart } from '@repo/shared';

describe('compatibility-chart', () => {
  it('does not include hour pillar when partner birth time is unknown', () => {
    const facts = buildCompatibilityChartFacts({
      self: {
        name: '我',
        gender: 'male',
        calendarType: 'solar',
        birthDate: { year: 1990, month: 5, day: 12 },
        birthTime: { hour: '08', minute: '30' },
        location: { name: '上海', lat: 31.2, lon: 121.5 },
      },
      partner: {
        name: '小星',
        gender: 'female',
        calendarType: 'solar',
        birthDate: { year: 1992, month: 8, day: 20 },
        birthTime: null,
        location: { name: '北京', lat: 39.9, lon: 116.4 },
      },
    });

    expect(facts.partner.hasHourPillar).toBe(false);
    expect(facts.partner.pillars.some((p) => p.label === '时柱')).toBe(false);
    expect(facts.completeness.labels.some((l) => l.includes('出生时间'))).toBe(true);
    expect(facts.score).toBeGreaterThanOrEqual(28);
    expect(facts.score).toBeLessThanOrEqual(92);
  });

  it('computes deterministic score band', () => {
    const self = computeBaziChart({
      name: 'A',
      gender: 'male',
      calendarType: 'solar',
      birthDate: { year: 1988, month: 3, day: 3 },
      birthTime: { hour: '10', minute: '00' },
      location: { name: '杭州', lat: 30.2, lon: 120.1 },
    });
    const partner = computeBaziChart({
      name: 'B',
      gender: 'female',
      calendarType: 'solar',
      birthDate: { year: 1991, month: 11, day: 11 },
      birthTime: { hour: '14', minute: '20' },
      location: { name: '成都', lat: 30.5, lon: 104.0 },
    });
    const a = computeHarmonyScore(self, partner, true);
    const b = computeHarmonyScore(self, partner, true);
    expect(a.score).toBe(b.score);
    expect(['high', 'mid', 'low']).toContain(a.scoreBand);
  });
});

function sampleFacts() {
  return buildCompatibilityChartFacts({
    self: {
      name: '我',
      gender: 'male',
      calendarType: 'solar',
      birthDate: { year: 1990, month: 1, day: 1 },
      birthTime: { hour: '09', minute: '00' },
      location: { name: '上海', lat: 31, lon: 121 },
    },
    partner: {
      name: 'TA',
      gender: 'female',
      calendarType: 'solar',
      birthDate: { year: 1991, month: 2, day: 2 },
      birthTime: { hour: '10', minute: '00' },
      location: { name: '北京', lat: 39, lon: 116 },
    },
  });
}

describe('compatibility-normalizer', () => {
  it('scrubs forbidden absolute phrases', () => {
    const facts = sampleFacts();

    const view = normalizeCompatibilityView(
      {
        oneLiner: '你们是绝配，注定在一起',
        needs: { self: ['需要回应'], partner: ['需要空间'] },
        attractions: [{ title: '吸引', detail: '天生一对' }],
        frictions: [{ trigger: '争执', reaction: '沉默', action: '先休息' }],
        dimensions: [],
        weeklyActions: ['约一次散步'],
      },
      'romance',
      facts
    );

    expect(view.oneLiner).not.toMatch(/绝配|注定/);
    expect(view.attractions[0]?.detail).not.toMatch(/天生一对/);
    expect(view.dimensions).toHaveLength(6);
    expect(view.disclaimers.length).toBeGreaterThan(0);
  });

  it('fills marriage-specific dimensions and disclaimers when raw is empty', () => {
    const facts = sampleFacts();
    const view = normalizeCompatibilityView({}, 'marriage', facts);

    expect(view.relationType).toBe('marriage');
    expect(view.dimensions.map((d) => d.key)).toEqual([
      'bond',
      'chores',
      'finance',
      'boundary',
      'repair',
      'vision',
    ]);
    expect(view.oneLiner).toMatch(/日子|分工|边界|财务|协作/);
    expect(view.needs.self.length).toBeGreaterThan(0);
    expect(view.attractions[0]?.title).toMatch(/互补|托底|生活/);
    expect(view.frictions[0]?.trigger).toMatch(/家务|钱|边界|分工/);
    expect(view.disclaimers.some((d) => d.includes('安全') || d.includes('暴力'))).toBe(true);
  });

  it('fills friendship defaults without romance framing', () => {
    const facts = sampleFacts();
    const view = normalizeCompatibilityView({}, 'friendship', facts);

    expect(view.dimensions.map((d) => d.key)).toEqual([
      'trust',
      'contact',
      'support',
      'interest',
      'boundary',
      'repair',
    ]);
    expect(view.oneLiner).not.toMatch(/被爱|亲密|恋爱/);
    expect(view.disclaimers.some((d) => d.includes('友谊'))).toBe(true);
  });

  it('fills partnership defaults with non-investment disclaimer', () => {
    const facts = sampleFacts();
    const view = normalizeCompatibilityView({}, 'partnership', facts);

    expect(view.dimensions.map((d) => d.key)).toEqual([
      'alignment',
      'decision',
      'execution',
      'feedback',
      'risk',
      'credit',
    ]);
    expect(view.oneLiner).toMatch(/成事|决策|协作|目标|闭环|利益/);
    expect(
      view.disclaimers.some(
        (d) => d.includes('投资') || d.includes('商业') || d.includes('法律')
      )
    ).toBe(true);
    expect(view.weeklyActions[0]?.text).toMatch(/可验收|负责人|截止|复盘|目标/);
  });
});
