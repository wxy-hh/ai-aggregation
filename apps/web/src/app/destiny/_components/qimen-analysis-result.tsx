'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronDown,
  CircleDashed,
  CircleDot,
  Clock3,
  Compass,
  DoorOpen,
  FileText,
  Gauge,
  HelpCircle,
  Layers,
  ListChecks,
  ShieldAlert,
  Sparkles,
  Star,
  UserRound,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DestinyResultHeader,
  destinyG3ContentShellClass,
  destinySecondaryBtnClass,
} from './layout/destiny-result-header';
import { cn } from '@/lib/utils';
import type {
  QimenAnalysisBaseResult,
  QimenAsyncSectionKey,
  QimenAsyncSections,
  QimenBaseStatus,
  QimenBoardCell,
  QimenSectionStatus,
} from './qimen-types';

type QimenAnalysisResultProps = {
  analysisId: string | null;
  baseResult: QimenAnalysisBaseResult | null;
  baseStatus: QimenBaseStatus;
  baseError: string | null;
  sections: QimenAsyncSections;
  sectionStatuses: Record<QimenAsyncSectionKey, QimenSectionStatus>;
  sectionErrors: Partial<Record<QimenAsyncSectionKey, string>>;
  error: string | null;
  onBackToForm: () => void;
  onRetry: () => void;
};

const palaceOrder = [
  '巽四宫',
  '离九宫',
  '坤二宫',
  '震三宫',
  '中五宫',
  '兑七宫',
  '艮八宫',
  '坎一宫',
  '乾六宫',
];

/** G-3 内容区壳（与顶栏分层的紧凑圆角） */
const g3ShellClass = destinyG3ContentShellClass;

const metaBadgeClass =
  'rounded-full border border-slate-200/60 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-600 dark:border-white/10 dark:bg-violet-500/15 dark:text-violet-400';

const progressBadgeClass =
  'rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-3 py-1 text-xs font-bold text-white shadow-[0_6px_16px_rgba(124,58,237,0.28)]';

const innerPanelClass = cn(
  'relative overflow-hidden rounded-2xl border border-slate-200/50 p-4 sm:p-5',
  'bg-gradient-to-br from-white/90 via-white/70 to-violet-50/25',
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_12px_-2px_rgba(15,23,42,0.04)]',
  'dark:border-white/10 dark:from-slate-900/90 dark:via-slate-900/75 dark:to-violet-950/20'
);

/** 盘局基本信息单项卡片主题（对齐 ziwei ModuleCards 的玻璃渐变 + 背光圈） */
type MetaInfoToneKey = 'time' | 'layout' | 'stems' | 'leaders' | 'void' | 'horse';

const META_INFO_TONE_MAP: Record<
  MetaInfoToneKey,
  {
    card: string;
    orb: string;
    iconShell: string;
    title: string;
    hint: string;
    iconColor: string;
  }
> = {
  time: {
    card: 'border-cyan-200/60 dark:border-cyan-700/30 bg-gradient-to-br from-white/92 via-white/70 to-cyan-50/50 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-cyan-950/28 hover:border-cyan-300/70 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_14px_24px_-10px_rgba(6,182,212,0.22),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
    orb: 'from-cyan-500/22 to-blue-500/12',
    iconShell:
      'border-cyan-200/70 bg-gradient-to-br from-cyan-50/95 to-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_6px_16px_-6px_rgba(6,182,212,0.28)] dark:border-cyan-500/25 dark:from-cyan-950/55 dark:to-slate-900/65',
    title: 'text-cyan-950 dark:text-cyan-50',
    hint: 'text-cyan-800/75 dark:text-cyan-200/75',
    iconColor: '#0891b2',
  },
  layout: {
    card: 'border-emerald-200/60 dark:border-emerald-700/30 bg-gradient-to-br from-white/92 via-white/70 to-emerald-50/48 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-emerald-950/28 hover:border-emerald-300/70 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_14px_24px_-10px_rgba(16,185,129,0.22),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
    orb: 'from-emerald-500/20 to-teal-500/12',
    iconShell:
      'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 to-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_6px_16px_-6px_rgba(16,185,129,0.24)] dark:border-emerald-500/25 dark:from-emerald-950/55 dark:to-slate-900/65',
    title: 'text-emerald-950 dark:text-emerald-50',
    hint: 'text-emerald-800/75 dark:text-emerald-200/75',
    iconColor: '#059669',
  },
  stems: {
    card: 'border-slate-300/70 dark:border-slate-600/30 bg-gradient-to-br from-white/92 via-white/70 to-slate-100/45 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-slate-800/40 hover:border-slate-400/70 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_14px_24px_-10px_rgba(71,85,105,0.16),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
    orb: 'from-slate-400/16 to-indigo-300/8',
    iconShell:
      'border-slate-200/80 bg-gradient-to-br from-slate-50/95 to-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_6px_16px_-6px_rgba(100,116,139,0.18)] dark:border-slate-500/25 dark:from-slate-800/55 dark:to-slate-900/65',
    title: 'text-slate-900 dark:text-slate-50',
    hint: 'text-slate-600 dark:text-slate-400',
    iconColor: '#64748b',
  },
  leaders: {
    card: 'border-amber-200/60 dark:border-amber-700/30 bg-gradient-to-br from-white/92 via-white/70 to-amber-50/50 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-amber-950/30 hover:border-amber-300/70 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_14px_24px_-10px_rgba(245,158,11,0.24),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
    orb: 'from-amber-500/22 to-orange-500/12',
    iconShell:
      'border-amber-200/70 bg-gradient-to-br from-amber-50/95 to-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_6px_16px_-6px_rgba(245,158,11,0.28)] dark:border-amber-500/25 dark:from-amber-950/55 dark:to-slate-900/65',
    title: 'text-amber-950 dark:text-amber-50',
    hint: 'text-amber-800/75 dark:text-amber-200/75',
    iconColor: '#d97706',
  },
  void: {
    card: 'border-rose-200/55 dark:border-rose-700/28 bg-gradient-to-br from-white/92 via-white/70 to-rose-50/42 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-rose-950/26 hover:border-rose-300/65 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_14px_24px_-10px_rgba(244,63,94,0.2),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
    orb: 'from-rose-400/18 to-pink-400/10',
    iconShell:
      'border-rose-200/70 bg-gradient-to-br from-rose-50/95 to-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_6px_16px_-6px_rgba(244,63,94,0.22)] dark:border-rose-500/22 dark:from-rose-950/50 dark:to-slate-900/65',
    title: 'text-rose-900 dark:text-rose-100',
    hint: 'text-rose-700/80 dark:text-rose-300/80',
    iconColor: '#e11d48',
  },
  horse: {
    card: 'border-violet-200/60 dark:border-violet-700/30 bg-gradient-to-br from-white/92 via-white/70 to-violet-50/48 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-violet-950/28 hover:border-violet-300/70 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_14px_24px_-10px_rgba(139,92,246,0.22),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
    orb: 'from-violet-500/20 to-fuchsia-500/10',
    iconShell:
      'border-violet-200/70 bg-gradient-to-br from-violet-50/95 to-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_6px_16px_-6px_rgba(139,92,246,0.26)] dark:border-violet-500/25 dark:from-violet-950/55 dark:to-slate-900/65',
    title: 'text-violet-950 dark:text-violet-50',
    hint: 'text-violet-800/75 dark:text-violet-200/75',
    iconColor: '#7c3aed',
  },
};

function MetaInfoCard({
  toneKey,
  icon: Icon,
  title,
  hint,
  className,
}: {
  toneKey: MetaInfoToneKey;
  icon: LucideIcon;
  title: React.ReactNode;
  hint: string;
  className?: string;
}) {
  const tone = META_INFO_TONE_MAP[toneKey];

  return (
    <div
      className={cn(
        'group relative flex h-full min-h-[5.75rem] overflow-hidden rounded-2xl border p-3.5 sm:min-h-[5.5rem] sm:p-4',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_4px_12px_-2px_rgba(15,23,42,0.05)]',
        'transition-all duration-200 transform-gpu hover:-translate-y-0.5',
        'supports-[backdrop-filter]:bg-white/78 dark:supports-[backdrop-filter]:bg-slate-900/72',
        tone.card,
        className
      )}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-90 dark:via-white/20"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-60 dark:via-white/10"
        aria-hidden
      />
      <span
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br blur-3xl opacity-45 transition-opacity duration-200 group-hover:opacity-65',
          tone.orb
        )}
        aria-hidden
      />
      <span
        className={cn(
          'pointer-events-none absolute -bottom-12 -left-10 h-28 w-28 rounded-full bg-gradient-to-tr blur-3xl opacity-25 transition-opacity duration-200 group-hover:opacity-40',
          tone.orb
        )}
        aria-hidden
      />
      <div className="relative z-10 flex w-full items-center gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ring-1 ring-white/60 backdrop-blur-md dark:ring-white/10',
            tone.iconShell
          )}
        >
          <Icon className="h-[19px] w-[19px]" style={{ color: tone.iconColor }} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm font-semibold leading-snug line-clamp-2', tone.title)}>{title}</div>
          <p className={cn('mt-1 text-xs leading-relaxed line-clamp-2', tone.hint)}>{hint}</p>
        </div>
      </div>
    </div>
  );
}

// ---- 宫位解读生成器（动态，基于实际排盘数据） ----

