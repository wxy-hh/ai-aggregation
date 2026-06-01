'use client';

import { useMemo } from 'react';
import { Crown } from 'lucide-react';
import type { ZiweiChartData, ZiweiChartPalace } from '@/app/destiny/_components/types';
import { GlossaryTooltip } from './ziwei-glossary';
import { useIsMobile } from '@/hooks/use-is-mobile';

// ═══════════════════════════════════════════════════════════════
//  紫微斗数命盘网格 — 宫位卡片、中央面板、三方四正、四化等
// ═══════════════════════════════════════════════════════════════

// ─── DESIGN.md 视觉 token（局部复用：Card / G-3 / Z-4） ───
const GRID_SHELL_CLASS = [
  'relative overflow-hidden rounded-[32px] border border-white/60',
  'bg-gradient-to-b from-white/60 via-white/25 to-white/10 bg-white/90',
  'shadow-[0_20px_40px_-15px_rgba(59,130,246,0.12),0_8px_20px_-10px_rgba(0,0,0,0.05)]',
  'backdrop-blur-xl lg:backdrop-blur-2xl',
  // 关键：给网格留出内边距，避免宫位卡片与外层边框视觉重叠
  'p-4 sm:p-5',
  'dark:border-white/10 dark:from-slate-900/60 dark:via-slate-900/30 dark:to-slate-900/10 dark:bg-slate-900/80',
].join(' ');

const CARD_BASE_CLASS = [
  'group relative overflow-hidden',
  'rounded-[24px] border',
  'p-3.5 sm:p-4',
  'text-left',
  'transition-all duration-200',
  'hover:translate-y-[-1px] hover:scale-[1.01]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
].join(' ');

const CARD_SHADOW_Z2 = 'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)]';
const CARD_HOVER_SHADOW_Z3 = 'hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)]';

// ─── 十二宫排布顺序 ───
const PALACE_ORDER = [
  '父母', '福德', '田宅', '官禄',
  '命宫', '兄弟', '仆役', '夫妻',
  '迁移', '子女', '财帛', '疾厄',
];

// 桌面端 CSS Grid 定位（4×4，中间留 2×2 给中央面板）
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

// ─── 宫位功能分组（用于色调与视觉亲缘） ───
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

const GROUP_STYLES: Record<string, {
  border: string;
  bg: string;
  label: string;
  accentClass: string;
}> = {
  self:   { border: 'border-amber-200/50 dark:border-amber-800/30',  bg: 'bg-amber-50/40 dark:bg-amber-950/20',  label: 'text-amber-700 dark:text-amber-300',  accentClass: 'text-amber-500' },
  family: { border: 'border-rose-200/40 dark:border-rose-800/30',   bg: 'bg-rose-50/30 dark:bg-rose-950/20',   label: 'text-rose-700 dark:text-rose-300',   accentClass: 'text-rose-500' },
  career: { border: 'border-blue-200/50 dark:border-blue-800/30',   bg: 'bg-blue-50/40 dark:bg-blue-950/20',   label: 'text-blue-700 dark:text-blue-300',   accentClass: 'text-blue-500' },
  spirit: { border: 'border-emerald-200/40 dark:border-emerald-800/30', bg: 'bg-emerald-50/30 dark:bg-emerald-950/20', label: 'text-emerald-700 dark:text-emerald-300', accentClass: 'text-emerald-500' },
};

// ─── 三方四正关系表 ───
const TRIPARTITE_MAP: Record<string, { opposite: string; tri: [string, string] }> = {
  '命宫': { opposite: '迁移', tri: ['财帛', '官禄'] },
  '兄弟': { opposite: '仆役', tri: ['疾厄', '田宅'] },
  '夫妻': { opposite: '官禄', tri: ['福德', '迁移'] },
  '子女': { opposite: '田宅', tri: ['交友', '父母'] }, // 仆役又称交友
  '财帛': { opposite: '福德', tri: ['命宫', '官禄'] },
  '疾厄': { opposite: '父母', tri: ['兄弟', '田宅'] },
  '迁移': { opposite: '命宫', tri: ['夫妻', '福德'] },
  '仆役': { opposite: '兄弟', tri: ['子女', '父母'] },
  '官禄': { opposite: '夫妻', tri: ['命宫', '财帛'] },
  '田宅': { opposite: '子女', tri: ['兄弟', '疾厄'] },
  '福德': { opposite: '财帛', tri: ['夫妻', '迁移'] },
  '父母': { opposite: '疾厄', tri: ['仆役', '子女'] },
};

