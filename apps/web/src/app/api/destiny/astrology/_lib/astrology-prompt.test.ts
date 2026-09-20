/**
 * astrology-prompt.test.ts —— 解读提示词与事实层负载（03 工单）
 *
 * 锁定的外部行为：
 * - 降级忠实：不稳定字段一律不进提示词，隐藏清单明令不得编造（无宫位档无上升/天顶/宫位）；
 * - 行运只带筛后 Top N，行动三角只能引用它们；
 * - 允许引用键表与事实层口径一致（无宫位档没有 angle:/house: 键）；
 * - 提示词把 18–28 字主轴要求、四分区结构、黄金样例（28 条）与不绝对化铁律写清楚。
 */

import { describe, expect, it } from 'vitest';
import { computeChartFacts } from '@/lib/astrology/chart-engine';
import { MAX_PROMPT_TRANSITS, selectActiveTransits } from '@/lib/astrology/transit-selection';
import { SAMPLE_PROFILE_ACCURATE, SAMPLE_PROFILE_APPROXIMATE, SAMPLE_PROFILE_UNKNOWN } from '@/lib/astrology/sample-chart';
import { buildGoldenHeadlinePromptSection } from './golden-headlines';
import {
  buildAstrologyPromptPayload,
  buildAstrologySystemPrompt,
  buildAstrologyUserPrompt,
  MAX_PROMPT_ASPECTS,
} from './astrology-prompt';

const ACCURATE = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
const APPROXIMATE = computeChartFacts(SAMPLE_PROFILE_APPROXIMATE);
const UNKNOWN = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);

const WEEK_START = Date.UTC(2026, 7, 31);
const WEEK_WINDOW = { weekStartMs: WEEK_START, weekEndMs: WEEK_START + 7 * 24 * 3600 * 1000 };

function payloadOf(facts: typeof ACCURATE, timePrecision: 'accurate' | 'approximate' | 'unknown') {
  return buildAstrologyPromptPayload(facts, {
    timePrecision,
    selectedTransits: selectActiveTransits(facts, WEEK_WINDOW),
  });
}

