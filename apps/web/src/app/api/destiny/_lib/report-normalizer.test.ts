import { describe, expect, it } from 'vitest';
import { normalizeDestinyReport } from './report-normalizer';

const input = {
  name: '测试用户',
  gender: 'male' as const,
  birthDate: { year: 1994, month: 5, day: 12 },
  birthTime: { hour: '09', minute: '30' },
  location: { name: '上海', lat: 31.23, lon: 121.47 },
};

describe('normalizeDestinyReport', () => {
  it('should normalize timeline years to current+2', () => {
    const report = normalizeDestinyReport(
      {
        pillars: [
          { stem: '甲', branch: '子', label: '年柱', element: 'wood', tooltip: '年柱说明' },
          { stem: '乙', branch: '丑', label: '月柱', element: 'earth', tooltip: '月柱说明' },
          { stem: '丙', branch: '寅', label: '日柱', element: 'fire', tooltip: '日柱说明' },
          { stem: '丁', branch: '卯', label: '时柱', element: 'wood', tooltip: '时柱说明' },
        ],
        elements: [
          { key: 'metal', value: 10 },
          { key: 'wood', value: 20 },
          { key: 'water', value: 30 },
          { key: 'fire', value: 40 },
          { key: 'earth', value: 50 },
        ],
        tenGods: [{ key: 'a', label: '偏财', value: 120 }],
        modules: {
          career: { title: '事业', summary: '事业总结', bullets: ['A'] },
          love: { title: '感情', summary: '感情总结', bullets: ['B'] },
          wealth: { title: '财运', summary: '财运总结', bullets: ['C'] },
          health: { title: '健康', summary: '健康总结', bullets: ['D'] },
          personality: { title: '性格', summary: '性格总结', bullets: ['E'] },
        },
        timeline: [{ year: 2000, title: '旧年', summary: '说明', detail: {} }],
      },
      input,
      2026
    );

    expect(report.timeline.map((item) => item.year)).toEqual([2026, 2027, 2028]);
    expect(report.tenGods[0]?.value).toBeGreaterThanOrEqual(0);
    expect(report.tenGods[0]?.value).toBeLessThanOrEqual(100);
    expect(report.elements).toHaveLength(5);
  });
});
