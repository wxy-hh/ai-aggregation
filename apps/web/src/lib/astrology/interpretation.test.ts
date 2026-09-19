/**
 * interpretation.test.ts —— 星座寰宇 · 解读层契约与组装纯函数（03 工单；T5 并入事实卡白话库覆盖）
 *
 * 锁定的外部行为：
 * - 允许引用键白名单只登记已确认稳定、可定位的字段（无宫位档不出现宫位与角点）；
 * - 关键相位只认盘面稳定存在的相位（模型编造/不稳定相位的文案一律丢弃）；
 * - week 模块三角组装：区间与行运说明由系统生成，正文合计不超 120 字，引用只用筛后行运；
 * - 行运引用键参与反向定位，且与相位键格式区分；
 * - 事实卡白话库（结果页/深读区渲染的生产文案）覆盖齐备、不含英文、不绝对化。
 */

import { describe, expect, it } from 'vitest';
import {
  ASPECT_PLAIN,
  ASCENDANT_READINGS,
  ASTROLOGY_MODULE_ORDER,
  attachWeeklyGuidance,
  buildFactReferenceKeys,
  buildKeyAspectReadings,
  buildTransitNote,
  formatWeekRange,
  MAX_MODULE_SUMMARY_CHARS,
  MOON_READINGS,
  moduleIdsForBody,
  orderModulesByTopic,
  PLANET_THEME,
  planetPlainSentence,
  resolveKeyAspectList,
  SIGN_STYLE,
  SUN_READINGS,
  transitRefKey,
  type AstrologyTransitsSection,
  type ModuleReading,
} from './interpretation';
import type { PlanetBody, ZodiacSign } from './chart-facts';
import { computeChartFacts } from './chart-engine';
import { SAMPLE_PROFILE_ACCURATE, SAMPLE_PROFILE_UNKNOWN } from './sample-chart';

const ACCURATE = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
const UNKNOWN = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);

function moduleOf(id: ModuleReading['id'], summary: string): ModuleReading {
  return {
    id,
    title: '标题',
    summary,
    tags: ['标签一', '标签二'],
    action: '行动',
    factReferences: ['planet:sun:sign'],
  };
}

const TRANSITS: AstrologyTransitsSection = {
  weekRange: '9 月 1 日 – 9 月 7 日',
  transitNote: '行运太阳正与本命金星成合相（偏差约 1.2°）',
  opportunity: '机会',
  caution: '留意',
  action: '行动',
  transitReferences: ['transit:sun:conjunction:venus'],
  keyAspects: [],
};

