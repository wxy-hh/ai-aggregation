import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
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

describe('ChartCenterPanel', () => {
  it('有正式五维与五域数据时渲染新版卡片内容', () => {
    const report: PartialDestinyReport = {
      ...createBaseReport(),
      lifeDimensions: [
        { key: 'career', label: '事业', value: 72 },
        { key: 'wealth', label: '财运', value: 68 },
        { key: 'health', label: '健康', value: 61 },
        { key: 'love', label: '感情', value: 56 },
        { key: 'wisdom', label: '智慧/创造', value: 74 },
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

    expect(screen.getByText('人生五维摘要')).toBeInTheDocument();
    expect(screen.getByText('性格与潜能仪表盘')).toBeInTheDocument();
    expect(screen.getByText(/印星与官星配合得稳/)).toBeInTheDocument();
    expect(screen.getByText(/木气偏旺时容易把压力憋在心里/)).toBeInTheDocument();
    expect(screen.getByText(/自我与社交/)).toBeInTheDocument();
    expect(screen.getByText(/智慧\/创造/)).toBeInTheDocument();
  });

  it('缺失正式五维与五域数据时保持骨架态', () => {
    render(<ChartCenterPanel report={createBaseReport()} />);

    expect(screen.getByTestId('life-dimensions-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('ten-god-domains-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('自我与社交')).not.toBeInTheDocument();
  });
});
