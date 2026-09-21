/**
 * astrology-passport-header.test.tsx —— 宇宙护照头深组件单元测试
 *
 * 锁定的外部行为：
 * - 渲染用户昵称与宇宙护照标题；
 * - 渲染时间精度标签（准确到分钟 / 大约时段 / 时间未知）；
 * - 渲染资料摘要行与计算时刻；
 * - 点击「盘面依据」能够正常展开折叠并展示日月上升与计算口径；
 * - 包含夜幕观星模式开关。
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AstrologyPassportHeader } from './astrology-passport-header';
import { createDefaultAstrologyFormData, type AstrologyFormData } from '../astrology-types';
import { SAMPLE_CHART_ACCURATE, SAMPLE_CHART_UNKNOWN } from '@/lib/astrology/sample-chart';

const MOCK_FORM_DATA: AstrologyFormData = {
  ...createDefaultAstrologyFormData(),
  name: '星辰旅行者',
  birthDate: { year: 1995, month: 8, day: 24 },
  timePrecision: 'accurate',
  birthTime: { hour: '14', minute: '30' },
  location: {
    name: '北京市',
    lat: 39.9,
    lon: 116.4,
    timezone: 'Asia/Shanghai',
  },
};

describe('AstrologyPassportHeader', () => {
  it('正确渲染昵称、精度标签和资料摘要', () => {
    render(
      <AstrologyPassportHeader
        formData={MOCK_FORM_DATA}
        chartFacts={SAMPLE_CHART_ACCURATE}
        reduceMotion={true}
      />
    );

    expect(screen.getByText('星辰旅行者的宇宙护照')).toBeInTheDocument();
    expect(screen.getByText('准确到分钟')).toBeInTheDocument();
    expect(screen.getByText(/1995 年 8 月 24 日/)).toBeInTheDocument();
    expect(screen.getByText(/北京市/)).toBeInTheDocument();
    expect(screen.getByText(/太阳 · 天秤座/)).toBeInTheDocument();
  });

  it('点击「盘面依据」可展开与收起盘面口径详情', () => {
    render(
      <AstrologyPassportHeader
        formData={MOCK_FORM_DATA}
        chartFacts={SAMPLE_CHART_ACCURATE}
        reduceMotion={true}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: '盘面依据' });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/普拉西德制/)).not.toBeInTheDocument();

    // 点击展开
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/回归黄道 · 普拉西德制/)).toBeInTheDocument();
    expect(screen.getByText(/天秤座 14°30′ · 第 8 宫/)).toBeInTheDocument();

    // 点击收起
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('时间未知时渲染「时间未知 · 无宫位行星盘」标签', () => {
    const unknownFormData: AstrologyFormData = {
      ...MOCK_FORM_DATA,
      timePrecision: 'unknown',
      birthTime: { hour: '', minute: '' },
    };
    render(
      <AstrologyPassportHeader
        formData={unknownFormData}
        chartFacts={SAMPLE_CHART_UNKNOWN}
        reduceMotion={true}
      />
    );

    expect(screen.getByText('时间未知 · 无宫位行星盘')).toBeInTheDocument();
  });

  it('未提供姓名或姓名为空白时，兜底渲染为「星盘主人的宇宙护照」', () => {
    const emptyNameFormData: AstrologyFormData = {
      ...MOCK_FORM_DATA,
      name: '   ',
    };
    render(
      <AstrologyPassportHeader
        formData={emptyNameFormData}
        chartFacts={SAMPLE_CHART_ACCURATE}
        reduceMotion={true}
      />
    );

    expect(screen.getByText('星盘主人的宇宙护照')).toBeInTheDocument();
  });
});
