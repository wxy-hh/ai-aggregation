'use client';

/**
 * astrology-cta-button.tsx —— 星座寰宇 · 主 CTA 渐变按钮（共享封装）
 *
 * 权威色值：DESIGN.md §2.2「命理主 CTA 渐变 `#4969E9 → #7C5CF6`」；
 * 交互遵循 DESIGN.md §4.3：hover scale 1.02 / active scale 0.98 /
 * focus-visible 2px 环 / disabled opacity-40 无动效。
 *
 * 模块内各页面不要再手写渐变按钮类名；宽度、外边距等布局类一律通过
 * className 透传。非按钮场景（选中态胶囊、标签滑块等装饰渐变）复用
 * ASTROLOGY_CTA_GRADIENT_CLASS 保持色值同源。
 */

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** 主 CTA 渐变（DESIGN.md §2.2 权威定义：#4969E9 → #7C5CF6） */
export const ASTROLOGY_CTA_GRADIENT_CLASS = 'bg-gradient-to-r from-[#4969E9] to-[#7C5CF6]';

/** 按钮基础类：胶囊 + 渐变 + 品牌蓝发光阴影 + hover/active/focus/disabled 全套状态 */
const CTA_BASE_CLASS = cn(
  'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full',
  ASTROLOGY_CTA_GRADIENT_CLASS,
  'font-bold text-white shadow-[0_12px_32px_-8px_rgba(73,105,233,0.55)]',
  'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4969E9]/45',
  'disabled:pointer-events-none disabled:opacity-40'
);

/** 尺寸档位：md 标准按钮 / lg 仪式主按钮 / icon 圆形图标按钮 */
const CTA_SIZE_CLASS = {
  md: 'min-h-11 px-6 text-sm',
  lg: 'h-12 px-8 text-base',
  icon: 'h-10 w-10',
} as const;

interface AstrologyCtaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 尺寸档位，默认 md */
  size?: keyof typeof CTA_SIZE_CLASS;
}

export function AstrologyCtaButton({
  size = 'md',
  type = 'button',
  className,
  ...rest
}: AstrologyCtaButtonProps) {
  return (
    <button type={type} className={cn(CTA_BASE_CLASS, CTA_SIZE_CLASS[size], className)} {...rest} />
  );
}