describe('事实层过滤（降级忠实）', () => {
  it('含宫位档：星座 / 度数 / 宫位 / 角点 / 宫位表齐备', () => {
    const payload = payloadOf(ACCURATE, 'accurate');
    expect(payload.dataCompleteness).toBe('with-houses');
    expect(payload.houses).toHaveLength(12);
    expect(payload.angles.map((a) => a.point)).toEqual(['ascendant', 'midheaven']);
    expect(payload.planets.some((p) => p.degree !== null && p.house !== null)).toBe(true);
    expect(payload.hiddenFacts.every((line) => !line.includes('出生时间未知'))).toBe(true);
  });

  it('时间未知档：无上升 / 天顶 / 宫位，行星不带度数，隐藏清单明令不得编造', () => {
    const payload = payloadOf(UNKNOWN, 'unknown');
    expect(payload.dataCompleteness).toBe('without-houses');
    expect(payload.houses).toEqual([]);
    expect(payload.angles).toEqual([]);
    expect(payload.planets.every((p) => p.degree === null && p.house === null)).toBe(true);
    expect(payload.hiddenFacts.join()).toContain('出生时间未知');
    // 白名单同样不含角点与宫位键：模型连键都拿不到
    expect(Object.keys(payload.factReferenceKeys).some((k) => k.startsWith('angle:'))).toBe(false);
    expect(Object.keys(payload.factReferenceKeys).some((k) => k.startsWith('house:'))).toBe(false);
  });

  it('约时档：不稳定行星与相位不进提示词，度数只给稳定项', () => {
    const payload = payloadOf(APPROXIMATE, 'approximate');
    const unstableBodies = APPROXIMATE.planets.filter((p) => p.stability === 'unstable').map((p) => p.body);
    for (const body of unstableBodies) {
      expect(payload.planets.some((p) => p.body === body)).toBe(false);
    }
    const signOnly = APPROXIMATE.planets.filter((p) => p.stability === 'signOnly');
    for (const placement of signOnly) {
      const mirrored = payload.planets.find((p) => p.body === placement.body);
      if (mirrored) expect(mirrored.degree).toBeNull();
    }
    const stableAspects = APPROXIMATE.aspects.filter((a) => a.stability === 'stable').length;
    expect(payload.aspects.length).toBe(Math.min(stableAspects, MAX_PROMPT_ASPECTS));
  });

  it('相位只带稳定项、按强度降序、条数不超上限', () => {
    const payload = payloadOf(ACCURATE, 'accurate');
    const stableCount = ACCURATE.aspects.filter((a) => a.stability === 'stable').length;
    expect(payload.aspects.length).toBe(Math.min(stableCount, MAX_PROMPT_ASPECTS));
    for (let i = 1; i < payload.aspects.length; i += 1) {
      expect(payload.aspects[i - 1].strength).toBeGreaterThanOrEqual(payload.aspects[i].strength);
    }
  });

  it('行运只带筛后 Top N（≤8 条），且引用键表包含这些行运键', () => {
    const payload = payloadOf(ACCURATE, 'accurate');
    const selected = selectActiveTransits(ACCURATE, WEEK_WINDOW);
    expect(payload.transits.length).toBeLessThanOrEqual(MAX_PROMPT_TRANSITS);
    expect(payload.transits.map((t) => t.refKey)).toEqual(selected.map((s) => s.refKey));
    for (const transit of payload.transits) {
      expect(payload.factReferenceKeys[transit.refKey]).toBeTruthy();
    }
  });

  it('引用键释义与事实层同口径（键可直接用于界面依据片）', () => {
    const payload = payloadOf(ACCURATE, 'accurate');
    expect(payload.factReferenceKeys['planet:sun:sign']).toBe('太阳落天秤座');
    const firstAspect = payload.aspects[0];
    expect(payload.factReferenceKeys[firstAspect.refKey]).toContain(' ');
    const firstTransit = payload.transits[0];
    expect(firstTransit.refKey).toMatch(/^transit:[a-z]+:[a-z]+:[a-z]+$/);
    expect(payload.factReferenceKeys[firstTransit.refKey]).toContain('本命');
  });
});

describe('提示词组装', () => {
  const system = buildAstrologySystemPrompt();

  it('四分区结构与顺序写在系统提示词里', () => {
    expect(system.indexOf('"headline"')).toBeGreaterThan(-1);
    expect(system.indexOf('"headline"')).toBeLessThan(system.indexOf('"bigThree"'));
    expect(system.indexOf('"bigThree"')).toBeLessThan(system.indexOf('"modules"'));
    expect(system.indexOf('"modules"')).toBeLessThan(system.indexOf('"transits"'));
  });

  it('主轴 18–28 字、依据至少两项、不绝对化、不编造隐藏字段等铁律齐备', () => {
    expect(system).toContain('18–28 字');
    expect(system).toContain('至少由两项事实共同支持');
    expect(system).toContain('hiddenFacts');
    expect(system).toContain('factReferenceKeys');
    expect(system).toContain('一定、必然、注定、绝对、永远');
    expect(system).toContain('3–5 条');
  });

  it('黄金主轴样例 28 条以 few-shot 形式注入', () => {
    const section = buildGoldenHeadlinePromptSection();
    expect(system).toContain(section);
    expect(section.split('\n')).toHaveLength(28);
  });

  it('用户提示词带出生资料口径、确定性事实、引用键表与禁止提及清单', () => {
    const payload = payloadOf(UNKNOWN, 'unknown');
    const user = buildAstrologyUserPrompt({
      profile: { name: '小宇', birthDate: { year: 1995, month: 10, day: 10 } },
      timePrecisionLabel: '完全未知（只按出生当日的稳定事实解读）',
      cityLabel: '上海',
      payload,
    });
    expect(user).toContain('称呼：小宇');
    expect(user).toContain('出生地：上海');
    expect(user).toContain('无宫位行星盘');
    expect(user).toContain('deterministicFacts');
    expect(user).toContain('factReferenceKeys');
    expect(user).toContain('禁止提及、猜测或暗示');
    expect(user).toContain('出生时间未知');
    expect(user).not.toContain('angle:ascendant:sign');
  });
});
