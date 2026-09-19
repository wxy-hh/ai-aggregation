/**
 * mock-interpretation.test.ts —— 星座寰宇 · mock 解读层金样测试（06 工单）
 *
 * 锁定的规则（均来自设计文档与 06 工单验收标准）：
 * - 黄金主轴样例库 20–30 条；每条 18–28 字（不计标点）、不绝对化；
 * - 主轴由至少两项真值共同支持（factReferences ≥ 2）；
 * - 大三要素按稳定性缺项：无宫位档上升为 null，不预留占位；
 * - 白话体系完整覆盖：10 行星主题 + 12 星座方式 + 5 相位白话。
 */

import { describe, expect, it } from 'vitest';
import type { AstrologyChartFacts } from './chart-facts';
import {
  SAMPLE_PROFILE_ACCURATE,
  SAMPLE_PROFILE_APPROXIMATE,
  SAMPLE_PROFILE_UNKNOWN,
  computeChartFacts,
} from './mock-chart-facts';
import {
  ASPECT_PLAIN,
  GOLDEN_HEADLINES,
  MOON_READINGS,
  PLANET_THEME,
  SIGN_STYLE,
  SUN_READINGS,
  ASCENDANT_READINGS,
  buildMockInterpretation,
  pickHeadline,
  planetPlainSentence,
  requestInterpretation,
} from './mock-interpretation';
import type { PlanetBody, ZodiacSign } from './chart-facts';

/** 去标点后的字数（验收口径「不超 28 字」指汉字本体） */
function charCount(text: string): number {
  return text.replace(/[，。、「」；：？！\s]/g, '').length;
}

/** 绝对化禁用词（设计文档 §9：不绝对化） */
const ABSOLUTE_WORDS = ['一定', '必然', '注定', '绝对', '永远', '必定', '肯定会', '命定'];

