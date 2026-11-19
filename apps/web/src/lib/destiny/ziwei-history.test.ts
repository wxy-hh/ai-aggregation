/**
 * ziwei-history.test.ts —— 紫微斗数历史落盘薄缝契约测试
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useHistoryStore } from '@/stores/history-store';
import { saveZiweiHistoryRecord } from './ziwei-history';
import { createDefaultBaziFormData } from '@/app/destiny/_components/bazi-mappers';
import type {
  DestinyReport,
  ZiweiChartData,
  ZiweiLockedSections,
} from '@/app/destiny/_components/types';

const MOCK_CHART_DATA = {
  solarDate: '2026-11-13',
  palaces: [],
} as unknown as ZiweiChartData;

const MOCK_LOCKED_SECTIONS: ZiweiLockedSections = {
  chartData: MOCK_CHART_DATA,
};

const MOCK_REPORT = {
  profile: { name: '张三', gender: 'male', solarDate: '2026-11-13', solarTime: '12:00' },
  coreTone: {
    tag: '天机天梁',
    headline: '善变谋略，心地慈悲',
    description: '具有极强的企划能力与同理心。',
  },
  pillars: [],
  tenGods: [],
  elements: [],
  balanceInsight: { score: 90, strongest: '木', weakest: '火', advice: '补火' },
} as unknown as DestinyReport;

describe('ziwei-history 薄缝契约测试', () => {
  beforeEach(() => {
    useHistoryStore.setState({ items: [] });
  });

  it('saveZiweiHistoryRecord：正确组装 reportData 并写入统一历史 store', () => {
    const formData = createDefaultBaziFormData();
    formData.name = '王五';

    const item = saveZiweiHistoryRecord(
      formData,
      MOCK_REPORT,
      MOCK_CHART_DATA,
      MOCK_LOCKED_SECTIONS,
      {
        id: 'test-history-id',
        derivation: {
          derivedFromRelayId: 'relay-bundle-123',
          derivedFromReferenceIds: ['ref-1'],
        },
      }
    );

    expect(item.id).toBe('test-history-id');
    expect(item.type).toBe('destiny');
    expect(item.subType).toBe('ziwei');
    expect(item.title).toBe('王五的紫微斗数命理报告');
    expect(item.preview).toBe('善变谋略，心地慈悲');
    expect(item.coreTone).toBe('天机天梁');
    expect(item.derivedFromRelayId).toBe('relay-bundle-123');
    expect(item.derivedFromReferenceIds).toEqual(['ref-1']);
    expect(item.reportData).toEqual({
      report: MOCK_REPORT,
      chartData: MOCK_CHART_DATA,
      lockedSections: MOCK_LOCKED_SECTIONS,
    });

    const stored = useHistoryStore.getState().items.find((i) => i.id === item.id);
    expect(stored).toBeDefined();
    expect(stored?.title).toBe(item.title);
  });

  it('saveZiweiHistoryRecord：preview 来源优先级与 150 字截断', () => {
    const formData = createDefaultBaziFormData();
    formData.name = '赵六';

    // 1. 无 headline，使用 description
    const reportDescOnly = {
      ...MOCK_REPORT,
      coreTone: {
        tag: '紫微独坐',
        headline: '',
        description: 'B'.repeat(200),
      },
    } as unknown as DestinyReport;

    const itemDesc = saveZiweiHistoryRecord(
      formData,
      reportDescOnly,
      MOCK_CHART_DATA,
      MOCK_LOCKED_SECTIONS
    );
    expect(itemDesc.preview.length).toBe(150);
    expect(itemDesc.preview).toBe('B'.repeat(150));
    expect(itemDesc.coreTone).toBe('紫微独坐');

    // 2. headline 与 description 均为空，使用兜底文案
    const reportEmptyTone = {
      ...MOCK_REPORT,
      coreTone: undefined,
    } as unknown as DestinyReport;

    const itemFallback = saveZiweiHistoryRecord(
      formData,
      reportEmptyTone,
      MOCK_CHART_DATA,
      MOCK_LOCKED_SECTIONS
    );
    expect(itemFallback.preview).toBe('紫微斗数星盘分析');
    expect(itemFallback.coreTone).toBe('紫微斗数');
  });
});
