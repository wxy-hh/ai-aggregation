import { describe, expect, it } from 'vitest';
import {
  sunSignPreview,
  validateStepOne,
  validateStepTwo,
  TIME_PRECISION_OPTIONS,
  APPROXIMATE_RANGES,
} from './astrology-form-utils';
import type { BirthFormData } from './astrology-types';

function baseForm(overrides: Partial<BirthFormData> = {}): BirthFormData {
  return {
    name: '',
    solarDate: { year: 1990, month: 5, day: 15 },
    birthTime: { hour: 20, minute: 30 },
    timePrecision: 'minute',
    approximateRange: null,
    location: { name: '北京市', lat: 39.9, lon: 116.4 },
    timezoneConfirmed: true,
    focusTheme: 'self',
    ...overrides,
  };
}

describe('sunSignPreview（太阳星座即时预览）', () => {
  it('返回正确星座', () => {
    expect(sunSignPreview(5, 15)?.label).toBe('金牛座');
    expect(sunSignPreview(10, 5)?.label).toBe('天秤座');
    expect(sunSignPreview(1, 10)?.label).toBe('摩羯座'); // 跨年边界
    expect(sunSignPreview(3, 25)?.label).toBe('白羊座');
  });

  it('非法日期返回 null', () => {
    expect(sunSignPreview(13, 1)).toBeNull();
    expect(sunSignPreview(0, 1)).toBeNull();
  });
});

describe('时间精度选项', () => {
  it('固定三档，无第四档「只知道日期」', () => {
    expect(TIME_PRECISION_OPTIONS.map((o) => o.value)).toEqual(['minute', 'approximate', 'unknown']);
  });

  it('unknown 档提示「将生成无宫位本命盘」（Copy Deck）', () => {
    const unknown = TIME_PRECISION_OPTIONS.find((o) => o.value === 'unknown');
    expect(unknown?.hint).toBe('将生成无宫位本命盘');
  });

  it('约时段为半开区间候选', () => {
    APPROXIMATE_RANGES.forEach((r) => {
      expect(r.localStart).toMatch(/^\d{2}:\d{2}$/);
      expect(r.localEnd).toMatch(/^\d{2}:\d{2}$/);
    });
  });
});

describe('validateStepOne', () => {
  it('合法通过', () => {
    expect(Object.keys(validateStepOne(baseForm()))).toHaveLength(0);
  });

  it('未来日期报错', () => {
    const errors = validateStepOne(baseForm({ solarDate: { year: 2999, month: 1, day: 1 } }));
    expect(errors.solarDate).toBeTruthy();
  });

  it('昵称为空可接受（可选）', () => {
    expect(Object.keys(validateStepOne(baseForm({ name: '' })))).toHaveLength(0);
  });
});

describe('validateStepTwo', () => {
  it('minute 精度合法通过', () => {
    expect(Object.keys(validateStepTwo(baseForm()))).toHaveLength(0);
  });

  it('minute 缺时间报错', () => {
    const errors = validateStepTwo(baseForm({ birthTime: null }));
    expect(errors.birthTime).toBeTruthy();
  });

  it('unknown 无需时间，可提交', () => {
    const errors = validateStepTwo(baseForm({ timePrecision: 'unknown', birthTime: null, approximateRange: null }));
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('approximate 缺时段报错', () => {
    const errors = validateStepTwo(baseForm({ timePrecision: 'approximate', approximateRange: null }));
    expect(errors.approximateRange).toBeTruthy();
  });

  it('城市缺经纬度报错（模糊文本不可提交）', () => {
    const errors = validateStepTwo(baseForm({ location: { name: '北京', lat: null, lon: null } }));
    expect(errors.location).toBeTruthy();
  });
});
