'use client';

/**
 * 星座寰宇 · 交互星盘轮（P0 深度探索）
 *
 * 点选星体/相位，旁侧出现关联事实；提供等价文本清单（键盘可达、清晰读屏名）。
 * P0 支持点选与等价文本列表；完整双向索引与圆盘键盘漫游属 P1。
 */

import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AstrologyChartCanvas } from './astrology-chart-canvas';
import type { ChartFacts } from './astrology-types';

const SIGN_LABEL: Record<string, string> = {
  aries: '白羊座', taurus: '金牛座', gemini: '双子座', cancer: '巨蟹座',
  leo: '狮子座', virgo: '处女座', libra: '天秤座', scorpio: '天蝎座',
  sagittarius: '射手座', capricorn: '摩羯座', aquarius: '水瓶座', pisces: '双鱼座',
};

const ASPECT_LABEL: Record<string, string> = {
  conjunction: '合相', opposition: '对冲', square: '刑相', trine: '拱相', sextile: '六合',
};

type AstrologyChartWheelProps = {
  chartFacts: ChartFacts;
  className?: string;
};

export function AstrologyChartWheel({ chartFacts, className }: AstrologyChartWheelProps) {
  const reduceMotion = useReducedMotion();
  const [selectedBody, setSelectedBody] = useState<string | null>(null);
  const hasHouses = chartFacts.houses.length > 0;

  const selectedPlanet = chartFacts.planets.find((p) => p.body === selectedBody) ?? null;
  const relatedAspects = selectedBody
    ? chartFacts.aspects.filter((a) => a.planetA === selectedBody || a.planetB === selectedBody)
    : [];

  return (
    <div className={cn('grid gap-4 lg:grid-cols-[auto_1fr]', className)}>
      {/* 星盘轮 */}
      <div className="flex justify-center">
        <AstrologyChartCanvas
          chartFacts={chartFacts}
          hasHouses={hasHouses}
          selectedBody={selectedBody}
          onSelectBody={(body) => setSelectedBody((cur) => (cur === body ? null : body))}
          size={300}
        />
      </div>

      {/* 当前选中事实 + 等价文本清单 */}
      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {selectedPlanet ? (
            <motion.div
              key={selectedPlanet.body}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-4 dark:border-indigo-400/25 dark:bg-indigo-500/10"
            >
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {selectedPlanet.label}落{SIGN_LABEL[selectedPlanet.zodiacSign]}
                {selectedPlanet.isRetrograde && <span className="ml-1 text-xs text-slate-400">（逆行）</span>}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                黄经 {selectedPlanet.longitude.toFixed(1)}°
                {selectedPlanet.house > 0 && ` · 第${selectedPlanet.house}宫`}
              </div>
              {relatedAspects.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-indigo-500/15 pt-2">
                  {relatedAspects.map((a, i) => (
                    <div key={i} className="text-[11px] text-slate-500 dark:text-slate-400">
                      与{a.planetA === selectedBody ? a.planetB : a.planetA} {ASPECT_LABEL[a.type]}（orb {a.orb.toFixed(1)}°）
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-400 dark:border-white/10 dark:bg-slate-900/60"
            >
              点击星盘中的星体，查看其落座、度数、宫位与关键相位。
            </motion.p>
          )}
        </AnimatePresence>

        {/* 等价文本清单（键盘可达） */}
        <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 dark:border-white/10 dark:bg-slate-900/92">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">行星落点清单</h4>
          <ul className="space-y-1">
            {chartFacts.planets.map((p) => (
              <li key={p.body}>
                <button
                  type="button"
                  onClick={() => setSelectedBody((cur) => (cur === p.body ? null : p.body))}
                  aria-pressed={selectedBody === p.body}
                  className={cn(
                    'flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-blue-500',
                    selectedBody === p.body
                      ? 'bg-indigo-500/10 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/50'
                  )}
                >
                  <span className="font-medium">
                    {p.label} · {SIGN_LABEL[p.zodiacSign]}
                  </span>
                  <span className="text-xs text-slate-400">
                    {p.isRetrograde && '逆 · '}
                    {p.house > 0 ? `${p.house}宫` : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
