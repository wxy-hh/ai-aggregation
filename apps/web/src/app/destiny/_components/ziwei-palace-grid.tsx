'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Crown } from 'lucide-react';
import type { ZiweiChartData, ZiweiChartPalace } from '@/app/destiny/_components/types';
import { GlossaryTooltip } from './ziwei-glossary';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { NightSky } from './ziwei-night-sky';

// ═══════════════════════════════════════════════════════════════
//  紫微斗数命盘网格 —「白昼 × 夜幕」双主题
//  星盘盘面 · 鎏金宋体星曜 · 中央星盘仪 · 三方四正星轨连线
//  主题令牌见 styles/ziwei-theme.css(.zw-* 语义类随根作用域自动切换)
// ═══════════════════════════════════════════════════════════════

// ─── 双主题视觉 token(语义类,昼/夜由根作用域变量决定) ───

/** 盘面外壳(内边距沿用原 p-4 sm:p-5,避免宫位卡片与外层边框视觉重叠) */
const GRID_SHELL_CLASS = 'zw-grid-shell p-4 sm:p-5';

/** 宫位卡基底(布局/交互/昼夜色全在语义类内,保滚动性能不开 blur) */
const CARD_BASE_CLASS = 'group zw-palace-card p-3.5 sm:p-4';

// ─── 十二宫排布顺序 ───
const PALACE_ORDER = [
  '父母', '福德', '田宅', '官禄',
  '命宫', '兄弟', '仆役', '夫妻',
  '迁移', '子女', '财帛', '疾厄',
];

// 桌面端 CSS Grid 定位(4×4,中间留 2×2 给中央星盘仪)
const GRID_AREAS = [
  'col-start-1 row-start-1',
  'col-start-2 row-start-1',
  'col-start-3 row-start-1',
  'col-start-4 row-start-1',
  'col-start-1 row-start-2',
  'col-start-1 row-start-3',
  'col-start-4 row-start-2',
  'col-start-4 row-start-3',
  'col-start-1 row-start-4',
  'col-start-2 row-start-4',
  'col-start-3 row-start-4',
  'col-start-4 row-start-4',
];

// ─── 宫位功能分组(夜色导向点用色) ───
const PALACE_GROUP_MAP: Record<string, 'self' | 'family' | 'career' | 'spirit'> = {
  '命宫': 'self',
  '兄弟': 'family',
  '夫妻': 'family',
  '子女': 'family',
  '财帛': 'career',
  '疾厄': 'spirit',
  '迁移': 'spirit',
  '仆役': 'family',
  '官禄': 'career',
  '田宅': 'career',
  '福德': 'spirit',
  '父母': 'family',
};

/** 分组导向点颜色(小而克制,只用于宫位名前 5px 光点;昼/夜由变量切换) */
const GROUP_DOT_COLORS: Record<string, string> = {
  self: 'var(--zw-dot-self)',
  family: 'var(--zw-dot-family)',
  career: 'var(--zw-dot-career)',
  spirit: 'var(--zw-dot-spirit)',
};

// ─── 三方四正关系表 ───
const TRIPARTITE_MAP: Record<string, { opposite: string; tri: [string, string] }> = {
  '命宫': { opposite: '迁移', tri: ['财帛', '官禄'] },
  '兄弟': { opposite: '仆役', tri: ['疾厄', '田宅'] },
  '夫妻': { opposite: '官禄', tri: ['福德', '迁移'] },
  '子女': { opposite: '田宅', tri: ['仆役', '父母'] },
  '财帛': { opposite: '福德', tri: ['命宫', '官禄'] },
  '疾厄': { opposite: '父母', tri: ['兄弟', '田宅'] },
  '迁移': { opposite: '命宫', tri: ['夫妻', '福德'] },
  '仆役': { opposite: '兄弟', tri: ['子女', '父母'] },
  '官禄': { opposite: '夫妻', tri: ['命宫', '财帛'] },
  '田宅': { opposite: '子女', tri: ['兄弟', '疾厄'] },
  '福德': { opposite: '财帛', tri: ['夫妻', '迁移'] },
  '父母': { opposite: '疾厄', tri: ['仆役', '子女'] },
};

// ─── 天干五行色(双主题令牌类) ───
const STEM_COLORS: Record<string, string> = {
  '甲': 'zw-stem-wood',  '乙': 'zw-stem-wood',
  '丙': 'zw-stem-fire',  '丁': 'zw-stem-fire',
  '戊': 'zw-stem-earth', '己': 'zw-stem-earth',
  '庚': 'zw-stem-metal', '辛': 'zw-stem-metal',
  '壬': 'zw-stem-water', '癸': 'zw-stem-water',
};

