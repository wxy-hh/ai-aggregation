import { describe, expect, it } from 'vitest';
import { normalizeDestinyReport } from './report-normalizer';

const request = {
  name: '测试用户',
  gender: 'male' as const,
  birthDate: { year: 1993, month: 8, day: 16 },
  birthTime: { hour: '09', minute: '30' },
  location: { name: '杭州', lat: 30.27, lon: 120.15 },
};

describe('normalizeDestinyReport', () => {
  it('保留并规范人生五维与十神五域新字段', () => {
    const report = normalizeDestinyReport(
      {
        elements: [
          { key: 'water', value: 29 },
          { key: 'metal', value: 21 },
          { key: 'earth', value: 18 },
          { key: 'wood', value: 16 },
          { key: 'fire', value: 12 },
        ],
        tenGods: [
          { key: 'zhengcai', label: '正财', value: 24, tooltip: '偏向稳健积累' },
          { key: 'qisha', label: '七杀', value: 19, tooltip: '执行力强' },
          { key: 'shishen', label: '食神', value: 21, tooltip: '有表达欲' },
          { key: 'zhengyin', label: '正印', value: 28, tooltip: '学习吸收快' },
        ],
        lifeDimensions: [
          { key: 'love', label: '感情', value: 58 },
          { key: 'career', label: '事业', value: 74 },
          { key: 'wisdom', label: '智慧/创造', value: 77 },
          { key: 'health', label: '健康', value: 62 },
          { key: 'wealth', label: '财运', value: 69 },
        ],
        lifeDimensionHighlights: {
          strength: '做事不容易散，越到复杂局面越能稳住节奏。',
          caution: '压力上来时容易想太多，先稳作息再谈爆发力更合适。',
        },
        tenGodDomains: [
          {
            key: 'resource',
            label: '资源与守护',
            technicalLabel: '正印/偏印',
            value: 28,
            description: '吸收快，也愿意把经验内化成方法。',
          },
          {
            key: 'wealth',
            label: '物质与掌控',
            technicalLabel: '正财/偏财',
            value: 24,
            description: '更看重长期回报和可持续积累。',
          },
          {
            key: 'self',
            label: '自我与社交',
            technicalLabel: '比肩/劫财',
            value: 15,
            description: '有主见，但不爱无意义硬碰硬。',
          },
          {
            key: 'order',
            label: '秩序与责任',
            technicalLabel: '正官/七杀',
            value: 19,
            description: '关键时刻愿意扛住责任。',
          },
          {
            key: 'expression',
            label: '创造与表达',
            technicalLabel: '食神/伤官',
            value: 21,
            description: '善于把抽象想法讲清楚。',
          },
        ],
      },
      request,
      2025
    );

    expect(report.lifeDimensions?.map((item) => item.key)).toEqual([
      'career',
      'wealth',
      'health',
      'love',
      'wisdom',
    ]);
    expect(report.lifeDimensionHighlights).toEqual({
      strength: '做事不容易散，越到复杂局面越能稳住节奏。',
      caution: '压力上来时容易想太多，先稳作息再谈爆发力更合适。',
    });
    expect(report.tenGodDomains?.map((item) => item.key)).toEqual([
      'self',
      'expression',
      'wealth',
      'order',
      'resource',
    ]);
  });

  it('缺失新字段时不再从旧十神拼出五域文案，也不猜人生五维', () => {
    const report = normalizeDestinyReport(
      {
        elements: [
          { key: 'metal', value: 22 },
          { key: 'wood', value: 18 },
          { key: 'water', value: 26 },
          { key: 'fire', value: 14 },
          { key: 'earth', value: 20 },
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

    expect(report.lifeDimensions).toBeUndefined();
    expect(report.lifeDimensionHighlights).toBeUndefined();
    expect(report.tenGodDomains).toBeUndefined();
  });

  it('缺失解释性文案时保持空值，不在 normalizer 里二次编写', () => {
    const report = normalizeDestinyReport(
      {
        pillars: [
          { stem: '甲', branch: '子', label: '年柱', element: 'wood', tooltip: '年柱：外在环境与早年基调' },
          { stem: '丙', branch: '寅', label: '月柱', element: 'fire', tooltip: '月柱：事业根基与社会关系' },
          { stem: '戊', branch: '辰', label: '日柱', element: 'earth', tooltip: '日柱：自我与核心驱动力' },
          { stem: '庚', branch: '申', label: '时柱', element: 'metal', tooltip: '时柱：行动方式与未来趋势' },
        ],
        modules: {
          career: { title: '事业发展潜力解析', summary: '', bullets: [] },
        },
      },
      request,
      2025
    );

    expect(report.pillars.every((item) => item.tooltip === '')).toBe(true);
    expect(report.balanceInsight).toEqual({ title: '', value: '', tooltip: '' });
    expect(report.modules.career.summary).toBe('');
  });
});