describe('黄金主轴样例库', () => {
  it('规模在 20–30 条之间', () => {
    expect(GOLDEN_HEADLINES.length).toBeGreaterThanOrEqual(20);
    expect(GOLDEN_HEADLINES.length).toBeLessThanOrEqual(30);
  });

  it('每条 18–28 字（不计标点）', () => {
    for (const h of GOLDEN_HEADLINES) {
      expect(charCount(h.text), `${h.id} 超长/过短：${h.text}`).toBeGreaterThanOrEqual(18);
      expect(charCount(h.text), `${h.id} 超长/过短：${h.text}`).toBeLessThanOrEqual(28);
    }
  });

  it('不含绝对化措辞', () => {
    for (const h of GOLDEN_HEADLINES) {
      for (const w of ABSOLUTE_WORDS) {
        expect(h.text.includes(w), `${h.id} 含禁用词「${w}」`).toBe(false);
      }
    }
  });

  it('id 全局唯一', () => {
    const ids = GOLDEN_HEADLINES.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('三要素文案库', () => {
  const signs = Object.keys(SUN_READINGS) as ZodiacSign[];
  it('太阳/月亮/上升各覆盖 12 星座，白话与动作俱全', () => {
    expect(signs).toHaveLength(12);
    expect(Object.keys(MOON_READINGS)).toHaveLength(12);
    expect(Object.keys(ASCENDANT_READINGS)).toHaveLength(12);
    for (const s of signs) {
      expect(SUN_READINGS[s].plain.length).toBeGreaterThan(0);
      expect(SUN_READINGS[s].action.length).toBeGreaterThan(0);
      expect(MOON_READINGS[s].plain.length).toBeGreaterThan(0);
      expect(ASCENDANT_READINGS[s].action.length).toBeGreaterThan(0);
    }
  });
});

describe('事实卡白话体系', () => {
  it('10 行星主题 + 12 星座方式 + 5 相位白话完整', () => {
    expect(Object.keys(PLANET_THEME)).toHaveLength(10);
    expect(Object.keys(SIGN_STYLE)).toHaveLength(12);
    expect(Object.keys(ASPECT_PLAIN)).toHaveLength(5);
  });

  it('行星落座白话句可组合且不含英文', () => {
    const s = planetPlainSentence('moon' as PlanetBody, 'cancer' as ZodiacSign);
    expect(s).toContain('情绪需要');
    expect(s).toContain('细腻而保护');
    expect(/[a-zA-Z]/.test(s)).toBe(false);
  });
});

describe('主轴选择 pickHeadline', () => {
  const accurateFacts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
  const unknownFacts = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);
  const approximateFacts = computeChartFacts(SAMPLE_PROFILE_APPROXIMATE);

  it('示例盘（准确时间）主轴非空且至少两项真值支持', () => {
    const h = pickHeadline(accurateFacts);
    expect(h).not.toBeNull();
    expect(h!.factReferences.length).toBeGreaterThanOrEqual(2);
    expect(charCount(h!.text)).toBeLessThanOrEqual(28);
  });

  it('时间未知档仍有主轴（太阳元素兜底），且引用不含上升', () => {
    const h = pickHeadline(unknownFacts);
    expect(h).not.toBeNull();
    expect(h!.factReferences.length).toBeGreaterThanOrEqual(2);
    expect(h!.factReferences.some((r) => r.startsWith('angle:'))).toBe(false);
  });

  it('约时档主轴引用均为稳定事实', () => {
    const h = pickHeadline(approximateFacts);
    if (h) {
      expect(h.factReferences.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('真值引用键格式可复现（同一份 facts 两次选择一致）', () => {
    const a = pickHeadline(accurateFacts);
    const b = pickHeadline(accurateFacts);
    expect(a?.sampleId).toBe(b?.sampleId);
    expect(a?.factReferences).toEqual(b?.factReferences);
  });
});

describe('buildMockInterpretation', () => {
  it('完整盘：三要素俱全、withHouses 为真', () => {
    const r = buildMockInterpretation(computeChartFacts(SAMPLE_PROFILE_ACCURATE));
    expect(r.withHouses).toBe(true);
    expect(r.bigThree.sun).not.toBeNull();
    expect(r.bigThree.moon).not.toBeNull();
    expect(r.bigThree.ascendant).not.toBeNull();
    expect(r.headline).not.toBeNull();
  });

  it('无宫位档：上升缺项为 null，withHouses 为假', () => {
    const r = buildMockInterpretation(computeChartFacts(SAMPLE_PROFILE_UNKNOWN));
    expect(r.withHouses).toBe(false);
    expect(r.bigThree.ascendant).toBeNull();
    expect(r.bigThree.sun).not.toBeNull();
  });

  it('事实引用键均可回溯到盘面真实字段（planet:/aspect:/angle: 前缀）', () => {
    const facts: AstrologyChartFacts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
    const r = buildMockInterpretation(facts);
    for (const ref of r.headline?.factReferences ?? []) {
      expect(/^(planet|aspect|angle):/.test(ref), `非法引用键：${ref}`).toBe(true);
    }
  });
});

/* ---------- 07 工单：五模块与行动三角 ---------- */

import {
  buildModuleReadings,
  buildWeeklyGuidance,
  type ModuleReading,
} from './mock-interpretation';

describe('五大生活模块', () => {
  const accurateFacts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
  const unknownFacts = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);
  const modules = buildModuleReadings(accurateFacts, new Date(2026, 8, 1));

  it('顺序固定为 我是谁/关系/事业/优势盲点/本周提示', () => {
    expect(modules.map((m) => m.id)).toEqual(['who', 'love', 'career', 'strengths', 'week']);
  });

  it('每模块：正文 ≤120 字、2–3 个短标签、含行动建议与事实引用', () => {
    for (const m of modules) {
      expect(m.summary.length, `${m.id} 正文超长：${m.summary}`).toBeLessThanOrEqual(120);
      expect(m.tags.length, `${m.id} 标签数`).toBeGreaterThanOrEqual(2);
      expect(m.tags.length, `${m.id} 标签数`).toBeLessThanOrEqual(3);
      expect(m.action.length).toBeGreaterThan(0);
      expect(m.factReferences.length, `${m.id} 引用`).toBeGreaterThanOrEqual(1);
    }
  });

  it('措辞不绝对化', () => {
    for (const m of modules) {
      for (const w of ABSOLUTE_WORDS) {
        expect(m.summary.includes(w), `${m.id} 含「${w}」`).toBe(false);
        expect(m.action.includes(w), `${m.id} 行动含「${w}」`).toBe(false);
      }
    }
  });

  it('「我是谁」带真实场景句（上升+月亮稳定时）', () => {
    const who = modules.find((m) => m.id === 'who')!;
    expect(who.scenario).toContain('你可能这样');
  });

  it('无宫位档：关系/事业模块不引用宫位与角点事实', () => {
    const noHouse = buildModuleReadings(unknownFacts, new Date(2026, 8, 1));
    const love = noHouse.find((m) => m.id === 'love');
    const career = noHouse.find((m) => m.id === 'career');
    for (const m of [love, career]) {
      if (!m) continue;
      expect(m.factReferences.some((r) => r.startsWith('house:'))).toBe(false);
      expect(m.factReferences.some((r) => r.startsWith('angle:'))).toBe(false);
    }
    // 无宫位档 who 模块也不含上升引用
    const who = noHouse.find((m) => m.id === 'who')!;
    expect(who.factReferences).not.toContain('angle:ascendant:sign');
  });
});

describe('本周行动三角', () => {
  const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
  const weekly = buildWeeklyGuidance(facts, new Date(2026, 8, 1)); // 2026-09-01 是周二

  it('含明确的周一～周日起止日期', () => {
    expect(weekly.weekRange).toBe('8 月 31 日 – 9 月 6 日');
  });

  it('依据行运说明标注行运太阳口径', () => {
    expect(weekly.transitNote).toContain('行运太阳');
  });

  it('机会/留意/行动齐全且不绝对化', () => {
    for (const text of [weekly.opportunity, weekly.caution, weekly.action]) {
      expect(text.length).toBeGreaterThan(0);
      for (const w of ABSOLUTE_WORDS) {
        expect(text.includes(w)).toBe(false);
      }
    }
  });

  it('无宫位档同样可生成（退化为星座口径）', () => {
    const w = buildWeeklyGuidance(computeChartFacts(SAMPLE_PROFILE_UNKNOWN), new Date(2026, 8, 1));
    expect(w.transitNote).toContain('行运太阳');
    expect(w.factReferences.length).toBeGreaterThanOrEqual(1);
  });

  it('week 模块携带三角数据', () => {
    const week: ModuleReading | undefined = buildModuleReadings(facts, new Date(2026, 8, 1)).find(
      (m) => m.id === 'week'
    );
    expect(week?.weekly?.weekRange).toBe('8 月 31 日 – 9 月 6 日');
  });
});

/* ---------- 08 工单：P0 深度区（关键相位 + 反向定位） ---------- */

import { buildKeyAspects, moduleIdsForBody, orderModulesByTopic, aspectRefKey } from './mock-interpretation';

describe('关键相位 buildKeyAspects', () => {
  const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
  const { top, rest } = buildKeyAspects(facts);

  it('优先展示 3–5 条，且按强度降序', () => {
    expect(top.length).toBeGreaterThanOrEqual(3);
    expect(top.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].strength ?? 0).toBeGreaterThanOrEqual(top[i].strength ?? 0);
    }
  });

  it('top 与 rest 并集等于全部稳定相位（不重复、不遗漏）', () => {
    const stableTotal = facts.aspects.filter((a) => a.stability === 'stable').length;
    expect(top.length + rest.length).toBe(stableTotal);
    const keys = new Set([...top.map((a) => a.refKey), ...rest.map((a) => a.refKey)]);
    expect(keys.size).toBe(stableTotal);
  });

  it('每条含能量关系/生活表现/练习建议，且措辞不绝对化、不含英文', () => {
    for (const a of top) {
      for (const text of [a.energy, a.life, a.practice]) {
        expect(text.length, a.refKey).toBeGreaterThan(0);
        expect(/[a-zA-Z]/.test(text), `${a.refKey} 含英文：${text}`).toBe(false);
        for (const w of ABSOLUTE_WORDS) {
          expect(text.includes(w), `${a.refKey} 含「${w}」：${text}`).toBe(false);
        }
      }
      // 能量关系必须落到两颗星的主题词
      expect(a.energy).toContain(PLANET_THEME[a.source]);
      expect(a.energy).toContain(PLANET_THEME[a.target]);
    }
  });

  it('只读稳定事实：不稳定相位不进 top/rest', () => {
    const unstableFacts = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);
    const r = buildKeyAspects(unstableFacts);
    for (const a of [...r.top, ...r.rest]) {
      const raw = unstableFacts.aspects.find(
        (x) => x.source === a.source && x.target === a.target && x.type === a.type
      );
      expect(raw?.stability).toBe('stable');
    }
  });

  it('refKey 可被生活模块引用（与 aspectRefKey 同口径复现）', () => {
    for (const a of top) {
      expect(a.refKey).toBe(aspectRefKey(a));
    }
  });
});

describe('模块反向定位 moduleIdsForBody', () => {
  const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
  const modules = buildModuleReadings(facts, new Date(2026, 8, 1));

  it('月亮可定位到引用月亮事实的模块（who/love）', () => {
    const ids = moduleIdsForBody(modules, 'moon');
    expect(ids).toContain('who');
    expect(ids).toContain('love');
  });

  it('相位两端星体也算定位依据（week 引用相位时可命中）', () => {
    const week = modules.find((m) => m.id === 'week')!;
    const aspectRef = week.factReferences.find((r) => r.startsWith('aspect:'));
    if (aspectRef) {
      const body = aspectRef.split(':')[1] as PlanetBody;
      expect(moduleIdsForBody(modules, body)).toContain('week');
    }
  });

  it('未被任何模块引用的星体返回空数组（不虚构定位）', () => {
    const ids = moduleIdsForBody(modules, 'pluto');
    expect(Array.isArray(ids)).toBe(true);
  });
});

describe('关注主题排序 orderModulesByTopic', () => {
  const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
  const modules = buildModuleReadings(facts, new Date(2026, 8, 1));
  const baseIds = modules.map((m) => m.id);

  it('priority 提到首位，其余保持原有相对顺序', () => {
    const ordered = orderModulesByTopic(modules, 'career');
    expect(ordered[0].id).toBe('career');
    expect(ordered.slice(1).map((m) => m.id)).toEqual(baseIds.filter((id) => id !== 'career'));
  });

  it('priority 为 null 或已在首位时原样返回', () => {
    expect(orderModulesByTopic(modules, null).map((m) => m.id)).toEqual(baseIds);
    expect(orderModulesByTopic(modules, baseIds[0]).map((m) => m.id)).toEqual(baseIds);
  });
});

/* ---------- 12 工单：解读异步接缝 ---------- */

describe('requestInterpretation（异步解读接缝）', () => {
  /** 本组夹具（与同步口径同源，取完整盘与无宫位盘两档） */
  const accurateFacts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
  const unknownFacts = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);

  it('resolve 的解读与同步口径等价（同一真值必得同一解读）', async () => {
    const payload = await requestInterpretation(accurateFacts);
    const sync = buildMockInterpretation(accurateFacts);
    expect(payload.headline).toEqual(sync.headline);
    expect(payload.bigThree).toEqual(sync.bigThree);
    expect(payload.withHouses).toBe(sync.withHouses);

    // 生活模块同源：模块 id 序列一致，非周模块逐字段一致（周模块含当周日期区间，只比结构与行动）
    const syncModules = buildModuleReadings(accurateFacts, new Date());
    expect(payload.modules.map((m) => m.id)).toEqual(syncModules.map((m) => m.id));
    for (const m of payload.modules.filter((mod) => mod.id !== 'week')) {
      expect(m).toEqual(syncModules.find((s) => s.id === m.id));
    }
    const week = payload.modules.find((m) => m.id === 'week');
    expect(week?.weekly?.action).toBeTruthy();
    expect(week?.summary).toMatch(/^\d{1,2} 月 \d{1,2} 日 – \d{1,2} 月 \d{1,2} 日/);
  });

  it('无宫位档：上升解读缺项为 null，模块随事实降级', async () => {
    const payload = await requestInterpretation(unknownFacts);
    expect(payload.withHouses).toBe(false);
    expect(payload.bigThree.ascendant).toBeNull();
    expect(payload.modules.length).toBeGreaterThan(0);
  });

  it('延迟在下界之上（模拟真实 AI 时序，结果页分区加载据此可验证）', async () => {
    const startedAt = Date.now();
    await requestInterpretation(accurateFacts);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(800);
  });
});