// ─── 十四主星颜色(双主题令牌类:夜幕高亮色阶 / 白昼 600 深档) ───
const STAR_COLORS: Array<{ names: string[]; className: string }> = [
  { names: ['紫微'], className: 'zw-star-ziwei' },
  { names: ['天府'], className: 'zw-star-tianfu' },
  { names: ['武曲'], className: 'zw-star-wuqu' },
  { names: ['太阳'], className: 'zw-star-taiyang' },
  { names: ['太阴'], className: 'zw-star-taiyin' },
  { names: ['天机'], className: 'zw-star-tianji' },
  { names: ['天同'], className: 'zw-star-tiantong' },
  { names: ['廉贞'], className: 'zw-star-lianzhen' },
  { names: ['贪狼'], className: 'zw-star-tanlang' },
  { names: ['巨门'], className: 'zw-star-jumen' },
  { names: ['天相'], className: 'zw-star-tianxiang' },
  { names: ['天梁'], className: 'zw-star-tianliang' },
  { names: ['七杀'], className: 'zw-star-qisha' },
  { names: ['破军'], className: 'zw-star-pojun' },
];

// ─── 宫位含义速查 ───
const PALACE_MEANING: Record<string, string> = {
  '命宫': '个性与命运核心',
  '兄弟': '兄弟姐妹与同辈',
  '夫妻': '婚姻感情与伴侣',
  '子女': '子女、享乐与创意',
  '财帛': '财运与理财方式',
  '疾厄': '健康与疾病倾向',
  '迁移': '外出运与对外表现',
  '仆役': '朋友、社交与人脉',
  '官禄': '事业与工作成就',
  '田宅': '房产、家庭与根基',
  '福德': '精神享受与福气',
  '父母': '父母、长辈与上级',
};

// ─── 星曜组合格局识别表 ───
const STAR_PATTERNS: Array<{ names: string[]; pattern: string }> = [
  { names: ['紫微', '天府'], pattern: '紫府同宫' },
  { names: ['太阳', '太阴'], pattern: '日月并明' },
  { names: ['火星', '贪狼'], pattern: '火贪格' },
  { names: ['铃星', '贪狼'], pattern: '铃贪格' },
  { names: ['七杀', '破军'], pattern: '杀破狼' },
  { names: ['七杀', '贪狼'], pattern: '杀破狼' },
  { names: ['天梁', '太阳'], pattern: '日照雷门' },
  { names: ['廉贞', '七杀'], pattern: '廉杀格' },
  { names: ['武曲', '贪狼'], pattern: '武贪格' },
];

// ─── 十二地支(星盘仪外环) ───
const BRANCHES_12 = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// ═══════════════════════════════════════════════════════════════
//  辅助函数
// ═══════════════════════════════════════════════════════════════

/** 获取主星颜色 */
function getStarColor(name: string): string {
  for (const item of STAR_COLORS) {
    if (item.names.some((n) => name.includes(n))) return item.className;
  }
  return 'zw-star-default';
}

/** 庙旺落陷 8 级颜色(双主题令牌类) */
function getBrightnessColor(brightness: string): string {
  switch (brightness) {
    case '庙':  return 'zw-bri-miao';
    case '旺':  return 'zw-bri-wang';
    case '得':  return 'zw-bri-de';
    case '利':  return 'zw-bri-li';
    case '平':  return 'zw-bri-ping';
    case '闲':  return 'zw-bri-xian';
    case '陷':  return 'zw-bri-xian2';
    case '不':  return 'zw-bri-bu';
    default:    return 'zw-bri-default';
  }
}

/** 获取天干五行色 */
function getStemColor(stem: string): string {
  return STEM_COLORS[stem] ?? 'zw-stem-metal';
}

/** 获取三方四正 */
function getTripartite(name: string): { opposite: string; tri: string[] } | null {
  const t = TRIPARTITE_MAP[name];
  if (!t) return null;
  return { opposite: t.opposite, tri: t.tri };
}

/** 判断是否属于某宫的三方四正 */
function isRelatedTo(targetName: string, sourceName: string): boolean {
  if (targetName === sourceName) return false;
  const t = getTripartite(sourceName);
  if (!t) return false;
  return t.opposite === targetName || t.tri.includes(targetName);
}

/** 识别主星组合格局 */
function identifyPattern(stars: ZiweiChartPalace['majorStars']): string | null {
  const names = stars.map((s) => s.name);
  for (const p of STAR_PATTERNS) {
    if (p.names.every((n) => names.some((sn) => sn.includes(n)))) {
      return p.pattern;
    }
  }
  return null;
}

/** 获取对宫(用于空宫借星) */
function getOppositePalace(name: string, palaces: ZiweiChartPalace[]): ZiweiChartPalace | null {
  const opposite: Record<string, string> = {
    '命宫': '迁移', '迁移': '命宫',
    '兄弟': '仆役', '仆役': '兄弟',
    '夫妻': '官禄', '官禄': '夫妻',
    '子女': '田宅', '田宅': '子女',
    '财帛': '福德', '福德': '财帛',
    '疾厄': '父母', '父母': '疾厄',
  };
  const targetName = opposite[name];
  if (!targetName) return null;
  return palaces.find((p) => p.name === targetName) ?? null;
}

