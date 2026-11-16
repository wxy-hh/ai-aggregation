/**
 * destiny-workspace-store.qimen.test.ts —— 奇门遁甲工作区具名 Action 契约测试
 *
 * 验证收口的 7 个具名 action 状态转移规范与不变式（TC02 & TC04）：
 * 1. beginQimenSession：全量重置为 form 态并开启 blockingLoading，错误清空，三区 idle
 * 2. applyQimenTaskCreated：写入 analysisId
 * 3. applyQimenBaseResult：写入 baseResult，baseStatus 置为 completed，三区切为 loading
 * 4. applyQimenSectionResult：
 *    - 前两个分区 settled 不推进结果态（仍为 form 且 blockingLoading=true）
 *    - 第三个分区 completed 时原子推进结果态（step/lastView='result', hasResult=true, blockingLoading=false）
 *    - 第三个分区 failed 时同样推进结果态，且错误写入 sectionErrors
 *    - 迟到保护：已 completed 的分区再次传入 failed outcome，状态保留 completed 且丢弃错误
 * 5. failQimenSession：
 *    - phase='base' 时 baseStatus='failed' 且 baseError=msg，blockingLoading=false，error/errorKind 落盘
 *    - 未指定 phase（如 task 阶段失败）时不漏清 blockingLoading，baseStatus 不受影响
 * 6. abortQimenSession：仅 blockingLoading=false，error 与 errorKind 保持 null
 * 7. restoreQimenWorkspace：原子回填并按 sections 实际包含的 key 重建 sectionStatuses（包含为 completed，缺失为 idle）
 * 8. 类型防线（TC04）：通用 setWorkspaceState 对 qimen 的数据与协议字段报编译错误（@ts-expect-error）
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useDestinyWorkspaceStore } from './destiny-workspace-store';
import { createDefaultQimenFormData } from '@/app/destiny/_components/qimen-mappers';
import type {
  QimenAnalysisBaseResult,
  QimenAsyncSections,
} from '@/app/destiny/_components/qimen-types';

const MOCK_BASE_RESULT = {
  chartTitle: '测试奇门盘局',
  chartMeta: {
    dun: '阳遁',
    ju: '一局',
    jiaziXunkong: '戌亥',
    horsePosition: '寅',
    valueSymbol: '天蓬',
    valueDoor: '休门',
    xunshou: '戊',
    riGan: '甲',
    shiGan: '丙',
  },
  board: [],
} as unknown as QimenAnalysisBaseResult;

const MOCK_STRATEGY: NonNullable<QimenAsyncSections['strategyOverview']> = {
  overallAssessment: '大吉之象',
  actionSuggestions: ['把握时机'],
  riskAlerts: ['注意防范小人'],
};

const MOCK_TIMING: NonNullable<QimenAsyncSections['timingWindows']> = [
  { period: '辰时', guidance: '利见大人' },
];

const MOCK_SUMMARY: NonNullable<QimenAsyncSections['chartSummary']> = '全局盘面综述';

describe('destiny-workspace-store 奇门具名 action 契约 (TC02 & TC04)', () => {
  beforeEach(() => {
    useDestinyWorkspaceStore.getState().resetAllWorkspaces();
  });

  it('TC02-1: beginQimenSession 全量重置为初始会话态', () => {
    // 先污染为历史残留态或前次结果态（通过类型断言绕过类型防线）
    (useDestinyWorkspaceStore.getState().setWorkspaceState as any)('qimen', {
      step: 'result',
      lastView: 'result',
      hasResult: true,
      blockingLoading: false,
      analysisId: 'old-analysis-id',
      baseResult: MOCK_BASE_RESULT,
      baseStatus: 'completed',
      baseError: '前次错误',
      sections: { strategyOverview: MOCK_STRATEGY },
      sectionStatuses: {
        strategyOverview: 'completed',
        timingWindows: 'failed',
        chartSummary: 'completed',
      },
      sectionErrors: { timingWindows: '超时' },
      error: '前次错误',
      errorKind: 'model',
    });

    useDestinyWorkspaceStore.getState().beginQimenSession();

    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.step).toBe('form');
    expect(state.lastView).toBe('form');
    expect(state.hasResult).toBe(false);
    expect(state.blockingLoading).toBe(true);
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
    expect(state.analysisId).toBeNull();
    expect(state.baseResult).toBeNull();
    expect(state.baseStatus).toBe('loading');
    expect(state.baseError).toBeNull();
    expect(state.sections).toEqual({});
    expect(state.sectionErrors).toEqual({});
    expect(state.sectionStatuses).toEqual({
      strategyOverview: 'idle',
      timingWindows: 'idle',
      chartSummary: 'idle',
    });
  });

  it('applyQimenTaskCreated: 记录分析任务 ID', () => {
    useDestinyWorkspaceStore.getState().beginQimenSession();
    useDestinyWorkspaceStore.getState().applyQimenTaskCreated('task-12345');

    expect(useDestinyWorkspaceStore.getState().qimen.analysisId).toBe('task-12345');
  });

  it('applyQimenBaseResult: 写入基础盘面并激活三分区为 loading', () => {
    useDestinyWorkspaceStore.getState().beginQimenSession();
    useDestinyWorkspaceStore.getState().applyQimenBaseResult(MOCK_BASE_RESULT);

    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.baseResult).toEqual(MOCK_BASE_RESULT);
    expect(state.baseStatus).toBe('completed');
    expect(state.baseError).toBeNull();
    expect(state.sectionStatuses).toEqual({
      strategyOverview: 'loading',
      timingWindows: 'loading',
      chartSummary: 'loading',
    });
  });

  it('TC02-2: 第 1、2 个分区 settled 后，step 仍为 form 且 blockingLoading 为 true', () => {
    useDestinyWorkspaceStore.getState().beginQimenSession();
    useDestinyWorkspaceStore.getState().applyQimenBaseResult(MOCK_BASE_RESULT);

    // 第 1 个分区完成
    useDestinyWorkspaceStore.getState().applyQimenSectionResult('strategyOverview', {
      status: 'completed',
      data: MOCK_STRATEGY,
    });
    let state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.step).toBe('form');
    expect(state.hasResult).toBe(false);
    expect(state.blockingLoading).toBe(true);
    expect(state.sectionStatuses.strategyOverview).toBe('completed');
    expect(state.sections.strategyOverview).toEqual(MOCK_STRATEGY);

    // 第 2 个分区失败
    useDestinyWorkspaceStore.getState().applyQimenSectionResult('timingWindows', {
      status: 'failed',
      error: '时机窗口推演超时',
    });
    state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.step).toBe('form');
    expect(state.hasResult).toBe(false);
    expect(state.blockingLoading).toBe(true);
    expect(state.sectionStatuses.timingWindows).toBe('failed');
    expect(state.sectionErrors.timingWindows).toBe('时机窗口推演超时');
  });

  it('TC02-3: 第 3 个分区 outcome 为 completed 时，原子推进到结果态', () => {
    useDestinyWorkspaceStore.getState().beginQimenSession();
    useDestinyWorkspaceStore.getState().applyQimenBaseResult(MOCK_BASE_RESULT);

    useDestinyWorkspaceStore.getState().applyQimenSectionResult('strategyOverview', {
      status: 'completed',
      data: MOCK_STRATEGY,
    });
    useDestinyWorkspaceStore.getState().applyQimenSectionResult('timingWindows', {
      status: 'completed',
      data: MOCK_TIMING,
    });
    useDestinyWorkspaceStore.getState().applyQimenSectionResult('chartSummary', {
      status: 'completed',
      data: MOCK_SUMMARY,
    });

    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.blockingLoading).toBe(false);
    expect(state.sections.chartSummary).toEqual(MOCK_SUMMARY);
    expect(state.sectionStatuses.chartSummary).toBe('completed');
  });

  it('TC02-4: 第 3 个分区 outcome 为 failed 时，同样推进结果态且记录分区错误', () => {
    useDestinyWorkspaceStore.getState().beginQimenSession();
    useDestinyWorkspaceStore.getState().applyQimenBaseResult(MOCK_BASE_RESULT);

    useDestinyWorkspaceStore.getState().applyQimenSectionResult('strategyOverview', {
      status: 'completed',
      data: MOCK_STRATEGY,
    });
    useDestinyWorkspaceStore.getState().applyQimenSectionResult('timingWindows', {
      status: 'completed',
      data: MOCK_TIMING,
    });
    useDestinyWorkspaceStore.getState().applyQimenSectionResult('chartSummary', {
      status: 'failed',
      error: '盘面综述生成失败',
    });

    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.blockingLoading).toBe(false);
    expect(state.sectionStatuses.chartSummary).toBe('failed');
    expect(state.sectionErrors.chartSummary).toBe('盘面综述生成失败');
  });

  it('TC02-5: 迟到保护：已 completed 的分区再次传入 failed outcome 被丢弃', () => {
    useDestinyWorkspaceStore.getState().beginQimenSession();
    useDestinyWorkspaceStore.getState().applyQimenBaseResult(MOCK_BASE_RESULT);

    useDestinyWorkspaceStore.getState().applyQimenSectionResult('strategyOverview', {
      status: 'completed',
      data: MOCK_STRATEGY,
    });

    // 迟到的失败信号传入
    useDestinyWorkspaceStore.getState().applyQimenSectionResult('strategyOverview', {
      status: 'failed',
      error: '迟到的错误',
    });

    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.sectionStatuses.strategyOverview).toBe('completed');
    expect(state.sections.strategyOverview).toEqual(MOCK_STRATEGY);
    expect(state.sectionErrors.strategyOverview).toBeUndefined();
  });

  it('TC02-6: failQimenSession 记录错误并释放 loading，phase="base" 时写 baseStatus/baseError', () => {
    useDestinyWorkspaceStore.getState().beginQimenSession();

    // 1. base 相位失败
    useDestinyWorkspaceStore.getState().failQimenSession('基础盘面生成超时', 'timeout', 'base');
    let state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.blockingLoading).toBe(false);
    expect(state.error).toBe('基础盘面生成超时');
    expect(state.errorKind).toBe('timeout');
    expect(state.baseStatus).toBe('failed');
    expect(state.baseError).toBe('基础盘面生成超时');

    // 2. task 相位失败（不传 phase 或 phase='task'）：修掉现状漏清 blockingLoading 的 bug
    useDestinyWorkspaceStore.getState().beginQimenSession();
    useDestinyWorkspaceStore.getState().failQimenSession('任务创建失败', 'model');
    state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.blockingLoading).toBe(false);
    expect(state.error).toBe('任务创建失败');
    expect(state.errorKind).toBe('model');
    // baseStatus 不被修改为 failed（仍保留初始态）
    expect(state.baseStatus).toBe('loading');
  });

  it('TC02-7: abortQimenSession 释放 blockingLoading 且绝不写 error', () => {
    useDestinyWorkspaceStore.getState().beginQimenSession();
    expect(useDestinyWorkspaceStore.getState().qimen.blockingLoading).toBe(true);

    useDestinyWorkspaceStore.getState().abortQimenSession();
    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.blockingLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
  });

  it('TC02-8: restoreQimenWorkspace 按 payload.sections 实际 key 重建 sectionStatuses 并直达结果态', () => {
    const formData = createDefaultQimenFormData();
    formData.description = '测试恢复所问之事';

    useDestinyWorkspaceStore.getState().restoreQimenWorkspace({
      analysisId: 'restored-analysis-1',
      baseResult: MOCK_BASE_RESULT,
      sections: {
        strategyOverview: MOCK_STRATEGY,
        // timingWindows 缺失（模拟部分生成）
        chartSummary: MOCK_SUMMARY,
      },
      formData,
    });

    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.blockingLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
    expect(state.analysisId).toBe('restored-analysis-1');
    expect(state.baseResult).toEqual(MOCK_BASE_RESULT);
    expect(state.baseStatus).toBe('completed');
    expect(state.baseError).toBeNull();
    expect(state.formData.description).toBe('测试恢复所问之事');
    expect(state.fieldErrors).toEqual({});
    expect(state.sectionErrors).toEqual({});
    // strategyOverview 与 chartSummary 包含在 sections 中，置为 completed；timingWindows 缺失，置为 idle
    expect(state.sectionStatuses).toEqual({
      strategyOverview: 'completed',
      timingWindows: 'idle',
      chartSummary: 'completed',
    });
  });

  it('TC02-9: restoreQimenWorkspace 将带错误记录的缺失分区恢复为 failed', () => {
    useDestinyWorkspaceStore.getState().restoreQimenWorkspace({
      analysisId: 'restored-analysis-with-errors',
      baseResult: MOCK_BASE_RESULT,
      sections: {
        strategyOverview: MOCK_STRATEGY,
        chartSummary: MOCK_SUMMARY,
      },
      sectionErrors: { timingWindows: '时机窗口生成失败' },
      formData: createDefaultQimenFormData(),
    });

    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.sectionStatuses).toEqual({
      strategyOverview: 'completed',
      timingWindows: 'failed',
      chartSummary: 'completed',
    });
    expect(state.sectionErrors).toEqual({ timingWindows: '时机窗口生成失败' });
    expect(state.step).toBe('result');
    expect(state.hasResult).toBe(true);
  });

  it('TC04-2: 编译期类型防线：裸 patch 写入奇门数据或协议字段被 TypeScript 拒绝', () => {
    // 允许的 UI 字段 patch 正常通过
    useDestinyWorkspaceStore.getState().setWorkspaceState('qimen', {
      step: 'form',
      lastView: 'form',
      hasResult: false,
      error: '表单参数校验失败',
      errorKind: 'validation',
    });

    // 拒绝写入数据字段与协议字段：
    // @ts-expect-error setWorkspaceState 对 qimen 排他剔除了 baseResult
    useDestinyWorkspaceStore.getState().setWorkspaceState('qimen', { baseResult: MOCK_BASE_RESULT });

    // @ts-expect-error setWorkspaceState 对 qimen 排他剔除了 blockingLoading
    useDestinyWorkspaceStore.getState().setWorkspaceState('qimen', { blockingLoading: true });

    // @ts-expect-error setWorkspaceState 对 qimen 排他剔除了 analysisId
    useDestinyWorkspaceStore.getState().setWorkspaceState('qimen', { analysisId: 'hack' });

    // @ts-expect-error setWorkspaceState 对 qimen 排他剔除了 sections
    useDestinyWorkspaceStore.getState().setWorkspaceState('qimen', { sections: {} });

    // @ts-expect-error setWorkspaceState 对 qimen 排他剔除了 sectionStatuses
    useDestinyWorkspaceStore.getState().setWorkspaceState('qimen', { sectionStatuses: { strategyOverview: 'completed', timingWindows: 'idle', chartSummary: 'idle' } });
  });
});
