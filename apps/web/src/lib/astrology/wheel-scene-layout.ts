/**
 * wheel-scene-layout.ts —— 「星渊」WebGL 场景的事实→3D 映射层（纯函数，无渲染依赖）
 *
 * 职责：把 AstrologyChartFacts（唯一真值）翻译成 three.js 世界坐标系下的场景布局。
 * 几何口径与 SVG 星盘轮（astrology-chart-wheel.tsx）完全一致：
 * - viewBox 560×560，盘心 (280,280)，世界尺度 SCENE_SCALE=56（560px → 10 世界单位）
 * - 上升点在左（屏幕角 180°），黄经沿屏幕向下增长（θ = 180 - (lon - ascLon)）
 * - 无宫位盘 ascLon = 0（白羊 0° 在左）
 * - 行星防碰撞：角距 <15° 归群，三轨（外 199 / 内 153 / 中 177）交错 + ±5.2° 角向排斥
 * - 相位弧端点走真实黄经（非防碰撞位）的 R_ASPECT=140 圆，控制点向盘心内收 52%
 * 世界坐标系：X 向右，Y 向上，Z 朝向观察者（盘面铺在 XY 平面，相机在 +Z）。
 */

import type { AspectType, AstrologyChartFacts, PlanetBody, ZodiacSign } from './chart-facts';
import { ZODIAC_ORDER } from './zh-names';

/* ---------- 世界尺度 ---------- */

/** SVG px → 世界单位换算（560px = 10 单位，盘半径 ≈ 4.68） */
export const SCENE_SCALE = 56;
const CX = 280;
const CY = 280;

/** 各环带半径（与 SVG 轮同一组数值，单位 px；场景内除以 SCENE_SCALE） */
export const SCENE_R = {
  tickOut: 262,
  tickMin: 254,
  tickMajor: 247,
  zodiacOut: 245,
  zodiacIn: 200,
  zodiacGlyph: 222.5,
  houseIn: 146,
  houseNum: 173,
  planetMid: 177,
  planetInner: 153,
  planetOuter: 199,
  aspect: 140,
  axisLabel: 270,
} as const;

/* ---------- 角度与坐标换算 ---------- */

/** 黄经 → SVG 屏幕角（度）：上升在左，黄经向下增长 */
export function screenTheta(lon: number, ascLon: number): number {
  return 180 - (lon - ascLon);
}