/** 计算四化徽章数据(简化:主星名称匹配四化星名) */
function getSihuaBadges(palace: ZiweiChartPalace, chart: ZiweiChartData): string[] {
  const badges: string[] = [];
  const majorNames = palace.majorStars.map((s) => s.name);
  const allStarNames = [...majorNames, ...palace.minorStars.map((s) => s.name)];

  if (allStarNames.some((n) => n === chart.sihua.lu))  badges.push('禄');
  if (allStarNames.some((n) => n === chart.sihua.quan)) badges.push('权');
  if (allStarNames.some((n) => n === chart.sihua.ke))  badges.push('科');
  if (allStarNames.some((n) => n === chart.sihua.ji))  badges.push('忌');

  return badges;
}

/** 计算当前年龄 */
function getCurrentAge(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}

/** 判断是否当前大限 */
function isCurrentDecade(palace: ZiweiChartPalace, birthYear?: number): boolean {
  if (!birthYear) return false;
  const age = getCurrentAge(birthYear);
  return age >= palace.stageRange[0] && age <= palace.stageRange[1];
}

/** 判断是否为当前流年宫(简化:按地支与流年太岁匹配) */
function isCurrentYearPalace(palace: ZiweiChartPalace): boolean {
  const currentYear = new Date().getFullYear();
  const zodiacMap: Record<number, string> = {
    0: '子', 1: '丑', 2: '寅', 3: '卯', 4: '辰', 5: '巳',
    6: '午', 7: '未', 8: '申', 9: '酉', 10: '戌', 11: '亥',
  };
  const yearBranch = zodiacMap[currentYear % 12];
  return palace.earthlyBranch === yearBranch;
}

/** 根据五行局返回起运年龄 */
function getStartingAge(fiveElementsClass: string): string {
  const map: Record<string, string> = {
    '水二局': '2 岁起运', '木三局': '3 岁起运', '金四局': '4 岁起运',
    '土五局': '5 岁起运', '火六局': '6 岁起运',
  };
  return map[fiveElementsClass] ?? '';
}

/** 宫干 → 宫位几何工具:从 from 沿 from→to 方向求与卡片矩形边界的交点(星轨边缘裁剪) */
type Pt = { x: number; y: number };

function clipToRectEdge(from: Pt, to: Pt, rect: DOMRect, containerRect: DOMRect): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const edge = {
    l: rect.left - containerRect.left,
    t: rect.top - containerRect.top,
    r: rect.right - containerRect.left,
    b: rect.bottom - containerRect.top,
  };
  let t = Number.POSITIVE_INFINITY;
  if (dx > 0) t = Math.min(t, (edge.r - from.x) / dx);
  else if (dx < 0) t = Math.min(t, (edge.l - from.x) / dx);
  if (dy > 0) t = Math.min(t, (edge.b - from.y) / dy);
  else if (dy < 0) t = Math.min(t, (edge.t - from.y) / dy);
  if (!Number.isFinite(t) || t < 0) t = 0;
  // 向外多走 5px,让线头没入卡片边缘之下,视觉上像从宫位中发出
  const len = Math.hypot(dx, dy) || 1;
  const pad = 5;
  return { x: from.x + dx * t + (dx / len) * pad, y: from.y + dy * t + (dy / len) * pad };
}

// ═══════════════════════════════════════════════════════════════
//  子组件:四化小徽章(夜色印章感)
// ═══════════════════════════════════════════════════════════════

