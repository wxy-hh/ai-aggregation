/**
 * destiny-workspace-store.ziwei.test.ts —— 紫微斗数工作区具名 Action 契约测试
 *
 * 验证收口的 7 个紫微具名 action 状态转移规范与不变式（TC07 & 契约防线）：
 * 1. applyZiweiSection('chartData', mockChart)：chartData 解包且 lockedSections 记录
 * 2. applyZiweiSection('palaceAnalysis', [{label:'夫妻'},{label:'命宫'}])：首 label 自动聚焦
 * 3. 同 key 二次 section 到达被迟到保护拒绝（保留首个 payload）
 * 4. beginZiweiSession：全量重置为初始会话态，tab='overview'、activePalaceLabel='命宫'、chartData=null
 * 5. abortZiweiSession：释放运行时标志且 error 保持 null
 * 6. restoreZiweiWorkspace：原子回填 report/chartData/lockedSections/formData，tab/activePalaceLabel 重置为默认值
 * 7. 类型防线：通用 setWorkspaceState 对紫微的数据与协议运行时字段报编译错误（@ts-expect-error）
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useDestinyWorkspaceStore } from './destiny-workspace-store';
import { createDefaultBaziFormData } from '@/app/destiny/_components/bazi-mappers';
import type {
  DestinyReport,
  ZiweiChartData,
  ZiweiLockedSections,
  ZiweiPalaceAnalysis,
} from '@/app/destiny/_components/types';

const MOCK_CHART_DATA = {
  solarDate: '2026-11-13',
  lunarDate: '十月初五',
  chineseDate: '丙午年',
  time: '12:00',
  timeRange: '午时',
  sign: '天蝎座',
  zodiac: '马',
  yearStem: '丙',
  yearBranch: '午',
  soulPalaceBranch: '子',
  bodyPalaceBranch: '午',
  soul: '贪狼',
  body: '文昌',
  fiveElementsClass: '木三局',
  sihua: { lu: '天同', quan: '天机', ke: '文昌', ji: '廉贞' },
  palaces: [],
} as unknown as ZiweiChartData;

const MOCK_PALACE_ANALYSIS: ZiweiPalaceAnalysis[] = [
  {
    key: 'spouse',
    label: '夫妻',
    summary: '感情和谐',
    suggestions: ['多沟通'],
  },
  {
    key: 'life',
    label: '命宫',
    summary: '格局宏大',
    suggestions: ['坚定信念'],
  },
];

const MOCK_REPORT = {
  profile: { name: '测试命主', gender: 'male', solarDate: '2026-11-13', solarTime: '12:00' },
  coreTone: { tag: '天机独坐', headline: '机变百出', description: '灵动聪慧' },
  pillars: [],
  tenGods: [],
  elements: [],
  balanceInsight: { score: 80, strongest: '木', weakest: '金', advice: '补金' },
} as unknown as DestinyReport;

describe('destiny-workspace-store 紫微具名 action 契约 (TC07 & 契约防线)', () => {
  beforeEach(() => {
    useDestinyWorkspaceStore.getState().resetAllWorkspaces();
  });

  it('TC07-1: applyZiweiSection 写入 chartData 时同步解包至 chartData 字段并落盘 lockedSections', () => {
    useDestinyWorkspaceStore.getState().beginZiweiSession();
    useDestinyWorkspaceStore.getState().applyZiweiSection('chartData', MOCK_CHART_DATA);

    const state = useDestinyWorkspaceStore.getState().ziwei;
    expect(state.chartData).toEqual(MOCK_CHART_DATA);
    expect(state.lockedSections.chartData).toEqual(MOCK_CHART_DATA);
    // 且原子推进结果态
    expect(state.blockingLoading).toBe(false);
    expect(state.hasResult).toBe(true);
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
  });

  it('TC07-2: applyZiweiSection 写入 palaceAnalysis 时自动聚焦首个宫位 label', () => {
    useDestinyWorkspaceStore.getState().beginZiweiSession();
    // 初始状态下 activePalaceLabel 为 "命宫"
    expect(useDestinyWorkspaceStore.getState().ziwei.activePalaceLabel).toBe('命宫');

    useDestinyWorkspaceStore
      .getState()
      .applyZiweiSection('palaceAnalysis', MOCK_PALACE_ANALYSIS);

    const state = useDestinyWorkspaceStore.getState().ziwei;
    expect(state.activePalaceLabel).toBe('夫妻');
    expect(state.lockedSections.palaceAnalysis).toEqual(MOCK_PALACE_ANALYSIS);
  });

  it('TC07-3: 同 key 二次 section 到达被迟到保护拒绝（保留首个 payload）', () => {
    useDestinyWorkspaceStore.getState().beginZiweiSession();
    useDestinyWorkspaceStore.getState().applyZiweiSection('chartData', MOCK_CHART_DATA);

    const lateChartData = {
      ...MOCK_CHART_DATA,
      solarDate: '1990-01-01',
    } as unknown as ZiweiChartData;

    // 迟到覆盖尝试
    useDestinyWorkspaceStore.getState().applyZiweiSection('chartData', lateChartData);

    const state = useDestinyWorkspaceStore.getState().ziwei;
    expect(state.chartData).toEqual(MOCK_CHART_DATA);
    expect(state.lockedSections.chartData).toEqual(MOCK_CHART_DATA);
  });

  it('TC07-4: beginZiweiSession 全量重置含 tab="overview"、activePalaceLabel="命宫"、chartData=null', () => {
    // 先污染状态
    (useDestinyWorkspaceStore.getState().setWorkspaceState as any)('ziwei', {
      step: 'result',
      lastView: 'result',
      hasResult: true,
      blockingLoading: false,
      streaming: false,
      error: '前次错误',
      errorKind: 'model',
      report: MOCK_REPORT,
      chartData: MOCK_CHART_DATA,
      lockedSections: { chartData: MOCK_CHART_DATA },
      streamStatus: null,
      tab: 'timeline',
      activePalaceLabel: '夫妻',
    });

    useDestinyWorkspaceStore.getState().beginZiweiSession();

    const state = useDestinyWorkspaceStore.getState().ziwei;
    expect(state.step).toBe('form');
    expect(state.lastView).toBe('form');
    expect(state.hasResult).toBe(false);
    expect(state.blockingLoading).toBe(true);
    expect(state.streaming).toBe(true);
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
    expect(state.report).toBeNull();
    expect(state.chartData).toBeNull();
    expect(state.lockedSections).toEqual({});
    expect(state.streamStatus).toBe('queued');
    expect(state.tab).toBe('overview');
    expect(state.activePalaceLabel).toBe('命宫');
  });

  it('TC07-5: abortZiweiSession 仅释放运行时标志，error 保持 null', () => {
    useDestinyWorkspaceStore.getState().beginZiweiSession();
    expect(useDestinyWorkspaceStore.getState().ziwei.streaming).toBe(true);
    expect(useDestinyWorkspaceStore.getState().ziwei.blockingLoading).toBe(true);

    useDestinyWorkspaceStore.getState().abortZiweiSession();

    const state = useDestinyWorkspaceStore.getState().ziwei;
    expect(state.blockingLoading).toBe(false);
    expect(state.streaming).toBe(false);
    expect(state.streamStatus).toBeNull();
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
  });

  it('TC07-6: restoreZiweiWorkspace 原子回填且 tab/activePalaceLabel 重置为默认值', () => {
    const customFormData = {
      ...createDefaultBaziFormData(),
      name: '李四',
    };
    const lockedSections: ZiweiLockedSections = {
      chartData: MOCK_CHART_DATA,
      palaceAnalysis: MOCK_PALACE_ANALYSIS,
    };

    // 预先污染 tab 和 activePalaceLabel
    useDestinyWorkspaceStore.getState().setWorkspaceState('ziwei', {
      tab: 'relations',
      activePalaceLabel: '迁移',
    });

    useDestinyWorkspaceStore.getState().restoreZiweiWorkspace({
      report: MOCK_REPORT,
      chartData: MOCK_CHART_DATA,
      lockedSections,
      formData: customFormData,
    });

    const state = useDestinyWorkspaceStore.getState().ziwei;
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.blockingLoading).toBe(false);
    expect(state.streaming).toBe(false);
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
    expect(state.report).toEqual(MOCK_REPORT);
    expect(state.chartData).toEqual(MOCK_CHART_DATA);
    expect(state.lockedSections).toEqual(lockedSections);
    expect(state.streamStatus).toBeNull();
    expect(state.tab).toBe('overview');
    expect(state.activePalaceLabel).toBe('命宫');
    expect(state.formData.name).toBe('李四');
    expect(state.fieldErrors).toEqual({});
  });

  it('applyZiweiStreamStatus / applyZiweiComplete / failZiweiSession 状态迁移规范', () => {
    useDestinyWorkspaceStore.getState().beginZiweiSession();

    // 状态更新
    useDestinyWorkspaceStore.getState().applyZiweiStreamStatus('analyzing');
    expect(useDestinyWorkspaceStore.getState().ziwei.streamStatus).toBe('analyzing');

    // 终态定稿
    useDestinyWorkspaceStore.getState().applyZiweiComplete(MOCK_REPORT);
    const completeState = useDestinyWorkspaceStore.getState().ziwei;
    expect(completeState.report).toEqual(MOCK_REPORT);
    expect(completeState.streaming).toBe(false);
    expect(completeState.streamStatus).toBeNull();
    expect(completeState.blockingLoading).toBe(false);
    expect(completeState.hasResult).toBe(true);
    expect(completeState.step).toBe('result');
    expect(completeState.lastView).toBe('result');

    // 失败状态
    useDestinyWorkspaceStore.getState().failZiweiSession('模型崩溃', 'model');
    const failState = useDestinyWorkspaceStore.getState().ziwei;
    expect(failState.error).toBe('模型崩溃');
    expect(failState.errorKind).toBe('model');
    expect(failState.blockingLoading).toBe(false);
    expect(failState.streaming).toBe(false);
    expect(failState.streamStatus).toBeNull();
  });

  it('类型防线：通用 setWorkspaceState 对紫微数据或协议运行时字段报编译错误', () => {
    // 允许的 UI 交互字段 patch 正常通过
    useDestinyWorkspaceStore.getState().setWorkspaceState('ziwei', {
      tab: 'timeline',
      activePalaceLabel: '官禄',
      error: '参数校验失败',
      errorKind: 'validation',
    });

    // 拒绝写入数据与运行时受保护字段：
    // @ts-expect-error setWorkspaceState 对 ziwei 排他剔除了 report
    useDestinyWorkspaceStore.getState().setWorkspaceState('ziwei', { report: MOCK_REPORT });

    // @ts-expect-error setWorkspaceState 对 ziwei 排他剔除了 chartData
    useDestinyWorkspaceStore.getState().setWorkspaceState('ziwei', { chartData: MOCK_CHART_DATA });

    // @ts-expect-error setWorkspaceState 对 ziwei 排他剔除了 lockedSections
    useDestinyWorkspaceStore.getState().setWorkspaceState('ziwei', { lockedSections: {} });

    // @ts-expect-error setWorkspaceState 对 ziwei 排他剔除了 streaming
    useDestinyWorkspaceStore.getState().setWorkspaceState('ziwei', { streaming: true });

    // @ts-expect-error setWorkspaceState 对 ziwei 排他剔除了 streamStatus
    useDestinyWorkspaceStore.getState().setWorkspaceState('ziwei', { streamStatus: 'analyzing' });

    // @ts-expect-error setWorkspaceState 对 ziwei 排他剔除了 blockingLoading
    useDestinyWorkspaceStore.getState().setWorkspaceState('ziwei', { blockingLoading: true });
  });
});
