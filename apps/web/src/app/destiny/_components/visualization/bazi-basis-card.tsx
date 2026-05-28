'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';

export function BaziBasisCard({
  baziBasis,
  className,
}: {
  baziBasis: NonNullable<PartialDestinyReport['baziBasis']>;
  className?: string;
}) {
  const [basisOpen, setBasisOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // 提取位置（去掉坐标）
  const locationClean = baziBasis.profile.locationText.replace(/\(.*?\)/g, '').trim();
  const summaryText = `✅ 排盘依据：已根据${locationClean}校正真太阳时，采用传统子平术算法`;

  return (
    <GlassCard className={cn('shrink-0 overflow-hidden p-4 sm:p-6', className)}>
      <div className="font-heading text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
        排盘依据
      </div>
      <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
        真太阳时校正与传统子平术算法说明
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {/* 折叠摘要 */}
        <button
          type="button"
          onClick={() => setBasisOpen((v) => !v)}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-2xl p-3 text-left transition',
            'hover:bg-white/50 dark:hover:bg-slate-800/60',
            basisOpen ? '' : 'bg-white/40 dark:bg-slate-800/40'
          )}
        >
          <div className="min-w-0 text-sm font-medium text-slate-600 leading-relaxed">
            {summaryText}
          </div>
          {basisOpen ? (
            <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
          )}
        </button>

        {basisOpen && (
          <>
            {/* 基本信息 */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <BasisSummaryCard
                label="农历录入"
                value={baziBasis.profile.birthText}
                detail={baziBasis.profile.lunarText}
              />
              <BasisSummaryCard
                label="真太阳时校正"
                value={baziBasis.solarTime.corrected.text}
                detail={baziBasis.correction.summary}
              />
              <BasisSummaryCard
                label="日主与起运"
                value={`${baziBasis.dayMaster.stem}${elementLabel(baziBasis.dayMaster.element)}（${baziBasis.dayMaster.yinYang === 'yin' ? '阴' : '阳'}）日主`}
                detail={`${baziBasis.childLimit.forward ? '顺排' : '逆排'}，${baziBasis.childLimit.startAge} 岁起运`}
              />
            </div>

            {/* 节气上下文（去掉时分秒） */}
            <div className="rounded-2xl border border-white/50 dark:border-white/5 bg-white/55 dark:bg-slate-800/40 px-3 sm:px-4 py-3 shadow-sm">
              <div className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                节气上下文
              </div>
              <div className="mt-2 flex flex-col sm:flex-row flex-wrap gap-x-6 gap-y-1 text-xs sm:text-sm text-slate-600">
                <span>
                  上一节气：{baziBasis.solarTerms.previous.name}
                  {' · '}
                  {stripTimeFromSolar(baziBasis.solarTerms.previous.solarTime.text)}
                </span>
                <span>
                  当前节气：{baziBasis.solarTerms.active.name}
                  {' · '}
                  {stripTimeFromSolar(baziBasis.solarTerms.active.solarTime.text)}
                </span>
                <span>
                  下一节气：{baziBasis.solarTerms.next.name}
                  {' · '}
                  {stripTimeFromSolar(baziBasis.solarTerms.next.solarTime.text)}
                </span>
              </div>
            </div>

            {/* 高级信息展开按钮 */}
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className={cn(
                'inline-flex w-fit items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition-colors min-h-[40px]',
                'border-white/60 dark:border-white/5 bg-white/60 dark:bg-slate-800/60 text-slate-500 dark:text-slate-300 hover:bg-white/75 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-100'
              )}
            >
              <span>{advancedOpen ? '收起高级排盘数据' : '展开高级排盘数据'}</span>
              {advancedOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {advancedOpen && (
              <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  {/* 四柱与藏干 */}
                  <div>
                    <div className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      四柱与藏干
                    </div>
                    <div className="mt-3 grid gap-2 sm:gap-3 grid-cols-2 xl:grid-cols-4">
                      {baziBasis.pillars.map((pillar) => (
                        <div
                          key={pillar.label}
                          className="rounded-[20px] sm:rounded-[24px] border border-white/50 dark:border-white/5 bg-white/55 dark:bg-slate-800/40 px-3 sm:px-4 py-3 sm:py-4 shadow-sm"
                        >
                          <div className="text-[11px] sm:text-xs font-bold text-slate-400">
                            {pillar.label}
                          </div>
                          <div className="mt-1.5 sm:mt-2 text-base sm:text-lg font-black text-slate-900">
                            {pillar.name}
                          </div>
                          <div className="mt-1 text-[10px] sm:text-xs font-semibold text-slate-500">
                            纳音 {pillar.sound}
                          </div>
                          <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                            {pillar.hiddenStems.map((item) => (
                              <span
                                key={`${pillar.label}-${item.stem}-${item.type}`}
                                className="rounded-full border border-white/60 dark:border-white/5 bg-white/80 dark:bg-slate-700/60 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                              >
                                {item.stem}
                                {item.tenGod}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <BasisMetaCard
                    title="起运信息"
                    rows={[
                      `${baziBasis.childLimit.forward ? '顺排大运' : '逆排大运'}，${baziBasis.childLimit.startAge} 岁起运（${baziBasis.childLimit.endTime.text.slice(0, 10)} 起算）`,
                    ]}
                  />
                  <BasisMetaCard
                    title="未来三年岁运"
                    rows={baziBasis.annualCycles.map(
                      (item) =>
                        `${item.year} · ${item.yearCycle} · ${item.decadeFortune}大运 · 流年 ${item.annualFortune}`
                    )}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </GlassCard>
  );
}

function elementLabel(k: string) {
  switch (k) {
    case 'metal':
      return '金';
    case 'wood':
      return '木';
    case 'water':
      return '水';
    case 'fire':
      return '火';
    case 'earth':
      return '土';
    default:
      return '';
  }
}

/** 从节气时间中只保留日期部分，去掉时分秒 */
function stripTimeFromSolar(text: string): string {
  // 格式类似于 "2026-04-05 15:02:21" → "2026-04-05"
  return text.replace(/\s+\d{2}:\d{2}(:\d{2})?$/, '');
}

function BasisSummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/50 dark:border-white/5 bg-white/55 dark:bg-slate-800/40 px-4 py-4 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">{value}</div>
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{detail}</div>
    </div>
  );
}

function BasisDistributionCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; label: string; value: number; detail: string }>;
}) {
  return (
    <div className="rounded-[24px] border border-white/50 dark:border-white/5 bg-white/55 dark:bg-slate-800/40 px-4 py-4 shadow-sm">
      <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{title}</div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.key}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{item.label}</span>
              <span className="font-black text-slate-900 dark:text-slate-100">{item.value}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-[#5D7CFA] dark:bg-[#6D8CFF]"
                style={{ width: `${Math.min(100, Math.max(0, item.value))}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BasisMetaCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-[24px] border border-white/50 dark:border-white/5 bg-white/55 dark:bg-slate-800/40 px-4 py-4 shadow-sm">
      <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{title}</div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row} className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}
