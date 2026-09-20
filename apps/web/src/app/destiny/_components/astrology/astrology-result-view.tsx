'use client';

/**
 * astrology-result-view.tsx —— 结果页首屏：护照、主轴、大三要素与交互星盘轮（设计文档 §6.5，06 工单）
 *
 * 结构（章节式布局：首屏双栏 + 全宽章节带，消灭长页单侧空列）：
 * 1. 宇宙护照头（唯一玻璃 Hero 容器，极淡扫描光入场；昵称/资料摘要/精度标签/盘面依据展开）
 * 2. 一句主轴（clamp(40px,4vw,56px) 阅读焦点；mock 流式逐字浮现，≥2 项真值支持并标注依据）
 * 3. 大三要素三卡（术语层/白话层/行为层，主轴落定后 40ms 间隔上浮；时间未知切「核心要素」+ 资料范围提示）
 *    —— 桌面端 1-3 与右侧 4 栏洞察轨同行（8+4）：洞察轨即首屏仪表盘，不再跟随全文
 * 4. 交互星盘轮（全宽章节带：深色渐变舞台，轮盘主角居左 + 白话清单居右并置；移动端通栏出血；
 *    清单默认只露前 4 颗可展开；点选事实卡落于带内下方，含「相关模块」反向定位，08）
 * 5. 五大生活模块与行动三角（07；全宽两列卡片栅格，本周卡通栏；手风琴状态托管于此供反向定位）
 * 6. P0 深度区（08；全宽两页内标签：星盘轮完整清单 / 关键相位；顶部迷你护照条 sticky）
 * 移动端保持单列叙事：护照 → 主轴 → 大三 → 本周入口 → 星盘轮 → 模块 → 洞察轨 → 深读
 * （DOM 顺序即移动叙事顺序，桌面双栏由 order 工具类重排，读屏顺序不打乱）。
 *
 * 分区加载（02 工单：真值来自报告流，解读层按工作区状态分支）：
 * - 事实层（chartFacts）驱动的区块立即渲染：护照头、交互星盘轮、白话清单、术语表、深度区；
 * - 解读层状态（工作区 interpretation）：在途 → 夜色系呼吸骨架（主轴金句、大三要素、本周行动入口、
 *   生活模块、洞察轨分享与问答卡）；暂不可用（LLM 未接入 / 额度不足 / 未取得结论）→ 文案区落
 *   诚实的「解读暂不可用」卡并把解读驱动区块整块收起，事实层照常可交互；
 * - 金句区按金句档位预留 min-height，骨架替换时不产生布局跳动。
 *
 * 诚实性约束：事实层只读 chartFacts；解读内容只来自解读层事件（03 工单的流式分区），
 * 绝不用模板/mock 文案冒充产出；不可用要素缺项为 null，不预留占位、不伪装待定。
 * 长文区域一律实体高对比底，仅护照头 Hero 用玻璃质感（§6.5 硬规则）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Footprints,
  MessageCircleQuestion,
  Moon as MoonIcon,
  Orbit,
  RotateCcw,
  Share2,
  Sparkles,
  Sunrise,
  Sun as SunIcon,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import type { AstrologyChartFacts, PlanetBody, ZodiacSign } from '@/lib/astrology/chart-facts';
import {
  ASPECT_PLAIN,
  ASCENDANT_READINGS,
  attachWeeklyGuidance,
  MOON_READINGS,
  moduleIdsForBody,
  orderModulesByTopic,
  PLANET_THEME,
  planetPlainSentence,
  resolveKeyAspectList,
  SUN_READINGS,
  type ElementReading,
  type ModuleId,
  type ModuleReading,
} from '@/lib/astrology/interpretation';
import {
  chartFactsErrorKind,
  isLatestChartFactsRequest,
  startChartFactsRequest,
} from '@/lib/astrology/chart-request';
import { updateAstrologyHistoryInterpretation } from '@/lib/astrology/history';
import {
  ASPECT_CN,
  PLANET_CN,
  PLANET_GLYPH,
  ZODIAC_CN,
  ZODIAC_GLYPH,
} from './astrology-chart-wheel';
import { AstrologyDeepDive } from './astrology-deep-dive';
import { AstrologyInterpretationNotice } from './astrology-interpretation-notice';
import { AstrologyLifeModules } from './astrology-life-modules';
import { AstrologyQaEntry } from './astrology-qa';
import { AstrologyShareEntry, isAstrologyShareAvailable } from './astrology-share-entry';
import { AstrologyNightToggle } from './astrology-night-toggle';
import { TypewriterHeadline } from './astrology-typewriter-headline';
import { AstrologyWheel3D } from './astrology-wheel-3d';
import { useWheelSceneAvailable } from './astrology-wheel-scene-switch';
import { APPROXIMATE_SLOTS, formatDegreeMinute } from './astrology-mappers';
import { resetAstrologyScroll } from './astrology-scroll';
import type { AstrologyFormData } from '../astrology-types';

/* ---------- 展示层小工具 ---------- */

/** 计算时刻格式化（护照头「计算于」） */
function formatCalculatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 时间精度标签（沿用表单语义色：准确靛蓝 / 约时琥珀 / 未知月光紫）；
 *  约时降级（区间内角点不稳定 → 无宫位范围）必须如实标注「部分盘面范围不稳定」（§6.2） */
function precisionBadge(
  formData: AstrologyFormData,
  facts: AstrologyChartFacts
): { text: string; className: string } {
  if (formData.timePrecision === 'accurate') {
    return {
      text: '准确到分钟',
      className:
        'border-indigo-300/50 bg-indigo-100/60 text-indigo-700 dark:border-indigo-300/25 dark:bg-indigo-400/10 dark:text-indigo-200',
    };
  }
  if (formData.timePrecision === 'approximate') {
    const degraded = facts.factStability.houses.reason === 'unstable-in-range';
    return {
      text: degraded ? '约时 · 部分盘面范围不稳定' : '大约时段 · 已校验稳定性',
      className:
        'border-amber-300/50 bg-amber-100/60 text-amber-700 dark:border-amber-300/25 dark:bg-amber-400/10 dark:text-amber-200',
    };
  }
  return {
    text: '时间未知 · 无宫位行星盘',
    className:
      'border-violet-300/50 bg-violet-100/60 text-violet-700 dark:border-violet-300/25 dark:bg-violet-400/10 dark:text-violet-200',
  };
}

/** 口径行里的宫制文案：普拉西德制为默认，整宫制为高纬回退，无宫位为降级盘 */
function houseSystemLabel(facts: AstrologyChartFacts): string {
  if (facts.houseSystem === 'placidus') return '普拉西德制';
  if (facts.houseSystem === 'whole-sign') return '整宫制';
  return '无宫位';
}

/** 资料摘要行（真实表单数据，与仪式页摘要同口径） */
function summaryText(formData: AstrologyFormData): string {
  const d = formData.birthDate;
  const date = d ? `${d.year} 年 ${d.month} 月 ${d.day} 日` : '';
  let time = '时间未知';
  if (formData.timePrecision === 'accurate' && formData.birthTime.hour !== '') {
    time = `${formData.birthTime.hour.padStart(2, '0')}:${(formData.birthTime.minute || '0').padStart(2, '0')}`;
  } else if (formData.timePrecision === 'approximate' && formData.approximateSlot) {
    const slot = APPROXIMATE_SLOTS.find((s) => s.value === formData.approximateSlot);
    time = `约 ${slot?.label ?? formData.approximateSlot}`;
  }
  return [date, time, formData.location.name].filter(Boolean).join(' · ');
}

