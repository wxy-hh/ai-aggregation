'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Crown } from 'lucide-react';
import type { ZiweiChartData, ZiweiChartPalace } from '@/app/destiny/_components/types';
import { GlossaryTooltip } from './ziwei-glossary';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { NightSky } from './ziwei-night-sky';

// ═══════════════════════════════════════════════════════════════
//  紫微斗数命盘网格 —「夜幕星宫」
//  深空盘面 · 鎏金宋体星曜 · 中央星盘仪 · 三方四正星轨连线
// ═══════════════════════════════════════════════════════════════

// ─── 夜幕视觉 token ───

/** 盘面外壳:深空墨蓝 + 鎏金细边 */
const GRID_SHELL_CLASS = [
  'relative overflow-hidden rounded-[32px] border border-[#E7C873]/15',
  'bg-[#0A0F24]/90',
  'shadow-[0_24px_48px_-16px_rgba(3,6,18,0.85),0_0_40px_rgba(139,92,246,0.08)]',
  // 关键:给网格留出内边距,避免宫位卡片与外层边框视觉重叠
  'p-4 sm:p-5',
].join(' ');

/** 宫位卡基底:暗夜磨砂(不开 blur,保滚动性能) */
const CARD_BASE_CLASS = [
  'group relative z-10 overflow-hidden',
  'rounded-[20px] border border-white/10 bg-[#121830]/80',
  'p-3.5 sm:p-4',
  'text-left',
  'transition-all duration-200',
  'hover:-translate-y-0.5 hover:border-white/25',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]/70',
].join(' ');

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