function SihuaBadgeDot({ type }: { type: string }) {
  const styles: Record<string, string> = {
    '禄': 'zw-text-pos border-[color:var(--zw-acc-wealth-a40)] bg-[color:var(--zw-acc-wealth-a10)]',
    '权': 'zw-text-gold border-[color:var(--zw-gold-a40)] bg-[color:var(--zw-gold-a10)]',
    '科': 'zw-text-info border-[color:var(--zw-info-a35)] bg-[color:var(--zw-info-a10)]',
    '忌': 'zw-text-danger border-[color:var(--zw-acc-love-a40)] bg-[color:var(--zw-acc-love-a10)]',
  };
  return (
    <span
      className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded border px-1 font-song text-[9px] font-bold ${styles[type] ?? 'zw-text-2b border-[color:var(--zw-border-15)] bg-[color:var(--zw-surface-3)]'}`}
    >
      {type}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
//  子组件:星盘仪光环(地支环 + 双层缓旋刻度)
// ═══════════════════════════════════════════════════════════════

function AstrolabeRing({ activeBranch }: { activeBranch?: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      {/* 外环:十二地支(静止,保可读性;当前宫位地支鎏金点亮)。
          注:SVG 表现属性不支持 var(),笔触/填充色统一走 style */}
      <circle cx="50" cy="50" r="47" fill="none" style={{ stroke: 'var(--zw-gold)' }} strokeOpacity="0.22" strokeWidth="0.3" />
      <circle cx="50" cy="50" r="41.5" fill="none" style={{ stroke: 'var(--zw-gold)' }} strokeOpacity="0.12" strokeWidth="0.2" />
      {BRANCHES_12.map((b, i) => {
        const angle = ((i * 30 - 90) * Math.PI) / 180;
        const x = 50 + 44.2 * Math.cos(angle);
        const y = 50 + 44.2 * Math.sin(angle);
        const active = b === activeBranch;
        return (
          <text
            key={b}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={active ? 5.5 : 4.2}
            fontWeight={active ? 700 : 400}
            fontFamily="var(--font-song)"
            fillOpacity={active ? 1 : 0.45}
            style={{
              fill: active ? 'var(--zw-gold-soft)' : 'var(--zw-gold)',
              filter: active ? 'drop-shadow(0 0 2.5px var(--zw-gold-glow-strong))' : undefined,
            }}
          >
            {b}
          </text>
        );
      })}

      {/* 中环:六十刻度(顺时针缓旋 120s) */}
      <g style={{ transformOrigin: '50px 50px', animation: 'ziwei-spin-slow 120s linear infinite' }}>
        {Array.from({ length: 60 }, (_, i) => {
          const angle = ((i * 6) * Math.PI) / 180;
          const isMajor = i % 5 === 0;
          const r1 = isMajor ? 36.2 : 37.8;
          const r2 = 39.4;
          return (
            <line
              key={i}
              x1={50 + r1 * Math.cos(angle)}
              y1={50 + r1 * Math.sin(angle)}
              x2={50 + r2 * Math.cos(angle)}
              y2={50 + r2 * Math.sin(angle)}
              style={{ stroke: 'var(--zw-violet)' }}
              strokeOpacity={isMajor ? 0.4 : 0.16}
              strokeWidth={isMajor ? 0.35 : 0.2}
            />
          );
        })}
      </g>

      {/* 内环:虚线 + 四正方位点(逆时针缓旋 90s) */}
      <g style={{ transformOrigin: '50px 50px', animation: 'ziwei-spin-rev 90s linear infinite' }}>
        <circle
          cx="50" cy="50" r="30" fill="none"
          style={{ stroke: 'var(--zw-violet)' }} strokeOpacity="0.25" strokeWidth="0.25" strokeDasharray="0.8 2.4"
        />
        {[0, 90, 180, 270].map((deg) => {
          const angle = ((deg - 90) * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={50 + 30 * Math.cos(angle)}
              cy={50 + 30 * Math.sin(angle)}
              r="0.7"
              style={{ fill: 'var(--zw-gold)' }}
              fillOpacity="0.5"
            />
          );
        })}
      </g>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
//  子组件:星轨连线层(三方四正)
// ═══════════════════════════════════════════════════════════════

function ConstellationLayer({
  containerRef,
  cardRefs,
  activePalaceLabel,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  cardRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  activePalaceLabel: string;
}) {
  const [segments, setSegments] = useState<Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const compute = () => {
      const tripartite = getTripartite(activePalaceLabel);
      if (!tripartite) {
        setSegments([]);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const rectOf = (name: string) => cardRefs.current?.get(name)?.getBoundingClientRect() ?? null;
      const centerOf = (r: DOMRect): Pt => ({
        x: r.left - containerRect.left + r.width / 2,
        y: r.top - containerRect.top + r.height / 2,
      });

      const fromRect = rectOf(activePalaceLabel);
      if (!fromRect) {
        setSegments([]);
        return;
      }
      const from = centerOf(fromRect);

      const names = [tripartite.opposite, ...tripartite.tri];
      const next = names.flatMap((name) => {
        const toRect = rectOf(name);
        if (!toRect) return [];
        const to = centerOf(toRect);
        const p1 = clipToRectEdge(from, to, fromRect, containerRect);
        const p2 = clipToRectEdge(to, from, toRect, containerRect);
        return [{ key: name, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }];
      });
      setSegments(next);
    };

    compute();
    // 宫位入场动画(约 1s)期间卡片带 transform,结束后重测一次保证线位准确
    const timer = window.setTimeout(compute, 1000);
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [activePalaceLabel, containerRef, cardRefs]);

  if (segments.length === 0) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="ziwei-star-track" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: 'var(--zw-violet)' }} stopOpacity="1" />
          <stop offset="100%" style={{ stopColor: 'var(--zw-gold)' }} stopOpacity="1" />
        </linearGradient>
        {/* 星芒/彗星辉光滤镜 */}
        <filter id="ziwei-comet-glow" x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {segments.map((s, i) => {
        const path = `M ${s.x1} ${s.y1} L ${s.x2} ${s.y2}`;
        // 三条轨各有节奏,避免机械同步
        const dur = [2.2, 2.8, 3.4][i % 3];
        return (
          <g key={s.key}>
            {/* 底层宽辉光 */}
            <line
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="url(#ziwei-star-track)" strokeWidth="6" strokeOpacity="0.13" strokeLinecap="round"
            />
            {/* 流光主线(虚线流动) */}
            <line
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke="url(#ziwei-star-track)" strokeWidth="1.6" strokeOpacity="0.9" strokeLinecap="round"
              strokeDasharray="3 7"
              style={{ animation: 'ziwei-dash-flow 1.4s linear infinite' }}
            />
            {/* 起点星芒(本宫,紫微紫) */}
            <circle cx={s.x1} cy={s.y1} r="3.2" style={{ fill: 'var(--zw-violet)' }} opacity="0.25" />
            <circle cx={s.x1} cy={s.y1} r="1.5" style={{ fill: 'var(--zw-violet-soft)' }} opacity="0.95" filter="url(#ziwei-comet-glow)" />
            {/* 终点星芒(联动宫,鎏金) */}
            <circle cx={s.x2} cy={s.y2} r="3.2" style={{ fill: 'var(--zw-gold)' }} opacity="0.3" />
            <circle cx={s.x2} cy={s.y2} r="1.6" style={{ fill: 'var(--zw-gold-soft)' }} opacity="0.95" filter="url(#ziwei-comet-glow)" />
            {/* 彗星粒子沿轨运行(主星 + 两级尾迹) */}
            <circle r="1.8" style={{ fill: 'var(--zw-comet)' }} filter="url(#ziwei-comet-glow)" className="ziwei-comet">
              <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
            </circle>
            <circle r="1.1" style={{ fill: 'var(--zw-comet)' }} opacity="0.5" className="ziwei-comet">
              <animateMotion dur={`${dur}s`} begin="-0.12s" repeatCount="indefinite" path={path} />
            </circle>
            <circle r="0.6" style={{ fill: 'var(--zw-comet)' }} opacity="0.3" className="ziwei-comet">
              <animateMotion dur={`${dur}s`} begin="-0.24s" repeatCount="indefinite" path={path} />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
//  子组件:宫位卡片
// ═══════════════════════════════════════════════════════════════

function PalaceCard({
  palace,
  index,
  chart,
  isActive,
  isRelated,
  isCurrentDecade,
  isYearPalace,
  onClick,
  registerRef,
}: {
  palace: ZiweiChartPalace;
  index: number;
  chart: ZiweiChartData;
  isActive: boolean;
  isRelated: boolean;
  isCurrentDecade: boolean;
  isYearPalace: boolean;
  onClick: () => void;
  registerRef: (name: string, el: HTMLButtonElement | null) => void;
}) {
  const isMobile = useIsMobile();
  const isMing = palace.name === '命宫';
  const isShen = palace.isBodyPalace;
  const group = PALACE_GROUP_MAP[palace.name] ?? 'spirit';
  const groupDot = GROUP_DOT_COLORS[group];

  // 主星处理
  const mainStars = palace.majorStars.filter(
    (s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma',
  );
  const hasMainStar = mainStars.length > 0;
  const dominantStar = mainStars[0];
  const starColorClass = dominantStar ? getStarColor(dominantStar.name) : 'zw-text-4';
  const pattern = identifyPattern(mainStars);

  // 空宫对宫
  const oppositePalace = getOppositePalace(palace.name, chart.palaces);
  const borrowedStars = oppositePalace?.majorStars.filter(
    (s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma',
  );

  // 四化徽章
  const sihuaBadges = getSihuaBadges(palace, chart);

  // 命宫:鎏金描边 + 金光渐变底(双主题语义类)
  const mingClass = isMing ? 'zw-palace-ming' : '';

  // 三方四正联动宫:鎏金高亮 + 呼吸光晕(见 style 中的 ziwei-related-glow)
  const relatedClass = isRelated && !isActive ? 'zw-palace-related' : '';

  // 选中宫:紫微紫 aura + 呼吸光晕(见 style 中的 ziwei-active-glow)
  const activeClass = isActive ? 'zw-palace-active' : '';

  // 入场动画与光晕呼吸叠加(延迟内联进简写,不与 animationDelay 混用;光晕延迟到入场完成后启动)
  const animList = [`ziwei-palace-enter 0.55s cubic-bezier(0.2,0.8,0.2,1) ${index * 40}ms both`];
  if (isActive) {
    animList.push('ziwei-active-glow 3s ease-in-out 1s infinite');
  } else if (isRelated) {
    animList.push('ziwei-related-glow 2.6s ease-in-out 1s infinite');
  }

  return (
    <button
      type="button"
      ref={(el) => registerRef(palace.name, el)}
      onClick={onClick}
      className={[
        !isMobile && GRID_AREAS[index],
        'min-h-[140px] sm:min-h-0 flex flex-col justify-between',
        CARD_BASE_CLASS,
        mingClass,
        relatedClass,
        activeClass,
      ].join(' ')}
      style={{ animation: animList.join(', ') }}
    >
      <span
        className={isRelated && !isActive ? 'zw-card-divider-gold' : 'zw-card-divider'}
        aria-hidden
      />
      {/* 顶部:天干 + 宫位名 + 标签 + 四化 + 来因 */}
      <div className="relative">
        {/* 第一行:天干 + 宫位名 + 各种徽章 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 天干(五行色) */}
          <span className={`text-xs font-bold ${getStemColor(palace.heavenlyStem)}`}>
            {palace.heavenlyStem}
          </span>
          <span className="zw-text-5 text-[10px]">·</span>

          {/* 宫位名:分组导向点 + 宋体 */}
          <span className="flex items-center gap-1 text-[13px]">
            <span
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ backgroundColor: groupDot, boxShadow: `0 0 5px ${groupDot}` }}
              aria-hidden
            />
            {isMing && <Crown className="zw-text-gold h-3.5 w-3.5" strokeWidth={2} />}
            <GlossaryTooltip term={palace.name} chartData={chart} side="right">
              <span
                className={`font-song font-bold ${
                  isMing || (isRelated && !isActive) ? 'zw-text-gold-soft' : 'zw-text-1b'
                }`}
              >
                {palace.name}
              </span>
            </GlossaryTooltip>
          </span>

          {/* 身宫标签 */}
          {isShen && (
            <span className="zw-text-gold rounded-md border border-[color:var(--zw-gold-a40)] bg-[color:var(--zw-gold-a10)] px-1 py-px font-song text-[10px] font-bold">
              <GlossaryTooltip term="身宫" chartData={chart}>身宫</GlossaryTooltip>
            </span>
          )}

          {/* 来因宫徽章 */}
          {palace.isOriginalPalace && (
            <span
              className="rounded border border-[color:var(--zw-acc-health-a30)] bg-[color:var(--zw-acc-health-a10)] px-1 py-px font-song text-[9px] font-bold"
              style={{ color: 'var(--zw-acc-health)' }}
            >
              来因
            </span>
          )}

          {/* 四化徽章 */}
          {sihuaBadges.length > 0 && (
            <div className="ml-auto flex items-center gap-0.5">
              {sihuaBadges.map((b) => (
                <SihuaBadgeDot key={b} type={b} />
              ))}
            </div>
          )}
        </div>

        {/* 主星大字(宋体) */}
        <div className={`mt-1 break-words font-song text-lg font-bold leading-tight tracking-tight sm:text-xl ${starColorClass}`}>
          {hasMainStar ? (
            <GlossaryTooltip term={dominantStar!.name} chartData={chart} side="right">
              <span className="cursor-help border-b border-dotted border-[color:var(--zw-gold-a30)]">
                {dominantStar!.name}
              </span>
            </GlossaryTooltip>
          ) : (
            <span className="zw-text-4 text-base font-medium italic">
              {oppositePalace ? `借${oppositePalace.name}` : '空宫'}
            </span>
          )}
        </div>

        {/* 亮度标注 */}
        {dominantStar?.brightness && (
          <span className={`ml-1 text-[10px] font-bold ${getBrightnessColor(dominantStar.brightness)}`}>
            [{dominantStar.brightness}]
          </span>
        )}

        {/* 格局徽章 */}
        {pattern && (
          <div className="mt-1">
            <span className="zw-text-violet-soft inline-block rounded border border-[color:var(--zw-violet-a30)] bg-[color:var(--zw-violet-deep-a15)] px-1 py-px font-song text-[9px] font-bold">
              {pattern}
            </span>
          </div>
        )}

        {/* 其他主星 */}
        {mainStars.length > 1 && (
          <div className="zw-text-2b mt-0.5 break-words text-[10px] leading-snug line-clamp-1">
            {mainStars.slice(1, 3).map((s) => (
              <span key={s.name} className="mr-1.5">
                <GlossaryTooltip term={s.name} chartData={chart} side="right">
                  <span className="cursor-help border-b border-dotted border-[color:var(--zw-border-15)]">{s.name}</span>
                </GlossaryTooltip>
                {s.brightness && (
                  <span className={`text-[8px] ${getBrightnessColor(s.brightness)}`}>[{s.brightness}]</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* 空宫借星详情 */}
        {!hasMainStar && borrowedStars && borrowedStars.length > 0 && (
          <div className="zw-text-3 mt-0.5 text-[10px]">
            <span className="zw-text-4">→ </span>
            {borrowedStars.slice(0, 1).map((s) => (
              <span key={s.name}>
                <span className={`opacity-70 ${getStarColor(s.name)}`}>{s.name}</span>
                {s.brightness && (
                  <span className={`text-[8px] opacity-70 ${getBrightnessColor(s.brightness)}`}>
                    [{s.brightness}]
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* 辅星/煞星 */}
        {palace.minorStars.length > 0 && (
          <div className="zw-text-3 mt-0.5 break-words text-[9px] leading-snug line-clamp-1">
            {palace.minorStars.slice(0, 2).map((s) => s.name).join(' · ')}
          </div>
        )}
      </div>

      {/* 底部:地支 + 大限年龄 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="zw-text-2b font-song text-xs font-medium">
          {palace.earthlyBranch}
        </span>
        <span
          className={[
            'rounded-md px-1.5 py-px text-[10px] transition-colors',
            isCurrentDecade ? 'zw-decade-active' : 'zw-text-4',
          ].join(' ')}
        >
          {palace.stageRange[0]}-{palace.stageRange[1]}岁
          {isCurrentDecade && <span className="ml-1">· 当前大限</span>}
          {isYearPalace && (
            <span className="zw-text-violet-soft ml-1 font-bold">· 流年</span>
          )}
        </span>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
//  子组件:中央星盘仪面板
// ═══════════════════════════════════════════════════════════════

function CenterPanel({
  chart,
  activePalace,
  allPalaces,
}: {
  chart: ZiweiChartData;
  activePalace: ZiweiChartPalace | null;
  allPalaces: ZiweiChartPalace[];
}) {
  const shellClass = [
    'order-first col-span-2 sm:order-none sm:col-start-2 sm:col-span-2 sm:row-start-2 sm:row-span-2',
    'zw-center-shell p-4',
  ].join(' ');

  const enterStyle = {
    animation: 'ziwei-palace-enter 0.6s cubic-bezier(0.2,0.8,0.2,1) 480ms both',
  } as const;

  /** 星盘仪背景(超出面板尺寸,靠 overflow-hidden 裁切出仪盘感) */
  const ringLayer = (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      <div className="aspect-square h-[135%] opacity-70">
        <AstrolabeRing activeBranch={activePalace?.earthlyBranch} />
      </div>
    </div>
  );

  /** 中央呼吸光晕 */
  const glowLayer = (
    <span
      className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
      style={{
        background:
          'radial-gradient(circle, var(--zw-violet-a15) 0%, var(--zw-gold-a06) 55%, transparent 75%)',
        animation: 'ziwei-breathe 10s ease-in-out infinite',
      }}
      aria-hidden
    />
  );

  // 默认状态:全局命盘信息
  if (!activePalace || activePalace.name === '命宫') {
    const totalMajorStars = allPalaces.reduce((sum, palace) => {
      return (
        sum +
        palace.majorStars.filter((s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma').length
      );
    }, 0);

    return (
      <div className={shellClass} style={enterStyle}>
        {ringLayer}
        {glowLayer}
        <div className="relative z-10 flex h-full flex-col justify-between text-center">
          <div>
            <div
              className="zw-gold-heading font-song text-[2rem] font-bold leading-tight sm:text-[36px] sm:leading-none"
              style={{ filter: 'drop-shadow(0 2px 10px var(--zw-gold-a35))' }}
            >
              <GlossaryTooltip term="命宫" chartData={chart}>紫微命盘</GlossaryTooltip>
            </div>
            <div className="zw-text-2b mt-2 font-song text-xs">
              {chart.yearStem}{chart.yearBranch}年 · {chart.fiveElementsClass}
            </div>
            <div className="zw-text-3 mt-1 text-[11px]">
              {getStartingAge(chart.fiveElementsClass)}
            </div>
          </div>

          <div className="my-4 grid w-full grid-cols-2 gap-3">
            <div className="zw-stat-violet rounded-2xl px-3 py-2 sm:px-4">
              <div className="zw-text-violet-soft font-song text-[11px] font-semibold">
                <GlossaryTooltip term="命主" chartData={chart}>命主</GlossaryTooltip>
              </div>
              <div className="zw-text-violet-bright mt-1 font-song text-lg font-bold sm:mt-0.5 sm:text-xl">
                <GlossaryTooltip term={chart.soul} chartData={chart}>{chart.soul}</GlossaryTooltip>
              </div>
            </div>
            <div className="zw-stat-gold rounded-2xl px-3 py-2 sm:px-4">
              <div className="zw-text-gold font-song text-[11px] font-semibold">
                <GlossaryTooltip term="身主" chartData={chart}>身主</GlossaryTooltip>
              </div>
              <div className="zw-text-gold-soft mt-1 font-song text-lg font-bold sm:mt-0.5 sm:text-xl">
                <GlossaryTooltip term={chart.body} chartData={chart}>{chart.body}</GlossaryTooltip>
              </div>
            </div>
          </div>

          {/* 底部信息条 */}
          <div className="zw-stat-bar grid grid-cols-3 gap-2 rounded-2xl p-2.5 text-left">
            <div>
              <div className="zw-text-3 text-[10px] font-semibold">命宫</div>
              <div className="zw-text-1b font-song text-xs font-bold">{chart.soulPalaceBranch}</div>
            </div>
            <div>
              <div className="zw-text-3 text-[10px] font-semibold">身宫</div>
              <div className="zw-text-1b font-song text-xs font-bold">{chart.bodyPalaceBranch}</div>
            </div>
            <div>
              <div className="zw-text-3 text-[10px] font-semibold">主星数</div>
              <div className="zw-text-1b font-song text-xs font-bold">{totalMajorStars} 颗</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 选中状态:宫位详情概览
  const mainStars = activePalace.majorStars.filter(
    (s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma',
  );
  const sihuaBadges = getSihuaBadges(activePalace, chart);
  const tripartite = getTripartite(activePalace.name);

  return (
    <div className={shellClass} style={enterStyle}>
      {ringLayer}
      {glowLayer}
      <div className="relative z-10 flex h-full flex-col justify-between text-center">
        <div>
          {/* 宫位名称 */}
          <div
            className="zw-gold-heading font-song text-[1.75rem] font-bold leading-tight sm:text-[32px] sm:leading-none"
            style={{ filter: 'drop-shadow(0 2px 10px var(--zw-gold-a30))' }}
          >
            {activePalace.name}
          </div>
          <div className="zw-text-3 mt-1.5 text-xs">
            {PALACE_MEANING[activePalace.name] ?? ''}
          </div>
        </div>

        {/* 主星展示 */}
        {mainStars.length > 0 ? (
          <div className="my-3 flex flex-wrap items-center justify-center gap-2">
            {mainStars.slice(0, 3).map((s) => (
              <div key={s.name} className="flex items-center gap-1">
                <span className={`font-song text-sm font-bold ${getStarColor(s.name)}`}>{s.name}</span>
                {s.brightness && (
                  <span className={`text-[10px] font-bold ${getBrightnessColor(s.brightness)}`}>
                    [{s.brightness}]
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="zw-text-4 my-3 text-sm italic">空宫(借对宫星曜)</div>
        )}

        <div className="zw-stat-bar space-y-2 rounded-2xl p-2.5 text-left">
          {/* 大限信息 */}
          <div className="zw-text-2b text-[11px]">
            大限:{activePalace.stageRange[0]}-{activePalace.stageRange[1]}岁
          </div>

          {/* 四化指示 */}
          {sihuaBadges.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="zw-text-3 text-[10px]">四化:</span>
              {sihuaBadges.map((b) => (
                <SihuaBadgeDot key={b} type={b} />
              ))}
            </div>
          )}

          {/* 三方四正 */}
          {tripartite && (
            <div className="zw-text-3 text-[10px]">
              三方四正:
              <span className="zw-text-2b font-song">
                {tripartite.tri[0]} · {tripartite.tri[1]} · {tripartite.opposite}
              </span>
            </div>
          )}

          {/* 天干地支 */}
          <div className="zw-text-3 font-song text-[10px]">
            {activePalace.heavenlyStem}{activePalace.earthlyBranch}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  主组件
// ═══════════════════════════════════════════════════════════════

type Props = {
  chart: ZiweiChartData;
  activePalaceLabel: string;
  onPalaceSelect: (label: string) => void;
  birthYear?: number;
};

export function ZiweiPalaceGrid({ chart, activePalaceLabel, onPalaceSelect, birthYear }: Props) {
  const isMobile = useIsMobile();
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  const orderedPalaces = useMemo(() => {
    const map = new Map(chart.palaces.map((p) => [p.name, p]));
    return PALACE_ORDER.map((name) => map.get(name)).filter(Boolean) as ZiweiChartPalace[];
  }, [chart.palaces]);

  const activePalace = useMemo(() => {
    return orderedPalaces.find((p) => p.name === activePalaceLabel) ?? null;
  }, [orderedPalaces, activePalaceLabel]);

  const registerRef = (name: string, el: HTMLButtonElement | null) => {
    if (el) cardRefs.current.set(name, el);
    else cardRefs.current.delete(name);
  };

  return (
    <div className={GRID_SHELL_CLASS}>
      {/* 盘面星幕(无星云,保持盘面纯净;白昼主题下由 ziwei-theme.css 隐藏) */}
      <NightSky density="panel" nebula={false} className="ziwei-night-sky" />
      {/* 顶部鎏金切线 */}
      <span className="zw-gold-divider" aria-hidden />
      <div
        ref={gridRef}
        className="relative grid grid-cols-2 auto-rows-[minmax(150px,auto)] gap-3 sm:grid-cols-4 sm:grid-rows-4 sm:auto-rows-auto"
      >
        {/* 三方四正星轨连线(仅桌面端 4×4 阵型下渲染) */}
        {!isMobile && (
          <ConstellationLayer
            containerRef={gridRef}
            cardRefs={cardRefs}
            activePalaceLabel={activePalaceLabel}
          />
        )}

        {orderedPalaces.map((palace, index) => {
          const isActive = palace.name === activePalaceLabel;
          const isRelated = isRelatedTo(palace.name, activePalaceLabel);
          const currentDecade = isCurrentDecade(palace, birthYear);
          const yearPalace = isCurrentYearPalace(palace);

          return (
            <PalaceCard
              key={palace.name}
              palace={palace}
              index={index}
              chart={chart}
              isActive={isActive}
              isRelated={isRelated}
              isCurrentDecade={currentDecade}
              isYearPalace={yearPalace}
              onClick={() => onPalaceSelect(palace.name)}
              registerRef={registerRef}
            />
          );
        })}

        {/* 中央星盘仪面板 */}
        <CenterPanel chart={chart} activePalace={activePalace} allPalaces={orderedPalaces} />
      </div>
    </div>
  );
}