const STAR_MEANINGS: Record<string, string> = {
  天蓬: '天蓬星属水，主冒险、突破、暗中行动。宜开拓新方向，忌冲动冒进。',
  天任: '天任星属土，主稳健、积累、厚积薄发。宜脚踏实地推进，忌急于求成。',
  天冲: '天冲星属木，主冲动、变动、快速行动。宜果断出击，忌犹豫反复。',
  天辅: '天辅星属木，主文化、教育、贵人扶持。宜学习提升、借助外力，忌闭门造车。',
  天英: '天英星属火，主名声、曝光、创意表达。宜展示自己、扩大影响，忌情绪化。',
  天芮: '天芮星属土，主问题、隐患、学习成长。宜发现短板、积累经验，忌忽视风险。',
  天柱: '天柱星属金，主是非、口舌、破坏重建。宜据理力争，忌激化矛盾。',
  天心: '天心星属金，主策划、谋略、制度规则。宜周密计划、规范流程，忌草率。',
  天禽: '天禽星属土，居中统摄全局，主贵人、稳固、缓冲。宜居中调度，忌偏激。',
};

const DOOR_MEANINGS: Record<string, string> = {
  休门: '休门属水，吉门。主休息、蓄势、暗中准备。宜养精蓄锐，等待时机。',
  生门: '生门属土，吉门。主生长、收益、财富机会。宜投资、开拓财源。',
  伤门: '伤门属木，凶门。主伤害、竞争、冲突损耗。宜主动出击但需防损失。',
  杜门: '杜门属木，中平。主闭塞、隐蔽、技术钻研。宜深耕细作，不宜高调宣扬。',
  景门: '景门属火，中平。主名声、曝光、文书计划。宜展示推广，忌空谈不落地。',
  死门: '死门属土，凶门。主终结、停滞、不可逆。宜止损出局，不宜开始新事。',
  惊门: '惊门属金，凶门。主惊恐、口舌、意外变故。宜谨慎言行，做好风控。',
  开门: '开门属金，吉门。主开创、机遇、公开推进。宜签约、谈判、开启新计划。',
};

/** 伏吟时各天干的侧重象义（天地同干） */
const STEM_FUYIN_MEANINGS: Record<string, string> = {
  甲: '甲木伏吟，开创、推进类事易「想动而难成」，宜先理顺计划再出手。',
  乙: '乙木伏吟，协商、人情、合作类事易拖延反复，忌急于求成。',
  丙: '丙火伏吟，名声、曝光、文书类事波动反复，宜控情绪、少高调。',
  丁: '丁火伏吟，细节、沟通、技术类事磨蹭反复，宜耐心打磨。',
  戊: '戊土伏吟，稳固但停滞，利守成、积累，不宜贸然扩张。',
  己: '己土伏吟，内部协调、资源整理类事易纠结反复，宜先固本。',
  庚: '庚金伏吟，变革、竞争、压力之事易僵持反复，宜据理而不硬碰。',
  辛: '辛金伏吟，口舌、精细判断类事易来回推敲，宜留书面依据。',
  壬: '壬水伏吟，流动、变动、出行类事拖而不决，宜以信息核实为先。',
  癸: '癸水伏吟，隐秘、资源、情感类事易暗生反复，宜低调观察。',
};

/** 天地异干时，天干简要气质（用于格局补充） */
const STEM_PAIR_HINTS: Record<string, string> = {
  甲: '主生发、开创',
  乙: '主柔顺、协商',
  丙: '主光明、外显',
  丁: '主细节、内敛',
  戊: '主厚重、守成',
  己: '主包容、转化',
  庚: '主变革、肃杀',
  辛: '主精细、口舌',
  壬: '主流动、智慧',
  癸: '主潜藏、情感',
};

/** 伏吟落在不同五行宫位时的节奏提示 */
const WUXING_FUYIN_PALACE_HINT: Record<string, string> = {
  木: '木宫再遇伏吟，生发之力受制，宜养势不宜强攻。',
  火: '火宫伏吟，外显之力反复，宜控节奏、避免情绪化决策。',
  土: '土宫伏吟，固守之象更重，利沉淀、忌频繁折腾。',
  金: '金宫伏吟，变革阻力大，宜讲规则、留证据。',
  水: '水宫伏吟，流动受阻，信息易反复，宜多核实少冲动。',
};

function buildPatternInterpretation(cell: QimenBoardCell): string | null {
  if (!cell.pattern) return null;

  const [tian, di] = cell.pattern.split('+');
  if (!tian || !di) return null;

  const wuxing = resolvePalaceWuxing(cell);
  const palaceCtx =
    cell.palace !== '中五宫' ? `在${cell.palace}（属${wuxing}）` : '在中五宫';

  if (tian === di) {
    const stemNote = STEM_FUYIN_MEANINGS[tian] ?? '天地同气，事多反复，宜以稳为先、少折腾。';
    const wuxingNote =
      cell.palace !== '中五宫' ? WUXING_FUYIN_PALACE_HINT[wuxing] ?? '' : '';
    return `天盘与地盘同为「${tian}」，${palaceCtx}成「伏吟」：同一干支能量叠加，整体偏慢、易回到原点。${stemNote}${wuxingNote ? ` ${wuxingNote}` : ''}`;
  }

  const tianHint = STEM_PAIR_HINTS[tian];
  const diHint = STEM_PAIR_HINTS[di];
  return `天盘「${tian}」加地盘「${di}」${palaceCtx}，天地异气：外在表现${tianHint ? `（${tianHint}）` : ''}与内在根基${diHint ? `（${diHint}）` : ''}不一致，多有外力介入、方向调整或表里不一之象，需结合八门九星综合判断。`;
}

const GOD_MEANINGS: Record<string, string> = {
  值符: '值符为八神之首，主权威、领导、正面主导力。此宫位是全局核心，力量最强。',
  螣蛇: '螣蛇主虚诈、反复、缠绕不定。此宫位的事可能有变数，需反复确认。',
  太阴: '太阴主暗中运作、谋划、保密。此宫位的事宜低调进行，不宜公开。',
  六合: '六合主合作、婚姻、中介撮合。此宫位利合作协商、借助第三方。',
  白虎: '白虎主凶险、压力、强势力量。此宫位有阻力或强敌，需硬实力应对。',
  玄武: '玄武主暗昧、欺骗、不透明。此宫位可能有隐藏信息，需深入调查。',
  九地: '九地主缓慢、稳固、长久。此宫位的事进展慢但根基扎实，宜长期布局。',
  九天: '九天主上升、远行、高远目标。此宫位利向上发展、扩大格局。',
};

function buildPalaceInterpretation(cell: QimenBoardCell): string {
  const parts: string[] = [];

  // 基本属性
  if (cell.palace === '中五宫') {
    parts.push(
      '中五宫为九宫中枢，传统上寄于坤二宫。此宫位不单独作为行动方向，但统摄全局能量平衡。'
    );
  } else {
    // 九星解读
    const starInfo = STAR_MEANINGS[cell.star];
    if (starInfo) parts.push(`【${cell.star}】${starInfo}`);

    // 八门解读
    const doorInfo = DOOR_MEANINGS[cell.door];
    if (doorInfo) parts.push(`【${cell.door}】${doorInfo}`);

    // 八神解读
    const godInfo = GOD_MEANINGS[cell.god];
    if (godInfo) parts.push(`【${cell.god}】${godInfo}`);

    const patternInfo = buildPatternInterpretation(cell);
    if (patternInfo) {
      parts.push(`【格局·${cell.pattern}】${patternInfo}`);
    }

    // 特殊标记解读
    const markers = palaceMarkerList(cell);
    if (markers.length > 0) {
      const markerNotes: string[] = [];
      if (cell.isValueSymbol)
        markerNotes.push('这是值符落宫，全局核心宫位，当前时空的主导力量在此，对事情走向影响最大');
      if (cell.isValueDoor)
        markerNotes.push('这是值使落宫，事态发展的关键通道，事情将沿此方向推进');
      if (cell.isVoid)
        markerNotes.push('此宫旬空，能量减半，相关的事情虚而不实，需等待出空（约10天后）才能推进');
      if (cell.isHorse)
        markerNotes.push('此宫有驿马，主奔波、变动、出行，相关事情容易发生快速变化');
      if (markerNotes.length > 0) parts.push(`【特别标记】${markerNotes.join('；')}`);
    }
  }

  return parts.join('\n\n') || '结合全局盘面与具体问题综合分析。';
}

/** 洛书九宫单宫视觉主题 */
type PalaceCellTone = {
  card: string;
  orb: string;
  godChip: string;
  dirChip: string;
  activeRing: string;
};

/** 宫位 → 五行（与排盘数据一致，作 wuxing 字段兜底） */
const PALACE_WUXING_FALLBACK: Record<string, string> = {
  巽四宫: '木',
  震三宫: '木',
  离九宫: '火',
  坤二宫: '土',
  艮八宫: '土',
  中五宫: '土',
  兑七宫: '金',
  乾六宫: '金',
  坎一宫: '水',
};

/**
 * 五行基调：普通宫位用方位五行做淡雅区分（饱和度低，不抢盘意）
 * 值符 / 空亡 / 驿马等特殊态在 getPalaceCellTone 中优先覆盖
 */
