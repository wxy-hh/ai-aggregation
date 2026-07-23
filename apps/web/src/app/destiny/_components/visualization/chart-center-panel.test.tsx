import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PartialDestinyReport } from '../types';
import { ChartCenterPanel } from './chart-center-panel';

vi.mock('@/assets/image/bazi.svg', () => ({
  default: { src: '/bazi.svg' },
}));

function createBaseReport(): PartialDestinyReport {
  return {
    profile: {
      name: '测试用户',
      genderLabel: '乾造（男命）',
      birthText: '1993年8月16日 09:30',
      locationText: '杭州',
    },
    coreTone: {
      tag: '核心命理定调',
      chartSummary: '乾造：甲子 丙寅 戊辰 庚申',
      headline: '先稳后发，厚积见成',
      description: '整体节奏偏稳，适合在复杂环境里靠耐心和结构感逐步拉开差距。',
    },
    pillars: [
      {
        stem: '甲',
        branch: '子',
        label: '年柱',
        element: 'wood',
        tooltip: '年柱代表祖基、早年环境和家族底色。这意味着你更容易被原生环境塑造审美和安全感。',
      },
      {
        stem: '丙',
        branch: '寅',
        label: '月柱',
        element: 'fire',
        tooltip: '月柱代表提纲，主要看成长氛围、做事习惯和事业根基。这意味着你做事更讲效率与节奏。',
      },
      {
        stem: '戊',
        branch: '辰',
        label: '日柱',
        element: 'earth',
        tooltip:
          '日柱代表自己和夫妻宫，主要看核心性格、自我驱动力与亲密关系反应。这意味着你在关系里更看重稳定与兑现。',
      },
      {
        stem: '庚',
        branch: '申',
        label: '时柱',
        element: 'metal',
        tooltip:
          '时柱代表子女宫与晚景，主要看行动落点、后续发展方向和结果意识。这意味着你越往后越重视结果和沉淀。',
      },
    ],
    elements: [
      { key: 'metal', label: '金', value: 22 },
      { key: 'wood', label: '木', value: 18 },
      { key: 'water', label: '水', value: 26 },
      { key: 'fire', label: '火', value: 14 },
      { key: 'earth', label: '土', value: 20 },
    ],
    tenGods: [
      { key: 'piancai', label: '偏财', value: 32, tooltip: '机会型收入与资源整合' },
      { key: 'shishen', label: '食神/伤官', value: 25, tooltip: '表达力与创造力' },
      { key: 'zhengguan', label: '正官/七杀', value: 23, tooltip: '规则、压力与目标感' },
      { key: 'pianyin', label: '偏印/枭神', value: 20, tooltip: '学习吸收与独立思考' },
    ],
    balanceInsight: {
      title: '命局偏强',
      value: '金、水',
      tooltip: '金水相对更显，说明你看问题会先求稳定和效率，再考虑情绪表达。',
    },
    patternHighlights: [
      { label: '伤官配印', tooltip: '想法多，但也能靠学习和结构感把它收回来。' },
      { label: '官印相生', tooltip: '责任感和学习力会互相抬升，适合做长期积累。' },
    ],
  };
}

