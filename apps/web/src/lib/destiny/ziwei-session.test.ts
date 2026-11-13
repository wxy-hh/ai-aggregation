/**
 * ziwei-session.test.ts —— 紫微斗数会话命令深模块契约测试 (TC08)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }));

import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { useRelayStore } from '@/stores/relay-store';
import { createDefaultBaziFormData } from '@/app/destiny/_components/bazi-mappers';
import { manualSseStream } from './testing/manual-sse-stream';
import { ziweiSession, _resetZiweiSessionForTest } from './ziwei-session';
import type {
  DestinyReport,
  ZiweiChartData,
  ZiweiPalaceAnalysis,
} from '@/app/destiny/_components/types';
import type { RelayBundle } from '@repo/shared';

const EMPTY_ACTIVE = {
  chat: null,
  image: null,
  voice: null,
  video: null,
  destiny: null,
};

const EMPTY_DRAFT = {
  chat: '',
  image: '',
  voice: '',
  video: '',
  destiny: '',
};

const authFetchMock = vi.mocked(authFetch);

const MOCK_CHART_DATA = {
  solarDate: '2026-11-13',
  palaces: [],
} as unknown as ZiweiChartData;

const MOCK_REPORT = {
  profile: { name: '张三', gender: 'male', solarDate: '2026-11-13', solarTime: '12:00' },
  coreTone: {
    tag: '天机星',
    headline: '智慧过人',
    description: '深思熟虑',
  },
  pillars: [],
  tenGods: [],
  elements: [],
  balanceInsight: { score: 90, strongest: '木', weakest: '火', advice: '补火' },
} as unknown as DestinyReport;

describe('ziwei-session 会话命令深模块 (TC08)', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    useDestinyWorkspaceStore.getState().resetAllWorkspaces();
    useHistoryStore.setState({ items: [] });
    useRelayStore.getState().clearActiveForTarget('destiny');
    useRelayStore.getState().clearDraftForTarget('destiny');
    _resetZiweiSessionForTest();
  });

  afterEach(() => {
    _resetZiweiSessionForTest();
  });

  it('TC08-1: 共享流夹具依次推送 status/section-final/complete 后：streaming=false、streamStatus=null、report 为 complete 载荷，且宫位归一化', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream.response);

    const formData = {
      ...createDefaultBaziFormData(),
      name: '王五',
    };

    const sessionPromise = ziweiSession.start(formData);

    // 验证初始状态
    const initialState = useDestinyWorkspaceStore.getState().ziwei;
    expect(initialState.blockingLoading).toBe(true);
    expect(initialState.streaming).toBe(true);
    expect(initialState.streamStatus).toBe('queued');

    // 1. 推送 status 帧
    stream.push({ type: 'status', status: 'analyzing' });
    await vi.waitFor(() => {
      expect(useDestinyWorkspaceStore.getState().ziwei.streamStatus).toBe('analyzing');
    });

    // 2. 推送 section-final 帧（含需要归一化的宫位名，如 "父母宫"）
    const unnormalizedPalaces: ZiweiPalaceAnalysis[] = [
      {
        key: 'parents',
        label: '父母宫',
        summary: '父母恩重',
        suggestions: ['多尽孝道'],
      },
    ];

    stream.push({
      type: 'section-final',
      sectionKey: 'palaceAnalysis',
      payload: unnormalizedPalaces,
    });
    stream.push({
      type: 'section-final',
      sectionKey: 'chartData',
      payload: MOCK_CHART_DATA,
    });
    await vi.waitFor(() => {
      const midState = useDestinyWorkspaceStore.getState().ziwei;
      expect(midState.blockingLoading).toBe(false);
      expect(midState.hasResult).toBe(true);
      expect(midState.chartData).toEqual(MOCK_CHART_DATA);
      // 宫位归一化为 "父母"
      expect(midState.activePalaceLabel).toBe('父母');
      expect((midState.lockedSections.palaceAnalysis as ZiweiPalaceAnalysis[])[0].label).toBe('父母');
    });

    // 3. 推送 complete 帧并关闭流
    stream.push({
      type: 'complete',
      report: MOCK_REPORT,
    });
    stream.close();

    await sessionPromise;

    const finalState = useDestinyWorkspaceStore.getState().ziwei;
    expect(finalState.streaming).toBe(false);
    expect(finalState.streamStatus).toBeNull();
    expect(finalState.report).toEqual(MOCK_REPORT);
    expect(finalState.step).toBe('result');
    expect(finalState.lastView).toBe('result');

    // 验证历史记录已恰好生成一条
    const historyItems = useHistoryStore.getState().items;
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].title).toBe('王五的紫微斗数命理报告');
  });

  it('TC08-2 & TC08-3: 带 destiny 活动接力包成盘后：历史条目 derivation 记录 bundle id 且即时闭环清除引用与草稿', async () => {
    const mockBundle: RelayBundle = {
      id: 'relay-bundle-ziwei-777',
      items: [
        {
          id: 'ref-item-1',
          sourceModule: 'destiny',
          sourceType: 'text',
          sourceId: 'src-1',
          sourceTitle: '八字命理',
          snapshotText: '测试依据',
          createdAt: '2026-11-13T10:00:00.000Z',
        },
      ],
      targetModule: 'destiny',
      targetRole: 'question',
      createdAt: '2026-11-13T10:00:00.000Z',
    };

    // 设定当前活动接力包及草稿
    useRelayStore.setState({
      bundles: { [mockBundle.id]: mockBundle },
      activeByTarget: { ...EMPTY_ACTIVE, destiny: mockBundle.id },
      draftByTarget: { ...EMPTY_DRAFT, destiny: '预填草稿' },
    });

    const stream = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream.response);

    const formData = {
      ...createDefaultBaziFormData(),
      name: '接力命主',
    };

    const sessionPromise = ziweiSession.start(formData);

    stream.push({ type: 'section-final', sectionKey: 'chartData', payload: MOCK_CHART_DATA });
    stream.push({ type: 'complete', report: MOCK_REPORT });
    stream.close();

    await sessionPromise;

    // 断言 2：历史记录中正确记录 derivedFromRelayId
    const historyItems = useHistoryStore.getState().items;
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].derivedFromRelayId).toBe('relay-bundle-ziwei-777');
    expect(historyItems[0].derivedFromReferenceIds).toEqual(['ref-item-1']);

    // 断言 3：成盘后 activeByTarget['destiny'] 为 null 且草稿清除（即时闭环）
    const relayState = useRelayStore.getState();
    expect(relayState.activeByTarget.destiny).toBeNull();
    expect(relayState.draftByTarget.destiny).toBe('');
  });

  it('cancel 静默取消在途流且保持 error 为 null', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream.response);

    const formData = createDefaultBaziFormData();
    const sessionPromise = ziweiSession.start(formData);

    expect(useDestinyWorkspaceStore.getState().ziwei.blockingLoading).toBe(true);

    ziweiSession.cancel();
    stream.close();
    await sessionPromise;

    const state = useDestinyWorkspaceStore.getState().ziwei;
    expect(state.blockingLoading).toBe(false);
    expect(state.streaming).toBe(false);
    expect(state.error).toBeNull();
  });

  it('reset 取消在途流并全量重置紫微工作区', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream.response);

    const formData = createDefaultBaziFormData();
    const sessionPromise = ziweiSession.start(formData);

    ziweiSession.reset();
    stream.close();
    await sessionPromise;

    const state = useDestinyWorkspaceStore.getState().ziwei;
    expect(state.step).toBe('form');
    expect(state.blockingLoading).toBe(false);
    expect(state.streaming).toBe(false);
    expect(state.hasResult).toBe(false);
  });

  it('restoreFromHistory 无损恢复且清理 URL 参数，不二次落盘', () => {
    // 注入一条历史记录
    useHistoryStore.setState({
      isInitialized: true,
      items: [
        {
          id: 'hist-ziwei-888',
          type: 'destiny',
          subType: 'ziwei',
          title: '历史命主紫微报告',
          preview: '历史预览',
          date: '刚刚',
          createdAt: '2026-11-13T10:00:00.000Z',
          updatedAt: '2026-11-13T10:00:00.000Z',
          model: 'doubao-seed-2-0',
          coreTone: '天机星',
          formData: {
            ...createDefaultBaziFormData(),
            name: '历史命主',
          },
          reportData: {
            report: MOCK_REPORT,
            chartData: MOCK_CHART_DATA,
            lockedSections: { chartData: MOCK_CHART_DATA },
          },
        },
      ],
    });

    // 模拟 URL 中的 ?historyId=hist-ziwei-888
    const originalHref = window.location.href;
    window.history.replaceState({}, '', `${originalHref}?historyId=hist-ziwei-888`);

    const restored = ziweiSession.restoreFromHistory('hist-ziwei-888');
    expect(restored).toBe(true);

    const state = useDestinyWorkspaceStore.getState().ziwei;
    expect(state.hasResult).toBe(true);
    expect(state.step).toBe('result');
    expect(state.report).toEqual(MOCK_REPORT);
    expect(state.chartData).toEqual(MOCK_CHART_DATA);
    expect(state.formData.name).toBe('历史命主');

    // 检查 URL 中 historyId 参数已被移除
    const currentParams = new URLSearchParams(window.location.search);
    expect(currentParams.has('historyId')).toBe(false);

    // 确保历史记录没有被二次添加
    expect(useHistoryStore.getState().items.length).toBe(1);
  });
});
