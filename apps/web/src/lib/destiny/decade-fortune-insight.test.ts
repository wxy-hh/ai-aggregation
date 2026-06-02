import { describe, expect, it } from 'vitest';
import type { BaziChartBasis } from '@repo/shared';
import { buildDecadeFortuneFacts, mergeDecadeFortuneInsights } from '@repo/shared';
import {
  buildDecadeFortuneInsights,
  computeStemTenGod,
  fillDecadeFortuneInsightFallbacks,
} from './decade-fortune-insight';

function createTestBasis(overrides?: Partial<BaziChartBasis>): BaziChartBasis {
  const basis: BaziChartBasis = {
    profile: {
      name: '甲',
      genderLabel: '乾造（男命）',
      locationText: '北京',
      birthText: '1990年1月1日',
      lunarText: '农历',
      solarText: '1990年1月1日',
      chartSummary: '乾造：庚午 戊子 甲子 丙寅',
    },
    originalInput: {
      name: '甲',
      gender: 'male',
      calendarType: 'solar',
      birthDate: { year: 1990, month: 1, day: 1 },
      birthTime: { hour: '03', minute: '00' },
      location: { name: '北京', lat: 39.9, lon: 116.4 },
    },
    solarTime: {
      standard: { year: 1990, month: 1, day: 1, hour: 3, minute: 0, second: 0, text: '' },
      corrected: { year: 1990, month: 1, day: 1, hour: 3, minute: 0, second: 0, text: '' },
    },
    correction: {
      applied: false,
      longitude: null,
      standardMeridian: 120,
      longitudeOffset: 0,
      equationOfTime: 0,
      offsetSeconds: 0,
      offsetMinutes: 0,
      summary: '',
    },
    dayMaster: { stem: '甲', element: 'wood', yinYang: 'yang' },
    pillars: [
      {
        label: '年柱',
        name: '庚午',
        stem: '庚',
        branch: '午',
        displayElement: 'metal',
        stemElement: 'metal',
        branchElement: 'fire',
        stemTenGod: '七杀',
        sound: '路旁土',
        hiddenStems: [{ stem: '丁', type: 'main', element: 'fire', tenGod: '伤官' }],
      },
      {
        label: '月柱',
        name: '戊子',
        stem: '戊',
        branch: '子',
        displayElement: 'earth',
        stemElement: 'earth',
        branchElement: 'water',
        stemTenGod: '偏财',
        sound: '霹雳火',
        hiddenStems: [{ stem: '癸', type: 'main', element: 'water', tenGod: '正印' }],
      },
      {
        label: '日柱',
        name: '甲子',
        stem: '甲',
        branch: '子',
        displayElement: 'wood',
        stemElement: 'wood',
        branchElement: 'water',
        stemTenGod: '比肩',
        sound: '海中金',
        hiddenStems: [{ stem: '癸', type: 'main', element: 'water', tenGod: '正印' }],
      },
      {
        label: '时柱',
        name: '丙寅',
        stem: '丙',
        branch: '寅',
        displayElement: 'fire',
        stemElement: 'fire',
        branchElement: 'wood',
        stemTenGod: '食神',
        sound: '炉中火',
        hiddenStems: [{ stem: '甲', type: 'main', element: 'wood', tenGod: '比肩' }],
      },
    ],
    solarTerms: {
      active: {
        name: '小寒',
        type: 'jie',
        solarTime: { year: 1990, month: 1, day: 5, hour: 0, minute: 0, second: 0, text: '' },
      },
      previous: {
        name: '冬至',
        type: 'jie',
        solarTime: { year: 1989, month: 12, day: 22, hour: 0, minute: 0, second: 0, text: '' },
      },
      next: {
        name: '大寒',
        type: 'jie',
        solarTime: { year: 1990, month: 1, day: 20, hour: 0, minute: 0, second: 0, text: '' },
      },
    },
    elementStats: [
      {
        key: 'wood',
        label: '木',
        value: 28,
        weight: 28,
        sources: { stems: 10, branches: 8, hiddenStems: 6, seasonalBonus: 4 },
      },
      {
        key: 'water',
        label: '水',
        value: 22,
        weight: 22,
        sources: { stems: 8, branches: 8, hiddenStems: 6, seasonalBonus: 0 },
      },
      {
        key: 'fire',
        label: '火',
        value: 18,
        weight: 18,
        sources: { stems: 6, branches: 8, hiddenStems: 4, seasonalBonus: 0 },
      },
      {
        key: 'metal',
        label: '金',
        value: 16,
        weight: 16,
        sources: { stems: 10, branches: 4, hiddenStems: 2, seasonalBonus: 0 },
      },
      {
        key: 'earth',
        label: '土',
        value: 12,
        weight: 12,
        sources: { stems: 10, branches: 0, hiddenStems: 2, seasonalBonus: 0 },
      },
    ],
    tenGodStats: [
      { key: 'bijian', label: '比肩', domain: 'self', value: 18, weight: 18, visibleStems: 12, hiddenStems: 6 },
      { key: 'shishen', label: '食神', domain: 'expression', value: 14, weight: 14, visibleStems: 10, hiddenStems: 4 },
      { key: 'zhengyin', label: '正印', domain: 'resource', value: 12, weight: 12, visibleStems: 8, hiddenStems: 4 },
      { key: 'qisha', label: '七杀', domain: 'order', value: 10, weight: 10, visibleStems: 10, hiddenStems: 0 },
      { key: 'piancai', label: '偏财', domain: 'wealth', value: 8, weight: 8, visibleStems: 8, hiddenStems: 0 },
    ],
    childLimit: {
      forward: true,
      startAge: 3,
      endAge: 12,
      startTime: { year: 1993, month: 1, day: 1, hour: 0, minute: 0, second: 0, text: '' },
      endTime: { year: 2002, month: 1, day: 1, hour: 0, minute: 0, second: 0, text: '' },
      duration: { years: 3, months: 0, days: 0, hours: 0, minutes: 0 },
    },
    decadeFortunes: [
      {
        index: 0,
        name: '己丑',
        startAge: 3,
        endAge: 12,
        startYear: 1993,
        endYear: 2002,
        sixtyCycle: '己丑',
        active: false,
      },
      {
        index: 1,
        name: '庚寅',
        startAge: 13,
        endAge: 22,
        startYear: 2003,
        endYear: 2012,
        sixtyCycle: '庚寅',
        active: true,
      },
    ],
    annualCycles: [],
    reportSeed: { pillars: [], elements: [], tenGods: [], timeline: [] },
  };

  return { ...basis, ...overrides };
}

