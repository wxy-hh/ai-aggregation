'use client';

import React, { forwardRef } from 'react';
import { Sunrise } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanetBody } from '@/lib/astrology/chart-facts';
import { ZODIAC_ORDER } from '@/lib/astrology/zh-names';
import { PLANET_GLYPH, ZODIAC_GLYPH } from './astrology-chart-wheel';
import type { AstrologyShareCardData } from './astrology-share-card-data';
import { NOISE_TEXTURE_DATA_URI } from '../share/noise-texture';

/**
 * 星座寰宇 · 星语海报分享卡（750×1000 导出，逻辑尺寸 375×500 × 2 倍像素，竖版 3:4）。
 *
 * 设计原则「磨玻璃烘焙」（与八字分享卡同工法）：
 * DOM→PNG 导出时 backdrop-filter / filter:blur 会丢失，深空玻璃感全部用
 * 径向渐变光晕、静态星点、对角高光线与噪点叠出，预览与导出图像素级一致。
 * 卡片永远暗色主题，不随应用明暗模式切换 → 导出结果稳定。
 *
 * 脱敏边界：本组件只接收 AstrologyShareCardData 白名单数据（构建期已剥离
 * 出生日期/精确时间/地点/度数/宫位），缩略轮只画星座分区与行星落点 glyph，
 * 不画度数字标、宫位号、轴线与相位线。
 */

/* ---------- 静态星点：确定性伪随机（行/列种子固定，无 Math.random，导出可复现） ---------- */

