'use client';

import React from 'react';
import type { ZiweiChartData } from '@/app/destiny/_components/types';
import { GlossaryTooltip } from './ziwei-glossary';

type Props = {
  chart: ZiweiChartData;
  name: string;
  gender: 'male' | 'female';
};

export function ZiweiChartHeader({ chart, name, gender }: Props) {
  const genderLabel = gender === 'female' ? '女' : '男';

  return (
    <div className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl p-5 sm:p-6 shadow-[0_8px_20px_rgba(76,95,154,0.10)]">
      {/* 第一行：姓名、性别、出生日期 */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-lg font-bold text-slate-900 dark:text-white">
          {name}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {genderLabel} · {chart.zodiac}年
        </span>
        <span className="text-sm text-slate-400 dark:text-slate-500">
          {chart.lunarDate}
        </span>
      </div>

      {/* 第二行：四柱 + 时辰 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
        <GlossaryTooltip term="四柱">
          <span className="font-medium">{chart.chineseDate}</span>
        </GlossaryTooltip>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span>{chart.time}（{chart.timeRange}）</span>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span>{chart.sign}</span>
      </div>

      {/* 第三行：核心命盘参数 */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <InfoBadge
          term="五行局"
          value={chart.fiveElementsClass}
        />
        <InfoBadge
          term="命宫"
          value={chart.soulPalaceBranch}
        />
        <InfoBadge
          term="身宫"
          value={chart.bodyPalaceBranch}
        />
        <InfoBadge
          term="命主"
          value={chart.soul}
        />
        <InfoBadge
          term="身主"
          value={chart.body}
        />
      </div>

      {/* 第四行：生年四化 */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
          <GlossaryTooltip term="生年四化">生年四化</GlossaryTooltip>
        </span>
        <SihuaBadge label="化禄" star={chart.sihua.lu} />
        <SihuaBadge label="化权" star={chart.sihua.quan} />
        <SihuaBadge label="化科" star={chart.sihua.ke} />
        <SihuaBadge label="化忌" star={chart.sihua.ji} />
      </div>

      {/* 真太阳时修正信息 */}
      {chart.solarCorrection && (
        <div className="mt-3 rounded-xl border border-blue-200/60 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800/40 px-3 py-2">
          <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
            {chart.solarCorrection}
          </p>
        </div>
      )}
    </div>
  );
}

function InfoBadge({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#4969E9]/12 bg-[#F5F7FF] dark:bg-[#1A1D2E] px-3 py-2">
      <div className="text-[11px] font-bold text-[#4969E9]/70 dark:text-[#9BADFF]/70">
        <GlossaryTooltip term={term}>{term}</GlossaryTooltip>
      </div>
      <div className="mt-0.5 text-sm font-bold text-slate-800 dark:text-white">
        {value || '—'}
      </div>
    </div>
  );
}

function SihuaBadge({ label, star }: { label: string; star: string }) {
  const colorMap: Record<string, string> = {
    '化禄': 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    '化权': 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
    '化科': 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
    '化忌': 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  };

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${colorMap[label] ?? ''}`}>
      <GlossaryTooltip term={label}>{label}</GlossaryTooltip>
      <span className="opacity-60">{star || '—'}</span>
    </div>
  );
}