/** 主轴真值引用键 → 中文依据标签（「依据：太阳天秤 × 月亮巨蟹」） */
function refLabel(ref: string, facts: AstrologyChartFacts): string {
  const parts = ref.split(':');
  if (parts[0] === 'planet') {
    const body = parts[1] as PlanetBody;
    const placement = facts.planets.find((p) => p.body === body);
    const name = PLANET_CN[body] ?? body;
    if (parts[2] === 'retrograde') return `${name}逆行`;
    return placement?.sign ? `${name}${ZODIAC_CN[placement.sign]}` : name;
  }
  if (parts[0] === 'angle') {
    return facts.angles.ascendant.sign ? `上升${ZODIAC_CN[facts.angles.ascendant.sign]}` : '上升';
  }
  if (parts[0] === 'aspect') {
    const [, source, type, target] = parts;
    return `${PLANET_CN[source as PlanetBody] ?? source}${ASPECT_CN[type as keyof typeof ASPECT_CN] ?? type}${PLANET_CN[target as PlanetBody] ?? target}`;
  }
  if (parts[0] === 'transit') {
    // 行运引用（本月天象）：标注「行运」，与本命相位区分
    const [, transiting, type, target] = parts;
    return `行运${PLANET_CN[transiting as PlanetBody] ?? transiting}${ASPECT_CN[type as keyof typeof ASPECT_CN] ?? type}${PLANET_CN[target as PlanetBody] ?? target}`;
  }
  return ref;
}

/** 三要素卡的术语层（太阳/月亮/上升各自取数，缺项不渲染） */
function placementTermLine(facts: AstrologyChartFacts, key: 'sun' | 'moon' | 'ascendant'): string {
  if (key === 'ascendant') {
    const a = facts.angles.ascendant;
    return a.sign
      ? `${ZODIAC_CN[a.sign]}${a.degree !== null ? ` ${formatDegreeMinute(a.degree)}` : ''}`
      : '';
  }
  const p = facts.planets.find((pl) => pl.body === key);
  if (!p?.sign) return '';
  const bits = [
    `${ZODIAC_CN[p.sign]}${p.degree !== null ? ` ${formatDegreeMinute(p.degree)}` : ''}`,
  ];
  if (p.house !== null) bits.push(`第 ${p.house} 宫`);
  if (p.retrograde) bits.push('逆行中');
  return bits.join(' · ');
}

/* ---------- 星体深度解构卡组件 ---------- */

