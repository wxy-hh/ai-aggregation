import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompatibilityReportView } from './compatibility-report';
import type {
  CompatibilityReport,
  CompatibilityViewPayload,
  RelationType,
} from '../types';

vi.mock('@/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => true,
}));

function makeView(
  relationType: RelationType,
  overrides?: Partial<CompatibilityViewPayload>
): CompatibilityViewPayload {
  return {
    relationType,
    oneLiner: `${relationType} 一句话总结`,
    needs: {
      self: [{ text: `${relationType}-我需求`, why: 'why-self' }],
      partner: [{ text: `${relationType}-TA需求`, why: 'why-partner' }],
    },
    attractions: [
      { title: `${relationType}-吸引`, detail: '吸引细节', why: 'why-attr' },
    ],
    frictions: [
      {
        trigger: `${relationType}-摩擦触发`,
        reaction: '反应',
        action: '行动建议',
        why: 'why-fric',
      },
    ],
    dimensions: [
      { key: 'expression', label: '情感表达', value: 72 },
      { key: 'pace', label: '沟通节奏', value: 65 },
      { key: 'intimacy', label: '亲密需求', value: 58 },
      { key: 'practical', label: '现实协作', value: 61 },
      { key: 'repair', label: '冲突修复', value: 70 },
      { key: 'stability', label: '关系稳定感', value: 68 },
      { key: 'chores', label: '日常分工', value: 55 },
      { key: 'finance', label: '财务协作', value: 60 },
      { key: 'boundary', label: '家庭边界', value: 63 },
      { key: 'bond', label: '情感连接', value: 66 },
      { key: 'vision', label: '共同愿景', value: 64 },
      { key: 'trust', label: '信任感', value: 71 },
      { key: 'contact', label: '联系节奏', value: 59 },
      { key: 'support', label: '情绪支持', value: 62 },
      { key: 'interest', label: '共同兴趣', value: 57 },
      { key: 'alignment', label: '目标对齐', value: 74 },
      { key: 'decision', label: '决策节奏', value: 69 },
      { key: 'execution', label: '执行推进', value: 73 },
      { key: 'feedback', label: '反馈方式', value: 56 },
      { key: 'risk', label: '风险共识', value: 52 },
      { key: 'credit', label: '利益与信用边界', value: 67 },
    ],
    rhythm: [
      { when: '近 3 个月', tone: 'warm', advice: '升温期建议' },
      { when: '3–9 个月', tone: 'patience', advice: '耐心期建议' },
      { when: '9–12 个月', tone: 'advance', advice: '推进期建议' },
    ],
    weeklyActions: [{ id: `${relationType}-act-1`, text: `${relationType} 本周动作` }],
    disclaimers: ['仅供传统文化参考'],
    ...overrides,
  };
}

function makeReport(
  views: Partial<Record<RelationType, CompatibilityViewPayload>>
): CompatibilityReport {
  return {
    id: 'test-report',
    relationType: 'romance',
    focusTags: ['如何靠近'],
    partnerDisplayName: '小雨',
    createdAt: '2026-07-28T00:00:00.000Z',
    chartFacts: {
      self: {
        name: '我',
        dayMaster: '甲',
        dayMasterElement: 'wood',
        pillars: [],
        elements: [],
      },
      partner: {
        name: '小雨',
        dayMaster: '庚',
        dayMasterElement: 'metal',
        pillars: [],
        elements: [],
        hasHourPillar: true,
      },
      completeness: {
        self: 'full',
        partner: 'full',
        labels: [],
      },
      score: 78,
      scoreBand: 'high',
      scoreHints: ['日主 complementary'],
    },
    views,
  };
}

const noop = () => undefined;

