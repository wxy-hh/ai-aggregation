/**
 * wheel-scene-layout.test.ts —— 星渊场景映射层的几何与事实纪律测试
 *
 * 锚定与 SVG 星盘轮完全一致的几何口径（上升在左、黄经向下增长、
 * 三轨防碰撞、相位弧内收 52%），以及「不稳定事实绝不虚构」的诚实性约束。
 */

import { describe, expect, it } from 'vitest';
import type { AstrologyChartFacts } from './chart-facts';
import {
  ASPECT_TONE,
  ORB_PALETTE,
  SCENE_R,
  buildWheelSceneLayout,
  screenTheta,
  thetaToWorldPhi,
  toWorld,
} from './wheel-scene-layout';

/** 构造最小可用 facts（完整盘）：十星全稳定、相位两条、宫位十二、轴线齐 */
function makeFacts(overrides?: Partial<AstrologyChartFacts>): AstrologyChartFacts {
  const planets = ([
    ['sun', 'libra', 12.5],
    ['moon', 'taurus', 3],
    ['mercury', 'libra', 13],
    ['venus', 'libra', 13.8],
    ['mars', 'scorpio', 8],
    ['jupiter', 'sagittarius', 2],
    ['saturn', 'pisces', 20],
    ['uranus', 'capricorn', 22],
    ['neptune', 'capricorn', 25],
    ['pluto', 'scorpio', 28],
  ] as const).map(([body, sign, degree]) => ({
    body: body as AstrologyChartFacts['planets'][number]['body'],
    sign: sign as AstrologyChartFacts['planets'][number]['sign'],
    degree,
    stability: 'stable' as const,
  }));
  return {
    dataCompleteness: 'with-houses',
    planets,
    aspects: [
      { source: 'sun', target: 'moon', type: 'trine', orb: 2.1, stability: 'stable' },
      { source: 'mars', target: 'pluto', type: 'conjunction', orb: 0.4, stability: 'stable' },
      { source: 'saturn', target: 'uranus', type: 'square', orb: 5.9, stability: 'unstable' },
    ],
    houses: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, sign: 'aries' })),
    angles: {
      ascendant: { longitude: 200, sign: 'scorpio' },
      midheaven: { longitude: 280, sign: 'aquarius' },
    },
    ...overrides,
  } as AstrologyChartFacts;
}

const dist = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('screenTheta / toWorld 几何口径', () => {
  it('上升点在左：黄经=上升黄经时世界坐标 x<0、y≈0', () => {
    const theta = screenTheta(200, 200);
    expect(theta).toBe(180);
    const rad = (theta * Math.PI) / 180;
    const [x, y] = [280 + 100 * Math.cos(rad), 280 + 100 * Math.sin(rad)];
    const [wx, wy] = toWorld(x, y);
    expect(wx).toBeLessThan(0);
    expect(wy).toBeCloseTo(0, 5);
  });

  it('黄经沿屏幕向下增长：+90° 落在世界坐标 y<0（下方）', () => {
    const theta = screenTheta(290, 200);
    const rad = (theta * Math.PI) / 180;
    const [, wy] = toWorld(280 + 100 * Math.cos(rad), 280 + 100 * Math.sin(rad));
    expect(wy).toBeLessThan(0);
  });

  it('thetaToWorldPhi 为负角度转换（SVG y 向下 → 世界 y 向上）', () => {
    expect(thetaToWorldPhi(180)).toBeCloseTo(-Math.PI, 6);
    expect(thetaToWorldPhi(90)).toBeCloseTo(-Math.PI / 2, 6);
  });
});

