/**
 * qimen-history.test.ts —— 奇门遁甲历史落盘薄缝契约测试
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useHistoryStore } from '@/stores/history-store';
import { saveQimenHistoryRecord } from './qimen-history';
import { createDefaultQimenFormData } from '@/app/destiny/_components/qimen-mappers';
import type {
  QimenAnalysisBaseResult,
  QimenAsyncSections,
} from '@/app/destiny/_components/qimen-types';

const MOCK_BASE_RESULT: QimenAnalysisBaseResult = {
  chartTitle: '甲申日乙丑时盘局',
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
  score: 85,
  disclaimer: '仅供参考',
};

const MOCK_SECTIONS: QimenAsyncSections = {
  strategyOverview: {
    overallAssessment: '运筹帷幄',
    actionSuggestions: ['谋定而后动'],
    riskAlerts: ['防范暗箭'],
  },
  timingWindows: [{ period: '午时', guidance: '诸事皆宜' }],
  chartSummary: '全局大吉',
};

describe('qimen-history 薄缝契约测试', () => {
  beforeEach(() => {
    useHistoryStore.setState({ items: [] });
  });

  it('saveQimenHistoryRecord：正确组装 reportData 并写入统一历史 store', () => {
    const formData = createDefaultQimenFormData();
    formData.description = '求测今日商业合作能否顺利达成，对方条件如何？';

    const item = saveQimenHistoryRecord(
      formData,
      MOCK_BASE_RESULT,
      MOCK_SECTIONS,
      'analysis-101'
    );

    expect(item.id).toBeDefined();
    expect(item.type).toBe('destiny');
    expect(item.subType).toBe('qimen');
    expect(item.title).toBe('奇门遁甲推演 · 甲申日乙丑时盘局');
    expect(item.preview).toBe('求测今日商业合作能否顺利达成，对方条件如何？');
    expect(item.coreTone).toBe('甲申日乙丑时盘局');
    expect(item.reportData).toEqual({
      baseResult: MOCK_BASE_RESULT,
      sections: MOCK_SECTIONS,
      analysisId: 'analysis-101',
      formData,
    });

    const stored = useHistoryStore.getState().items.find((i) => i.id === item.id);
    expect(stored).toBeDefined();
    expect(stored?.title).toBe(item.title);
  });

  it('saveQimenHistoryRecord：超长描述自动截断 150 字，空描述兜底', () => {
    const formData = createDefaultQimenFormData();
    formData.description = 'A'.repeat(200);

    const itemLong = saveQimenHistoryRecord(
      formData,
      MOCK_BASE_RESULT,
      MOCK_SECTIONS,
      'analysis-102'
    );
    expect(itemLong.preview).toBe('A'.repeat(150));

    formData.description = '';
    const itemEmpty = saveQimenHistoryRecord(
      formData,
      { ...MOCK_BASE_RESULT, chartTitle: '' },
      MOCK_SECTIONS,
      'analysis-103'
    );
    expect(itemEmpty.preview).toBe('奇门遁甲推演');
    expect(itemEmpty.title).toBe('奇门遁甲推演 · 盘局分析');
  });

  it('saveQimenHistoryRecord：失败分区错误随 reportData 持久化', () => {
    const formData = createDefaultQimenFormData();
    formData.description = '验证失败分区恢复';

    const item = saveQimenHistoryRecord(
      formData,
      MOCK_BASE_RESULT,
      { timingWindows: MOCK_SECTIONS.timingWindows },
      'analysis-section-errors',
      {
        sectionErrors: { strategyOverview: '综合格局评估生成失败' },
      }
    );

    expect(item.reportData).toMatchObject({
      sectionErrors: { strategyOverview: '综合格局评估生成失败' },
    });
  });

  it('saveQimenHistoryRecord：支持稳定 id 与接力 derivation 注入', () => {
    const formData = createDefaultQimenFormData();
    formData.description = '接力推演测试';

    const derivation = {
      derivedFromRelayId: 'bundle-test-888',
      derivedFromReferenceIds: ['ref-1', 'ref-2'],
    };

    const item = saveQimenHistoryRecord(
      formData,
      MOCK_BASE_RESULT,
      MOCK_SECTIONS,
      'analysis-104',
      {
        id: 'stable-uuid-999',
        derivation,
      }
    );

    expect(item.id).toBe('stable-uuid-999');
    expect(item.derivedFromRelayId).toBe('bundle-test-888');
    expect(item.derivedFromReferenceIds).toEqual(['ref-1', 'ref-2']);
  });
});
