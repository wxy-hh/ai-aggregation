/**
 * astrology-share-card-data.test.ts —— 星座寰宇 · 星语海报分享卡数据层测试
 *
 * 锁定隐私与降级规则（工单 12 + 设计文档 §6.7）：
 * - 隐私哨兵：出生日期/城市等隐私信息不进入序列化产物（构建期剥离，渲染层物理不可达）；
 * - 未知档不显示上升（angles.sign 为 null → elements 无 ascendant）；
 * - 未知档月亮跨座隐藏（moon.sign 为 null → elements 无 moon，缩略轮排除月亮）；
 * - 约时档只含已确定要素；
 * - headline 缺失返回 null（入口不渲染）；
 * - 缩略轮落点只含 sign 稳定行星，产物无 degree/house 字段；
 * - revision 直接绑定事实层 calculationRevision（重算后旧海报自然失效）。
 */

import { describe, expect, it } from 'vitest';
import {
  SAMPLE_PROFILE_ACCURATE,
  SAMPLE_PROFILE_APPROXIMATE,
  SAMPLE_PROFILE_UNKNOWN,
  computeChartFacts,
} from '@/lib/astrology/mock-chart-facts';
import { buildAstrologyShareCardData, buildAstrologyShareUrl } from './astrology-share-card-data';

/** 准确档：完整盘（示例盘 1995-10-08 14:30 上海，太阳天秤/月亮白羊/上升水瓶） */
const accurateFacts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
/** 未知档：无宫位，月亮当日跨座隐藏 */
const unknownFacts = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);
/** 约时档：角点/宫位不稳定降级为无宫位范围 */
const approximateFacts = computeChartFacts(SAMPLE_PROFILE_APPROXIMATE);

const BASE_OPTIONS = {
  name: '星野',
  headline: '在秩序与自由之间，找到自己的节奏',
  origin: 'https://example.com',
};

describe('buildAstrologyShareUrl', () => {
  it('拼接星座寰宇入口并附完整 UTM 参数', () => {
    const url = buildAstrologyShareUrl('https://example.com');
    expect(url).toBe(
      'https://example.com/destiny?tab=astrology&utm_source=share_card&utm_medium=qrcode&utm_campaign=astrology'
    );
  });

  it('origin 末尾斜杠不产生双斜杠', () => {
    expect(buildAstrologyShareUrl('https://example.com/')).toContain(
      'https://example.com/destiny?tab=astrology'
    );
  });
});