/** SVG 极坐标 → SVG 平面点（y 向下，θ 顺时针） */
function polar(thetaDeg: number, r: number): [number, number] {
  const rad = (thetaDeg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** SVG 平面点 → 世界坐标（y 轴翻转为向上，z 默认 0） */
export function toWorld(x: number, y: number, z = 0): [number, number, number] {
  return [(x - CX) / SCENE_SCALE, (CY - y) / SCENE_SCALE, z];
}

/** SVG 屏幕角（度）→ 世界弧度角（RingGeometry 用：从 +X 轴逆时针） */
export function thetaToWorldPhi(thetaDeg: number): number {
  return (-thetaDeg * Math.PI) / 180;
}

/** px 半径 → 世界半径 */
export const wr = (px: number) => px / SCENE_SCALE;

/* ---------- 十星宝珠色谱（与 SVG 轮 PLANET_ORB 同源，场景侧只需十六进制） ---------- */

export interface OrbPalette {
  /** 球体基色（受光面） */
  base: string;
  /** 自发光色（bloom 光源） */
  emissive: string;
  /** 光晕精灵色 */
  glow: string;
  /** glyph 印记色（深刻于亮珠上） */
  glyph: string;
}

/** 十星色谱：日金珀/月银青/水紫罗兰/金玫瑰/火珊瑚/木琥珀/土沙金/天王青碧/海王湛蓝/冥王堇紫 */
export const ORB_PALETTE: Record<PlanetBody, OrbPalette> = {
  sun: { base: '#FDE68A', emissive: '#FBBF24', glow: '#FBBF24', glyph: '#451A03' },
  moon: { base: '#E0F2FE', emissive: '#7DD3FC', glow: '#7DD3FC', glyph: '#0C4A6E' },
  mercury: { base: '#EDE9FE', emissive: '#A78BFA', glow: '#A78BFA', glyph: '#2E1065' },
  venus: { base: '#FFE4E6', emissive: '#FDA4AF', glow: '#FDA4AF', glyph: '#4C0519' },
  mars: { base: '#FFEDD5', emissive: '#FB923C', glow: '#FB923C', glyph: '#431407' },
  jupiter: { base: '#FEF08A', emissive: '#FACC15', glow: '#FACC15', glyph: '#451A03' },
  saturn: { base: '#EFEAE1', emissive: '#E2D5BE', glow: '#E2D5BE', glyph: '#2B2317' },
  uranus: { base: '#CCFBF1', emissive: '#5EEAD4', glow: '#5EEAD4', glyph: '#042F2E' },
  neptune: { base: '#DBEAFE', emissive: '#60A5FA', glow: '#60A5FA', glyph: '#172554' },
  pluto: { base: '#F3E8FF', emissive: '#C084FC', glow: '#C084FC', glyph: '#3B0764' },
};

/** 四元素扇区色（火琥珀/土翡翠/风靛蓝/水天蓝） */
export const ELEMENT_COLOR = {
  fire: '#F59E0B',
  earth: '#34D399',
  air: '#818CF8',
  water: '#38BDF8',
} as const;
export type SignElement = keyof typeof ELEMENT_COLOR;
/** 黄道顺序即元素轮转（白羊火 → 金牛土 → 双子风 → 巨蟹水 ……） */
export const elementOfSignIndex = (i: number): SignElement => (['fire', 'earth', 'air', 'water'] as const)[i % 4];

/** 相位性质分组：紧张（冲/刑）玫瑰红、和谐（拱/六合）琥珀金、合相亮金 */
export const ASPECT_TONE: Record<AspectType, { color: string; tension: boolean }> = {
  opposition: { color: '#FB7185', tension: true },
  square: { color: '#FB7185', tension: true },
  trine: { color: '#FDE68A', tension: false },
  sextile: { color: '#FDE68A', tension: false },
  conjunction: { color: '#FDE68A', tension: false },
};
/** 相位默认低饱和紫灰（未选中时全场降噪） */
export const ASPECT_DIM_COLOR = '#8B93C9';

/* ---------- 场景布局类型 ---------- */

export interface PlanetNode3D {
  body: PlanetBody;
  sign: ZodiacSign;
  /** 星座内度数（不稳定为 null，绝不虚构） */
  degree: number | null;
  /** 绝对黄经（真实值，相位端点用） */
  lon: number;
  /** 宝珠中心世界坐标（含 Z 层悬浮） */
  position: [number, number, number];
  /** 度数标签世界坐标 */
  degreeLabelPosition: [number, number, number];
  /** 呼吸相位与速度（错峰） */
  breathePhase: number;
  breatheSpeed: number;
}

export interface AspectArc3D {
  key: string;
  type: AspectType;
  source: PlanetBody;
  target: PlanetBody;
  /** 二次贝塞尔采样点（世界坐标，含微浮 Z） */
  points: [number, number, number][];
}

export interface SignSector3D {
  sign: ZodiacSign;
  index: number;
  element: SignElement;
  /** RingGeometry 起始弧度（世界系）与弧长（恒 30°） */
  phiStart: number;
  phiLength: number;
  /** 星座 glyph 世界坐标 */
  glyphPosition: [number, number, number];
  /** 宫界线两端（世界坐标，用于线段绘制） */
  boundary: [[number, number, number], [number, number, number]];
}

export interface HouseCusp3D {
  number: number;
  boundary: [[number, number, number], [number, number, number]];
  numberPosition: [number, number, number];
}

export interface AxisMarker3D {
  kind: 'ascendant' | 'midheaven';
  label: '上升' | '天顶';
  line: [[number, number, number], [number, number, number]];
  labelPosition: [number, number, number];
}

export interface WheelSceneLayout {
  withHouses: boolean;
  ascLon: number;
  planets: PlanetNode3D[];
  aspects: AspectArc3D[];
  signs: SignSector3D[];
  houses: HouseCusp3D[];
  axes: AxisMarker3D[];
  /** 60 刻度线段（世界坐标对，主刻度加粗由渲染层按 index%5 判断） */
  ticks: { line: [[number, number, number], [number, number, number]]; major: boolean }[];
}

/* ---------- 行星防碰撞（三轨交错 + 角向排斥，与 SVG 轮同算法） ---------- */

function layoutPlanetPositions(
  planets: Array<{ body: PlanetBody; lon: number }>,
  ascLon: number
): Map<PlanetBody, { x: number; y: number; theta: number; degX: number; degY: number }> {
  const sorted = [...planets].sort((a, b) => a.lon - b.lon);
  const result = new Map<PlanetBody, { x: number; y: number; theta: number; degX: number; degY: number }>();

  // 识别连续紧邻集群（相邻角距 < 15° 归入同一集群）
  const clusters: Array<Array<{ body: PlanetBody; lon: number }>> = [];
  let current: Array<{ body: PlanetBody; lon: number }> = [];
  for (const p of sorted) {
    const prev = current[current.length - 1];
    if (!prev) {
      current.push(p);
      continue;
    }
    // 相邻角距 <15° 归群；跨 0°/360° 环绕（差 >345° 实为近距）同样归群，与 SVG 轮同口径
    const diff = Math.abs(p.lon - prev.lon);
    if (diff < 15 || diff > 345) {
      current.push(p);
    } else {
      clusters.push(current);
      current = [p];
    }
  }
  if (current.length > 0) clusters.push(current);

  const TIERS = [SCENE_R.planetOuter, SCENE_R.planetInner, SCENE_R.planetMid];
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const p = cluster[0];
      const theta = screenTheta(p.lon, ascLon);
      const [x, y] = polar(theta, SCENE_R.planetMid);
      // 度数标签推出宝珠光晕亮核（约 18 单位）之外，且不触碰黄道符号带（222.5）
      const [degX, degY] = polar(theta, SCENE_R.planetMid + 26);
      result.set(p.body, { x, y, theta, degX, degY });
    } else {
      const n = cluster.length;
      for (let j = 0; j < n; j++) {
        const item = cluster[j];
        const assignedR = TIERS[j % TIERS.length];
        const angleSpread = (j - (n - 1) / 2) * 5.2;
        const theta = screenTheta(item.lon + angleSpread, ascLon);
        const [x, y] = polar(theta, assignedR);
        // 标签 26 单位净空：外轨向内（向外会撞黄道符号带）、中轨向外、内轨向内
        const degR =
          assignedR >= SCENE_R.planetOuter ? assignedR - 26 : assignedR >= SCENE_R.planetMid ? assignedR + 26 : assignedR - 26;
        const [degX, degY] = polar(theta, degR);
        result.set(item.body, { x, y, theta, degX, degY });
      }
    }
  }
  return result;
}