function createBaziBasis(): NonNullable<PartialDestinyReport['baziBasis']> {
  return {
    profile: {
      name: '测试用户',
      genderLabel: '乾造（男命）',
      locationText: '杭州（30.27, 120.16）',
      birthText: '1993年8月16日 09:30',
      lunarText: '农历癸酉年八月十六辛巳时',
      solarText: '1993年10月1日 09:31:00',
      chartSummary: '乾造：癸酉 辛酉 乙未 辛巳',
    },
    originalInput: {
      name: '测试用户',
      gender: 'male',
      calendarType: 'lunar', // 农历
      birthDate: { year: 1993, month: 8, day: 16 },
      birthTime: { hour: '09', minute: '30' },
      location: { name: '杭州', lat: 30.27, lon: 120.16 },
    },
    solarTime: {
      standard: {
        year: 1993,
        month: 10,
        day: 1,
        hour: 9,
        minute: 30,
        second: 0,
        text: '1993年10月1日 09:30:00',
      },
      corrected: {
        year: 1993,
        month: 10,
        day: 1,
        hour: 9,
        minute: 31,
        second: 0,
        text: '1993年10月1日 09:31:00',
      },
    },
    correction: {
      applied: true,
      longitude: 120.16,
      standardMeridian: 120,
      longitudeOffset: 38,
      equationOfTime: 0,
      offsetSeconds: 38,
      offsetMinutes: 0.6,
      summary: '已按东八区标准经线 120E 做经度修正，向后顺延 0.6 分钟。',
    },
    dayMaster: { stem: '乙', element: 'wood', yinYang: 'yin' },
    pillars: [
      {
        label: '年柱',
        name: '癸酉',
        stem: '癸',
        branch: '酉',
        displayElement: 'water',
        stemElement: 'water',
        branchElement: 'metal',
        stemTenGod: '偏印',
        sound: '剑锋金',
        hiddenStems: [{ stem: '辛', type: 'main', element: 'metal', tenGod: '七杀' }],
      },
      {
        label: '月柱',
        name: '辛酉',
        stem: '辛',
        branch: '酉',
        displayElement: 'metal',
        stemElement: 'metal',
        branchElement: 'metal',
        stemTenGod: '七杀',
        sound: '石榴木',
        hiddenStems: [{ stem: '辛', type: 'main', element: 'metal', tenGod: '七杀' }],
      },
      {
        label: '日柱',
        name: '乙未',
        stem: '乙',
        branch: '未',
        displayElement: 'wood',
        stemElement: 'wood',
        branchElement: 'earth',
        stemTenGod: '比肩',
        sound: '砂中金',
        hiddenStems: [
          { stem: '己', type: 'main', element: 'earth', tenGod: '偏财' },
          { stem: '丁', type: 'middle', element: 'fire', tenGod: '食神' },
        ],
      },
      {
        label: '时柱',
        name: '辛巳',
        stem: '辛',
        branch: '巳',
        displayElement: 'metal',
        stemElement: 'metal',
        branchElement: 'fire',
        stemTenGod: '七杀',
        sound: '白蜡金',
        hiddenStems: [
          { stem: '丙', type: 'main', element: 'fire', tenGod: '伤官' },
          { stem: '庚', type: 'middle', element: 'metal', tenGod: '正官' },
        ],
      },
    ],
    solarTerms: {
      previous: {
        name: '白露',
        type: 'jie',
        solarTime: {
          year: 1993,
          month: 9,
          day: 8,
          hour: 5,
          minute: 0,
          second: 0,
          text: '1993年9月8日 05:00:00',
        },
      },
      active: {
        name: '秋分',
        type: 'qi',
        solarTime: {
          year: 1993,
          month: 9,
          day: 23,
          hour: 14,
          minute: 0,
          second: 0,
          text: '1993年9月23日 14:00:00',
        },
      },
      next: {
        name: '寒露',
        type: 'jie',
        solarTime: {
          year: 1993,
          month: 10,
          day: 8,
          hour: 11,
          minute: 0,
          second: 0,
          text: '1993年10月8日 11:00:00',
        },
      },
    },
    elementStats: [
      {
        key: 'metal',
        label: '金',
        value: 35,
        weight: 35,
        sources: { stems: 20, branches: 8, hiddenStems: 7, seasonalBonus: 0 },
      },
      {
        key: 'wood',
        label: '木',
        value: 18,
        weight: 18,
        sources: { stems: 10, branches: 0, hiddenStems: 4, seasonalBonus: 4 },
      },
      {
        key: 'water',
        label: '水',
        value: 16,
        weight: 16,
        sources: { stems: 10, branches: 0, hiddenStems: 6, seasonalBonus: 0 },
      },
      {
        key: 'fire',
        label: '火',
        value: 14,
        weight: 14,
        sources: { stems: 0, branches: 8, hiddenStems: 6, seasonalBonus: 0 },
      },
      {
        key: 'earth',
        label: '土',
        value: 17,
        weight: 17,
        sources: { stems: 0, branches: 8, hiddenStems: 9, seasonalBonus: 0 },
      },
    ],
    tenGodStats: [
      {
        key: 'qisha',
        label: '七杀',
        domain: 'order',
        value: 32,
        weight: 32,
        visibleStems: 22,
        hiddenStems: 10,
      },
      {
        key: 'bijian',
        label: '比肩',
        domain: 'self',
        value: 18,
        weight: 18,
        visibleStems: 10,
        hiddenStems: 8,
      },
      {
        key: 'piancai',
        label: '偏财',
        domain: 'wealth',
        value: 16,
        weight: 16,
        visibleStems: 0,
        hiddenStems: 16,
      },
      {
        key: 'pianyin',
        label: '偏印',
        domain: 'resource',
        value: 14,
        weight: 14,
        visibleStems: 10,
        hiddenStems: 4,
      },
      {
        key: 'shishen',
        label: '食神',
        domain: 'expression',
        value: 10,
        weight: 10,
        visibleStems: 0,
        hiddenStems: 10,
      },
      {
        key: 'zhengguan',
        label: '正官',
        domain: 'order',
        value: 10,
        weight: 10,
        visibleStems: 0,
        hiddenStems: 10,
      },
    ],
    childLimit: {
      forward: true,
      startAge: 8,
      endAge: 17,
      startTime: {
        year: 1993,
        month: 10,
        day: 1,
        hour: 9,
        minute: 31,
        second: 0,
        text: '1993年10月1日 09:31:00',
      },
      endTime: {
        year: 2001,
        month: 7,
        day: 23,
        hour: 5,
        minute: 56,
        second: 0,
        text: '2001年7月23日 05:56:00',
      },
      duration: { years: 7, months: 9, days: 21, hours: 20, minutes: 25 },
    },
    decadeFortunes: [
      {
        index: 0,
        name: '壬戌',
        startAge: 8,
        endAge: 17,
        startYear: 2001,
        endYear: 2010,
        sixtyCycle: '壬戌',
        active: false,
      },
      {
        index: 1,
        name: '癸亥',
        startAge: 18,
        endAge: 27,
        startYear: 2011,
        endYear: 2020,
        sixtyCycle: '癸亥',
        active: false,
      },
      {
        index: 2,
        name: '甲子',
        startAge: 28,
        endAge: 37,
        startYear: 2021,
        endYear: 2030,
        sixtyCycle: '甲子',
        active: true,
      },
    ],
    annualCycles: [
      { year: 2025, yearCycle: '乙巳', age: 33, decadeFortune: '甲子', annualFortune: '乙巳' },
      { year: 2026, yearCycle: '丙午', age: 34, decadeFortune: '甲子', annualFortune: '丙午' },
      { year: 2027, yearCycle: '丁未', age: 35, decadeFortune: '甲子', annualFortune: '丁未' },
    ],
    reportSeed: {
      pillars: createBaseReport().pillars ?? [],
      elements: createBaseReport().elements ?? [],
      tenGods: createBaseReport().tenGods ?? [],
      timeline: [
        {
          year: 2025,
          title: '乙巳年 · 运势解读',
          summary: '当前处于甲子大运，适合顺着已有积累放大成果。',
          detail: {
            opportunities: ['顺着甲子大运做长期布局'],
            risks: ['避免阶段性节奏过满'],
            actions: ['把关键目标收敛到一到两个重点'],
          },
        },
        {
          year: 2026,
          title: '丙午年 · 运势解读',
          summary: '外部曝光与执行力会一起增强，但也更考验节奏。',
          detail: {
            opportunities: ['适合启动更主动的表达与推进'],
            risks: ['容易因为贪快而透支'],
            actions: ['把节奏切成季度目标'],
          },
        },
        {
          year: 2027,
          title: '丁未年 · 运势解读',
          summary: '更适合沉淀结构和把前两年的成果做整合。',
          detail: {
            opportunities: ['适合整理方法论与沉淀资产'],
            risks: ['别把压力全压回自己身上'],
            actions: ['给关系与身体留出恢复窗口'],
          },
        },
      ],
    },
  };
}