/** 分组导向点颜色(小而克制,只用于宫位名前 5px 光点) */
const GROUP_DOT_COLORS: Record<string, string> = {
  self: '#E7C873',
  family: '#FDA4AF',
  career: '#7DD3FC',
  spirit: '#6EE7B7',
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

// ─── 天干五行色(夜色 400 级) ───
const STEM_COLORS: Record<string, string> = {
  '甲': 'text-emerald-400', '乙': 'text-emerald-400',
  '丙': 'text-rose-400',    '丁': 'text-rose-400',
  '戊': 'text-amber-400',   '己': 'text-amber-400',
  '庚': 'text-slate-400',   '辛': 'text-slate-400',
  '壬': 'text-sky-400',     '癸': 'text-sky-400',
};

// ─── 十四主星颜色(夜幕高亮色阶) ───
const STAR_COLORS: Array<{ names: string[]; className: string }> = [
  { names: ['紫微'], className: 'text-[#C4B5FD]' },
  { names: ['天府'], className: 'text-[#6EE7B7]' },
  { names: ['武曲'], className: 'text-[#93C5FD]' },
  { names: ['太阳'], className: 'text-[#FCD34D]' },
  { names: ['太阴'], className: 'text-[#A5B4FC]' },
  { names: ['天机'], className: 'text-[#5EEAD4]' },
  { names: ['天同'], className: 'text-[#86EFAC]' },
  { names: ['廉贞'], className: 'text-[#FDA4AF]' },
  { names: ['贪狼'], className: 'text-[#FDBA74]' },
  { names: ['巨门'], className: 'text-[#CBD5E1]' },
  { names: ['天相'], className: 'text-[#7DD3FC]' },
  { names: ['天梁'], className: 'text-[#BEF264]' },
  { names: ['七杀'], className: 'text-[#FCA5A5]' },
  { names: ['破军'], className: 'text-[#F0ABFC]' },
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
  return 'text-[#E8E4F0]';
}

/** 庙旺落陷 8 级颜色(夜色版) */
function getBrightnessColor(brightness: string): string {
  switch (brightness) {
    case '庙':  return 'text-[#34D399]';
    case '旺':  return 'text-[#6EE7B7]';
    case '得':  return 'text-[#7DD3FC]';
    case '利':  return 'text-[#A5B4FC]';
    case '平':  return 'text-[#94A3B8]';
    case '闲':  return 'text-[#FBBF24]';
    case '陷':  return 'text-[#FB7185]';
    case '不':  return 'text-[#F87171]';
    default:    return 'text-[#8B87A0]';
  }
}

/** 获取天干五行色 */
function getStemColor(stem: string): string {
  return STEM_COLORS[stem] ?? 'text-slate-400';
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
    '禄': 'text-[#6EE7B7] border-[#34D399]/40 bg-[#34D399]/10',
    '权': 'text-[#E7C873] border-[#E7C873]/40 bg-[#E7C873]/10',
    '科': 'text-[#7DD3FC] border-[#38BDF8]/40 bg-[#38BDF8]/10',
    '忌': 'text-[#FDA4AF] border-[#FB7185]/40 bg-[#FB7185]/10',
  };
  return (
    <span
      className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded border px-1 font-song text-[9px] font-bold ${styles[type] ?? 'border-white/15 bg-white/5 text-[#B9B3CC]'}`}
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
      {/* 外环:十二地支(静止,保可读性;当前宫位地支鎏金点亮) */}
      <circle cx="50" cy="50" r="47" fill="none" stroke="#E7C873" strokeOpacity="0.22" strokeWidth="0.3" />
      <circle cx="50" cy="50" r="41.5" fill="none" stroke="#E7C873" strokeOpacity="0.12" strokeWidth="0.2" />
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
            fill={active ? '#F3DFA9' : '#E7C873'}
            fillOpacity={active ? 1 : 0.45}
            style={active ? { filter: 'drop-shadow(0 0 2.5px rgba(231,200,115,0.9))' } : undefined}
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
              stroke="#A78BFA"
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
          stroke="#A78BFA" strokeOpacity="0.25" strokeWidth="0.25" strokeDasharray="0.8 2.4"
        />
        {[0, 90, 180, 270].map((deg) => {
          const angle = ((deg - 90) * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={50 + 30 * Math.cos(angle)}
              cy={50 + 30 * Math.sin(angle)}
              r="0.7"
              fill="#E7C873"
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
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="1" />
          <stop offset="100%" stopColor="#E7C873" stopOpacity="1" />
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
            <circle cx={s.x1} cy={s.y1} r="3.2" fill="#A78BFA" opacity="0.25" />
            <circle cx={s.x1} cy={s.y1} r="1.5" fill="#C4B5FD" opacity="0.95" filter="url(#ziwei-comet-glow)" />
            {/* 终点星芒(联动宫,鎏金) */}
            <circle cx={s.x2} cy={s.y2} r="3.2" fill="#E7C873" opacity="0.3" />
            <circle cx={s.x2} cy={s.y2} r="1.6" fill="#F3DFA9" opacity="0.95" filter="url(#ziwei-comet-glow)" />
            {/* 彗星粒子沿轨运行(主星 + 两级尾迹) */}
            <circle r="1.8" fill="#F6E3B4" filter="url(#ziwei-comet-glow)" className="ziwei-comet">
              <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
            </circle>
            <circle r="1.1" fill="#F6E3B4" opacity="0.5" className="ziwei-comet">
              <animateMotion dur={`${dur}s`} begin="-0.12s" repeatCount="indefinite" path={path} />
            </circle>
            <circle r="0.6" fill="#F6E3B4" opacity="0.3" className="ziwei-comet">
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
  const starColorClass = dominantStar ? getStarColor(dominantStar.name) : 'text-[#6E6A86]';
  const pattern = identifyPattern(mainStars);

  // 空宫对宫
  const oppositePalace = getOppositePalace(palace.name, chart.palaces);
  const borrowedStars = oppositePalace?.majorStars.filter(
    (s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma',
  );

  // 四化徽章
  const sihuaBadges = getSihuaBadges(palace, chart);

  // 命宫:鎏金描边 + 金光渐变底
  const mingClass = isMing
    ? 'border-[#E7C873]/45 bg-[linear-gradient(160deg,rgba(231,200,115,0.10),rgba(18,24,48,0.85)_45%)]'
    : '';

  // 三方四正联动宫:鎏金高亮 + 呼吸光晕(见 style 中的 ziwei-related-glow)
  const relatedClass = isRelated && !isActive
    ? 'border-[#E7C873]/50 bg-[#E7C873]/[0.09]'
    : '';

  // 选中宫:紫微紫 aura + 呼吸光晕(见 style 中的 ziwei-active-glow)
  const activeClass = isActive
    ? 'border-[#A78BFA]/50 bg-[#A78BFA]/[0.10] ring-2 ring-[#A78BFA]/40'
    : '';

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
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent ${
          isRelated && !isActive ? 'via-[#E7C873]/50' : 'via-white/15'
        }`}
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
          <span className="text-[10px] text-[#4A4763]">·</span>

          {/* 宫位名:分组导向点 + 宋体 */}
          <span className="flex items-center gap-1 text-[13px]">
            <span
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ backgroundColor: groupDot, boxShadow: `0 0 5px ${groupDot}` }}
              aria-hidden
            />
            {isMing && <Crown className="h-3.5 w-3.5 text-[#E7C873]" strokeWidth={2} />}
            <GlossaryTooltip term={palace.name} chartData={chart} side="right">
              <span
                className={`font-song font-bold ${
                  isMing || (isRelated && !isActive) ? 'text-[#F3DFA9]' : 'text-[#E8E4F0]'
                }`}
              >
                {palace.name}
              </span>
            </GlossaryTooltip>
          </span>

          {/* 身宫标签 */}
          {isShen && (
            <span className="rounded-md border border-[#E7C873]/40 bg-[#E7C873]/10 px-1 py-px font-song text-[10px] font-bold text-[#E7C873]">
              <GlossaryTooltip term="身宫" chartData={chart}>身宫</GlossaryTooltip>
            </span>
          )}

          {/* 来因宫徽章 */}
          {palace.isOriginalPalace && (
            <span className="rounded border border-[#2DD4BF]/30 bg-[#2DD4BF]/10 px-1 py-px font-song text-[9px] font-bold text-[#5EEAD4]">
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
              <span className="cursor-help border-b border-dotted border-[#E7C873]/30">
                {dominantStar!.name}
              </span>
            </GlossaryTooltip>
          ) : (
            <span className="text-base font-medium italic text-[#6E6A86]">
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
            <span className="inline-block rounded border border-[#8B5CF6]/30 bg-[#8B5CF6]/15 px-1 py-px font-song text-[9px] font-bold text-[#C4B5FD]">
              {pattern}
            </span>
          </div>
        )}

        {/* 其他主星 */}
        {mainStars.length > 1 && (
          <div className="mt-0.5 break-words text-[10px] leading-snug text-[#B9B3CC] line-clamp-1">
            {mainStars.slice(1, 3).map((s) => (
              <span key={s.name} className="mr-1.5">
                <GlossaryTooltip term={s.name} chartData={chart} side="right">
                  <span className="cursor-help border-b border-dotted border-white/15">{s.name}</span>
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
          <div className="mt-0.5 text-[10px] text-[#8B87A0]">
            <span className="text-[#6E6A86]">→ </span>
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
          <div className="mt-0.5 break-words text-[9px] leading-snug text-[#8B87A0] line-clamp-1">
            {palace.minorStars.slice(0, 2).map((s) => s.name).join(' · ')}
          </div>
        )}
      </div>

      {/* 底部:地支 + 大限年龄 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-song text-xs font-medium text-[#B9B3CC]">
          {palace.earthlyBranch}
        </span>
        <span
          className={[
            'rounded-md px-1.5 py-px text-[10px] transition-colors',
            isCurrentDecade
              ? 'bg-[#E7C873]/15 font-bold text-[#E7C873]'
              : 'text-[#6E6A86]',
          ].join(' ')}
        >
          {palace.stageRange[0]}-{palace.stageRange[1]}岁
          {isCurrentDecade && <span className="ml-1">· 当前大限</span>}
          {isYearPalace && (
            <span className="ml-1 font-bold text-[#C4B5FD]">· 流年</span>
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
    'relative z-10 overflow-hidden rounded-[28px] border border-[#E7C873]/20',
    'bg-[#0D1330]/85 p-4 text-center',
    'shadow-[0_0_44px_rgba(139,92,246,0.14),inset_0_1px_0_rgba(231,200,115,0.14)]',
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
          'radial-gradient(circle, rgba(167,139,250,0.16) 0%, rgba(231,200,115,0.06) 55%, transparent 75%)',
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
            <div className="bg-gradient-to-r from-[#F3DFA9] via-[#E7C873] to-[#C9A35C] bg-clip-text font-song text-[2rem] font-bold leading-tight text-transparent drop-shadow-[0_2px_10px_rgba(231,200,115,0.35)] sm:text-[36px] sm:leading-none">
              <GlossaryTooltip term="命宫" chartData={chart}>紫微命盘</GlossaryTooltip>
            </div>
            <div className="mt-2 font-song text-xs text-[#B9B3CC]">
              {chart.yearStem}{chart.yearBranch}年 · {chart.fiveElementsClass}
            </div>
            <div className="mt-1 text-[11px] text-[#8B87A0]">
              {getStartingAge(chart.fiveElementsClass)}
            </div>
          </div>

          <div className="my-4 grid w-full grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#A78BFA]/25 bg-[#A78BFA]/[0.07] px-3 py-2 sm:px-4">
              <div className="font-song text-[11px] font-semibold text-[#C4B5FD]">
                <GlossaryTooltip term="命主" chartData={chart}>命主</GlossaryTooltip>
              </div>
              <div className="mt-1 font-song text-lg font-bold text-[#EDE9FE] sm:mt-0.5 sm:text-xl">
                <GlossaryTooltip term={chart.soul} chartData={chart}>{chart.soul}</GlossaryTooltip>
              </div>
            </div>
            <div className="rounded-2xl border border-[#E7C873]/25 bg-[#E7C873]/[0.07] px-3 py-2 sm:px-4">
              <div className="font-song text-[11px] font-semibold text-[#E7C873]">
                <GlossaryTooltip term="身主" chartData={chart}>身主</GlossaryTooltip>
              </div>
              <div className="mt-1 font-song text-lg font-bold text-[#F3DFA9] sm:mt-0.5 sm:text-xl">
                <GlossaryTooltip term={chart.body} chartData={chart}>{chart.body}</GlossaryTooltip>
              </div>
            </div>
          </div>

          {/* 底部信息条 */}
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-left">
            <div>
              <div className="text-[10px] font-semibold text-[#8B87A0]">命宫</div>
              <div className="font-song text-xs font-bold text-[#E8E4F0]">{chart.soulPalaceBranch}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#8B87A0]">身宫</div>
              <div className="font-song text-xs font-bold text-[#E8E4F0]">{chart.bodyPalaceBranch}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#8B87A0]">主星数</div>
              <div className="font-song text-xs font-bold text-[#E8E4F0]">{totalMajorStars} 颗</div>
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
          <div className="bg-gradient-to-r from-[#F3DFA9] via-[#E7C873] to-[#C9A35C] bg-clip-text font-song text-[1.75rem] font-bold leading-tight text-transparent drop-shadow-[0_2px_10px_rgba(231,200,115,0.3)] sm:text-[32px] sm:leading-none">
            {activePalace.name}
          </div>
          <div className="mt-1.5 text-xs text-[#8B87A0]">
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
          <div className="my-3 text-sm italic text-[#6E6A86]">空宫(借对宫星曜)</div>
        )}

        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-left">
          {/* 大限信息 */}
          <div className="text-[11px] text-[#B9B3CC]">
            大限:{activePalace.stageRange[0]}-{activePalace.stageRange[1]}岁
          </div>

          {/* 四化指示 */}
          {sihuaBadges.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[#8B87A0]">四化:</span>
              {sihuaBadges.map((b) => (
                <SihuaBadgeDot key={b} type={b} />
              ))}
            </div>
          )}

          {/* 三方四正 */}
          {tripartite && (
            <div className="text-[10px] text-[#8B87A0]">
              三方四正:
              <span className="font-song text-[#B9B3CC]">
                {tripartite.tri[0]} · {tripartite.tri[1]} · {tripartite.opposite}
              </span>
            </div>
          )}

          {/* 天干地支 */}
          <div className="font-song text-[10px] text-[#8B87A0]">
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
      {/* 盘面星幕(无星云,保持盘面纯净) */}
      <NightSky density="panel" nebula={false} />
      {/* 顶部鎏金切线 */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E7C873]/50 to-transparent"
        aria-hidden
      />
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
