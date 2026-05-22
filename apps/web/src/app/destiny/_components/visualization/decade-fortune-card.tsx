'use client';

import React, { useMemo, useState, type CSSProperties } from 'react';
import dayunIcon from '@/assets/image/xingge.svg';
import { cn } from '@/lib/utils';
import type { PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ---- 八字原理：天干十神计算 ----

const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);

const STEM_ELEMENT: Record<string, string> = {
  甲: 'wood', 乙: 'wood', 丙: 'fire', 丁: 'fire', 戊: 'earth',
  己: 'earth', 庚: 'metal', 辛: 'metal', 壬: 'water', 癸: 'water',
};

const ELEMENT_PRODUCES: Record<string, string> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
};

const ELEMENT_CONTROLS: Record<string, string> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
};

/** 天干十神关系 */
function computeStemTenGod(
  dayStem: string,
  otherStem: string,
): { name: string; type: 'friend' | 'output' | 'wealth' | 'power' | 'resource' } | null {
  if (!dayStem || !otherStem) return null;
  const dmEl = STEM_ELEMENT[dayStem];
  const otEl = STEM_ELEMENT[otherStem];
  const dmYang = YANG_STEMS.has(dayStem);
  const otYang = YANG_STEMS.has(otherStem);
  const sameYinYang = dmYang === otYang;

  if (dmEl === otEl) {
    return { name: sameYinYang ? '比肩' : '劫财', type: 'friend' };
  }
  if (ELEMENT_PRODUCES[dmEl] === otEl) {
    return { name: sameYinYang ? '食神' : '伤官', type: 'output' };
  }
  if (ELEMENT_PRODUCES[otEl] === dmEl) {
    return { name: sameYinYang ? '偏印' : '正印', type: 'resource' };
  }
  if (ELEMENT_CONTROLS[dmEl] === otEl) {
    return { name: sameYinYang ? '偏财' : '正财', type: 'wealth' };
  }
  if (ELEMENT_CONTROLS[otEl] === dmEl) {
    return { name: sameYinYang ? '七杀' : '正官', type: 'power' };
  }
  return null;
}

const TEN_GOD_DESCRIPTIONS: Record<string, string> = {
  '比肩': '大运天干与日主同五行同阴阳，增强自我意识与独立行动力，适合主动争取、拓展人际',
  '劫财': '大运天干与日主同五行异阴阳，社交与竞争感上升，适合合作但也需注意利益分配',
  '食神': '大运天干为日主所生，创造力与输出欲增强，适合表达、创作、享受生活',
  '伤官': '大运天干为日主所生，打破常规的冲动增强，适合创新突破，但需注意言行分寸',
  '正财': '大运天干为日主所克，稳定收入与资源积累期，适合踏实经营、长期投入',
  '偏财': '大运天干为日主所克，机会型收入与风险偏好上升，适合灵活应变但不贪快',
  '正官': '大运天干克日主，规则意识与责任压力增大，适合建立秩序、争取认可',
  '七杀': '大运天干克日主，挑战与突破压力集中出现，适合迎难而上、锻炼抗压能力',
  '正印': '大运天干生日主，学习与贵人运增强，适合吸收知识、沉淀经验',
  '偏印': '大运天干生日主，独立思考与钻研倾向增强，适合深入研究、自我提升',
};

// ---- 组件 ----