describe('buildWheelSceneLayout 行星层', () => {
  it('孤立行星在中轨，拥挤集群三轨交错且互不重叠', () => {
    const layout = buildWheelSceneLayout(makeFacts());
    const byBody = new Map(layout.planets.map((p) => [p.body, p]));
    // 日/水/金扎堆（天秤 12.5/13/13.8，角距 <15°）→ 必须拉开
    const sun = byBody.get('sun')!;
    const mercury = byBody.get('mercury')!;
    const venus = byBody.get('venus')!;
    expect(dist(sun.position, mercury.position)).toBeGreaterThan(0.3);
    expect(dist(sun.position, venus.position)).toBeGreaterThan(0.3);
    // 孤立星（土星双鱼 20°，前后邻星角距均 >15°）轨道半径 = 中轨
    const saturn = byBody.get('saturn')!;
    const sr = Math.hypot(saturn.position[0], saturn.position[1]);
    expect(sr).toBeCloseTo(SCENE_R.planetMid / 56, 3);
  });

  it('sign=null 的不稳定行星隐藏，degree=null 落在星座中点且不带度数标签', () => {
    const facts = makeFacts();
    facts.planets = facts.planets.map((p) =>
      p.body === 'moon' ? { ...p, sign: null, degree: null } : p.body === 'mars' ? { ...p, degree: null } : p
    );
    const layout = buildWheelSceneLayout(facts);
    expect(layout.planets.find((p) => p.body === 'moon')).toBeUndefined();
    const mars = layout.planets.find((p) => p.body === 'mars')!;
    // 天蝎起点 210° + 中点 15° = 225°
    expect(mars.lon).toBe(225);
    expect(mars.degree).toBeNull();
  });

  it('同一输入两次构建结果全等（确定性，无随机源）', () => {
    const a = buildWheelSceneLayout(makeFacts());
    const b = buildWheelSceneLayout(makeFacts());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('每颗星呼吸错峰且 Z 层错开（悬浮视差）', () => {
    const layout = buildWheelSceneLayout(makeFacts());
    const phases = new Set(layout.planets.map((p) => p.breathePhase));
    expect(phases.size).toBe(layout.planets.length);
    for (const p of layout.planets) {
      expect(p.position[2]).toBeGreaterThanOrEqual(0.34);
      expect(p.position[2]).toBeLessThanOrEqual(0.34 + 4 * 0.055 + 1e-9);
    }
  });
});

describe('buildWheelSceneLayout 相位弧', () => {
  it('只保留 stable 且两端可见的相位', () => {
    const layout = buildWheelSceneLayout(makeFacts());
    expect(layout.aspects.map((a) => a.key)).toEqual(['sun-moon-trine', 'mars-pluto-conjunction']);
  });

  it('弧采样 25 点、端点落在 R_ASPECT 圆上、控制点向盘心内收', () => {
    const layout = buildWheelSceneLayout(makeFacts());
    const arc = layout.aspects[0];
    expect(arc.points).toHaveLength(25);
    const first = arc.points[0];
    const last = arc.points[arc.points.length - 1];
    expect(Math.hypot(first[0], first[1])).toBeCloseTo(SCENE_R.aspect / 56, 3);
    expect(Math.hypot(last[0], last[1])).toBeCloseTo(SCENE_R.aspect / 56, 3);
    // 中点弯曲方向朝盘心：弧中点模长 < 弦中点模长
    const mid = arc.points[12];
    const chordMid: [number, number] = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
    expect(Math.hypot(mid[0], mid[1])).toBeLessThan(Math.hypot(chordMid[0], chordMid[1]));
  });

  it('相位色谱覆盖全部五种相位类型', () => {
    expect(Object.keys(ASPECT_TONE).sort()).toEqual(
      ['conjunction', 'opposition', 'sextile', 'square', 'trine'].sort()
    );
  });
});

describe('buildWheelSceneLayout 星座环 / 宫位 / 轴线 / 刻度', () => {
  it('12 扇区弧长均 30° 且 phiStart 递增', () => {
    const layout = buildWheelSceneLayout(makeFacts());
    expect(layout.signs).toHaveLength(12);
    for (const s of layout.signs) {
      expect(s.phiLength).toBeCloseTo(Math.PI / 6, 6);
    }
    for (let i = 1; i < 12; i++) {
      expect(layout.signs[i].phiStart).toBeCloseTo(layout.signs[i - 1].phiStart + Math.PI / 6, 6);
    }
  });

  it('完整盘：12 宫界线 + 上升/天顶轴线；无宫位盘：全无且白羊 0° 在左', () => {
    const full = buildWheelSceneLayout(makeFacts());
    expect(full.houses).toHaveLength(12);
    expect(full.axes.map((a) => a.kind)).toEqual(['ascendant', 'midheaven']);

    const bare = buildWheelSceneLayout(
      makeFacts({ dataCompleteness: 'without-houses', houses: [], angles: { ascendant: { longitude: null, sign: null }, midheaven: { longitude: null, sign: null } } } as never)
    );
    expect(bare.withHouses).toBe(false);
    expect(bare.ascLon).toBe(0);
    expect(bare.houses).toHaveLength(0);
    expect(bare.axes).toHaveLength(0);
  });

  it('60 刻度：每 6° 一根，30° 倍数为主刻度', () => {
    const layout = buildWheelSceneLayout(makeFacts());
    expect(layout.ticks).toHaveLength(60);
    expect(layout.ticks.filter((t) => t.major)).toHaveLength(12);
  });
});

describe('ORB_PALETTE 十星色谱', () => {
  it('十星齐备且四通道均为合法 hex', () => {
    const bodies = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    expect(Object.keys(ORB_PALETTE).sort()).toEqual(bodies.sort());
    for (const p of Object.values(ORB_PALETTE)) {
      for (const c of [p.base, p.emissive, p.glow, p.glyph]) {
        expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});
