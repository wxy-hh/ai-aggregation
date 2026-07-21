import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BaziShareCard } from './bazi-share-card';
import type { BaziShareCardData } from './share-card-data';

/** 白名单卡片数据（不含任何隐私字段，隐私剥离由 share-card-data.test.ts 覆盖） */
function createCardData(): BaziShareCardData {
  return {
    nickname: '测试用户',
    headline: '先稳后发，厚积见成',
    pillars: [
      { stem: '甲', branch: '子', label: '年柱', element: 'wood' },
      { stem: '丙', branch: '寅', label: '月柱', element: 'fire' },
      { stem: '戊', branch: '辰', label: '日柱', element: 'earth' },
      { stem: '庚', branch: '申', label: '时柱', element: 'metal' },
    ],
    dimensions: [
      { key: 'career', label: '事业', value: 88 },
      { key: 'love', label: '感情', value: 54 },
      { key: 'wealth', label: '财运', value: 44 },
      { key: 'wisdom', label: '智慧', value: 44 },
      { key: 'health', label: '健康', value: 59 },
    ],
    shareUrl: 'https://example.com/destiny?utm_source=share_card&utm_medium=qrcode&utm_campaign=bazi',
  };
}

describe('BaziShareCard', () => {
  it('渲染白名单内容：昵称、钩子、四柱干支、五维与二维码', () => {
    render(<BaziShareCard data={createCardData()} qrDataUrl="data:image/png;base64,qr" />);

    expect(screen.getByText(/测试用户 的八字命盘/)).toBeInTheDocument();
    expect(screen.getByText(/先稳后发，厚积见成/)).toBeInTheDocument();
    // 四柱干支与日主标识
    expect(screen.getByText('日主')).toBeInTheDocument();
    expect(screen.getByText('年柱')).toBeInTheDocument();
    expect(screen.getByText('时柱')).toBeInTheDocument();
    // 五维指数
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('事业')).toBeInTheDocument();
    // 二维码
    expect(screen.getByAltText('扫码测算八字')).toHaveAttribute(
      'src',
      'data:image/png;base64,qr'
    );
  });

  it('卡片不包含出生时间、地点等隐私提示文案', () => {
    const { container } = render(
      <BaziShareCard data={createCardData()} qrDataUrl="data:image/png;base64,qr" />
    );
    // 卡片为纯展示组件，不接受 profile；此处防御性确认渲染结果无隐私字样
    expect(container.textContent).not.toMatch(/出生|农历|地点|男命|女命/);
  });
});
