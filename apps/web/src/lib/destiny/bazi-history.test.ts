/**
 * bazi-history.test.ts —— 八字历史落盘薄缝契约测试
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useHistoryStore } from '@/stores/history-store';
import { saveBaziHistoryRecord } from './bazi-history';
import { createDefaultBaziFormData } from '@/app/destiny/_components/bazi-mappers';
import type {
  BaziLockedSections,
  DestinyCoreTone,
  DestinyReport,
} from '@/app/destiny/_components/types';

const MOCK_CORE_TONE: DestinyCoreTone = {
  tag: '正官格',
  chartSummary: '官印相生',
  headline: '为人正直，处事严谨',
  description: '具有极强的自律精神与组织协调能力。',
};

const MOCK_LOCKED_SECTIONS: BaziLockedSections = {
  coreDestinyTone: MOCK_CORE_TONE,
};

const MOCK_REPORT = {
  profile: { name: '张三', gender: 'male', solarDate: '1990-05-01', solarTime: '12:00' },
  coreTone: MOCK_CORE_TONE,
  pillars: [],
  tenGods: [],
  elements: [],
  balanceInsight: { score: 85, strongest: '木', weakest: '金', advice: '补金' },
} as unknown as DestinyReport;

describe('bazi-history 薄缝契约测试', () => {
  beforeEach(() => {
    useHistoryStore.setState({ items: [] });
  });

  it('saveBaziHistoryRecord：正确组装 reportData 并写入统一历史 store', () => {
    const formData = createDefaultBaziFormData();
    formData.name = '王五';

    const item = saveBaziHistoryRecord(formData, MOCK_REPORT, MOCK_LOCKED_SECTIONS, {
      id: 'test-bazi-history-id',
      derivation: {
        derivedFromRelayId: 'relay-bundle-888',
        derivedFromReferenceIds: ['ref-888'],
      },
    });

    expect(item.id).toBe('test-bazi-history-id');
    expect(item.type).toBe('destiny');
    expect(item.subType).toBe('bazi');
    expect(item.title).toBe('王五的八字命理报告');
    expect(item.preview).toBe('为人正直，处事严谨');
    expect(item.coreTone).toBe('正官格');
    expect(item.derivedFromRelayId).toBe('relay-bundle-888');
    expect(item.derivedFromReferenceIds).toEqual(['ref-888']);
    expect(item.reportData).toEqual({
      report: MOCK_REPORT,
      lockedSections: MOCK_LOCKED_SECTIONS,
    });

    const stored = useHistoryStore.getState().items.find((i) => i.id === item.id);
    expect(stored).toBeDefined();
    expect(stored?.title).toBe(item.title);
  });

  it('saveBaziHistoryRecord：preview 来源优先级与 150 字截断', () => {
    const formData = createDefaultBaziFormData();
    formData.name = '赵六';

    // 1. 无 headline，使用 description
    const reportDescOnly = {
      ...MOCK_REPORT,
      coreTone: {
        tag: '七杀格',
        headline: '',
        description: 'B'.repeat(200),
      },
    } as unknown as DestinyReport;

    const itemDesc = saveBaziHistoryRecord(formData, reportDescOnly, MOCK_LOCKED_SECTIONS);
    expect(itemDesc.preview.length).toBe(150);
    expect(itemDesc.preview).toBe('B'.repeat(150));
    expect(itemDesc.coreTone).toBe('七杀格');

    // 2. headline 与 description 均为空，使用兜底文案
    const reportEmptyTone = {
      ...MOCK_REPORT,
      coreTone: undefined,
    } as unknown as DestinyReport;

    const itemFallback = saveBaziHistoryRecord(formData, reportEmptyTone, MOCK_LOCKED_SECTIONS);
    expect(itemFallback.preview).toBe('八字格局精批');
    expect(itemFallback.coreTone).toBe('八字命理');
  });
});
