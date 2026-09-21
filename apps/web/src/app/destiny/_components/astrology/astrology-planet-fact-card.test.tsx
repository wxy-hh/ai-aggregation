/**
 * astrology-planet-fact-card.test.tsx —— 星体深度解构卡深组件单元测试
 *
 * 锁定的外部行为：
 * - 渲染星体名称、所落星座、度数、主题与逆行标识；
 * - 渲染白话主句气泡与建议文本；
 * - 点击其他星体胶囊触发 onSelectBody；
 * - 点击生活模块芯片触发 onLocateModule；
 * - 点击关闭按钮触发 onClose。
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlanetFactCard } from './astrology-planet-fact-card';
import type { PlanetFactCardProps } from './astrology-planet-fact-card';

const BASE_PROPS: PlanetFactCardProps = {
  body: 'sun',
  placement: {
    body: 'sun',
    sign: 'aries',
    degree: 15.5,
    house: 1,
    retrograde: false,
    stability: 'stable',
  },
  reading: {
    plain: '充满生机与活力的行动力。',
    action: '主动出击，不要犹豫。',
  },
  aspects: [
    {
      source: 'sun',
      target: 'moon',
      type: 'trine',
      orb: 1.2,
      strength: 0.9,
      stability: 'stable',
    },
  ],
  relatedModuleIds: ['who'],
  modules: [
    {
      id: 'who',
      title: '真我本色',
      summary: '核心特质解析',
      tags: ['特质'],
      action: '积极面对',
      factReferences: ['planet:sun:sign'],
    },
  ],
  allPlanets: [
    { body: 'sun', sign: 'aries' },
    { body: 'moon', sign: 'taurus' },
  ],
  onSelectBody: vi.fn(),
  onLocateModule: vi.fn(),
  onClose: vi.fn(),
};

describe('PlanetFactCard', () => {
  it('正确渲染星体核心信息、度数、主题与要素建议', () => {
    render(<PlanetFactCard {...BASE_PROPS} />);

    expect(screen.getByText(/太阳 · 白羊座/)).toBeInTheDocument();
    expect(screen.getByText('15°30′')).toBeInTheDocument();
    expect(screen.getByText(/第 1 宫/)).toBeInTheDocument();
    expect(screen.getByText('充满生机与活力的行动力。')).toBeInTheDocument();
    expect(screen.getByText(/主动出击，不要犹豫/)).toBeInTheDocument();
  });

  it('渲染逆行状态标签', () => {
    render(
      <PlanetFactCard
        {...BASE_PROPS}
        placement={{ ...BASE_PROPS.placement, retrograde: true }}
      />
    );
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

  it('点击生活模块引用按钮触发 onLocateModule', () => {
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
});
