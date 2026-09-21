'use client';

/**
 * astrology-planet-fact-card.tsx —— 星座寰宇星体深度解构卡深模块
 *
 * 核心职责：
 * - 桌面端内嵌于右侧事实卡槽位，移动端作为浮动抽屉呈现；
 * - 自洽封装快捷星体 44px 热区点选胶囊、核心身份徽印、白话主句气泡；
 * - 呈现要素扩展建议、关联相位影响以及生活模块反向跳链。
 */

import React from 'react';
import { ChevronLeft, ChevronRight, Compass, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ASPECT_CN,
  PLANET_CN,
  PLANET_GLYPH,
  ZODIAC_CN,
} from './astrology-chart-wheel';
import { formatDegreeMinute } from './astrology-mappers';
import {
  ASPECT_PLAIN,
  PLANET_THEME,
  planetPlainSentence,
  type ElementReading,
  type ModuleId,
  type ModuleReading,
} from '@/lib/astrology/interpretation';
import type {
  AstrologyChartFacts,
  PlanetBody,
  ZodiacSign,
} from '@/lib/astrology/chart-facts';

export type PlanetFactCardProps = {
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
};

/**
 * 星体深度解构卡深组件
 */
export function PlanetFactCard({
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
}: PlanetFactCardProps) {
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
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:text-night-muted dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>全部星体</span>
            </button>
          ) : (
            <span className="text-xs font-semibold text-slate-500 dark:text-night-muted">
              星体深度解构
            </span>
          )}

          {/* 快捷星体点选胶囊：热区 44×44，防误触横排滚动 */}
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
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-day-muted transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:text-night-faint dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
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
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
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
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-indigo-200/80 bg-white px-2.5 text-[11px] font-medium text-indigo-600 shadow-2xs transition-colors hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:border-indigo-300/20 dark:bg-white/[0.04] dark:text-indigo-200 dark:hover:bg-indigo-400/10"
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
