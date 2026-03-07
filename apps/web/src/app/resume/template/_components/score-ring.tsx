'use client';

import { motion, useMotionValue, animate } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * 评分圆环组件属性
 */
export interface ScoreRingProps {
  /** 评分 (0-100) */
  score: number;
  /** 是否显示加载状态 */
  isLoading?: boolean;
  /** 圆环大小 */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 动态评分圆环组件
 *
 * 功能:
 * - 显示 0-100 分的综合评分
 * - 科技蓝色 (#2F6BFF) 顺时针注满动效
 * - 分数变化时产生数字跳动动画 (800ms)
 * - 支持加载状态
 *
 * 对应需求: 6.2, 6.3, 6.4
 */
export function ScoreRing({ score, isLoading = false, size = 'md' }: ScoreRingProps) {
  // 检测用户的动画偏好
  const prefersReducedMotion = useReducedMotion();

  // 圆环尺寸配置
  const sizeConfig = {
    sm: { container: 'w-24 h-24', text: 'text-2xl', radius: 40 },
    md: { container: 'w-32 h-32', text: 'text-4xl', radius: 52 },
    lg: { container: 'w-40 h-40', text: 'text-5xl', radius: 64 },
  };

  const config = sizeConfig[size];
  const radius = config.radius;
  const circumference = 2 * Math.PI * radius;

  // 使用 state 存储当前显示的分数（用于数字跳动动画）
  const [displayScore, setDisplayScore] = useState(0);
  const motionScore = useMotionValue(0);

  // 当分数变化时，触发数字跳动动画
  useEffect(() => {
    if (!isLoading) {
      // 如果用户偏好减少动画，直接设置分数，不使用动画
      if (prefersReducedMotion) {
        setDisplayScore(score);
        return;
      }

      const controls = animate(motionScore, score, {
        duration: 0.8,
        ease: 'easeOut',
        onUpdate: (latest) => {
          setDisplayScore(Math.round(latest));
        },
      });

      return controls.stop;
    }
  }, [score, isLoading, motionScore, prefersReducedMotion]);

  // 计算圆环偏移量
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      {/* 圆环容器 */}
      <div className={`relative ${config.container}`}>
        {/* 背景圆环 */}
        <svg
          className="w-full h-full -rotate-90"
          viewBox={`0 0 ${radius * 2 + 16} ${radius * 2 + 16}`}
        >
          <circle
            cx={radius + 8}
            cy={radius + 8}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-slate-200 dark:text-slate-700"
          />
          {/* 进度圆环 - 科技蓝色顺时针注满动效 */}
          <motion.circle
            cx={radius + 8}
            cy={radius + 8}
            r={radius}
            fill="none"
            stroke="#2F6BFF"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{
              strokeDashoffset: isLoading ? circumference : offset,
            }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.8,
              ease: 'easeOut',
            }}
          />
        </svg>

        {/* 分数显示 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isLoading ? (
            <motion.span
              animate={prefersReducedMotion ? {} : { opacity: [0.5, 1, 0.5] }}
              transition={prefersReducedMotion ? {} : { duration: 1.5, repeat: Infinity }}
              className={`${config.text} font-bold text-slate-400 dark:text-slate-600`}
            >
              --
            </motion.span>
          ) : (
            <motion.span
              className={`${config.text} font-bold text-[#2F6BFF]`}
              animate={
                prefersReducedMotion
                  ? {}
                  : {
                      scale: [1, 1.15, 1],
                    }
              }
              transition={
                prefersReducedMotion
                  ? {}
                  : {
                      duration: 0.8,
                      ease: 'easeOut',
                    }
              }
              key={score}
            >
              {displayScore}
            </motion.span>
          )}
          <span className="text-sm text-slate-600 dark:text-slate-400">综合评分</span>
        </div>
      </div>

      {/* aria-live 区域用于播报评分更新 */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {!isLoading && score > 0 && `简历综合评分已更新为 ${displayScore} 分`}
      </div>
    </div>
  );
}
