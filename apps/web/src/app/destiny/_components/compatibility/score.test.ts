import { describe, expect, it } from 'vitest';
import type { CompatibilityChartFacts } from './types';
import {
  calibrateScore,
  computeRelationBias,
  computeRelationFeelScore,
  extractChartSignals,
  weightedDimensionAverage,
} from './score';

function makeFacts(
  overrides?: Partial<CompatibilityChartFacts>
): CompatibilityChartFacts {
  return {
    self: {
      name: '我',
      dayMaster: '甲',
      dayMasterElement: '木',
      pillars: [
        { label: '年柱', name: '甲子', stem: '甲', branch: '子', element: '木' },
        { label: '月柱', name: '丙寅', stem: '丙', branch: '寅', element: '火' },
        { label: '日柱', name: '甲辰', stem: '甲', branch: '辰', element: '木' },
      ],
      elements: [
        { key: 'wood', label: '木', value: 40 },
        { key: 'fire', label: '火', value: 25 },
        { key: 'earth', label: '土', value: 15 },
        { key: 'metal', label: '金', value: 10 },
        { key: 'water', label: '水', value: 10 },
      ],
    },
    partner: {
      name: 'TA',
      dayMaster: '庚',
      dayMasterElement: '金',
      pillars: [
        { label: '年柱', name: '庚申', stem: '庚', branch: '申', element: '金' },
        { label: '月柱', name: '己丑', stem: '己', branch: '丑', element: '土' },
        { label: '日柱', name: '庚子', stem: '庚', branch: '子', element: '金' },
        { label: '时柱', name: '戊寅', stem: '戊', branch: '寅', element: '土' },
      ],
      elements: [
        { key: 'wood', label: '木', value: 8 },
        { key: 'fire', label: '火', value: 10 },
        { key: 'earth', label: '土', value: 30 },
        { key: 'metal', label: '金', value: 40 },
        { key: 'water', label: '水', value: 12 },
      ],
      hasHourPillar: true,
    },
    completeness: {
      self: 'full',
      partner: 'full',
      labels: [],
    },
    score: 49,
    scoreBand: 'low',
    scoreHints: ['日主不同，节奏与需求更容易形成互补'],
    ...overrides,
  };
}

const flatDims = (keys: string[], value: number) =>
  keys.map((key) => ({ key, value }));

describe('computeRelationFeelScore (方案 B + 事实偏置)', () => {
  it('同一底分 + 相近六维 → 四视角仍可稳定分化', () => {
    const facts = makeFacts();
    // 模拟模型把六维都挤在中段
    const romanceDims = flatDims(
      ['expression', 'pace', 'intimacy', 'practical', 'repair', 'stability'],
      54
    );
    const marriageDims = flatDims(
      ['bond', 'chores', 'finance', 'boundary', 'repair', 'vision'],
      54
    );
    const friendshipDims = flatDims(
      ['trust', 'contact', 'support', 'interest', 'boundary', 'repair'],
      54
    );
    const partnershipDims = flatDims(
      ['alignment', 'decision', 'execution', 'feedback', 'risk', 'credit'],
      54
    );

    const romance = computeRelationFeelScore(facts, 'romance', romanceDims);
    const marriage = computeRelationFeelScore(facts, 'marriage', marriageDims);
    const friendship = computeRelationFeelScore(
      facts,
      'friendship',
      friendshipDims
    );
    const partnership = computeRelationFeelScore(
      facts,
      'partnership',
      partnershipDims
    );

    const scores = [
      romance.score,
      marriage.score,
      friendship.score,
      partnership.score,
    ];
    const spread = Math.max(...scores) - Math.min(...scores);
    // 事实偏置应拉开可读差距（至少 6 分）
    expect(spread).toBeGreaterThanOrEqual(6);
    // 互补结构下合作/恋爱通常高于「同质共鸣」向的友谊
    expect(partnership.score).toBeGreaterThan(friendship.score - 2);
    expect(romance.score).toBeGreaterThanOrEqual(22);
    expect(romance.score).toBeLessThanOrEqual(95);
  });

  it('同一输入可复现（确定性）', () => {
    const facts = makeFacts();
    const dims = flatDims(
      ['alignment', 'decision', 'execution', 'feedback', 'risk', 'credit'],
      66
    );
    const a = computeRelationFeelScore(facts, 'partnership', dims);
    const b = computeRelationFeelScore(facts, 'partnership', dims);
    expect(a).toEqual(b);
  });

  it('无维度时仍按关系偏置分化，不塌成同一底分', () => {
    const facts = makeFacts({ score: 49 });
    const r = computeRelationFeelScore(facts, 'romance', []);
    const f = computeRelationFeelScore(facts, 'friendship', []);
    expect(r.dimAverage).toBeNull();
    expect(f.dimAverage).toBeNull();
    expect(r.score).not.toBe(f.score);
    expect(r.bias).not.toBe(0);
  });

  it('加权均值尊重关键维度', () => {
    const dims = [
      { key: 'chores', value: 90 },
      { key: 'finance', value: 90 },
      { key: 'boundary', value: 90 },
      { key: 'bond', value: 30 },
      { key: 'repair', value: 30 },
      { key: 'vision', value: 30 },
    ];
    const avg = weightedDimensionAverage('marriage', dims);
    expect(avg).not.toBeNull();
    expect(avg!).toBeGreaterThan(60);
  });

  it('同日主 vs 异日主会改变关系偏置方向', () => {
    const different = extractChartSignals(makeFacts());
    const same = extractChartSignals(
      makeFacts({
        partner: {
          ...makeFacts().partner,
          dayMaster: '甲',
          dayMasterElement: '木',
        },
      })
    );
    const romanceDiff = computeRelationBias('romance', different);
    const romanceSame = computeRelationBias('romance', same);
    const friendDiff = computeRelationBias('friendship', different);
    const friendSame = computeRelationBias('friendship', same);

    // 恋爱更吃互补（异日主），友谊更吃共鸣（同日主）
    expect(romanceDiff).toBeGreaterThan(romanceSame);
    expect(friendSame).toBeGreaterThan(friendDiff);
  });
});

