import { describe, expect, it } from 'vitest';
import type { BaziLockedSections, DestinyReportRequest } from '@/app/destiny/_components/types';
import { normalizeDestinyReport } from './report-normalizer';
import { buildMissingRecoverableSections, parseBaziSectionPayload } from './bazi-section-payload';

const request: DestinyReportRequest = {
  name: '测试用户',
  gender: 'male',
  birthDate: { year: 1993, month: 8, day: 16 },
  birthTime: { hour: '09', minute: '30' },
  location: { name: '杭州', lat: 30.27, lon: 120.15 },
};

function createCoreSections(): BaziLockedSections {
  const report = normalizeDestinyReport(
    {
      profile: {
        name: '测试用户',
        genderLabel: '乾造（男命）',
        birthText: '1993年8月16日 09:30',
        locationText: '杭州',
      },
      coreTone: {
        tag: '核心命理定调',
        chartSummary: '乾造：甲子 丙寅 戊辰 庚申',
        headline: '先稳后发，厚积见成',
        description: '整体节奏偏稳，适合在复杂环境里靠耐心和结构感逐步拉开差距。',
      },
      pillars: [
        {
          stem: '甲',
          branch: '子',
          label: '年柱',
          element: 'wood',
          tooltip: '年柱代表祖基、早年环境和家族底色。这意味着你更容易被原生环境塑造审美和安全感。',
        },
        {
          stem: '丙',
          branch: '寅',
          label: '月柱',
          element: 'fire',
          tooltip:
            '月柱代表提纲，主要看成长氛围、做事习惯和事业根基。这意味着你做事更讲效率与节奏。',
        },
        {
          stem: '戊',
          branch: '辰',
          label: '日柱',
          element: 'earth',
          tooltip:
            '日柱代表自己和夫妻宫，主要看核心性格、自我驱动力与亲密关系反应。这意味着你在关系里更看重稳定与兑现。',
        },
        {
          stem: '庚',
          branch: '申',
          label: '时柱',
          element: 'metal',
          tooltip:
            '时柱代表子女宫与晚景，主要看行动落点、后续发展方向和结果意识。这意味着你越往后越重视结果和沉淀。',
        },
      ],
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
    },
    request,
    2025
  );

  return {
    profileOverview: report.profile,
    coreDestinyTone: report.coreTone,
    pillars: report.pillars,
    elementsAndTenGods: {
      elements: report.elements,
      tenGods: report.tenGods,
      balanceInsight: report.balanceInsight,
      patternHighlights: report.patternHighlights,
      lifeDimensions: report.lifeDimensions,
      lifeDimensionHighlights: report.lifeDimensionHighlights,
      tenGodDomains: report.tenGodDomains,
    },
  };
}

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

describe('buildMissingRecoverableSections', () => {
  it('fills only missing non-core sections with safe fallback payloads', () => {
    const sections = createCoreSections();

    const recovered = buildMissingRecoverableSections(sections, request, 2025);

    expect(recovered.map((item) => item.sectionKey)).toEqual([
      'modulePersonality',
      'moduleCareer',
      'moduleLove',
      'moduleWealth',
      'moduleHealth',
      'timeline',
    ]);
    const moduleCareer = recovered.find((item) => item.sectionKey === 'moduleCareer');
    const moduleLove = recovered.find((item) => item.sectionKey === 'moduleLove');
    const timeline = recovered.find((item) => item.sectionKey === 'timeline');

    expect(
      moduleCareer && !Array.isArray(moduleCareer.payload) ? moduleCareer.payload.title : ''
    ).toBe('事业发展潜力解析');
    expect(moduleLove && !Array.isArray(moduleLove.payload) ? moduleLove.payload.title : '').toBe(
      '感情模式与关系建议'
    );
    expect(timeline?.payload).toEqual([]);
  });
});
