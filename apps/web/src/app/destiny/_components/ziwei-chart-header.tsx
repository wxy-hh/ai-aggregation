'use client';

import React from 'react';
import type { ZiweiChartData } from '@/app/destiny/_components/types';
import { GlossaryTooltip } from './ziwei-glossary';

const HEADER_SHELL_CLASS = [
  'relative overflow-hidden rounded-[32px] border border-white/60',
  'bg-gradient-to-b from-white/60 via-white/25 to-white/10 bg-white/90',
  'shadow-[0_20px_40px_-15px_rgba(59,130,246,0.12),0_8px_20px_-10px_rgba(0,0,0,0.05)]',
  'backdrop-blur-xl lg:backdrop-blur-2xl',
  'p-5 sm:p-6',
  'dark:border-white/10 dark:from-slate-900/60 dark:via-slate-900/30 dark:to-slate-900/10 dark:bg-slate-900/80',
].join(' ');

type Props = {
  chart: ZiweiChartData;
  name: string;
  gender: 'male' | 'female';
};

export function ZiweiChartHeader({ chart, name, gender }: Props) {
  const genderLabel = gender === 'female' ? '女' : '男';

  return (
    <div className={HEADER_SHELL_CLASS}>
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-70 dark:via-white/15"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gradient-to-br from-blue-500/10 to-violet-500/10 blur-3xl opacity-40"
        aria-hidden
      />
      {/* 第一行：姓名、性别、出生日期 */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {name}
        </span>
        <span className="text-sm text-slate-600 dark:text-slate-300">
          {genderLabel} · {chart.zodiac}年
        </span>
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {chart.lunarDate}
        </span>
      </div>

      {/* 第二行：四柱 + 时辰 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
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
  const accent = (() => {
    // 按语义做轻量色彩分配：同材质、不同光色（更“未来高级感”，也更好扫读）
    switch (term) {
      case '五行局':
        return {
          label: 'text-violet-700 dark:text-violet-300',
          ring: 'hover:border-violet-200/70 dark:hover:border-violet-400/20',
          glow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_12px_20px_-8px_rgba(139,92,246,0.18),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
          orb: 'from-violet-500/18 to-blue-500/12',
        };
      case '命宫':
        return {
          label: 'text-blue-700 dark:text-blue-300',
          ring: 'hover:border-blue-200/70 dark:hover:border-blue-400/20',
          glow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_12px_20px_-8px_rgba(59,130,246,0.18),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
          orb: 'from-blue-500/18 to-cyan-500/12',
        };
      case '身宫':
        return {
          label: 'text-emerald-700 dark:text-emerald-300',
          ring: 'hover:border-emerald-200/70 dark:hover:border-emerald-400/20',
          glow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_12px_20px_-8px_rgba(16,185,129,0.18),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
          orb: 'from-emerald-500/18 to-teal-500/12',
        };
      case '命主':
        return {
          label: 'text-amber-700 dark:text-amber-300',
          ring: 'hover:border-amber-200/70 dark:hover:border-amber-400/20',
          glow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_12px_20px_-8px_rgba(245,158,11,0.18),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
          orb: 'from-amber-500/18 to-rose-500/10',
        };
      case '身主':
        return {
          label: 'text-rose-700 dark:text-rose-300',
          ring: 'hover:border-rose-200/70 dark:hover:border-rose-400/20',
          glow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_12px_20px_-8px_rgba(244,63,94,0.16),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
          orb: 'from-rose-500/16 to-violet-500/12',
        };
      default:
        return {
          label: 'text-slate-600 dark:text-slate-300',
          ring: 'hover:border-blue-200/60 dark:hover:border-blue-400/15',
          glow: 'hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_12px_20px_-8px_rgba(59,130,246,0.18),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
          orb: 'from-blue-500/15 to-violet-500/15',
        };
    }
  })();

  return (
    <div
      className={[
        // 小卡片按 DESIGN.md 走“标准玻璃拟态/柔光阴影”质感（不使用 backdrop-blur，避免频繁渲染卡顿）
        'relative group overflow-hidden rounded-2xl border',
        // 基础态就要能看出柔光/磨砂：降低纯白占比，增加蓝紫倾向
        'border-slate-200/60 bg-gradient-to-br from-white/75 via-white/45 to-blue-50/30',
        'px-3 py-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.03)]',
        'transition-all duration-200',
        'hover:-translate-y-0.5',
        accent.ring,
        accent.glow,
        'active:scale-[0.98]',
        'dark:border-white/10 dark:bg-gradient-to-br dark:from-slate-900/80 dark:via-slate-900/55 dark:to-violet-950/20',
      ].join(' ')}
    >
      {/* 顶部 1px 高光切线：增强玻璃边缘层次 */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/85 to-transparent opacity-80 dark:via-white/20"
        aria-hidden
      />

      {/* 右上角柔光背光圈：Hover 时渐隐增强（不影响布局） */}
      <span
        className={[
          'pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br blur-3xl',
          'opacity-25 transition-opacity duration-200 group-hover:opacity-55',
          accent.orb,
        ].join(' ')}
        aria-hidden
      />

      <div className={['relative z-10 text-[11px] font-semibold', accent.label].join(' ')}>
        <GlossaryTooltip term={term} chartData={chart}>{term}</GlossaryTooltip>
      </div>
      <div className="relative z-10 mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
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
