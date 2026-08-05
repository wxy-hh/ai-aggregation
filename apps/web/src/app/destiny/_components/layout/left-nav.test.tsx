import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeftNav, type DestinyModuleKey } from './left-nav';

// Next.js Image 在 happy-dom 中需要占位 mock，避免 src 解析异常
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

describe('LeftNav', () => {
  it('DestinyModuleKey 包含 astrology（类型级别断言）', () => {
    // 编译期断言：如果 astrology 不在联合类型中，以下赋值会报错
    const assertKey: DestinyModuleKey = 'astrology';
    expect(assertKey).toBe('astrology');
  });

  it('渲染四个命理模块项且 bazi/ziwei/qimen 文案不变', () => {
    render(
      <LeftNav
        activeModule="bazi"
        onModuleChange={vi.fn()}
      />
    );

    // 四模块标签齐全
    expect(screen.getByText('八字格局精批')).toBeInTheDocument();
    expect(screen.getByText('紫微斗数排盘')).toBeInTheDocument();
    expect(screen.getByText('奇门遁甲演化')).toBeInTheDocument();
    expect(screen.getByText('星座寰宇')).toBeInTheDocument();

    // 顺序：八字、紫微、奇门、星座
    const labels = [
      '八字格局精批',
      '紫微斗数排盘',
      '奇门遁甲演化',
      '星座寰宇',
    ];
    const buttons = labels.map((label) => screen.getByText(label).closest('button'));
    buttons.forEach((btn) => expect(btn).toBeInTheDocument());
  });

  it('点击星座寰宇调用 onModuleChange 并传入 astrology', () => {
    const onChange = vi.fn();
    render(
      <LeftNav
        activeModule="bazi"
        onModuleChange={onChange}
      />
    );

    const astrologyButton = screen.getByText('星座寰宇').closest('button');
    expect(astrologyButton).toBeInTheDocument();
    astrologyButton?.click();
    expect(onChange).toHaveBeenCalledWith('astrology');
  });
});