// ─── 天干五行色 ───
const STEM_COLORS: Record<string, string> = {
  '甲': 'text-emerald-600', '乙': 'text-emerald-600',
  '丙': 'text-rose-500',    '丁': 'text-rose-500',
  '戊': 'text-amber-600',   '己': 'text-amber-600',
  '庚': 'text-slate-500',   '辛': 'text-slate-500',
  '壬': 'text-blue-600',    '癸': 'text-blue-600',
};

// ─── 十四主星颜色（保持与之前一致） ───
const STAR_COLORS: Array<{ names: string[]; className: string }> = [
  { names: ['紫微'], className: 'text-violet-600 dark:text-violet-400' },
  { names: ['天府'], className: 'text-emerald-700 dark:text-emerald-400' },
  { names: ['武曲'], className: 'text-blue-700 dark:text-blue-400' },
  { names: ['太阳'], className: 'text-amber-600 dark:text-amber-400' },
  { names: ['太阴'], className: 'text-indigo-600 dark:text-indigo-400' },
  { names: ['天机'], className: 'text-teal-700 dark:text-teal-400' },
  { names: ['天同'], className: 'text-emerald-700 dark:text-emerald-400' },
  { names: ['廉贞'], className: 'text-rose-600 dark:text-rose-400' },
  { names: ['贪狼'], className: 'text-amber-700 dark:text-amber-400' },
  { names: ['巨门'], className: 'text-slate-700 dark:text-slate-300' },
  { names: ['天相'], className: 'text-sky-700 dark:text-sky-400' },
  { names: ['天梁'], className: 'text-lime-700 dark:text-lime-400' },
  { names: ['七杀'], className: 'text-red-600 dark:text-red-400' },
  { names: ['破军'], className: 'text-fuchsia-600 dark:text-fuchsia-400' },
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

// ═══════════════════════════════════════════════════════════════
//  辅助函数
// ═══════════════════════════════════════════════════════════════

/** 获取主星颜色 */
function getStarColor(name: string): string {
  for (const item of STAR_COLORS) {
    if (item.names.some((n) => name.includes(n))) return item.className;
  }
  return 'text-slate-600 dark:text-slate-300';
}

/** 庙旺落陷 8 级完整颜色（与星曜百科 100% 统一） */
function getBrightnessColor(brightness: string): string {
  switch (brightness) {
    case '庙':  return 'text-emerald-500';
    case '旺':  return 'text-emerald-600';
    case '得':  return 'text-blue-500';
    case '利':  return 'text-indigo-500';
    case '平':  return 'text-slate-500';
    case '闲':  return 'text-amber-500';
    case '陷':  return 'text-red-500';
    case '不':  return 'text-red-600';
    default:    return 'text-slate-400';
  }
}

/** 获取宫位分组 */
function getGroup(name: string): string {
  return PALACE_GROUP_MAP[name] ?? 'spirit';
}

/** 获取分组样式 */
function getGroupStyle(name: string) {
  return GROUP_STYLES[getGroup(name)] ?? GROUP_STYLES.spirit;
}

/** 获取天干五行色 */
function getStemColor(stem: string): string {
  return STEM_COLORS[stem] ?? 'text-slate-500';
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

/** 获取对宫（用于空宫借星） */
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

/** 计算四化徽章数据（简化：主星名称匹配四化星名） */
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

/** 查找四化落入的宫位名 */
function findSihuaPalace(sihuaStar: string, palaces: ZiweiChartPalace[]): string | null {
  for (const p of palaces) {
    if (p.majorStars.some((s) => s.name === sihuaStar)) return p.name;
    if (p.minorStars.some((s) => s.name === sihuaStar)) return p.name;
  }
  return null;
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

/** 判断是否为当前流年宫（简化：按地支与流年太岁匹配） */
function isCurrentYearPalace(palace: ZiweiChartPalace): boolean {
  // 简化规则：当前年份的地支与宫位地支相同则为流年宫
  const currentYear = new Date().getFullYear();
  const zodiacMap: Record<number, string> = {
    0: '子', 1: '丑', 2: '寅', 3: '卯', 4: '辰', 5: '巳',
    6: '午', 7: '未', 8: '申', 9: '酉', 10: '戌', 11: '亥',
  };
  const yearBranch = zodiacMap[currentYear % 12];
  return palace.earthlyBranch === yearBranch;
}

// ═══════════════════════════════════════════════════════════════
//  子组件：四化小徽章
// ═══════════════════════════════════════════════════════════════

function SihuaBadgeDot({ type }: { type: string }) {
  const styles: Record<string, string> = {
    '禄': 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/30',
    '权': 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/30',
    '科': 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/30',
    '忌': 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/30',
  };
  return (
    <span className={`inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded text-[9px] font-bold border ${styles[type] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
      {type}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
//  子组件：宫位卡片
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
}: {
  palace: ZiweiChartPalace;
  index: number;
  chart: ZiweiChartData;
  isActive: boolean;
  isRelated: boolean;
  isCurrentDecade: boolean;
  isYearPalace: boolean;
  onClick: () => void;
}) {
  const isMobile = useIsMobile();
  const style = getGroupStyle(palace.name);
  const isMing = palace.name === '命宫';
  const isShen = palace.isBodyPalace;

  // 主星处理
  const mainStars = palace.majorStars.filter(
    (s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma',
  );
  const hasMainStar = mainStars.length > 0;
  const dominantStar = mainStars[0];
  const starColorClass = dominantStar ? getStarColor(dominantStar.name) : 'text-slate-400';
  const pattern = identifyPattern(mainStars);

  // 空宫对宫
  const oppositePalace = getOppositePalace(palace.name, chart.palaces);
  const borrowedStars = oppositePalace?.majorStars.filter(
    (s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma',
  );

  // 四化徽章
  const sihuaBadges = getSihuaBadges(palace, chart);

  // 边框/背景/选中态样式
  const baseBorder = isMing
    ? 'border-l-[4px] border-l-amber-400'
    : isShen
      ? 'border-l-[3px] border-l-amber-300'
      : '';

  const baseBg = isMing
    ? 'bg-gradient-to-br from-amber-50/60 to-white/80 dark:from-amber-950/30 dark:to-slate-900/80'
    : style.bg;

  const relatedBg = isRelated && !isActive
    ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-800/40'
    : '';

  const activeRing = isActive
    ? isMing
      ? 'ring-2 ring-amber-400/30 border-amber-300/60 shadow-[0_12px_20px_-8px_rgba(245,158,11,0.22),0_4px_10px_-2px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.55)]'
      : 'ring-2 ring-blue-500/25 border-blue-500/30 shadow-[0_12px_20px_-8px_rgba(59,130,246,0.22),0_4px_10px_-2px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.55)]'
    : '';

  const decadeHighlight = isCurrentDecade
    ? 'bg-amber-50/70 dark:bg-amber-950/20'
    : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        !isMobile && GRID_AREAS[index],
        'min-h-[140px] sm:min-h-0 flex flex-col justify-between',
        CARD_BASE_CLASS,
        CARD_SHADOW_Z2,
        CARD_HOVER_SHADOW_Z3,
        baseBorder,
        baseBg,
        style.border,
        relatedBg,
        decadeHighlight,
        activeRing,
        !isActive && !isRelated && !isCurrentDecade
          ? 'hover:border-blue-500/20 hover:shadow-[0_12px_20px_-8px_rgba(59,130,246,0.18),0_4px_10px_-2px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.55)]'
          : '',
      ].join(' ')}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-60 dark:via-white/15"
        aria-hidden
      />
      {/* 顶部：天干 + 宫位名 + 标签 + 四化 + 来因 */}
      <div className="relative">
        {/* 第一行：天干 + 宫位名 + 各种徽章 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 天干（五行色） */}
          <span className={`text-xs font-bold ${getStemColor(palace.heavenlyStem)}`}>
            {palace.heavenlyStem}
          </span>
          <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>

          {/* 宫位名 + 命宫皇冠 + 身宫标签 */}
          <span className={`text-xs font-extrabold ${style.label} dark:text-slate-200 flex items-center gap-1`}>
            {isMing && (
              <Crown className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />
            )}
            <GlossaryTooltip term={palace.name} chartData={chart} side="right">
              {palace.name}
            </GlossaryTooltip>
          </span>

          {/* 身宫标签 */}
          {isShen && (
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md px-1 py-px">
              <GlossaryTooltip term="身宫" chartData={chart}>身宫</GlossaryTooltip>
            </span>
          )}

          {/* 来因宫徽章 */}
          {palace.isOriginalPalace && (
            <span className="text-[9px] font-bold text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 rounded px-1 py-px">
              来因
            </span>
          )}

          {/* 四化徽章 */}
          {sihuaBadges.length > 0 && (
            <div className="flex items-center gap-0.5 ml-auto">
              {sihuaBadges.map((b) => (
                <SihuaBadgeDot key={b} type={b} />
              ))}
            </div>
          )}
        </div>

        {/* 主星大字 */}
        <div className={`mt-1 text-lg sm:text-xl leading-tight font-black tracking-tight break-words ${starColorClass}`}>
          {hasMainStar ? (
            <GlossaryTooltip term={dominantStar!.name} chartData={chart} side="right">
              <span className="cursor-help border-b border-dotted border-blue-500/30">
                {dominantStar!.name}
              </span>
            </GlossaryTooltip>
          ) : (
            <span className="text-slate-300 dark:text-slate-600 italic text-base font-medium">
              {oppositePalace ? `借${oppositePalace.name}` : '空宫'}
            </span>
          )}
        </div>

        {/* 亮度标注 */}
        {dominantStar?.brightness && (
          <span className={`text-[10px] font-bold ml-1 ${getBrightnessColor(dominantStar.brightness)}`}>
            [{dominantStar.brightness}]
          </span>
        )}

        {/* 格局徽章 */}
        {pattern && (
          <div className="mt-1">
            <span className="inline-block text-[9px] font-bold text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/40 rounded px-1 py-px">
              {pattern}
            </span>
          </div>
        )}

        {/* 其他主星 */}
        {mainStars.length > 1 && (
          <div className="mt-0.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400 break-words line-clamp-1">
            {mainStars.slice(1, 3).map((s) => (
              <span key={s.name} className="mr-1.5">
                <GlossaryTooltip term={s.name} chartData={chart} side="right">
                  <span className="cursor-help border-b border-dotted border-blue-500/20">{s.name}</span>
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
          <div className="mt-0.5 text-[10px] text-slate-400/80 dark:text-slate-500/80">
            <span className="text-slate-400">→ </span>
            {borrowedStars.slice(0, 1).map((s) => (
              <span key={s.name}>
                <span className={`opacity-60 ${getStarColor(s.name)}`}>{s.name}</span>
                {s.brightness && (
                  <span className={`text-[8px] opacity-60 ${getBrightnessColor(s.brightness)}`}>[{s.brightness}]</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* 辅星/煞星 */}
        {palace.minorStars.length > 0 && (
          <div className="mt-0.5 text-[9px] leading-snug text-slate-500/90 dark:text-slate-500 break-words line-clamp-1">
            {palace.minorStars.slice(0, 2).map((s) => s.name).join(' · ')}
          </div>
        )}
      </div>

      {/* 底部：地支 + 大限年龄 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
          {palace.earthlyBranch}
        </span>
        <span className={[
          'text-[10px] px-1.5 py-px rounded-md transition-colors',
          isCurrentDecade
            ? 'bg-amber-50 text-amber-700 font-bold dark:bg-amber-950/30 dark:text-amber-400'
            : 'text-slate-400 dark:text-slate-600',
        ].join(' ')}>
          {palace.stageRange[0]}-{palace.stageRange[1]}岁
          {isCurrentDecade && (
            <span className="ml-1">· 当前大限</span>
          )}
          {isYearPalace && (
            <span className="ml-1 text-violet-600 dark:text-violet-400 font-bold">· 流年</span>
          )}
        </span>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
//  子组件：中央命盘面板
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
  // 默认状态：全局命盘信息
  if (!activePalace || activePalace.name === '命宫') {
    const totalMajorStars = allPalaces.reduce((sum, palace) => {
      return (
        sum +
        palace.majorStars.filter((s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma').length
      );
    }, 0);

    return (
      <div className="order-first col-span-2 rounded-[32px] border border-white/75 bg-gradient-to-b from-white/88 via-white/80 to-white/70 p-4 text-center shadow-[0_24px_44px_-16px_rgba(59,130,246,0.18),0_10px_24px_-12px_rgba(15,23,42,0.12),inset_0_1px_1px_rgba(255,255,255,0.45)] backdrop-blur-xl ring-1 ring-blue-100/70 dark:border-white/20 dark:from-slate-900/90 dark:via-slate-900/82 dark:to-slate-900/72 dark:ring-blue-400/20 sm:order-none sm:col-start-2 sm:col-span-2 sm:row-start-2 sm:row-span-2">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/85 to-transparent opacity-80 dark:via-white/25" aria-hidden />
        <span className="pointer-events-none absolute -bottom-16 left-1/2 h-36 w-56 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500/12 via-indigo-500/10 to-cyan-500/12 blur-3xl opacity-70 dark:from-blue-400/14 dark:via-indigo-400/12 dark:to-cyan-400/14" aria-hidden />
        <div className="relative z-10 flex h-full flex-col justify-between text-center">
          <div>
            <div className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-[2rem] leading-tight font-black text-transparent drop-shadow-[0_2px_6px_rgba(59,130,246,0.2)] sm:text-[36px] sm:leading-none dark:from-blue-400 dark:via-indigo-400 dark:to-cyan-400">
              <GlossaryTooltip term="命宫" chartData={chart}>紫微命盘</GlossaryTooltip>
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {chart.yearStem}{chart.yearBranch}年 · {chart.fiveElementsClass}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {getStartingAge(chart.fiveElementsClass)}
            </div>
          </div>

          <div className="my-4 grid w-full grid-cols-2 gap-3">
            <div className="rounded-2xl border border-blue-200/50 bg-blue-50/50 px-3 py-2 sm:px-4 dark:border-blue-800/30 dark:bg-blue-950/20">
              <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                <GlossaryTooltip term="命主" chartData={chart}>命主</GlossaryTooltip>
              </div>
              <div className="mt-1 text-lg font-black text-blue-900 dark:text-blue-100 sm:text-xl sm:mt-0.5">
                <GlossaryTooltip term={chart.soul} chartData={chart}>{chart.soul}</GlossaryTooltip>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200/50 bg-amber-50/50 px-3 py-2 sm:px-4 dark:border-amber-800/30 dark:bg-amber-950/20">
              <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <GlossaryTooltip term="身主" chartData={chart}>身主</GlossaryTooltip>
              </div>
              <div className="mt-1 text-lg font-black text-amber-900 dark:text-amber-100 sm:text-xl sm:mt-0.5">
                <GlossaryTooltip term={chart.body} chartData={chart}>{chart.body}</GlossaryTooltip>
              </div>
            </div>
          </div>

          {/* 底部信息条：填补中宫留白并增强结构层次 */}
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/60 bg-white/70 p-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900/60">
            <div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">命宫</div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{chart.soulPalaceBranch}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">身宫</div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{chart.bodyPalaceBranch}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">主星数</div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{totalMajorStars} 颗</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 选中状态：宫位详情概览
  const mainStars = activePalace.majorStars.filter(
    (s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma',
  );
  const sihuaBadges = getSihuaBadges(activePalace, chart);
  const tripartite = getTripartite(activePalace.name);

  return (
      <div className="order-first col-span-2 rounded-[32px] border border-white/75 bg-gradient-to-b from-white/88 via-white/80 to-white/70 p-4 text-center shadow-[0_24px_44px_-16px_rgba(59,130,246,0.18),0_10px_24px_-12px_rgba(15,23,42,0.12),inset_0_1px_1px_rgba(255,255,255,0.45)] backdrop-blur-xl ring-1 ring-blue-100/70 dark:border-white/20 dark:from-slate-900/90 dark:via-slate-900/82 dark:to-slate-900/72 dark:ring-blue-400/20 sm:order-none sm:col-start-2 sm:col-span-2 sm:row-start-2 sm:row-span-2">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/85 to-transparent opacity-80 dark:via-white/25" aria-hidden />
      <span className="pointer-events-none absolute -bottom-16 left-1/2 h-36 w-56 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500/12 via-indigo-500/10 to-cyan-500/12 blur-3xl opacity-70 dark:from-blue-400/14 dark:via-indigo-400/12 dark:to-cyan-400/14" aria-hidden />
      <div className="relative z-10 flex h-full flex-col justify-between text-center">
        <div>
          {/* 宫位名称 */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-[1.75rem] leading-tight font-black text-transparent drop-shadow-[0_2px_6px_rgba(59,130,246,0.18)] sm:text-[32px] sm:leading-none dark:from-blue-400 dark:via-indigo-400 dark:to-cyan-400">
            {activePalace.name}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {PALACE_MEANING[activePalace.name] ?? ''}
          </div>
        </div>

        {/* 主星展示 */}
        {mainStars.length > 0 ? (
          <div className="my-3 flex flex-wrap items-center justify-center gap-2">
            {mainStars.slice(0, 3).map((s) => (
              <div key={s.name} className="flex items-center gap-1">
                <span className={`text-sm font-bold ${getStarColor(s.name)}`}>{s.name}</span>
                {s.brightness && (
                  <span className={`text-[10px] font-bold ${getBrightnessColor(s.brightness)}`}>[{s.brightness}]</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="my-3 text-sm text-slate-400 italic">空宫（借对宫星曜）</div>
        )}

        <div className="space-y-2 rounded-2xl border border-slate-200/60 bg-white/70 p-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900/60">
          {/* 大限信息 */}
          <div className="text-[11px] text-slate-600 dark:text-slate-400">
            大限：{activePalace.stageRange[0]}-{activePalace.stageRange[1]}岁
          </div>

          {/* 四化指示 */}
          {sihuaBadges.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">四化：</span>
              {sihuaBadges.map((b) => (
                <SihuaBadgeDot key={b} type={b} />
              ))}
            </div>
          )}

          {/* 三方四正 */}
          {tripartite && (
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              三方四正：
              <span className="text-slate-600 dark:text-slate-300">
                {tripartite.tri[0]} · {tripartite.tri[1]} · {tripartite.opposite}
              </span>
            </div>
          )}

          {/* 天干地支 */}
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {activePalace.heavenlyStem}{activePalace.earthlyBranch}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 根据五行局返回起运年龄 */
function getStartingAge(fiveElementsClass: string): string {
  const map: Record<string, string> = {
    '水二局': '2 岁起运', '木三局': '3 岁起运', '金四局': '4 岁起运',
    '土五局': '5 岁起运', '火六局': '6 岁起运',
  };
  return map[fiveElementsClass] ?? '';
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

  const orderedPalaces = useMemo(() => {
    const map = new Map(chart.palaces.map((p) => [p.name, p]));
    return PALACE_ORDER.map((name) => map.get(name)).filter(Boolean) as ZiweiChartPalace[];
  }, [chart.palaces]);

  const activePalace = useMemo(() => {
    return orderedPalaces.find((p) => p.name === activePalaceLabel) ?? null;
  }, [orderedPalaces, activePalaceLabel]);

  return (
    <div className={GRID_SHELL_CLASS}>
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-70 dark:via-white/15"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-blue-500/10 to-violet-500/10 blur-3xl opacity-40"
        aria-hidden
      />
      <div className="grid grid-cols-2 auto-rows-[minmax(150px,auto)] gap-3 sm:grid-cols-4 sm:grid-rows-4 sm:auto-rows-auto">
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
            />
          );
        })}

        {/* 中央命盘面板 */}
        <CenterPanel chart={chart} activePalace={activePalace} allPalaces={orderedPalaces} />
      </div>
    </div>
  );
}
