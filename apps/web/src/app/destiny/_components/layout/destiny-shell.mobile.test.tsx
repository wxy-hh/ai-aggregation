import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DestinyShell } from './destiny-shell';
import type { DestinyReport } from '../types';

vi.mock('../reports/report-right-rail', () => ({
  ReportRightRail: () => <div>报告内容区域</div>,
}));

vi.mock('../visualization/chart-center-panel', () => ({
  ChartCenterPanel: () => <div>命盘主视图</div>,
}));

const mockReport: DestinyReport = {
  profile: {
    name: '位可可',
    genderLabel: '女',
    birthText: '农历二〇〇一年正月初一 午时',
    locationText: '鹿邑县任集乡',
  },
  pillars: [
    { label: '年柱', stem: '辛', branch: '巳', element: 'metal', tooltip: '年柱提示' },
    { label: '月柱', stem: '庚', branch: '寅', element: 'metal', tooltip: '月柱提示' },
    { label: '日柱', stem: '己', branch: '亥', element: 'water', tooltip: '日柱提示' },
    { label: '时柱', stem: '庚', branch: '午', element: 'metal', tooltip: '时柱提示' },
  ],
  tenGods: [
    { key: 'piancai', label: '偏财', value: 25, tooltip: '偏财提示' },
    { key: 'zhengcai', label: '正财', value: 25, tooltip: '正财提示' },
  ],
  elements: [
    { key: 'metal', label: '金', value: 70 },
    { key: 'water', label: '水', value: 55 },
  ],
  modules: {
    career: { title: '事业', summary: '事业摘要', bullets: ['建议一'] },
    love: { title: '感情', summary: '感情摘要', bullets: ['建议二'] },
    wealth: { title: '财运', summary: '财运摘要', bullets: ['建议三'] },
    health: { title: '健康', summary: '健康摘要', bullets: ['建议四'] },
    personality: { title: '性格', summary: '性格摘要', bullets: ['建议五'] },
  },
  timeline: [
    {
      year: 2026,
      title: '丙午',
      summary: '流年摘要',
      detail: { opportunities: ['机会'], risks: ['风险'], actions: ['行动'] },
    },
  ],
};

describe('DestinyShell mobile report drawer', () => {
  it('移动端点击查看报告后展示报告内容', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 375,
    });

    render(
      <DestinyShell
        report={mockReport}
        title="AI 命理大师"
        subtitleTag="八字格局精批"
        onRecalculate={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看报告' }));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('报告内容区域')).toBeInTheDocument();
    });
  });
});
