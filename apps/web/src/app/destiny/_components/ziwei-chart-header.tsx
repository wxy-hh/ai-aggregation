'use client';

import React from 'react';
import { Info } from 'lucide-react';
import type { ZiweiChartData } from '@/app/destiny/_components/types';
import { GlossaryTooltip } from './ziwei-glossary';

// ═══════════════════════════════════════════════════════════════
//  命牒头部 —「白昼 × 夜幕」双主题
//  宋体鎏金名牒 · 五行局朱砂印 · 四化印章(可点击跳转落宫)
//  注:五行局/命宫/身宫/命主/身主参数已由中央星盘仪呈现,此处不再重复
//  主题令牌见 styles/ziwei-theme.css(.zw-* 语义类随根作用域自动切换)
// ═══════════════════════════════════════════════════════════════

const HEADER_SHELL_CLASS = 'zw-panel p-5 sm:p-6';

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
      <span className="zw-gold-divider" aria-hidden />
      {/* 右上紫微光晕 */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, var(--zw-violet-deep-a15) 0%, var(--zw-violet-deep-a10) 50%, transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* 第一行:姓名(宋体鎏金)+ 性别生肖 + 农历 */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="zw-gold-heading font-song text-2xl font-bold sm:text-[28px]">
              {name}
            </span>
            <span className="zw-text-2b text-sm">
              {genderLabel} · {chart.zodiac}年
            </span>
            <span className="zw-text-3 font-song text-sm">{chart.lunarDate}</span>
          </div>

          {/* 第二行:四柱(宋体)+ 时辰 + 星座 */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <GlossaryTooltip term="四柱" chartData={chart}>
              <span className="zw-text-1b font-song font-medium tracking-wide">
                {chart.chineseDate}
              </span>
            </GlossaryTooltip>
            <span className="zw-text-5">|</span>
            <span className="zw-text-2b">
              {chart.time}({chart.timeRange})
            </span>
            <span className="zw-text-5">|</span>
            <span className="zw-text-2b">{chart.sign}</span>
          </div>

          {/* 第三行:生年四化(印章徽章,可点击跳转落宫) */}
          <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="zw-text-3 font-song text-xs font-bold">
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
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-[color:var(--zw-info-a20)] bg-[color:var(--zw-info-a06)] px-3 py-1 text-[11px] text-[color:var(--zw-info-dim)] transition-colors hover:border-[color:var(--zw-info-a35)] [&::-webkit-details-marker]:hidden">
                <Info className="h-3 w-3" strokeWidth={2} />
                已校正真太阳时
                <span className="text-[color:var(--zw-info-a60)] transition-transform group-open:rotate-90">›</span>
              </summary>
              <p className="zw-text-3 mt-2 max-w-xl rounded-xl border border-[color:var(--zw-info-a15)] bg-[color:var(--zw-info-a04)] px-3 py-2 text-xs leading-relaxed">
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
          <div className="absolute inset-0 rounded-full border-[1.5px] border-[color:var(--zw-cinnabar-a60)]" />
          <div className="absolute inset-[5px] rounded-full border border-[color:var(--zw-cinnabar-a30)]" />
          <div className="text-center font-song">
            <div className="text-[9px] tracking-[0.2em] text-[color:var(--zw-cinnabar-a70)]">五行局</div>
            <div className="mt-0.5 text-[13px] font-bold leading-none text-[color:var(--zw-cinnabar-text)]">
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
    '化禄': 'zw-seal-lu',
    '化权': 'zw-seal-quan',
    '化科': 'zw-seal-ke',
    '化忌': 'zw-seal-ji',
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
        className={`${cls} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--zw-violet-a70)]`}
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
