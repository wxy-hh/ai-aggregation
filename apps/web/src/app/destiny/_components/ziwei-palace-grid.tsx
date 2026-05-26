'use client';

import React, { useMemo } from 'react';
import type { ZiweiChartData, ZiweiChartPalace } from '@/app/destiny/_components/types';
import { GlossaryTooltip, hasGlossary } from './ziwei-glossary';
import { useIsMobile } from '@/hooks/use-is-mobile';

// ─── 常量 ───

// 注意：iztro 返回的宫位名中，除"命宫"外其余不带"宫"后缀
const PALACE_ORDER = [
  '父母', '福德', '田宅', '官禄',
  '命宫', '兄弟', '仆役', '夫妻',
  '迁移', '子女', '财帛', '疾厄',
];

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

const PALACE_TONES = [
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#D7C07B]/35 bg-[#FFF9EA]/88',
  'border-[#B8C4D6]/35 bg-[#F3F7FF]/88',
  'border-[#E3A59D]/35 bg-[#FFF2F0]/88',
  'border-[#A7B57B]/35 bg-[#F7FAEE]/88',
  'border-[#D7C07B]/30 bg-[#FFF8E6]/85',
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#C6B6E8]/35 bg-[#F4F0FF]/88',
  'border-[#B8C4D6]/35 bg-[#F3F7FF]/88',
  'border-[#A7B57B]/30 bg-[#F7FAEE]/85',
  'border-[#95A8C6]/35 bg-[#EEF3FF]/88',
  'border-[#C0C9D8]/35 bg-[#F5F7FB]/88',
];

const LABEL_TONES = [
  'text-[#5E769E]', 'text-[#A7862B]', 'text-[#657A96]', 'text-[#B45A4C]',
  'text-[#6A7F3F]', 'text-[#A7862B]', 'text-[#5E769E]', 'text-[#6956A7]',
  'text-[#5A7391]', 'text-[#6A7F3F]', 'text-[#5E769E]', 'text-[#607089]',
];

const STAR_COLORS: Array<{ names: string[]; className: string }> = [
  { names: ['紫微'], className: 'text-[#5A4BEA]' },
  { names: ['天府'], className: 'text-[#2D7D58]' },
  { names: ['武曲'], className: 'text-[#2F5FAE]' },
  { names: ['太阳'], className: 'text-[#C77A1A]' },
  { names: ['太阴'], className: 'text-[#6B5CA5]' },
  { names: ['天机'], className: 'text-[#1F8A84]' },
  { names: ['天同'], className: 'text-[#329D7C]' },
  { names: ['廉贞'], className: 'text-[#B04A6B]' },
  { names: ['贪狼'], className: 'text-[#8B5E1A]' },
  { names: ['巨门'], className: 'text-[#4E5E7A]' },
  { names: ['天相'], className: 'text-[#3A6AA6]' },
  { names: ['天梁'], className: 'text-[#6D8A2E]' },
  { names: ['七杀'], className: 'text-[#A23A3A]' },
  { names: ['破军'], className: 'text-[#7E4AA1]' },
];

// 宫位含义速查
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

function getStarColor(name: string): string {
  for (const item of STAR_COLORS) {
    if (item.names.some((n) => name.includes(n))) return item.className;
  }
  return 'text-slate-700 dark:text-slate-300';
}

function getBrightnessClass(brightness: string): string {
  switch (brightness) {
    case '庙':
    case '旺':
      return 'text-emerald-600 dark:text-emerald-400';
    case '得':
      return 'text-blue-600 dark:text-blue-400';
    case '平':
    case '利':
      return 'text-slate-500 dark:text-slate-400';
    case '陷':
    case '不':
      return 'text-rose-500 dark:text-rose-400';
    default:
      return '';
  }
}

// ─── 组件 ───

type Props = {
  chart: ZiweiChartData;
  activePalaceLabel: string;
  onPalaceSelect: (label: string) => void;
};