/* ---------- 主入口：facts → 场景布局 ---------- */

export function buildWheelSceneLayout(
  facts: AstrologyChartFacts,
  /** 行星黄经覆盖（星体 → 绝对黄经）：表单预览的太阳滑动动画使用，语义与 SVG 轮 planetOverrides 一致 */
  planetOverrides?: Partial<Record<PlanetBody, number>>
): WheelSceneLayout {
  const withHouses = facts.dataCompleteness === 'with-houses';
  const ascLon = withHouses && facts.angles.ascendant.longitude !== null ? facts.angles.ascendant.longitude : 0;

  /** 可见行星（sign 为 null = 不稳定隐藏，绝不虚构位置）与绝对黄经 */
  const visiblePlanets = facts.planets
    .filter((p): p is typeof p & { sign: ZodiacSign } => p.sign !== null)
    .map((p) => {
      const signIndex = ZODIAC_ORDER.indexOf(p.sign);
      // signOnly（度数不稳定）行星放在星座中点仅示意星座归属，不标度数；
      // 覆盖态（表单太阳滑动）按真实黄经渲染并标注星座内整度数
      const overridden = planetOverrides?.[p.body];
      const lon = overridden ?? signIndex * 30 + (p.degree ?? 15);
      const degree = overridden !== undefined ? overridden % 30 : p.degree;
      return { body: p.body, sign: p.sign, degree, lon };
    });

  const positions = layoutPlanetPositions(visiblePlanets, ascLon);

  /** 行星节点：盘面 XY + Z 层悬浮（错层视差），呼吸错峰（0.7s 间隔） */
  const planets: PlanetNode3D[] = visiblePlanets.map((p, i) => {
    const pos = positions.get(p.body)!;
    const floatZ = 0.34 + (i % 5) * 0.055;
    return {
      body: p.body,
      sign: p.sign,
      degree: p.degree,
      lon: p.lon,
      position: toWorld(pos.x, pos.y, floatZ),
      degreeLabelPosition: toWorld(pos.degX, pos.degY, floatZ + 0.02),
      breathePhase: i * 0.7,
      breatheSpeed: 1.35 + (i % 3) * 0.18,
    };
  });

  /** 可见相位：仅稳定相位且两端行星可见；端点走真实黄经（非防碰撞位） */
  const lonByBody = new Map(visiblePlanets.map((p) => [p.body, p.lon]));
  const aspects: AspectArc3D[] = facts.aspects
    .filter((a) => a.stability === 'stable' && lonByBody.has(a.source) && lonByBody.has(a.target))
    .map((a) => {
      const [x1, y1] = polar(screenTheta(lonByBody.get(a.source)!, ascLon), SCENE_R.aspect);
      const [x2, y2] = polar(screenTheta(lonByBody.get(a.target)!, ascLon), SCENE_R.aspect);
      // 控制点：弦中点向盘心内收 52%（对冲接近直线、短距相优雅弓形）
      const qx = (x1 + x2) / 2 + (CX - (x1 + x2) / 2) * 0.52;
      const qy = (y1 + y2) / 2 + (CY - (y1 + y2) / 2) * 0.52;
      // 采样 24 段二次贝塞尔
      const points: [number, number, number][] = [];
      for (let s = 0; s <= 24; s++) {
        const t = s / 24;
        const bx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * qx + t * t * x2;
        const by = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * qy + t * t * y2;
        points.push(toWorld(bx, by, 0.06));
      }
      return { key: `${a.source}-${a.target}-${a.type}`, type: a.type, source: a.source, target: a.target, points };
    });

  /** 十二宫扇区（RingGeometry 参数 + glyph 位 + 宫界线） */
  const signs: SignSector3D[] = ZODIAC_ORDER.map((sign, i) => {
    const ta = screenTheta(i * 30 + 30, ascLon);
    const tb = screenTheta(i * 30, ascLon);
    const phiStart = thetaToWorldPhi(tb);
    const phiEnd = thetaToWorldPhi(ta);
    const [gx, gy] = polar(screenTheta(i * 30 + 15, ascLon), SCENE_R.zodiacGlyph);
    const [bx1, by1] = polar(tb, SCENE_R.zodiacIn);
    const [bx2, by2] = polar(tb, SCENE_R.zodiacOut);
    return {
      sign,
      index: i,
      element: elementOfSignIndex(i),
      // RingGeometry 需要正弧长：theta 随黄经递减 ⇒ phi = -theta 递增，起点取 tb（扇区黄经低端）
      phiStart,
      phiLength: phiEnd - phiStart,
      glyphPosition: toWorld(gx, gy, 0.1),
      boundary: [toWorld(bx1, by1, 0.08), toWorld(bx2, by2, 0.08)],
    };
  });

  /** 整宫制宫位（仅完整盘）：宫界线 + 宫位号 */
  const houses: HouseCusp3D[] =
    withHouses && facts.houses.length === 12
      ? facts.houses.map((h) => {
          const cuspLon = ZODIAC_ORDER.indexOf(h.sign) * 30;
          const theta = screenTheta(cuspLon, ascLon);
          const [x1, y1] = polar(theta, SCENE_R.houseIn);
          const [x2, y2] = polar(theta, SCENE_R.zodiacIn);
          const [nx, ny] = polar(screenTheta(cuspLon + 15, ascLon), SCENE_R.houseNum);
          return {
            number: h.number,
            boundary: [toWorld(x1, y1, 0.05), toWorld(x2, y2, 0.05)],
            numberPosition: toWorld(nx, ny, 0.08),
          };
        })
      : [];

  /** 上升/天顶轴线（仅完整盘，经度缺失不画） */
  const axes: AxisMarker3D[] = (
    [
      { kind: 'ascendant', label: '上升', lon: withHouses ? facts.angles.ascendant.longitude : null },
      { kind: 'midheaven', label: '天顶', lon: withHouses ? facts.angles.midheaven.longitude : null },
    ] as const
  )
    .filter((a): a is typeof a & { lon: number } => a.lon !== null)
    .map((a) => {
      const theta = screenTheta(a.lon, ascLon);
      const [x1, y1] = polar(theta, 36);
      const [x2, y2] = polar(theta, SCENE_R.tickMajor);
      const [lx, ly] = polar(theta, SCENE_R.axisLabel);
      return {
        kind: a.kind,
        label: a.label,
        line: [toWorld(x1, y1, 0.12), toWorld(x2, y2, 0.12)],
        labelPosition: toWorld(lx, ly, 0.12),
      };
    });

  /** 60 刻度（每 6°，30° 主刻度加长） */
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const deg = i * 6;
    const major = deg % 30 === 0;
    const theta = screenTheta(deg, ascLon);
    const [x1, y1] = polar(theta, major ? SCENE_R.tickMajor : SCENE_R.tickMin);
    const [x2, y2] = polar(theta, SCENE_R.tickOut);
    return { line: [toWorld(x1, y1, 0.08), toWorld(x2, y2, 0.08)] as [[number, number, number], [number, number, number]], major };
  });

  return { withHouses, ascLon, planets, aspects, signs, houses, axes, ticks };
}
