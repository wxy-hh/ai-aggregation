'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { NOISE_TEXTURE_DATA_URI } from '../../share/noise-texture';
import type { RelationType } from '../types';
import type { CompatibilityShareCardData } from './compatibility-share-card-data';

/**
 * 合盘缘分卡（逻辑 375×667，导出 2× → 750×1334）。
 *
 * 设计原则「磨玻璃烘焙」对齐八字分享卡：
 * DOM→PNG 时 backdrop-filter 会丢，玻璃感用径向光晕 + 半透明面板 + hairline 叠出。
 * 卡面固定浅色印刷稿，不跟随 App 暗色；关系类型只换点缀色。
 */

type Theme = {
  /** 主点缀色 */
  accent: string;
  accentSoft: string;
  accentGlow: string;
  gradientFrom: string;
  gradientTo: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  scoreGlow: string;
  orbA: string;
  orbB: string;
};

const THEME: Record<RelationType, Theme> = {
  romance: {
    accent: '#E11D48',
    accentSoft: 'rgba(244,63,94,0.12)',
    accentGlow: 'rgba(244,63,94,0.28)',
    gradientFrom: '#FB7185',
    gradientTo: '#E11D48',
    badgeBg: 'rgba(244,63,94,0.10)',
    badgeText: '#BE123C',
    badgeBorder: 'rgba(251,113,133,0.35)',
    scoreGlow: 'rgba(244,63,94,0.18)',
    orbA: 'rgba(251,113,133,0.20)',
    orbB: 'rgba(253,186,116,0.14)',
  },
  marriage: {
    accent: '#4F46E5',
    accentSoft: 'rgba(99,102,241,0.12)',
    accentGlow: 'rgba(99,102,241,0.28)',
    gradientFrom: '#818CF8',
    gradientTo: '#4F46E5',
    badgeBg: 'rgba(99,102,241,0.10)',
    badgeText: '#4338CA',
    badgeBorder: 'rgba(129,140,248,0.35)',
    scoreGlow: 'rgba(99,102,241,0.18)',
    orbA: 'rgba(129,140,248,0.20)',
    orbB: 'rgba(196,181,253,0.14)',
  },
  friendship: {
    accent: '#059669',
    accentSoft: 'rgba(16,185,129,0.12)',
    accentGlow: 'rgba(16,185,129,0.28)',
    gradientFrom: '#34D399',
    gradientTo: '#059669',
    badgeBg: 'rgba(16,185,129,0.10)',
    badgeText: '#047857',
    badgeBorder: 'rgba(52,211,153,0.35)',
    scoreGlow: 'rgba(16,185,129,0.18)',
    orbA: 'rgba(52,211,153,0.18)',
    orbB: 'rgba(125,211,252,0.12)',
  },
  partnership: {
    accent: '#7C3AED',
    accentSoft: 'rgba(139,92,246,0.12)',
    accentGlow: 'rgba(139,92,246,0.28)',
    gradientFrom: '#A78BFA',
    gradientTo: '#7C3AED',
    badgeBg: 'rgba(139,92,246,0.10)',
    badgeText: '#6D28D9',
    badgeBorder: 'rgba(167,139,250,0.35)',
    scoreGlow: 'rgba(139,92,246,0.18)',
    orbA: 'rgba(167,139,250,0.20)',
    orbB: 'rgba(244,114,182,0.10)',
  },
};

export const CompatibilityShareCard = forwardRef<
  HTMLDivElement,
  { data: CompatibilityShareCardData; qrDataUrl: string }
