import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AstrologyChartWheel } from './astrology-chart-wheel';
import { AstrologyAspectsPanel } from './astrology-aspects-panel';
import type { ChartFacts } from './astrology-types';

function makeFacts(): ChartFacts {
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
    houses: [{ number: 1, cuspLongitude: 180, zodiacSign: 'libra', label: '命宫' }],
    aspects: [
      { planetA: 'sun', planetB: 'moon', type: 'square', angle: 90, orb: 1, applying: true },
      { planetA: 'sun', planetB: 'moon', type: 'trine', angle: 120, orb: 3, applying: true },
    ],
  };
}

describe('AstrologyChartWheel', () => {
  it('提供行星落点等价文本清单', () => {
    render(<AstrologyChartWheel chartFacts={makeFacts()} />);
    expect(screen.getByText('行星落点清单')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /太阳 · 金牛座/ })).toBeInTheDocument();
  });

  it('点选星体显示关联事实', () => {
    render(<AstrologyChartWheel chartFacts={makeFacts()} />);
    fireEvent.click(screen.getByRole('button', { name: /太阳 · 金牛座/ }));
    expect(screen.getByText(/太阳落金牛座/)).toBeInTheDocument();
  });

  it('文本清单按钮有 min-h-11 键盘可达热区', () => {
    render(<AstrologyChartWheel chartFacts={makeFacts()} />);
    const btn = screen.getByRole('button', { name: /太阳 · 金牛座/ });
    expect(btn.className).toContain('min-h-11');
  });
});

describe('AstrologyAspectsPanel', () => {
  it('关键相位含能量关系/生活表现/练习建议', () => {
    render(<AstrologyAspectsPanel aspects={makeFacts().aspects} />);
    expect(screen.getAllByText('能量关系：').length).toBeGreaterThan(0);
    expect(screen.getAllByText('练习建议：').length).toBeGreaterThan(0);
  });

  it('默认展示有限条数，可展开完整列表', () => {
    render(<AstrologyAspectsPanel aspects={makeFacts().aspects} initialCount={1} />);
    expect(screen.getByText(/展开完整列表/)).toBeInTheDocument();
  });
});