/** 星体深度解构卡（在桌面端内嵌于右栏，移动端作为浮动抽屉呈现；彻底杜绝页面上下跳动） */
function PlanetFactCard({
  body,
  placement,
  reading,
  aspects,
  relatedModuleIds,
  modules,
  allPlanets,
  onSelectBody,
  onLocateModule,
  onClose,
  isDrawer = false,
}: {
  body: PlanetBody;
  placement: NonNullable<AstrologyChartFacts['planets'][number]> & { sign: ZodiacSign };
  reading: ElementReading | null;
  aspects: AstrologyChartFacts['aspects'];
  relatedModuleIds: ModuleId[];
  modules: ModuleReading[];
  allPlanets: { body: PlanetBody; sign: ZodiacSign }[];
  onSelectBody: (b: PlanetBody) => void;
  onLocateModule: (id: ModuleId) => void;
  onClose: () => void;
  isDrawer?: boolean;
}) {
  const Glyph = PLANET_GLYPH[body];

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* 顶部操作与快速切换条 */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/[0.08]">
          {!isDrawer ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>全部星体</span>
            </button>
          ) : (
            <span className="text-xs font-semibold text-slate-500 dark:text-night-muted">
              星体深度解构
            </span>
          )}

          {/* 快捷星体点选胶囊：热区 44×44（横排十颗，28×28 易误触）。
              上限放宽到 226px（≈5 颗 + 第 6 颗露头）给横排「可滑动」视觉线索；
              min-w-0 保证窄屏时先缩行、不挤两侧控件；不加 flex-1——行宽取内容与上限的较小值，
              用 flex-1 会被中间余量（桌面右栏实测 253px）压到比上限更窄 */}
          <div className="flex min-w-0 max-w-[226px] items-center gap-1 overflow-x-auto p-0.5 hide-scrollbar sm:max-w-[280px]">
            {allPlanets.map((p) => {
              const ItemGlyph = PLANET_GLYPH[p.body];
              const isCurrent = p.body === body;
              return (
                <button
                  key={p.body}
                  type="button"
                  onClick={() => onSelectBody(p.body)}
                  title={`${PLANET_CN[p.body]}在${ZODIAC_CN[p.sign]}`}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40',
                    isCurrent
                      ? 'bg-indigo-600 text-white shadow-xs dark:bg-indigo-500'
                      : 'text-day-muted hover:bg-slate-100 hover:text-slate-700 dark:text-night-faint dark:hover:bg-white/[0.08] dark:hover:text-slate-200'
                  )}
                >
                  <ItemGlyph
                    width={13}
                    height={13}
                    className={isCurrent ? 'stroke-white' : 'stroke-current'}
                  />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭事实卡"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-day-muted transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-night-faint dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {/* 核心身份徽印 */}
        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-200/70 bg-indigo-50/80 text-indigo-600 shadow-xs dark:border-indigo-300/20 dark:bg-indigo-400/10 dark:text-indigo-300">
            <Glyph width={22} height={22} className="stroke-current" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                {PLANET_CN[body]} · {ZODIAC_CN[placement.sign]}
              </h4>
              {placement.degree !== null && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                  {formatDegreeMinute(placement.degree)}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-night-faint">
              <span className="font-medium text-indigo-600 dark:text-indigo-300">
                {PLANET_THEME[body]}
              </span>
              {placement.house !== null && <span>· 第 {placement.house} 宫</span>}
              {placement.retrograde === true && (
                <span className="rounded-full bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                  逆行中
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 白话主句气泡 */}
        <div className="mt-4 rounded-xl border border-indigo-100/80 bg-indigo-50/40 p-3.5 text-xs leading-relaxed text-slate-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-slate-200 sm:text-sm">
          {planetPlainSentence(body, placement.sign)}
        </div>

        {/* 若有日/月要素扩展解读 */}
        {reading && (
          <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-600 dark:bg-[#090D1C] dark:text-night-muted">
            <p className="text-slate-800 dark:text-slate-200">{reading.plain}</p>
            <p className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-300">
              <Compass className="h-3 w-3 shrink-0" />
              <span>建议：{reading.action}</span>
            </p>
          </div>
        )}

        {/* 关联相位 */}
        {aspects.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/[0.08]">
            <p className="text-[11px] font-semibold text-day-muted dark:text-night-faint">
              关联相位作用
            </p>
            <ul className="mt-2 space-y-1.5">
              {aspects.map((a) => {
                const other = a.source === body ? a.target : a.source;
                return (
                  <li
                    key={`${a.source}-${a.target}-${a.type}`}
                    className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300"
                  >
                    <Sparkles
                      className="mt-0.5 h-3 w-3 shrink-0 text-indigo-500 dark:text-indigo-300"
                      strokeWidth={2}
                    />
                    <span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        与{PLANET_CN[other]}
                        {ASPECT_CN[a.type]}
                        {a.orb !== null && `（偏差 ${a.orb.toFixed(1)}°）`}
                      </span>
                      ——{ASPECT_PLAIN[a.type]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* 底部：关联生活模块跳链 */}
      {relatedModuleIds.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/[0.08]">
          <p className="text-[11px] font-semibold text-day-muted dark:text-night-faint">
            在以下生活模块中被引用
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {relatedModuleIds.map((id) => {
              const m = modules.find((mod) => mod.id === id);
              if (!m) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onLocateModule(id)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-indigo-200/80 bg-white px-2.5 text-[11px] font-medium text-indigo-600 shadow-2xs transition-colors hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-indigo-300/20 dark:bg-white/[0.04] dark:text-indigo-200 dark:hover:bg-indigo-400/10"
                >
                  <span>{m.title}</span>
                  <ChevronRight className="h-3 w-3 opacity-60" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 移动端折叠 ---------- */

/**
 * 移动端折叠壳（洞察轨密度）：<sm 默认收为一行摘要（标题 + chevron，热区 44px），
 * sm 起摘要行隐藏、内容常显——桌面端保持现状展开，只有移动端默认折叠。
 * hidden：内容自身会整块隐藏时（如主轴缺失的分享入口），摘要行必须同步跳过渲染，
 * 否则移动端点开是一个空壳。
 * className / bodyClassName：给外壳与内容层补桌面端布局类（如星语问答卡在洞察轨里撑满剩余高度）。
 */
function MobileCollapse({
  title,
  hint,
  icon: Icon,
  hidden = false,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  hidden?: boolean;
  /** 外壳附加类（桌面端撑满时用 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col） */
  className?: string;
  /** 内容层附加类（与外壳同为伸缩容器，内容卡才能以 flex-1 占满剩余高度） */
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-left transition-colors hover:border-indigo-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-white/10 dark:bg-[#0D1226] sm:hidden"
      >
        <Icon className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300" strokeWidth={1.9} />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-bold',
            open ? 'text-day-muted dark:text-night-faint' : 'text-slate-900 dark:text-white'
          )}
        >
          {open ? '收起' : title}
        </span>
        {!open && hint && (
          <span className="shrink-0 text-[11px] font-medium text-day-muted dark:text-night-faint">
            {hint}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-day-muted transition-transform duration-200 dark:text-night-faint',
            open && 'rotate-180'
          )}
          strokeWidth={2.2}
        />
      </button>
      <div className={cn(open ? 'mt-2.5 sm:mt-0' : 'hidden sm:block', bodyClassName)}>
        {children}
      </div>
    </div>
  );
}

/* ---------- 分区骨架（解读在途时的等待态；DESIGN.md 6.3 呼吸档，减少动态下静态定格） ---------- */

/** 骨架块：夜色系呼吸块（浅色 slate / 深色夜面微光），纯占位不参与事实表达 */
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'acw-skeleton-breathe rounded-lg bg-slate-200/60 dark:bg-white/[0.07]',
        className
      )}
    />
  );
}

/** 主轴金句骨架：按金句档位预留 min-height（防解读到达时布局跳动），两行呼吸块 */
function HeadlineSkeleton() {
  return (
    <div aria-hidden className="min-h-[5.5rem] sm:min-h-[8rem]">
      <SkeletonBlock className="h-6 w-[85%] sm:h-10 sm:w-[78%]" />
      <SkeletonBlock className="mt-3 h-6 w-[60%] sm:mt-4 sm:h-10 sm:w-[55%]" />
    </div>
  );
}

/** 大三要素骨架：三卡位（与完整盘同栏数），卡内块高对齐真实卡的图标行 + 正文行 */
function BigThreeSkeleton() {
  return (
    <div aria-hidden className="mt-4 grid gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-[#0D1226]"
        >
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-8 w-8 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3.5 w-16" />
              <SkeletonBlock className="mt-1.5 h-2.5 w-10" />
            </div>
          </div>
          <SkeletonBlock className="mt-3.5 h-3 w-24" />
          <SkeletonBlock className="mt-4 h-3 w-full" />
          <SkeletonBlock className="mt-2 h-3 w-4/5" />
          <SkeletonBlock className="mt-3 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** 生活模块骨架：真实章节的标题行 + 卡片块（标题是结构，先立起来不误导内容） */
function LifeModulesSkeleton() {
  return (
    <section aria-label="五个生活模块" aria-busy="true">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
          生活的五个切面
        </h3>
        <span className="text-xs text-day-muted dark:text-night-faint">
          每张卡都能展开依据，回看它来自盘面的哪个位置
        </span>
      </div>
      <div aria-hidden className="mt-5 grid gap-3 xl:grid-cols-2 xl:gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-[#0D1226] sm:p-5"
          >
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-9 w-9 rounded-full" />
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-3.5 w-24" />
                <div className="mt-1.5 flex gap-1.5">
                  <SkeletonBlock className="h-4 w-12 rounded-full" />
                  <SkeletonBlock className="h-4 w-16 rounded-full" />
                </div>
              </div>
            </div>
            <SkeletonBlock className="mt-4 h-3 w-full" />
            <SkeletonBlock className="mt-2 h-3 w-11/12" />
            <SkeletonBlock className="mt-2 h-3 w-3/5" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** 洞察轨卡片骨架：分享星语海报与星语问答两张卡解读在途时的同档占位（避免整轨跳动） */
function RailCardSkeleton() {
  return (
    <div
      aria-hidden
      className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#0D1226] dark:shadow-[inset_0_1px_0_rgba(196,181,253,0.10)]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-4 w-4 rounded-full" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
        <SkeletonBlock className="h-4 w-14 rounded-full" />
      </div>
      <SkeletonBlock className="mt-3 h-3 w-full" />
      <SkeletonBlock className="mt-2 h-3 w-3/5" />
      <SkeletonBlock className="mt-3.5 h-11 w-full rounded-full" />
    </div>
  );
}

/* ---------- 主组件 ---------- */

export type AstrologyResultViewProps = {
  /** 05 转场插槽：同一 layoutId 的星盘轮在这里落定（附带 06 点选交互参数） */
  wheelSlot: (
    slotClass: string,
    wheelProps?: {
      selectedBody: PlanetBody | null;
      onSelectBody: (body: PlanetBody | null) => void;
    }
  ) => React.ReactNode;
};

export function AstrologyResultView({ wheelSlot }: AstrologyResultViewProps) {
  const reduceMotion = useReducedMotion();
  const {
    formData,
    chartFacts,
    interpretation: interpretationState,
    setWorkspaceState,
  } = useDestinyWorkspaceStore(
    useShallow((s) => ({
      formData: s.astrology.formData,
      chartFacts: s.astrology.chartFacts,
      interpretation: s.astrology.interpretation,
      setWorkspaceState: s.setWorkspaceState,
    }))
  );

  const [selectedBody, setSelectedBody] = useState<PlanetBody | null>(null);
  /** WebGL 星渊场景可用性（null=探测中/不可用 → SVG 轮兜底并保持 DOM 视差） */
  const wheelSceneOk = useWheelSceneAvailable();
  const [basisOpen, setBasisOpen] = useState(false);
  const [showAllTerms, setShowAllTerms] = useState(false);
  /** 白话清单默认只露前 4 颗（防长页）；展开后显示全部行星 */
  const [showAllPlanets, setShowAllPlanets] = useState(false);
  /** 生活模块手风琴（托管在此：事实卡「相关模块」可反向展开定位，08） */
  const [openModuleId, setOpenModuleId] = useState<ModuleId | null>(null);
  /** 移动端校准状态卡的折叠态（<sm 默认收起，桌面端不使用该状态） */
  const [statusOpen, setStatusOpen] = useState(false);

  /** 结果页首次呈现时复位局部与文档滚动位置，保证护照头与主轴处于视口核心 */
  useEffect(() => {
    resetAstrologyScroll();
  }, []);

  /**
   * 解读层内容（主轴 / 大三要素 / 五大模块 / 本周三角与关键相位）：03 工单由报告流分区事件
   * 逐区填充（headline → bigThree → modules → transits 落进工作区 interpretation.report）。
   * 分区未到达时对应区块按骨架占位；解读降级时整块收起并落诚实的「解读暂不可用」卡，
   * 绝不用模板文案冒充产出。
   */
  const interpretation = interpretationState.report;
  /** 五大生活模块（解读分区 + 本周三角组装；关注主题只调整阅读顺序，不改变盘面与文案） */
  const modules = useMemo(() => {
    if (!interpretation) return [];
    const merged = attachWeeklyGuidance(interpretation.modules, interpretation.transits);
    const topicToModule: Record<string, ModuleId> = {
      self: 'who',
      love: 'love',
      career: 'career',
      recent: 'week',
    };
    const priority = formData.topic ? (topicToModule[formData.topic] ?? null) : null;
    return orderModulesByTopic(merged, priority);
  }, [interpretation, formData.topic]);
  /** 大三要素与模块分区是否已到达（未到达时按分区骨架占位） */
  const bigThree = interpretation?.bigThree ?? null;
  const modulesArrived = interpretation !== null && interpretation.modules.length > 0;

  /** 关键相位（深度区）：AI 三段式文案与真值相位按引用键合并，只认盘面稳定存在的相位 */
  const keyAspects = useMemo(() => {
    if (!chartFacts) return { status: 'pending' as const, top: [], rest: [] };
    if (interpretation?.transits) {
      const { top, rest } = resolveKeyAspectList(chartFacts, interpretation.transits.keyAspects);
      return { status: 'ready' as const, top, rest };
    }
    // 分区未到（含已就绪但 transits 仍在途）：按等待态说明；只有解读层确认降级才说不生成
    return {
      status:
        interpretationState.status === 'unavailable'
          ? ('unavailable' as const)
          : ('pending' as const),
      top: [],
      rest: [],
    };
  }, [chartFacts, interpretation, interpretationState.status]);

  /** 解读在途（骨架可展示）与解读降级（诚实卡）的判定：有内容即为就绪，二者互斥 */
  const interpretationPending = interpretation === null && interpretationState.status === 'pending';
  const interpretationUnavailable = interpretation === null && !interpretationPending;

  const headlineReading = interpretation?.headline ?? null;
  const fullHeadline = headlineReading?.text ?? '';

  /** 主轴落定标记：逐字状态由 TypewriterHeadline 自持（隔离 34ms/字的高频重渲染），
   *  父树只在落定那一刻重渲染一次；比对文案而不是布尔值，换主轴文案时自动回到未落定 */
  const [doneHeadline, setDoneHeadline] = useState<string | null>(null);
  const headlineDone = fullHeadline.length > 0 && doneHeadline === fullHeadline;
  /** 落定回调：逐字完成时触发一次，驱动依据 chips 与三要素卡入场 */
  const handleHeadlineDone = useCallback(() => setDoneHeadline(fullHeadline), [fullHeadline]);

  /** 分享入口可用性：与 AstrologyShareEntry 内部同一判定（主轴缺失即整卡隐藏），
   *  折叠壳据此同步跳过渲染，避免移动端留下「点开即空」的死入口 */
  const shareAvailable = useMemo(
    () => (chartFacts ? isAstrologyShareAvailable(chartFacts, fullHeadline, formData.name) : false),
    [chartFacts, fullHeadline, formData.name]
  );

  /** 选中星体的真值与关联相位（白话先行事实卡数据源） */
  const selectedPlacement = useMemo(() => {
    if (!chartFacts || !selectedBody) return null;
    return chartFacts.planets.find((p) => p.body === selectedBody && p.sign !== null) ?? null;
  }, [chartFacts, selectedBody]);
  const selectedAspects = useMemo(() => {
    if (!chartFacts || !selectedBody) return [];
    return chartFacts.aspects
      .filter(
        (a) => a.stability === 'stable' && (a.source === selectedBody || a.target === selectedBody)
      )
      .slice(0, 3);
  }, [chartFacts, selectedBody]);

  /** 选中星体的大三要素解读（若属于日/月则附白话+动作层） */
  const selectedReading: ElementReading | null = useMemo(() => {
    if (!selectedPlacement?.sign) return null;
    if (selectedBody === 'sun') return SUN_READINGS[selectedPlacement.sign];
    if (selectedBody === 'moon') return MOON_READINGS[selectedPlacement.sign];
    return null;
  }, [selectedPlacement, selectedBody]);

  /** 等价文本清单（白话默认；点击行联动轮上选中） */
  const textListItems = useMemo(() => {
    if (!chartFacts) return [];
    return chartFacts.planets
      .filter((p) => p.sign !== null)
      .map((p) => ({
        body: p.body,
        sign: p.sign!,
        degree: p.degree,
        house: p.house,
        retrograde: p.retrograde,
        plain: planetPlainSentence(p.body, p.sign!),
      }));
  }, [chartFacts]);

  /** 解读分区到达即合并进本地统一历史记录（同一条逻辑记录，修订号不动）：
   *  首帧主轴先落低敏摘要，模块与行运随后逐区补齐整份解读——历史恢复时据此回填结果页，
   *  点开旧记录看到的是当时那份结果，而不是「只存了真值、解读待接入」 */
  useEffect(() => {
    if (!chartFacts || !interpretation) return;
    updateAstrologyHistoryInterpretation(formData, chartFacts, interpretation);
  }, [chartFacts, interpretation, formData]);

  /** 本周行动入口文案（移动端首屏 compact 卡；行运不可用时为 null，入口整块隐藏） */
  const weeklyAction = useMemo(
    () => modules.find((m) => m.id === 'week')?.weekly?.action ?? null,
    [modules]
  );
  /** 选中星体 → 引用它的生活模块（事实卡「相关模块」chips，08 反向定位；解读在途时为空，chips 随解读到达出现） */
  const relatedModuleIds = useMemo(
    () => (selectedBody ? moduleIdsForBody(modules, selectedBody) : []),
    [modules, selectedBody]
  );

  if (!chartFacts) return null;

  const badge = precisionBadge(formData, chartFacts);
  /** 无宫位降级原因：time-unknown（完全未知）/ unstable-in-range（约时不稳定）；含宫位盘为 null */
  const degradeReason = chartFacts.factStability.houses.reason;
  const sunPlacement = chartFacts.planets.find((p) => p.body === 'sun');
  const name = formData.name.trim() || '星盘主人';
  /** 含宫位与否取自事实层（与解读层 withHouses 同源）：解读在途时章节标题与降级说明也已可渲染 */
  const withHouses = chartFacts.dataCompleteness === 'with-houses';

  /** 月亮缺席说明：未知/约时档月亮当日跨座会被整颗隐藏，白话说明「为什么不在名单里」（诚实做到底）。
   *  只在降级原因是已知两种时给对应文案，其余原因不写说明——宁缺毋假，不假定「缺时间」 */
  const moonHiddenNote =
    chartFacts.planets.find((p) => p.body === 'moon')?.sign === null
      ? degradeReason === 'unstable-in-range'
        ? '月亮在所选时段内跨越星座，无法判定，本次未列出。'
        : degradeReason === 'time-unknown'
          ? '月亮在出生当日跨越星座，缺少准确时间无法判定，本次未列出。'
          : null
      : null;

  /** 大三要素卡片数据（分区未到达或不可用项为 null，直接不渲染；分区未到由骨架占位） */
  const bigThreeCards = [
    bigThree?.sun && sunPlacement?.sign
      ? {
          key: 'sun' as const,
          title: '太阳',
          subtitle: '核心气质',
          Icon: SunIcon,
          reading: bigThree.sun,
          term: placementTermLine(chartFacts, 'sun'),
        }
      : null,
    bigThree?.moon
      ? {
          key: 'moon' as const,
          title: '月亮',
          subtitle: '内在情绪',
          Icon: MoonIcon,
          reading: bigThree.moon,
          term: placementTermLine(chartFacts, 'moon'),
        }
      : null,
    bigThree?.ascendant
      ? {
          key: 'ascendant' as const,
          title: '上升',
          subtitle: '外在表达',
          Icon: Sunrise,
          reading: bigThree.ascendant,
          term: placementTermLine(chartFacts, 'ascendant'),
        }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  /** 降级档只剩 1-2 张要素卡时栅格按数量自适应（单卡横向聚光排版），不留空栅格 */
  const bigThreeCols =
    bigThreeCards.length === 1
      ? 'sm:grid-cols-1'
      : bigThreeCards.length === 2
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-3';
  /** 仅一张要素卡（时间未知档常见）：横向聚光排版开关 */
  const bigThreeSolo = bigThreeCards.length === 1;

  /** 重新测算：回表单并保留已填资料（step 一并回到 form，否则工作区分发仍停在结果页） */
  const recalculate = () =>
    setWorkspaceState('astrology', {
      step: 'form',
      entryView: 'form',
      error: null,
      errorKind: null,
    });

  /** 模块事实片定位：选中星体并平滑滚回星盘轮区（angle/house 类引用仅滚动不选星体） */
  const handleLocateBody = (body: PlanetBody | null) => {
    if (body) setSelectedBody(body);
    document.getElementById('astrology-wheel-section')?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  /** 反向定位（08）：展开对应生活模块并平滑滚动到该卡 */
  const handleLocateModule = (id: ModuleId) => {
    setOpenModuleId(id);
    // 等展开高度动画（260ms）落定后再滚动：过早滚动会把收缩态位置当目标，导致定位失效
    const delay = reduceMotion ? 50 : 320;
    window.setTimeout(() => {
      document.getElementById(`astrology-module-${id}`)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }, delay);
  };

  /**
   * 重试解读（工单 14：真值不重算）：重走报告流——服务端真值重算结果与本盘确定性一致
   * （单盘约 150ms，近乎零成本），因此工作区保留既有 chartFacts：历史记录合并依赖它的
   * calculatedAt 锚点，重试不应把它换成新一次计算的时间戳。
   */
  const retryInterpretation = () => {
    if (!chartFacts) return;
    const { token, result } = startChartFactsRequest(formData);
    result.then(
      () => {
        // 真值重算结果确定性一致：不写回工作区（保留历史锚点），解读分区随流继续填充
        if (!isLatestChartFactsRequest(token)) return;
      },
      () => {
        // 失败由接缝落成「解读未完成」结论（工作区 error 不动：星盘与已到达分区照常展示）
        if (!isLatestChartFactsRequest(token)) return;
      }
    );
  };

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 xl:max-w-7xl xl:pt-8">
        <div className="grid gap-12 xl:grid-cols-12">
          {/* ═══ 主栏 8 栏（与洞察轨同行构成首屏）：护照头 → 主轴 → 大三要素 ═══ */}
          <div className="order-1 min-w-0 xl:col-span-8">
            {/* ── 1. 宇宙护照头（天命档案微晶印鉴；极淡扫描光入场一次；night-card 供夜幕观星鎏金描边覆盖） ── */}
            <header className="night-card relative overflow-hidden rounded-[24px] border border-white/70 bg-gradient-to-br from-white/90 via-white/80 to-indigo-50/30 p-5 shadow-[0_20px_56px_-28px_rgba(30,41,82,0.22)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.04] dark:to-indigo-950/20 sm:p-6">
              {/* 背景微星轨经纬装饰线 */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full border border-indigo-400/10 dark:border-indigo-300/[0.06]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full border border-indigo-400/15 dark:border-indigo-300/[0.08]"
              />
              {!reduceMotion && (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-indigo-300/25 to-transparent dark:via-indigo-200/[0.12]"
                  initial={{ x: '-140%' }}
                  animate={{ x: '560%' }}
                  transition={{ duration: 1.25, ease: 'easeOut', delay: 0.15 }}
                />
              )}
              <div className="relative">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200/80 bg-indigo-50/80 text-indigo-600 shadow-xs dark:border-indigo-300/20 dark:bg-indigo-400/10 dark:text-indigo-300">
                      <Compass className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <h1 className="font-heading text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                      {name}的宇宙护照
                    </h1>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
                      badge.className
                    )}
                  >
                    {badge.text}
                  </span>
                  {/* 模型控制器只在填表步骤提供（与八字/紫微/奇门同一口径）：结果页报告已按当时
                      选定的模型产出，此处不再给切换入口，避免出现与当前报告不符的模型口径 */}
                  {/* 「夜幕观星」切换：护照头行内右端，移动端随 flex-wrap 自然换行不挤压标题 */}
                  <div className="ml-auto">
                    <AstrologyNightToggle />
                  </div>
                </div>
                {/* 移动端突出太阳星座（§7.2 压缩护照）；桌面展示完整摘要行 */}
                {sunPlacement?.sign && (
                  <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-200 xl:hidden">
                    {(() => {
                      const Glyph = ZODIAC_GLYPH[sunPlacement.sign];
                      return (
                        <Glyph
                          width={16}
                          height={16}
                          className="stroke-indigo-500 dark:stroke-indigo-300"
                        />
                      );
                    })()}
                    太阳 · {ZODIAC_CN[sunPlacement.sign]}
                  </p>
                )}
                <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-night-muted sm:text-sm">
                  {summaryText(formData)}
                  {formatCalculatedAt(chartFacts.calculatedAt) &&
                    ` · 计算于 ${formatCalculatedAt(chartFacts.calculatedAt)}`}
                </p>

                {/* 盘面依据：可展开计算口径（实体底，非玻璃） */}
                <button
                  type="button"
                  onClick={() => setBasisOpen((v) => !v)}
                  aria-expanded={basisOpen}
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-indigo-300 dark:hover:bg-white/5 sm:min-h-0 sm:py-1.5"
                >
                  盘面依据
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-200',
                      basisOpen && 'rotate-180'
                    )}
                    strokeWidth={2.2}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {basisOpen && (
                    <motion.div
                      initial={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                      animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <dl className="mt-2 space-y-1.5 rounded-2xl bg-slate-50/90 p-4 text-xs leading-relaxed text-slate-600 dark:bg-[#0B1020] dark:text-slate-300">
                        {(['sun', 'moon', 'ascendant'] as const).map((k) => {
                          const term = placementTermLine(chartFacts, k);
                          if (!term) return null;
                          const label = k === 'sun' ? '太阳' : k === 'moon' ? '月亮' : '上升';
                          return (
                            <div key={k} className="flex gap-2">
                              <dt className="w-10 shrink-0 font-semibold text-slate-700 dark:text-slate-200">
                                {label}
                              </dt>
                              <dd>{term}</dd>
                            </div>
                          );
                        })}
                        <div className="flex gap-2 border-t border-slate-200/70 pt-2 dark:border-white/[0.08]">
                          <dt className="w-10 shrink-0 font-semibold text-slate-700 dark:text-slate-200">
                            口径
                          </dt>
                          <dd>
                            回归黄道 · {withHouses ? houseSystemLabel(chartFacts) : '无宫位行星盘'}{' '}
                            · 容许度表 {chartFacts.orbTableVersion} · 引擎{' '}
                            {chartFacts.engineVersion} · 修订 {chartFacts.calculationRevision}
                          </dd>
                        </div>
                      </dl>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </header>

            {/* ── 2. 一句主轴（阅读焦点；逐字浮现，≥2 项真值依据标注）。
                    解读降级：诚实的「解读暂不可用」卡 + 重试解读（真值不重算）；
                    分区未到：按金句档位预留 min-height 的呼吸骨架 ── */}
            {interpretationUnavailable ? (
              <div className="mt-12">
                <AstrologyInterpretationNotice
                  reason={interpretationState.reason}
                  onRetry={retryInterpretation}
                />
              </div>
            ) : headlineReading ? (
              <section className="mt-12" aria-label="你的核心主题">
                {/* 逐字机自持状态与定时器（隔离 34ms/字的高频重渲染），落定后回调一次驱动下方依据与三卡。
                      移动端降到 text-xl（字重与琥珀金渐变由组件内部保留），sm 起恢复 clamp(40px,4vw,56px) 原档位 */}
                <div className="max-sm:[&_h2]:text-xl max-sm:[&_h2]:leading-[1.25]">
                  <TypewriterHeadline text={fullHeadline} onDone={handleHeadlineDone} />
                </div>
                {headlineDone && (
                  <motion.div
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.3 }}
                    className="mt-4 flex flex-wrap items-center gap-2"
                  >
                    <span className="text-[11px] font-semibold tracking-wider text-day-muted dark:text-night-faint">
                      依据
                    </span>
                    {headlineReading.factReferences.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-xs dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500/80 dark:bg-amber-300" />
                        {refLabel(r, chartFacts)}
                      </span>
                    ))}
                  </motion.div>
                )}
              </section>
            ) : (
              <section className="mt-12" aria-label="你的核心主题">
                <HeadlineSkeleton />
              </section>
            )}

            {/* ── 3. 大三要素（主轴落定后 40ms 间隔上浮；时间未知切「核心要素」）。
                    解读降级时不占据篇幅：事实层说明与星盘轮已完整呈现盘面，解读区由上方的诚实卡统一说明。
                    解读在途：三卡位骨架（完整盘口径）；解读到达即由真实卡替换（含降级档的栏数自适应） ── */}
            {interpretationUnavailable ? null : (
              <section className="mt-12" aria-label={withHouses ? '大三要素' : '核心要素'}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                    {withHouses ? '大三要素' : '核心要素'}
                  </h3>
                  <span className="text-xs text-day-muted dark:text-night-faint">
                    {withHouses ? '太阳 · 月亮 · 上升' : '只展示可计算且稳定的要素'}
                  </span>
                </div>
                {!withHouses && (
                  <p className="mt-2 rounded-2xl border border-violet-300/40 bg-violet-50/70 px-4 py-2.5 text-xs leading-relaxed text-violet-700 dark:border-violet-300/20 dark:bg-violet-400/[0.08] dark:text-violet-200">
                    {degradeReason === 'unstable-in-range'
                      ? '所选时段内上升与宫位不稳定，已按无宫位范围展示——以下结论只基于区间内稳定的事实，不取中点、不补算。'
                      : '出生时间未知，上升与宫位已隐藏——以下结论只基于整日内稳定的事实，不猜测、不补算。'}
                  </p>
                )}
                {/* 分区未到：三卡位骨架（完整盘口径）；分区到达即由真实卡替换（含降级档的栏数自适应） */}
                {bigThree === null ? (
                  <BigThreeSkeleton />
                ) : (
                  <div className={cn('mt-4 grid gap-3', bigThreeCols)}>
                    {bigThreeCards.map((card, i) => (
                      <motion.article
                        key={card.key}
                        initial={reduceMotion || !headlineDone ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          reduceMotion
                            ? { duration: 0.01 }
                            : {
                                duration: 0.4,
                                delay: headlineDone ? i * 0.04 + 0.05 : 0,
                                ease: 'easeOut',
                              }
                        }
                        className={cn(
                          'group rounded-2xl border bg-white p-4 transition-all duration-300 hover:-translate-y-1 dark:bg-[#0D1226]',
                          // 太阳为天生主角：鎏金描边 + 金色光晕；其余星卡保持靛紫体系
                          card.key === 'sun'
                            ? 'border-amber-300/70 shadow-[0_10px_30px_-14px_rgba(180,133,42,0.35)] hover:shadow-[0_20px_44px_-14px_rgba(180,133,42,0.45)] dark:border-[#E7C873]/35 dark:shadow-[0_12px_36px_-14px_rgba(231,200,115,0.30)] dark:hover:shadow-[0_22px_50px_-14px_rgba(231,200,115,0.40)]'
                            : 'border-slate-200/80 shadow-[0_10px_30px_-18px_rgba(30,41,82,0.25)] hover:shadow-[0_20px_44px_-18px_rgba(73,105,233,0.35)] dark:border-white/10 dark:hover:border-indigo-300/25',
                          !headlineDone && !reduceMotion && 'opacity-0',
                          // 单卡聚光：横向排版（左识别区 + 右解读区），不留空栅格
                          bigThreeSolo && 'sm:flex sm:items-start sm:gap-6 sm:p-6'
                        )}
                      >
                        <div className={cn(bigThreeSolo && 'sm:w-44 sm:shrink-0')}>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full',
                                card.key === 'sun'
                                  ? 'bg-amber-100/90 text-[#B4852A] dark:bg-[#E7C873]/[0.14] dark:text-[#E7C873]'
                                  : 'bg-indigo-100/80 text-indigo-600 dark:bg-indigo-400/[0.12] dark:text-indigo-300'
                              )}
                            >
                              <card.Icon className="h-4 w-4" strokeWidth={1.9} />
                            </span>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">
                                {card.title}
                              </p>
                              <p className="text-[11px] text-day-muted dark:text-night-faint">
                                {card.subtitle}
                              </p>
                            </div>
                          </div>
                          <p
                            className={cn(
                              'mt-3 text-[11px] font-semibold tracking-wide',
                              card.key === 'sun'
                                ? 'text-[#B4852A] dark:text-[#E7C873]'
                                : 'text-indigo-500 dark:text-indigo-300/90'
                            )}
                          >
                            {card.term}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200',
                              bigThreeSolo && 'sm:mt-0'
                            )}
                          >
                            {card.reading.plain}
                          </p>
                          <p className="mt-2.5 border-t border-slate-100 pt-2.5 text-xs leading-relaxed text-slate-500 dark:border-white/[0.08] dark:text-night-muted">
                            {card.reading.action}
                          </p>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── 3.5 本周行动入口（仅移动端 <xl；设计文档 §6.5 移动端顺序：护照 → 主轴 → 大三要素 → 本周行动入口，星盘轮位于首屏下方。
                    点击展开并定位到下方「本周宇宙提示」模块的行动三角；行运不可用时整块隐藏，不假装有数据。
                    解读在途：同高档位骨架占位，避免星盘轮章节带随入口出现而整体下移；解读降级：整块隐藏 ── */}
            {interpretationUnavailable ? null : weeklyAction ? (
              <button
                type="button"
                onClick={() => handleLocateModule('week')}
                className={cn(
                  'mt-6 flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/85 px-4 py-2.5 text-left shadow-sm backdrop-blur-sm backdrop-saturate-150 xl:hidden',
                  'transition-all duration-200 active:scale-[0.98] hover:border-indigo-300 hover:bg-slate-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40',
                  'dark:border-white/10 dark:bg-[#0D1226]/80 dark:hover:bg-[#121832]'
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-indigo-600 shadow-sm dark:bg-white/[0.08] dark:text-indigo-300">
                  <Footprints className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold tracking-[0.18em] text-indigo-500 dark:text-indigo-300/90">
                    本周行动
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                    {weeklyAction}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-indigo-400 dark:text-indigo-300/70"
                  strokeWidth={2.2}
                />
              </button>
            ) : interpretation === null ? (
              <div
                aria-hidden
                className="mt-6 flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/85 px-4 py-2.5 shadow-sm dark:border-white/10 dark:bg-[#0D1226]/80 xl:hidden"
              >
                <SkeletonBlock className="h-9 w-9 rounded-full" />
                <span className="min-w-0 flex-1">
                  <SkeletonBlock className="h-2.5 w-16" />
                  <SkeletonBlock className="mt-2 h-3 w-2/3" />
                </span>
              </div>
            ) : null}
          </div>

          {/* ── 4. 交互星盘轮（全宽章节带：深邃星空与液态微光渐变舞台；轮盘主角居左 + 白话清单居右，点选事实卡落于带内下方。
                  移动端通栏出血（-mx-5）保证盘面尺寸不被双层内边距压缩） ── */}
          <section
            id="astrology-wheel-section"
            aria-label="交互星盘轮"
            className="order-2 relative -mx-5 overflow-hidden border-y border-indigo-100/80 bg-[radial-gradient(ellipse_at_top_left,rgba(224,231,255,0.7),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(245,243,255,0.8),transparent_50%),linear-gradient(135deg,#F6F8FF_0%,#FFFFFF_50%,#F3F5FF_100%)] p-5 shadow-[0_24px_64px_-32px_rgba(30,41,82,0.15)] dark:border-white/[0.08] dark:bg-[radial-gradient(ellipse_at_20%_20%,rgba(67,56,202,0.18),transparent_48%),radial-gradient(ellipse_at_80%_80%,rgba(147,51,234,0.12),transparent_48%),linear-gradient(155deg,#040711_0%,#080D1D_50%,#0C132B_100%)] sm:mx-0 sm:rounded-[32px] sm:border sm:p-8 xl:order-3 xl:col-span-12 xl:p-10"
          >
            {/* 章节带氛围：顶缘微晶星光线 + 轮盘列后方双层液态星云辉光（纯装饰） */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent dark:via-indigo-300/40"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-28 top-1/2 hidden h-[480px] w-[480px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.18)_0%,rgba(147,51,234,0.10)_45%,transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(129,140,248,0.22)_0%,rgba(168,85,247,0.14)_50%,transparent_72%)] xl:block"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -bottom-20 hidden h-[380px] w-[380px] rounded-full bg-indigo-400/10 blur-3xl dark:bg-sky-500/[0.08] xl:block"
            />

            <div className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                你的星盘
              </h3>
              <span className="text-xs text-day-muted dark:text-night-faint">
                点选任一星体，查看它在你生活里的样子
              </span>
            </div>

            <div className="relative mt-6 xl:mt-8 xl:grid xl:grid-cols-2 xl:items-center xl:gap-10">
              {/* 左列：轮盘主角 */}
              <div className="relative mx-auto w-full max-w-[min(100%,420px)] sm:max-w-[520px]">
                <div
                  aria-hidden
                  className="absolute inset-[6%] rounded-full bg-indigo-400/10 blur-2xl dark:bg-indigo-500/15"
                />
                {/* 3D 舞台包在 layoutId 穿入元素之外：不影响仪式→结果的穿入测量；
                    WebGL 场景接管后关闭 DOM 指针视差（场景内有相机视差，避免双重倾斜） */}
                <AstrologyWheel3D className="relative" parallax={wheelSceneOk !== true}>
                  {wheelSlot('relative mx-auto w-full', {
                    selectedBody,
                    onSelectBody: setSelectedBody,
                  })}
                </AstrologyWheel3D>
              </div>

              {/* 右列：等价文本清单与星体深度解构台（桌面端原位切换，彻底消除底部撑开与页面跳动） */}
              <div className="mt-6 min-w-0 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_16px_44px_-24px_rgba(30,41,82,0.25)] backdrop-blur-sm backdrop-saturate-150 dark:border-white/[0.12] dark:bg-[#0C1124]/[0.90] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.85)] sm:p-5 xl:mt-0 xl:flex xl:min-h-[500px] xl:flex-col">
                <AnimatePresence mode="wait" initial={false}>
                  {selectedPlacement?.sign && selectedBody ? (
                    <motion.div
                      key={selectedBody}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: 'easeOut' }}
                      className="flex-1"
                    >
                      <PlanetFactCard
                        body={selectedBody}
                        placement={
                          selectedPlacement as NonNullable<typeof selectedPlacement> & {
                            sign: ZodiacSign;
                          }
                        }
                        reading={selectedReading}
                        aspects={selectedAspects}
                        relatedModuleIds={relatedModuleIds}
                        modules={modules}
                        allPlanets={textListItems}
                        onSelectBody={(b) => setSelectedBody(b)}
                        onLocateModule={handleLocateModule}
                        onClose={() => setSelectedBody(null)}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="list-view"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: 'easeOut' }}
                      className="flex-1"
                    >
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        看不懂星盘？每一颗星的白话位置都在这里
                      </p>
                      <p className="mt-0.5 text-[11px] text-day-muted dark:text-night-faint">
                        点选星体可在右侧直接查看深度解读与相位
                      </p>
                      <ul className="mt-3 space-y-1">
                        {(showAllPlanets ? textListItems : textListItems.slice(0, 4)).map(
                          (item) => {
                            const Glyph = PLANET_GLYPH[item.body];
                            const active = selectedBody === item.body;
                            return (
                              <li key={item.body}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedBody(active ? null : item.body)}
                                  aria-pressed={active}
                                  className={cn(
                                    'flex min-h-11 w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40',
                                    active
                                      ? 'bg-indigo-50 dark:bg-indigo-400/10'
                                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                                  )}
                                >
                                  <Glyph
                                    width={15}
                                    height={15}
                                    className={cn(
                                      'mt-1 shrink-0',
                                      active
                                        ? 'stroke-indigo-500 dark:stroke-indigo-300'
                                        : 'stroke-slate-400 dark:stroke-slate-500'
                                    )}
                                  />
                                  <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">
                                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                                      {PLANET_CN[item.body]}在{ZODIAC_CN[item.sign]}
                                      {item.degree !== null &&
                                        ` ${formatDegreeMinute(item.degree)}`}
                                      {item.house !== null && ` · 第 ${item.house} 宫`}
                                      {item.retrograde === true && ' · 逆行中'}
                                    </span>
                                    <br />
                                    {item.plain}
                                  </span>
                                </button>
                              </li>
                            );
                          }
                        )}
                      </ul>
                      {/* 月亮缺席注明：无宫位档月亮跨座被整颗隐藏，白话说明为什么名单里没有它 */}
                      {moonHiddenNote && (
                        <p className="mt-2 text-[11px] leading-relaxed text-day-muted dark:text-night-faint">
                          {moonHiddenNote}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {/* 清单折叠：默认只露前 4 颗，展开看全部行星 */}
                        {textListItems.length > 4 && (
                          <button
                            type="button"
                            onClick={() => setShowAllPlanets((v) => !v)}
                            aria-expanded={showAllPlanets}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-indigo-300 dark:hover:bg-white/5 sm:min-h-0 sm:py-1.5"
                          >
                            {showAllPlanets
                              ? '收起清单'
                              : `展开其余 ${textListItems.length - 4} 颗星`}
                            <ChevronDown
                              className={cn(
                                'h-3.5 w-3.5 transition-transform duration-200',
                                showAllPlanets && 'rotate-180'
                              )}
                              strokeWidth={2.2}
                            />
                          </button>
                        )}
                        {/* 术语层折叠：容许度/强度等完整数据 */}
                        <button
                          type="button"
                          onClick={() => setShowAllTerms((v) => !v)}
                          aria-expanded={showAllTerms}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-indigo-300 dark:hover:bg-white/5 sm:min-h-0 sm:py-1.5"
                        >
                          {showAllTerms ? '收起术语数据' : '查看全部术语数据'}
                          <ChevronDown
                            className={cn(
                              'h-3.5 w-3.5 transition-transform duration-200',
                              showAllTerms && 'rotate-180'
                            )}
                            strokeWidth={2.2}
                          />
                        </button>
                      </div>
                      <AnimatePresence initial={false}>
                        {showAllTerms && (
                          <motion.div
                            initial={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: 'easeOut' }}
                            className="overflow-hidden"
                          >
                            <ul className="mt-2 space-y-1.5 rounded-xl bg-slate-50/90 p-3.5 text-[11px] leading-relaxed text-slate-500 dark:bg-[#0B1020] dark:text-night-muted">
                              {chartFacts.aspects
                                .filter((a) => a.stability === 'stable')
                                .map((a) => (
                                  <li key={`${a.source}-${a.target}-${a.type}`}>
                                    {PLANET_CN[a.source]} {ASPECT_CN[a.type]} {PLANET_CN[a.target]}
                                    {a.orb !== null && ` · 偏差 ${a.orb.toFixed(1)}°`}
                                    {a.strength !== null &&
                                      ` · 强度 ${Math.round(a.strength * 100)}%`}
                                    ——{ASPECT_PLAIN[a.type]}
                                  </li>
                                ))}
                              <li className="border-t border-slate-200/70 pt-2 dark:border-white/[0.08]">
                                回归黄道 · {withHouses ? houseSystemLabel(chartFacts) : '无宫位'} ·
                                容许度表 {chartFacts.orbTableVersion}
                              </li>
                            </ul>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 移动端专属浮动抽屉（<xl）：悬浮于视口底部，绝不撑大或推挤 DOM 文档流，彻底杜绝跳动 */}
            <AnimatePresence>
              {selectedPlacement?.sign && selectedBody && (
                <div className="xl:hidden">
                  {/* 背景微晶暗色遮罩 */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setSelectedBody(null)}
                    className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs"
                    aria-hidden
                  />
                  {/* 底部抽屉主体 */}
                  <motion.div
                    key={`mobile-fact-${selectedBody}`}
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: '100%' }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: [0.32, 0.72, 0, 1] }}
                    className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 max-h-[82vh] overflow-y-auto custom-scrollbar rounded-[24px] border border-white/40 bg-white/95 p-5 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.45)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#0E1430]/95"
                    role="dialog"
                    aria-label={`${PLANET_CN[selectedBody]}事实卡`}
                  >
                    {/* 顶部手柄条 */}
                    <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-slate-300/80 dark:bg-slate-600/80" />
                    <PlanetFactCard
                      body={selectedBody}
                      placement={
                        selectedPlacement as NonNullable<typeof selectedPlacement> & {
                          sign: ZodiacSign;
                        }
                      }
                      reading={selectedReading}
                      aspects={selectedAspects}
                      relatedModuleIds={relatedModuleIds}
                      modules={modules}
                      allPlanets={textListItems}
                      onSelectBody={(b) => setSelectedBody(b)}
                      onLocateModule={(id) => {
                        setSelectedBody(null);
                        handleLocateModule(id);
                      }}
                      onClose={() => setSelectedBody(null)}
                      isDrawer
                    />
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </section>

          {/* ── 5. 五大生活模块与本周行动三角（07；全宽两列卡片栅格；事实片点击定位回轮；手风琴状态托管）
                  模块分区未到：同构骨架占位（章节标题先立）；分区到达即由真实卡替换；解读降级：整段不渲染 ── */}
          <div className="order-3 min-w-0 xl:order-4 xl:col-span-12">
            {interpretationUnavailable ? null : !modulesArrived ? (
              <LifeModulesSkeleton />
            ) : (
              <AstrologyLifeModules
                facts={chartFacts}
                modules={modules}
                openId={openModuleId}
                onOpenChange={setOpenModuleId}
                onLocateBody={handleLocateBody}
              />
            )}
          </div>

          {/* ═══ 右侧 4 栏洞察轨（桌面与首屏区同行 8+4，内容即首屏仪表盘；移动端单列排在模块后、深读前。
                  移动端三卡默认收为一行摘要（<sm），桌面端保持现状展开——首屏密度只压移动端） ═══ */}
          {/* 桌面端洞察轨为纵向伸缩容器：星语问答卡展开后可撑满本行剩余高度，
              底部与左栏要素卡底部齐平（整轨高度即首屏行高，由左栏内容决定） */}
          <aside
            className="order-4 min-w-0 space-y-4 xl:order-2 xl:col-span-4 xl:flex xl:flex-col"
            aria-label="洞察轨"
          >
            {/* 1. 星盘档案校准状态（合并原盘面范围与重新测算，消除重复卡片与双重紫色按钮） */}
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#0D1226] dark:shadow-[inset_0_1px_0_rgba(196,181,253,0.10)]">
              {/* 控制台顶缘星光（深色模式的一线辉光） */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 hidden h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent dark:block"
              />
              {/* 移动端折叠摘要行（标题 + 盘面档位 + chevron，热区 44px）；sm 起隐藏，标题回到卡内标题行 */}
              <button
                type="button"
                onClick={() => setStatusOpen((v) => !v)}
                aria-expanded={statusOpen}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 sm:hidden"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Orbit
                    className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300"
                    strokeWidth={1.9}
                  />
                  <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    星盘校准状态
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] font-medium text-day-muted dark:text-night-faint">
                    {withHouses ? '完整十二宫' : '稳定行星盘'}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-day-muted transition-transform duration-200 dark:text-night-faint',
                      statusOpen && 'rotate-180'
                    )}
                    strokeWidth={2.2}
                  />
                </span>
              </button>
              {/* 卡体：桌面端常显；移动端随摘要行展开（同一份内容，不做两套排版） */}
              <div className={cn('px-5 pb-5 sm:block sm:pt-5', !statusOpen && 'hidden')}>
                <div className="hidden items-center justify-between sm:flex">
                  <div className="flex items-center gap-2">
                    <Orbit
                      className="h-4 w-4 text-indigo-500 dark:text-indigo-300 dark:drop-shadow-[0_0_6px_rgba(165,180,252,0.55)]"
                      strokeWidth={1.9}
                    />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      星盘校准状态
                    </h3>
                  </div>
                  <span className="text-[11px] font-medium text-day-muted dark:text-night-faint">
                    {withHouses ? '完整十二宫' : '稳定行星盘'}
                  </span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-night-muted">
                  {withHouses
                    ? '当前为含宫位完整盘：行星、十二宫、轴线与主要相位已全部精确校准。'
                    : degradeReason === 'unstable-in-range'
                      ? '约时已降级为无宫位行星盘：上升、天顶与宫位在所选时段内不稳定，仅呈现高稳定事实。'
                      : '当前为无宫位行星盘：呈现整日内稳定的行星星座与主要相位。补充出生时间可解锁上升与十二宫。'}
                </p>
                <div className="mt-3.5 border-t border-slate-100 pt-3 dark:border-white/[0.08]">
                  <button
                    type="button"
                    onClick={recalculate}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/70 text-xs font-semibold text-slate-700 transition-all duration-150 hover:border-indigo-300/70 hover:bg-slate-100/90 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-indigo-400/30 dark:hover:bg-white/[0.08] dark:hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                    {withHouses ? '修改资料重新演算' : '补充资料或重校'}
                  </button>
                </div>
              </div>
            </section>

            {/* 2. 分享星语海报（脱敏海报卡预览弹层；主轴缺失时入口与折叠壳一并隐藏。
                   主轴分区未到：同档卡片骨架占位，避免洞察轨在解读到达时整体下移；解读降级：整卡隐藏
                   ——分享卡的主语是主轴金句，没有解读就没有可分享的一句话，不做空入口） */}
            {interpretationUnavailable ? null : headlineReading === null ? (
              <RailCardSkeleton />
            ) : (
              <MobileCollapse
                title="分享星语海报"
                hint="脱敏海报"
                icon={Share2}
                hidden={!shareAvailable}
              >
                <AstrologyShareEntry
                  facts={chartFacts}
                  headline={fullHeadline}
                  name={formData.name}
                />
              </MobileCollapse>
            )}

            {/* 3. 星语问答（真功能：桌面内联面板 / 移动端底部抽屉，引用可定位）
                摘要文案不计数：剩余次数由面板内徽章呈现（按账号可用额度折算，不设每报告上限），
                静态文案不会与状态失配。
                桌面端展开问答舱后撑满本轨剩余高度：面板底部与左栏要素卡底部齐平（收拢态不撑高，
                卡片保持内容高度）。折叠壳的两层都要参与伸缩，内容卡才能以 flex-1 吃到剩余高度。
                模块分区未到：问答只引用已确认的模块事实，先占位骨架（不出「无模块可引用」的假答案）；
                解读降级：整卡隐藏（模块事实不在，问答无可引用真值） */}
            {interpretationUnavailable ? null : !modulesArrived ? (
              <RailCardSkeleton />
            ) : (
              <MobileCollapse
                title="星语问答"
                hint="AI 解读问答"
                icon={MessageCircleQuestion}
                className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"
                bodyClassName="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"
              >
                <AstrologyQaEntry
                  facts={chartFacts}
                  modules={modules}
                  onLocateBody={handleLocateBody}
                  onLocateModule={handleLocateModule}
                />
              </MobileCollapse>
            )}
          </aside>
        </div>

        {/* ═══ 6. P0 深度区（08：全宽，星盘轮完整清单 / 关键相位两个页内标签） ═══ */}
        <AstrologyDeepDive
          facts={chartFacts}
          keyAspects={keyAspects}
          passport={{
            name,
            sunSign: sunPlacement?.sign ?? null,
            badgeText: badge.text,
            badgeClassName: badge.className,
          }}
          onLocateBody={handleLocateBody}
        />
      </div>
    </>
  );
}