describe('calibrateScore 展示口径标定', () => {
  it('映射命中目标分布锚点（差 30-45 / 中 55-70 / 高 75-88）', () => {
    // 弱匹配 raw ~35
    expect(calibrateScore(35)).toBeGreaterThanOrEqual(30);
    expect(calibrateScore(35)).toBeLessThanOrEqual(45);
    // 典型组合 raw ~55
    const typical = calibrateScore(55);
    expect(typical).toBeGreaterThanOrEqual(55);
    expect(typical).toBeLessThanOrEqual(70);
    // 强匹配 raw ~80
    const strong = calibrateScore(80);
    expect(strong).toBeGreaterThanOrEqual(75);
    expect(strong).toBeLessThanOrEqual(90);
  });

  it('保持单调：弱 < 中 < 高', () => {
    expect(calibrateScore(35)).toBeLessThan(calibrateScore(55));
    expect(calibrateScore(55)).toBeLessThan(calibrateScore(80));
  });

  it('输入异常回退中带（50 → ~57）', () => {
    expect(calibrateScore(NaN)).toBeGreaterThanOrEqual(55);
    expect(calibrateScore(NaN)).toBeLessThanOrEqual(70);
  });
});

describe('computeRelationFeelScore 标定后档位', () => {
  const romanceKeys = ['expression', 'pace', 'intimacy', 'practical', 'repair', 'stability'];

  it('典型输入（底分 55 / 六维 55）落中带', () => {
    const typical = computeRelationFeelScore(
      makeFacts({ score: 55 }),
      'romance',
      flatDims(romanceKeys, 55)
    );
    expect(typical.scoreBand).toBe('mid');
    expect(typical.score).toBeGreaterThanOrEqual(55);
    expect(typical.score).toBeLessThan(75);
  });

  it('强匹配（底分 75 / 六维 85）落高带', () => {
    const strong = computeRelationFeelScore(
      makeFacts({ score: 75 }),
      'romance',
      flatDims(romanceKeys, 85)
    );
    expect(strong.scoreBand).toBe('high');
    expect(strong.score).toBeGreaterThanOrEqual(75);
  });

  it('弱匹配（底分 35 / 六维 35）落低带', () => {
    const weak = computeRelationFeelScore(
      makeFacts({ score: 35 }),
      'romance',
      flatDims(romanceKeys, 35)
    );
    expect(weak.scoreBand).toBe('low');
    expect(weak.score).toBeLessThan(55);
  });

  it('dimAverage 返回展示口径值，与主分一致', () => {
    const feel = computeRelationFeelScore(
      makeFacts(),
      'partnership',
      flatDims(['alignment', 'decision', 'execution', 'feedback', 'risk', 'credit'], 66)
    );
    expect(feel.dimAverage).not.toBeNull();
    expect(feel.dimAverage!).toBeGreaterThanOrEqual(55);
    expect(feel.dimAverage!).toBeLessThanOrEqual(90);
  });
});