describe('ChartCenterPanel', () => {
  it('有正式五维与五域数据时渲染新版卡片内容', () => {
    const report: PartialDestinyReport = {
      ...createBaseReport(),
      lifeDimensions: [
        {
          key: 'career',
          label: '事业',
          value: 72,
          summary: '事业节奏偏快，适合主动争取窗口期。',
        },
        { key: 'wealth', label: '财运', value: 68, summary: '求财宜稳，适合长期配置。' },
        { key: 'health', label: '健康', value: 61, summary: '精力中等，注意作息恢复。' },
        { key: 'love', label: '感情', value: 56, summary: '情感表达偏内敛，宜慢慢建立信任。' },
        {
          key: 'wisdom',
          label: '智慧/创造',
          value: 74,
          summary: '学习与复盘能力不错，越做越稳。',
        },
      ],
      lifeDimensionHighlights: {
        strength: '印星与官星配合得稳，做事抗风险、能沉住气，越到后期越容易靠积累见成效。',
        caution: '木气偏旺时容易把压力憋在心里，情绪和作息一乱，健康与关系都容易一起受影响。',
      },
      tenGodDomains: [
        {
          key: 'self',
          label: '自我与社交',
          technicalLabel: '比肩/劫财',
          value: 18,
          description: '有主见，但不会为了证明自己而频繁硬碰硬。',
        },
        {
          key: 'expression',
          label: '创造与表达',
          technicalLabel: '食神/伤官',
          value: 25,
          description: '熟悉场景里表达力会更自然，也更容易用创意换来机会。',
        },
        {
          key: 'wealth',
          label: '物质与掌控',
          technicalLabel: '正财/偏财',
          value: 52,
          description: '对资源流向比较敏感，适合长期配置而不是短线冲动。',
        },
        {
          key: 'order',
          label: '秩序与责任',
          technicalLabel: '正官/七杀',
          value: 23,
          description: '关键节点时愿意扛事，对结果与边界感比较在意。',
        },
        {
          key: 'resource',
          label: '资源与守护',
          technicalLabel: '正印/偏印',
          value: 32,
          description: '学习吸收和复盘能力不错，越做越稳。',
        },
      ],
    };

    render(<ChartCenterPanel report={report} />);

    expect(screen.getByText('人生五维')).toBeInTheDocument();
    expect(screen.getByText(/怎么读数字/)).toBeInTheDocument();
    expect(screen.getByText(/事业节奏偏快/)).toBeInTheDocument();
    expect(screen.getByText('十神能量结构')).toBeInTheDocument();
    expect(screen.getByText(/上方「十神」看做事习惯/)).toBeInTheDocument();
    expect(screen.queryByText(/五维小结 · 优势/)).not.toBeInTheDocument();
    expect(screen.queryByText(/印星与官星配合得稳/)).not.toBeInTheDocument();
    expect(screen.getByText(/自我与社交/)).toBeInTheDocument();
    expect(screen.getAllByText('智慧/创造').length).toBeGreaterThan(0);
  });

  it('缺失正式五维与五域数据时保持骨架态', () => {
    render(<ChartCenterPanel report={createBaseReport()} />);

    expect(screen.getByTestId('life-dimensions-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('ten-god-domains-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('自我与社交')).not.toBeInTheDocument();
  });

  it('存在 baziBasis 时默认紧凑展示并可展开校正与藏干明细', () => {
    render(<ChartCenterPanel report={{ ...createBaseReport(), baziBasis: createBaziBasis() }} />);

    expect(screen.getByText(/已按出生地校正真太阳时/)).toBeInTheDocument();
    expect(screen.queryByText('排盘时间链')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /查看校正明细/ }));
    expect(screen.getByText('排盘时间链')).toBeInTheDocument();
    expect(screen.getByText('节气上下文')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /藏干与岁运/ }));
    expect(screen.getByText('未来三年岁运')).toBeInTheDocument();
    expect(screen.getByText(/已按东八区标准经线 120E 做经度修正/)).toBeInTheDocument();
  });
});