>(function CompatibilityShareCard({ data, qrDataUrl }, ref) {
  const theme = THEME[data.relationType];
  const partnerInitial = data.partnerLabel.slice(0, 2);

  return (
    <div
      ref={ref}
      data-testid="compatibility-share-card"
      className="relative flex h-[667px] w-[375px] shrink-0 flex-col overflow-hidden rounded-[28px] bg-[#F7F4F0]"
    >
      {/* ── 背景：烘焙光晕 + 纸感 ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -right-[80px] -top-[80px] h-[300px] w-[300px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${theme.orbA} 0%, transparent 68%)`,
          }}
        />
        <div
          className="absolute -bottom-[60px] -left-[90px] h-[280px] w-[280px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${theme.orbB} 0%, transparent 68%)`,
          }}
        />
        {/* 香槟金中轴光 */}
        <div
          className="absolute left-1/2 top-[180px] h-[240px] w-[240px] -translate-x-1/2 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 62%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(112deg, transparent 32%, rgba(255,255,255,0.50) 47%, rgba(255,255,255,0.12) 54%, transparent 66%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: `url("${NOISE_TEXTURE_DATA_URI}")` }}
        />
      </div>

      <div className="relative z-10 flex h-full flex-col px-6 pb-6 pt-5">
        {/* 品牌行 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[12px] font-black text-white"
              style={{
                background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
                boxShadow: `0 4px 10px -3px ${theme.accentGlow}`,
              }}
            >
              缘
            </div>
            <span className="text-[11px] font-bold tracking-[0.14em] text-slate-500">
              八字合盘 · 缘分卡
            </span>
          </div>
          <span
            className="rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.08em]"
            style={{
              background: theme.badgeBg,
              color: theme.badgeText,
              borderColor: theme.badgeBorder,
            }}
          >
            {data.relationLabel}
          </span>
        </div>

        {/* 双人圆标 */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #4F46E5)',
                boxShadow: '0 8px 18px -6px rgba(59,130,246,0.45)',
              }}
            >
              我
            </span>
          </div>
          <div className="relative flex h-8 w-14 items-center justify-center">
            <span
              className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(212,175,55,0.85), transparent)',
              }}
              aria-hidden
            />
            <span
              className="relative z-[1] rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[0.14em] text-[#A16207]"
              style={{
                background: 'rgba(255,255,255,0.75)',
                boxShadow: '0 2px 8px -2px rgba(161,98,7,0.2)',
              }}
            >
              合
            </span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{
                background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
                boxShadow: `0 8px 18px -6px ${theme.accentGlow}`,
              }}
            >
              {partnerInitial}
            </span>
          </div>
        </div>

        <p className="mt-3 text-center text-[15px] font-bold tracking-tight text-slate-800">
          我 × {data.partnerLabel}
        </p>

        {/* 大号分数 */}
        <div
          className="relative mt-5 flex flex-col items-center rounded-[28px] border border-white/80 px-4 py-6"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.42) 100%)',
            boxShadow: `0 16px 32px -18px ${theme.scoreGlow}, inset 0 1px 0 rgba(255,255,255,0.85)`,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
          />
          <span className="text-[10px] font-bold tracking-[0.22em] text-slate-400">
            本视角适配
          </span>
          <span
            className="mt-1 font-heading text-[72px] font-black leading-none tabular-nums tracking-tight"
            style={{ color: theme.accent }}
          >
            {data.score}
          </span>
          <span
            className="mt-2 rounded-full px-3 py-1 text-[12px] font-bold"
            style={{
              background: theme.accentSoft,
              color: theme.badgeText,
            }}
          >
            {data.bandTitle}
          </span>
        </div>

        {/* oneLiner 槽位：最多 2 行 */}
        <div
          className="relative mt-4 overflow-hidden rounded-2xl border border-white/70 px-4 py-3.5"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.38) 100%)',
            boxShadow:
              '0 10px 22px -14px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          <p
            className={cn(
              'text-center text-[15px] font-bold leading-snug text-slate-800',
              'line-clamp-2'
            )}
          >
            <span className="mr-0.5 font-black" style={{ color: theme.accent }}>
              「
            </span>
            {data.oneLiner}
            <span className="ml-0.5 font-black" style={{ color: theme.accent }}>
              」
            </span>
          </p>
        </div>

        {/* 本周可做：有则显示，槽位 2 行 */}
        {data.weeklyAction ? (
          <div className="mt-3 rounded-2xl border border-white/60 bg-white/45 px-4 py-3">
            <p className="text-[9px] font-bold tracking-[0.18em] text-slate-400">
              本周可做
            </p>
            <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-relaxed text-slate-600">
              {data.weeklyAction}
            </p>
          </div>
        ) : (
          <div className="mt-3 flex-1" aria-hidden />
        )}

        {/* 底部：引导 + 二维码 */}
        <div className="mt-auto flex items-end justify-between pt-4">
          <div className="min-w-0 pr-3">
            <p className="text-[13px] font-extrabold leading-snug text-slate-700">
              扫码体验八字合盘
            </p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-400">
              脱敏分享，不含双方出生资料
            </p>
            <p className="mt-2.5 text-[8px] font-semibold tracking-[0.16em] text-slate-300">
              仅供传统文化参考，非专业建议
            </p>
          </div>
          <div
            className="shrink-0 rounded-2xl border border-white/80 bg-white p-1.5"
            style={{ boxShadow: '0 8px 18px -8px rgba(15,23,42,0.18)' }}
          >
            <img
              src={qrDataUrl}
              alt="扫码体验八字合盘"
              className="h-[68px] w-[68px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
