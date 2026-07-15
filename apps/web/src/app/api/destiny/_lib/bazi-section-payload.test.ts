import { describe, expect, it } from 'vitest';
import type { DestinyReportRequest } from '@/app/destiny/_components/types';
import { parseBaziSectionPayload } from './bazi-section-payload';

const request: DestinyReportRequest = {
  name: '测试用户',
  gender: 'male',
  calendarType: 'lunar', // 农历
  birthDate: { year: 1993, month: 8, day: 16 },
  birthTime: { hour: '09', minute: '30' },
  location: { name: '杭州', lat: 30.27, lon: 120.15 },
};

describe('parseBaziSectionPayload', () => {
  it('recovers malformed module bullets payload without aborting the whole report', () => {
    const result = parseBaziSectionPayload({
      sectionKey: 'moduleLove',
      rawPayload:
        '{"title":"感情运势指南","summary":"你在亲密关系中很有担当，愿意主动付出照顾伴侣，只要多些耐心沟通，避免太固执的争执，感情就能稳步升温走向安稳。","bullets":"对伴侣很有担当","多主动沟通交流","避免无谓争执"]}',
      input: request,
      currentYear: 2025,
    });

    expect(result.recovery).toBe('recovered');
    expect(result.payload.title).toBe('感情运势指南');
    expect(result.payload.summary).toContain('你在亲密关系中很有担当');
    expect(result.payload.bullets).toEqual(['对伴侣很有担当', '多主动沟通交流', '避免无谓争执']);
  });

  it('keeps core elements and ten gods strict while ignoring malformed optional enrichment fields', () => {
    const result = parseBaziSectionPayload({
      sectionKey: 'elementsAndTenGods',
      rawPayload: JSON.stringify({
        elements: [
          { key: 'metal', label: '金', value: 22 },
          { key: 'wood', label: '木', value: 18 },
          { key: 'water', label: '水', value: 26 },
          { key: 'fire', label: '火', value: 14 },
          { key: 'earth', label: '土', value: 20 },
        ],
        tenGods: [
          { key: 'piancai', label: '偏财', value: 32, tooltip: '机会型收入与资源整合' },
          { key: 'shishen', label: '食神/伤官', value: 25, tooltip: '表达力与创造力' },
          { key: 'zhengguan', label: '正官/七杀', value: 23, tooltip: '规则、压力与目标感' },
          { key: 'pianyin', label: '偏印/枭神', value: 20, tooltip: '学习吸收与独立思考' },
        ],
        balanceInsight: { title: '命局偏强' },
        patternHighlights: [{ label: '伤官配印' }],
        lifeDimensionHighlights: { strength: '只给一句' },
        tenGodDomains: [{ key: 'self', label: '自我与社交' }],
      }),
      input: request,
      currentYear: 2025,
    });

    expect(result.recovery).toBe('none');
    expect(result.payload.elements).toHaveLength(5);
    expect(result.payload.tenGods).toHaveLength(4);
    expect(result.payload.balanceInsight).toEqual({ title: '', value: '', tooltip: '' });
    expect(result.payload.patternHighlights).toEqual([]);
    expect(result.payload.lifeDimensionHighlights).toBeUndefined();
    expect(result.payload.tenGodDomains).toBeUndefined();
  });
});

