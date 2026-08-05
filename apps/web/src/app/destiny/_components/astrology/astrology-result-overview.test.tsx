import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AstrologyResultOverview } from './astrology-result-overview';
import type { ChartFacts, AstrologyReport } from './astrology-types';

function makeFacts(withHouses: boolean): ChartFacts {
  return {
    version: 'astro-0.1.0+orb-v1',
    calculatedAt: new Date().toISOString(),
    location: { name: '北京市', lat: 39.9, lon: 116.4 },
    birthTimestamp: '1990-05-15',
    bigThree: {
      sun: { sign: 'taurus', label: '金牛座' },
      moon: { sign: 'cancer', label: '巨蟹座' },
      ascendant: { sign: 'libra', label: '天秤座' },
    },
    planets: [
      { body: 'sun', longitude: 54, zodiacSign: 'taurus', isRetrograde: false, house: 8, label: '太阳' },
      { body: 'moon', longitude: 100, zodiacSign: 'cancer', isRetrograde: false, house: 10, label: '月亮' },
    ],
    houses: withHouses ? [{ number: 1, cuspLongitude: 180, zodiacSign: 'libra', label: '命宫' }] : [],
    aspects: [],
  };
}

function makeReport(): AstrologyReport {
  return {
    title: '星座寰宇 · 小宇的本命星盘',
    coreTone: '在稳定与自由之间，练习把感受说清楚。',
    summary: '',
    readings: [
      { key: 'self', title: '我是谁', summary: '核心气质结论', highlights: ['行动感强'] },
      { key: 'relationship', title: '关系如何运作', summary: '亲密需求结论', highlights: ['需要被理解'] },
      { key: 'career', title: '事业如何发挥', summary: '优势场景结论', highlights: ['独立推进'] },
    ],
    transits: [
      { period: '本周', title: '机会', summary: '', opportunities: ['适合主动争取'], challenges: [] },
      { period: '本周', title: '留意', summary: '', opportunities: ['注意沟通摩擦'], challenges: [] },
      { period: '本周', title: '行动', summary: '', opportunities: ['把想法写下来'], challenges: [] },
    ],
    disclaimer: '',
  };
}

describe('AstrologyResultOverview', () => {
  it('含宫位显示「大三要素」且含上升', () => {
    render(<AstrologyResultOverview chartFacts={makeFacts(true)} report={makeReport()} />);
    expect(screen.getByText('大三要素')).toBeInTheDocument();
    expect(screen.getByText(/上升落/)).toBeInTheDocument();
  });

  it('无宫位显示「核心要素」且不渲染上升占位', () => {
    render(<AstrologyResultOverview chartFacts={makeFacts(false)} report={makeReport()} />);
    expect(screen.getByText('核心要素')).toBeInTheDocument();
    expect(screen.queryByText(/上升落/)).not.toBeInTheDocument();
    expect(screen.getByText(/已隐藏上升/)).toBeInTheDocument();
  });

  it('显示一句主轴与生活模块', () => {
    render(<AstrologyResultOverview chartFacts={makeFacts(true)} report={makeReport()} />);
    expect(screen.getByText(/在稳定与自由之间/)).toBeInTheDocument();
    expect(screen.getByText('我是谁')).toBeInTheDocument();
    expect(screen.getByText('关系如何运作')).toBeInTheDocument();
  });

  it('显示本周行动三角（机会/留意/行动）', () => {
    render(<AstrologyResultOverview chartFacts={makeFacts(true)} report={makeReport()} />);
    expect(screen.getByText('本周宇宙提示')).toBeInTheDocument();
    expect(screen.getByText('适合主动争取')).toBeInTheDocument();
  });

  it('时间精度标签正确显示', () => {
    render(<AstrologyResultOverview chartFacts={makeFacts(true)} report={makeReport()} />);
    expect(screen.getByText(/时间精度：/)).toBeInTheDocument();
  });
});
