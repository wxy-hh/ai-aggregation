'use client';

/**
 * astrology-wheel-transition.tsx —— 仪式到结果页的星盘共享元素转场外壳
 *
 * 职责：
 * 在仪式揭示相位与结果页 WheelSection 之间，通过共享同一 layoutId="astrology-wheel"
 * 实现同树无缝的平滑缩放与位移转场。
 * 完全适配用户减弱动态偏好（prefers-reduced-motion）：此时关闭布局插值并降级为瞬时切换。
 */

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function AstrologyWheelTransition({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      layoutId={reduceMotion ? undefined : 'astrology-wheel'}
      transition={
        reduceMotion ? { duration: 0.01 } : { duration: 0.5, ease: [0.32, 0.72, 0, 1] }
      }
      className={cn(className, '[transform-style:preserve-3d]')}
    >
      {children}
    </motion.div>
  );
}
