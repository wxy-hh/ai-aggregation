'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import type { FiveElementKey } from '../types';
import type { BaziShareCardData } from './share-card-data';
import { NOISE_TEXTURE_DATA_URI } from './noise-texture';

/**
 * 八字分享卡片（750×1334 导出，逻辑尺寸 375×667 × 2 倍像素）。
 *
 * 设计原则「磨玻璃烘焙」：
 * DOM→PNG 导出时 backdrop-filter / filter:blur 会丢失，因此玻璃感全部
 * 用径向渐变光晕、半透明白色面板、顶部高光 hairline 与细腻投影叠出，
 * 预览与导出图像素级一致。卡片始终浅色主题，不受应用暗色模式影响。
 */

/** 五行文字色（浅色卡专用，与结果页色系同源、水行改用蓝以保证五色可辨） */
const ELEMENT_TEXT_CLASS: Record<FiveElementKey, string> = {
  metal: 'text-[#B45309]',
  wood: 'text-[#047857]',
  water: 'text-[#1D4ED8]',
  fire: 'text-[#BE123C]',
  earth: 'text-[#78716C]',
};

/** 五行点缀色（柱底小圆点） */
const ELEMENT_DOT_CLASS: Record<FiveElementKey, string> = {
  metal: 'bg-[#D97706]',
  wood: 'bg-[#10B981]',
  water: 'bg-[#3B82F6]',
  fire: 'bg-[#F43F5E]',
  earth: 'bg-[#A8A29E]',
};

export const BaziShareCard = forwardRef<
  HTMLDivElement,
  { data: BaziShareCardData; qrDataUrl: string }