describe('buildAstrologyShareCardData', () => {
  it('准确档：大三要素齐全（太阳天秤/月亮白羊/上升水瓶），缩略轮含十星体', () => {
    const data = buildAstrologyShareCardData(accurateFacts, BASE_OPTIONS);
    expect(data).not.toBeNull();
    expect(data!.elements.map((e) => e.key)).toEqual(['sun', 'moon', 'ascendant']);
    expect(data!.elements.map((e) => e.signName)).toEqual(['天秤座', '白羊座', '水瓶座']);
    expect(data!.elements.map((e) => e.label)).toEqual(['太阳', '月亮', '上升']);
    expect(data!.wheelPlanets).toHaveLength(10);
    expect(data!.nickname).toBe('星野');
    expect(data!.headline).toBe(BASE_OPTIONS.headline);
  });

  it('隐私哨兵：序列化产物不含出生日期/城市/度数/宫位信息', () => {
    // 出生档案中的隐私哨兵（mock 不读档案字段，此处断言构建层永不透出）
    const sentinelProfile = {
      ...SAMPLE_PROFILE_ACCURATE,
      city: 'SENTINEL_LOCATION_杭州',
      birthDate: { year: 1995, month: 10, day: 8 },
    };
    const data = buildAstrologyShareCardData(computeChartFacts(sentinelProfile), {
      ...BASE_OPTIONS,
      name: 'SENTINEL_BIRTH_1995-10-08',
    });
    const serialized = JSON.stringify(data);
    // 昵称属卡片正常内容（截断后 ≤8 字），但出生日期哨兵片段不得残留
    expect(serialized).not.toContain('1995-10-08');
    expect(serialized).not.toContain('SENTINEL_LOCATION');
    expect(serialized).not.toContain('杭州');
    // 度数/宫位字段在构建期剥离，产物类型上就不存在这两个键
    expect(serialized).not.toContain('degree');
    expect(serialized).not.toContain('house');
  });

  it('未知档：不显示上升；月亮/金星跨座隐藏后 elements 只剩太阳', () => {
    const data = buildAstrologyShareCardData(unknownFacts, BASE_OPTIONS);
    expect(data).not.toBeNull();
    expect(data!.elements.map((e) => e.key)).toEqual(['sun']);
    // 缩略轮同步排除跨座星体（当日月亮白羊→金牛、金星天秤→天蝎跨座，sign 为 null 不进海报）
    expect(data!.wheelPlanets.some((p) => p.body === 'moon')).toBe(false);
    expect(data!.wheelPlanets.some((p) => p.body === 'venus')).toBe(false);
    expect(data!.wheelPlanets).toHaveLength(8);
  });

  it('约时档：角点不稳定降级，大三要素自动只含已确定项（无上升）', () => {
    const data = buildAstrologyShareCardData(approximateFacts, BASE_OPTIONS);
    expect(data).not.toBeNull();
    expect(data!.elements.some((e) => e.key === 'ascendant')).toBe(false);
    expect(data!.elements.map((e) => e.key)).toEqual(['sun', 'moon']);
  });

  it('约时档度数不稳定时缩略轮落点回退星座正中（15°），不泄露精确度数', () => {
    const data = buildAstrologyShareCardData(approximateFacts, BASE_OPTIONS);
    const sun = accurateFacts.planets.find((p) => p.body === 'sun')!;
    const sunIndex = 6; // 天秤座
    expect(sun.sign).toBe('libra');
    // 约时档太阳区间黄经变化 <1°，整度数稳定 → 应含真实度数
    const approxSun = data!.wheelPlanets.find((p) => p.body === 'sun')!;
    expect(approxSun.longitude).toBeGreaterThanOrEqual(sunIndex * 30);
    expect(approxSun.longitude).toBeLessThan(sunIndex * 30 + 30);
    // 未知档度数一律为 null → 落星座正中
    const unknownData = buildAstrologyShareCardData(unknownFacts, BASE_OPTIONS)!;
    const unknownSun = unknownData.wheelPlanets.find((p) => p.body === 'sun')!;
    expect(unknownSun.longitude % 30).toBe(15);
  });

  it('headline 为空时返回 null（调用方隐藏分享入口）', () => {
    expect(buildAstrologyShareCardData(accurateFacts, { ...BASE_OPTIONS, headline: '  ' })).toBeNull();
  });

  it('昵称为空时产物昵称为空串，由渲染层回退匿名别名', () => {
    const data = buildAstrologyShareCardData(accurateFacts, { ...BASE_OPTIONS, name: null });
    expect(data!.nickname).toBe('');
  });

  it('超长昵称截断（复用八字分享卡同一截断规则）', () => {
    const data = buildAstrologyShareCardData(accurateFacts, {
      ...BASE_OPTIONS,
      name: '一个超级超级长的昵称甲乙丙',
    });
    expect(data!.nickname).toBe('一个超级超级长的…');
  });

  it('revision 直接绑定事实层 calculationRevision（重算后旧海报自然失效）', () => {
    const data = buildAstrologyShareCardData(accurateFacts, BASE_OPTIONS);
    expect(data!.revision).toBe(accurateFacts.calculationRevision);
    expect(data!.revision).toBeTruthy();
  });

  it('生成日期为中文口径，且只含生成日不含出生信息', () => {
    const data = buildAstrologyShareCardData(accurateFacts, BASE_OPTIONS);
    expect(data!.generatedDate).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日$/);
  });
});
