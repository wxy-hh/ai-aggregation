'use client';

/**
 * astrology-chart-wheel.tsx —— 星盘轮渲染组件（全模块视觉主角）
 *
 * 消费 02 工单的 AstrologyChartFacts（唯一真值接缝），渲染成品级本命星盘：
 * 外圈 60 刻度 / 十二宫格 + 星座符号环 / 宫位号（宫界取真实宫头度数） / 十星体节点（符号 + 度数）/
 * 低密度相位连线 / 上升·天顶轴线。无宫位档（dataCompleteness = without-houses）
 * 自动切换为无宫位行星星座圆盘（不画宫位分割、数字与轴线，不虚构事实）。
 *
 * 布局惯例：上升点在左（9 点钟方向），黄经沿屏幕向下增长（占星盘标准朝向）；
 * 无宫位盘以白羊 0° 在左。03 工单为静态展示；点选交互在 06 工单扩展。
 */

import { Fragment, useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type {
  AspectType,
  AstrologyChartFacts,
  PlanetBody,
  ZodiacSign,
} from '@/lib/astrology/chart-facts';
/* 符号映射定义集中于 ./astrology-glyphs（符号的家）；此处 re-export 保持既有导入点兼容 */
import { PLANET_GLYPH, ZODIAC_GLYPH } from './astrology-glyphs';
export { PLANET_GLYPH, ZODIAC_GLYPH } from './astrology-glyphs';

/* ---------- 中文名与符号映射（展示层负责转中文，事实层只存代码标识） ---------- */

/* 中文名词汇表集中于 @/lib/astrology/zh-names（lib 层共享）；此处 re-export 保持既有导入点不变 */
import { ASPECT_CN, PLANET_CN, ZODIAC_CN, ZODIAC_ORDER } from '@/lib/astrology/zh-names';
export { ASPECT_CN, PLANET_CN, ZODIAC_CN } from '@/lib/astrology/zh-names';

/** 行星天体高奢配色（能量星核 + 极光镜面高光 + 高温日冕光晕）：
 *  彻底告别扁平糖豆与生硬小圆，每颗星体都具备天体发射光、星核聚变与外围日冕辐射。
 *  十星色谱：太阳烈焰金珀、月亮清冽银青、水星电光紫珀、金星朝霞玫瑰、火星赤熔珊瑚、
 *  木星皇室琥珀金、土星泰坦金环、天王冰晶翡碧、海王深渊湛蓝、冥王虚空暗堇。 */
const PLANET_ORB: Record<PlanetBody, { core: string; mid: string; edge: string; glyph: string; glow: string; corona: string }> = {
  sun: { core: '#FFFFFF', mid: '#FDE68A', edge: '#F59E0B', glyph: '#451A03', glow: '#FBBF24', corona: 'rgba(251,191,36,0.65)' },
  moon: { core: '#FFFFFF', mid: '#E0F2FE', edge: '#38BDF8', glyph: '#0C4A6E', glow: '#7DD3FC', corona: 'rgba(125,211,252,0.60)' },
  mercury: { core: '#FFFFFF', mid: '#EDE9FE', edge: '#8B5CF6', glyph: '#2E1065', glow: '#A78BFA', corona: 'rgba(167,139,250,0.55)' },
  venus: { core: '#FFFFFF', mid: '#FFE4E6', edge: '#FB7185', glyph: '#4C0519', glow: '#FDA4AF', corona: 'rgba(253,164,175,0.55)' },
  mars: { core: '#FFFFFF', mid: '#FFEDD5', edge: '#EA580C', glyph: '#431407', glow: '#FB923C', corona: 'rgba(251,146,60,0.60)' },
  jupiter: { core: '#FFFFFF', mid: '#FEF08A', edge: '#D97706', glyph: '#451A03', glow: '#FACC15', corona: 'rgba(250,204,21,0.60)' },
  saturn: { core: '#FFFFFF', mid: '#EFEAE1', edge: '#B89F74', glyph: '#2B2317', glow: '#E2D5BE', corona: 'rgba(226,213,190,0.55)' },
  uranus: { core: '#FFFFFF', mid: '#CCFBF1', edge: '#0D9488', glyph: '#042F2E', glow: '#5EEAD4', corona: 'rgba(94,234,212,0.55)' },
  neptune: { core: '#FFFFFF', mid: '#DBEAFE', edge: '#2563EB', glyph: '#172554', glow: '#60A5FA', corona: 'rgba(96,165,250,0.60)' },
  pluto: { core: '#FFFFFF', mid: '#F3E8FF', edge: '#9333EA', glyph: '#3B0764', glow: '#C084FC', corona: 'rgba(192,132,252,0.55)' },
};

/** 黄道四元素高奢星轨色系：
 *  彻底告别灰暗青蓝与积木感，12 星座符号统一采用黄金星符镌刻质感（Gold Relic），
 *  底层扇区仅以极微晶润水光（0.04-0.06）微弱呼应四元素属性（火金、土翡、风岚、水碧），
 *  激活时如古老象限仪上的流金刻槽瞬间注光点亮。 */
const SIGN_ELEMENT_STYLE = {
  fire: {
    wedge: 'fill-amber-500/[0.05] dark:fill-amber-400/[0.04]',
    glyph: 'stroke-[#FDE68A] [filter:drop-shadow(0_0_2px_rgba(245,158,11,0.5))]',
    active: 'fill-amber-500/[0.12] stroke-amber-300/80 dark:fill-amber-400/[0.12] dark:stroke-amber-300/80 [filter:drop-shadow(0_0_6px_rgba(245,158,11,0.4))]',
  },
  earth: {
    wedge: 'fill-emerald-500/[0.045] dark:fill-emerald-400/[0.035]',
    glyph: 'stroke-[#FDE68A] [filter:drop-shadow(0_0_2px_rgba(245,158,11,0.5))]',
    active: 'fill-emerald-500/[0.12] stroke-amber-300/80 dark:fill-emerald-400/[0.12] dark:stroke-amber-300/80 [filter:drop-shadow(0_0_6px_rgba(245,158,11,0.4))]',
  },
  air: {
    wedge: 'fill-indigo-500/[0.045] dark:fill-indigo-400/[0.035]',
    glyph: 'stroke-[#FDE68A] [filter:drop-shadow(0_0_2px_rgba(245,158,11,0.5))]',
    active: 'fill-indigo-500/[0.12] stroke-amber-300/80 dark:fill-indigo-400/[0.12] dark:stroke-amber-300/80 [filter:drop-shadow(0_0_6px_rgba(245,158,11,0.4))]',
  },
  water: {
    wedge: 'fill-sky-500/[0.045] dark:fill-sky-400/[0.035]',
    glyph: 'stroke-[#FDE68A] [filter:drop-shadow(0_0_2px_rgba(245,158,11,0.5))]',
    active: 'fill-sky-500/[0.12] stroke-amber-300/80 dark:fill-sky-400/[0.12] dark:stroke-amber-300/80 [filter:drop-shadow(0_0_6px_rgba(245,158,11,0.4))]',
  },
} as const;
/** 黄道顺序即元素轮转（白羊火 → 金牛土 → 双子宫风 → 巨蟹水 ……） */
const elementOfSignIndex = (i: number) => (['fire', 'earth', 'air', 'water'] as const)[i % 4];

/** 相位连线点亮色（点选星体后，相连相位按性质着色）：紧张相（冲/刑）玫瑰红、和谐相（拱/六合）琥珀金、合相亮金 */
const ASPECT_LINE_CLASS: Record<AspectType, { className: string; dash?: string }> = {
  opposition: { className: 'stroke-rose-400/80 dark:stroke-rose-300/70' },
  trine: { className: 'stroke-amber-300/80 dark:stroke-[#FDE68A]/75' },
  square: { className: 'stroke-rose-400/75 dark:stroke-rose-300/65' },
  sextile: { className: 'stroke-amber-300/75 dark:stroke-[#FDE68A]/70', dash: '3 5' },
  conjunction: { className: 'stroke-amber-200/90 dark:stroke-amber-200/85' },
};
/** 相位连线默认色：流金微光丝线，与星空背景融为一体，彩色只在点选时爆发点亮 */
const ASPECT_LINE_DIM: Record<AspectType, { className: string; dash?: string }> = {
  opposition: { className: 'stroke-indigo-200/35 dark:stroke-white/20' },
  trine: { className: 'stroke-amber-200/35 dark:stroke-[#FDE68A]/25' },
  square: { className: 'stroke-indigo-200/30 dark:stroke-white/[0.18]' },
  sextile: { className: 'stroke-amber-200/30 dark:stroke-[#FDE68A]/20', dash: '3 5' },
  conjunction: { className: 'stroke-amber-200/40 dark:stroke-white/25' },
};

/** 十星列表（defs 生成用，顺序无关渲染） */
const ALL_BODIES = Object.keys(PLANET_ORB) as PlanetBody[];

/* ---------- 几何常量（viewBox 560 × 560，中心 280,280） ---------- */

const CX = 280;
const CY = 280;
const R_TICK_OUT = 262; // 外刻度外沿
const R_TICK_MIN = 254; // 小刻度内沿（每 6°）
const R_TICK_MAJOR = 247; // 主刻度内沿（每 30°）
const R_ZODIAC_OUT = 245; // 星座环外沿
const R_ZODIAC_IN = 200; // 星座环内沿
const R_ZODIAC_GLYPH = 222.5; // 星座符号轨道
const R_HOUSE_IN = 146; // 宫位环内沿
const R_HOUSE_NUM = 173; // 宫位号轨道
const R_PLANET_MID = 177; // 行星主居中轨道
const R_PLANET_INNER = 153; // 密集集群内轨（靠近宫位内沿，绝不重叠）
const R_PLANET_OUTER = 199; // 密集集群外轨（靠近黄道内沿，空间开阔）
const R_ASPECT = 140; // 相位连线端点圆
const R_AXIS_LABEL = 270; // 轴线中文标签
const PLANET_ICON = 20; // 行星符号尺寸（精密星点，非塑料弹珠）
const ZODIAC_ICON = 20; // 星座符号尺寸

/** 极坐标 → SVG 点（y 向下，θ 顺时针） */
function polar(thetaDeg: number, r: number): [number, number] {
  const rad = (thetaDeg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/**
 * 黄经 → 屏幕角：上升点在左（180°），黄经沿屏幕向下（θ 减小）增长；
 * 无宫位盘 ascLon = 0（白羊 0° 在左）。
 */
function screenTheta(lon: number, ascLon: number): number {
  return 180 - (lon - ascLon);
}

/**
 * 顶级天象仪三层立体轨道与角距自适应防碰撞算法：
 * 当多颗行星在极近角距扎堆聚集（如日、水、火同宫，角距 < 16°）时：
 * 1. 采用三层深度轨道：[外轨 199px, 内轨 153px, 中轨 177px] 螺旋错开；
 * 2. 施加力导向微幅排斥偏移（角向错开 ±3.5°~±6°），保证任何两颗星体视觉中心绝对不重叠挤压；
 * 3. 度数标签根据所在轨道智能调整半径偏移，避免与邻星光晕相撞。
 */
function layoutPlanetPositions(
  planets: Array<{ body: PlanetBody; lon: number }>,
  ascLon: number
): Map<PlanetBody, { x: number; y: number; r: number; theta: number; degX: number; degY: number }> {
  // 1. 按原始黄经排序并计算基础角度
  const sorted = [...planets].sort((a, b) => a.lon - b.lon);
  const result = new Map<PlanetBody, { x: number; y: number; r: number; theta: number; degX: number; degY: number }>();
  
  // 识别连续紧邻集群（相邻角距 < 15° 归入同一集群）
  const clusters: Array<Array<{ body: PlanetBody; lon: number; index: number }>> = [];
  let currentCluster: Array<{ body: PlanetBody; lon: number; index: number }> = [];

  for (let i = 0; i < sorted.length; i++) {
    if (currentCluster.length === 0) {
      currentCluster.push({ ...sorted[i], index: i });
    } else {
      const prev = currentCluster[currentCluster.length - 1];
      const diff = Math.abs(sorted[i].lon - prev.lon);
      if (diff < 15 || diff > 345) {
        currentCluster.push({ ...sorted[i], index: i });
      } else {
        clusters.push(currentCluster);
        currentCluster = [{ ...sorted[i], index: i }];
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // 为每个集群分配轨道与角向微调
  const THREE_TIER_RADII = [R_PLANET_OUTER, R_PLANET_INNER, R_PLANET_MID];

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      // 孤立单星：安放于舒适的主轨道中央
      const p = cluster[0];
      const theta = screenTheta(p.lon, ascLon);
      const [x, y] = polar(theta, R_PLANET_MID);
      const [degX, degY] = polar(theta, R_PLANET_MID + 16);
      result.set(p.body, { x, y, r: R_PLANET_MID, theta, degX, degY });
    } else {
      // 多星拥挤集群：三轨交错 + 角向力导向排斥微调
      const n = cluster.length;
      for (let j = 0; j < n; j++) {
        const item = cluster[j];
        // 轨距交错轮换：外 → 内 → 中 → 外
        const assignedR = THREE_TIER_RADII[j % THREE_TIER_RADII.length];
        // 角向微幅微调，让各星体向外舒展（排斥散开）
        const angleSpread = (j - (n - 1) / 2) * 5.2;
        const adjustedTheta = screenTheta(item.lon + angleSpread, ascLon);
        const [x, y] = polar(adjustedTheta, assignedR);
        // 度数标签偏移：内轨星向内偏，外轨星向外偏，彻底避免标签与邻星重叠
        const degR = assignedR >= R_PLANET_MID ? assignedR + 15 : assignedR - 15;
        const [degX, degY] = polar(adjustedTheta, degR);
        result.set(item.body, { x, y, r: assignedR, theta: adjustedTheta, degX, degY });
      }
    }
  }

  return result;
}

export type AstrologyChartWheelProps = {
  facts: AstrologyChartFacts;
  className?: string;
  /**
   * 行星黄经覆盖（星体 → 绝对黄经）：表单预览的太阳滑动动画使用——
   * 覆盖后该星体按真实黄经渲染并平滑滑动（尊重减少动态），其余星体保持 facts 状态。
   */
  planetOverrides?: Partial<Record<PlanetBody, number>>;
  /**
   * 分层揭示阶段（05 加载仪式用；未传 = 完整静态渲染，兼容既有调用）：
   * 1 坐标脉冲（刻度环 + 星座环 + 中心准星）→ 2 行星依序点亮 → 3 宫位/轴线/相位生长
   * （无宫位盘跳过宫位与轴线，绝不留空位轮廓）→ 4 几何静止。
   * 所有阶段渲染的都是已锁定真值，不存在虚构摆位。
   */
  revealStage?: 1 | 2 | 3 | 4;
  /**
   * 点选交互（06 结果页用；未传 = 纯展示，不挂任何事件，零回归）：
   * 选中星体出 600ms 同心细光圈 + 相关相位提亮 + 其余星体降至 55% 透明度（不消失）；
   * 悬停/键盘聚焦节点轻微放大并浮出中文名 tooltip；再次点选或 Escape/点空白取消。
   */
  selectedBody?: PlanetBody | null;
  onSelectBody?: (body: PlanetBody | null) => void;
};

export function AstrologyChartWheel({ facts, className, planetOverrides, revealStage, selectedBody, onSelectBody }: AstrologyChartWheelProps) {
  const reduceMotion = useReducedMotion();
  const slideTransition = reduceMotion
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 90, damping: 18 };
  /** 当前揭示阶段与是否处于揭示模式（静态调用不产生任何入场动画） */
  const stage = revealStage ?? 4;
  const revealing = revealStage !== undefined && !reduceMotion;
  const withHouses = facts.dataCompleteness === 'with-houses';
  const ascLon = withHouses && facts.angles.ascendant.longitude !== null ? facts.angles.ascendant.longitude : 0;

  /** 交互模式（06）：传了 onSelectBody 才有点选/悬停/键盘 */
  const interactive = Boolean(onSelectBody);
  /** 悬停/聚焦中的星体（tooltip 与轻微放大共用） */
  const [hoveredBody, setHoveredBody] = useState<PlanetBody | null>(null);

  /**
   * 实例唯一 defs id 前缀（关键修复）：同页可存在多个星盘实例（表单页移动横条 + 桌面预览、
   * 未知档无宫位圆盘等），若共用静态 id，url(#id) 会解析到文档首个匹配——首个匹配位于
   * display:none 实例时 Chrome 不绘制其渐变/滤镜，导致可见实例盘心透明、整盘洗白。
   */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = (name: string) => `acw-${name}-${uid}`;
  const orbId = (b: PlanetBody) => gid(`orb-${b}`);
  const glowId = (b: PlanetBody) => gid(`orb-glow-${b}`);

  /** 可见行星（sign 为 null = 不稳定隐藏，绝不虚构位置）与绝对黄经 */
  const visiblePlanets = useMemo(
    () =>
      facts.planets
        .filter((p): p is typeof p & { sign: ZodiacSign } => p.sign !== null)
        .map((p) => {
          const signIndex = ZODIAC_ORDER.indexOf(p.sign);
          const overridden = planetOverrides?.[p.body];
          // 口径：signOnly（度数不稳定）行星放在星座中点仅示意星座归属，不标度数；
          // 覆盖态（表单太阳滑动）按真实黄经渲染并标注星座内整度数。
          const lon = overridden ?? signIndex * 30 + (p.degree ?? 15);
          const degree = overridden !== undefined ? overridden % 30 : p.degree;
          return { body: p.body, sign: p.sign, degree, lon, stability: p.stability };
        }),
    [facts.planets, planetOverrides]
  );

  /** 行星精确空间排布与三轨防碰撞结果映射 */
  const planetPositionsMap = useMemo(
    () => layoutPlanetPositions(visiblePlanets, ascLon),
    [visiblePlanets, ascLon]
  );

  /** 行星黄经查表（供相位连线取端点） */
  const lonByBody = useMemo(
    () => new Map(visiblePlanets.map((p) => [p.body, p.lon])),
    [visiblePlanets]
  );

  /** 可见相位：仅稳定相位进入盘面（文档 §9.3：不稳定相位不进入可见解释） */
  const visibleAspects = useMemo(
    () =>
      facts.aspects.filter(
        (a) => a.stability === 'stable' && lonByBody.has(a.source) && lonByBody.has(a.target)
      ),
    [facts.aspects, lonByBody]
  );

  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => i * 6), []);
  const signBoundaries = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 30), []);

  /** 激活展示星体：优先悬停星体，其次选中星体 */
  const activePlanet =
    (hoveredBody ? visiblePlanets.find((p) => p.body === hoveredBody) : null) ??
    (selectedBody ? visiblePlanets.find((p) => p.body === selectedBody) : null) ??
    null;
  const activePos = activePlanet && planetPositionsMap.has(activePlanet.body)
    ? [planetPositionsMap.get(activePlanet.body)!.x, planetPositionsMap.get(activePlanet.body)!.y] as [number, number]
    : null;

  return (
    <div
      className={cn('relative aspect-square w-full select-none [transform-style:preserve-3d]', className)}
      role={interactive ? 'group' : 'img'}
      aria-label={interactive ? '本命星盘，可点选星体查看事实' : '本命星盘'}
    >
      <svg
        viewBox="0 0 560 560"
        className="h-full w-full"
        onClick={interactive ? () => onSelectBody?.(null) : undefined}
      >
        <defs>
          {/* 天象仪深邃穹顶渐变：中心为可见的深蓝（非纯黑），保持宇宙纵深 */}
          <radialGradient id={gid('obsidian-stage')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0F1A42" />
            <stop offset="30%" stopColor="#0C1535" />
            <stop offset="55%" stopColor="#091028" />
            <stop offset="80%" stopColor="#060A1E" />
            <stop offset="100%" stopColor="#040816" />
          </radialGradient>
          {/* 星云多中心深空能量层：大幅提升可见度，让深空有真实星云纵深 */}
          <radialGradient id={gid('nebula-violet')} cx="30%" cy="28%" r="62%">
            <stop offset="0%" stopColor="#818CF8" stopOpacity="0.45" />
            <stop offset="38%" stopColor="#6366F1" stopOpacity="0.22" />
            <stop offset="70%" stopColor="#4338CA" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#312E81" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={gid('nebula-gold')} cx="72%" cy="68%" r="55%">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.35" />
            <stop offset="42%" stopColor="#D97706" stopOpacity="0.16" />
            <stop offset="75%" stopColor="#92400E" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#78350F" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={gid('nebula-cyan')} cx="68%" cy="25%" r="45%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#0284C7" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#0369A1" stopOpacity="0" />
          </radialGradient>
          {/* 轮底光晕：深邃星空液态光晕，赋予盘面深邃纵深 */}
          <radialGradient id={gid('halo')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#818CF8" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#6366F1" stopOpacity="0.12" />
            <stop offset="80%" stopColor="#4338CA" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#1E1B4B" stopOpacity="0" />
          </radialGradient>
          {/* 中心微光核：温润的星核聚变柔光，杜绝刺眼白斑 */}
          <radialGradient id={gid('core')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFBEB" stopOpacity="0.88" />
            <stop offset="22%" stopColor="#FDE68A" stopOpacity="0.65" />
            <stop offset="48%" stopColor="#F59E0B" stopOpacity="0.30" />
            <stop offset="75%" stopColor="#6366F1" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#4338CA" stopOpacity="0" />
          </radialGradient>
          {/* 十星宝珠 + 星辉渐变（defs 中按 PLANET_ORB 逐星生成）：球体左上受光，外层日冕高光辐射 */}
          {ALL_BODIES.map((b) => {
            const orb = PLANET_ORB[b];
            return (
              <Fragment key={b}>
                <radialGradient id={orbId(b)} cx="32%" cy="28%" r="70%">
                  <stop offset="0%" stopColor={orb.core} />
                  <stop offset="38%" stopColor={orb.mid} />
                  <stop offset="85%" stopColor={orb.edge} />
                  <stop offset="100%" stopColor={orb.edge} />
                </radialGradient>
                <radialGradient id={glowId(b)} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={orb.glow} stopOpacity="0.85" />
                  <stop offset="35%" stopColor={orb.glow} stopOpacity="0.45" />
                  <stop offset="68%" stopColor={orb.glow} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={orb.glow} stopOpacity="0" />
                </radialGradient>
              </Fragment>
            );
          })}
          {/* 轮圈外缘柔光滤镜 */}
          <filter id={gid('soft')} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          {/* 盘面边缘暗角渐变：让外圈自然过渡到表圈，消除硬切黑边 */}
          <radialGradient id={gid('edge-vignette')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="72%" stopColor="transparent" />
            <stop offset="88%" stopColor="rgba(15,20,50,0.4)" />
            <stop offset="96%" stopColor="rgba(30,35,70,0.55)" />
            <stop offset="100%" stopColor="rgba(45,50,90,0.65)" />
          </radialGradient>
          {/* 星座环内凹阴影滤镜：赋予环带沉降的立体纵深感 */}
          <filter id={gid('zodiac-inset')} x="-5%" y="-5%" width="110%" height="110%">
            <feFlood floodColor="rgba(0,0,0,0.6)" result="black" />
            <feComposite in="black" in2="SourceGraphic" operator="in" result="shadow-shape" />
            <feGaussianBlur in="shadow-shape" stdDeviation="3" result="blur" />
            <feComposite in="blur" in2="SourceGraphic" operator="out" result="inset-shadow" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="inset-shadow" />
            </feMerge>
          </filter>
          {/* 行星光芒柔化滤镜：微量模糊让宝珠边缘有光晕衍射 */}
          <filter id={gid('star-glow')} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>

        {/* ═══ 盘面天穹基底：真正的「悬浮深空天象穹顶」 ═══ */}
        {/* 外圈极深黑曜石仪器表圈，带流金刻槽与精密天体机械质感 */}
        <circle cx={CX} cy={CY} r={276} fill={`url(#${gid('obsidian-stage')})`} className="shadow-2xl" />
        <circle cx={CX} cy={CY} r={276} fill="none" strokeWidth={1.5} stroke="rgba(245,212,134,0.45)" />
        <circle cx={CX} cy={CY} r={270} fill="none" strokeWidth={0.8} stroke="rgba(255,255,255,0.18)" strokeDasharray="1 3" />

        {/* 三重流动的液态星云光雾（紫晶、流金、幽蓝） */}
        <circle cx={CX} cy={CY} r={R_ZODIAC_OUT} fill={`url(#${gid('nebula-violet')})`} />
        <circle cx={CX} cy={CY} r={R_ZODIAC_OUT} fill={`url(#${gid('nebula-gold')})`} />
        <circle cx={CX} cy={CY} r={R_ZODIAC_OUT} fill={`url(#${gid('nebula-cyan')})`} />

        {/* 盘内三层星尘（亮星/中星/暗星），赋予深空真实宇宙景深 */}
        {/* 亮星：1.0-1.3px, opacity 0.75-0.90 */}
        {[
          [160, 140, 1.2, 0.85], [380, 170, 1.3, 0.90], [270, 120, 1.3, 0.88],
          [340, 370, 1.2, 0.82], [295, 430, 1.0, 0.78], [435, 260, 1.1, 0.80],
          [175, 335, 1.2, 0.85], [130, 290, 1.0, 0.75],
        ].map(([sx, sy, sr, so], idx) => (
          <circle key={`s1-${idx}`} cx={sx} cy={sy} r={sr} fill="#FFFFFF" opacity={so} />
        ))}
        {/* 中星：0.6-0.9px, opacity 0.45-0.60 */}
        {[
          [220, 390, 0.8, 0.55], [190, 260, 0.7, 0.50], [390, 290, 0.9, 0.55],
          [375, 220, 0.8, 0.48], [250, 180, 0.7, 0.52], [310, 240, 0.9, 0.55],
          [230, 280, 0.6, 0.45], [330, 320, 0.8, 0.50], [150, 200, 0.7, 0.48],
          [410, 340, 0.8, 0.52], [200, 170, 0.6, 0.45], [360, 290, 0.7, 0.50],
          [280, 380, 0.6, 0.48], [320, 150, 0.8, 0.55], [170, 410, 0.7, 0.50],
        ].map(([sx, sy, sr, so], idx) => (
          <circle key={`s2-${idx}`} cx={sx} cy={sy} r={sr} fill="#FFFFFF" opacity={so} />
        ))}
        {/* 暗星：0.3-0.5px, opacity 0.20-0.35 */}
        {[
          [185, 150, 0.4, 0.30], [400, 200, 0.5, 0.28], [145, 350, 0.3, 0.22],
          [350, 400, 0.4, 0.25], [220, 310, 0.3, 0.20], [300, 200, 0.5, 0.30],
          [420, 320, 0.4, 0.25], [260, 410, 0.3, 0.22], [140, 230, 0.5, 0.28],
          [370, 150, 0.4, 0.25], [210, 220, 0.3, 0.20], [330, 260, 0.4, 0.25],
          [280, 160, 0.3, 0.22], [390, 360, 0.5, 0.28], [165, 290, 0.4, 0.25],
          [240, 350, 0.3, 0.20], [310, 180, 0.4, 0.25], [180, 380, 0.3, 0.22],
        ].map(([sx, sy, sr, so], idx) => (
          <circle key={`s3-${idx}`} cx={sx} cy={sy} r={sr} fill="#C7D2FE" opacity={so} />
        ))}
        {/* 十字星芒：2-3 颗亮星具有微弱的十字衍射 */}
        {[
          [270, 120, '#E0E7FF'], [340, 370, '#FDE68A'], [390, 290, '#BFDBFE'],
        ].map(([sx, sy, color], idx) => (
          <g key={`star-${idx}`} opacity={0.55}>
            <line x1={Number(sx)-5} y1={Number(sy)} x2={Number(sx)+5} y2={Number(sy)} strokeWidth={0.5} stroke={String(color)} />
            <line x1={Number(sx)} y1={Number(sy)-5} x2={Number(sx)} y2={Number(sy)+5} strokeWidth={0.5} stroke={String(color)} />
          </g>
        ))}

        {/* 盘面边缘暗角过渡层：消除盘面到表圈之间的硬切黑边 */}
        <circle cx={CX} cy={CY} r={276} fill={`url(#${gid('edge-vignette')})`} />

        {/* 盘心光核（缩小使内部空间更宽敞） */}
        <circle cx={CX} cy={CY} r={80} fill={`url(#${gid('halo')})`} />
        <circle cx={CX} cy={CY} r={28} fill={`url(#${gid('core')})`} />

        {/* 黄道圈底衬：深空环带，应用内凹阴影产生浮雕纵深 */}
        <circle
          cx={CX}
          cy={CY}
          r={(R_ZODIAC_OUT + R_ZODIAC_IN) / 2}
          fill="none"
          strokeWidth={R_ZODIAC_OUT - R_ZODIAC_IN}
          stroke="rgba(8,13,34,0.72)"
          filter={`url(#${gid('zodiac-inset')})`}
        />

        {/* ═══ 装饰表圈（非数据层，aria-hidden）：外环刻度点带三颗记号珠顺时针平稳公转、
                内环双弧逆时针差速公转——仪器外圈的恒动让盘面充满生命力；显式指定 280px 轴心确保绝对同心旋转 ═══ */}
        <g aria-hidden className="acw-orbit-cw" style={{ transformOrigin: '280px 280px' }}>
          <circle cx={CX} cy={CY} r={270} fill="none" strokeWidth={1.2} strokeDasharray="1.5 7" stroke="rgba(245,212,134,0.35)" />
          {[15, 140, 262].map((deg) => {
            const [bx, by] = polar(deg, 270);
            return (
              <g key={deg}>
                <circle cx={bx} cy={by} r={3} fill="rgba(245,212,134,0.25)" filter={`url(#${gid('soft')})`} />
                <circle cx={bx} cy={by} r={1.6} fill="#FDE68A" />
              </g>
            );
          })}
        </g>
        <g aria-hidden className="acw-orbit-ccw" style={{ transformOrigin: '280px 280px' }}>
          {[40, 220].map((start) => {
            const [ax, ay] = polar(start, 252);
            const [bx, by] = polar(start + 55, 252);
            return (
              <path
                key={start}
                d={`M ${ax} ${ay} A 252 252 0 0 1 ${bx} ${by}`}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                stroke="rgba(255,255,255,0.22)"
              />
            );
          })}
        </g>

        {/* ═══ 相位弧线（最底层，行星之下；端点向盘心内收成弓形 + 能量流光点；override 滑动时端点跟随；揭示模式阶段 3 逐条生长） ═══ */}
        {stage >= 3 && (
          <g>
            {visibleAspects.map((a, i) => {
              const [x1, y1] = polar(screenTheta(lonByBody.get(a.source)!, ascLon), R_ASPECT);
              const [x2, y2] = polar(screenTheta(lonByBody.get(a.target)!, ascLon), R_ASPECT);
              // 选中态：与选中星体相连的相位点亮为相位色并加粗，其余保持暗色细线并再降透明度（不消失，保持盘面完整感）
              const connected = selectedBody != null && (a.source === selectedBody || a.target === selectedBody);
              const style = selectedBody != null && connected ? ASPECT_LINE_CLASS[a.type] : ASPECT_LINE_DIM[a.type];
              const lineOpacity = selectedBody == null ? 1 : connected ? 1 : 0.35;
              const lineWidth = connected ? 1.6 : a.type === 'conjunction' ? 0.9 : 1;
              // 弧线控制点：弦中点向盘心内收 52%——对冲相接近直线、短距相优雅弓形（天象仪几何感）
              const qx = (x1 + x2) / 2 + (CX - (x1 + x2) / 2) * 0.52;
              const qy = (y1 + y2) / 2 + (CY - (y1 + y2) / 2) * 0.52;
              const d = `M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`;
              const arcTransition = revealing
                ? { opacity: { duration: 0.45, delay: 0.15 + i * 0.08 }, default: slideTransition }
                : slideTransition;
              return (
                <Fragment key={`${a.source}-${a.target}-${a.type}`}>
                  <motion.path
                    fill="none"
                    /* framer 动画 d 属性必须把 d 放进 initial，否则首帧写入字符串 "undefined" 触发浏览器告警 */
                    initial={revealing ? { opacity: 0, d } : { d, opacity: lineOpacity }}
                    animate={{ d, opacity: lineOpacity }}
                    transition={arcTransition}
                    strokeWidth={lineWidth}
                    strokeDasharray={style.dash}
                    stroke={connected ? PLANET_ORB[selectedBody!].glow : 'rgba(165,180,252,0.30)'}
                    className="transition-[stroke,opacity] duration-300"
                  />
                  {/* 能量流：一段亮弧沿相位线 6s 行进一轮（流光丝线穿梭于星曜之间） */}
                  {!reduceMotion && (selectedBody == null || connected) && (
                    <motion.path
                      fill="none"
                      initial={revealing ? { opacity: 0, d } : { d, opacity: lineOpacity }}
                      animate={{ d, opacity: lineOpacity }}
                      transition={arcTransition}
                      pathLength={500}
                      strokeWidth={lineWidth + 1.2}
                      strokeDasharray="32 468"
                      strokeLinecap="round"
                      stroke={connected ? PLANET_ORB[selectedBody!].glow : '#FDE68A'}
                      className="acw-aspect-flow"
                      style={{
                        animationDelay: `${i * -1.2}s`,
                        filter: 'drop-shadow(0 0 3px rgba(253,230,138,0.7))',
                      }}
                    />
                  )}
                </Fragment>
              );
            })}
          </g>
        )}

        {/* ═══ 宫位环：宫界落在真实宫头（整宫制为星座起点，Placidus 为回填宫头度数）+ 宫位号 ═══ */}
        {withHouses && stage >= 3 && facts.houses.length === 12 && (
          <g>
            <motion.circle
              cx={CX}
              cy={CY}
              r={R_HOUSE_IN}
              fill="none"
              strokeWidth={0.9}
              stroke="rgba(245,212,134,0.22)"
              initial={revealing ? { opacity: 0 } : { opacity: 1 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
            {facts.houses.map((h, i) => {
              const cuspLon = ZODIAC_ORDER.indexOf(h.sign) * 30 + h.cuspDegree;
              const theta = screenTheta(cuspLon, ascLon);
              const [x1, y1] = polar(theta, R_HOUSE_IN);
              const [x2, y2] = polar(theta, R_ZODIAC_IN);
              // 宫位号放在本宫格中心：不等宫制取与下一宫头的中点（整宫制等价于宫头 +15°）
              const next = facts.houses[(i + 1) % 12];
              const nextLon = ZODIAC_ORDER.indexOf(next.sign) * 30 + next.cuspDegree;
              const spanDeg = ((((nextLon - cuspLon) % 360) + 360) % 360) || 30;
              const midTheta = screenTheta(cuspLon + spanDeg / 2, ascLon);
              const [nx, ny] = polar(midTheta, R_HOUSE_NUM);
              return (
                <g key={h.number}>
                  {/* 宫界线从中心向外生长（揭示模式） */}
                  <motion.line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    strokeWidth={0.8}
                    stroke="rgba(245,212,134,0.25)"
                    initial={revealing ? { pathLength: 0, opacity: 0.4 } : { pathLength: 1, opacity: 1 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={revealing ? { duration: 0.5, delay: i * 0.04, ease: 'easeOut' } : { duration: 0.01 }}
                  />
                  <motion.text
                    x={nx}
                    y={ny}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-amber-300/80 text-[10px] font-bold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                    initial={revealing ? { opacity: 0 } : { opacity: 1 }}
                    animate={{ opacity: 1 }}
                    transition={revealing ? { duration: 0.3, delay: 0.3 + i * 0.04 } : { duration: 0.01 }}
                  >
                    {h.number}
                  </motion.text>
                </g>
              );
            })}
          </g>
        )}

        {/* ═══ 上升 / 天顶轴线（仅完整盘，揭示模式阶段 3 生长） ═══ */}
        {withHouses && stage >= 3 && (
          <g>
            {(
              [
                { lon: facts.angles.ascendant.longitude, label: '上升' },
                { lon: facts.angles.midheaven.longitude, label: '天顶' },
              ] as const
            ).map(
              (axis) =>
                axis.lon !== null && (
                  <g key={axis.label}>
                    {(() => {
                      const theta = screenTheta(axis.lon, ascLon);
                      const [x1, y1] = polar(theta, 36);
                      const [x2, y2] = polar(theta, R_TICK_MAJOR);
                      const [lx, ly] = polar(theta, R_AXIS_LABEL);
                      return (
                        <>
                          <motion.line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            strokeWidth={1.8}
                            stroke="#FBBF24"
                            strokeOpacity={0.85}
                            filter="drop-shadow(0 0 3px rgba(251,191,36,0.6))"
                            initial={revealing ? { pathLength: 0 } : { pathLength: 1 }}
                            animate={{ pathLength: 1 }}
                            transition={revealing ? { duration: 0.6, ease: 'easeOut' } : { duration: 0.01 }}
                          />
                          <motion.text
                            x={lx}
                            y={ly}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="fill-amber-300 text-[11px] font-bold tracking-widest drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
                            initial={revealing ? { opacity: 0 } : { opacity: 1 }}
                            animate={{ opacity: 1 }}
                            transition={revealing ? { duration: 0.3, delay: 0.5 } : { duration: 0.01 }}
                          >
                            {axis.label}
                          </motion.text>
                        </>
                      );
                    })()}
                  </g>
                )
            )}
          </g>
        )}

        {/* ═══ 坐标框架（星座环 + 刻度）：揭示阶段一轻微脉冲，之后静止。
                显式给 initial：不给时 framer 会从 undefined 动画到 1 并打警告（控制台噪音）；
                非揭示态直接用 1 起手，静态调用不产生任何入场动画 ═══ */}
        <motion.g
          initial={revealing ? { opacity: 0.5 } : { opacity: 1 }}
          animate={revealing && stage === 1 ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
          transition={revealing && stage === 1 ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        >
        <g>
          <circle cx={CX} cy={CY} r={R_ZODIAC_OUT} fill="none" strokeWidth={1.2} stroke="rgba(245,212,134,0.30)" />
          <circle cx={CX} cy={CY} r={R_ZODIAC_IN} fill="none" strokeWidth={1} stroke="rgba(245,212,134,0.20)" />
          {/* 星座环高奢黑曜石流金晶体扇区：极低透明度微曜晶体，激活时透出黄金琥珀微光 */}
          {ZODIAC_ORDER.map((sign, i) => {
            const ta = screenTheta(i * 30 + 30, ascLon);
            const tb = screenTheta(i * 30, ascLon);
            const [iax, iay] = polar(ta, R_ZODIAC_IN);
            const [oax, oay] = polar(ta, R_ZODIAC_OUT);
            const [obx, oby] = polar(tb, R_ZODIAC_OUT);
            const [ibx, iby] = polar(tb, R_ZODIAC_IN);
            const planetInSign = visiblePlanets.find((p) => p.sign === sign);
            const isSignActive = selectedBody != null && visiblePlanets.find((p) => p.body === selectedBody)?.sign === sign;
            const elementStyle = SIGN_ELEMENT_STYLE[elementOfSignIndex(i)];
            return (
              <path
                key={`wedge-${sign}`}
                d={`M ${iax} ${iay} L ${oax} ${oay} A ${R_ZODIAC_OUT} ${R_ZODIAC_OUT} 0 0 1 ${obx} ${oby} L ${ibx} ${iby} A ${R_ZODIAC_IN} ${R_ZODIAC_IN} 0 0 0 ${iax} ${iay} Z`}
                strokeWidth={isSignActive ? 1.4 : 0}
                className={cn(
                  isSignActive
                    ? elementStyle.active
                    : elementStyle.wedge,
                  interactive && planetInSign && 'cursor-pointer transition-all duration-300 hover:fill-amber-400/[0.08]'
                )}
                onClick={
                  interactive && planetInSign
                    ? (e) => {
                        e.stopPropagation();
                        onSelectBody?.(selectedBody === planetInSign.body ? null : planetInSign.body);
                      }
                    : undefined
                }
              />
            );
          })}
          {/* 黄道 12 宫界线：流金微刻度线（金箔刻槽质感） */}
          {signBoundaries.map((deg) => {
            const theta = screenTheta(deg, ascLon);
            const [x1, y1] = polar(theta, R_ZODIAC_IN);
            const [x2, y2] = polar(theta, R_ZODIAC_OUT);
            return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1} stroke="rgba(245,212,134,0.42)" />;
          })}
          {/* 12 星座黄金星符：精密镌刻的天文古老图腾，通体泛着高奢金砂与微晶星芒 */}
          {ZODIAC_ORDER.map((sign, i) => {
            const theta = screenTheta(i * 30 + 15, ascLon);
            const [gx, gy] = polar(theta, R_ZODIAC_GLYPH);
            const Glyph = ZODIAC_GLYPH[sign];
            const planetInSign = visiblePlanets.find((p) => p.sign === sign);
            const isSignActive = selectedBody != null && visiblePlanets.find((p) => p.body === selectedBody)?.sign === sign;
            return (
              <g
                key={sign}
                className={cn(interactive && planetInSign && 'cursor-pointer')}
                onClick={
                  interactive && planetInSign
                    ? (e) => {
                        e.stopPropagation();
                        onSelectBody?.(selectedBody === planetInSign.body ? null : planetInSign.body);
                      }
                    : undefined
                }
              >
                {/* 符号常驻黄金星砂微晕托底 */}
                <circle cx={gx} cy={gy} r={12} fill={isSignActive ? 'rgba(251,191,36,0.22)' : 'rgba(245,212,134,0.06)'} filter={`url(#${gid('soft')})`} />
                <Glyph
                  x={gx - ZODIAC_ICON / 2}
                  y={gy - ZODIAC_ICON / 2}
                  width={ZODIAC_ICON}
                  height={ZODIAC_ICON}
                  className={cn(
                    SIGN_ELEMENT_STYLE[elementOfSignIndex(i)].glyph,
                    isSignActive ? 'drop-shadow-[0_0_8px_rgba(251,191,36,0.95)]' : 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]'
                  )}
                />
              </g>
            );
          })}
        </g>

        {/* ═══ 外圈刻度：60 小刻度 + 12 主刻度（流金高精天文仪器刻度） ═══ */}
        <g>
          {ticks.map((deg) => {
            const major = deg % 30 === 0;
            const theta = screenTheta(deg, ascLon);
            const [x1, y1] = polar(theta, major ? R_TICK_MAJOR : R_TICK_MIN);
            const [x2, y2] = polar(theta, R_TICK_OUT);
            return (
              <line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={major ? 1.2 : 0.7}
                stroke={major ? 'rgba(245,212,134,0.65)' : 'rgba(255,255,255,0.22)'}
              />
            );
          })}
        </g>
        </motion.g>

        {/* ═══ 中心准星：坐标校准脉冲（仅揭示阶段一；减少动态时静态） ═══ */}
        {stage === 1 && (
          <g>
            <line x1={CX - 16} y1={CY} x2={CX + 16} y2={CY} strokeWidth={1} className="stroke-indigo-400/70 dark:stroke-indigo-300/60" />
            <line x1={CX} y1={CY - 16} x2={CX} y2={CY + 16} strokeWidth={1} className="stroke-indigo-400/70 dark:stroke-indigo-300/60" />
            <circle cx={CX} cy={CY} r={2.5} className="fill-indigo-500 dark:fill-indigo-300" />
            {revealing && (
              <>
                <motion.circle
                  cx={CX}
                  cy={CY}
                  fill="none"
                  strokeWidth={1}
                  className="stroke-indigo-400/50 dark:stroke-indigo-300/40"
                  initial={{ r: 24, opacity: 0.6 }}
                  animate={{ r: 150, opacity: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                />
                <motion.circle
                  cx={CX}
                  cy={CY}
                  fill="none"
                  strokeWidth={1}
                  className="stroke-indigo-400/50 dark:stroke-indigo-300/40"
                  initial={{ r: 24, opacity: 0.6 }}
                  animate={{ r: 150, opacity: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.9 }}
                />
              </>
            )}
          </g>
        )}

        {/* ═══ 盘心星核（静态展示常驻）：四芒星 + 双涟漪慢速扩散（点选星曜时爆发引力光波） ═══ */}
        {stage >= 4 && (
          <g aria-hidden>
            {!reduceMotion && (
              <>
                <motion.circle cx={CX} cy={CY} fill="none" strokeWidth={1} stroke="rgba(245,212,134,0.30)" initial={{ r: 18, opacity: 0.4 }} animate={{ r: 135, opacity: 0 }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeOut' }} />
                <motion.circle cx={CX} cy={CY} fill="none" strokeWidth={1} stroke="rgba(245,212,134,0.25)" initial={{ r: 18, opacity: 0.4 }} animate={{ r: 135, opacity: 0 }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeOut', delay: 1.6 }} />
                {/* 点选行星时从盘心爆发的引力共振光波 */}
                {selectedBody != null && (
                  <motion.circle
                    key={`resonance-wave-${selectedBody}`}
                    cx={CX}
                    cy={CY}
                    fill="none"
                    strokeWidth={2.4}
                    stroke={PLANET_ORB[selectedBody].glow}
                    initial={{ r: 14, opacity: 0.95 }}
                    animate={{ r: 255, opacity: 0 }}
                    transition={{ duration: 1.1, ease: 'easeOut' }}
                  />
                )}
              </>
            )}
            {/* 盘心八面体黄金星芒印鉴 */}
            <path
              d="M280 264 C282 274 286 278 296 280 C286 282 282 286 280 296 C278 286 274 282 264 280 C274 278 278 274 280 264 Z"
              fill={`url(#${gid('core')})`}
              filter="drop-shadow(0 0 6px rgba(251,191,36,0.8))"
            />
            <circle cx={CX} cy={CY} r={2.5} fill="#FFFFFF" />
          </g>
        )}

        {/* ═══ 行星节点：符号 + 度数（override 时平滑滑动；度数不稳定不标，绝不虚构；揭示模式阶段 2 依序点亮；
             06 交互：点选出光圈事实联动、悬停/聚焦放大 + 中文 tooltip、其余星体降 55% 不消失） ═══ */}
      </svg>

      {/* ═══ 行星层：独立悬浮于盘面上方（translateZ 34px）——3D 舞台倾斜时行星与盘面产生真实视差分离。
              可交互模式下点击空白处调用 onSelectBody(null) 取消选中，点击星体时 stopPropagation ═══ */}
      <svg
        viewBox="0 0 560 560"
        className="absolute inset-0 h-full w-full [transform:translateZ(34px)]"
        onClick={interactive ? () => onSelectBody?.(null) : undefined}
      >
        {stage >= 2 && (
          <g>
            {visiblePlanets.map((p, i) => {
              const pos = planetPositionsMap.get(p.body)!;
              const px = pos.x;
              const py = pos.y;
              const dx = pos.degX;
              const dy = pos.degY;
              const Glyph = PLANET_GLYPH[p.body];
              const isSelected = selectedBody === p.body;
              const isHovered = hoveredBody === p.body;
              // 选中他人时本节点降至 55%（不消失）；悬停/选中轻微放大
              const nodeOpacity = selectedBody == null || isSelected ? 1 : 0.55;
              const nodeScale = isSelected ? 1.28 : isHovered ? 1.15 : 1;
              const ariaLabel = `${PLANET_CN[p.body]}，${ZODIAC_CN[p.sign]}${p.degree !== null ? ` ${Math.floor(p.degree)} 度` : ''}`;
              return (
                <motion.g
                  key={p.body}
                  initial={revealing ? { opacity: 0, scale: 0.4, x: px, y: py } : { x: px, y: py, opacity: nodeOpacity, scale: nodeScale }}
                  animate={{ x: px, y: py, opacity: nodeOpacity, scale: nodeScale }}
                  transition={
                    revealing
                      ? {
                          opacity: { duration: 0.35, delay: i * 0.09 },
                          scale: { type: 'spring', stiffness: 260, damping: 16, delay: i * 0.09 },
                          default: slideTransition,
                        }
                      : slideTransition
                  }
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? ariaLabel : undefined}
                  aria-pressed={interactive ? isSelected : undefined}
                  className={cn(interactive && 'cursor-pointer select-none')}
                  style={{ outline: 'none' }}
                  onClick={
                    interactive
                      ? (e) => {
                          e.stopPropagation();
                          onSelectBody?.(isSelected ? null : p.body);
                        }
                      : undefined
                  }
                  onPointerDown={
                    interactive
                      ? (e) => {
                          e.stopPropagation();
                        }
                      : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectBody?.(isSelected ? null : p.body);
                          } else if (e.key === 'Escape') {
                            e.stopPropagation();
                            onSelectBody?.(null);
                          }
                        }
                      : undefined
                  }
                  onMouseEnter={interactive ? () => setHoveredBody(p.body) : undefined}
                  onMouseLeave={interactive ? () => setHoveredBody(null) : undefined}
                  onFocus={interactive ? () => setHoveredBody(p.body) : undefined}
                  onBlur={interactive ? () => setHoveredBody(null) : undefined}
                >
                {/* 触达热区（带显式透明度与 pointerEvents="all" 确保浏览器 100% 捕获点击） */}
                {interactive && (
                  <circle cx={0} cy={0} r={34} fill="#000" fillOpacity={0} pointerEvents="all" className="cursor-pointer" />
                )}
                {isSelected &&
                  (reduceMotion ? (
                    <circle cx={0} cy={0} r={20} fill="none" strokeWidth={1.4} stroke={PLANET_ORB[p.body].glow} />
                  ) : (
                    <>
                      {/* 能量冲击波 A：同色星辉向外强力扩散 */}
                      <motion.circle
                        key={`sel-a-${p.body}`}
                        cx={0}
                        cy={0}
                        fill="none"
                        strokeWidth={2.2}
                        stroke={PLANET_ORB[p.body].glow}
                        initial={{ r: 14, opacity: 0.95 }}
                        animate={{ r: 52, opacity: 0 }}
                        transition={{ duration: 0.7, ease: 'easeOut' }}
                      />
                      {/* 能量冲击波 B：延迟二次扩散 */}
                      <motion.circle
                        key={`sel-b-${p.body}`}
                        cx={0}
                        cy={0}
                        fill="none"
                        strokeWidth={1.4}
                        stroke={PLANET_ORB[p.body].glow}
                        initial={{ r: 14, opacity: 0.8 }}
                        animate={{ r: 42, opacity: 0 }}
                        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.16 }}
                      />
                      {/* 恒定高亮光圈 */}
                      <circle cx={0} cy={0} r={19} fill="none" strokeWidth={1.6} stroke={PLANET_ORB[p.body].glow} />

                      {/* 选中超新星十字星芒（自转放射光线） */}
                      <g className="animate-acw-spin-slow">
                        <line x1={-30} y1={0} x2={30} y2={0} strokeWidth={1} stroke={PLANET_ORB[p.body].glow} strokeOpacity={0.85} />
                        <line x1={0} y1={-30} x2={0} y2={30} strokeWidth={1} stroke={PLANET_ORB[p.body].glow} strokeOpacity={0.85} />
                      </g>

                      {/* 选中寻星雷达虚线环：双伴星公转 */}
                      <g className="acw-orbit-cw" style={{ animationDuration: '8s' }}>
                        <circle cx={0} cy={0} r={28} fill="none" strokeWidth={1} strokeDasharray="3 5" stroke={PLANET_ORB[p.body].glow} strokeOpacity={0.85} />
                        <circle cx={0} cy={-28} r={2.2} fill={PLANET_ORB[p.body].glow} />
                        <circle cx={0} cy={28} r={1.6} fill={PLANET_ORB[p.body].glow} />
                      </g>
                    </>
                  ))}
                {/* 键盘聚焦提示环（与鼠标悬停共用 hoveredBody，仅在交互模式出现） */}
                {interactive && isHovered && !isSelected && (
                  <circle cx={0} cy={0} r={17} fill="none" strokeWidth={0.9} strokeDasharray="2.5 3" className="stroke-indigo-400/70 dark:stroke-indigo-200/60" />
                )}
                {/* 1. 外层天体光晕（缩小让行星更精致，呼吸律动保持） */}
                <circle
                  cx={0}
                  cy={0}
                  r={p.body === 'sun' ? 24 : p.body === 'moon' ? 20 : 17}
                  fill={`url(#${glowId(p.body)})`}
                  className="acw-breathe pointer-events-none"
                  style={{ animationDelay: `${i * 0.7}s` }}
                />

                {/* 2. 自转引力微轨（缩小以配合更精致的宝珠尺寸） */}
                <circle
                  cx={0}
                  cy={0}
                  r={PLANET_ICON / 2 + 5}
                  fill="none"
                  strokeWidth={0.6}
                  stroke={PLANET_ORB[p.body].glow}
                  strokeOpacity={0.30}
                  strokeDasharray="1.5 2.5"
                  className="pointer-events-none"
                />

                {/* 3. 宝珠本体：精致星点球体（瘦身后更显精密） */}
                <circle
                  cx={0}
                  cy={0}
                  r={PLANET_ICON / 2 + 1}
                  fill={`url(#${orbId(p.body)})`}
                  strokeWidth={0.6}
                  stroke="rgba(255,255,255,0.35)"
                  className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
                />

                {/* 4. 土星星环（配合瘦身后的宝珠同步缩小） */}
                {p.body === 'saturn' && (
                  <g transform="rotate(-22)">
                    <ellipse
                      cx={0}
                      cy={0}
                      rx={PLANET_ICON / 2 + 7}
                      ry={4}
                      fill="none"
                      strokeWidth={0.6}
                      stroke="#FDE68A"
                      strokeOpacity={0.40}
                      strokeDasharray="2 3"
                    />
                    <ellipse
                      cx={0}
                      cy={0}
                      rx={PLANET_ICON / 2 + 5}
                      ry={3}
                      fill="none"
                      strokeWidth={1.2}
                      stroke="#F5D486"
                      strokeOpacity={0.85}
                    />
                  </g>
                )}

                {/* 5. 左上微光高光点（精致微弧，非白色胶带） */}
                <ellipse cx={-2.5} cy={-3.5} rx={2.5} ry={1.5} className="fill-white/60" />
                <ellipse cx={-1} cy={-4.5} rx={1.2} ry={0.7} className="fill-white/80" />

                {/* 6. 天体符号印记：高对比深色镌刻图腾 */}
                <Glyph
                  x={-PLANET_ICON / 2}
                  y={-PLANET_ICON / 2}
                  width={PLANET_ICON}
                  height={PLANET_ICON}
                  style={{ color: PLANET_ORB[p.body].glyph }}
                />

                {/* 7. 黄经度数刻度字标：金箔微光字体 */}
                {p.degree !== null && (
                  <text
                    x={dx - px}
                    y={dy - py}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-amber-200 text-[10px] font-bold tabular-nums drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] [filter:drop-shadow(0_0_2px_rgba(251,191,36,0.6))]"
                  >
                    {Math.floor(p.degree)}°
                  </text>
                )}
              </motion.g>
            );
          })}
          </g>
        )}
      </svg>

      {/* 中文名浮动胶囊：悬停或点选星体时浮出，跟随宝珠并保持 3D 视差对齐 */}
      {interactive && activePlanet && activePos && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/40 bg-[#0A0E24]/[0.88] px-3.5 py-1 text-xs font-bold text-amber-200 shadow-[0_8px_32px_-6px_rgba(0,0,0,0.85)] ring-1 ring-white/10 backdrop-blur-xl backdrop-saturate-150"
          style={{
            left: `${(activePos[0] / 560) * 100}%`,
            top: `${(activePos[1] / 560) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 16px)) translateZ(48px)',
          }}
        >
          ✦ {PLANET_CN[activePlanet.body]} · {ZODIAC_CN[activePlanet.sign]}
          {activePlanet.degree !== null ? ` ${Math.floor(activePlanet.degree)}°` : ''}
        </div>
      )}
    </div>
  );
}
