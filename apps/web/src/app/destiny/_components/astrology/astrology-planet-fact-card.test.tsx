/**
 * astrology-planet-fact-card.test.tsx —— 星体深度解构卡深组件单元测试
 *
 * 锁定的外部行为：
 * - 渲染星体名称、所落星座、度数、主题与自派生的日/月要素建议；
 * - 渲染逆行状态标签；
 * - 点击快速切换星体胶囊触发 onSelectBody；
 * - 点击生活模块芯片触发 onLocateModule（由 facts 与 modules 反查得出）；
 * - 点击关闭按钮触发 onClose；
 * - 关联相位过滤：仅展示与当前星体关联且 stable 的相位；
 * - 非日/月星体（如水星）无 SUN/MOON_READINGS 时不渲染要素建议区块；
 * - 防御性测试：placement 为空时安全渲染 null。
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { findSignPlacement, PlanetFactCard } from './astrology-planet-fact-card';
import type { PlanetFactCardProps } from './astrology-planet-fact-card';
import type { AstrologyChartFacts } from '@/lib/astrology/chart-facts';
import type { ModuleReading } from '@/lib/astrology/interpretation';

const BASE_FACTS = {
  planets: [
    {
      body: 'sun',
      sign: 'aries',
      degree: 15.5,
      house: 1,
      retrograde: false,
      stability: 'stable',
    },
    {
      body: 'moon',
      sign: 'taurus',
      degree: 20.0,
      house: 2,
      retrograde: false,
      stability: 'stable',
    },
    {
      body: 'mercury',
      sign: 'gemini',
      degree: 5.0,
      house: 3,
      retrograde: false,
      stability: 'stable',
    },
  ],
  aspects: [
    {
      source: 'sun',
      target: 'moon',
      type: 'trine',
      orb: 1.2,
      strength: 0.9,
      stability: 'stable',
    },
    {
      source: 'sun',
      target: 'mercury',
      type: 'sextile',
      orb: 2.0,
      strength: 0.8,
      stability: 'unstable',
    },
    {
      source: 'moon',
      target: 'mercury',
      type: 'square',
      orb: 0.5,
      strength: 0.95,
      stability: 'stable',
    },
  ],
} as unknown as AstrologyChartFacts;

const BASE_MODULES: ModuleReading[] = [
  {
    id: 'who',
    title: '真我本色',
    summary: '核心特质解析',
    tags: ['特质'],
    action: '积极面对',
    factReferences: ['planet:sun:sign'],
  },
];

const BASE_PROPS: PlanetFactCardProps = {
  body: 'sun',
  facts: BASE_FACTS,
  modules: BASE_MODULES,
  onSelectBody: vi.fn(),
  onLocateModule: vi.fn(),
  onClose: vi.fn(),
};

describe('PlanetFactCard', () => {
  it('正确渲染星体核心信息、度数、主题与自派生的要素建议', () => {
    render(<PlanetFactCard {...BASE_PROPS} />);

    expect(screen.getByText(/太阳 · 白羊座/)).toBeInTheDocument();
    expect(screen.getByText('15°30′')).toBeInTheDocument();
    expect(screen.getByText(/第 1 宫/)).toBeInTheDocument();
    expect(screen.getByText('你习惯先做再说，冲在前面是你的舒适区。')).toBeInTheDocument();
    expect(screen.getByText(/练习在开口前先数三秒/)).toBeInTheDocument();
  });

  it('渲染逆行状态标签', () => {
    const retrogradeFacts = {
      ...BASE_FACTS,
      planets: BASE_FACTS.planets.map((p) =>
        p.body === 'sun' ? { ...p, retrograde: true } : p
      ),
    } as unknown as AstrologyChartFacts;

    render(<PlanetFactCard {...BASE_PROPS} facts={retrogradeFacts} />);
    expect(screen.getByText('逆行中')).toBeInTheDocument();
  });

  it('点击快速切换星体胶囊触发 onSelectBody', () => {
    const onSelectBody = vi.fn();
    render(<PlanetFactCard {...BASE_PROPS} onSelectBody={onSelectBody} />);

    // 找到月亮胶囊按钮
    const moonButton = screen.getByTitle('月亮在金牛座');
    fireEvent.click(moonButton);
    expect(onSelectBody).toHaveBeenCalledWith('moon');
  });

  it('点击生活模块引用按钮触发 onLocateModule（验证 relatedModuleIds 由 facts+modules 反查得出）', () => {
    const onLocateModule = vi.fn();
    render(<PlanetFactCard {...BASE_PROPS} onLocateModule={onLocateModule} />);

    const moduleChip = screen.getByText('真我本色');
    fireEvent.click(moduleChip);
    expect(onLocateModule).toHaveBeenCalledWith('who');
  });

  it('点击关闭按钮触发 onClose', () => {
    const onClose = vi.fn();
    render(<PlanetFactCard {...BASE_PROPS} onClose={onClose} />);

    const closeBtn = screen.getByLabelText('关闭事实卡');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('内收关联相位：只显示与当前星体相连且稳定（stable）的相位', () => {
    render(<PlanetFactCard {...BASE_PROPS} />);

    // 稳定且关联太阳的相位（sun-moon trine）应渲染
    expect(screen.getByText(/与月亮拱相/)).toBeInTheDocument();

    // 不稳定的相位（sun-mercury sextile unstable）不应渲染
    expect(screen.queryByText(/与水星六合/)).not.toBeInTheDocument();

    // 未关联太阳的相位（moon-mercury square）不应渲染
    expect(screen.queryByText(/刑相/)).not.toBeInTheDocument();
  });

  it('非日/月星体无 SUN/MOON_READINGS 时不渲染要素建议区块', () => {
    render(<PlanetFactCard {...BASE_PROPS} body="mercury" />);

    // 水星核心信息正常展示
    expect(screen.getByText(/水星 · 双子座/)).toBeInTheDocument();

    // 建议区块文本不应出现
    expect(screen.queryByText(/^建议：/)).not.toBeInTheDocument();
  });

  it('当 placement 为空时防御性渲染 null 而不崩溃', () => {
    const emptyFacts = {
      ...BASE_FACTS,
      planets: [],
    } as unknown as AstrologyChartFacts;
    const { container } = render(
      <PlanetFactCard {...BASE_PROPS} facts={emptyFacts} />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('findSignPlacement', () => {
  it('正确查找 sign 非空的星体落位，不存在或 sign 为空时返回 null', () => {
    const facts = {
      planets: [
        { body: 'sun', sign: 'aries' },
        { body: 'moon', sign: null },
      ],
    } as unknown as AstrologyChartFacts;

    expect(findSignPlacement(facts, 'sun')).toEqual({ body: 'sun', sign: 'aries' });
    expect(findSignPlacement(facts, 'moon')).toBeNull();
    expect(findSignPlacement(facts, 'mars')).toBeNull();
  });
});
