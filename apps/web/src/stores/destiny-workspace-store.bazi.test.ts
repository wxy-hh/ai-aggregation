/**
 * destiny-workspace-store.bazi.test.ts —— 八字工作区具名 Action 契约测试
 *
 * 验证收口的 7 个八字具名 action 状态转移规范与不变式（TC10 & 契约防线）：
 * 1. TC10-1: applyBaziSection 首个可展示分区到达后推进结果态（hasResult=true, step/lastView='result', blockingLoading=false）
 * 2. TC10-2: 同 key 二次 section 到达被迟到保护拒绝（保留首个 payload）
 * 3. TC10-3: 存在锁定分区时 applyBaziComplete(serverReport) 合并生效（锁定分区优先覆盖同名字段）
 * 4. TC10-4: abortBaziSession 仅释放运行时标志，error 保持 null
 * 5. TC10-5: restoreBaziWorkspace 原子回填 report/lockedSections/formData
 * 6. beginBaziSession / applyBaziStreamStatus / failBaziSession 状态迁移规范
 * 7. 类型防线：通用 setWorkspaceState 对八字的数据与协议运行时字段报编译错误（@ts-expect-error），compatActive 允许 UI patch
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useDestinyWorkspaceStore } from './destiny-workspace-store';
import { createDefaultBaziFormData } from '@/app/destiny/_components/bazi-mappers';
import type {
  BaziLockedSections,
  DestinyCoreTone,
  DestinyModule,
  DestinyProfile,
  DestinyReport,
} from '@/app/destiny/_components/types';

const MOCK_PROFILE: DestinyProfile = {
  name: '张三',
  genderLabel: '男',
  birthText: '1990年5月1日',
  locationText: '北京',
};

const MOCK_CORE_TONE: DestinyCoreTone = {
  tag: '甲木参天',
  chartSummary: '日主天干论命',
  headline: '命带青龙',
  description: '生机盎然，志向高远',
};

const MOCK_SERVER_REPORT = {
  profile: { name: '服务端原名', gender: 'male', solarDate: '1990-05-01', solarTime: '12:00' },
  coreTone: { tag: '服务端旧标签', headline: '服务端标题', description: '服务端描述' },
  pillars: [],
  tenGods: [],
  elements: [],
  balanceInsight: { score: 60, strongest: '土', weakest: '水', advice: '补水' },
  modules: {
    personality: { score: 70, summary: '服务端个性', advice: '稳健' },
    career: { score: 75, summary: '服务端事业', advice: '进取' },
    love: { score: 65, summary: '服务端情感', advice: '沟通' },
    wealth: { score: 80, summary: '服务端财富', advice: '理财' },
    health: { score: 85, summary: '服务端健康', advice: '作息' },
  },
} as unknown as DestinyReport;

describe('destiny-workspace-store 八字具名 action 契约 (TC10 & 契约防线)', () => {
  beforeEach(() => {
    useDestinyWorkspaceStore.getState().resetAllWorkspaces();
  });

  it('TC10-1: applyBaziSection 首个可展示分区到达后原子推进结果态', () => {
    useDestinyWorkspaceStore.getState().beginBaziSession();
    const initialState = useDestinyWorkspaceStore.getState().bazi;
    expect(initialState.blockingLoading).toBe(true);
    expect(initialState.hasResult).toBe(false);
    expect(initialState.step).toBe('form');

    useDestinyWorkspaceStore.getState().applyBaziSection('coreDestinyTone', MOCK_CORE_TONE);

    const state = useDestinyWorkspaceStore.getState().bazi;
    expect(state.lockedSections.coreDestinyTone).toEqual(MOCK_CORE_TONE);
    expect(state.blockingLoading).toBe(false);
    expect(state.hasResult).toBe(true);
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
  });

  it('TC10-2: 同 key 二次 section 到达被迟到保护拒绝（保留首个 payload）', () => {
    useDestinyWorkspaceStore.getState().beginBaziSession();
    useDestinyWorkspaceStore.getState().applyBaziSection('coreDestinyTone', MOCK_CORE_TONE);

    const lateCoreTone: DestinyCoreTone = {
      tag: '迟到标签',
      chartSummary: '迟到综述',
      headline: '迟到标题',
      description: '迟到描述',
    };

    useDestinyWorkspaceStore.getState().applyBaziSection('coreDestinyTone', lateCoreTone);

    const state = useDestinyWorkspaceStore.getState().bazi;
    expect(state.lockedSections.coreDestinyTone).toEqual(MOCK_CORE_TONE);
  });

  it('TC10-3: 存在锁定分区时 applyBaziComplete(serverReport) 权威合并生效（锁定分区优先覆盖）', () => {
    useDestinyWorkspaceStore.getState().beginBaziSession();

    // 锁定个性与主基调
    const lockedPersonality: DestinyModule = {
      title: '个性分析',
      summary: '流式先到锁定个性',
      suggestions: ['坚持初心'],
    };
    useDestinyWorkspaceStore.getState().applyBaziSection('coreDestinyTone', MOCK_CORE_TONE);
    useDestinyWorkspaceStore.getState().applyBaziSection('modulePersonality', lockedPersonality);

    // 服务端 complete 帧到达
    useDestinyWorkspaceStore.getState().applyBaziComplete(MOCK_SERVER_REPORT);

    const state = useDestinyWorkspaceStore.getState().bazi;
    expect(state.report).toBeDefined();
    // 锁定分区字段覆盖了服务端的相应字段
    expect(state.report?.coreTone).toEqual(MOCK_CORE_TONE);
    expect(state.report?.modules.personality).toEqual(lockedPersonality);
    // 服务端未被锁定的子模块保持服务端内容
    expect(state.report?.modules.career).toEqual(MOCK_SERVER_REPORT.modules.career);
    // 状态流转为终态
    expect(state.streaming).toBe(false);
    expect(state.streamStatus).toBeNull();
    expect(state.blockingLoading).toBe(false);
    expect(state.hasResult).toBe(true);
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
  });

  it('TC10-4: abortBaziSession 仅释放运行时标志，error 保持 null', () => {
    useDestinyWorkspaceStore.getState().beginBaziSession();
    expect(useDestinyWorkspaceStore.getState().bazi.streaming).toBe(true);
    expect(useDestinyWorkspaceStore.getState().bazi.blockingLoading).toBe(true);

    useDestinyWorkspaceStore.getState().abortBaziSession();

    const state = useDestinyWorkspaceStore.getState().bazi;
    expect(state.blockingLoading).toBe(false);
    expect(state.streaming).toBe(false);
    expect(state.streamStatus).toBeNull();
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
  });

  it('TC10-5: restoreBaziWorkspace 原子回填 report/lockedSections/formData', () => {
    const customFormData = {
      ...createDefaultBaziFormData(),
      name: '王五',
    };
    const lockedSections: BaziLockedSections = {
      coreDestinyTone: MOCK_CORE_TONE,
    };

    useDestinyWorkspaceStore.getState().restoreBaziWorkspace({
      report: MOCK_SERVER_REPORT,
      lockedSections,
      formData: customFormData,
    });

    const state = useDestinyWorkspaceStore.getState().bazi;
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.blockingLoading).toBe(false);
    expect(state.streaming).toBe(false);
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
    expect(state.streamStatus).toBeNull();
    expect(state.report).toEqual(MOCK_SERVER_REPORT);
    expect(state.lockedSections).toEqual(lockedSections);
    expect(state.formData.name).toBe('王五');
    expect(state.fieldErrors).toEqual({});
  });

  it('beginBaziSession / applyBaziStreamStatus / failBaziSession 状态迁移规范', () => {
    useDestinyWorkspaceStore.getState().beginBaziSession();

    const beginState = useDestinyWorkspaceStore.getState().bazi;
    expect(beginState.step).toBe('form');
    expect(beginState.lastView).toBe('form');
    expect(beginState.hasResult).toBe(false);
    expect(beginState.blockingLoading).toBe(true);
    expect(beginState.streaming).toBe(true);
    expect(beginState.error).toBeNull();
    expect(beginState.errorKind).toBeNull();
    expect(beginState.lockedSections).toEqual({});
    expect(beginState.report).toBeNull();
    expect(beginState.streamStatus).toBe('queued');

    useDestinyWorkspaceStore.getState().applyBaziStreamStatus('analyzing');
    expect(useDestinyWorkspaceStore.getState().bazi.streamStatus).toBe('analyzing');

    useDestinyWorkspaceStore.getState().failBaziSession('模型调用失败', 'model');
    const failState = useDestinyWorkspaceStore.getState().bazi;
    expect(failState.error).toBe('模型调用失败');
    expect(failState.errorKind).toBe('model');
    expect(failState.blockingLoading).toBe(false);
    expect(failState.streaming).toBe(false);
    expect(failState.streamStatus).toBeNull();
  });

  it('类型防线：通用 setWorkspaceState 对八字数据或协议运行时字段报编译错误，compatActive 允许 UI patch', () => {
    // 允许的 UI 交互字段 patch 正常通过（包括 compatActive）
    useDestinyWorkspaceStore.getState().setWorkspaceState('bazi', {
      compatActive: true,
      error: '参数校验失败',
      errorKind: 'validation',
    });

    expect(useDestinyWorkspaceStore.getState().bazi.compatActive).toBe(true);

    // 拒绝写入数据与运行时受保护字段：
    // @ts-expect-error setWorkspaceState 对 bazi 排他剔除了 report
    useDestinyWorkspaceStore.getState().setWorkspaceState('bazi', { report: MOCK_SERVER_REPORT });

    // @ts-expect-error setWorkspaceState 对 bazi 排他剔除了 lockedSections
    useDestinyWorkspaceStore.getState().setWorkspaceState('bazi', { lockedSections: {} });

    // @ts-expect-error setWorkspaceState 对 bazi 排他剔除了 streaming
    useDestinyWorkspaceStore.getState().setWorkspaceState('bazi', { streaming: true });

    // @ts-expect-error setWorkspaceState 对 bazi 排他剔除了 streamStatus
    useDestinyWorkspaceStore.getState().setWorkspaceState('bazi', { streamStatus: 'analyzing' });

    // @ts-expect-error setWorkspaceState 对 bazi 排他剔除了 blockingLoading
    useDestinyWorkspaceStore.getState().setWorkspaceState('bazi', { blockingLoading: true });
  });
});