>(function BaziShareCard({ data, qrDataUrl }, ref) {
  return (
    <div
      ref={ref}
      data-testid="bazi-share-card"
      className="relative flex h-[667px] w-[375px] shrink-0 flex-col overflow-hidden rounded-[28px] bg-[#F3F5FB]"
    >
      {/* ── 背景层：烘焙光晕（渐变自带柔边，无需 blur 滤镜）── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* 右上：品牌蓝光晕 */}
        <div
          className="absolute -right-[90px] -top-[90px] h-[320px] w-[320px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(93,124,250,0.16) 0%, rgba(93,124,250,0.05) 45%, transparent 68%)',
          }}
        />
        {/* 左下：紫光晕 */}
        <div
          className="absolute -bottom-[70px] -left-[100px] h-[300px] w-[300px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(139,92,246,0.11) 0%, rgba(139,92,246,0.04) 45%, transparent 68%)',
          }}
        />
        {/* 中左：一线暖金，平衡冷色 */}
        <div
          className="absolute -left-[60px] top-[270px] h-[220px] w-[220px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 62%)',
          }}
        />
        {/* 对角高光带：玻璃顶光 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(112deg, transparent 32%, rgba(255,255,255,0.42) 47%, rgba(255,255,255,0.12) 54%, transparent 66%)',
          }}
        />
        {/* 纸感噪点 */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: `url("${NOISE_TEXTURE_DATA_URI}")` }}
        />
      </div>

      {/* ── 内容层 ── */}
      <div className="relative z-10 flex h-full flex-col px-6 pb-6 pt-5">
        {/* 品牌行 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#5D7CFA] to-[#4969E9] text-[13px] font-black text-white"
              style={{ boxShadow: '0 4px 10px -3px rgba(73,105,233,0.45)' }}
            >
              命
            </div>
            <span className="text-[11px] font-bold tracking-[0.14em] text-slate-500">
              AI 命理大师
            </span>
          </div>
          <span className="rounded-full border border-white/80 bg-white/50 px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] text-[#4969E9]">
            八字格局精批
          </span>
        </div>

        {/* 标题区 */}
        <div className="mt-5">
          <h1 className="font-heading text-[26px] font-bold leading-tight tracking-tight text-slate-900">
            {data.nickname} 的八字命盘
          </h1>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-slate-400">
            四柱干支 × 五行能量
          </p>
        </div>

        {/* 四柱干支 */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {data.pillars.map((pillar, index) => {
            const isDayMaster = index === 2;
            return (
              <div
                key={pillar.label}
                className={cn(
                  'relative flex flex-col items-center rounded-2xl border px-1 pb-2.5 pt-3',
                  isDayMaster
                    ? 'border-[#5D7CFA]/35 bg-[#5D7CFA]/[0.08]'
                    : 'border-white/70 bg-gradient-to-b from-white/65 to-white/30'
                )}
                style={{
                  boxShadow: isDayMaster
                    ? '0 8px 18px -8px rgba(93,124,250,0.35), inset 0 1px 0 rgba(255,255,255,0.65)'
                    : '0 6px 14px -8px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
                }}
              >
                {isDayMaster ? (
                  <span className="absolute -top-2 rounded-full bg-[#5D7CFA] px-1.5 py-px text-[8px] font-extrabold text-white">
                    日主
                  </span>
                ) : null}
                <span className="text-[9px] font-bold tracking-[0.2em] text-slate-400">
                  {pillar.label}
                </span>
                <span
                  className={cn(
                    'mt-1.5 text-[22px] font-black leading-none',
                    ELEMENT_TEXT_CLASS[pillar.element]
                  )}
                >
                  {pillar.stem}
                </span>
                <span
                  className={cn(
                    'mt-1 text-[22px] font-black leading-none',
                    ELEMENT_TEXT_CLASS[pillar.element]
                  )}
                >
                  {pillar.branch}
                </span>
                <span
                  className={cn('mt-1.5 h-1 w-1 rounded-full', ELEMENT_DOT_CLASS[pillar.element])}
                />
              </div>
            );
          })}
        </div>

        {/* 一句话钩子 */}
        <div
          className="relative mt-4 overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-b from-white/70 to-white/35 px-4 py-3.5"
          style={{
            boxShadow:
              '0 10px 22px -12px rgba(73,105,233,0.22), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
          />
          <p className="text-center text-[16px] font-bold leading-snug text-slate-800">
            <span className="mr-1 font-black text-[#5D7CFA]">「</span>
            {data.headline}
            <span className="ml-1 font-black text-[#5D7CFA]">」</span>
          </p>
        </div>

        {/* 人生五维：在剩余空间内垂直居中，平衡上下留白 */}
        <div className="mt-5 flex flex-1 flex-col justify-center">
          <p className="text-[9px] font-bold tracking-[0.24em] text-slate-400">
            人生五维 · 相对指数
          </p>
          <div className="mt-3 space-y-3.5">
            {data.dimensions.map((dimension) => (
              <div key={dimension.key} className="flex items-center gap-2.5">
                <span className="w-8 shrink-0 whitespace-nowrap text-[11px] font-bold text-slate-500">
                  {dimension.label}
                </span>
                <div className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-slate-900/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#93AAFC] to-[#4969E9]"
                    style={{ width: `${Math.max(4, Math.min(100, dimension.value))}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-[11px] font-extrabold tabular-nums text-[#3C58D8]">
                  {dimension.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 底部：引导文案 + 二维码 */}
        <div className="mt-auto flex items-end justify-between pt-4">
          <div>
            <p className="text-[13px] font-extrabold leading-snug text-slate-700">
              长按识别，测测你的八字
            </p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-400">
              看看你们的五行能量合不合
            </p>
            <p className="mt-2.5 text-[8px] font-semibold tracking-[0.18em] text-slate-300">
              AI DESTINY · 东方易理智能解析
            </p>
          </div>
          <div
            className="shrink-0 rounded-2xl border border-white/80 bg-white p-1.5"
            style={{ boxShadow: '0 8px 18px -8px rgba(15,23,42,0.18)' }}
          >
            {/* 二维码由 qrcode 库预生成为 dataURL */}
            <img src={qrDataUrl} alt="扫码测算八字" className="h-[68px] w-[68px]" />
          </div>
        </div>
      </div>
    </div>
  );
});
