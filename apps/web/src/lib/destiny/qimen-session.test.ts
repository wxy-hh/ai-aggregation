/**
 * qimen-session.test.ts —— 奇门遁甲会话命令模块时序与契约测试 (TC03)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }));

import { authFetch } from '@/lib/api/client';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { useRelayStore } from '@/stores/relay-store';
import { createDefaultQimenFormData } from '@/app/destiny/_components/qimen-mappers';
import { qimenSession, _resetQimenSessionForTest } from './qimen-session';
import type {
  QimenAnalysisBaseResult,
  QimenAsyncSections,
  QimenFormData,
} from '@/app/destiny/_components/qimen-types';

const authFetchMock = vi.mocked(authFetch);

const MOCK_BASE: QimenAnalysisBaseResult = {
  chartTitle: '甲申日盘',
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
  score: 90,
  disclaimer: '免责声明',
};

const MOCK_STRATEGY: NonNullable<QimenAsyncSections['strategyOverview']> = {
  overallAssessment: '运筹帷幄',
  actionSuggestions: ['主动出击'],
  riskAlerts: ['注意防范'],
};

const MOCK_TIMING: NonNullable<QimenAsyncSections['timingWindows']> = [
  { period: '未时', guidance: '宜合作' },
];

const MOCK_SUMMARY: NonNullable<QimenAsyncSections['chartSummary']> = '全局盘面概述内容';

function createMockResponse(data: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

describe('qimen-session 会话命令深模块 (TC03)', () => {
  let sampleFormData: QimenFormData;

  beforeEach(() => {
    vi.useFakeTimers();
    authFetchMock.mockReset();
    useDestinyWorkspaceStore.getState().resetAllWorkspaces();
    useHistoryStore.setState({ items: [] });
    useRelayStore.getState().clearActiveForTarget('destiny');
    useRelayStore.getState().clearDraftForTarget('destiny');
    _resetQimenSessionForTest();

    sampleFormData = {
      ...createDefaultQimenFormData(),
      datetime: '2026-11-13 10:00',
      location: { name: '上海', lat: 31.23, lon: 121.47 },
      description: '测试奇门分析会话命令模块，所问之事详细说明',
    };
  });

  afterEach(() => {
    _resetQimenSessionForTest();
    vi.useRealTimers();
  });

  it('TC03-1: start(formData) 发起分析，修改 store 表单值不污染历史快照', async () => {
    // 模拟 start 返回成功
    authFetchMock.mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/destiny/qimen/analyze/start')) {
        return createMockResponse({ success: true, analysisId: 'aid-1001' });
      }
      if (urlStr.includes('/sections/baseResult')) {
        return createMockResponse({ success: true, data: MOCK_BASE, status: 'completed' });
      }
      if (urlStr.includes('/sections/strategyOverview')) {
        return createMockResponse({ success: true, data: MOCK_STRATEGY, status: 'completed' });
      }
      if (urlStr.includes('/sections/timingWindows')) {
        return createMockResponse({ success: true, data: MOCK_TIMING, status: 'completed' });
      }
      if (urlStr.includes('/sections/chartSummary')) {
        return createMockResponse({ success: true, data: MOCK_SUMMARY, status: 'completed' });
      }
      return createMockResponse({ error: 'not found' }, 404, false);
    });

    const startPromise = qimenSession.start(sampleFormData);

    // 在 start 执行中修改 store 的 formData（模拟用户在界面输入脏写）
    useDestinyWorkspaceStore.getState().setWorkspaceState('qimen', {
      formData: {
        ...sampleFormData,
        description: '被污染的描述',
      },
    });

    await startPromise;

    // 验证 start 接口恰好被调用一次
    const startCalls = authFetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/destiny/qimen/analyze/start')
    );
    expect(startCalls.length).toBe(1);

    // 验证历史记录中的 formData 是 start 时的快照，未被后续脏写污染
    const historyItems = useHistoryStore.getState().items;
    expect(historyItems.length).toBe(1);
    const savedFormData = ((historyItems[0] as any)?.reportData as any)?.formData;
    expect(savedFormData.description).toBe('测试奇门分析会话命令模块，所问之事详细说明');
  });

  it('TC03-2: 202 pending 响应后，fake timers 推进 1500ms 触发重试请求', async () => {
    let baseFetchCount = 0;
    authFetchMock.mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/destiny/qimen/analyze/start')) {
        return createMockResponse({ success: true, analysisId: 'aid-202' });
      }
      if (urlStr.includes('/sections/baseResult')) {
        baseFetchCount += 1;
        if (baseFetchCount === 1) {
          return createMockResponse({ status: 'pending' }, 202);
        }
        return createMockResponse({ success: true, data: MOCK_BASE, status: 'completed' });
      }
      if (urlStr.includes('/sections/strategyOverview')) {
        return createMockResponse({ success: true, data: MOCK_STRATEGY, status: 'completed' });
      }
      if (urlStr.includes('/sections/timingWindows')) {
        return createMockResponse({ success: true, data: MOCK_TIMING, status: 'completed' });
      }
      if (urlStr.includes('/sections/chartSummary')) {
        return createMockResponse({ success: true, data: MOCK_SUMMARY, status: 'completed' });
      }
      return createMockResponse({}, 404, false);
    });

    const promise = qimenSession.start(sampleFormData);

    // 微任务轮询使得首轮 start 与首个 baseResult 请求发出并返回 202
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(baseFetchCount).toBe(1);

    // 推进 1500ms 触发重试
    await vi.advanceTimersByTimeAsync(1500);
    expect(baseFetchCount).toBe(2);

    await promise;
    expect(useDestinyWorkspaceStore.getState().qimen.step).toBe('result');
  });

  it('TC03-3: 三分区全部 settled 后恰好落盘 1 次历史，且完成 Relay 闭环', async () => {
    // 注入活动接力包
    useRelayStore.setState({
      activeByTarget: { destiny: 'bundle-qimen-relay-1' } as any,
      draftByTarget: { destiny: '接力草稿文本' } as any,
      bundles: {
        'bundle-qimen-relay-1': {
          id: 'bundle-qimen-relay-1',
          source: 'chat',
          target: 'destiny',
          items: [{ id: 'ref-item-1', source: 'chat', type: 'text', snapshotText: '所问之事' }],
          createdAt: Date.now(),
        },
      } as any,
    });

    authFetchMock.mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/destiny/qimen/analyze/start')) {
        return createMockResponse({ success: true, analysisId: 'aid-relay' });
      }
      if (urlStr.includes('/sections/baseResult')) {
        return createMockResponse({ success: true, data: MOCK_BASE, status: 'completed' });
      }
      if (urlStr.includes('/sections/strategyOverview')) {
        return createMockResponse({ success: true, data: MOCK_STRATEGY, status: 'completed' });
      }
      if (urlStr.includes('/sections/timingWindows')) {
        // 局部失败依然算 settled
        return createMockResponse({ status: 'failed', error: '分区超时' });
      }
      if (urlStr.includes('/sections/chartSummary')) {
        return createMockResponse({ success: true, data: MOCK_SUMMARY, status: 'completed' });
      }
      return createMockResponse({}, 404, false);
    });

    await qimenSession.start(sampleFormData);

    const historyItems = useHistoryStore.getState().items;
    expect(historyItems.length).toBe(1);
    expect(historyItems[0]?.derivedFromRelayId).toBe('bundle-qimen-relay-1');
    expect(historyItems[0]?.derivedFromReferenceIds).toEqual(['ref-item-1']);

    // Relay 闭环验证：active 与 draft 被清除
    expect(useRelayStore.getState().activeByTarget.destiny).toBeNull();
    expect(useRelayStore.getState().draftByTarget.destiny).toBe('');

    // 此时再模拟一次迟到分区调用，不会重复落盘
    useDestinyWorkspaceStore.getState().applyQimenSectionResult('timingWindows', {
      status: 'failed',
      error: '迟到的错误',
    });
    expect(useHistoryStore.getState().items.length).toBe(1);
  });

  it('TC03-4: restoreFromHistory 重建工作区且不产生新历史，URL 参数被清理', () => {
    // 注入一条历史记录
    useHistoryStore.setState({
      items: [
        {
          id: 'hist-qimen-restore-1',
          type: 'destiny',
          subType: 'qimen',
          title: '历史测试',
          preview: '历史预览',
          date: '刚刚',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: 'doubao',
          formData: sampleFormData,
          reportData: {
            analysisId: 'aid-restored',
            baseResult: MOCK_BASE,
            sections: { strategyOverview: MOCK_STRATEGY, chartSummary: MOCK_SUMMARY },
            formData: sampleFormData,
          },
        } as any,
      ],
    });

    window.history.pushState({}, '', '/destiny?module=qimen&historyId=hist-qimen-restore-1');

    const ok = qimenSession.restoreFromHistory('hist-qimen-restore-1');
    expect(ok).toBe(true);

    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.step).toBe('result');
    expect(state.hasResult).toBe(true);
    expect(state.analysisId).toBe('aid-restored');
    expect(state.sectionStatuses.strategyOverview).toBe('completed');
    expect(state.sectionStatuses.timingWindows).toBe('idle');
    expect(state.sectionStatuses.chartSummary).toBe('completed');

    // 不产生新的历史条目
    expect(useHistoryStore.getState().items.length).toBe(1);

    // URL 中的 historyId 被清理
    expect(new URL(window.location.href).searchParams.has('historyId')).toBe(false);
  });

  it('TC03-5: cancel() 中止在途请求、清除定时器，store error 保持 null，保留已算结果', async () => {
    let aborted = false;
    authFetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/destiny/qimen/analyze/start')) {
        return createMockResponse({ success: true, analysisId: 'aid-cancel' });
      }
      if (urlStr.includes('/sections/baseResult')) {
        return createMockResponse({ success: true, data: MOCK_BASE, status: 'completed' });
      }
      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          aborted = true;
        });
      }
      // 挂起分区请求
      return new Promise(() => {});
    });

    void qimenSession.start(sampleFormData);
    await vi.runOnlyPendingTimersAsync();

    expect(useDestinyWorkspaceStore.getState().qimen.baseResult).toEqual(MOCK_BASE);
    expect(useDestinyWorkspaceStore.getState().qimen.blockingLoading).toBe(true);

    // 取消
    qimenSession.cancel();

    expect(aborted).toBe(true);
    const state = useDestinyWorkspaceStore.getState().qimen;
    expect(state.blockingLoading).toBe(false);
    expect(state.error).toBeNull();
    // 已算的 baseResult 保留
    expect(state.baseResult).toEqual(MOCK_BASE);
  });

  it('TC03-6: reset() 弃局，旧 run 迟到响应被双哨兵丢弃且重置工作区', async () => {
    let resolveBase: (resp: Response) => void;
    const basePromise = new Promise<Response>((res) => {
      resolveBase = res;
    });

    authFetchMock.mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/destiny/qimen/analyze/start')) {
        return createMockResponse({ success: true, analysisId: 'aid-reset' });
      }
      if (urlStr.includes('/sections/baseResult')) {
        return basePromise;
      }
      return createMockResponse({}, 404);
    });

    void qimenSession.start(sampleFormData);
    await vi.runOnlyPendingTimersAsync();

    // 在 baseResult 返回前执行 reset()
    qimenSession.reset();

    const stateAfterReset = useDestinyWorkspaceStore.getState().qimen;
    expect(stateAfterReset.step).toBe('form');
    expect(stateAfterReset.analysisId).toBeNull();

    // 迟到的 baseResult 返回
    resolveBase!(createMockResponse({ success: true, data: MOCK_BASE, status: 'completed' }));
    await vi.runOnlyPendingTimersAsync();

    // 验证迟到数据被双哨兵抛弃，并未写入工作区
    const finalState = useDestinyWorkspaceStore.getState().qimen;
    expect(finalState.baseResult).toBeNull();
    expect(finalState.analysisId).toBeNull();
  });

  it('TC03-7: 测试隔离：beforeEach 调用 _resetQimenSessionForTest 互无串扰', async () => {
    // 验证新测试运行时 runId 已被隔断且控制器已清理
    expect(useDestinyWorkspaceStore.getState().qimen.analysisId).toBeNull();
    expect(useHistoryStore.getState().items.length).toBe(0);
  });
});
