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
    <div className="rounded-[32px] border border-[#F1F5F9] dark:border-white/5 bg-white dark:bg-slate-900/70 backdrop-blur-xl p-5 sm:p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
      {/* 第一行：姓名、性别、出生日期 */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-lg font-bold text-[#0F172A] dark:text-white">
          {name}
        </span>
        <span className="text-sm text-[#94A3B8] dark:text-slate-400">
          {genderLabel} · {chart.zodiac}年
        </span>
        <span className="text-sm text-[#94A3B8] dark:text-slate-500">
          {chart.lunarDate}
        </span>
      </div>

      {/* 第二行：四柱 + 时辰 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#64748B] dark:text-slate-300">
        <GlossaryTooltip term="四柱" chartData={chart}>
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
          chart={chart}
        />
        <InfoBadge
          term="命宫"
          value={chart.soulPalaceBranch}
          chart={chart}
        />
        <InfoBadge
          term="身宫"
          value={chart.bodyPalaceBranch}
          chart={chart}
        />
        <InfoBadge
          term="命主"
          value={chart.soul}
          chart={chart}
        />
        <InfoBadge
          term="身主"
          value={chart.body}
          chart={chart}
        />
      </div>

      {/* 第四行：生年四化 */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
          <GlossaryTooltip term="生年四化" chartData={chart}>生年四化</GlossaryTooltip>
        </span>
        <SihuaBadge label="化禄" star={chart.sihua.lu} chart={chart} palaces={chart.palaces} />
        <SihuaBadge label="化权" star={chart.sihua.quan} chart={chart} palaces={chart.palaces} />
        <SihuaBadge label="化科" star={chart.sihua.ke} chart={chart} palaces={chart.palaces} />
        <SihuaBadge label="化忌" star={chart.sihua.ji} chart={chart} palaces={chart.palaces} />
      </div>

      {/* 真太阳时修正信息 */}
      {chart.solarCorrection && (
        <div className="mt-3 rounded-[16px] border border-blue-100 dark:border-blue-800/30 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-2">
          <p className="text-xs text-blue-600/90 dark:text-blue-400 leading-relaxed">
            {chart.solarCorrection}
          </p>
        </div>
      )}
    </div>
  );
}

function InfoBadge({ term, value, chart }: { term: string; value: string; chart: ZiweiChartData }) {
  return (
    <div className="rounded-[16px] border border-[#F1F5F9] dark:border-white/5 bg-[#F8FAFC] dark:bg-[#1A1D2E] px-3 py-2">
      <div className="text-[11px] font-semibold text-[#94A3B8] dark:text-[#9BADFF]/70">
        <GlossaryTooltip term={term} chartData={chart}>{term}</GlossaryTooltip>
      </div>
      <div className="mt-0.5 text-sm font-bold text-[#0F172A] dark:text-white">
        {value || '—'}
      </div>
    </div>
  );
}

function SihuaBadge({
  label,
  star,
  chart,
  palaces,
}: {
  label: string;
  star: string;
  chart: ZiweiChartData;
  palaces: ZiweiChartData['palaces'];
}) {
  const colorMap: Record<string, string> = {
    '化禄': 'border border-emerald-200/60 bg-emerald-50/70 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300',
    '化权': 'border border-amber-200/60 bg-amber-50/70 text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300',
    '化科': 'border border-blue-200/60 bg-blue-50/70 text-blue-700 dark:border-blue-800/40 dark:bg-blue-950/30 dark:text-blue-300',
    '化忌': 'border border-rose-200/60 bg-rose-50/70 text-rose-700 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-300',
  };

  // 查找四化星落入的宫位
  const palaceName = findSihuaPalace(star, palaces);

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${colorMap[label] ?? ''}`}>
      <GlossaryTooltip term={label} chartData={chart}>{label}</GlossaryTooltip>
      <span className="opacity-60">{star || '—'}</span>
      {palaceName && (
        <span className="text-[10px] opacity-50">（{palaceName}）</span>
      )}
    </div>
  );
}

/** 查找四化星所在的宫位名 */
function findSihuaPalace(sihuaStar: string, palaces: ZiweiChartData['palaces']): string | null {
  if (!sihuaStar) return null;
  for (const p of palaces) {
    if (p.majorStars.some((s) => s.name === sihuaStar)) return p.name;
    if (p.minorStars.some((s) => s.name === sihuaStar)) return p.name;
  }
  return null;
}
