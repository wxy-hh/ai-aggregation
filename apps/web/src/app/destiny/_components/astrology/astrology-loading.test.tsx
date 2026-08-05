import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AstrologyLoading } from './astrology-loading';
import type { ChartFacts } from './astrology-types';

function makeFacts(withHouses: boolean): ChartFacts {
  return {
    version: 'test',
    calculatedAt: new Date().toISOString(),
    location: { name: '北京', lat: 39.9, lon: 116.4 },
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

describe('AstrologyLoading 四阶段加载', () => {
  it('含宫位第三阶段文案为「绘制十二宫」', () => {
    render(<AstrologyLoading stage={3} hasHouses chartFacts={makeFacts(true)} />);
    expect(screen.getByText('系统正在绘制十二宫与关键相位')).toBeInTheDocument();
  });

  it('无宫位第三阶段文案为「整理行星位置」且不出现「绘制十二宫」', () => {
    render(<AstrologyLoading stage={3} hasHouses={false} chartFacts={makeFacts(false)} />);
    expect(screen.getByText('系统正在整理行星位置与关键相位')).toBeInTheDocument();
    expect(screen.queryByText(/绘制十二宫/)).not.toBeInTheDocument();
  });

  it('前三段主语为系统，第四段才出现 AI', () => {
    render(<AstrologyLoading stage={4} hasHouses chartFacts={makeFacts(true)} />);
    expect(screen.getByText(/系统正在校准出生地/)).toBeInTheDocument();
    expect(screen.getByText(/AI 正在基于星盘事实整理宇宙重点/)).toBeInTheDocument();
  });

  it('无宫位显示范围徽章', () => {
    render(<AstrologyLoading stage={2} hasHouses={false} chartFacts={makeFacts(false)} />);
    expect(screen.getByText('无宫位行星盘')).toBeInTheDocument();
  });

  it('超时显示「解读仍在整理」与仅重试解读入口', () => {
    render(
      <AstrologyLoading stage={4} hasHouses chartFacts={makeFacts(true)} interpretingTooLong onRetryInterpretation={() => {}} />
    );
    expect(screen.getByText(/解读仍在整理/)).toBeInTheDocument();
    expect(screen.getByText('仅重新整理解读')).toBeInTheDocument();
  });

  it('进度通过 status 区向读屏宣布', () => {
    const { container } = render(<AstrologyLoading stage={2} hasHouses chartFacts={makeFacts(true)} />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });
});