export function ZiweiPalaceGrid({ chart, activePalaceLabel, onPalaceSelect }: Props) {
  const isMobile = useIsMobile();

  const orderedPalaces = useMemo(() => {
    const map = new Map(chart.palaces.map((p) => [p.name, p]));
    return PALACE_ORDER.map((name) => map.get(name)).filter(Boolean) as ZiweiChartPalace[];
  }, [chart.palaces]);

  return (
    <div className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 p-4 sm:p-5 backdrop-blur-xl shadow-lg">
      <div className="grid grid-cols-2 auto-rows-[minmax(132px,auto)] gap-3 sm:grid-cols-4 sm:grid-rows-4 sm:auto-rows-auto sm:aspect-square">
        {orderedPalaces.map((palace, index) => {
          const isActive = palace.name === activePalaceLabel;
          const toneClass = PALACE_TONES[index % PALACE_TONES.length];
          const labelToneClass = LABEL_TONES[index % LABEL_TONES.length];

          const mainStars = palace.majorStars.filter(
            (s) => s.type === 'major' || s.type === 'lucun' || s.type === 'tianma'
          );
          const hasMainStar = mainStars.length > 0;
          const dominantStar = mainStars[0];
          const starColorClass = dominantStar ? getStarColor(dominantStar.name) : 'text-slate-400';
          const oppositePalace = getOppositePalace(palace.name, orderedPalaces);

          return (
            <button
              key={palace.name}
              type="button"
              onClick={() => onPalaceSelect(palace.name)}
              className={[
                !isMobile && GRID_AREAS[index],
                'min-h-[132px] rounded-2xl p-3 flex flex-col justify-between text-left transition border shadow-[0_6px_18px_-14px_rgba(30,41,59,0.45),inset_0_1px_0_rgba(255,255,255,0.75)] sm:min-h-0 sm:p-3.5',
                toneClass,
                isActive
                  ? 'ring-2 ring-[#4969E9]/35 border-[#4969E9]/45 shadow-[0_10px_26px_-14px_rgba(59,91,246,0.46),inset_0_1px_0_rgba(255,255,255,0.84)]'
                  : 'hover:border-[#4969E9]/35 hover:shadow-[0_12px_30px_-18px_rgba(59,91,246,0.35),inset_0_1px_0_rgba(255,255,255,0.84)]',
              ].join(' ')}
            >
              {/* 顶部：宫位名 + 标签 */}
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs font-extrabold ${labelToneClass}`}>
                    <GlossaryTooltip term={palace.name}>{palace.name}</GlossaryTooltip>
                  </span>
                  {palace.isBodyPalace && (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md px-1 py-px">
                      <GlossaryTooltip term="身宫">身宫</GlossaryTooltip>
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {PALACE_MEANING[palace.name] ?? ''}
                </div>

                {/* 主星（大字） */}
                <div className={`mt-1 text-xl sm:text-2xl leading-tight font-black tracking-tight break-words ${starColorClass}`}>
                  {hasMainStar ? (
                    dominantStar.name
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600 italic text-base font-medium">
                      {oppositePalace
                        ? `借${oppositePalace.name}`
                        : '空宫'}
                    </span>
                  )}
                </div>

                {/* 亮度标注 */}
                {dominantStar?.brightness && (
                  <span className={`text-[10px] font-bold ml-1 ${getBrightnessClass(dominantStar.brightness)}`}>
                    [{dominantStar.brightness}]
                  </span>
                )}

                {/* 其他主星 + 辅星（小字） */}
                {mainStars.length > 1 && (
                  <div className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400 break-words line-clamp-2">
                    {mainStars.slice(1).map((s) => (
                      <span key={s.name}>
                        {s.name}
                        {s.brightness && (
                          <span className={`text-[9px] ${getBrightnessClass(s.brightness)}`}>[{s.brightness}]</span>
                        )}
                        {' '}
                      </span>
                    ))}
                  </div>
                )}

                {/* 辅星/煞星（更小字） */}
                {palace.minorStars.length > 0 && (
                  <div className="mt-1 text-[10px] leading-snug text-slate-400 dark:text-slate-500 break-words">
                    {palace.minorStars.slice(0, 3).map((s) => s.name).join(' · ')}
                  </div>
                )}
              </div>

              {/* 底部：地支 + 天干 + 大限 */}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {palace.heavenlyStem}{palace.earthlyBranch}
                </span>
                <span className="text-[10px] text-slate-300 dark:text-slate-600">
                  {palace.stageRange[0]}-{palace.stageRange[1]}岁
                </span>
              </div>
            </button>
          );
        })}

        {/* 中央命盘面板 */}
        <div className="order-first col-span-2 rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl p-4 flex flex-col items-center justify-center text-center shadow-lg sm:order-none sm:col-start-2 sm:col-span-2 sm:row-start-2 sm:row-span-2">
          <div className="text-[2rem] leading-tight font-black text-slate-900 dark:text-white sm:text-[36px] sm:leading-none">
            <GlossaryTooltip term="命宫">紫微命盘</GlossaryTooltip>
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {chart.yearStem}{chart.yearBranch}年 · {chart.fiveElementsClass}
          </div>

          <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:items-center">
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-3 py-2 sm:px-4">
              <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                <GlossaryTooltip term="命主">命主</GlossaryTooltip>
              </div>
              <div className="mt-1 text-lg font-black text-blue-900 dark:text-blue-100 sm:text-xl sm:mt-0.5">
                <GlossaryTooltip term={chart.soul}>{chart.soul}</GlossaryTooltip>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2 sm:px-4">
              <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                <GlossaryTooltip term="身主">身主</GlossaryTooltip>
              </div>
              <div className="mt-1 text-lg font-black text-amber-900 dark:text-amber-100 sm:text-xl sm:mt-0.5">
                <GlossaryTooltip term={chart.body}>{chart.body}</GlossaryTooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 获取对宫（用于空宫标注） */
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
