/**
 * presentation.test.ts —— 展示层领域口径单元测试
 *
 * 核心目标：
 * - 零 mock 真实断言 presentation 模块的 4 个纯函数；
 * - 覆盖 birthSummary 的三时间分支 × 有无 name 形态及 minute 空串兜底；
 * - 覆盖 precisionBadge 的四态（accurate / approximate 稳定 / approximate 降级 / unknown）；
 * - 覆盖 houseSystemLabel 的普拉西德 / 整宫制 / 无宫位三态；
 * - 覆盖 placementTermLine 的上升有无度数、星体完整态（度数+宫位+逆行）与缺项空串。
 */

import { describe, expect, it } from 'vitest';
import type { AstrologyFormData } from '@/app/destiny/_components/astrology-types';
import type { AstrologyChartFacts } from './chart-facts';
import {
  birthSummary,
  houseSystemLabel,
  placementTermLine,
  precisionBadge,
} from './presentation';

/** 构造最小测试用表单数据 */
function makeFormData(overrides?: Partial<AstrologyFormData>): AstrologyFormData {
  return {
    name: '小宇',
    birthDate: { year: 1995, month: 10, day: 24 },
    topic: null,
    timePrecision: 'accurate',
    birthTime: { hour: '14', minute: '30' },
    approximateSlot: '',
    location: { name: '上海', lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai' },
    ...overrides,
  };
}

/** 构造最小测试用星盘事实数据 */
function makeFacts(overrides?: Partial<AstrologyChartFacts>): AstrologyChartFacts {
  return {
    zodiacSystem: 'tropical',
    houseSystem: 'placidus',
    calculatedAt: '2026-09-23T12:00:00.000Z',
    engineVersion: '1.0.0',
    orbTableVersion: 'v1',
    calculationRevision: '1',
    dataCompleteness: 'with-houses',
    planets: [
      {
        body: 'sun',
        sign: 'libra',
        degree: 14.5,
        house: 1,
        retrograde: false,
        stability: 'stable',
      },
      {
        body: 'moon',
        sign: 'taurus',
        degree: 3.2,
        house: 8,
        retrograde: false,
        stability: 'stable',
      },
      {
        body: 'mercury',
        sign: 'scorpio',
        degree: 20.0,
        house: 2,
        retrograde: true,
        stability: 'stable',
      },
    ],
    houses: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, sign: 'aries' })),
    angles: {
      ascendant: { longitude: 200, sign: 'scorpio', degree: 15.3 },
      midheaven: { longitude: 280, sign: 'leo', degree: 10.0 },
    },
    factStability: {
      angles: { displayable: true, reason: null, detail: null },
      houses: { displayable: true, reason: null, detail: null },
      placements: {} as any,
      aspects: { displayable: true, reason: null, detail: null },
      note: null,
    },
    ...overrides,
  } as unknown as AstrologyChartFacts;
}

describe('birthSummary 出生资料摘要', () => {
  it('准确时间（accurate）：默认无 name 时输出 日期 · 时间 · 地点', () => {
    const formData = makeFormData({
      timePrecision: 'accurate',
      birthTime: { hour: '9', minute: '5' },
    });
    const summary = birthSummary(formData);
    expect(summary).toBe('1995 年 10 月 24 日 · 09:05 · 上海');
  });

  it('准确时间（accurate）：传 opts.name 时输出 姓名 · 日期 · 时间 · 地点', () => {
    const formData = makeFormData({
      timePrecision: 'accurate',
      birthTime: { hour: '14', minute: '30' },
    });
    const summary = birthSummary(formData, { name: '小宇' });
    expect(summary).toBe('小宇 · 1995 年 10 月 24 日 · 14:30 · 上海');
  });

  it('准确时间（accurate）：minute 为空串时自动兜底补零为 HH:00', () => {
    const formData = makeFormData({
      timePrecision: 'accurate',
      birthTime: { hour: '8', minute: '' },
    });
    const summary = birthSummary(formData);
    expect(summary).toBe('1995 年 10 月 24 日 · 08:00 · 上海');
  });

  it('大约时段（approximate）：匹配既有时段选项时使用 label', () => {
    const formData = makeFormData({
      timePrecision: 'approximate',
      approximateSlot: '12:00-15:00',
    });
    const summary = birthSummary(formData, { name: '星盘主人' });
    expect(summary).toBe('星盘主人 · 1995 年 10 月 24 日 · 约 12:00–15:00 · 上海');
  });

  it('大约时段（approximate）：未匹配既有时段选项时回落 slot 原始值', () => {
    const formData = makeFormData({
      timePrecision: 'approximate',
      approximateSlot: '下午时分',
    });
    const summary = birthSummary(formData);
    expect(summary).toBe('1995 年 10 月 24 日 · 约 下午时分 · 上海');
  });

  it('未知时间（unknown）：输出「时间未知」', () => {
    const formData = makeFormData({
      timePrecision: 'unknown',
    });
    const summary = birthSummary(formData);
    expect(summary).toBe('1995 年 10 月 24 日 · 时间未知 · 上海');
  });

  it('准确时间但 hour 为空串：回落到「时间未知」', () => {
    const formData = makeFormData({
      timePrecision: 'accurate',
      birthTime: { hour: '', minute: '30' },
    });
    const summary = birthSummary(formData);
    expect(summary).toBe('1995 年 10 月 24 日 · 时间未知 · 上海');
  });

  it('缺失日期或地点时自动过滤空项', () => {
    const formData = makeFormData({
      birthDate: null,
      location: { name: '', lat: null, lon: null, timezone: null },
      timePrecision: 'unknown',
    });
    const summary = birthSummary(formData);
    expect(summary).toBe('时间未知');
  });
});