interface PosterStar {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

/** 24 颗星点：由索引确定性生成，避免每次渲染/导出闪烁不一致 */
const POSTER_STARS: PosterStar[] = Array.from({ length: 24 }, (_, i) => ({
  x: (i * 157 + 43) % 375,
  y: (i * 211 + 67) % 500,
  r: 0.6 + ((i * 29) % 10) / 14,
  opacity: 0.12 + ((i * 37) % 45) / 100,
}));

/* ---------- 缩略星盘轮（海报装饰轮）：外环刻度 + 星座 glyph + 行星落点 glyph ---------- */

const WHEEL_SIZE = 180;
const WHEEL_C = WHEEL_SIZE / 2;
/** 外环半径 */
const R_OUTER = 80;
/** 星座 glyph 环半径 */
const R_ZODIAC = 70;
/** 行星符号环半径 */
const R_PLANET = 50;

/** 行星符号配色：对齐星盘宝珠「十星十色」光谱系统（海报暗底专用，与结果页暗色口径同源）
 *  太阳鎏金、月亮银青、水星紫罗兰、金星玫瑰粉、火星珊瑚红、木星琥珀金、土星沙金、天王青碧、海王湛蓝、冥王堇紫 */
const POSTER_PLANET_COLOR: Record<PlanetBody, string> = {
  sun: '#F5D491',
  moon: '#C9E4F5',
  mercury: '#C4B5FD',
  venus: '#F6C3D8',
  mars: '#F6A89D',
  jupiter: '#F3D9A8',
  saturn: '#D8CEB0',
  uranus: '#9BD8D3',
  neptune: '#AEC6F6',
  pluto: '#CDB4E8',
};

/** 黄经 → SVG 坐标（0° 白羊起，从正上方顺时针） */
function polarOnWheel(longitude: number, r: number): [number, number] {
  const theta = ((longitude - 90) * Math.PI) / 180;
  return [WHEEL_C + r * Math.cos(theta), WHEEL_C + r * Math.sin(theta)];
}

/**
 * 海报缩略轮：只保留「行星落在哪个星座区域」的极简信息。
 * 刻意不画：度数字标、宫位号、上升/天顶轴线、相位线 —— 既是脱敏要求，也是海报级留白。
 */
function AstrologyPosterWheel({ planets }: { planets: AstrologyShareCardData['wheelPlanets'] }) {
  return (
    <svg
      viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
      width={WHEEL_SIZE}
      height={WHEEL_SIZE}
      aria-hidden="true"
    >
      {/* 外环 */}
      <circle cx={WHEEL_C} cy={WHEEL_C} r={R_OUTER} fill="none" stroke="rgba(255,255,255,0.10)" />
      {/* 内环（极淡，增加纵深） */}
      <circle cx={WHEEL_C} cy={WHEEL_C} r={32} fill="none" stroke="rgba(255,255,255,0.05)" />
      {/* 12 分区刻度（每 30° 一根，从环内向环外） */}
      {ZODIAC_ORDER.map((sign, i) => {
        const [x1, y1] = polarOnWheel(i * 30, R_OUTER - 5);
        const [x2, y2] = polarOnWheel(i * 30, R_OUTER);
        return (
          <line
            key={sign}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        );
      })}
      {/* 十二星座 glyph（每区居中一个） */}
      {ZODIAC_ORDER.map((sign, i) => {
        const Glyph = ZODIAC_GLYPH[sign];
        const [gx, gy] = polarOnWheel(i * 30 + 15, R_ZODIAC);
        return (
          <Glyph
            key={sign}
            x={gx - 6.5}
            y={gy - 6.5}
            width={13}
            height={13}
            style={{ color: 'rgba(255,255,255,0.62)' }}
          />
        );
      })}
      {/* 行星落点：同色光晕圆点打底（烘焙式 glow，不依赖滤镜）+ glyph */}
      {planets.map((p) => {
        const Glyph = PLANET_GLYPH[p.body];
        const color = POSTER_PLANET_COLOR[p.body];
        const [px, py] = polarOnWheel(p.longitude, R_PLANET);
        return (
          <g key={p.body}>
            <circle cx={px} cy={py} r={9} fill={color} opacity={0.16} />
            <circle cx={px} cy={py} r={4.5} fill={color} opacity={0.22} />
            <Glyph x={px - 7} y={py - 7} width={14} height={14} style={{ color }} />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- 海报卡本体 ---------- */

/** 匿名别名：昵称为空或用户选择匿名时展示（与结果页「星盘主人」口径一致） */
const ANONYMOUS_ALIAS = '星盘主人';

/** 要素胶囊 glyph：太阳/月亮用占星符号，上升用日出图标（结果页大三要素同款） */
function ElementGlyph({ elementKey }: { elementKey: 'sun' | 'moon' | 'ascendant' }) {
  if (elementKey === 'ascendant') {
    return <Sunrise width={15} height={15} strokeWidth={1.9} style={{ color: '#A5B4FC' }} />;
  }
  const Glyph = PLANET_GLYPH[elementKey];
  return <Glyph width={15} height={15} style={{ color: POSTER_PLANET_COLOR[elementKey] }} />;
}

export const AstrologyShareCard = forwardRef<
  HTMLDivElement,
  {
    data: AstrologyShareCardData;
    /** 二维码 dataURL；生成失败时为 null（预览照常，仅禁用保存） */
    qrDataUrl: string | null;
    /** 显示昵称 / 匿名 */
    showNickname: boolean;
    /** 显示大三要素 / 仅主轴 */
    showElements: boolean;
  }
>(function AstrologyShareCard({ data, qrDataUrl, showNickname, showElements }, ref) {
  const displayName = (showNickname && data.nickname) || ANONYMOUS_ALIAS;
  const elements = showElements ? data.elements : [];

  return (
    <div
      ref={ref}
      data-testid="astrology-share-card"
      className="relative flex h-[500px] w-[375px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/[0.06]"
      style={{ background: 'linear-gradient(155deg, #0B1024 0%, #0D1226 40%, #121A38 100%)' }}
    >
      {/* ── 背景层：烘焙光晕与星点（渐变自带柔边，无需 blur 滤镜）── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* 右上：靛蓝光晕 */}
        <div
          className="absolute -right-[100px] -top-[100px] h-[340px] w-[340px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(73,105,233,0.14) 0%, rgba(73,105,233,0.05) 45%, transparent 68%)',
          }}
        />
        {/* 左下：紫罗兰光晕 */}
        <div
          className="absolute -bottom-[90px] -left-[110px] h-[320px] w-[320px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(139,92,246,0.10) 0%, rgba(139,92,246,0.04) 45%, transparent 68%)',
          }}
        />
        {/* 中右：一线青光，平衡冷暖 */}
        <div
          className="absolute -right-[70px] top-[220px] h-[240px] w-[240px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 62%)',
          }}
        />
        {/* 对角高光带：玻璃顶光 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.22) 47%, rgba(255,255,255,0.05) 55%, transparent 68%)',
          }}
        />
        {/* 静态星点（确定性种子） */}
        <svg className="absolute inset-0" width={375} height={500}>
          {POSTER_STARS.map((star, i) => (
            <circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#FFFFFF" opacity={star.opacity} />
          ))}
        </svg>
        {/* 纸感噪点 */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: `url("${NOISE_TEXTURE_DATA_URI}")` }}
        />
        {/* 顶部高光线（hairline） */}
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* ── 内容层 ── */}
      <div className="relative z-10 flex h-full flex-col px-6 pb-4 pt-4">
        {/* 品牌行 */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-[0.28em] text-indigo-300/70">
            ✦ 星座寰宇
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-bold tracking-[0.16em] text-indigo-200/80">
            本命星盘
          </span>
        </div>

        {/* 缩略星盘轮（背后垫一层靛黄光晕托底） */}
        <div className="relative mt-2 flex items-center justify-center">
          <div
            aria-hidden
            className="absolute h-[190px] w-[190px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(165,180,252,0.14) 0%, transparent 65%)',
            }}
          />
          <AstrologyPosterWheel planets={data.wheelPlanets} />
        </div>