export function DecadeFortuneCard({
  baziBasis,
  className,
}: {
  baziBasis: NonNullable<PartialDestinyReport['baziBasis']>;
  className?: string;
}) {
  const decadeFortunes = baziBasis.decadeFortunes;
  const childLimit = baziBasis.childLimit;
  const dayStem = baziBasis.dayMaster.stem;
  const yearStem = baziBasis.pillars[0]?.stem ?? '';
  const isMale = baziBasis.profile.genderLabel?.includes('乾造') ?? false;
  const [showIntro, setShowIntro] = useState(false);

  const activeIndex = decadeFortunes.findIndex((d) => d.active);
  const activeDecade = activeIndex >= 0 ? decadeFortunes[activeIndex] : null;

  // 起运方向的具体推导
  const yearYang = YANG_STEMS.has(yearStem);
  const directionReason = useMemo(() => {
    if (childLimit.forward) {
      return yearYang
        ? `年干${yearStem}为阳，命主为男命（乾造），阳年男命顺排大运`
        : `年干${yearStem}为阴，命主为女命（坤造），阴年女命顺排大运`;
    }
    return yearYang
      ? `年干${yearStem}为阳，命主为女命（坤造），阳年女命逆排大运`
      : `年干${yearStem}为阴，命主为男命（乾造），阴年男命逆排大运`;
  }, [childLimit.forward, yearStem, yearYang, isMale]);

  // 起运年龄说明
  const startAgeReason = useMemo(() => {
    const termName = childLimit.forward
      ? baziBasis.solarTerms.next.name
      : baziBasis.solarTerms.previous.name;
    const termTime = childLimit.forward
      ? baziBasis.solarTerms.next.solarTime.text
      : baziBasis.solarTerms.previous.solarTime.text;
    const direction = childLimit.forward ? '下一个' : '上一个';
    return `从出生时刻到${direction}节气「${termName}」（${termTime}）的时长为 ${childLimit.duration.years}年${childLimit.duration.months}月${childLimit.duration.days}天，折算后命主 ${childLimit.startAge} 岁起运`;
  }, [childLimit, baziBasis.solarTerms]);

  // 每步大运的十神关系
  const decadeTenGods = useMemo(
    () => decadeFortunes.map((d) => computeStemTenGod(dayStem, d.name[0])),
    [decadeFortunes, dayStem],
  );

  return (
    <GlassCard className={cn('p-3 sm:p-4', className)}>
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 sm:h-6 sm:w-6 shrink-0 items-center justify-center rounded-md bg-[#F3F6FF]">
            <AssetToneIcon className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-[#5D7CFA]" src={dayunIcon} />
          </div>
          <span className="text-sm font-bold text-slate-700 truncate">十年大运</span>
          {activeDecade && (
            <span className="shrink-0 rounded-full bg-[#5D7CFA]/10 px-2 py-0.5 text-[11px] font-semibold text-[#5D7CFA]">
              {activeDecade.name} · {activeDecade.startAge}-{activeDecade.endAge} 岁
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowIntro(!showIntro)}
          className="shrink-0 ml-2 text-[11px] sm:text-xs font-medium text-slate-400 hover:text-[#5D7CFA] transition-colors"
        >
          {showIntro ? '收起说明' : '什么是大运？'}
        </button>
      </div>

      {/* 展开的说明区域 */}
      {showIntro && (
        <div className="mt-3 rounded-xl bg-slate-50/80 px-3 py-3 text-[11px] sm:text-xs leading-6 text-slate-600">
          <p>
            <span className="font-bold text-slate-800">大运</span>
            ：子平术中，以月柱为起点，按"阳男阴女顺排、阴男阳女逆排"的规则推演出十年一步的运程周期。
            每步大运由一个天干和一个地支组成，天干主前五年外在表现，地支主后五年内在根基。
          </p>
          <p className="mt-2">
            <span className="font-bold text-slate-800">起运</span>
            ：{directionReason}。{startAgeReason}
            ，此后每十年进入下一步大运。
          </p>
        </div>
      )}

      {/* 大运横向时间轴 */}
      <div className="mt-3">
        <div className="flex items-end gap-1.5 sm:gap-1">
          {decadeFortunes.map((decade, idx) => {
            const isActive = decade.active;
            const isPast = idx < activeIndex;
            const tenGod = decadeTenGods[idx];

            return (
              <Popover key={decade.index}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'relative flex-1 rounded-t-md transition-all duration-200',
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/30',
                      isActive
                        ? 'bg-[#5D7CFA] shadow-[0_2px_8px_rgba(93,124,250,0.35)]'
                        : isPast
                          ? 'bg-slate-300/60 hover:bg-[#5D7CFA]/30'
                          : 'bg-slate-200 hover:bg-[#5D7CFA]/30',
                    )}
                    style={{ height: isActive ? 48 : isPast ? 36 : 40 }}
                    aria-label={`${decade.name} · ${decade.startAge}-${decade.endAge}岁 · ${tenGod ? tenGod.name + '运' : ''}`}
                  />
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="center"
                  className="w-[min(300px,calc(100vw-2rem))] sm:w-60 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-extrabold text-slate-900">{decade.name}</span>
                    <span className="text-xs text-slate-400">{decade.sixtyCycle}</span>
                    {isActive && (
                      <span className="rounded-full bg-[#5D7CFA] px-2 py-0.5 text-[10px] font-extrabold text-white">
                        当前
                      </span>
                    )}
                  </div>

                  {/* 十神关系 */}
                  {tenGod && (
                    <div className="mt-2 rounded-lg bg-amber-50/70 px-2 py-1.5">
                      <span className="text-[11px] font-extrabold text-amber-700">
                        {tenGod.name}运
                      </span>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-amber-600/80">
                        {TEN_GOD_DESCRIPTIONS[tenGod.name]}
                      </p>
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                    <span>{decade.startAge}-{decade.endAge} 岁</span>
                    <span className="text-slate-300">·</span>
                    <span>{decade.startYear}-{decade.endYear}</span>
                    {isPast && <span className="text-slate-400">· 已过</span>}
                    {!isActive && !isPast && <span className="text-slate-400">· 未来</span>}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>

        {/* 底部标签 */}
        <div className="mt-2 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400">
          <span>
            {yearStem}{YANG_STEMS.has(yearStem) ? '阳' : '阴'}年{isMale ? '男' : '女'} · {childLimit.forward ? '顺排' : '逆排'} · {childLimit.startAge} 岁起运
          </span>
          <span>
            {activeIndex >= 0
              ? `第 ${activeIndex + 1}/${decadeFortunes.length} 步`
              : `${decadeFortunes.length} 步`}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

function AssetToneIcon({ className, src }: { className?: string; src: { src: string } }) {
  const maskStyle = {
    WebkitMaskImage: `url(${src.src})`,
    maskImage: `url(${src.src})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  } satisfies CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 bg-current', className)}
      style={maskStyle}
    />
  );
}
