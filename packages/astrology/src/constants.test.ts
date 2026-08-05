import { describe, it, expect } from 'vitest';
import {
  ENGINE_VERSION,
  ORB_TABLE_VERSION,
  ZODIAC_SIGNS,
  ASPECT_TABLE,
  ASPECT_TYPES,
} from './constants';

describe('constants', () => {
  it('ENGINE_VERSION 与 ORB_TABLE_VERSION 应作为只读字符串导出', () => {
    expect(ENGINE_VERSION).toBe('astro-0.1.0');
    expect(ORB_TABLE_VERSION).toBe('orb-v1');
  });

  it('十二星座顺序应从白羊座 0° 开始，每宫 30°', () => {
    expect(ZODIAC_SIGNS).toHaveLength(12);
    expect(ZODIAC_SIGNS[0]).toMatchObject({
      id: 'aries',
      cn: '白羊座',
      startLongitude: 0,
    });
    expect(ZODIAC_SIGNS[11]).toMatchObject({
      id: 'pisces',
      cn: '双鱼座',
      startLongitude: 330,
    });

    ZODIAC_SIGNS.forEach((sign, index) => {
      expect(sign.startLongitude).toBe(index * 30);
    });
  });

  it('相位表应包含五大核心相位且容许度符合 orb-v1 冻结值', () => {
    expect(ASPECT_TABLE).toHaveLength(5);
    expect(ASPECT_TYPES).toHaveLength(5);

    const byType = new Map(ASPECT_TABLE.map((a) => [a.type, a]));

    expect(byType.get('conjunction')).toMatchObject({
      angle: 0,
      orb: 8,
      cn: '合相',
    });
    expect(byType.get('opposition')).toMatchObject({
      angle: 180,
      orb: 8,
      cn: '对冲',
    });
    expect(byType.get('square')).toMatchObject({
      angle: 90,
      orb: 6,
      cn: '刑相',
    });
    expect(byType.get('trine')).toMatchObject({
      angle: 120,
      orb: 6,
      cn: '拱相',
    });
    expect(byType.get('sextile')).toMatchObject({
      angle: 60,
      orb: 4,
      cn: '六合',
    });
  });
});
