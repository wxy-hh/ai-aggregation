import { describe, expect, it } from 'vitest';
import { buildBaziPromptPayload, computeBaziChart } from '@repo/shared';

const input = {
  name: '测试用户',
  gender: 'male' as const,
  calendarType: 'lunar' as const, // 农历
  birthDate: { year: 1993, month: 8, day: 16 },
  birthTime: { hour: '09', minute: '30' },
  location: { name: '杭州', lat: 30.27, lon: 120.16 },
};

describe('computeBaziChart', () => {
  it('生成确定性的排盘依据、流年种子与 prompt payload', () => {
    const basis = computeBaziChart(input, { referenceYear: 2025 });
    const promptPayload = buildBaziPromptPayload(basis);

    expect(basis.profile.chartSummary).toMatch(/^乾造：/);
    expect(basis.solarTime.standard.text).toMatch(/1993年10月1日/);
    expect(basis.correction.applied).toBe(true);
    expect(basis.correction.summary).toMatch(/向后顺延|向前回拨/);
    expect(basis.correction.offsetSeconds).not.toBe(0);
    expect(basis.pillars).toHaveLength(4);
    expect(basis.elementStats).toHaveLength(5);
    expect(basis.tenGodStats.length).toBeGreaterThanOrEqual(4);
    expect(basis.reportSeed.pillars).toHaveLength(4);
    expect(basis.reportSeed.elements).toHaveLength(5);
    expect(basis.reportSeed.tenGods).toHaveLength(4);
    expect(basis.annualCycles.map((item) => item.year)).toEqual([2025, 2026, 2027]);
    expect(promptPayload.deterministicFacts).toHaveProperty('solarTerms');
    expect(promptPayload.litePromptPayload).toHaveProperty('annualCycles');
  });

  it('农历 2026-04-19 北京中午的真太阳时修正正确', () => {
    const basis = computeBaziChart(
      {
        name: '测试',
        gender: 'male',
        calendarType: 'lunar',
        birthDate: { year: 2026, month: 4, day: 19 },
        birthTime: { hour: '12', minute: '00' },
        location: { name: '北京', lat: 39.9, lon: 116.4 },
      },
      { referenceYear: 2026 }
    );

    // 标准时间从农历转换过来
    expect(basis.solarTime.standard.text).toMatch(/2026年6月4日/);

    // 北京约东经 116.4°，标准子午线 120°E
    // 经度偏移: (116.4 - 120) × 240 = -864 秒 = -14.4 分钟 → 向前回拨
    expect(basis.correction.longitudeOffset).toBe(-864);

    // 阳历6月4日的均时差由 calculateEquationOfTime 算出
    expect(basis.correction.applied).toBe(true);
    expect(basis.correction.offsetSeconds).toBeLessThan(0);

    // 修正后的时间应在 11:45 ~ 11:50
    const corrected = basis.solarTime.corrected;
    expect(corrected.hour).toBe(11);
    expect(corrected.minute).toBeGreaterThanOrEqual(40);
    expect(corrected.minute).toBeLessThanOrEqual(50);

    // 验证具体修正量
    expect(basis.correction.summary).toContain('经度修正向前回拨 14.4 分钟');
    expect(basis.correction.summary).toContain('均时差修正');
    expect(basis.correction.summary).toContain('总计向前回拨');
  });
});
