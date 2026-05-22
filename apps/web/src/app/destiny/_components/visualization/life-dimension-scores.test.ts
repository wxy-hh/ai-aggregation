import { describe, expect, it } from 'vitest';
import {
  deriveLifeDimensionsFromBasis,
  normalizeAiLifeDimensionValues,
  resolveLifeDimensionsForDisplay,
} from './life-dimension-scores';

describe('life-dimension-scores', () => {
  it('从五行统计推导的五维分值落在可读区间', () => {
    const result = deriveLifeDimensionsFromBasis({
      profile: {
        name: '测试',
        genderLabel: '乾造',
        birthText: '1990年1月1日',
        locationText: '北京',
      },
      elementStats: [
        { key: 'wood', label: '木', value: 10, sources: { stems: 1, branches: 0, hiddenStems: 0, seasonalBonus: 0 } },
        { key: 'fire', label: '火', value: 30, sources: { stems: 2, branches: 1, hiddenStems: 0, seasonalBonus: 0 } },
        { key: 'earth', label: '土', value: 20, sources: { stems: 1, branches: 1, hiddenStems: 0, seasonalBonus: 0 } },
        { key: 'metal', label: '金', value: 25, sources: { stems: 1, branches: 1, hiddenStems: 0, seasonalBonus: 0 } },
        { key: 'water', label: '水', value: 15, sources: { stems: 1, branches: 0, hiddenStems: 0, seasonalBonus: 0 } },
      ],
      tenGodStats: [],
      solarTime: { corrected: { text: '09:00' } },
      correction: { summary: '校正说明' },
      dayMaster: { stem: '甲', element: 'wood', yinYang: 'yang' },
    } as never);

    const fire = result.find((item) => item.key === 'career');
    const wood = result.find((item) => item.key === 'health');
    expect(fire?.value).toBeGreaterThan(wood?.value ?? 0);
    result.forEach((item) => {
      expect(item.value).toBeGreaterThanOrEqual(42);
      expect(item.value).toBeLessThanOrEqual(88);
    });
  });

  it('有排盘依据时优先本地分值并保留 AI 标签', () => {
    const resolved = resolveLifeDimensionsForDisplay({
      lifeDimensions: [
        { key: 'career', label: '事业发展', value: 8 },
        { key: 'wealth', label: '财富积累', value: 6 },
        { key: 'health', label: '身心状态', value: 7 },
        { key: 'love', label: '情感关系', value: 5 },
        { key: 'wisdom', label: '认知智慧', value: 9 },
      ],
      baziBasis: {
        elementStats: [
          { key: 'fire', label: '火', value: 40, sources: { stems: 2, branches: 1, hiddenStems: 0, seasonalBonus: 0 } },
          { key: 'earth', label: '土', value: 20, sources: { stems: 1, branches: 1, hiddenStems: 0, seasonalBonus: 0 } },
          { key: 'metal', label: '金', value: 15, sources: { stems: 1, branches: 0, hiddenStems: 0, seasonalBonus: 0 } },
          { key: 'water', label: '水', value: 15, sources: { stems: 1, branches: 0, hiddenStems: 0, seasonalBonus: 0 } },
          { key: 'wood', label: '木', value: 10, sources: { stems: 1, branches: 0, hiddenStems: 0, seasonalBonus: 0 } },
        ],
      } as never,
    });

    expect(resolved?.find((item) => item.key === 'career')?.label).toBe('事业发展');
    expect(resolved?.find((item) => item.key === 'career')?.value).toBeGreaterThan(60);
  });

  it('仅有 AI 低分时做相对拉伸', () => {
    const normalized = normalizeAiLifeDimensionValues([
      { key: 'career', label: '事业', value: 8 },
      { key: 'wealth', label: '财运', value: 12 },
      { key: 'health', label: '健康', value: 10 },
      { key: 'love', label: '感情', value: 6 },
      { key: 'wisdom', label: '智慧', value: 9 },
    ]);

    expect(normalized.find((item) => item.key === 'wealth')?.value).toBeGreaterThan(
      normalized.find((item) => item.key === 'love')?.value ?? 0
    );
    normalized.forEach((item) => {
      expect(item.value).toBeGreaterThanOrEqual(48);
    });
  });
});