describe('CompatibilityReportView 四类关系差异化', () => {
  it('恋爱视角展示心跳节奏与靠近方式文案', () => {
    render(
      <CompatibilityReportView
        report={makeReport({ romance: makeView('romance') })}
        activeRelation="romance"
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={noop}
        onToggleAction={noop}
        onRefill={noop}
      />
    );

    expect(screen.getByText('恋爱靠近方式')).toBeInTheDocument();
    expect(screen.getByText('靠近节奏心跳')).toBeInTheDocument();
    expect(screen.getByText('恋爱默契图谱')).toBeInTheDocument();
    expect(screen.getByText('你们如何感到被爱')).toBeInTheDocument();
    expect(screen.getByText('今天就能靠近一点')).toBeInTheDocument();
    expect(screen.getByText('romance 一句话总结')).toBeInTheDocument();
    // 方案 B：中心展示适配标签 + 命盘底分（禁止「手感」）
    expect(screen.getByText('合拍指数')).toBeInTheDocument();
    expect(screen.getByLabelText(/命盘底分 82/)).toBeInTheDocument();
    // 子分同口径标定：情感表达 raw 72 → 展示 77；raw 低值 52 不再直接出现
    expect(screen.getByText('77')).toBeInTheDocument();
    expect(screen.queryByText('52')).not.toBeInTheDocument();
  });

  it('婚姻视角展示经营看板与中长期节奏', () => {
    render(
      <CompatibilityReportView
        report={makeReport({ marriage: makeView('marriage') })}
        activeRelation="marriage"
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={noop}
        onToggleAction={noop}
        onRefill={noop}
      />
    );

    expect(screen.getByText('共同生活经营')).toBeInTheDocument();
    expect(screen.getByText('生活经营看板')).toBeInTheDocument();
    expect(screen.getByText('中长期生活节奏')).toBeInTheDocument();
    expect(screen.getByText('你们怎样把日子过顺')).toBeInTheDocument();
    expect(screen.getByText('容易卡住的日常')).toBeInTheDocument();
    expect(screen.getByText('本周可落地的一件家事')).toBeInTheDocument();
  });

  it('朋友视角展示社交卡片与边界语感', () => {
    render(
      <CompatibilityReportView
        report={makeReport({ friendship: makeView('friendship') })}
        activeRelation="friendship"
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={noop}
        onToggleAction={noop}
        onRefill={noop}
      />
    );

    expect(screen.getByText(/轻松相处/)).toBeInTheDocument();
    expect(screen.getByText('为什么合得来')).toBeInTheDocument();
    expect(screen.getByText('联系与充电节奏')).toBeInTheDocument();
    expect(screen.getByText('别把友谊处成负担')).toBeInTheDocument();
    expect(screen.getByText('本周轻松联系一次')).toBeInTheDocument();
  });

  it('合作视角展示矩阵仪表盘与 KPI 摘要', () => {
    render(
      <CompatibilityReportView
        report={makeReport({ partnership: makeView('partnership') })}
        activeRelation="partnership"
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={noop}
        onToggleAction={noop}
        onRefill={noop}
      />
    );

    expect(screen.getByText('协作决策台')).toBeInTheDocument();
    expect(screen.getByText('协作能力矩阵')).toBeInTheDocument();
    expect(screen.getAllByText('互补战力').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('首要风险边界')).toBeInTheDocument();
    expect(screen.getByText('谁更适合负责什么')).toBeInTheDocument();
    expect(screen.getByText('本周可推进的协作动作')).toBeInTheDocument();
  });

  it('未缓存视角点击后直接回调 onRelationChange，无二次确认条', () => {
    const onRelationChange = vi.fn();
    render(
      <CompatibilityReportView
        report={makeReport({ romance: makeView('romance') })}
        activeRelation="romance"
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={onRelationChange}
        onToggleAction={noop}
        onRefill={noop}
      />
    );

    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: '婚姻' }));

    expect(onRelationChange).toHaveBeenCalledWith('marriage');
    expect(
      screen.queryByText(/以「婚姻」视角重新组织你们已有命盘/)
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认生成' })).not.toBeInTheDocument();
  });

  it('loadingView 时展示目标视角特色 loading', () => {
    render(
      <CompatibilityReportView
        report={makeReport({ romance: makeView('romance') })}
        activeRelation="friendship"
        loadingView
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={noop}
        onToggleAction={noop}
        onRefill={noop}
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('正在整理相处舒适度')).toBeInTheDocument();
    expect(screen.queryByText(/不额外扣费/)).not.toBeInTheDocument();
    expect(screen.getByText(/朋友 · 视角切换/)).toBeInTheDocument();
  });

  it('已缓存视角点击直接切换', () => {
    const onRelationChange = vi.fn();
    render(
      <CompatibilityReportView
        report={makeReport({
          romance: makeView('romance'),
          marriage: makeView('marriage'),
        })}
        activeRelation="romance"
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={onRelationChange}
        onToggleAction={noop}
        onRefill={noop}
      />
    );

    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: '婚姻' }));

    expect(onRelationChange).toHaveBeenCalledWith('marriage');
  });

  it('方案 B：同一底分下不同视角展示差异化适配标签与底分对照', () => {
    const romance = render(
      <CompatibilityReportView
        report={makeReport({ romance: makeView('romance') })}
        activeRelation="romance"
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={noop}
        onToggleAction={noop}
        onRefill={noop}
      />
    );
    expect(screen.getByText('合拍指数')).toBeInTheDocument();
    expect(screen.getByLabelText(/命盘底分 82/)).toBeInTheDocument();
    romance.unmount();

    const friendship = render(
      <CompatibilityReportView
        report={makeReport({ friendship: makeView('friendship') })}
        activeRelation="friendship"
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={noop}
        onToggleAction={noop}
        onRefill={noop}
      />
    );
    expect(screen.getByText('相处舒适度')).toBeInTheDocument();
    expect(screen.getByLabelText(/命盘底分 82/)).toBeInTheDocument();
    friendship.unmount();

    render(
      <CompatibilityReportView
        report={makeReport({ partnership: makeView('partnership') })}
        activeRelation="partnership"
        onBack={noop}
        onOpenMyBazi={noop}
        onRelationChange={noop}
        onToggleAction={noop}
        onRefill={noop}
      />
    );
    expect(screen.getByText('协作指数')).toBeInTheDocument();
    expect(screen.getByLabelText(/命盘底分 82/)).toBeInTheDocument();
  });
});