        {/* 主轴区：在剩余空间内垂直居中，两档选项下都保持稳定重心；装饰点与昵称合并一行省出纵向空间 */}
        <div className="flex flex-1 flex-col items-center justify-center py-1 text-center">
          <p className="text-[10px] font-semibold tracking-[0.32em] text-indigo-300/70">
            <span aria-hidden className="mr-1.5 text-indigo-400">
              ✦
            </span>
            {displayName} 的星语
          </p>
          <h1 className="mt-2 line-clamp-3 font-heading text-[20px] font-bold leading-[1.4] text-white">
            {data.headline}
          </h1>
        </div>

        {/* 核心要素区（仅在有已确定要素且用户选择显示时渲染） */}
        {elements.length > 0 ? (
          <div
            className={cn(
              'mb-3 grid divide-x divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-white/[0.03] py-2.5',
              elements.length === 3 && 'grid-cols-3',
              elements.length === 2 && 'grid-cols-2',
              elements.length === 1 && 'grid-cols-1'
            )}
          >
            {elements.map((element) => (
              <div key={element.key} className="flex flex-col items-center gap-1 px-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <ElementGlyph elementKey={element.key} />
                </span>
                <span className="text-[9px] font-medium tracking-[0.2em] text-indigo-300/70">
                  {element.label}
                </span>
                <span className="-mt-0.5 text-[13px] font-semibold text-white">
                  {element.signName}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* 底栏：生成信息 + 二维码 */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-medium text-white/40">
              {data.generatedDate ? `${data.generatedDate} 生成` : ''}
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-white/30">
              内容用于自我探索与娱乐参考
            </p>
            <p className="mt-1.5 text-[8px] font-semibold tracking-[0.22em] text-white/25">
              星座寰宇 · 本命星语
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <div className="rounded-xl border border-white/10 bg-white p-1">
              {qrDataUrl ? (
                /* 二维码由 qrcode 库预生成为 dataURL，非外部资源，导出安全 */
                <img src={qrDataUrl} alt="扫码绘制你的星盘" className="h-[52px] w-[52px]" />
              ) : (
                <div className="h-[52px] w-[52px] bg-white" />
              )}
            </div>
            <p className="mt-1 text-[8px] tracking-[0.18em] text-white/25">扫码绘制你的星盘</p>
          </div>
        </div>
      </div>
    </div>
  );
});