describe('decade-fortune-insight', () => {
  it('computeStemTenGod 应正确计算十神', () => {
    expect(computeStemTenGod('丁', '壬')).toBe('正官');
    expect(computeStemTenGod('甲', '庚')).toBe('七杀');
    expect(computeStemTenGod('乙', '乙')).toBe('比肩');
  });

  it('不同日主对同一大运应生成不同十神', () => {
    const decade = {
      index: 1,
      name: '壬寅',
      startAge: 27,
      endAge: 36,
      startYear: 2020,
      endYear: 2029,
      sixtyCycle: '壬寅',
      active: true,
    };

    const dingBasis = createTestBasis({
      dayMaster: { stem: '丁', element: 'fire', yinYang: 'yin' },
    });
    const jiaBasis = createTestBasis({
      dayMaster: { stem: '甲', element: 'wood', yinYang: 'yang' },
    });

    const dingFact = buildDecadeFortuneFacts({ ...dingBasis, decadeFortunes: [decade] })[0];
    const jiaFact = buildDecadeFortuneFacts({ ...jiaBasis, decadeFortunes: [decade] })[0];

    expect(dingFact?.stemTenGod).toBe('正官');
    expect(jiaFact?.stemTenGod).toBe('偏印');
  });

  it('mergeDecadeFortuneInsights 应保留模型文案并补齐十神', () => {
    const basis = createTestBasis();
    const merged = mergeDecadeFortuneInsights(basis, [
      {
        name: '庚寅',
        summary: '你在这十年更适合把专业能力转成可见成果。',
        stemPhase: '多争取对外展示窗口',
        branchPhase: '内心更重长期积累',
        natalNotes: [],
      },
    ]);

    expect(merged[1]?.summary).toContain('专业能力');
    expect(merged[1]?.stemTenGod).toBeTruthy();
    expect(merged[1]?.branchMainTenGod).toBeTruthy();
  });

  it('应识别大运与命局地支相冲的事实', () => {
    const basis = createTestBasis();
    const facts = buildDecadeFortuneFacts(basis);
    const wuFact = facts.find((item) => item.name === '庚午');
    if (wuFact) {
      expect(wuFact.natalNotes.some((note) => note.includes('起伏'))).toBe(true);
    }
  });

  it('批量生成时每步大运摘要应互不相同', () => {
    const basis = createTestBasis();
    const insights = buildDecadeFortuneInsights(basis);
    const summaries = new Set(insights.map((item) => item.summary));
    expect(summaries.size).toBe(insights.length);
  });

  it('fillDecadeFortuneInsightFallbacks 应补齐空字段', () => {
    const basis = createTestBasis();
    const partial = mergeDecadeFortuneInsights(basis, [
      {
        name: '己丑',
        summary: '',
        stemPhase: '',
        branchPhase: '',
      },
      {
        name: '庚寅',
        summary: '已有摘要',
        stemPhase: '已有前五年',
        branchPhase: '已有后五年',
      },
    ]);
    const filled = fillDecadeFortuneInsightFallbacks(basis, partial);
    expect(filled[0]?.summary.length).toBeGreaterThan(0);
    expect(filled[1]?.summary).toBe('已有摘要');
  });
});
