'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

/**
 * AI 抽屉触发按钮组件属性
 */
interface AIDrawerTriggerProps {
  /** 点击回调 */
  onClick: () => void;
  /** 是否显示徽章（有新建议） */
  showBadge?: boolean;
}

/**
 * AI 抽屉触发按钮组件
 *
 * 功能:
 * - 浮动在页面右下角
 * - 仅在 1024-1439px 视口下显示
 * - 点击打开 AI 助手抽屉
 * - 可选显示徽章提示
 *
 * 对应需求: 9.2
 */
export function AIDrawerTrigger({ onClick, showBadge = false }: AIDrawerTriggerProps) {
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="
        fixed bottom-6 right-6 z-30
        lg:block xl:hidden
        p-4 rounded-full
        bg-[#2F6BFF] hover:bg-[#2557D6]
        shadow-[0_8px_32px_rgba(47,107,255,0.3)]
        hover:shadow-[0_12px_40px_rgba(47,107,255,0.4)]
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
        group
      "
      aria-label="打开 AI 助手"
    >
      {/* 图标 */}
      <Sparkles className="w-6 h-6 text-white" />

      {/* 徽章 */}
      {showBadge && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="
            absolute -top-1 -right-1
            w-3 h-3 rounded-full
            bg-red-500
            border-2 border-white dark:border-slate-900
          "
        />
      )}

      {/* 悬停提示 */}
      <div
        className="
          absolute right-full mr-3 top-1/2 -translate-y-1/2
          px-3 py-2 rounded-lg
          bg-slate-900 dark:bg-slate-800
          text-white text-sm font-medium
          whitespace-nowrap
          opacity-0 group-hover:opacity-100
          pointer-events-none
          transition-opacity duration-200
        "
      >
        AI 诊断助手
        <div
          className="
            absolute left-full top-1/2 -translate-y-1/2
            border-4 border-transparent border-l-slate-900 dark:border-l-slate-800
          "
        />
      </div>
    </motion.button>
  );
}