const WUXING_PALACE_PALETTE: Record<string, PalaceCellTone> = {
  木: {
    card: cn(
      'border-emerald-200/55',
      'bg-gradient-to-br from-white/95 via-emerald-50/22 to-emerald-100/38',
      'hover:border-emerald-300/65 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_24px_-10px_rgba(16,185,129,0.16)]',
      'dark:border-emerald-700/28 dark:from-slate-900/90 dark:via-emerald-950/18 dark:to-emerald-950/14'
    ),
    orb: 'from-emerald-500/18 to-teal-400/10',
    godChip:
      'border-emerald-200/65 bg-emerald-50/88 text-emerald-800 dark:border-emerald-600/28 dark:bg-emerald-950/42 dark:text-emerald-300',
    dirChip:
      'border-emerald-200/45 bg-white/78 text-emerald-700/85 dark:border-emerald-700/22 dark:bg-slate-900/55 dark:text-emerald-300/85',
    activeRing: 'ring-1 ring-emerald-500/55 shadow-[0_0_0_1px_rgba(16,185,129,0.22)]',
  },
  火: {
    card: cn(
      'border-orange-200/55',
      'bg-gradient-to-br from-white/95 via-orange-50/22 to-rose-50/32',
      'hover:border-orange-300/65 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_24px_-10px_rgba(249,115,22,0.16)]',
      'dark:border-orange-700/28 dark:from-slate-900/90 dark:via-orange-950/18 dark:to-rose-950/14'
    ),
    orb: 'from-orange-500/18 to-rose-400/10',
    godChip:
      'border-orange-200/65 bg-orange-50/88 text-orange-800 dark:border-orange-600/28 dark:bg-orange-950/42 dark:text-orange-300',
    dirChip:
      'border-orange-200/45 bg-white/78 text-orange-700/85 dark:border-orange-700/22 dark:bg-slate-900/55 dark:text-orange-300/85',
    activeRing: 'ring-1 ring-orange-500/55 shadow-[0_0_0_1px_rgba(249,115,22,0.22)]',
  },
  土: {
    card: cn(
      'border-stone-200/60',
      'bg-gradient-to-br from-white/95 via-stone-50/22 to-amber-50/28',
      'hover:border-stone-300/65 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_24px_-10px_rgba(120,113,108,0.14)]',
      'dark:border-stone-600/30 dark:from-slate-900/90 dark:via-stone-900/20 dark:to-amber-950/12'
    ),
    orb: 'from-stone-400/16 to-amber-300/8',
    godChip:
      'border-stone-200/65 bg-stone-50/88 text-stone-700 dark:border-stone-600/28 dark:bg-stone-900/42 dark:text-stone-300',
    dirChip:
      'border-stone-200/45 bg-white/78 text-stone-600/90 dark:border-stone-600/25 dark:bg-slate-900/55 dark:text-stone-400/90',
    activeRing: 'ring-1 ring-stone-500/50 shadow-[0_0_0_1px_rgba(120,113,108,0.2)]',
  },
  金: {
    card: cn(
      'border-slate-300/60',
      'bg-gradient-to-br from-white/95 via-slate-50/25 to-indigo-50/28',
      'hover:border-slate-400/65 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_24px_-10px_rgba(100,116,139,0.14)]',
      'dark:border-slate-600/32 dark:from-slate-900/90 dark:via-slate-900/78 dark:to-indigo-950/16'
    ),
    orb: 'from-slate-400/14 to-indigo-400/10',
    godChip:
      'border-slate-200/70 bg-slate-50/88 text-slate-700 dark:border-slate-500/28 dark:bg-slate-800/50 dark:text-slate-300',
    dirChip:
      'border-slate-200/50 bg-white/78 text-slate-600/90 dark:border-slate-600/28 dark:bg-slate-900/55 dark:text-slate-400/90',
    activeRing: 'ring-1 ring-slate-500/50 shadow-[0_0_0_1px_rgba(100,116,139,0.2)]',
  },
  水: {
    card: cn(
      'border-cyan-200/55',
      'bg-gradient-to-br from-white/95 via-cyan-50/22 to-blue-50/32',
      'hover:border-cyan-300/65 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_24px_-10px_rgba(6,182,212,0.16)]',
      'dark:border-cyan-700/28 dark:from-slate-900/90 dark:via-cyan-950/18 dark:to-blue-950/14'
    ),
    orb: 'from-cyan-500/18 to-blue-400/10',
    godChip:
      'border-cyan-200/65 bg-cyan-50/88 text-cyan-800 dark:border-cyan-600/28 dark:bg-cyan-950/42 dark:text-cyan-300',
    dirChip:
      'border-cyan-200/45 bg-white/78 text-cyan-700/85 dark:border-cyan-700/22 dark:bg-slate-900/55 dark:text-cyan-300/85',
    activeRing: 'ring-1 ring-cyan-500/55 shadow-[0_0_0_1px_rgba(6,182,212,0.22)]',
  },
};

const CENTER_PALACE_TONE: PalaceCellTone = {
  card: cn(
    'border-dashed border-slate-300/80',
    'bg-gradient-to-br from-slate-50/95 via-white/75 to-slate-100/60',
    'hover:border-slate-400/80 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_14px_24px_-10px_rgba(100,116,139,0.14)]',
    'dark:border-slate-600/55 dark:from-slate-800/55 dark:via-slate-900/75 dark:to-slate-800/50'
  ),
  orb: 'from-slate-400/16 to-slate-300/8',
  godChip:
    'border-slate-200/70 bg-white/80 text-slate-500 dark:border-slate-600/50 dark:bg-slate-800/70 dark:text-slate-400',
  dirChip:
    'border-slate-200/60 bg-slate-50/80 text-slate-400 dark:border-slate-600/40 dark:bg-slate-800/60 dark:text-slate-500',
  activeRing: 'ring-1 ring-slate-400/50 shadow-[0_0_0_1px_rgba(100,116,139,0.2)]',
};

const VALUE_PALACE_TONE: PalaceCellTone = {
  card: cn(
    'border-amber-300/70',
    'bg-gradient-to-br from-white/95 via-amber-50/55 to-amber-100/45',
    'hover:border-amber-400/80 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_14px_24px_-10px_rgba(245,158,11,0.22)]',
    'dark:border-amber-600/35 dark:from-slate-900/92 dark:via-amber-950/35 dark:to-amber-950/20'
  ),
  orb: 'from-amber-500/22 to-orange-400/12',
  godChip:
    'border-amber-200/70 bg-amber-50/90 text-amber-800 dark:border-amber-600/30 dark:bg-amber-950/50 dark:text-amber-300',
  dirChip:
    'border-amber-200/50 bg-white/75 text-amber-700/90 dark:border-amber-700/25 dark:bg-slate-900/55 dark:text-amber-300/90',
  activeRing: 'ring-1 ring-amber-500/55 shadow-[0_0_0_1px_rgba(245,158,11,0.24)]',
};

const VOID_PALACE_TONE: PalaceCellTone = {
  card: cn(
    'border-rose-200/65',
    'bg-gradient-to-br from-white/95 via-rose-50/40 to-rose-100/35',
    'hover:border-rose-300/75 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_24px_-10px_rgba(244,63,94,0.18)]',
    'dark:border-rose-700/30 dark:from-slate-900/92 dark:via-rose-950/28 dark:to-rose-950/18'
  ),
  orb: 'from-rose-400/18 to-pink-400/10',
  godChip:
    'border-rose-200/65 bg-rose-50/90 text-rose-700 dark:border-rose-600/30 dark:bg-rose-950/45 dark:text-rose-300',
  dirChip:
    'border-rose-200/50 bg-white/75 text-rose-600/90 dark:border-rose-700/25 dark:bg-slate-900/55 dark:text-rose-300/90',
  activeRing: 'ring-1 ring-rose-500/50 shadow-[0_0_0_1px_rgba(244,63,94,0.22)]',
};

const HORSE_PALACE_TONE: PalaceCellTone = {
  card: cn(
    'border-violet-200/65',
    'bg-gradient-to-br from-white/95 via-violet-50/38 to-violet-100/32',
    'hover:border-violet-300/75 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_24px_-10px_rgba(139,92,246,0.18)]',
    'dark:border-violet-700/30 dark:from-slate-900/92 dark:via-violet-950/28 dark:to-violet-950/18'
  ),
  orb: 'from-violet-500/18 to-fuchsia-400/10',
  godChip:
    'border-violet-200/65 bg-violet-50/90 text-violet-700 dark:border-violet-600/30 dark:bg-violet-950/45 dark:text-violet-300',
  dirChip:
    'border-violet-200/50 bg-white/75 text-violet-600/90 dark:border-violet-700/25 dark:bg-slate-900/55 dark:text-violet-300/90',
  activeRing: 'ring-1 ring-violet-500/50 shadow-[0_0_0_1px_rgba(139,92,246,0.22)]',
};

function resolvePalaceWuxing(cell: QimenBoardCell) {
  return cell.wuxing ?? PALACE_WUXING_FALLBACK[cell.palace] ?? '土';
}

const PALACE_CELL_BASE_CLASS = cn(
  'group/palace relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border p-2 sm:p-3',
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_12px_-2px_rgba(15,23,42,0.05)]',
  'transition-all duration-200 transform-gpu hover:-translate-y-0.5',
  'min-h-[110px] sm:min-h-[140px] lg:min-h-[168px]',
  'supports-[backdrop-filter]:bg-white/78 dark:supports-[backdrop-filter]:bg-slate-900/72'
);

function getPalaceCellTone(cell: QimenBoardCell): PalaceCellTone {
  if (cell.palace === '中五宫') {
    return CENTER_PALACE_TONE;
  }

  // 盘意标记优先于五行底色，避免「坤二宫值符」被土色稀释
  if (cell.isValueSymbol || cell.isValueDoor) {
    return VALUE_PALACE_TONE;
  }

  if (cell.isVoid) {
    return VOID_PALACE_TONE;
  }

  if (cell.isHorse) {
    return HORSE_PALACE_TONE;
  }

  return WUXING_PALACE_PALETTE[resolvePalaceWuxing(cell)] ?? WUXING_PALACE_PALETTE.土;
}

