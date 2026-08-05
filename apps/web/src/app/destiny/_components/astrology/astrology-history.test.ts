import { describe, expect, it } from 'vitest';
import {
  buildAstrologyHistoryTitle,
  buildAstrologyPreview,
  buildAstrologyHistoryPayload,
  isPreviewSanitized,
} from './astrology-history';
import type { ChartFacts, AstrologyReport, BirthFormData } from './astrology-types';

function makeFacts(withHouses: boolean): ChartFacts {
  return {
    version: 'test',
    calculatedAt: new Date().toISOString(),
    location: { name: '北京市', lat: 39.9, lon: 116.4 },
    birthTimestamp: '1990-05-15',
    bigThree: {
      sun: { sign: 'taurus', label: '金牛座' },
      moon: { sign: 'cancer', label: '巨蟹座' },
      ascendant: { sign: 'libra', label: '天秤座' },
    },
    planets: [],
    houses: withHouses ? [{ number: 1, cuspLongitude: 180, zodiacSign: 'libra', label: '命宫' }] : [],
    aspects: [],
  };
}

function makeReport(): AstrologyReport {
  return {
    title: '星座寰宇 · 小宇的本命星盘',
    coreTone: '在稳定与自由之间，练习把感受说清楚。',
    summary: '',
    readings: [],
    transits: [],
    disclaimer: '',
  };
}

function makeForm(): BirthFormData {
  return {
    name: '小宇',
    solarDate: { year: 1990, month: 5, day: 15 },
    birthTime: { hour: 20, minute: 30 },
    timePrecision: 'minute',
    approximateRange: null,
    location: { name: '北京市', lat: 39.9, lon: 116.4 },
    timezoneConfirmed: true,
    focusTheme: 'self',
  };
}

describe('astrology-history（统一历史 + 脱敏）', () => {
  it('历史标题为「星座寰宇 · {昵称}的本命星盘」', () => {
    expect(buildAstrologyHistoryTitle('小宇')).toBe('星座寰宇 · 小宇的本命星盘');
    expect(buildAstrologyHistoryTitle('')).toBe('星座寰宇 · 匿名的本命星盘');
  });

  it('低敏摘要不含精确时间/度数/上升等可反推内容', () => {
    const preview = buildAstrologyPreview(makeReport());
    expect(isPreviewSanitized(preview)).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(28);
  });

  it('历史载荷为 destiny/astrology 类型且不含精确出生时刻于展示层', () => {
    const payload = buildAstrologyHistoryPayload({ formData: makeForm(), chartFacts: makeFacts(true), report: makeReport() });
    expect(payload.type).toBe('destiny');
    expect(payload.subType).toBe('astrology');
    // formData 展示层不含 birthTime/精确经纬度
    expect(payload.formData).not.toHaveProperty('birthTime');
    expect(payload.formData).not.toHaveProperty('location');
    expect(payload.preview.length).toBeLessThanOrEqual(28);
  });

  it('isPreviewSanitized 拦截含时间/度数/上升的文本', () => {
    expect(isPreviewSanitized('20:30 出生')).toBe(false);
    expect(isPreviewSanitized('上升天秤 15°')).toBe(false);
    expect(isPreviewSanitized('在稳定与自由之间')).toBe(true);
  });
});