describe('precisionBadge 时间精度标签', () => {
  it('准确时间（accurate）：返回「准确到分钟」与靛蓝样式令牌', () => {
    const formData = makeFormData({ timePrecision: 'accurate' });
    const facts = makeFacts();
    const badge = precisionBadge(formData, facts);
    expect(badge.text).toBe('准确到分钟');
    expect(badge.className).toContain('text-indigo-700');
    expect(badge.className).toContain('bg-indigo-100/60');
  });

  it('大约时段（approximate）且稳定：返回「大约时段 · 已校验稳定性」与琥珀样式令牌', () => {
    const formData = makeFormData({ timePrecision: 'approximate' });
    const facts = makeFacts({
      factStability: {
        houses: { displayable: true, reason: null, detail: null },
      } as any,
    });
    const badge = precisionBadge(formData, facts);
    expect(badge.text).toBe('大约时段 · 已校验稳定性');
    expect(badge.className).toContain('text-amber-700');
  });

  it('大约时段（approximate）且不稳定降级：返回「约时 · 部分盘面范围不稳定」与琥珀样式令牌', () => {
    const formData = makeFormData({ timePrecision: 'approximate' });
    const facts = makeFacts({
      factStability: {
        houses: { displayable: false, reason: 'unstable-in-range', detail: null },
      } as any,
    });
    const badge = precisionBadge(formData, facts);
    expect(badge.text).toBe('约时 · 部分盘面范围不稳定');
    expect(badge.className).toContain('text-amber-700');
  });

  it('未知时间（unknown）：返回「时间未知 · 无宫位行星盘」与紫罗兰样式令牌', () => {
    const formData = makeFormData({ timePrecision: 'unknown' });
    const facts = makeFacts();
    const badge = precisionBadge(formData, facts);
    expect(badge.text).toBe('时间未知 · 无宫位行星盘');
    expect(badge.className).toContain('text-violet-700');
  });
});

describe('houseSystemLabel 宫制文案', () => {
  it('普拉西德制（placidus）：返回「普拉西德制」', () => {
    const facts = makeFacts({ houseSystem: 'placidus' });
    expect(houseSystemLabel(facts)).toBe('普拉西德制');
  });

  it('整宫制（whole-sign）：返回「整宫制」', () => {
    const facts = makeFacts({ houseSystem: 'whole-sign' });
    expect(houseSystemLabel(facts)).toBe('整宫制');
  });

  it('无宫位或其它情况：返回「无宫位」', () => {
    const facts = makeFacts({ houseSystem: null });
    expect(houseSystemLabel(facts)).toBe('无宫位');
  });
});

describe('placementTermLine 三要素术语行', () => {
  it('上升点（ascendant）有度数：返回星座与格式化度分', () => {
    const facts = makeFacts({
      angles: {
        ascendant: { point: 'ascendant', longitude: 200, sign: 'scorpio', degree: 15.5, stability: 'stable' },
        midheaven: { point: 'midheaven', longitude: 280, sign: 'leo', degree: 10.0, stability: 'stable' },
      },
    });
    expect(placementTermLine(facts, 'ascendant')).toBe('天蝎座 15°30′');
  });

  it('上升点（ascendant）无度数：仅返回星座名称', () => {
    const facts = makeFacts({
      angles: {
        ascendant: { point: 'ascendant', longitude: 200, sign: 'scorpio', degree: null as any, stability: 'signOnly' },
        midheaven: { point: 'midheaven', longitude: 280, sign: 'leo', degree: 10.0, stability: 'stable' },
      },
    });
    expect(placementTermLine(facts, 'ascendant')).toBe('天蝎座');
  });

  it('上升点（ascendant）缺项（无 sign）：返回空字符串', () => {
    const facts = makeFacts({
      angles: {
        ascendant: { point: 'ascendant', longitude: 200, sign: null as any, degree: null as any, stability: 'unstable' },
        midheaven: { point: 'midheaven', longitude: 280, sign: 'leo', degree: 10.0, stability: 'stable' },
      },
    });
    expect(placementTermLine(facts, 'ascendant')).toBe('');
  });

  it('星体（planet）完整态：包含星座度数、宫位与逆行', () => {
    const facts = makeFacts({
      planets: [
        {
          body: 'mercury',
          sign: 'scorpio',
          degree: 20.0,
          house: 2,
          retrograde: true,
          stability: 'stable',
        },
      ],
    });
    expect(placementTermLine(facts, 'mercury' as any)).toBe('天蝎座 20° · 第 2 宫 · 逆行中');
  });

  it('星体（planet）非逆行、无宫位：仅展示星座与度数', () => {
    const facts = makeFacts({
      planets: [
        {
          body: 'sun',
          sign: 'libra',
          degree: 14.5,
          house: null,
          retrograde: false,
          stability: 'stable',
        },
      ],
    });
    expect(placementTermLine(facts, 'sun')).toBe('天秤座 14°30′');
  });

  it('星体（planet）不存在或无 sign：返回空字符串', () => {
    const facts = makeFacts({
      planets: [],
    });
    expect(placementTermLine(facts, 'sun')).toBe('');
  });
});