describe('允许引用键白名单', () => {
  it('含宫位档：行星星座 / 逆行 / 角点 / 宫位 / 稳定相位齐备', () => {
    const keys = buildFactReferenceKeys(ACCURATE);
    expect(keys).toContain('planet:sun:sign');
    expect(keys).toContain('angle:ascendant:sign');
    expect(keys).toContain('angle:midheaven:sign');
    expect(keys.some((k) => k.startsWith('house:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('aspect:'))).toBe(true);
    // 只登记稳定相位：不稳定相位不得出现在白名单
    const stableCount = ACCURATE.aspects.filter((a) => a.stability === 'stable').length;
    expect(keys.filter((k) => k.startsWith('aspect:'))).toHaveLength(stableCount);
  });

  it('无宫位档：不出现宫位与角点引用键（AI 不可能引用到被隐藏字段）', () => {
    const keys = buildFactReferenceKeys(UNKNOWN);
    expect(keys.some((k) => k.startsWith('house:'))).toBe(false);
    expect(keys.some((k) => k.startsWith('angle:'))).toBe(false);
    expect(keys).toContain('planet:sun:sign');
  });

  it('行运键只来自传入的筛后行运（不自动纳入全部行运）', () => {
    expect(buildFactReferenceKeys(ACCURATE).some((k) => k.startsWith('transit:'))).toBe(false);
    const withTransits = buildFactReferenceKeys(ACCURATE, {
      transitRefKeys: ['transit:moon:square:sun'],
    });
    expect(withTransits).toContain('transit:moon:square:sun');
  });
});

describe('关键相位合并', () => {
  const stable = ACCURATE.aspects.filter((a) => a.stability === 'stable');
  const first = stable[0];
  const copy = {
    refKey: `aspect:${[first.source, first.target].sort()[0]}:${first.type}:${[first.source, first.target].sort()[1]}`,
    energy: '能量',
    life: '生活',
    practice: '练习',
  };

  it('模型文案落到对应稳定相位上（三段式 + 事实字段）', () => {
    const readings = buildKeyAspectReadings(ACCURATE, [copy]);
    expect(readings).toHaveLength(1);
    expect(readings[0].source).toBe(first.source);
    expect(readings[0].orb).toBe(first.orb);
    expect(readings[0].practice).toBe('练习');
  });

  it('编造引用键与不稳定相位一律丢弃，重复引用只取第一条', () => {
    const readings = buildKeyAspectReadings(ACCURATE, [
      { ...copy, refKey: 'aspect:sun:trine:pluto' },
      copy,
      { ...copy, life: '重复' },
    ]);
    expect(readings).toHaveLength(1);
    expect(readings[0].life).toBe('生活');
  });

  it('top 与 rest 并集等于全部稳定相位，top 按强度降序且不超 5 条', () => {
    const copies = stable.slice(0, 8).map((a) => {
      const [x, y] = [a.source, a.target].sort();
      return { refKey: `aspect:${x}:${a.type}:${y}`, energy: 'e', life: 'l', practice: 'p' };
    });
    const { top, rest } = resolveKeyAspectList(ACCURATE, copies);
    expect(top.length).toBeLessThanOrEqual(5);
    expect(top.length + rest.length).toBe(stable.length);
    for (let i = 1; i < top.length; i += 1) {
      expect(top[i - 1].strength ?? 0).toBeGreaterThanOrEqual(top[i].strength ?? 0);
    }
  });
});

describe('week 模块三角组装', () => {
  const modules = [
    moduleOf('who', '我是谁正文'),
    moduleOf('love', '关系正文'),
    moduleOf('career', '事业正文'),
    moduleOf('strengths', '优势正文'),
    moduleOf('week', '本周关注点，保持节奏。'),
  ];

  it('transits 未到达时原样返回（week 模块保持无三角）', () => {
    const result = attachWeeklyGuidance(modules, null);
    expect(result).toBe(modules);
    expect(result.find((m) => m.id === 'week')?.weekly).toBeUndefined();
  });

  it('组装后：摘要 = 区间：行运说明。+ 模型正文，三角引用筛后行运', () => {
    const result = attachWeeklyGuidance(modules, TRANSITS);
    const week = result.find((m) => m.id === 'week')!;
    expect(week.summary).toBe(
      '9 月 1 日 – 9 月 7 日：行运太阳正与本命金星成合相（偏差约 1.2°）。本周关注点，保持节奏。'
    );
    expect(week.summary.length).toBeLessThanOrEqual(MAX_MODULE_SUMMARY_CHARS);
    expect(week.weekly).toEqual({
      weekRange: TRANSITS.weekRange,
      transitNote: TRANSITS.transitNote,
      opportunity: '机会',
      caution: '留意',
      action: '行动',
      factReferences: ['transit:sun:conjunction:venus'],
    });
    expect(week.action).toBe('行动');
    expect(week.factReferences).toEqual(['transit:sun:conjunction:venus']);
  });

  it('模型正文过长时只留系统前缀（绝不截断句子），模块顺序保持固定', () => {
    const long = attachWeeklyGuidance(
      modules.map((m) => (m.id === 'week' ? { ...m, summary: '正'.repeat(200) } : m)),
      TRANSITS
    );
    const week = long.find((m) => m.id === 'week')!;
    expect(week.summary).toBe('9 月 1 日 – 9 月 7 日：行运太阳正与本命金星成合相（偏差约 1.2°）。');
    expect(long.map((m) => m.id)).toEqual(ASTROLOGY_MODULE_ORDER);
  });

  it('模型未产出 week 模块时补齐（标题与标签取系统默认，三角照常）', () => {
    const result = attachWeeklyGuidance(
      modules.filter((m) => m.id !== 'week'),
      TRANSITS
    );
    const week = result.find((m) => m.id === 'week')!;
    expect(week.title).toBe('本周宇宙提示');
    expect(week.tags).toEqual(['本周', '行运']);
    expect(week.weekly?.action).toBe('行动');
  });
});

describe('行运引用与定位', () => {
  it('行运键格式与相位键区分，且参与反向定位', () => {
    const key = transitRefKey({ transitingBody: 'moon', aspect: 'square', natalTarget: 'sun' });
    expect(key).toBe('transit:moon:square:sun');
    const modules = [
      { ...moduleOf('who', '我是谁'), factReferences: [key] },
      { ...moduleOf('love', '关系'), factReferences: ['planet:venus:sign'] },
    ];
    expect(moduleIdsForBody(modules, 'moon')).toEqual(['who']);
    expect(moduleIdsForBody(modules, 'sun')).toEqual(['who']);
    expect(orderModulesByTopic(modules, 'love')[0].id).toBe('love');
  });
});

describe('本周区间与行运说明', () => {
  it('按出生城市时区把半开窗口格式化为「X 月 X 日 – X 月 X 日」', () => {
    // 2026-08-31T00:00:00Z 起的一周（UTC 自然周），上海时区显示为 8 月 31 日 – 9 月 6 日
    const start = Date.parse('2026-08-31T00:00:00Z');
    expect(formatWeekRange(start, start + 7 * 24 * 3600 * 1000, 'Asia/Shanghai')).toBe(
      '8 月 31 日 – 9 月 6 日'
    );
  });

  it('行运说明标注行运星体、本命对象、相位与偏差', () => {
    expect(
      buildTransitNote({ transitingBody: 'sun', natalTarget: 'venus', aspect: 'conjunction', orb: 1.234 })
    ).toBe('行运太阳正与本命金星成合相（偏差约 1.2°）');
  });
});

/* ---------- T5：事实卡白话库（自退役的 mock 模板测试迁入的生产文案覆盖） ---------- */

/**
 * 白话库是展示层词汇（不是 AI 产出）：结果页星体卡、深读区与等价文本列表直接渲染它们，
 * 因此按「生产可见文案」的标准锁定——覆盖齐备、可组合、界面不出现英文占星术语。
 */
describe('事实卡白话库', () => {
  const SIGNS = Object.keys(SUN_READINGS) as ZodiacSign[];

  it('太阳/月亮/上升各覆盖 12 星座，白话与动作俱全', () => {
    expect(SIGNS).toHaveLength(12);
    expect(Object.keys(MOON_READINGS)).toHaveLength(12);
    expect(Object.keys(ASCENDANT_READINGS)).toHaveLength(12);
    for (const sign of SIGNS) {
      expect(SUN_READINGS[sign].plain.length, sign).toBeGreaterThan(0);
      expect(SUN_READINGS[sign].action.length, sign).toBeGreaterThan(0);
      expect(MOON_READINGS[sign].plain.length, sign).toBeGreaterThan(0);
      expect(MOON_READINGS[sign].action.length, sign).toBeGreaterThan(0);
      expect(ASCENDANT_READINGS[sign].plain.length, sign).toBeGreaterThan(0);
      expect(ASCENDANT_READINGS[sign].action.length, sign).toBeGreaterThan(0);
    }
  });

  it('10 行星主题 + 12 星座方式 + 5 相位白话完整', () => {
    expect(Object.keys(PLANET_THEME)).toHaveLength(10);
    expect(Object.keys(SIGN_STYLE)).toHaveLength(12);
    expect(Object.keys(ASPECT_PLAIN)).toHaveLength(5);
    for (const text of [...Object.values(PLANET_THEME), ...Object.values(SIGN_STYLE), ...Object.values(ASPECT_PLAIN)]) {
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('行星落座白话句由主题词与星座方式组合而成', () => {
    const sentence = planetPlainSentence('moon' as PlanetBody, 'cancer' as ZodiacSign);
    expect(sentence).toContain(PLANET_THEME.moon);
    expect(sentence).toContain(SIGN_STYLE.cancer);
  });

  it('全库文案不含拉丁字母（界面不出现英文占星术语）', () => {
    const all = [
      ...SIGNS.flatMap((sign) => [
        SUN_READINGS[sign].plain,
        SUN_READINGS[sign].action,
        MOON_READINGS[sign].plain,
        MOON_READINGS[sign].action,
        ASCENDANT_READINGS[sign].plain,
        ASCENDANT_READINGS[sign].action,
      ]),
      ...Object.values(PLANET_THEME),
      ...Object.values(SIGN_STYLE),
      ...Object.values(ASPECT_PLAIN),
    ];
    for (const text of all) {
      expect(/[a-zA-Z]/.test(text), `含拉丁字母：${text}`).toBe(false);
    }
  });
});
