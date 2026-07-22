'use client';

import React from 'react';
import { Info } from 'lucide-react';
import type { ZiweiChartData } from '@/app/destiny/_components/types';
import { GlossaryTooltip } from './ziwei-glossary';

// ═══════════════════════════════════════════════════════════════
//  命牒头部 —「夜幕星宫」
//  宋体鎏金名牒 · 五行局朱砂印 · 四化印章(可点击跳转落宫)
//  注:五行局/命宫/身宫/命主/身主参数已由中央星盘仪呈现,此处不再重复
// ═══════════════════════════════════════════════════════════════

const HEADER_SHELL_CLASS = [
  'relative overflow-hidden rounded-[32px] border border-[#E7C873]/15',
  'bg-[#0C1128]/85',
  'shadow-[0_20px_40px_-16px_rgba(3,6,18,0.8),0_0_32px_rgba(139,92,246,0.06)]',
  'p-5 sm:p-6',
].join(' ');

type Props = {
  chart: ZiweiChartData;
  name: string;
  gender: 'male' | 'female';
  /** 点击四化印章跳转落宫(可选) */
  onSelectPalace?: (palaceName: string) => void;
};

export function ZiweiChartHeader({ chart, name, gender, onSelectPalace }: Props) {
  const genderLabel = gender === 'female' ? '女' : '男';

  return (
    <div className={HEADER_SHELL_CLASS}>
      {/* 顶部鎏金切线 */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E7C873]/50 to-transparent"
        aria-hidden
      />
      {/* 右上紫微光晕 */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(139,92,246,0.16) 0%, rgba(99,60,200,0.05) 50%, transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* 第一行:姓名(宋体鎏金)+ 性别生肖 + 农历 */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="bg-gradient-to-r from-[#F3DFA9] via-[#E7C873] to-[#C9A35C] bg-clip-text font-song text-2xl font-bold text-transparent sm:text-[28px]">
              {name}
            </span>
            <span className="text-sm text-[#B9B3CC]">
              {genderLabel} · {chart.zodiac}年
            </span>
            <span className="font-song text-sm text-[#8B87A0]">{chart.lunarDate}</span>
          </div>

          {/* 第二行:四柱(宋体)+ 时辰 + 星座 */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <GlossaryTooltip term="四柱" chartData={chart}>
              <span className="font-song font-medium tracking-wide text-[#E8E4F0]">
                {chart.chineseDate}
              </span>
            </GlossaryTooltip>
            <span className="text-[#4A4763]">|</span>
            <span className="text-[#B9B3CC]">
              {chart.time}({chart.timeRange})
            </span>
            <span className="text-[#4A4763]">|</span>
            <span className="text-[#B9B3CC]">{chart.sign}</span>
          </div>

          {/* 第三行:生年四化(印章徽章,可点击跳转落宫) */}
          <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="font-song text-xs font-bold text-[#8B87A0]">
              <GlossaryTooltip term="生年四化" chartData={chart}>生年四化</GlossaryTooltip>
            </span>
            <SihuaSeal label="化禄" star={chart.sihua.lu} chart={chart} onSelectPalace={onSelectPalace} />
            <SihuaSeal label="化权" star={chart.sihua.quan} chart={chart} onSelectPalace={onSelectPalace} />
            <SihuaSeal label="化科" star={chart.sihua.ke} chart={chart} onSelectPalace={onSelectPalace} />
            <SihuaSeal label="化忌" star={chart.sihua.ji} chart={chart} onSelectPalace={onSelectPalace} />
          </div>

          {/* 真太阳时修正:折叠为信息 chip,避免占用整行 */}
          {chart.solarCorrection && (
            <details className="group mt-3.5 inline-block max-w-full">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#7DD3FC]/20 bg-[#7DD3FC]/[0.06] px-3 py-1 text-[11px] text-[#7DD3FC]/90 transition-colors hover:border-[#7DD3FC]/35 [&::-webkit-details-marker]:hidden">
                <Info className="h-3 w-3" strokeWidth={2} />
                已校正真太阳时
                <span className="text-[#7DD3FC]/50 transition-transform group-open:rotate-90">›</span>
              </summary>
              <p className="mt-2 max-w-xl rounded-xl border border-[#7DD3FC]/15 bg-[#7DD3FC]/[0.04] px-3 py-2 text-xs leading-relaxed text-[#8B87A0]">
                {chart.solarCorrection}
              </p>
            </details>
          )}
        </div>

        {/* 五行局朱砂印(旋转角印章,收束名牒仪式感) */}
        <div
          className="relative hidden h-[68px] w-[68px] shrink-0 rotate-[6deg] select-none items-center justify-center sm:flex"
          aria-label={`五行局:${chart.fiveElementsClass}`}
        >
          <div className="absolute inset-0 rounded-full border-[1.5px] border-[#C04851]/60" />
          <div className="absolute inset-[5px] rounded-full border border-[#C04851]/30" />
          <div className="text-center font-song">
            <div className="text-[9px] tracking-[0.2em] text-[#C04851]/70">五行局</div>
            <div className="mt-0.5 text-[13px] font-bold leading-none text-[#D96666]">
              {chart.fiveElementsClass || '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  子组件:四化印章(点击跳转落宫)
// ═══════════════════════════════════════════════════════════════

function SihuaSeal({
  label,
  star,
  chart,
  onSelectPalace,
}: {
  label: string;
  star: string;
  chart: ZiweiChartData;
  onSelectPalace?: (palaceName: string) => void;
}) {
  const colorMap: Record<string, string> = {
    '化禄': 'border-[#34D399]/35 bg-[#34D399]/[0.08] text-[#6EE7B7] hover:border-[#34D399]/60 hover:bg-[#34D399]/[0.14]',
    '化权': 'border-[#E7C873]/35 bg-[#E7C873]/[0.08] text-[#E7C873] hover:border-[#E7C873]/60 hover:bg-[#E7C873]/[0.14]',
    '化科': 'border-[#38BDF8]/35 bg-[#38BDF8]/[0.08] text-[#7DD3FC] hover:border-[#38BDF8]/60 hover:bg-[#38BDF8]/[0.14]',
    '化忌': 'border-[#FB7185]/35 bg-[#FB7185]/[0.08] text-[#FDA4AF] hover:border-[#FB7185]/60 hover:bg-[#FB7185]/[0.14]',
  };

  // 查找四化星落入的宫位
  const palaceName = findSihuaPalace(star, chart.palaces);
  const clickable = !!palaceName && !!onSelectPalace;

  const inner = (
    <>
      <GlossaryTooltip term={label} chartData={chart}>
        <span className="font-song font-bold">{label}</span>
      </GlossaryTooltip>
      <span className="font-song opacity-80">{star || '—'}</span>
      {palaceName && <span className="text-[10px] opacity-55">({palaceName})</span>}
    </>
  );

  const cls = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all duration-200 ${colorMap[label] ?? ''}`;

  // 可点击时渲染为按钮:点击跳转至四化落宫
  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onSelectPalace(palaceName)}
        className={`${cls} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]/70`}
        title={`查看${palaceName}宫`}
      >
        {inner}
      </button>
    );
  }

  return <span className={cls}>{inner}</span>;
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