const PALACE_MARKER_CLASS = {
  valueSymbol:
    'border-amber-200/70 bg-gradient-to-r from-amber-50/95 to-amber-100/80 text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-amber-600/30 dark:from-amber-950/60 dark:to-amber-900/40 dark:text-amber-300',
  valueDoor:
    'border-indigo-200/70 bg-gradient-to-r from-indigo-50/95 to-indigo-100/75 text-indigo-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-indigo-600/30 dark:from-indigo-950/60 dark:to-indigo-900/40 dark:text-indigo-300',
  void: 'border-rose-200/70 bg-gradient-to-r from-rose-50/95 to-rose-100/75 text-rose-700 dark:border-rose-600/30 dark:from-rose-950/55 dark:to-rose-900/35 dark:text-rose-300',
  horse:
    'border-violet-200/70 bg-gradient-to-r from-violet-50/95 to-violet-100/75 text-violet-700 dark:border-violet-600/30 dark:from-violet-950/55 dark:to-violet-900/35 dark:text-violet-300',
} as const;

function QimenPalaceCell({
  cell,
  isActive,
  onToggle,
}: {
  cell: QimenBoardCell;
  isActive: boolean;
  onToggle: () => void;
}) {
  const tone = getPalaceCellTone(cell);
  const isCenter = cell.palace === '中五宫';

  return (
    <article
      onClick={onToggle}
      className={cn(PALACE_CELL_BASE_CLASS, tone.card, isActive && tone.activeRing)}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-90 dark:via-white/15"
        aria-hidden
      />
      <span
        className={cn(
          'pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br blur-2xl opacity-40 transition-opacity duration-200 group-hover/palace:opacity-60',
          tone.orb
        )}
        aria-hidden
      />

      <div className="relative z-10 flex items-start justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1">
          <span
            className={cn(
              'truncate text-[11px] font-bold tracking-tight sm:text-xs',
              isCenter ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'
            )}
          >
            {cell.palace}
          </span>
          {!isCenter ? (
            <span
              className="shrink-0 rounded-md border border-white/60 bg-white/70 px-1 py-px text-[9px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400"
              title={`五行属${resolvePalaceWuxing(cell)}`}
            >
              {resolvePalaceWuxing(cell)}
            </span>
          ) : null}
        </span>
        {!isCenter ? (
          <span
            className={cn(
              'max-w-[4.5rem] truncate rounded-lg border px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm sm:max-w-none',
              tone.godChip
            )}
          >
            {cell.god}
          </span>
        ) : null}
      </div>

      {!isCenter ? (
        <div
          className={cn(
            'absolute right-1.5 top-7 rounded-lg border px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm sm:right-2 sm:top-8',
            tone.dirChip
          )}
        >
          {cell.direction}
        </div>
      ) : (
        <div className="absolute right-1.5 top-7 text-[10px] font-medium text-slate-400 dark:text-slate-500 sm:right-2 sm:top-8">
          中宫
        </div>
      )}

      <div className="relative z-10 mt-2 flex flex-1 flex-col justify-center text-center sm:mt-3">
        {isCenter ? (
          <>
            <div className="text-lg font-black text-slate-400 sm:text-2xl lg:text-3xl dark:text-slate-500">
              {cell.star}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">寄坤二宫</div>
          </>
        ) : (
          <>
            <div
              className={cn(
                'text-[22px] font-black leading-none tracking-tight sm:text-[34px] lg:text-[42px]',
                getStarColor(cell.star)
              )}
            >
              {cell.star}
            </div>
            <div
              className={cn(
                'mt-0.5 text-base font-bold leading-none tracking-tight sm:mt-1 sm:text-[22px] lg:text-[28px]',
                getDoorColor(cell.door)
              )}
            >
              {cell.door}
            </div>
          </>
        )}
      </div>

      <div
        className={cn(
          'relative z-10 mt-auto flex items-center justify-between rounded-xl border px-2 py-1.5',
          'border-white/70 bg-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-sm',
          'dark:border-white/10 dark:bg-slate-900/50'
        )}
      >
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">地</span>
          <span className="text-base font-bold text-slate-600 sm:text-lg lg:text-xl dark:text-slate-300">
            {cell.earthStem}
          </span>
        </div>
        <div className="h-8 w-px bg-gradient-to-b from-transparent via-slate-200/80 to-transparent dark:via-slate-600/60" />
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">天</span>
          <span className="text-base font-bold text-[#C5583A] sm:text-lg lg:text-xl dark:text-orange-400">
            {cell.heavenStem}
          </span>
        </div>
      </div>

      {(cell.isValueSymbol || cell.isValueDoor || cell.isVoid || cell.isHorse) && (
        <div className="relative z-10 mt-1.5 flex flex-wrap justify-center gap-1">
          {cell.isValueSymbol ? (
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                PALACE_MARKER_CLASS.valueSymbol
              )}
            >
              值符
            </span>
          ) : null}
          {cell.isValueDoor ? (
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                PALACE_MARKER_CLASS.valueDoor
              )}
            >
              值使
            </span>
          ) : null}
          {cell.isVoid ? (
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                PALACE_MARKER_CLASS.void
              )}
            >
              空亡
            </span>
          ) : null}
          {cell.isHorse ? (
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                PALACE_MARKER_CLASS.horse
              )}
            >
              驿马
            </span>
          ) : null}
        </div>
      )}
    </article>
  );
}

function getDoorColor(door: string) {
  if (door.includes('开') || door.includes('生') || door.includes('休'))
    return 'text-emerald-700 dark:text-emerald-400';
  if (door.includes('惊') || door.includes('死') || door.includes('伤'))
    return 'text-rose-700 dark:text-rose-400';
  return 'text-indigo-700 dark:text-indigo-400';
}

function getStarColor(star: string) {
  if (star.includes('英') || star.includes('冲')) return 'text-[#1E2B6D] dark:text-slate-300';
  if (star.includes('芮')) return 'text-[#5A355A] dark:text-slate-400';
  return 'text-[#222D66] dark:text-slate-300';
}

function palaceMarkerList(cell: QimenBoardCell) {
  return [
    cell.isValueSymbol ? '值符落宫' : null,
    cell.isValueDoor ? '值使落宫' : null,
    cell.isVoid ? '旬空宫位' : null,
    cell.isHorse ? '驿马宫位' : null,
  ].filter(Boolean) as string[];
}

function buildBoardCells(baseResult: QimenAnalysisBaseResult): QimenBoardCell[] {
  return palaceOrder.map(
    (palace) => baseResult.board.find((item) => item.palace === palace) ?? baseResult.board[0]
  );
}

/** 盘局加载后的默认选中：值符落宫 → 值使落宫 → 首个非中五宫 */
function pickDefaultPalaceIndex(cells: QimenBoardCell[]): number {
  if (cells.length === 0) return 0;

  const valueSymbolIdx = cells.findIndex((cell) => cell.isValueSymbol);
  if (valueSymbolIdx >= 0) return valueSymbolIdx;

  const valueDoorIdx = cells.findIndex((cell) => cell.isValueDoor);
  if (valueDoorIdx >= 0) return valueDoorIdx;

  const nonCenterIdx = cells.findIndex((cell) => cell.palace !== '中五宫');
  return nonCenterIdx >= 0 ? nonCenterIdx : 0;
}

/** 宫位详情面板 — 五行主题背光 */
const WUXING_DETAIL_ACCENT: Record<
  string,
  { orb: string; border: string; title: string; metaChip: string }
> = {
  木: {
    orb: 'from-emerald-500/22 to-teal-500/10',
    border: 'border-emerald-200/55 dark:border-emerald-600/28',
    title: 'text-emerald-950 dark:text-emerald-50',
    metaChip:
      'border-emerald-200/60 bg-emerald-50/80 text-emerald-800 dark:border-emerald-600/30 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  火: {
    orb: 'from-orange-500/22 to-rose-500/10',
    border: 'border-orange-200/55 dark:border-orange-600/28',
    title: 'text-orange-950 dark:text-orange-50',
    metaChip:
      'border-orange-200/60 bg-orange-50/80 text-orange-800 dark:border-orange-600/30 dark:bg-orange-950/40 dark:text-orange-300',
  },
  土: {
    orb: 'from-amber-500/20 to-stone-500/10',
    border: 'border-amber-200/55 dark:border-amber-600/28',
    title: 'text-amber-950 dark:text-amber-50',
    metaChip:
      'border-amber-200/60 bg-amber-50/80 text-amber-900 dark:border-amber-600/30 dark:bg-amber-950/40 dark:text-amber-300',
  },
  金: {
    orb: 'from-slate-400/20 to-indigo-400/10',
    border: 'border-slate-200/60 dark:border-slate-500/28',
    title: 'text-slate-900 dark:text-slate-50',
    metaChip:
      'border-slate-200/65 bg-slate-50/85 text-slate-700 dark:border-slate-500/30 dark:bg-slate-800/50 dark:text-slate-300',
  },
  水: {
    orb: 'from-cyan-500/22 to-blue-500/10',
    border: 'border-cyan-200/55 dark:border-cyan-600/28',
    title: 'text-cyan-950 dark:text-cyan-50',
    metaChip:
      'border-cyan-200/60 bg-cyan-50/80 text-cyan-900 dark:border-cyan-600/30 dark:bg-cyan-950/40 dark:text-cyan-300',
  },
};

const DEFAULT_DETAIL_ACCENT = WUXING_DETAIL_ACCENT.金;

function parseInterpretationBlocks(text: string) {
  return text.split('\n\n').map((block) => {
    const match = block.match(/^【(.+?)】([\s\S]+)$/);
    if (match) {
      return { tag: match[1], body: match[2].trim() };
    }
    return { tag: null, body: block.trim() };
  });
}

function PalaceStatItem({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/65 bg-white/60 px-2.5 py-2',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]',
        'dark:border-white/8 dark:bg-slate-900/45'
      )}
    >
      <div className="text-[10px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className={cn('mt-0.5 truncate text-sm font-bold text-slate-800 dark:text-slate-100', valueClassName)}>
        {value}
      </div>
    </div>
  );
}

const PALACE_MARKER_BADGES: Record<
  string,
  { icon: LucideIcon; className: string }
