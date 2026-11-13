/**
 * bazi-session.test.ts —— 八字会话命令深模块契约测试 (TC11 & 会话规范)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }));

import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { useRelayStore } from '@/stores/relay-store';
import { createDefaultBaziFormData } from '@/app/destiny/_components/bazi-mappers';
import { manualSseStream } from './testing/manual-sse-stream';
import { baziSession, _resetBaziSessionForTest } from './bazi-session';
import type {
  DestinyCoreTone,
  DestinyReport,
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

const MOCK_CORE_TONE: DestinyCoreTone = {
  tag: '伤官生财',
  chartSummary: '日坐食伤',
  headline: '才华横溢，财源广进',
  description: '善于把握商机，富有创造力。',
};

const MOCK_REPORT = {
  profile: { name: '张三', gender: 'male', solarDate: '1990-05-01', solarTime: '12:00' },
  coreTone: MOCK_CORE_TONE,
  pillars: [],
  tenGods: [],
  elements: [],
  balanceInsight: { score: 88, strongest: '土', weakest: '水', advice: '补水' },
  modules: {
    personality: { score: 90, summary: '极具才华', advice: '厚积薄发' },
    career: { score: 85, summary: '开拓进取', advice: '团队协作' },
    love: { score: 80, summary: '情投意合', advice: '多倾听' },
    wealth: { score: 92, summary: '财运亨通', advice: '分散投资' },
    health: { score: 78, summary: '劳逸结合', advice: '规律作息' },
  },
} as unknown as DestinyReport;

const MOCK_BUNDLE: RelayBundle = {
  id: 'relay-bundle-bazi-999',
  items: [
    {
      id: 'ref-item-bazi-1',
      sourceModule: 'destiny',
      sourceType: 'text',
      sourceId: 'src-bazi-1',
      sourceTitle: '八字命理',
      snapshotText: '八字测算线索',
      createdAt: '2026-11-13T10:00:00.000Z',
    },
  ],
  targetModule: 'destiny',
  targetRole: 'question',
  createdAt: '2026-11-13T10:00:00.000Z',
};

describe('bazi-session 会话命令深模块 (TC11 & 会话规范)', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    useDestinyWorkspaceStore.getState().resetAllWorkspaces();
    useHistoryStore.setState({ items: [] });
    useRelayStore.getState().clearActiveForTarget('destiny');
    useRelayStore.getState().clearDraftForTarget('destiny');
    _resetBaziSessionForTest();
  });

  afterEach(() => {
    _resetBaziSessionForTest();
  });

  it('TC11-1: 带 destiny 活动接力包成盘后：历史记录 derivation 记录 bundle id 且活动引用保留（未 commit）', async () => {
    useRelayStore.setState({
      bundles: { [MOCK_BUNDLE.id]: MOCK_BUNDLE },
      activeByTarget: { ...EMPTY_ACTIVE, destiny: MOCK_BUNDLE.id },
      draftByTarget: { ...EMPTY_DRAFT, destiny: '预填八字草稿' },
    });

    const stream = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream.response);

    const formData = {
      ...createDefaultBaziFormData(),
      name: '接力八字命主',
    };

    const sessionPromise = baziSession.start(formData);

    stream.push({ type: 'section-final', sectionKey: 'coreDestinyTone', payload: MOCK_CORE_TONE });
    stream.push({ type: 'complete', report: MOCK_REPORT });
    stream.close();

    await sessionPromise;

    // 历史已写入且 derivation 正确
    const historyItems = useHistoryStore.getState().items;
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].derivedFromRelayId).toBe('relay-bundle-bazi-999');
    expect(historyItems[0].derivedFromReferenceIds).toEqual(['ref-item-bazi-1']);

    // 成盘后接力引用仍然保留（八字延后闭环，绝不在成盘时 commit）
    const relayState = useRelayStore.getState();
    expect(relayState.activeByTarget.destiny).toBe('relay-bundle-bazi-999');
    expect(relayState.draftByTarget.destiny).toBe('预填八字草稿');
  });

  it('TC11-2: commitAdvisorRelay 成功完成顾问发送后的延迟闭环（清除活动引用与草稿）', async () => {
    useRelayStore.setState({
      bundles: { [MOCK_BUNDLE.id]: MOCK_BUNDLE },
      activeByTarget: { ...EMPTY_ACTIVE, destiny: MOCK_BUNDLE.id },
      draftByTarget: { ...EMPTY_DRAFT, destiny: '预填八字草稿' },
    });

    const stream = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream.response);

    const formData = {
      ...createDefaultBaziFormData(),
      name: '延迟闭环命主',
    };

    const sessionPromise = baziSession.start(formData);
    stream.push({ type: 'complete', report: MOCK_REPORT });
    stream.close();
    await sessionPromise;

    // 成盘后仍存在
    expect(useRelayStore.getState().activeByTarget.destiny).toBe('relay-bundle-bazi-999');

    // 触发顾问发送后的延迟闭环
    baziSession.commitAdvisorRelay();

    // 接力引用与草稿已被清理
    const relayState = useRelayStore.getState();
    expect(relayState.activeByTarget.destiny).toBeNull();
    expect(relayState.draftByTarget.destiny).toBe('');
  });

  it('TC11-3: 未 commit 状态下再次 start 或 reset，活动接力引用与草稿保持不丢', async () => {
    useRelayStore.setState({
      bundles: { [MOCK_BUNDLE.id]: MOCK_BUNDLE },
      activeByTarget: { ...EMPTY_ACTIVE, destiny: MOCK_BUNDLE.id },
      draftByTarget: { ...EMPTY_DRAFT, destiny: '预填八字草稿' },
    });

    const stream1 = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream1.response);

    const formData = {
      ...createDefaultBaziFormData(),
      name: '初次测算命主',
    };

    const sessionPromise1 = baziSession.start(formData);
    stream1.push({ type: 'complete', report: MOCK_REPORT });
    stream1.close();
    await sessionPromise1;

    expect(useRelayStore.getState().activeByTarget.destiny).toBe('relay-bundle-bazi-999');

    // 1. 调用 reset()，验证引用不丢
    baziSession.reset();
    expect(useRelayStore.getState().activeByTarget.destiny).toBe('relay-bundle-bazi-999');
    expect(useRelayStore.getState().draftByTarget.destiny).toBe('预填八字草稿');

    // 2. 再次调用 start()，验证引用仍不丢
    const stream2 = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream2.response);
    const sessionPromise2 = baziSession.start(formData);
    stream2.push({ type: 'complete', report: MOCK_REPORT });
    stream2.close();
    await sessionPromise2;

    expect(useRelayStore.getState().activeByTarget.destiny).toBe('relay-bundle-bazi-999');
    expect(useRelayStore.getState().draftByTarget.destiny).toBe('预填八字草稿');
  });

  it('SSE 流式推进：依次推送 status/section-final/complete 正确流转终态并落盘历史', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream.response);

    const formData = {
      ...createDefaultBaziFormData(),
      name: '流式测试命主',
    };

    const sessionPromise = baziSession.start(formData);

    // 初始状态
    const init = useDestinyWorkspaceStore.getState().bazi;
    expect(init.blockingLoading).toBe(true);
    expect(init.streaming).toBe(true);
    expect(init.streamStatus).toBe('queued');

    // 1. status 帧
    stream.push({ type: 'status', status: 'calculating' });
    await vi.waitFor(() => {
      expect(useDestinyWorkspaceStore.getState().bazi.streamStatus).toBe('calculating');
    });

    // 2. section-final 帧
    stream.push({
      type: 'section-final',
      sectionKey: 'coreDestinyTone',
      payload: MOCK_CORE_TONE,
    });
    await vi.waitFor(() => {
      const mid = useDestinyWorkspaceStore.getState().bazi;
      expect(mid.blockingLoading).toBe(false);
      expect(mid.hasResult).toBe(true);
      expect(mid.lockedSections.coreDestinyTone).toEqual(MOCK_CORE_TONE);
    });

    // 3. complete 帧
    stream.push({ type: 'complete', report: MOCK_REPORT });
    stream.close();
    await sessionPromise;

    const finalState = useDestinyWorkspaceStore.getState().bazi;
    expect(finalState.streaming).toBe(false);
    expect(finalState.streamStatus).toBeNull();
    expect(finalState.report).toBeDefined();
    expect(finalState.step).toBe('result');
    expect(finalState.lastView).toBe('result');

    // 恰好落盘一条历史
    const history = useHistoryStore.getState().items;
    expect(history.length).toBe(1);
    expect(history[0].title).toBe('流式测试命主的八字命理报告');
  });

  it('cancel 静默取消在途流且保持 error 为 null', async () => {
    const stream = manualSseStream();
    authFetchMock.mockResolvedValueOnce(stream.response);

    const formData = createDefaultBaziFormData();
    const sessionPromise = baziSession.start(formData);

    expect(useDestinyWorkspaceStore.getState().bazi.blockingLoading).toBe(true);

    baziSession.cancel();
    stream.close();
    await sessionPromise;

    const state = useDestinyWorkspaceStore.getState().bazi;
    expect(state.blockingLoading).toBe(false);
    expect(state.streaming).toBe(false);
    expect(state.error).toBeNull();
  });

  it('restoreFromHistory 无损恢复且清理 URL 参数', () => {
    const formData = {
      ...createDefaultBaziFormData(),
      name: '历史恢复命主',
    };

    useHistoryStore.setState({
      items: [
        {
          id: 'hist-bazi-1',
          type: 'destiny',
          subType: 'bazi',
          title: '历史恢复命主的八字命理报告',
          preview: '预览文本',
          date: '刚刚',
          model: 'doubao-seed-2-0',
          coreTone: '伤官生财',
          formData: formData as unknown as Record<string, unknown>,
          reportData: {
            report: MOCK_REPORT,
            lockedSections: { coreDestinyTone: MOCK_CORE_TONE },
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    // 模拟 URL 中的 ?historyId=hist-bazi-1
    const originalHref = window.location.href;
    window.history.replaceState({}, '', `${originalHref}?historyId=hist-bazi-1`);

    const success = baziSession.restoreFromHistory('hist-bazi-1');
    expect(success).toBe(true);

    const state = useDestinyWorkspaceStore.getState().bazi;
    expect(state.step).toBe('result');
    expect(state.lastView).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.formData.name).toBe('历史恢复命主');
    expect(state.report).toEqual(MOCK_REPORT);
    expect(state.lockedSections.coreDestinyTone).toEqual(MOCK_CORE_TONE);

    // URL 中的 historyId 被清理
    const url = new URL(window.location.href);
    expect(url.searchParams.has('historyId')).toBe(false);
  });
});
