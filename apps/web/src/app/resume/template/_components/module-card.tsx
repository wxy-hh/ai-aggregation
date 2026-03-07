'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * 模块卡片组件属性
 */
export interface ModuleCardProps {
  /** 图标组件 */
  icon: LucideIcon;
  /** 模块标题 */
  title: string;
  /** 模块描述 */
  description: string;
  /** 是否为激活状态 */
  isActive: boolean;
  /** 点击回调 */
  onClick?: () => void;
  /** 子内容 */
  children?: React.ReactNode;
  /** 是否触发 pulse 动画 */
  shouldPulse?: boolean;
  /** pulse 动画完成回调 */
  onPulseComplete?: () => void;
}

/**
 * 可折叠的内容编辑模块卡片
 *
 * 功能:
 * - 支持折叠/展开动画 (300ms 平滑过渡)
 * - 未选中时透明度降低 30%
 * - 应用玻璃态效果 (backdrop-filter blur(28px))
 * - 激活状态显示科技蓝边框
 * - 点击标题区域触发折叠/展开
 *
 * 对应需求: 1.2, 1.3, 1.4, 8
 */
export function ModuleCard({
  icon: Icon,
  title,
  description,
  isActive,
  onClick,
  children,
  shouldPulse = false,
  onPulseComplete,
}: ModuleCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // 当需要 pulse 时，滚动到视图并触发动画
  useEffect(() => {
    if (shouldPulse && cardRef.current) {
      // 滚动到卡片位置
      cardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [shouldPulse]);

  // 生成唯一的 ID 用于 aria-labelledby
  const titleId = `module-card-title-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: isActive ? 1 : 0.7, // 未激活时透明度降低 30%
        y: 0,
        // Pulse 动画：如果用户偏好减少动画，则禁用 pulse 效果
        scale: shouldPulse && !prefersReducedMotion ? [1, 1.02, 1, 1.02, 1] : 1,
        // Pulse 动画：科技蓝色微弱外发光
        boxShadow:
          shouldPulse && !prefersReducedMotion
            ? [
                '0 8px 32px rgba(0,0,0,0.08)',
                '0 8px 32px rgba(47,107,255,0.3), 0 0 20px rgba(47,107,255,0.2)',
                '0 8px 32px rgba(0,0,0,0.08)',
                '0 8px 32px rgba(47,107,255,0.3), 0 0 20px rgba(47,107,255,0.2)',
                '0 8px 32px rgba(0,0,0,0.08)',
              ]
            : '0 8px 32px rgba(0,0,0,0.08)',
      }}
      transition={{
        layout: { duration: prefersReducedMotion ? 0 : 0.3, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: prefersReducedMotion ? 0 : 0.15 },
        // Pulse 动画持续 1000ms，如果用户偏好减少动画则禁用
        scale:
          shouldPulse && !prefersReducedMotion
            ? { duration: 1, ease: 'easeInOut' }
            : { duration: 0 },
        boxShadow:
          shouldPulse && !prefersReducedMotion
            ? { duration: 1, ease: 'easeInOut' }
            : { duration: 0 },
      }}
      onAnimationComplete={() => {
        if (shouldPulse && onPulseComplete) {
          onPulseComplete();
        }
      }}
      whileHover={prefersReducedMotion ? {} : { scale: 1.01 }}
      role="region"
      aria-labelledby={titleId}
      className={`
        relative rounded-2xl p-6
        backdrop-blur-[28px] border
        transition-all duration-300
        ${
          isActive
            ? 'bg-white/90 dark:bg-slate-800/90 border-[#2F6BFF]/30 dark:border-[#2F6BFF]/50'
            : 'bg-white/60 dark:bg-slate-800/60 border-white/60 dark:border-slate-700/60'
        }
      `}
    >
      {/* 图标和标题 - 可点击区域 */}
      <button
        className="flex items-start gap-4 cursor-pointer w-full text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2 transition-all duration-150"
        onClick={onClick}
        aria-expanded={isActive}
        aria-controls={`${titleId}-content`}
        aria-label={`${isActive ? '折叠' : '展开'}${title}模块`}
      >
        <div
          className={`
            p-3 rounded-xl transition-colors duration-300
            ${
              isActive
                ? 'bg-[#2F6BFF]/10 text-[#2F6BFF]'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
            }
          `}
          aria-hidden="true"
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h3 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{description}</p>
        </div>
      </button>

      {/* 展开内容区域 - 300ms 平滑动画 */}
      <motion.div
        id={`${titleId}-content`}
        initial={false}
        animate={{
          height: isActive && children ? 'auto' : 0,
          opacity: isActive && children ? 1 : 0,
          marginTop: isActive && children ? 16 : 0,
          paddingTop: isActive && children ? 16 : 0,
        }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.3, // 如果用户偏好减少动画，则禁用动画
          ease: [0.4, 0, 0.2, 1], // cubic-bezier 实现流畅的缓动效果
        }}
        className="overflow-hidden border-t border-slate-200 dark:border-slate-700"
        role="region"
        aria-hidden={!isActive}
      >
        {children}
      </motion.div>

      {/* 激活指示器 - 科技蓝边框 */}
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute inset-0 rounded-2xl border-2 border-[#2F6BFF] pointer-events-none"
          transition={
            prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }
          }
        />
      )}
    </motion.div>
  );
}