> = {
  值符落宫: { icon: Star, className: PALACE_MARKER_CLASS.valueSymbol },
  值使落宫: { icon: DoorOpen, className: PALACE_MARKER_CLASS.valueDoor },
  旬空宫位: { icon: CircleDashed, className: PALACE_MARKER_CLASS.void },
  驿马宫位: { icon: Zap, className: PALACE_MARKER_CLASS.horse },
};

function QimenPalaceDetailPanel({
  cell,
  markers,
}: {
  cell: QimenBoardCell;
  markers: string[];
}) {
  const wuxing = resolvePalaceWuxing(cell);
  const accent = WUXING_DETAIL_ACCENT[wuxing] ?? DEFAULT_DETAIL_ACCENT;
  const blocks = parseInterpretationBlocks(buildPalaceInterpretation(cell));

  return (
    <div
      className={cn(
        'relative mb-4 mt-4 overflow-hidden rounded-2xl border px-4 py-3.5 sm:px-5 sm:py-4',
        'bg-gradient-to-br from-white/92 via-white/78 to-indigo-50/25',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_10px_28px_-12px_rgba(59,130,246,0.18)]',
        'backdrop-blur-md supports-[backdrop-filter]:bg-white/72',
        'dark:from-slate-900/92 dark:via-slate-900/78 dark:to-indigo-950/22 dark:shadow-none',
        accent.border
      )}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-white/15"
        aria-hidden
      />
      <span
        className={cn(
          'pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br blur-3xl opacity-50',
          accent.orb
        )}
        aria-hidden
      />

      <div className="relative z-10 flex flex-wrap items-center gap-2">
        <h4 className={cn('text-base font-bold tracking-tight', accent.title)}>{cell.palace}</h4>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
            accent.metaChip
          )}
        >
          <Compass className="h-3 w-3 shrink-0 opacity-80" strokeWidth={2.25} aria-hidden />
          洛书{cell.luoshu} · {cell.direction}
          {cell.wuxing ? ` · 属${cell.wuxing}` : ''}
        </span>
      </div>

      <div className="relative z-10 mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <PalaceStatItem label="八神" value={cell.god} />
        <PalaceStatItem label="九星" value={cell.star} valueClassName={getStarColor(cell.star)} />
        <PalaceStatItem label="八门" value={cell.door} valueClassName={getDoorColor(cell.door)} />
        <PalaceStatItem
          label="天盘干"
          value={cell.heavenStem}
          valueClassName="text-[#C5583A] dark:text-orange-400"
        />
        <PalaceStatItem label="地盘干" value={cell.earthStem} />
        {cell.pattern ? (
          <PalaceStatItem
            label="格局"
            value={cell.pattern}
            valueClassName="text-indigo-700 dark:text-indigo-400"
          />
        ) : null}
      </div>

      {markers.length > 0 && (
        <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
          {markers.map((marker) => {
            const config = PALACE_MARKER_BADGES[marker];
            if (!config) return null;
            const MarkerIcon = config.icon;
            return (
              <span
                key={marker}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                  config.className
                )}
              >
                <MarkerIcon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
                {marker}
              </span>
            );
          })}
        </div>
      )}

      <div className="relative z-10 mt-4 border-t border-slate-200/70 pt-3.5 dark:border-slate-700/60">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-200/60 bg-gradient-to-br from-indigo-50/95 to-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-indigo-500/25 dark:from-indigo-950/55 dark:to-slate-900/65">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" strokeWidth={2.25} />
          </span>
          <span className="text-xs font-bold tracking-wide text-indigo-800 dark:text-indigo-300">
            对你意味着什么
          </span>
        </div>
        <div className="space-y-2">
          {blocks.map((block, index) => (
            <div
              key={`${cell.palace}-${block.tag ?? 'plain'}-${index}`}
              className="rounded-xl border border-slate-200/55 bg-white/50 px-3 py-2.5 dark:border-slate-700/45 dark:bg-slate-900/35"
            >
              {block.tag ? (
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
                  <span>{block.tag.replace(/·.+$/, '')}</span>
                  {block.tag.includes('·') ? (
                    <span className="rounded-md border border-indigo-200/60 bg-indigo-50/80 px-1.5 py-px font-mono text-[10px] font-semibold text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-300">
                      {cell.pattern}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{block.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const LEGEND_NINE_STARS = [
  '天蓬',
  '天任',
  '天冲',
  '天辅',
  '天英',
  '天芮',
  '天柱',
  '天心',
  '天禽',
] as const;

const LEGEND_EIGHT_GODS = [
  '值符',
  '螣蛇',
  '太阴',
  '六合',
  '白虎',
  '玄武',
  '九地',
  '九天',
] as const;

function LegendSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200/70 bg-white/80 dark:border-slate-600/40 dark:bg-slate-800/60">
          <Icon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" strokeWidth={2.25} />
        </span>
        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">{title}</h4>
      </div>
      {children}
    </section>
  );
}

function LegendChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-slate-200/70 bg-white/75 px-2 py-0.5 text-[11px] font-medium leading-none text-slate-700',
        'dark:border-slate-600/45 dark:bg-slate-900/50 dark:text-slate-300',
        className
      )}
    >
      {children}
    </span>
  );
}

function QimenBoardLegend() {
  return (
    <details
      open
      className={cn(
        'group/legend mt-4 overflow-hidden rounded-2xl border',
        'border-white/70 bg-gradient-to-br from-white/75 via-white/55 to-slate-50/30',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_6px_18px_-8px_rgba(59,130,246,0.1)]',
        'backdrop-blur-md dark:border-slate-600/40 dark:from-slate-900/70 dark:via-slate-900/55 dark:to-slate-950/30'
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5',
          'text-sm font-semibold text-slate-700 select-none',
          'transition-colors hover:bg-white/40 dark:text-slate-200 dark:hover:bg-slate-800/40',
          '[&::-webkit-details-marker]:hidden'
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/95 to-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-indigo-500/25 dark:from-indigo-950/50 dark:to-slate-900/65">
            <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" strokeWidth={2.25} />
          </span>
          图例与符号说明
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open/legend:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="border-t border-slate-200/60 px-4 pb-4 pt-3 dark:border-slate-700/50">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
          <div className="space-y-4">
            <LegendSection title="九星" icon={Star}>
              <div className="flex flex-wrap gap-1.5">
                {LEGEND_NINE_STARS.map((name) => (
                  <LegendChip key={name}>{name}</LegendChip>
                ))}
              </div>
            </LegendSection>

            <LegendSection title="八门" icon={DoorOpen}>
              <div className="flex flex-wrap items-center gap-1.5">
                <LegendChip className="border-emerald-200/70 bg-emerald-50/90 font-semibold text-emerald-800 dark:border-emerald-600/35 dark:bg-emerald-950/45 dark:text-emerald-300">
                  开 / 休 / 生（吉）
                </LegendChip>
                <LegendChip className="border-rose-200/70 bg-rose-50/90 font-semibold text-rose-800 dark:border-rose-600/35 dark:bg-rose-950/45 dark:text-rose-300">
                  惊 / 死 / 伤（凶）
                </LegendChip>
                <LegendChip className="font-semibold text-slate-600 dark:text-slate-400">
                  杜 / 景（中）
                </LegendChip>
              </div>
            </LegendSection>

            <LegendSection title="九宫特殊底色" icon={Layers}>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                固定说明本局盘中「带标记宫位」的背景色，不随你点击的宫位变化；当前选中宫仅多一圈细边框高亮。
              </p>
              <ul className="space-y-2">
                {[
                  {
                    swatch:
                      'bg-gradient-to-br from-amber-100 to-amber-50 border-amber-300/80 dark:from-amber-900/50 dark:to-amber-950/30 dark:border-amber-600/40',
                    label: '值符 / 值使落宫',
                    hint: '琥珀色底，值符或值使所在之宫',
                  },
                  {
                    swatch:
                      'bg-gradient-to-br from-rose-100 to-rose-50 border-rose-300/70 dark:from-rose-900/45 dark:to-rose-950/30 dark:border-rose-600/35',
                    label: '旬空宫',
                    hint: '玫瑰色底，该宫旬空',
                  },
                  {
                    swatch:
                      'bg-gradient-to-br from-violet-100 to-violet-50 border-violet-300/70 dark:from-violet-900/45 dark:to-violet-950/30 dark:border-violet-600/35',
                    label: '驿马宫',
                    hint: '紫色底，该宫带驿马',
                  },
                ].map((item) => (
                  <li key={item.label} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[4px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]',
                        item.swatch
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{item.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                        {item.hint}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                无上述标记的宫位，按五行（木绿 / 火橙 / 土黄 / 金灰 / 水青）区分淡色底；中五宫为虚线灰底。
              </p>
            </LegendSection>
          </div>

          <div className="space-y-4">
            <LegendSection title="八神（阳遁顺排）" icon={Sparkles}>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {LEGEND_EIGHT_GODS.map((name, index) => (
                  <React.Fragment key={name}>
                    <LegendChip>{name}</LegendChip>
                    {index < LEGEND_EIGHT_GODS.length - 1 ? (
                      <ArrowRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
            </LegendSection>

            <LegendSection title="天盘 / 地盘" icon={Compass}>
              <div className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-orange-200/70 bg-orange-50/90 px-1 text-[11px] font-bold text-[#C5583A] dark:border-orange-600/35 dark:bg-orange-950/40 dark:text-orange-400">
                    天
                  </span>
                  <span>天盘天干（动态，九星携带）</span>
                </p>
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-slate-200/70 bg-slate-50/90 px-1 text-[11px] font-bold text-slate-700 dark:border-slate-600/40 dark:bg-slate-800/60 dark:text-slate-300">
                    地
                  </span>
                  <span>地盘天干（静态，三奇六仪）</span>
                </p>
              </div>
            </LegendSection>

            <LegendSection title="特殊标记" icon={CircleDot}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { icon: Star, label: '值符', desc: '全局核心宫位', tone: PALACE_MARKER_CLASS.valueSymbol },
                  { icon: DoorOpen, label: '值使', desc: '事态推进通道', tone: PALACE_MARKER_CLASS.valueDoor },
                  { icon: CircleDashed, label: '空亡', desc: '旬空，能量减半', tone: PALACE_MARKER_CLASS.void },
                  { icon: Zap, label: '驿马', desc: '主变动、出行', tone: PALACE_MARKER_CLASS.horse },
                ].map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <li
                      key={item.label}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-2.5 py-2',
                        item.tone
                      )}
                    >
                      <ItemIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-[11px] font-bold leading-tight">{item.label}</span>
                        <span className="block text-[10px] font-medium opacity-80">{item.desc}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                中五宫为九宫中枢，传统寄坤二宫，不单独作为行动方向。
              </p>
            </LegendSection>
          </div>
        </div>
      </div>
    </details>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-700/50', className)}
    />
  );
}

const PALACE_NAME_REGEX = /(巽四宫|离九宫|坤二宫|震三宫|中五宫|兑七宫|艮八宫|坎一宫|乾六宫)/g;
const PALACE_NAME_SET = new Set<string>(palaceOrder);

/** AI 解读区玻璃卡片主题 */
type AiInsightTone = 'indigo' | 'rose' | 'violet' | 'slate' | 'emerald';

const AI_INSIGHT_TONE_MAP: Record<
  AiInsightTone,
  { panel: string; orb: string; iconShell: string; title: string }
> = {
  indigo: {
    panel:
      'border-indigo-200/55 dark:border-indigo-600/28 bg-gradient-to-br from-white/92 via-white/72 to-indigo-50/40 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-indigo-950/28',
    orb: 'from-indigo-500/18 to-violet-400/10',
    iconShell:
      'border-indigo-200/70 bg-gradient-to-br from-indigo-50/95 to-white/85 dark:border-indigo-500/25 dark:from-indigo-950/55 dark:to-slate-900/65',
    title: 'text-indigo-950 dark:text-indigo-50',
  },
  rose: {
    panel:
      'border-rose-200/55 dark:border-rose-600/28 bg-gradient-to-br from-white/92 via-white/72 to-rose-50/38 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-rose-950/26',
    orb: 'from-rose-500/16 to-pink-400/10',
    iconShell:
      'border-rose-200/70 bg-gradient-to-br from-rose-50/95 to-white/85 dark:border-rose-500/25 dark:from-rose-950/55 dark:to-slate-900/65',
    title: 'text-rose-950 dark:text-rose-50',
  },
  violet: {
    panel:
      'border-violet-200/55 dark:border-violet-600/28 bg-gradient-to-br from-white/92 via-white/72 to-violet-50/38 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-violet-950/26',
    orb: 'from-violet-500/18 to-purple-400/10',
    iconShell:
      'border-violet-200/70 bg-gradient-to-br from-violet-50/95 to-white/85 dark:border-violet-500/25 dark:from-violet-950/55 dark:to-slate-900/65',
    title: 'text-violet-950 dark:text-violet-50',
  },
  slate: {
    panel:
      'border-slate-200/60 dark:border-slate-600/30 bg-gradient-to-br from-white/92 via-white/72 to-slate-100/40 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-slate-800/35',
    orb: 'from-slate-400/14 to-indigo-300/8',
    iconShell:
      'border-slate-200/75 bg-gradient-to-br from-slate-50/95 to-white/85 dark:border-slate-500/25 dark:from-slate-800/55 dark:to-slate-900/65',
    title: 'text-slate-900 dark:text-slate-50',
  },
  emerald: {
    panel:
      'border-emerald-200/55 dark:border-emerald-600/28 bg-gradient-to-br from-white/92 via-white/72 to-emerald-50/38 dark:from-slate-900/92 dark:via-slate-900/75 dark:to-emerald-950/26',
    orb: 'from-emerald-500/16 to-teal-400/10',
    iconShell:
      'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 to-white/85 dark:border-emerald-500/25 dark:from-emerald-950/55 dark:to-slate-900/65',
    title: 'text-emerald-950 dark:text-emerald-50',
  },
};

function findPalaceIndex(cells: QimenBoardCell[], palaceName: string) {
  return cells.findIndex((cell) => cell.palace === palaceName);
}

function splitAssessmentParagraphs(text: string) {
  return text
    .split(/(?<=[。；!！?？])\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseTimingGuidance(guidance: string) {
  const basisMatch = guidance.match(/奇门依据[：:]\s*([\s\S]*?)(?=行动建议[：:]|$)/);
  const actionMatch = guidance.match(/行动建议[：:]\s*([\s\S]+)$/);

  if (basisMatch || actionMatch) {
    return {
      basis: basisMatch?.[1]?.trim() || null,
      action: actionMatch?.[1]?.trim() || null,
    };
  }

  return { basis: null, action: null };
}

function getScorePresentation(score: number) {
  if (score >= 70) {
    return {
      bar: 'from-emerald-500 to-teal-400',
      badge: 'border-emerald-200/70 bg-emerald-50/90 text-emerald-800 dark:border-emerald-600/35 dark:bg-emerald-950/45 dark:text-emerald-300',
      hint: '盘面整体偏有利，可积极把握窗口，仍须核对风险项。',
    };
  }
  if (score >= 45) {
    return {
      bar: 'from-violet-600 to-indigo-400',
      badge: 'border-indigo-200/70 bg-indigo-50/90 text-indigo-800 dark:border-indigo-600/35 dark:bg-indigo-950/45 dark:text-indigo-300',
      hint: '利弊并存，宜先验证关键假设，再加大动作幅度。',
    };
  }
  return {
    bar: 'from-amber-500 to-orange-400',
    badge: 'border-amber-200/70 bg-amber-50/90 text-amber-900 dark:border-amber-600/35 dark:bg-amber-950/45 dark:text-amber-300',
    hint: '当前阻力偏多，建议以防守、核实信息为主。',
  };
}

function AiInsightPanel({
  title,
  icon: Icon,
  tone,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  tone: AiInsightTone;
  children: React.ReactNode;
  className?: string;
}) {
  const theme = AI_INSIGHT_TONE_MAP[tone];

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border p-3.5 sm:p-4',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_-6px_rgba(15,23,42,0.06)]',
        'supports-[backdrop-filter]:bg-white/78 dark:supports-[backdrop-filter]:bg-slate-900/72',
        theme.panel,
        className
      )}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-white/15"
        aria-hidden
      />
      <span
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br blur-2xl opacity-40',
          theme.orb
        )}
        aria-hidden
      />
      <div className="relative z-10 flex items-center gap-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
            theme.iconShell
          )}
        >
          <Icon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" strokeWidth={2.25} />
        </span>
        <h4 className={cn('text-xs font-bold tracking-wide', theme.title)}>{title}</h4>
      </div>
      <div className="relative z-10 mt-3">{children}</div>
    </section>
  );
}

function QimenPalaceLinkedText({
  text,
  onPalaceClick,
  className,
}: {
  text: string;
  onPalaceClick: (palaceName: string) => void;
  className?: string;
}) {
  const segments = text.split(PALACE_NAME_REGEX);

  return (
    <span className={cn('leading-relaxed', className)}>
      {segments.map((segment, index) => {
        if (!segment) return null;

        if (PALACE_NAME_SET.has(segment)) {
          return (
            <button
              key={`${segment}-${index}`}
              type="button"
              onClick={() => onPalaceClick(segment)}
              className="mx-0.5 inline-flex items-center rounded-md border border-indigo-200/70 bg-indigo-50/90 px-1 py-px text-[13px] font-semibold text-indigo-800 underline-offset-2 transition-colors hover:border-indigo-300 hover:bg-indigo-100/90 hover:underline dark:border-indigo-500/35 dark:bg-indigo-950/50 dark:text-indigo-300"
            >
              {segment}
            </button>
          );
        }

        return <React.Fragment key={`text-${index}`}>{segment}</React.Fragment>;
      })}
    </span>
  );
}

function QimenTimingWindowCard({
  period,
  guidance,
  onPalaceClick,
}: {
  period: string;
  guidance: string;
  onPalaceClick: (palaceName: string) => void;
}) {
  const parsed = parseTimingGuidance(guidance);

  return (
    <div className="relative overflow-hidden rounded-xl border border-violet-200/55 bg-white/55 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-violet-600/25 dark:bg-slate-900/40">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
          ·
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-violet-900 dark:text-violet-200">{period}</div>
          {parsed.basis || parsed.action ? (
            <div className="mt-2 space-y-2 text-xs">
              {parsed.basis ? (
                <div>
                  <span className="font-semibold text-violet-700/90 dark:text-violet-300/90">
                    奇门依据
                  </span>
                  <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                    <QimenPalaceLinkedText text={parsed.basis} onPalaceClick={onPalaceClick} />
                  </p>
                </div>
              ) : null}
              {parsed.action ? (
                <div>
                  <span className="font-semibold text-violet-700/90 dark:text-violet-300/90">
                    行动建议
                  </span>
                  <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                    <QimenPalaceLinkedText text={parsed.action} onPalaceClick={onPalaceClick} />
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              <QimenPalaceLinkedText text={guidance} onPalaceClick={onPalaceClick} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function QimenDecisionScoreCard({ score }: { score: number | undefined }) {
  const presentation = typeof score === 'number' ? getScorePresentation(score) : null;

  return (
    <AiInsightPanel title="决策胜算指数" icon={Gauge} tone="indigo" className="mt-4">
      {typeof score === 'number' && presentation ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <span
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                presentation.badge
              )}
            >
              {score >= 70 ? '偏有利' : score >= 45 ? '利弊并存' : '宜谨慎'}
            </span>
            <span className="text-3xl font-black tabular-nums text-indigo-700 dark:text-indigo-300">
              {score}%
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-indigo-100/90 dark:bg-indigo-950/50">
            <div
              className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', presentation.bar)}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            {presentation.hint}
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-20" />
          <SkeletonBlock className="h-2 w-full" />
        </div>
      )}
    </AiInsightPanel>
  );
}

function statusLabel(
  baseStatus: QimenBaseStatus,
  sectionStatuses: Record<QimenAsyncSectionKey, QimenSectionStatus>
) {
  if (baseStatus === 'loading') {
    return '正在生成基础盘面，通常需要 10-30 秒';
  }

  if (baseStatus === 'failed') {
    return '基础盘面生成失败，可稍后重试';
  }

  const statuses = Object.values(sectionStatuses);

  if (statuses.every((status) => status === 'completed')) {
    return '各区块结果已全部定稿';
  }

  if (statuses.some((status) => status === 'loading')) {
    return '正在并行整理各区块最终结果';
  }

  if (statuses.some((status) => status === 'failed')) {
    return '部分区块生成失败，可稍后重试';
  }

  return '基础盘面已就绪，分块结果待返回';
}

/** 标题含义解释 — 帮助新手理解"小滿 上元 陽遁5局"的含义 */
function ChartTitleExplanation({
  chartTitle,
  meta,
}: {
  chartTitle: string;
  meta: { dun: string; ju: string };
}) {
  // 标题格式固定为 "${节气} ${三元} ${阴阳}遁${局数}局"，参考 qimen-chart.ts
  const parts = chartTitle.split(' ');
  const jieQi = parts[0] || '';
  const yuan = parts[1] || '';
  const isYang = meta.dun === '陽遁';

  return (
    <div className="space-y-2.5 text-sm">
      <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100">标题含义</h5>
      <ul className="space-y-2">
        <li className="flex gap-2">
          <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold leading-snug text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            节气
          </span>
          <div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{jieQi}</span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              24节气之一，决定当前时空属于阳遁还是阴遁
            </p>
          </div>
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold leading-snug text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            三元
          </span>
          <div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{yuan}</span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              每个节气分上元、中元、下元，各管 5 天，决定用第几局
            </p>
          </div>
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold leading-snug text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
            局数
          </span>
          <div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {meta.dun}
              {meta.ju}
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isYang
                ? '冬至到夏至为阳遁（阳气上升），顺布六仪，共 9 局'
                : '夏至到冬至为阴遁（阴气下沉），逆布六仪，共 9 局'}
            </p>
          </div>
        </li>
      </ul>
      <div className="border-t border-slate-100 pt-2 dark:border-slate-700">
        <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          标题说明在<strong className="text-slate-600 dark:text-slate-400">哪个时间窗口</strong>用
          <strong className="text-slate-600 dark:text-slate-400">哪种能量格局</strong>来推演。
        </p>
      </div>
    </div>
  );
}

export function QimenAnalysisResult({
  analysisId,
  baseResult,
  baseStatus,
  baseError,
  sections,
  sectionStatuses,
  sectionErrors,
  error,
  onBackToForm,
  onRetry,
}: QimenAnalysisResultProps) {
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const skipDetailScrollRef = useRef(true);
  const boardFingerprint = baseResult
    ? `${analysisId ?? 'local'}:${baseResult.chartTitle}`
    : null;

  // 新盘局就绪时默认选中值符落宫（无则值使），避免首屏下方详情区空白
  useEffect(() => {
    if (!baseResult) {
      setActiveTooltipIndex(null);
      return;
    }
    skipDetailScrollRef.current = true;
    const cells = buildBoardCells(baseResult);
    setActiveTooltipIndex(pickDefaultPalaceIndex(cells));
  }, [boardFingerprint, baseResult]);

  useEffect(() => {
    if (activeTooltipIndex == null) return;
    if (skipDetailScrollRef.current) {
      skipDetailScrollRef.current = false;
      return;
    }
    const raf = requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTooltipIndex]);

  const hasPartialContent =
    Boolean(baseResult) ||
    Boolean(sections.chartSummary) ||
    Boolean(sections.strategyOverview?.overallAssessment) ||
    Boolean(sections.strategyOverview?.riskAlerts?.length) ||
    Boolean(sections.strategyOverview?.actionSuggestions?.length) ||
    Boolean(sections.timingWindows?.length);
  const progressLabel = statusLabel(baseStatus, sectionStatuses);

  if ((baseStatus === 'failed' || error) && !baseResult && !hasPartialContent) {
    return (
      <DestinyResultHeader
        title="奇门演化分析"
        moduleBadge="分析失败"
        tone="indigo"
        subtitle={baseError ?? error}
        onRecalculate={onBackToForm}
        leadingActions={
          <Button type="button" variant="outline" className={destinySecondaryBtnClass} onClick={onRetry}>
            重试分析
          </Button>
        }
      />
    );
  }

  if (!baseResult && !hasPartialContent) {
    return (
      <DestinyResultHeader
        title="奇门演化分析"
        moduleBadge="等待起局"
        tone="indigo"
        subtitle="请先填写起局信息并发起分析"
        onRecalculate={onBackToForm}
        recalculateLabel="返回填写"
      />
    );
  }

  const boardCells = baseResult ? buildBoardCells(baseResult) : [];
  const activeCell = activeTooltipIndex != null ? boardCells[activeTooltipIndex] : null;
  const activeCellMarkers = activeCell ? palaceMarkerList(activeCell) : [];
  const focusPalaceByName = (palaceName: string) => {
    const index = findPalaceIndex(boardCells, palaceName);
    if (index < 0) return;
    skipDetailScrollRef.current = false;
    setActiveTooltipIndex(index);
  };
  const meta = baseResult?.chartMeta;
  const summary = sections.chartSummary ?? null;
  const overallAssessment = sections.strategyOverview?.overallAssessment ?? null;
  const riskAlerts = sections.strategyOverview?.riskAlerts ?? [];
  const actionSuggestions = sections.strategyOverview?.actionSuggestions ?? [];
  const timingWindows = sections.timingWindows ?? [];
  const assessmentParagraphs = overallAssessment ? splitAssessmentParagraphs(overallAssessment) : [];
  const summaryParagraphs = summary ? splitAssessmentParagraphs(summary) : [];
  const allCompleted = Object.values(sectionStatuses).every((status) => status === 'completed');
  const anySectionFailed = Object.values(sectionStatuses).some((status) => status === 'failed');
  const sectionErrorEntries = Object.entries(sectionErrors).filter(([, v]) => Boolean(v));

  const chartTitleHelp =
    meta && baseResult?.chartTitle ? (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-indigo-600 dark:hover:bg-indigo-950 dark:hover:text-indigo-400"
            aria-label="局名含义说明"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="bottom" className="w-72 sm:w-80">
          <ChartTitleExplanation chartTitle={baseResult.chartTitle} meta={meta} />
        </PopoverContent>
      </Popover>
    ) : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <DestinyResultHeader
        title={baseResult?.chartTitle ?? '奇门遁甲排盘生成中'}
        moduleBadge="奇门演化分析"
        tone="indigo"
        subtitle={progressLabel}
        titleTrailing={chartTitleHelp}
        onRecalculate={onBackToForm}
        leadingActions={
          <Button type="button" variant="outline" className={destinySecondaryBtnClass} onClick={onRetry}>
            重新演化分析
          </Button>
        }
        metaChips={
          <>
            {meta ? (
              <span className={metaBadgeClass}>
                {meta.dun} · {meta.ju}
              </span>
            ) : (
              <span className="rounded-full border border-slate-200/60 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-900/60">
                盘局整理中
              </span>
            )}
            <span className={progressBadgeClass}>{allCompleted ? '2/2' : '生成中'}</span>
            {analysisId ? (
              <span className="rounded-full border border-slate-200/50 bg-white/75 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-800/60 dark:text-slate-400">
                ID: {analysisId.slice(0, 8)}
              </span>
            ) : null}
            {anySectionFailed ? (
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                部分区块失败
              </span>
            ) : null}
            {allCompleted ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                全部分块已锁定
              </span>
            ) : null}
          </>
        }
      />

      <div className={g3ShellClass}>
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300">
            {baseError ?? error}
          </div>
        )}

        {sectionErrorEntries.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
            {sectionErrorEntries
              .map(([key, value]) => `${key}：${value}`)
              .join('；')}
          </div>
        ) : null}

        {/* 盘局基本信息 — 玻璃拟态信息卡 */}
        {meta && (
          <div className={cn(innerPanelClass, 'mt-5')}>
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-80 dark:via-white/15"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-violet-500/12 to-indigo-400/8 blur-3xl"
              aria-hidden
            />
            <div className="relative z-10">
              <h4 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-wide text-slate-700 dark:text-slate-200">
                <Compass className="h-4 w-4 text-violet-600 dark:text-violet-400" strokeWidth={2.25} />
                盘局基本信息
              </h4>
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:auto-rows-fr">
                <MetaInfoCard
                  toneKey="time"
                  icon={Clock3}
                  title={
                    meta.trueSolarTime
                      ? `真太阳时 ${meta.trueSolarTime}`
                      : '北京时间（未校准真太阳时）'
                  }
                  hint={
                    meta.trueSolarTime
                      ? '已根据所选城市经度校准为当地真太阳时'
                      : '建议选择具体城市以校准真太阳时，时辰更准确'
                  }
                />
                <MetaInfoCard
                  toneKey="layout"
                  icon={Layers}
                  title={`旬首 ${meta.xunshou}`}
                  hint={`${meta.dun}${meta.ju} · 当前旬起始甲日，关联空亡与驿马`}
                />
                <MetaInfoCard
                  toneKey="stems"
                  icon={UserRound}
                  title={
                    <>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{meta.riGan}</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300"> = 你（求测人）</span>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">{meta.shiGan}</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300"> = 所问之事</span>
                    </>
                  }
                  hint="日干代表你自身的状态 | 时干代表所问事情的状态"
                />
                <MetaInfoCard
                  toneKey="leaders"
                  icon={Star}
                  title={`${meta.valueSymbol} · ${meta.valueDoor}`}
                  hint="值符主导全局星曜 · 值使决定事态推进门户"
                />
                <MetaInfoCard
                  toneKey="void"
                  icon={CircleDashed}
                  title={meta.jiaziXunkong}
                  hint="空亡宫位能量减半，事情虚而不实，需等待出空才能推进"
                />
                {meta.horsePosition ? (
                  <MetaInfoCard
                    toneKey="horse"
                    icon={Zap}
                    title={meta.horsePosition}
                    hint="马星主变动、奔波、出行，该宫位能量活跃易动"
                  />
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_0.95fr]">
          <div
            className={cn(
              'relative z-30 overflow-hidden rounded-[24px] border border-white/70 p-4 md:p-5',
              'bg-gradient-to-br from-white/55 via-white/40 to-indigo-50/20',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_20px_-10px_rgba(59,130,246,0.08)]',
              'backdrop-blur-md dark:border-slate-700/50 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-indigo-950/15 dark:shadow-none'
            )}
          >
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/15"
              aria-hidden
            />
            <div className="relative z-10 mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold tracking-wide text-[#1D2B70] dark:text-slate-200">
                洛书九宫盘
              </h3>
              <span className="shrink-0 rounded-full border border-indigo-200/60 bg-indigo-50/90 px-3 py-1 text-xs font-semibold text-indigo-600 backdrop-blur-sm dark:border-indigo-500/25 dark:bg-indigo-950/45 dark:text-indigo-300">
                {baseResult ? '默认值符落宫 · 点击切换' : '完整盘局完成后展示'}
              </span>
            </div>

            {baseResult ? (
              <>
                <div className="relative z-40 grid grid-cols-3 gap-2.5 overflow-visible sm:gap-3">
                  {boardCells.map((cell, index) => (
                    <QimenPalaceCell
                      key={`${cell.palace}-${index}`}
                      cell={cell}
                      isActive={activeTooltipIndex === index}
                      onToggle={() => {
                        skipDetailScrollRef.current = false;
                        setActiveTooltipIndex((prev) => (prev === index ? null : index));
                      }}
                    />
                  ))}
                </div>

                {activeCell && (
                  <div ref={detailRef}>
                    <QimenPalaceDetailPanel cell={activeCell} markers={activeCellMarkers} />
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div
                    key={`board-skeleton-${index}`}
                    className="min-h-[110px] rounded-2xl border border-slate-200/75 bg-gradient-to-br from-white/90 to-slate-50/50 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] sm:min-h-[140px] sm:p-3 dark:border-slate-600/40 dark:from-slate-900/80 dark:to-slate-800/50"
                  >
                    <SkeletonBlock className="h-3 w-12 sm:w-16" />
                    <SkeletonBlock className="mt-3 sm:mt-6 h-8 sm:h-12 w-14 sm:w-16" />
                    <SkeletonBlock className="mt-1 sm:mt-2 h-5 sm:h-8 w-10 sm:w-14" />
                    <div className="mt-3 sm:mt-6 flex justify-between">
                      <SkeletonBlock className="h-4 w-4 sm:h-6 sm:w-6" />
                      <SkeletonBlock className="h-4 w-4 sm:h-6 sm:w-6" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <QimenBoardLegend />

          </div>

          <aside className="relative z-10 overflow-hidden rounded-[24px] border border-white/75 bg-gradient-to-br from-white/55 via-white/45 to-indigo-50/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_24px_-10px_rgba(59,130,246,0.1)] backdrop-blur-xl md:p-5 dark:border-slate-700/50 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-indigo-950/15">
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/15"
              aria-hidden
            />
            <div className="relative z-10 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/95 to-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-indigo-500/25 dark:from-indigo-950/50 dark:to-slate-900/65">
                <CircleDot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-black tracking-tight text-[#121F5A] sm:text-xl dark:text-slate-100">
                  AI 战术决策分析
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  点击文中宫位名可定位洛书九宫
                </p>
              </div>
            </div>

            <QimenDecisionScoreCard score={baseResult?.score} />

            <AiInsightPanel title="综合格局评估" icon={Sparkles} tone="indigo" className="mt-3">
              {overallAssessment ? (
                <div className="space-y-2">
                  {(assessmentParagraphs.length > 0 ? assessmentParagraphs : [overallAssessment]).map(
                    (paragraph, idx) => (
                      <p
                        key={`assessment-${idx}`}
                        className="rounded-xl border border-white/60 bg-white/50 px-2.5 py-2 text-sm text-slate-700 dark:border-white/8 dark:bg-slate-900/35 dark:text-slate-300"
                      >
                        <QimenPalaceLinkedText
                          text={paragraph}
                          onPalaceClick={focusPalaceByName}
                        />
                      </p>
                    )
                  )}
                </div>
              ) : sectionStatuses.strategyOverview === 'failed' ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">
                  该区块生成失败，请重新分析后再试。
                </p>
              ) : (
                <div className="space-y-2">
                  <SkeletonBlock className="h-4 w-full" />
                  <SkeletonBlock className="h-4 w-5/6" />
                  <SkeletonBlock className="h-4 w-4/6" />
                </div>
              )}
            </AiInsightPanel>

            <AiInsightPanel title="风险预警" icon={ShieldAlert} tone="rose" className="mt-3">
              {riskAlerts.length > 0 ? (
                <ul className="space-y-2">
                  {riskAlerts.map((risk, idx) => (
                    <li
                      key={`risk-${idx}`}
                      className="relative overflow-hidden rounded-xl border border-rose-200/55 bg-white/55 py-2 pl-3 pr-2.5 text-sm text-rose-900 dark:border-rose-600/25 dark:bg-slate-900/40 dark:text-rose-200"
                    >
                      <span
                        className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-rose-400 dark:bg-rose-500"
                        aria-hidden
                      />
                      <QimenPalaceLinkedText
                        text={risk}
                        onPalaceClick={focusPalaceByName}
                        className="text-sm"
                      />
                    </li>
                  ))}
                </ul>
              ) : sectionStatuses.strategyOverview === 'failed' ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">风险预警暂未生成成功。</p>
              ) : (
                <div className="space-y-2">
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-full" />
                </div>
              )}
            </AiInsightPanel>

            <AiInsightPanel title="行动建议" icon={ListChecks} tone="emerald" className="mt-3">
              {actionSuggestions.length > 0 ? (
                <ol className="space-y-2">
                  {actionSuggestions.map((advice, idx) => (
                    <li
                      key={`advice-${idx}`}
                      className="flex gap-2.5 rounded-xl border border-emerald-200/50 bg-white/55 px-2.5 py-2 dark:border-emerald-700/25 dark:bg-slate-900/40"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-200/85 text-[11px] font-bold text-emerald-900 dark:bg-emerald-800/55 dark:text-emerald-100">
                        {idx + 1}
                      </span>
                      <span className="min-w-0 text-sm text-slate-700 dark:text-slate-300">
                        <QimenPalaceLinkedText
                          text={advice}
                          onPalaceClick={focusPalaceByName}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
              ) : sectionStatuses.strategyOverview === 'failed' ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">行动建议暂未生成成功。</p>
              ) : (
                <div className="space-y-2">
                  <SkeletonBlock className="h-12 w-full" />
                  <SkeletonBlock className="h-12 w-full" />
                </div>
              )}
            </AiInsightPanel>
          </aside>
        </div>

        <AiInsightPanel title="关键时间窗口" icon={Clock3} tone="violet" className="mt-4">
          {timingWindows.length > 0 ? (
            <div className="space-y-2">
              {timingWindows.map((item, index) => (
                <QimenTimingWindowCard
                  key={`window-${index}`}
                  period={item.period}
                  guidance={item.guidance}
                  onPalaceClick={focusPalaceByName}
                />
              ))}
            </div>
          ) : sectionStatuses.timingWindows === 'failed' ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">关键时间窗口暂未生成成功。</p>
          ) : (
            <div className="space-y-2">
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-5/6" />
            </div>
          )}
        </AiInsightPanel>

        <AiInsightPanel title="盘局摘要" icon={FileText} tone="slate" className="mt-4">
          {summary ? (
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                整局格局与用神关系的简要归纳，可与上方「综合格局评估」对照阅读。
              </p>
              {(summaryParagraphs.length > 0 ? summaryParagraphs : [summary]).map((paragraph, idx) => (
                <p
                  key={`summary-${idx}`}
                  className="rounded-xl border border-slate-200/55 bg-white/50 px-2.5 py-2 text-sm text-slate-700 dark:border-slate-700/45 dark:bg-slate-900/35 dark:text-slate-300"
                >
                  <QimenPalaceLinkedText text={paragraph} onPalaceClick={focusPalaceByName} />
                </p>
              ))}
            </div>
          ) : sectionStatuses.chartSummary === 'failed' ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">盘局摘要暂未生成成功。</p>
          ) : (
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-11/12" />
            </div>
          )}
        </AiInsightPanel>

        <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/25">
          <p className="flex items-start gap-2 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              重要声明：
              {baseResult?.disclaimer ??
                '本推演仅供传统民俗文化研究和决策参考，不构成任何职业、投资、法律等决策建议。所有决策请结合自身实际情况理性判断。'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
