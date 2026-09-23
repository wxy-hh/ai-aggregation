/**
 * astrology-ritual.test.tsx —— 加载仪式：四段进度由真实报告流事件驱动（02 建节奏，03 定转场）
 *
 * 锁定的外部行为：
 * - 真值未到：仪式窗走满也不转场，如实显示「最后校准中…」（不虚构完成态）；
 * - 真值已到即转场（设计文档 §6.4：真值锁定就进结果页，不等待 AI 全文；
 *   解读分区在结果页流式浮现，本票起不再把仪式挂在解读结论上）；
 * - 解读降级先到时，第四段如实收尾（不写「已整理完成」）；
 * - 最小仪式窗（3.2s）保留：真值在手也要等窗满才转场。
 *
 * 结果树（AstrologyResultView）在测试里替换为哨兵节点：本文件只验证转场闸门与进度文案。
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./astrology-result-view', () => ({
  AstrologyResultView: () => <div data-testid="astrology-result-view" />,
}));

import { AstrologyRitualResult, ASTROLOGY_RITUAL_TIMING } from './astrology-ritual';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import type { AstrologyInterpretationState } from '@/stores/destiny-workspace-store';
import { SAMPLE_CHART_ACCURATE } from '@/lib/astrology/sample-chart';

/** 最小仪式窗与第四段揭幕时刻：与组件同一来源（ASTROLOGY_RITUAL_TIMING），不再各自双写 */
const WINDOW_END_MS = ASTROLOGY_RITUAL_TIMING.WINDOW_END_AT;
const STAGE_4_MS = ASTROLOGY_RITUAL_TIMING.STAGE_4_AT;

function primeWorkspace(patch: {
  chartFacts?: typeof SAMPLE_CHART_ACCURATE | null;
  interpretation?: AstrologyInterpretationState;
}) {
  useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', {
    step: 'form',
    entryView: 'loading',
    chartFacts: patch.chartFacts ?? null,
    interpretation: patch.interpretation ?? { status: 'pending', reason: null, report: null },
    error: null,
    errorKind: null,
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('AstrologyRitualResult（仪式转场闸门）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
  });

  afterEach(() => {
    vi.useRealTimers();
    useDestinyWorkspaceStore.getState().resetWorkspace('astrology');
  });

  it('真值未到：仪式窗走满也不转场，如实显示最后校准中', () => {
    primeWorkspace({ chartFacts: null });
    render(<AstrologyRitualResult />);

    advance(WINDOW_END_MS + 200);

    expect(useDestinyWorkspaceStore.getState().astrology.step).toBe('form');
    // 「最后校准中…」同时出现在等待室提示与读屏活体区
    expect(screen.getAllByText('最后校准中…').length).toBeGreaterThan(0);
    // 真值未到不得亮起第四段：第四段文案仍是「进行中」口径
    expect(screen.getByText('AI 正在基于星盘事实整理宇宙重点')).toBeInTheDocument();
  });

  it('真值在途：轮盘位先立起「绘制中」的仪器本体（不是空心圆），真值到后由星盘轮接管', () => {
    primeWorkspace({ chartFacts: null });
    const { rerender } = render(<AstrologyRitualResult />);

    // 真值未到：仪器框架（深空盘面 + 黄道环 + 星座符号）已在，轮盘位不是空白
    expect(screen.getByTestId('astrology-wheel-frame')).toBeInTheDocument();
    expect(screen.queryByLabelText('本命星盘')).toBeNull();

    // 真值到达：框架让位给真正的星盘轮
    act(() => {
      useDestinyWorkspaceStore.getState().setWorkspaceState('astrology', { chartFacts: SAMPLE_CHART_ACCURATE });
    });
    rerender(<AstrologyRitualResult />);
    expect(screen.queryByTestId('astrology-wheel-frame')).toBeNull();
    expect(screen.getByLabelText('本命星盘')).toBeInTheDocument();
  });

  it('真值已到即转场（不等待解读全文）：解读在途时也照常进结果页', () => {
    primeWorkspace({
      chartFacts: SAMPLE_CHART_ACCURATE,
      interpretation: { status: 'pending', reason: null, report: null },
    });
    render(<AstrologyRitualResult />);

    advance(WINDOW_END_MS + 200);

    expect(useDestinyWorkspaceStore.getState().astrology.step).toBe('result');
  });

  it('最小仪式窗保留：真值在手，也要等窗满才转场', () => {
    primeWorkspace({
      chartFacts: SAMPLE_CHART_ACCURATE,
      interpretation: { status: 'unavailable', reason: 'not-wired', report: null },
    });
    render(<AstrologyRitualResult />);

    advance(WINDOW_END_MS - 400);
    expect(useDestinyWorkspaceStore.getState().astrology.step).toBe('form');

    advance(400);
    expect(useDestinyWorkspaceStore.getState().astrology.step).toBe('result');
  });

  it('解读降级：第四段如实收尾，不写「已整理完成」', () => {
    primeWorkspace({
      chartFacts: SAMPLE_CHART_ACCURATE,
      interpretation: { status: 'unavailable', reason: 'quota', report: null },
    });
    render(<AstrologyRitualResult />);

    advance(STAGE_4_MS);

    expect(screen.getByText('宇宙重点整理暂不可用')).toBeInTheDocument();
    expect(screen.queryByText('宇宙重点已整理完成')).toBeNull();
  });

  it('真实进度：无宫位盘第三段文案为「整理行星位置与关键相位」', () => {
    primeWorkspace({
      chartFacts: {
        ...SAMPLE_CHART_ACCURATE,
        dataCompleteness: 'without-houses',
        houseSystem: null,
        houses: [],
      },
      interpretation: { status: 'unavailable', reason: 'not-wired', report: null },
    });
    render(<AstrologyRitualResult />);

    advance(STAGE_4_MS);

    expect(screen.getByText('系统已整理行星位置与关键相位')).toBeInTheDocument();
    expect(screen.queryByText(/十二宫/)).toBeNull();
  });
});
